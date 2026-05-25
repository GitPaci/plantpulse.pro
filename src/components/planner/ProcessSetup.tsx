'use client';

// Process Setup modal — configure stage defaults, turnaround activities, shutdowns.
// Follows the same draft-state pattern as EquipmentSetup: all edits are local
// until Save. Reuses pp-modal-* CSS classes.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlantPulseStore, generateId } from '@/lib/store';
import type {
  ProductLine,
  StageDefault,
  TurnaroundActivity,
  TurnaroundPhase,
  ValidityUnit,
  EquipmentGroup,
  ShutdownPeriod,
  StageTypeDefinition,
  BatchNamingConfig,
  BatchNamingRule,
} from '@/lib/types';
import { turnaroundTotalHours, turnaroundValidityHours, normalizeTurnaroundActivity, batchNamePreviewSequence } from '@/lib/types';

// ─── Date helpers ──────────────────────────────────────────────────────

function toDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromDateLocal(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

// ─── Stage type display names ──────────────────────────────────────────

function buildStageTypeLabels(defs: StageTypeDefinition[]): Record<string, string> {
  return Object.fromEntries(defs.map((d) => [d.id, d.name]));
}

/** Format total hours as "Xd HH:MM" for readability */
function formatHoursAsDHM(totalHours: number): string {
  if (!totalHours || totalHours < 0) return '0d 0:00';
  const days = Math.floor(totalHours / 24);
  const remainHours = Math.floor(totalHours % 24);
  const minutes = Math.round((totalHours % 1) * 60);
  return `${days}d ${remainHours}:${String(minutes).padStart(2, '0')}`;
}

// ─── Component ─────────────────────────────────────────────────────────

type Tab = 'stageTypes' | 'stages' | 'turnaround' | 'shutdowns' | 'naming';

const DEFAULT_NAMING_RULE: BatchNamingRule = {
  prefix: '',
  suffix: '',
  startNumber: 1,
  padDigits: 3,
  step: 1,
};

// ─── Reusable stage type table (shared between global and per-product-line modes)

function StageTypeTable({
  items,
  onUpdate,
  onDelete,
  onMove,
}: {
  items: StageTypeDefinition[];
  onUpdate: (id: string, updates: Partial<Omit<StageTypeDefinition, 'id'>>) => void;
  onDelete: (id: string) => void;
  onMove: (idx: number, dir: 'up' | 'down') => void;
}) {
  return (
    <div className="pp-setup-list">
      <div className="pp-setup-list-header">
        <span className="pp-setup-col-order">#</span>
        <span className="pp-setup-col-name">Name</span>
        <span className="pp-process-stage-col-short">Short</span>
        <span className="pp-process-stage-col-count">Count</span>
        <span className="pp-process-stage-col-desc">Description</span>
        <span className="pp-setup-col-actions">Actions</span>
      </div>

      {items.map((st, idx) => (
        <div key={st.id} className="pp-setup-row-wrapper">
          <div className="pp-setup-row">
            <span className="pp-setup-col-order">
              <button
                className="pp-setup-move-btn"
                onClick={() => onMove(idx, 'up')}
                disabled={idx === 0}
                title="Move up"
              >
                &uarr;
              </button>
              <button
                className="pp-setup-move-btn"
                onClick={() => onMove(idx, 'down')}
                disabled={idx === items.length - 1}
                title="Move down"
              >
                &darr;
              </button>
            </span>

            <span className="pp-setup-col-name">
              <input
                type="text"
                value={st.name}
                onChange={(e) => onUpdate(st.id, { name: e.target.value })}
                placeholder="e.g. Seed (n-2)"
                className="pp-setup-input"
                style={{ width: '100%' }}
              />
            </span>

            <span className="pp-process-stage-col-short">
              <input
                type="text"
                value={st.shortName}
                onChange={(e) => onUpdate(st.id, { shortName: e.target.value })}
                placeholder="e.g. n-2"
                className="pp-setup-input"
                style={{ width: '100%' }}
                maxLength={6}
              />
            </span>

            <span className="pp-process-stage-col-count">
              <input
                type="number"
                min={1}
                max={99}
                value={st.count ?? 1}
                onChange={(e) => onUpdate(st.id, { count: Math.max(1, Number(e.target.value) || 1) })}
                className="pp-setup-input"
                style={{ width: '100%' }}
                title="Instances per batch chain"
              />
            </span>

            <span className="pp-process-stage-col-desc">
              <input
                type="text"
                value={st.description || ''}
                onChange={(e) => onUpdate(st.id, { description: e.target.value })}
                placeholder="Optional description"
                className="pp-setup-input"
                style={{ width: '100%' }}
              />
            </span>

            <span className="pp-setup-col-actions" style={{ width: 48 }}>
              <button
                className="pp-setup-action-btn pp-setup-delete-btn"
                onClick={() => onDelete(st.id)}
                title="Delete stage type"
              >
                Del
              </button>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Turnaround Activities sub-components ──────────────────────────────

function activityKind(name: string): 'cip' | 'media' | 'sip' | 'post' | 'other' {
  const n = (name || '').toLowerCase();
  if (n.includes('cip')) return 'cip';
  if (n.includes('media')) return 'media';
  if (n.includes('sip')) return 'sip';
  if (n.includes('transfer') || n.includes('harvest') || n.includes('handoff')) return 'post';
  return 'other';
}

function formatTaShort(t: TurnaroundActivity): string {
  const d = t.durationDays, h = t.durationHours, m = t.durationMinutes;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return parts.join(' ') || '0m';
}

function TurnaroundSummary({ pre, post }: { pre: TurnaroundActivity[]; post: TurnaroundActivity[] }) {
  const BATCH_HOURS = 96;
  const preTotal = pre.reduce((s, a) => s + turnaroundTotalHours(a), 0);
  const postTotal = post.reduce((s, a) => s + turnaroundTotalHours(a), 0);
  const total = preTotal + BATCH_HOURS + postTotal;
  const segs = [
    ...pre.map((a) => ({ name: a.name, h: turnaroundTotalHours(a), kind: activityKind(a.name) })),
    { name: 'Batch', h: BATCH_HOURS, kind: 'batch' as const },
    ...post.map((a) => ({ name: a.name, h: turnaroundTotalHours(a), kind: 'post' as const })),
  ];
  return (
    <div className="pp-ta-summary-wrap">
      <div className="pp-ta-summary-strip" title="Composed cycle preview (96h batch placeholder)">
        {segs.map((s, i) => {
          const w = total > 0 ? (s.h / total) * 100 : 0;
          return (
            <div
              key={i}
              className={`pp-ta-ss-seg pp-ta-ss-${s.kind}`}
              style={{ width: `${w}%` }}
              title={`${s.name} · ${s.h.toFixed(1)}h`}
            >
              {w > 8 ? (s.kind === 'batch' ? 'BATCH' : s.name) : ''}
            </div>
          );
        })}
      </div>
      <div className="pp-ta-summary-caption">
        <span>{preTotal.toFixed(1)}h turnaround → 96h batch{postTotal > 0 && ` → ${postTotal.toFixed(1)}h handoff`}</span>
        <span>cycle {total.toFixed(1)}h</span>
      </div>
    </div>
  );
}

function TurnaroundSection({
  phase,
  title,
  emptyMsg,
  activities,
  allInGroup,
  expandedId,
  onSelect,
  onUpdate,
  onDelete,
  onAdd,
}: {
  phase: TurnaroundPhase;
  title: string;
  emptyMsg: string;
  activities: TurnaroundActivity[];
  allInGroup: TurnaroundActivity[];
  expandedId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Omit<TurnaroundActivity, 'id'>>) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  const total = activities.reduce((s, a) => s + turnaroundTotalHours(a), 0);
  return (
    <div className={`pp-ta-section pp-ta-section--${phase}`}>
      <div className="pp-ta-section-head">
        <div className={`pp-ta-section-title pp-ta-section-title--${phase}`}>
          <span className="pp-ta-phase-dot" />
          {title}
        </div>
        <div className="pp-ta-section-meta">
          {activities.length} {activities.length === 1 ? 'activity' : 'activities'}
          {total > 0 && ` · ${total.toFixed(1)}h total`}
        </div>
      </div>
      <div className="pp-ta-table">
        {activities.length === 0 && (
          <div className="pp-ta-empty">{emptyMsg}</div>
        )}
        {activities.map((a, i) => {
          const noExpiry = !a.validityValue;
          const expanded = a.id === expandedId;
          return (
            <div key={a.id}>
              <div
                className={`pp-ta-row pp-ta-row--${phase}${expanded ? ' pp-ta-row--selected' : ''}`}
                onClick={() => onSelect(a.id)}
              >
                <div className="pp-ta-row-num">{i + 1}</div>
                <div className="pp-ta-row-name">{a.name || '(unnamed)'}</div>
                <div className="pp-ta-row-dur">{formatTaShort(a)}</div>
                <div className={`pp-ta-row-valid${noExpiry ? ' pp-ta-row-valid--none' : ''}`}
                     title={noExpiry ? 'No expiry — always valid' : `Valid ${a.validityValue}${a.validityUnit ?? 'h'} after completion`}>
                  {noExpiry
                    ? <span>—</span>
                    : <>
                        <span>{a.validityValue}{a.validityUnit ?? 'h'}</span>
                        {a.autoRepeat && <span className="pp-ta-row-repeat" title="Auto-repeats if expired">↻</span>}
                        {a.productChangeoverOnly && <span className="pp-ta-row-changeover" title="Product changeover only">⇄</span>}
                      </>
                  }
                </div>
                <div className="pp-ta-row-default" title={a.isDefault ? 'Auto-inserted in new batches' : 'Manual only'}>
                  {a.isDefault ? '✓' : ''}
                </div>
                <div className={`pp-ta-row-chev${expanded ? ' pp-ta-row-chev--open' : ''}`}>›</div>
              </div>
              {expanded && (
                <TurnaroundEditor
                  act={a}
                  siblings={allInGroup.filter((x) => (x.phase ?? 'pre') === (a.phase ?? 'pre'))}
                  onChange={(updates) => onUpdate(a.id, updates)}
                  onDelete={() => onDelete(a.id)}
                />
              )}
            </div>
          );
        })}
        <button type="button" className="pp-ta-add" onClick={onAdd}>
          <span className="pp-ta-add-plus">+</span> Add {phase === 'pre' ? 'pre-batch' : 'post-batch'} activity
        </button>
      </div>
    </div>
  );
}

function TurnaroundEditor({
  act,
  siblings,
  onChange,
  onDelete,
}: {
  act: TurnaroundActivity;
  siblings: TurnaroundActivity[];
  onChange: (updates: Partial<Omit<TurnaroundActivity, 'id'>>) => void;
  onDelete: () => void;
}) {
  const idxInPhase = siblings.findIndex((a) => a.id === act.id);
  const prevAct = idxInPhase > 0 ? siblings[idxInPhase - 1] : null;
  const nextAct = idxInPhase < siblings.length - 1 ? siblings[idxInPhase + 1] : null;
  const phase = act.phase ?? 'pre';
  const validityValue = act.validityValue ?? 0;
  const validityUnit = act.validityUnit ?? 'h';
  const autoRepeat = act.autoRepeat ?? false;

  return (
    <div className={`pp-ta-edit pp-ta-edit--${phase}`}>
      {/* Name */}
      <div className="pp-ta-field pp-ta-col-4">
        <label className="pp-ta-field-label">Name</label>
        <input
          className="pp-ta-input"
          value={act.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      {/* When (phase) */}
      <div className="pp-ta-field pp-ta-col-4">
        <label className="pp-ta-field-label">When</label>
        <div className="pp-ta-seg">
          <button
            type="button"
            className={`${phase === 'pre' ? 'active pre' : ''}`}
            onClick={() => onChange({ phase: 'pre' })}
          >
            <span className="pp-ta-seg-swatch pp-ta-seg-swatch--pre" />Before batch
          </button>
          <button
            type="button"
            className={`${phase === 'post' ? 'active post' : ''}`}
            onClick={() => onChange({ phase: 'post', validityValue: 0, autoRepeat: false })}
          >
            <span className="pp-ta-seg-swatch pp-ta-seg-swatch--post" />After batch
          </button>
        </div>
      </div>

      {/* Duration */}
      <div className="pp-ta-field pp-ta-col-4">
        <label className="pp-ta-field-label">Duration</label>
        <div className="pp-ta-dur-row">
          <input type="number" min={0} className="pp-ta-num" value={act.durationDays}
            onChange={(e) => onChange({ durationDays: Math.max(0, Number(e.target.value) || 0) })} />
          <span className="pp-ta-dur-unit">d</span>
          <input type="number" min={0} max={23} className="pp-ta-num" value={act.durationHours}
            onChange={(e) => onChange({ durationHours: Math.min(23, Math.max(0, Number(e.target.value) || 0)) })} />
          <span className="pp-ta-dur-unit">h</span>
          <input type="number" min={0} max={59} className="pp-ta-num" value={act.durationMinutes}
            onChange={(e) => onChange({ durationMinutes: Math.min(59, Math.max(0, Number(e.target.value) || 0)) })} />
          <span className="pp-ta-dur-unit">m</span>
        </div>
      </div>

      {/* Validity window */}
      <div className="pp-ta-field pp-ta-col-6">
        <label className="pp-ta-field-label">Validity window</label>
        <div className="pp-ta-validity-row">
          <label className="pp-ta-toggle-row">
            <span
              className={`pp-ta-toggle${validityValue > 0 ? ' pp-ta-toggle--on' : ''}`}
              onClick={() => onChange({
                validityValue: validityValue > 0 ? 0 : (phase === 'pre' ? 24 : 0),
                validityUnit: validityUnit || 'h',
              })}
            />
            <span>{validityValue > 0 ? 'Expires' : 'No expiry'}</span>
          </label>
          <div className={`pp-ta-validity-controls${validityValue > 0 ? '' : ' pp-ta-validity-controls--disabled'}`}>
            <input
              type="number"
              min={1}
              value={validityValue || ''}
              onChange={(e) => onChange({ validityValue: Math.max(0, Number(e.target.value) || 0) })}
            />
            <select
              value={validityUnit}
              onChange={(e) => onChange({ validityUnit: e.target.value as ValidityUnit })}
            >
              <option value="h">hours</option>
              <option value="d">days</option>
              <option value="w">weeks</option>
            </select>
          </div>
        </div>
        {validityValue > 0 && (
          <label className="pp-ta-toggle-row" style={{ marginTop: 6 }}>
            <span
              className={`pp-ta-toggle${autoRepeat ? ' pp-ta-toggle--on' : ''}`}
              onClick={() => onChange({ autoRepeat: !autoRepeat })}
            />
            <span>Auto-repeat if expired before next batch</span>
          </label>
        )}
      </div>

      {/* Sequence hint + isDefault toggle */}
      <div className="pp-ta-field pp-ta-col-6">
        <label className="pp-ta-field-label">Sequence</label>
        <div className="pp-ta-hint">
          {prevAct
            ? <>Runs <strong>after {prevAct.name || '(unnamed)'}</strong>.</>
            : <>First {phase === 'pre' ? 'pre-batch' : 'post-batch'} activity.</>}
          {nextAct && <> Must finish before <strong>{nextAct.name || '(unnamed)'}</strong>.</>}
          {!nextAct && phase === 'pre' && <> Must finish before the batch starts.</>}
          {!nextAct && phase === 'post' && <> Must finish before the next batch's turnaround can begin.</>}
        </div>
        <label className="pp-ta-toggle-row" style={{ marginTop: 8 }}>
          <span
            className={`pp-ta-toggle${act.isDefault ? ' pp-ta-toggle--on' : ''}`}
            onClick={() => onChange({ isDefault: !act.isDefault })}
          />
          <span>Auto-insert in new batches</span>
        </label>
        <label className="pp-ta-toggle-row" style={{ marginTop: 6 }}>
          <span
            className={`pp-ta-toggle${(act.productChangeoverOnly ?? false) ? ' pp-ta-toggle--on' : ''}`}
            onClick={() => onChange({ productChangeoverOnly: !(act.productChangeoverOnly ?? false) })}
          />
          <span>Product changeover only</span>
        </label>
      </div>

      {/* Description */}
      <div className="pp-ta-field pp-ta-col-12">
        <label className="pp-ta-field-label">Notes (optional)</label>
        <input
          className="pp-ta-input"
          value={act.description ?? ''}
          placeholder="Short note shown in the planner inspector"
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>

      <div className="pp-ta-edit-foot">
        <button type="button" className="pp-ta-danger-btn" onClick={onDelete}>
          Remove activity
        </button>
      </div>
    </div>
  );
}

export default function ProcessSetup({
  open,
  onClose,
  initialTab,
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: Tab;
}) {
  // Store data
  const storeProductLines = usePlantPulseStore((s) => s.productLines);
  const storeTurnaroundActivities = usePlantPulseStore((s) => s.turnaroundActivities);
  const storeShutdownPeriods = usePlantPulseStore((s) => s.shutdownPeriods);
  const storeEquipmentGroups = usePlantPulseStore((s) => s.equipmentGroups);
  const storeStageTypeDefinitions = usePlantPulseStore((s) => s.stageTypeDefinitions);
  const storeStageTypesMode = usePlantPulseStore((s) => s.stageTypesMode);
  const storeProductLineStageTypes = usePlantPulseStore((s) => s.productLineStageTypes);
  const storeStages = usePlantPulseStore((s) => s.stages);
  const storeBatchChains = usePlantPulseStore((s) => s.batchChains);

  const storeBatchNamingConfig = usePlantPulseStore((s) => s.batchNamingConfig);

  const setProductLines = usePlantPulseStore((s) => s.setProductLines);
  const setTurnaroundActivities = usePlantPulseStore((s) => s.setTurnaroundActivities);
  const setShutdownPeriods = usePlantPulseStore((s) => s.setShutdownPeriods);
  const setStageTypeDefinitions = usePlantPulseStore((s) => s.setStageTypeDefinitions);
  const setStageTypesMode = usePlantPulseStore((s) => s.setStageTypesMode);
  const setProductLineStageTypes = usePlantPulseStore((s) => s.setProductLineStageTypes);
  const setBatchNamingConfig = usePlantPulseStore((s) => s.setBatchNamingConfig);

  // Draft state
  const [tab, setTab] = useState<Tab>('stageTypes');
  const [draftStageTypes, setDraftStageTypes] = useState<StageTypeDefinition[]>([]);
  const [draftStageTypesMode, setDraftStageTypesMode] = useState<'shared' | 'per_product_line'>('shared');
  const [draftPLStageTypes, setDraftPLStageTypes] = useState<Record<string, StageTypeDefinition[]>>({});
  const [draftProductLines, setDraftProductLines] = useState<ProductLine[]>([]);
  const [draftActivities, setDraftActivities] = useState<TurnaroundActivity[]>([]);
  const [draftShutdowns, setDraftShutdowns] = useState<ShutdownPeriod[]>([]);
  const [draftNaming, setDraftNaming] = useState<BatchNamingConfig>(() => ({ ...storeBatchNamingConfig }));
  const [dirty, setDirty] = useState(false);

  // Turnaround activity filter (single equipment group at a time; required selection)
  const [activityGroupFilter, setActivityGroupFilter] = useState<string>('');
  // Currently expanded activity row (inline editor)
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);

  // Shutdown editing
  const [editingShutdownId, setEditingShutdownId] = useState<string | null>(null);

  // Confirmation dialog for stage type deletion
  const [deleteConfirm, setDeleteConfirm] = useState<{
    stageTypeId: string;
    stageTypeName: string;
    productLineId?: string;  // undefined = shared/global
    affectedLines: string[]; // product line names that have matching stage defaults
  } | null>(null);

  // Confirmation dialog for per-PL → shared mode switch
  const [modeSwitchConfirm, setModeSwitchConfirm] = useState<{
    identical: boolean;                    // true if all PLs have same structure
    templatePlId: string;                  // selected (or auto-selected) template PL
    productLines: { id: string; name: string; shortName: string }[];
    lostDefaultsInfo: string[];            // PL names that will lose stage defaults data
  } | null>(null);

  // ── Load draft from store on open ─────────────────────────────────

  useEffect(() => {
    if (open) {
      setDraftStageTypes(storeStageTypeDefinitions.map((d) => ({ ...d })));
      setDraftStageTypesMode(storeStageTypesMode);
      setDraftPLStageTypes(
        Object.fromEntries(
          Object.entries(storeProductLineStageTypes).map(([k, arr]) => [
            k,
            arr.map((d) => ({ ...d })),
          ])
        )
      );
      setDraftProductLines(storeProductLines.map((pl) => ({
        ...pl,
        stageDefaults: pl.stageDefaults.map((sd) => ({ ...sd })),
      })));
      setDraftActivities(storeTurnaroundActivities.map((a) => normalizeTurnaroundActivity({ ...a })));
      setDraftShutdowns(storeShutdownPeriods.map((s) => ({
        ...s,
        startDate: new Date(s.startDate),
        endDate: new Date(s.endDate),
      })));
      setDraftNaming({
        ...storeBatchNamingConfig,
        sharedRule: { ...storeBatchNamingConfig.sharedRule },
        productLineRules: Object.fromEntries(
          Object.entries(storeBatchNamingConfig.productLineRules).map(([k, v]) => [k, { ...v }])
        ),
      });
      setTab(initialTab ?? 'stageTypes');
      setDirty(false);
      setEditingShutdownId(null);
      setDeleteConfirm(null);
      setModeSwitchConfirm(null);
    }
  }, [open, storeStageTypeDefinitions, storeStageTypesMode, storeProductLineStageTypes, storeProductLines, storeTurnaroundActivities, storeShutdownPeriods, storeBatchNamingConfig]);

  // Stage type labels derived from draft (for Stage Defaults dropdown)
  const stageTypeLabels = useMemo(() => buildStageTypeLabels(draftStageTypes), [draftStageTypes]);
  const sortedStageTypes = useMemo(
    () => [...draftStageTypes].sort((a, b) => a.displayOrder - b.displayOrder),
    [draftStageTypes]
  );

  // Per-product-line: sorted stage types keyed by product line ID
  const sortedPLStageTypesMap = useMemo(() => {
    const map: Record<string, StageTypeDefinition[]> = {};
    for (const [plId, arr] of Object.entries(draftPLStageTypes)) {
      map[plId] = [...arr].sort((a, b) => a.displayOrder - b.displayOrder);
    }
    return map;
  }, [draftPLStageTypes]);

  // Resolve which stage types to use for a given product line (mode-aware)
  const stageTypesForPL = useCallback(
    (plId: string): StageTypeDefinition[] => {
      if (draftStageTypesMode === 'per_product_line') {
        return sortedPLStageTypesMap[plId] || [];
      }
      return sortedStageTypes;
    },
    [draftStageTypesMode, sortedPLStageTypesMap, sortedStageTypes]
  );

  // ── Equipment group lookup ─────────────────────────────────────────

  const eqGroupNameById = useMemo(() => {
    const map: Record<string, string> = {};
    storeEquipmentGroups.forEach((eg) => { map[eg.id] = eg.name; });
    return map;
  }, [storeEquipmentGroups]);

  // ── Stage defaults helpers ─────────────────────────────────────────

  const updateStageDefault = useCallback(
    (plId: string, stageIdx: number, field: keyof StageDefault, value: string | number) => {
      setDraftProductLines((prev) =>
        prev.map((pl) => {
          if (pl.id !== plId) return pl;
          const updated = pl.stageDefaults.map((sd, i) => {
            if (i !== stageIdx) return sd;
            if (field === 'defaultDurationHours') {
              const num = Number(value);
              const target = isNaN(num) || num < 0 ? 0 : num;
              // Auto-fill min/max at ±10% when target changes
              return {
                ...sd,
                defaultDurationHours: target,
                minDurationHours: Math.round(target * 0.9),
                maxDurationHours: Math.round(target * 1.1),
              };
            }
            if (field === 'minDurationHours') {
              const num = Number(value);
              return { ...sd, minDurationHours: isNaN(num) || num < 0 ? 0 : num };
            }
            if (field === 'maxDurationHours') {
              const num = Number(value);
              return { ...sd, maxDurationHours: isNaN(num) || num < 0 ? 0 : num };
            }
            if (field === 'machineGroup') {
              return { ...sd, machineGroup: String(value) };
            }
            return sd;
          });
          return { ...pl, stageDefaults: updated };
        })
      );
      setDirty(true);
    },
    []
  );

  const addStageDefault = useCallback((plId: string) => {
    // Pick the first available stage type for this product line (mode-aware)
    const availableTypes = stageTypesForPL(plId);
    const fallbackType = availableTypes[0]?.id || 'production';
    setDraftProductLines((prev) =>
      prev.map((pl) => {
        if (pl.id !== plId) return pl;
        return {
          ...pl,
          stageDefaults: [
            ...pl.stageDefaults,
            { stageType: fallbackType, defaultDurationHours: 48, minDurationHours: 43, maxDurationHours: 53, machineGroup: storeEquipmentGroups[0]?.id || 'fermenter' },
          ],
        };
      })
    );
    setDirty(true);
  }, [stageTypesForPL, storeEquipmentGroups]);

  const removeStageDefault = useCallback((plId: string, idx: number) => {
    setDraftProductLines((prev) =>
      prev.map((pl) => {
        if (pl.id !== plId) return pl;
        return {
          ...pl,
          stageDefaults: pl.stageDefaults.filter((_, i) => i !== idx),
        };
      })
    );
    setDirty(true);
  }, []);

  const moveStageDefault = useCallback((plId: string, idx: number, dir: 'up' | 'down') => {
    setDraftProductLines((prev) =>
      prev.map((pl) => {
        if (pl.id !== plId) return pl;
        const arr = [...pl.stageDefaults];
        const swap = dir === 'up' ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= arr.length) return pl;
        [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
        return { ...pl, stageDefaults: arr };
      })
    );
    setDirty(true);
  }, []);

  // ── Stage type definition helpers ─────────────────────────────────

  // Helper: build a smart-prefilled StageDefault for a newly inserted stage type.
  // Looks at the stage's position (by displayOrder) among existing defaults and
  // copies duration/group from the nearest neighbor.
  const buildPrefillDefault = useCallback(
    (
      newStageId: string,
      newDisplayOrder: number,
      existingDefaults: StageDefault[],
      stageTypesForContext?: StageTypeDefinition[],
    ): StageDefault => {
      const fallback: StageDefault = {
        stageType: newStageId,
        defaultDurationHours: 24,
        minDurationHours: 22,
        maxDurationHours: 26,
        machineGroup: storeEquipmentGroups[0]?.id || 'fermenter',
      };
      if (existingDefaults.length === 0) return fallback;

      // Use provided types or fall back to global draft
      const types = stageTypesForContext || draftStageTypes;
      const sortedTypes = [...types].sort((a, b) => a.displayOrder - b.displayOrder);
      const insertPos = sortedTypes.filter((t) => t.displayOrder < newDisplayOrder).length;

      // Find the default row for the previous stage (if any)
      const prevType = insertPos > 0 ? sortedTypes[insertPos - 1] : null;
      const nextType = insertPos < sortedTypes.length ? sortedTypes[insertPos] : null;

      const prevDefault = prevType
        ? existingDefaults.find((sd) => sd.stageType === prevType.id)
        : null;
      const nextDefault = nextType
        ? existingDefaults.find((sd) => sd.stageType === nextType.id)
        : null;

      const source = prevDefault || nextDefault;
      if (!source) return fallback;

      return {
        stageType: newStageId,
        defaultDurationHours: source.defaultDurationHours,
        minDurationHours: source.minDurationHours,
        maxDurationHours: source.maxDurationHours,
        machineGroup: source.machineGroup,
      };
    },
    [draftStageTypes, storeEquipmentGroups]
  );

  const addStageType = useCallback(() => {
    const maxOrder = draftStageTypes.reduce((mx, d) => Math.max(mx, d.displayOrder), -1);
    const newId = generateId('st-');
    const newDisplayOrder = maxOrder + 1;
    const newDef: StageTypeDefinition = {
      id: newId,
      name: '',
      shortName: '',
      description: '',
      count: 1,
      displayOrder: newDisplayOrder,
    };
    setDraftStageTypes((prev) => [...prev, newDef]);

    // Auto-add a corresponding StageDefault row for each product line
    setDraftProductLines((prev) =>
      prev.map((pl) => {
        const newDefault = buildPrefillDefault(newId, newDisplayOrder, pl.stageDefaults);
        return { ...pl, stageDefaults: [...pl.stageDefaults, newDefault] };
      })
    );

    setDirty(true);
  }, [draftStageTypes, buildPrefillDefault]);

  const updateStageType = useCallback(
    (id: string, updates: Partial<Omit<StageTypeDefinition, 'id'>>) => {
      setDraftStageTypes((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...updates } : d))
      );
      setDirty(true);
    },
    []
  );

  // Stage type deletion — requires confirmation when stage defaults would be lost
  const requestDeleteStageType = useCallback(
    (id: string) => {
      const stType = draftStageTypes.find((d) => d.id === id);
      const affectedLines = draftProductLines
        .filter((pl) => pl.stageDefaults.some((sd) => sd.stageType === id))
        .map((pl) => pl.name);

      if (affectedLines.length === 0) {
        // No stage defaults reference this type — delete immediately
        setDraftStageTypes((prev) => prev.filter((d) => d.id !== id));
        setDirty(true);
        return;
      }

      // Show confirmation dialog
      setDeleteConfirm({
        stageTypeId: id,
        stageTypeName: stType?.name || id,
        affectedLines,
      });
    },
    [draftStageTypes, draftProductLines]
  );

  const confirmDeleteStageType = useCallback(() => {
    if (!deleteConfirm) return;
    const { stageTypeId, productLineId } = deleteConfirm;

    if (productLineId) {
      // Per-product-line mode: delete stage type from that line's list
      setDraftPLStageTypes((prev) => ({
        ...prev,
        [productLineId]: (prev[productLineId] || []).filter((d) => d.id !== stageTypeId),
      }));
      // Remove matching stage default only from that product line
      setDraftProductLines((prev) =>
        prev.map((pl) => {
          if (pl.id !== productLineId) return pl;
          return {
            ...pl,
            stageDefaults: pl.stageDefaults.filter((sd) => sd.stageType !== stageTypeId),
          };
        })
      );
    } else {
      // Shared mode: delete stage type and cascade-remove from ALL product lines
      setDraftStageTypes((prev) => prev.filter((d) => d.id !== stageTypeId));
      setDraftProductLines((prev) =>
        prev.map((pl) => ({
          ...pl,
          stageDefaults: pl.stageDefaults.filter((sd) => sd.stageType !== stageTypeId),
        }))
      );
    }

    setDeleteConfirm(null);
    setDirty(true);
  }, [deleteConfirm]);

  const moveStageType = useCallback((idx: number, dir: 'up' | 'down') => {
    setDraftStageTypes((prev) => {
      const sorted = [...prev].sort((a, b) => a.displayOrder - b.displayOrder);
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= sorted.length) return prev;
      const tempOrder = sorted[idx].displayOrder;
      sorted[idx] = { ...sorted[idx], displayOrder: sorted[swap].displayOrder };
      sorted[swap] = { ...sorted[swap], displayOrder: tempOrder };
      return sorted;
    });
    setDirty(true);
  }, []);

  // ── Stage types mode toggle ──────────────────────────────────────────

  // Compare two PL stage-type lists by structure (order, name, shortName, count)
  const arePLStageTypesIdentical = useCallback(
    (plIds: string[]): boolean => {
      if (plIds.length <= 1) return true;
      const serialize = (types: StageTypeDefinition[]) =>
        [...types]
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((t) => `${t.name}|${t.shortName}|${t.count}`)
          .join(';;');
      const first = serialize(draftPLStageTypes[plIds[0]] || []);
      return plIds.every((id) => serialize(draftPLStageTypes[id] || []) === first);
    },
    [draftPLStageTypes]
  );

  const handleStageTypesModeChange = useCallback(
    (newMode: 'shared' | 'per_product_line') => {
      if (newMode === draftStageTypesMode) return;

      if (newMode === 'per_product_line') {
        // Shared → per-PL: copy global stage types as template for each PL
        const perLine: Record<string, StageTypeDefinition[]> = {};
        const updatedProductLines = [...draftProductLines];
        for (let pi = 0; pi < updatedProductLines.length; pi++) {
          const pl = updatedProductLines[pi];
          if (!draftPLStageTypes[pl.id] || draftPLStageTypes[pl.id].length === 0) {
            const idMap: Record<string, string> = {};
            perLine[pl.id] = draftStageTypes.map((d) => {
              const newId = generateId('st-');
              idMap[d.id] = newId;
              return { ...d, id: newId };
            });
            updatedProductLines[pi] = {
              ...pl,
              stageDefaults: pl.stageDefaults.map((sd) => ({
                ...sd,
                stageType: idMap[sd.stageType] || sd.stageType,
              })),
            };
          } else {
            perLine[pl.id] = draftPLStageTypes[pl.id];
          }
        }
        setDraftPLStageTypes(perLine);
        setDraftProductLines(updatedProductLines);
        setDraftStageTypesMode(newMode);
        setDirty(true);
        return;
      }

      // Per-PL → shared: need validation
      const plIds = draftProductLines.map((pl) => pl.id);
      if (plIds.length === 0) {
        // No product lines — just switch mode, keep existing shared types
        setDraftStageTypesMode(newMode);
        setDirty(true);
        return;
      }

      const identical = arePLStageTypesIdentical(plIds);
      const firstPlId = plIds[0];

      // Check which PLs would lose stage defaults data during conversion
      const lostDefaultsInfo: string[] = [];
      if (!identical) {
        // In non-identical case, any PL not used as template may lose data
        for (const pl of draftProductLines) {
          if (pl.stageDefaults.length > 0) {
            lostDefaultsInfo.push(pl.name);
          }
        }
      }

      if (identical && plIds.length === 1) {
        // Single PL or identical — safe to convert directly
        applyModeSwitchToShared(firstPlId);
        return;
      }

      // Show confirmation dialog — user picks template PL
      setModeSwitchConfirm({
        identical,
        templatePlId: firstPlId,
        productLines: draftProductLines.map((pl) => ({ id: pl.id, name: pl.name, shortName: pl.shortName })),
        lostDefaultsInfo,
      });
    },
    [draftStageTypesMode, draftStageTypes, draftProductLines, draftPLStageTypes, arePLStageTypesIdentical]
  );

  // Apply the per-PL → shared conversion using the selected template PL
  const applyModeSwitchToShared = useCallback(
    (templatePlId: string) => {
      const templateTypes = [...(draftPLStageTypes[templatePlId] || [])].sort(
        (a, b) => a.displayOrder - b.displayOrder
      );

      // Build global stage types from template (with fresh IDs for the shared list)
      const idMap: Record<string, string> = {}; // templatePL-id → new shared id
      const globalTypes: StageTypeDefinition[] = templateTypes.map((t, idx) => {
        const newId = generateId('st-');
        idMap[t.id] = newId;
        return { ...t, id: newId, displayOrder: idx };
      });

      // Build a positional mapping for non-template PLs so we can remap their
      // stage defaults to the new global IDs where a matching stage type exists.
      // Uses (name|shortName|count|occurrenceIndex) to disambiguate duplicates.
      const structureToGlobalId: Record<string, string> = {};
      const seenKeys: Record<string, number> = {};
      for (const gt of globalTypes) {
        const baseKey = `${gt.name}|${gt.shortName}|${gt.count}`;
        const occ = seenKeys[baseKey] ?? 0;
        seenKeys[baseKey] = occ + 1;
        structureToGlobalId[`${baseKey}|${occ}`] = gt.id;
      }

      // Update product lines: remap stageDefaults to use new global IDs.
      // For the template PL, use direct idMap. For others, match by structure;
      // remove defaults whose stage type has no match in the global list.
      const updatedProductLines = draftProductLines.map((pl) => {
        if (pl.id === templatePlId) {
          return {
            ...pl,
            stageDefaults: pl.stageDefaults.map((sd) => ({
              ...sd,
              stageType: idMap[sd.stageType] || sd.stageType,
            })),
          };
        }
        // Non-template PL: remap by matching per-PL type structure → global ID (positional)
        const plTypes = [...(draftPLStageTypes[pl.id] || [])].sort(
          (a, b) => a.displayOrder - b.displayOrder
        );
        const plIdToGlobalId: Record<string, string> = {};
        const plSeenKeys: Record<string, number> = {};
        for (const pt of plTypes) {
          const baseKey = `${pt.name}|${pt.shortName}|${pt.count}`;
          const occ = plSeenKeys[baseKey] ?? 0;
          plSeenKeys[baseKey] = occ + 1;
          const fullKey = `${baseKey}|${occ}`;
          if (structureToGlobalId[fullKey]) {
            plIdToGlobalId[pt.id] = structureToGlobalId[fullKey];
          }
        }

        // Keep only defaults that map to a global stage type
        const remappedDefaults = pl.stageDefaults
          .map((sd) => {
            const globalId = plIdToGlobalId[sd.stageType];
            if (!globalId) return null; // stage type not in global list → remove
            return { ...sd, stageType: globalId };
          })
          .filter((sd): sd is StageDefault => sd !== null);

        // Add defaults for any global types this PL didn't have yet
        const coveredGlobalIds = new Set(remappedDefaults.map((sd) => sd.stageType));
        for (const gt of globalTypes) {
          if (!coveredGlobalIds.has(gt.id)) {
            remappedDefaults.push(
              buildPrefillDefault(gt.id, gt.displayOrder, remappedDefaults, globalTypes)
            );
          }
        }

        return { ...pl, stageDefaults: remappedDefaults };
      });

      setDraftStageTypes(globalTypes);
      setDraftProductLines(updatedProductLines);
      setDraftStageTypesMode('shared');
      setModeSwitchConfirm(null);
      setDirty(true);
    },
    [draftPLStageTypes, draftProductLines, buildPrefillDefault]
  );

  // ── Per-product-line stage type helpers ──────────────────────────────

  const addPLStageType = useCallback((plId: string) => {
    const arr = draftPLStageTypes[plId] || [];
    const maxOrder = arr.reduce((mx, d) => Math.max(mx, d.displayOrder), -1);
    const newId = generateId('st-');
    const newDisplayOrder = maxOrder + 1;
    const newDef: StageTypeDefinition = {
      id: newId,
      name: '',
      shortName: '',
      description: '',
      count: 1,
      displayOrder: newDisplayOrder,
    };
    setDraftPLStageTypes((prev) => ({
      ...prev,
      [plId]: [...(prev[plId] || []), newDef],
    }));

    // Auto-add stage default for this product line only
    const pl = draftProductLines.find((p) => p.id === plId);
    if (pl) {
      const plTypes = draftPLStageTypes[plId] || [];
      const newDefault = buildPrefillDefault(newId, newDisplayOrder, pl.stageDefaults, plTypes);
      setDraftProductLines((prev) =>
        prev.map((p) => {
          if (p.id !== plId) return p;
          return { ...p, stageDefaults: [...p.stageDefaults, newDefault] };
        })
      );
    }

    setDirty(true);
  }, [draftPLStageTypes, draftProductLines, buildPrefillDefault]);

  const updatePLStageType = useCallback(
    (plId: string, stId: string, updates: Partial<Omit<StageTypeDefinition, 'id'>>) => {
      setDraftPLStageTypes((prev) => ({
        ...prev,
        [plId]: (prev[plId] || []).map((d) => (d.id === stId ? { ...d, ...updates } : d)),
      }));
      setDirty(true);
    },
    []
  );

  const requestDeletePLStageType = useCallback((plId: string, stId: string) => {
    const pl = draftProductLines.find((p) => p.id === plId);
    const stType = (draftPLStageTypes[plId] || []).find((d) => d.id === stId);
    const hasDefaults = pl?.stageDefaults.some((sd) => sd.stageType === stId) ?? false;

    if (!hasDefaults) {
      // No stage defaults reference this type — delete immediately
      setDraftPLStageTypes((prev) => ({
        ...prev,
        [plId]: (prev[plId] || []).filter((d) => d.id !== stId),
      }));
      setDirty(true);
      return;
    }

    setDeleteConfirm({
      stageTypeId: stId,
      stageTypeName: stType?.name || stId,
      productLineId: plId,
      affectedLines: [pl?.name || plId],
    });
  }, [draftProductLines, draftPLStageTypes]);

  const movePLStageType = useCallback((plId: string, idx: number, dir: 'up' | 'down') => {
    setDraftPLStageTypes((prev) => {
      const sorted = [...(prev[plId] || [])].sort((a, b) => a.displayOrder - b.displayOrder);
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= sorted.length) return prev;
      const tempOrder = sorted[idx].displayOrder;
      sorted[idx] = { ...sorted[idx], displayOrder: sorted[swap].displayOrder };
      sorted[swap] = { ...sorted[swap], displayOrder: tempOrder };
      return { ...prev, [plId]: sorted };
    });
    setDirty(true);
  }, []);

  // ── Turnaround activity helpers ────────────────────────────────────

  const addActivity = useCallback((phase: TurnaroundPhase = 'pre') => {
    const group = activityGroupFilter || storeEquipmentGroups[0]?.id || 'fermenter';
    const newAct: TurnaroundActivity = {
      id: generateId('ta-'),
      name: 'New activity',
      durationDays: 0,
      durationHours: 1,
      durationMinutes: 0,
      equipmentGroup: group,
      isDefault: true,
      phase,
      validityValue: phase === 'pre' ? 24 : 0,
      validityUnit: 'h',
      autoRepeat: phase === 'pre',
      description: '',
    };
    setDraftActivities((prev) => [...prev, newAct]);
    setExpandedActivityId(newAct.id);
    setDirty(true);
  }, [activityGroupFilter, storeEquipmentGroups]);

  const updateActivity = useCallback(
    (id: string, updates: Partial<Omit<TurnaroundActivity, 'id'>>) => {
      setDraftActivities((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...updates } : a))
      );
      setDirty(true);
    },
    []
  );

  const deleteActivity = useCallback((id: string) => {
    setDraftActivities((prev) => prev.filter((a) => a.id !== id));
    setDirty(true);
  }, []);

  // ── Shutdown helpers ───────────────────────────────────────────────

  const addShutdown = useCallback(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 7);
    const newShutdown: ShutdownPeriod = {
      id: generateId('sd-'),
      name: '',
      startDate: start,
      endDate: end,
    };
    setDraftShutdowns((prev) => [...prev, newShutdown]);
    setEditingShutdownId(newShutdown.id);
    setDirty(true);
  }, []);

  const updateShutdown = useCallback(
    (id: string, updates: Partial<Omit<ShutdownPeriod, 'id'>>) => {
      setDraftShutdowns((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
      );
      setDirty(true);
    },
    []
  );

  const deleteShutdown = useCallback((id: string) => {
    setDraftShutdowns((prev) => prev.filter((s) => s.id !== id));
    if (editingShutdownId === id) setEditingShutdownId(null);
    setDirty(true);
  }, [editingShutdownId]);

  // ── Filtered activities ────────────────────────────────────────────

  // Initialise activity group filter to first available group when modal opens
  useEffect(() => {
    if (!open) return;
    if (!activityGroupFilter && storeEquipmentGroups.length > 0) {
      setActivityGroupFilter(storeEquipmentGroups[0].id);
    }
  }, [open, activityGroupFilter, storeEquipmentGroups]);

  const filteredActivities = useMemo(
    () => draftActivities.filter((a) => a.equipmentGroup === activityGroupFilter),
    [draftActivities, activityGroupFilter]
  );

  // Count activities per group for the segmented selector
  const activityCountByGroup = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of draftActivities) map[a.equipmentGroup] = (map[a.equipmentGroup] ?? 0) + 1;
    return map;
  }, [draftActivities]);

  // Pre/Post split for the active group
  const preActivities = useMemo(
    () => filteredActivities.filter((a) => (a.phase ?? 'pre') === 'pre'),
    [filteredActivities]
  );
  const postActivities = useMemo(
    () => filteredActivities.filter((a) => a.phase === 'post'),
    [filteredActivities]
  );

  // Helper: format minutes as "1d 2h 30m"
  const formatTaDuration = (a: TurnaroundActivity): string => {
    const d = a.durationDays, h = a.durationHours, m = a.durationMinutes;
    const parts: string[] = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    return parts.join(' ') || '0m';
  };

  // ── Shutdown conflict detection ───────────────────────────────────

  const shutdownConflicts = useMemo(() => {
    const map: Record<string, string[]> = {};
    const chainNameById: Record<string, string> = {};
    for (const bc of storeBatchChains) {
      chainNameById[bc.id] = bc.batchName;
    }
    for (const sd of draftShutdowns) {
      const sdStart = sd.startDate.getTime();
      const sdEnd = sd.endDate.getTime();
      const overlapping = new Set<string>();
      for (const stage of storeStages) {
        const sStart = stage.startDatetime.getTime();
        const sEnd = stage.endDatetime.getTime();
        if (sStart < sdEnd && sEnd > sdStart) {
          overlapping.add(chainNameById[stage.batchChainId] || stage.batchChainId);
        }
      }
      if (overlapping.size > 0) {
        map[sd.id] = [...overlapping].sort();
      }
    }
    return map;
  }, [draftShutdowns, storeStages, storeBatchChains]);

  // ── Save ───────────────────────────────────────────────────────────

  function handleSave() {
    setStageTypeDefinitions(draftStageTypes);
    setStageTypesMode(draftStageTypesMode);
    setProductLineStageTypes(draftPLStageTypes);
    setProductLines(draftProductLines);
    setTurnaroundActivities(draftActivities);
    setShutdownPeriods(draftShutdowns);
    setBatchNamingConfig(draftNaming);
    setDirty(false);
  }

  // ── Naming helpers ──────────────────────────────────────────────────

  function updateNamingRule(
    lineId: string | null,
    field: keyof BatchNamingRule,
    value: string | number,
  ) {
    setDraftNaming((prev) => {
      if (lineId === null) {
        // shared rule
        const rule = { ...prev.sharedRule, [field]: value };
        return { ...prev, sharedRule: rule };
      }
      const rules = { ...prev.productLineRules };
      rules[lineId] = { ...(rules[lineId] || DEFAULT_NAMING_RULE), [field]: value };
      return { ...prev, productLineRules: rules };
    });
    setDirty(true);
  }

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // ── Render ─────────────────────────────────────────────────────────

  if (!open) return null;

  return (
    <div className="pp-modal-backdrop" onClick={onClose}>
      <div className="pp-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        {/* Header */}
        <div className="pp-modal-header">
          <h2>Process Setup</h2>
          <button className="pp-modal-close" onClick={onClose} title="Close">
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="pp-modal-tabs">
          <button
            className={`pp-modal-tab ${tab === 'stageTypes' ? 'active' : ''}`}
            onClick={() => setTab('stageTypes')}
          >
            Stage Types
          </button>
          <button
            className={`pp-modal-tab ${tab === 'stages' ? 'active' : ''}`}
            onClick={() => setTab('stages')}
          >
            Stage Defaults
          </button>
          <button
            className={`pp-modal-tab ${tab === 'turnaround' ? 'active' : ''}`}
            onClick={() => setTab('turnaround')}
          >
            Turnaround Activities
          </button>
          <button
            className={`pp-modal-tab ${tab === 'shutdowns' ? 'active' : ''}`}
            onClick={() => setTab('shutdowns')}
          >
            Shutdowns
          </button>
          <button
            className={`pp-modal-tab ${tab === 'naming' ? 'active' : ''}`}
            onClick={() => setTab('naming')}
          >
            Naming
          </button>
        </div>

        {/* Body */}
        <div className="pp-modal-body">
          {/* ═══════ Stage Types tab ═══════ */}
          {tab === 'stageTypes' && (
            <div className="pp-process-stage-types">
              <p className="pp-process-help">
                Define the stage types used in your seed train. Each type maps to one step
                in the upstream process (e.g. Inoculum → Seed n-2 → Seed n-1 → Production).
              </p>

              {/* Scope toggle */}
              <div className="pp-stage-scope-toggle">
                <label className={`pp-stage-scope-option${draftStageTypesMode === 'shared' ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="stageTypesMode"
                    value="shared"
                    checked={draftStageTypesMode === 'shared'}
                    onChange={() => handleStageTypesModeChange('shared')}
                  />
                  <span>Same stage types for all product lines</span>
                </label>
                <label className={`pp-stage-scope-option${draftStageTypesMode === 'per_product_line' ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="stageTypesMode"
                    value="per_product_line"
                    checked={draftStageTypesMode === 'per_product_line'}
                    onChange={() => handleStageTypesModeChange('per_product_line')}
                  />
                  <span>Each product line has its own stage types</span>
                </label>
              </div>

              {/* ── Shared (global) mode ── */}
              {draftStageTypesMode === 'shared' && (
                <>
                  <div className="pp-setup-filter-bar">
                    <span className="text-xs text-[var(--pp-muted)]">
                      {draftStageTypes.length} stage type{draftStageTypes.length !== 1 ? 's' : ''} defined
                    </span>
                    <button className="pp-setup-add-btn" onClick={addStageType}>
                      + Stage Type
                    </button>
                  </div>

                  {sortedStageTypes.length === 0 && (
                    <div className="pp-setup-empty">
                      No stage types defined. Click &ldquo;+ Stage Type&rdquo; to add one.
                    </div>
                  )}

                  {sortedStageTypes.length > 0 && (
                    <StageTypeTable
                      items={sortedStageTypes}
                      onUpdate={(id, u) => updateStageType(id, u)}
                      onDelete={(id) => requestDeleteStageType(id)}
                      onMove={(idx, dir) => moveStageType(idx, dir)}
                    />
                  )}
                </>
              )}

              {/* ── Per-product-line mode ── */}
              {draftStageTypesMode === 'per_product_line' && (
                <>
                  {draftProductLines.length === 0 && (
                    <div className="pp-setup-empty">
                      No product lines defined. Add product lines in Equipment Setup first.
                    </div>
                  )}
                  {[...draftProductLines]
                    .sort((a, b) => a.displayOrder - b.displayOrder)
                    .map((pl) => {
                      const plTypes = [...(draftPLStageTypes[pl.id] || [])].sort(
                        (a, b) => a.displayOrder - b.displayOrder
                      );
                      return (
                        <div key={pl.id} className="pp-stage-pl-section">
                          <div className="pp-stage-pl-header">
                            <span className="pp-stage-pl-name">
                              {pl.name}
                              <span className="pp-setup-badge" style={{ marginLeft: 6 }}>{pl.shortName}</span>
                            </span>
                            <span className="text-xs text-[var(--pp-muted)]">
                              {plTypes.length} stage type{plTypes.length !== 1 ? 's' : ''}
                            </span>
                            <button
                              className="pp-setup-add-btn"
                              onClick={() => addPLStageType(pl.id)}
                            >
                              + Stage Type
                            </button>
                          </div>

                          {plTypes.length === 0 && (
                            <div className="pp-setup-empty" style={{ margin: '4px 0 8px' }}>
                              No stage types. Click &ldquo;+ Stage Type&rdquo; to add one.
                            </div>
                          )}

                          {plTypes.length > 0 && (
                            <StageTypeTable
                              items={plTypes}
                              onUpdate={(id, u) => updatePLStageType(pl.id, id, u)}
                              onDelete={(id) => requestDeletePLStageType(pl.id, id)}
                              onMove={(idx, dir) => movePLStageType(pl.id, idx, dir)}
                            />
                          )}
                        </div>
                      );
                    })}
                </>
              )}

              <p className="pp-process-help" style={{ marginTop: 12, fontSize: 11, opacity: 0.7 }}>
                Stage type IDs are auto-generated. Names appear in dropdowns throughout the app.
                Short names are used on bar labels and filter chips.
              </p>
            </div>
          )}

          {/* ═══════ Stage Defaults tab ═══════ */}
          {tab === 'stages' && (
            <div className="pp-process-stages">
              <p className="pp-process-help">
                Configure default stage durations and equipment group assignments per product line.
                These defaults drive the auto-scheduling wizard when creating new batch chains.
              </p>

              {draftProductLines.length === 0 && (
                <div className="pp-setup-empty">
                  No product lines defined. Add them in Equipment Setup.
                </div>
              )}

              {draftProductLines.map((pl) => (
                <div key={pl.id} className="pp-process-pl-card">
                  <div className="pp-process-pl-header">
                    <span className="pp-process-pl-name">{pl.name}</span>
                    <span className="pp-process-pl-id">{pl.shortName || pl.id}</span>
                    <button
                      className="pp-setup-add-btn"
                      onClick={() => addStageDefault(pl.id)}
                      title="Add stage"
                    >
                      + Stage
                    </button>
                  </div>

                  {pl.stageDefaults.length === 0 && (
                    <div className="pp-setup-empty" style={{ padding: '8px 12px' }}>
                      No stages defined. Click &ldquo;+ Stage&rdquo; to add one.
                    </div>
                  )}

                  {pl.stageDefaults.length > 0 && (
                    <div className="pp-process-stage-list">
                      <div className="pp-process-stage-header-row">
                        <span className="pp-process-stage-col-order">#</span>
                        <span className="pp-process-stage-col-type">Stage Type</span>
                        <span className="pp-process-stage-col-dur">Target (h)</span>
                        <span className="pp-process-stage-col-dur-sm">Min (h)</span>
                        <span className="pp-process-stage-col-dur-sm">Max (h)</span>
                        <span className="pp-process-stage-col-group">Equipment Group</span>
                        <span className="pp-process-stage-col-actions">Actions</span>
                      </div>

                      {pl.stageDefaults.map((sd, idx) => (
                        <div key={idx} className="pp-process-stage-row">
                          <span className="pp-process-stage-col-order">
                            <button
                              className="pp-setup-move-btn"
                              onClick={() => moveStageDefault(pl.id, idx, 'up')}
                              disabled={idx === 0}
                              title="Move up"
                            >
                              &uarr;
                            </button>
                            <button
                              className="pp-setup-move-btn"
                              onClick={() => moveStageDefault(pl.id, idx, 'down')}
                              disabled={idx === pl.stageDefaults.length - 1}
                              title="Move down"
                            >
                              &darr;
                            </button>
                          </span>

                          <span className="pp-process-stage-col-type">
                            <select
                              value={sd.stageType}
                              onChange={(e) =>
                                updateStageDefault(pl.id, idx, 'stageType' as keyof StageDefault, e.target.value)
                              }
                              className="pp-setup-select"
                            >
                              {stageTypesForPL(pl.id).map((st) => (
                                <option key={st.id} value={st.id}>
                                  {st.name || st.id}
                                </option>
                              ))}
                            </select>
                          </span>

                          <span className="pp-process-stage-col-dur">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={sd.defaultDurationHours}
                              onChange={(e) =>
                                updateStageDefault(pl.id, idx, 'defaultDurationHours', e.target.value)
                              }
                              className="pp-setup-input"
                              style={{ width: 72 }}
                            />
                            <span className="pp-process-duration-hint">
                              {formatHoursAsDHM(sd.defaultDurationHours)}
                            </span>
                          </span>

                          <span className="pp-process-stage-col-dur-sm">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={sd.minDurationHours ?? Math.round(sd.defaultDurationHours * 0.9)}
                              onChange={(e) =>
                                updateStageDefault(pl.id, idx, 'minDurationHours', e.target.value)
                              }
                              className="pp-setup-input"
                              style={{ width: 60 }}
                            />
                            <span className="pp-process-duration-hint">
                              {formatHoursAsDHM(sd.minDurationHours ?? Math.round(sd.defaultDurationHours * 0.9))}
                            </span>
                          </span>

                          <span className="pp-process-stage-col-dur-sm">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={sd.maxDurationHours ?? Math.round(sd.defaultDurationHours * 1.1)}
                              onChange={(e) =>
                                updateStageDefault(pl.id, idx, 'maxDurationHours', e.target.value)
                              }
                              className="pp-setup-input"
                              style={{ width: 60 }}
                            />
                            <span className="pp-process-duration-hint">
                              {formatHoursAsDHM(sd.maxDurationHours ?? Math.round(sd.defaultDurationHours * 1.1))}
                            </span>
                          </span>

                          <span className="pp-process-stage-col-group">
                            <select
                              value={sd.machineGroup}
                              onChange={(e) =>
                                updateStageDefault(pl.id, idx, 'machineGroup', e.target.value)
                              }
                              className="pp-setup-select"
                            >
                              {storeEquipmentGroups.map((eg) => (
                                <option key={eg.id} value={eg.id}>
                                  {eg.name}
                                </option>
                              ))}
                            </select>
                          </span>

                          <span className="pp-process-stage-col-actions">
                            <button
                              className="pp-setup-action-btn pp-setup-delete-btn"
                              onClick={() => removeStageDefault(pl.id, idx)}
                              title="Remove stage"
                            >
                              Del
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ═══════ Turnaround Activities tab ═══════ */}
          {tab === 'turnaround' && (
            <div className="pp-ta-tab">
              <p className="pp-process-help">
                Activities that must fit between consecutive batches on the same vessel.
                Pre-batch activities (CIP → Media → SIP → Ready) run before the next batch can start.
                Post-batch activities (e.g. Transfer to Downstream) run after the current batch ends.
                Validity windows let the scheduler repeat an activity if it expires before the next batch.
              </p>

              {/* Group switcher — segmented, one group at a time */}
              <div className="pp-ta-group-bar">
                <div className="pp-ta-group-seg" role="tablist">
                  {storeEquipmentGroups.map((eg) => (
                    <button
                      key={eg.id}
                      type="button"
                      role="tab"
                      aria-selected={activityGroupFilter === eg.id}
                      className={activityGroupFilter === eg.id ? 'active' : ''}
                      onClick={() => { setActivityGroupFilter(eg.id); setExpandedActivityId(null); }}
                    >
                      {eg.name}
                      <span className="pp-ta-group-count">{activityCountByGroup[eg.id] ?? 0}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Composed cycle summary strip */}
              {filteredActivities.length > 0 && (
                <TurnaroundSummary pre={preActivities} post={postActivities} />
              )}

              {/* Pre-batch section */}
              <TurnaroundSection
                phase="pre"
                title="Before batch · Turnaround"
                emptyMsg="No pre-batch activities. Add CIP, media prep, or SIP below."
                activities={preActivities}
                allInGroup={filteredActivities}
                expandedId={expandedActivityId}
                onSelect={(id) => setExpandedActivityId(expandedActivityId === id ? null : id)}
                onUpdate={updateActivity}
                onDelete={(id) => { deleteActivity(id); if (expandedActivityId === id) setExpandedActivityId(null); }}
                onAdd={() => addActivity('pre')}
              />

              {/* Production batch divider */}
              <div className="pp-ta-batch-divider">
                <span className="pp-ta-batch-line" />
                <span className="pp-ta-batch-pip"><span className="pp-ta-batch-dot" /> Production Batch</span>
                <span className="pp-ta-batch-line" />
              </div>

              {/* Post-batch section */}
              <TurnaroundSection
                phase="post"
                title="After batch · Handoff"
                emptyMsg="No post-batch activities. e.g. Transfer to Downstream."
                activities={postActivities}
                allInGroup={filteredActivities}
                expandedId={expandedActivityId}
                onSelect={(id) => setExpandedActivityId(expandedActivityId === id ? null : id)}
                onUpdate={updateActivity}
                onDelete={(id) => { deleteActivity(id); if (expandedActivityId === id) setExpandedActivityId(null); }}
                onAdd={() => addActivity('post')}
              />
            </div>
          )}

          {/* ═══════ Shutdowns tab ═══════ */}
          {tab === 'shutdowns' && (
            <div className="pp-process-shutdowns">
              <p className="pp-process-help">
                Define plant shutdown periods. Batch chains that cross a shutdown boundary
                will be visually flagged. The scheduling engine uses shutdowns to warn
                about conflicts.
              </p>

              <div className="pp-setup-filter-bar">
                <span className="text-xs text-[var(--pp-muted)]">
                  {draftShutdowns.length} shutdown{draftShutdowns.length !== 1 ? 's' : ''} defined
                </span>
                <button className="pp-setup-add-btn" onClick={addShutdown}>
                  + Shutdown
                </button>
              </div>

              {draftShutdowns.length === 0 && (
                <div className="pp-setup-empty">
                  No shutdown periods defined. Click &ldquo;+ Shutdown&rdquo; to add one.
                </div>
              )}

              <div className="pp-process-shutdown-list">
                {draftShutdowns
                  .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
                  .map((sd) => {
                    const isEditing = editingShutdownId === sd.id;
                    const days = Math.max(
                      1,
                      Math.round((sd.endDate.getTime() - sd.startDate.getTime()) / (1000 * 60 * 60 * 24))
                    );
                    const isPast = sd.endDate < new Date();
                    const conflicts = shutdownConflicts[sd.id];

                    return (
                      <div
                        key={sd.id}
                        className={`pp-process-shutdown-card ${isEditing ? 'editing' : ''} ${isPast ? 'past' : ''}`}
                      >
                        <div
                          className="pp-process-shutdown-summary"
                          onClick={() => setEditingShutdownId(isEditing ? null : sd.id)}
                        >
                          <span className="pp-process-shutdown-indicator" />
                          <span className="pp-process-shutdown-name">
                            {sd.name || 'Unnamed Shutdown'}
                          </span>
                          <span className="pp-process-shutdown-dates">
                            {toDateLocal(sd.startDate)} &rarr; {toDateLocal(sd.endDate)}
                          </span>
                          <span className="pp-process-shutdown-duration">
                            {days}d
                          </span>
                          {isPast && (
                            <span className="pp-process-shutdown-past-badge">Past</span>
                          )}
                          {conflicts && (
                            <span className="pp-process-shutdown-conflict-badge">
                              {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>

                        {conflicts && (
                          <div className="pp-process-shutdown-warning">
                            <span className="pp-process-shutdown-warning-icon">&#9888;</span>
                            <span>
                              {conflicts.length} batch{conflicts.length !== 1 ? 'es' : ''} overlap
                              with this shutdown: {conflicts.join(', ')}
                            </span>
                          </div>
                        )}

                        {isEditing && (
                          <div className="pp-process-shutdown-editor">
                            <div className="pp-process-shutdown-field">
                              <label className="pp-process-field-label">Name</label>
                              <input
                                type="text"
                                value={sd.name}
                                onChange={(e) => updateShutdown(sd.id, { name: e.target.value })}
                                placeholder="e.g. Annual Shutdown 2026"
                                className="pp-setup-input"
                              />
                            </div>

                            <div className="pp-process-shutdown-dates-row">
                              <div className="pp-process-shutdown-field">
                                <label className="pp-process-field-label">Start</label>
                                <input
                                  type="date"
                                  value={toDateLocal(sd.startDate)}
                                  onChange={(e) => {
                                    const d = fromDateLocal(e.target.value);
                                    if (d) updateShutdown(sd.id, { startDate: d });
                                  }}
                                  className="pp-setup-input"
                                />
                              </div>
                              <div className="pp-process-shutdown-field">
                                <label className="pp-process-field-label">End</label>
                                <input
                                  type="date"
                                  value={toDateLocal(sd.endDate)}
                                  onChange={(e) => {
                                    const d = fromDateLocal(e.target.value);
                                    if (d) updateShutdown(sd.id, { endDate: d });
                                  }}
                                  className="pp-setup-input"
                                />
                              </div>
                            </div>

                            <div className="pp-process-shutdown-field">
                              <label className="pp-process-field-label">Reason (optional)</label>
                              <input
                                type="text"
                                value={sd.reason || ''}
                                onChange={(e) => updateShutdown(sd.id, { reason: e.target.value })}
                                placeholder="e.g. Planned maintenance, regulatory inspection"
                                className="pp-setup-input"
                              />
                            </div>

                            <div className="pp-process-shutdown-actions">
                              <button
                                className="pp-setup-action-btn pp-setup-delete-btn"
                                onClick={() => deleteShutdown(sd.id)}
                              >
                                Delete Shutdown
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ═══════ Naming tab ═══════ */}
          {tab === 'naming' && (
            <div className="pp-process-naming">
              <p className="pp-process-help">
                Configure how batch names are generated. The final production stage sets the
                batch name; upstream stages in the chain inherit it.
              </p>

              {/* Mode selector: shared vs per product line */}
              <div className="pp-naming-section">
                <label className="pp-process-field-label">Naming scope</label>
                <div className="pp-naming-mode-options">
                  <label className="pp-naming-radio">
                    <input
                      type="radio"
                      name="namingMode"
                      checked={draftNaming.mode === 'shared'}
                      onChange={() => {
                        setDraftNaming((p) => ({ ...p, mode: 'shared' }));
                        setDirty(true);
                      }}
                    />
                    <span>Same naming for all product lines</span>
                  </label>
                  <label className="pp-naming-radio">
                    <input
                      type="radio"
                      name="namingMode"
                      checked={draftNaming.mode === 'per_product_line'}
                      onChange={() => {
                        setDraftNaming((p) => ({ ...p, mode: 'per_product_line' }));
                        setDirty(true);
                      }}
                    />
                    <span>Each product line has its own nomenclature</span>
                  </label>
                </div>
              </div>

              {/* Counter reset */}
              <div className="pp-naming-section">
                <label className="pp-process-field-label">Counter reset</label>
                <div className="pp-naming-mode-options">
                  <label className="pp-naming-radio">
                    <input
                      type="radio"
                      name="resetMode"
                      checked={draftNaming.counterResetMode === 'annual'}
                      onChange={() => {
                        setDraftNaming((p) => ({ ...p, counterResetMode: 'annual', counterResetMonth: 1, counterResetDay: 1 }));
                        setDirty(true);
                      }}
                    />
                    <span>Annual reset (1st January)</span>
                  </label>
                  <label className="pp-naming-radio">
                    <input
                      type="radio"
                      name="resetMode"
                      checked={draftNaming.counterResetMode === 'custom'}
                      onChange={() => {
                        setDraftNaming((p) => ({ ...p, counterResetMode: 'custom' }));
                        setDirty(true);
                      }}
                    />
                    <span>Custom reset date</span>
                  </label>
                  <label className="pp-naming-radio">
                    <input
                      type="radio"
                      name="resetMode"
                      checked={draftNaming.counterResetMode === 'none'}
                      onChange={() => {
                        setDraftNaming((p) => ({ ...p, counterResetMode: 'none' }));
                        setDirty(true);
                      }}
                    />
                    <span>No reset — continuous numbering from set start</span>
                  </label>
                </div>

                {draftNaming.counterResetMode === 'custom' && (
                  <div className="pp-naming-reset-date">
                    <div className="pp-naming-field">
                      <label className="pp-process-field-label">Month</label>
                      <select
                        value={draftNaming.counterResetMonth}
                        onChange={(e) => {
                          setDraftNaming((p) => ({ ...p, counterResetMonth: Number(e.target.value) }));
                          setDirty(true);
                        }}
                        className="pp-setup-select"
                      >
                        {MONTH_NAMES.map((name, i) => (
                          <option key={i} value={i + 1}>{name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="pp-naming-field">
                      <label className="pp-process-field-label">Day</label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={draftNaming.counterResetDay}
                        onChange={(e) => {
                          setDraftNaming((p) => ({ ...p, counterResetDay: Math.max(1, Math.min(31, Number(e.target.value) || 1)) }));
                          setDirty(true);
                        }}
                        className="pp-setup-input"
                        style={{ width: 64 }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Naming rules */}
              <div className="pp-naming-section">
                <label className="pp-process-field-label">
                  {draftNaming.mode === 'shared' ? 'Batch name pattern' : 'Batch name patterns per product line'}
                </label>

                {draftNaming.mode === 'shared' && (
                  <NamingRuleEditor
                    label="All lines"
                    rule={draftNaming.sharedRule}
                    onChange={(field, value) => updateNamingRule(null, field, value)}
                    showNextNumber={draftNaming.counterResetMode === 'none'}
                  />
                )}

                {draftNaming.mode === 'per_product_line' && (
                  <div className="pp-naming-rules-list">
                    {draftProductLines.map((pl) => {
                      const rule = draftNaming.productLineRules[pl.id]
                        || { ...DEFAULT_NAMING_RULE, prefix: pl.shortName ? `${pl.shortName}-` : '' };
                      return (
                        <NamingRuleEditor
                          key={pl.id}
                          label={`${pl.name} (${pl.shortName || pl.id})`}
                          rule={rule}
                          onChange={(field, value) => updateNamingRule(pl.id, field, value)}
                          showNextNumber={draftNaming.counterResetMode === 'none'}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Inheritance note */}
              <div className="pp-naming-section">
                <div className="pp-naming-info">
                  <span className="pp-naming-info-icon">&#9432;</span>
                  <span>
                    The <strong>final stage</strong> (production) sets the batch name.
                    Upstream stages in the chain inherit it automatically.
                  </span>
                </div>
              </div>

              {/* ERP integration CTA */}
              <div className="pp-naming-section">
                <div className="pp-naming-erp-cta">
                  <div className="pp-naming-erp-header">
                    <span className="pp-naming-erp-icon">&#x1F517;</span>
                    <span className="pp-naming-erp-title">ERP Batch Number Sync</span>
                    <span className="pp-naming-erp-badge">Enterprise</span>
                  </div>
                  <p className="pp-naming-erp-desc">
                    Connect batch numbers directly to your ERP system (SAP, Oracle, etc.)
                    for automatic synchronization — no manual entry, no mismatches.
                  </p>
                  <a
                    href="mailto:hello@plantpulse.pro?subject=ERP%20Integration%20Inquiry"
                    className="pp-naming-erp-link"
                  >
                    Ask for a quote &rarr; hello@plantpulse.pro
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pp-modal-footer">
          <span className="pp-modal-footer-hint">
            {dirty ? 'Unsaved changes' : 'No changes'}
          </span>
          <button className="pp-modal-btn pp-modal-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="pp-modal-btn pp-modal-btn-primary"
            onClick={handleSave}
            disabled={!dirty}
          >
            Save
          </button>
        </div>
      </div>

      {/* ── Stage type deletion confirmation dialog ─── */}
      {deleteConfirm && (
        <div className="pp-confirm-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div
            className="pp-confirm-dialog"
            role="alertdialog"
            aria-labelledby="pp-confirm-title"
            aria-describedby="pp-confirm-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="pp-confirm-title" className="pp-confirm-title">
              Delete Stage Type?
            </h3>
            <p id="pp-confirm-desc" className="pp-confirm-desc">
              Deleting <strong>{deleteConfirm.stageTypeName || 'this stage type'}</strong> will
              also remove its duration defaults from{' '}
              {deleteConfirm.affectedLines.length === 1
                ? <strong>{deleteConfirm.affectedLines[0]}</strong>
                : <>
                    <strong>{deleteConfirm.affectedLines.length} product line{deleteConfirm.affectedLines.length !== 1 ? 's' : ''}</strong>
                    {' '}({deleteConfirm.affectedLines.join(', ')})
                  </>
              }.
            </p>
            <p className="pp-confirm-warning">
              Stage duration defaults (Target, Min, Max, Equipment Group) for this stage type
              will be permanently lost{deleteConfirm.productLineId
                ? ` for ${deleteConfirm.affectedLines[0]}`
                : ' for all affected product lines'
              }. This cannot be undone.
            </p>
            <div className="pp-confirm-actions">
              <button
                className="pp-modal-btn pp-modal-btn-secondary"
                onClick={() => setDeleteConfirm(null)}
                autoFocus
              >
                Cancel
              </button>
              <button
                className="pp-modal-btn pp-confirm-delete-btn"
                onClick={confirmDeleteStageType}
              >
                Delete Stage Type &amp; Defaults
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mode switch (per-PL → shared) confirmation dialog ─── */}
      {modeSwitchConfirm && (
        <div className="pp-confirm-backdrop" onClick={() => setModeSwitchConfirm(null)}>
          <div
            className="pp-confirm-dialog"
            role="alertdialog"
            aria-labelledby="pp-modeswitch-title"
            aria-describedby="pp-modeswitch-desc"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 480 }}
          >
            <h3 id="pp-modeswitch-title" className="pp-confirm-title">
              {modeSwitchConfirm.identical
                ? 'Switch to Shared Stage Types?'
                : 'Stage Types Differ Between Product Lines'}
            </h3>

            {modeSwitchConfirm.identical ? (
              <p id="pp-modeswitch-desc" className="pp-confirm-desc">
                All product lines share the same stage type structure.
                They will be merged into a single global list.
              </p>
            ) : (
              <>
                <p id="pp-modeswitch-desc" className="pp-confirm-desc">
                  The stage type configurations differ between product lines (different names,
                  order, or counts). Choose which product line to use as the template for the
                  global stage type list. The other product lines will adopt this structure.
                </p>
                <div style={{ margin: '12px 0' }}>
                  <label className="pp-confirm-desc" style={{ fontWeight: 500, display: 'block', marginBottom: 6 }}>
                    Use as template:
                  </label>
                  <select
                    className="pp-setup-select"
                    style={{ width: '100%' }}
                    value={modeSwitchConfirm.templatePlId}
                    onChange={(e) =>
                      setModeSwitchConfirm((prev) => prev ? { ...prev, templatePlId: e.target.value } : null)
                    }
                  >
                    {modeSwitchConfirm.productLines.map((pl) => {
                      const count = (draftPLStageTypes[pl.id] || []).length;
                      return (
                        <option key={pl.id} value={pl.id}>
                          {pl.name} ({pl.shortName}) — {count} stage type{count !== 1 ? 's' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </>
            )}

            <p className="pp-confirm-warning">
              {modeSwitchConfirm.identical
                ? 'Per-product-line stage type customizations will be discarded.'
                : <>
                    Stage types not present in the selected template will be removed.
                    {modeSwitchConfirm.lostDefaultsInfo.length > 0 && (
                      <>
                        {' '}Stage Defaults data (Target, Min, Max, Equipment Group) may be
                        lost for:{' '}
                        <strong>{modeSwitchConfirm.lostDefaultsInfo.join(', ')}</strong>.
                      </>
                    )}
                  </>
              }
              {' '}This cannot be undone.
            </p>

            <div className="pp-confirm-actions">
              <button
                className="pp-modal-btn pp-modal-btn-secondary"
                onClick={() => setModeSwitchConfirm(null)}
                autoFocus
              >
                Cancel
              </button>
              <button
                className="pp-modal-btn pp-confirm-delete-btn"
                onClick={() => applyModeSwitchToShared(modeSwitchConfirm.templatePlId)}
              >
                Switch to Shared
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Naming rule editor sub-component ───────────────────────────────

function NamingRuleEditor({
  label,
  rule,
  onChange,
  showNextNumber,
}: {
  label: string;
  rule: BatchNamingRule;
  onChange: (field: keyof BatchNamingRule, value: string | number) => void;
  showNextNumber?: boolean;
}) {
  const previewFrom = showNextNumber ? (rule.nextNumber ?? rule.startNumber) : rule.startNumber;
  const previews = batchNamePreviewSequence(rule, previewFrom, 3);

  return (
    <div className="pp-naming-rule-card">
      <div className="pp-naming-rule-label">{label}</div>
      <div className="pp-naming-rule-fields">
        <div className="pp-naming-field">
          <label className="pp-process-field-label">Prefix</label>
          <input
            type="text"
            value={rule.prefix}
            onChange={(e) => onChange('prefix', e.target.value)}
            placeholder="optional"
            className="pp-setup-input"
            style={{ width: 96 }}
          />
        </div>
        {showNextNumber ? (
          <div className="pp-naming-field">
            <label className="pp-process-field-label">Next #</label>
            <input
              type="number"
              min={0}
              value={rule.nextNumber ?? rule.startNumber}
              onChange={(e) => onChange('nextNumber', Math.max(0, Number(e.target.value) || 0))}
              className="pp-setup-input"
              style={{ width: 72 }}
            />
          </div>
        ) : (
          <div className="pp-naming-field">
            <label className="pp-process-field-label">Start #</label>
            <input
              type="number"
              min={0}
              value={rule.startNumber}
              onChange={(e) => onChange('startNumber', Math.max(0, Number(e.target.value) || 0))}
              className="pp-setup-input"
              style={{ width: 64 }}
            />
          </div>
        )}
        <div className="pp-naming-field">
          <label className="pp-process-field-label">Step</label>
          <input
            type="number"
            min={1}
            max={100}
            value={rule.step || 1}
            onChange={(e) => onChange('step', Math.max(1, Number(e.target.value) || 1))}
            className="pp-setup-input"
            style={{ width: 52 }}
          />
        </div>
        <div className="pp-naming-field">
          <label className="pp-process-field-label">Digits</label>
          <input
            type="number"
            min={1}
            max={8}
            value={rule.padDigits}
            onChange={(e) => onChange('padDigits', Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
            className="pp-setup-input"
            style={{ width: 52 }}
          />
        </div>
        <div className="pp-naming-field">
          <label className="pp-process-field-label">Suffix</label>
          <input
            type="text"
            value={rule.suffix}
            onChange={(e) => onChange('suffix', e.target.value)}
            placeholder="optional"
            className="pp-setup-input"
            style={{ width: 80 }}
          />
        </div>
      </div>
      <div className="pp-naming-rule-preview">
        Preview: {previews.map((p, i) => (<span key={i}>{i > 0 && ', '}<code>{p}</code></span>))}, &hellip;
      </div>
    </div>
  );
}
