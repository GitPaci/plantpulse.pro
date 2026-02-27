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
  EquipmentGroup,
  ShutdownPeriod,
} from '@/lib/types';
import { turnaroundTotalHours } from '@/lib/types';

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

// Default stage types — covers the 4 equipment groups in a typical seed train.
// Users can add custom stage types via the Stage Defaults tab.
const DEFAULT_STAGE_TYPES: { value: string; label: string }[] = [
  { value: 'inoculation', label: 'Inoculation' },
  { value: 'propagation', label: 'Propagation' },
  { value: 'pre_fermentation', label: 'Pre-fermentation' },
  { value: 'fermentation', label: 'Fermentation' },
];

const STAGE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  DEFAULT_STAGE_TYPES.map((st) => [st.value, st.label])
);

function stageTypeLabel(st: string): string {
  return STAGE_TYPE_LABELS[st] ?? st;
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

type Tab = 'stages' | 'turnaround' | 'shutdowns';

export default function ProcessSetup({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Store data
  const storeProductLines = usePlantPulseStore((s) => s.productLines);
  const storeTurnaroundActivities = usePlantPulseStore((s) => s.turnaroundActivities);
  const storeShutdownPeriods = usePlantPulseStore((s) => s.shutdownPeriods);
  const storeEquipmentGroups = usePlantPulseStore((s) => s.equipmentGroups);

  const setProductLines = usePlantPulseStore((s) => s.setProductLines);
  const setTurnaroundActivities = usePlantPulseStore((s) => s.setTurnaroundActivities);
  const setShutdownPeriods = usePlantPulseStore((s) => s.setShutdownPeriods);

  // Draft state
  const [tab, setTab] = useState<Tab>('stages');
  const [draftProductLines, setDraftProductLines] = useState<ProductLine[]>([]);
  const [draftActivities, setDraftActivities] = useState<TurnaroundActivity[]>([]);
  const [draftShutdowns, setDraftShutdowns] = useState<ShutdownPeriod[]>([]);
  const [dirty, setDirty] = useState(false);

  // Turnaround activity filter
  const [activityGroupFilter, setActivityGroupFilter] = useState('all');

  // Shutdown editing
  const [editingShutdownId, setEditingShutdownId] = useState<string | null>(null);

  // ── Load draft from store on open ─────────────────────────────────

  useEffect(() => {
    if (open) {
      setDraftProductLines(storeProductLines.map((pl) => ({
        ...pl,
        stageDefaults: pl.stageDefaults.map((sd) => ({ ...sd })),
      })));
      setDraftActivities(storeTurnaroundActivities.map((a) => ({ ...a })));
      setDraftShutdowns(storeShutdownPeriods.map((s) => ({
        ...s,
        startDate: new Date(s.startDate),
        endDate: new Date(s.endDate),
      })));
      setDirty(false);
      setEditingShutdownId(null);
    }
  }, [open, storeProductLines, storeTurnaroundActivities, storeShutdownPeriods]);

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
              return { ...sd, defaultDurationHours: isNaN(num) || num < 0 ? 0 : num };
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
    setDraftProductLines((prev) =>
      prev.map((pl) => {
        if (pl.id !== plId) return pl;
        return {
          ...pl,
          stageDefaults: [
            ...pl.stageDefaults,
            { stageType: 'fermentation', defaultDurationHours: 48, machineGroup: 'fermenter' },
          ],
        };
      })
    );
    setDirty(true);
  }, []);

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

  // ── Turnaround activity helpers ────────────────────────────────────

  const addActivity = useCallback(() => {
    const newAct: TurnaroundActivity = {
      id: generateId('ta-'),
      name: '',
      durationDays: 0,
      durationHours: 4,
      durationMinutes: 0,
      equipmentGroup: storeEquipmentGroups[0]?.id || 'fermenter',
      isDefault: false,
    };
    setDraftActivities((prev) => [...prev, newAct]);
    setDirty(true);
  }, [storeEquipmentGroups]);

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

  const filteredActivities = useMemo(() => {
    if (activityGroupFilter === 'all') return draftActivities;
    return draftActivities.filter((a) => a.equipmentGroup === activityGroupFilter);
  }, [draftActivities, activityGroupFilter]);

  // ── Save ───────────────────────────────────────────────────────────

  function handleSave() {
    setProductLines(draftProductLines);
    setTurnaroundActivities(draftActivities);
    setShutdownPeriods(draftShutdowns);
    setDirty(false);
  }

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
        </div>

        {/* Body */}
        <div className="pp-modal-body">
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
                    <span className="pp-process-pl-id">{pl.id}</span>
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
                        <span className="pp-process-stage-col-dur">Duration (h)</span>
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
                              {DEFAULT_STAGE_TYPES.map((st) => (
                                <option key={st.value} value={st.value}>
                                  {st.label}
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
            <div className="pp-process-turnaround">
              <p className="pp-process-help">
                Define turnaround activities (CIP, SIP, Cleaning, etc.) that must fit between
                consecutive batches on the same vessel. The scheduling engine uses these to
                enforce minimum gaps.
              </p>

              {/* Filter + Add */}
              <div className="pp-setup-filter-bar">
                <select
                  value={activityGroupFilter}
                  onChange={(e) => setActivityGroupFilter(e.target.value)}
                  className="pp-setup-select"
                >
                  <option value="all">All equipment groups</option>
                  {storeEquipmentGroups.map((eg) => (
                    <option key={eg.id} value={eg.id}>
                      {eg.name}
                    </option>
                  ))}
                </select>
                <button className="pp-setup-add-btn" onClick={addActivity}>
                  + Activity
                </button>
              </div>

              {filteredActivities.length === 0 && (
                <div className="pp-setup-empty">
                  No turnaround activities{activityGroupFilter !== 'all' ? ' for this group' : ''}. Click &ldquo;+ Activity&rdquo; to add one.
                </div>
              )}

              {filteredActivities.length > 0 && (
                <div className="pp-process-activity-list">
                  <div className="pp-process-activity-header-row">
                    <span className="pp-process-activity-col-name">Name</span>
                    <span className="pp-process-activity-col-dur">Duration</span>
                    <span className="pp-process-activity-col-group">Equipment Group</span>
                    <span className="pp-process-activity-col-default">Default</span>
                    <span className="pp-process-activity-col-actions">Actions</span>
                  </div>

                  {filteredActivities.map((a) => (
                    <div key={a.id} className="pp-process-activity-row">
                      <span className="pp-process-activity-col-name">
                        <input
                          type="text"
                          value={a.name}
                          onChange={(e) => updateActivity(a.id, { name: e.target.value })}
                          placeholder="e.g. CIP"
                          className="pp-setup-input"
                          style={{ width: '100%' }}
                        />
                      </span>

                      <span className="pp-process-activity-col-dur">
                        <span className="pp-process-dhm">
                          <input
                            type="number"
                            min={0}
                            value={a.durationDays}
                            onChange={(e) =>
                              updateActivity(a.id, {
                                durationDays: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="pp-setup-input pp-process-dhm-input"
                            title="Days"
                          />
                          <span className="pp-process-dhm-label">d</span>
                          <input
                            type="number"
                            min={0}
                            max={23}
                            value={a.durationHours}
                            onChange={(e) =>
                              updateActivity(a.id, {
                                durationHours: Math.min(23, Math.max(0, Number(e.target.value) || 0)),
                              })
                            }
                            className="pp-setup-input pp-process-dhm-input"
                            title="Hours"
                          />
                          <span className="pp-process-dhm-label">h</span>
                          <input
                            type="number"
                            min={0}
                            max={59}
                            value={a.durationMinutes}
                            onChange={(e) =>
                              updateActivity(a.id, {
                                durationMinutes: Math.min(59, Math.max(0, Number(e.target.value) || 0)),
                              })
                            }
                            className="pp-setup-input pp-process-dhm-input"
                            title="Minutes"
                          />
                          <span className="pp-process-dhm-label">m</span>
                        </span>
                        <span className="pp-process-dhm-total">
                          = {turnaroundTotalHours(a).toFixed(1)}h
                        </span>
                      </span>

                      <span className="pp-process-activity-col-group">
                        <select
                          value={a.equipmentGroup}
                          onChange={(e) => updateActivity(a.id, { equipmentGroup: e.target.value })}
                          className="pp-setup-select"
                        >
                          {storeEquipmentGroups.map((eg) => (
                            <option key={eg.id} value={eg.id}>
                              {eg.name}
                            </option>
                          ))}
                        </select>
                      </span>

                      <span className="pp-process-activity-col-default">
                        <input
                          type="checkbox"
                          checked={a.isDefault}
                          onChange={(e) => updateActivity(a.id, { isDefault: e.target.checked })}
                          title="Auto-insert when scheduling new batches"
                        />
                      </span>

                      <span className="pp-process-activity-col-actions">
                        <button
                          className="pp-setup-action-btn pp-setup-delete-btn"
                          onClick={() => deleteActivity(a.id)}
                          title="Delete activity"
                        >
                          Del
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
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
                        </div>

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
    </div>
  );
}
