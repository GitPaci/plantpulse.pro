'use client';

// StageDetailPanel — Side panel for viewing and editing a single stage
// Ported from VBA: ObdelavaSerija form (Edit Series form in FormaZaPlan)
//
// Opens when user clicks a batch bar on the Planner timeline canvas.
// Read-only fields: batch name, series number, product line, stage type.
// Editable fields: machine (vessel), start/end datetime, stage state.
// Edit modes: fixed duration (default), free duration.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { usePlantPulseStore } from '@/lib/store';
import { differenceInHours, addHours, format } from 'date-fns';
import { detectOverlaps } from '@/lib/scheduling';
import type { OverlapConflict } from '@/lib/scheduling';
import type { StageState } from '@/lib/types';
import { FIXED_STAGE_STATES } from '@/lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Format a duration in hours as "Xd Yh". */
function formatDuration(hours: number): string {
  const d = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  if (d === 0) return `${h}h`;
  if (h === 0) return `${d}d`;
  return `${d}d ${h}h`;
}

/** Format a Date to datetime-local input value. */
function toDatetimeLocal(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

// ─── Recent custom statuses (localStorage) ────────────────────────────────

const RECENT_STATUSES_KEY = 'plantpulse.recentCustomStatuses.v1';
const MAX_RECENT = 5;

function getRecentCustomStatuses(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_STATUSES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function addRecentCustomStatus(label: string): void {
  const trimmed = label.trim();
  if (!trimmed) return;
  const existing = getRecentCustomStatuses().filter((s) => s !== trimmed);
  const updated = [trimmed, ...existing].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_STATUSES_KEY, JSON.stringify(updated));
  } catch { /* localStorage full — silently skip */ }
}

// ─── Status bar icons (inline SVG, 14×14, currentColor) ──────────────────

function IconClock() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="5.5" />
      <polyline points="7 4 7 7 9.5 8.5" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="5.5" />
      <polygon points="5.5 4.5 10 7 5.5 9.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="5.5" />
      <polyline points="4.5 7 6.5 9 9.5 5" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="5.5" />
      <line x1="5" y1="5" x2="9" y2="9" />
      <line x1="9" y1="5" x2="5" y2="9" />
    </svg>
  );
}

function IconEllipsis() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <circle cx="3" cy="7" r="1.2" />
      <circle cx="7" cy="7" r="1.2" />
      <circle cx="11" cy="7" r="1.2" />
    </svg>
  );
}

// ─── Status options ───────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: StageState; key: string; label: string; icon: React.ReactNode }[] = [
  { value: 'planned', key: 'planned', label: 'Planned', icon: <IconClock /> },
  { value: 'active', key: 'active', label: 'Active', icon: <IconPlay /> },
  { value: 'completed', key: 'completed', label: 'Completed', icon: <IconCheck /> },
  { value: 'aborted', key: 'aborted', label: 'Aborted', icon: <IconStop /> },
];

function isFixedStatus(state: StageState): boolean {
  return (FIXED_STAGE_STATES as readonly string[]).includes(state);
}

// ─── Component ────────────────────────────────────────────────────────────

interface StageDetailPanelProps {
  stageId: string | null;
  onClose: () => void;
  onEditChain?: (chainId: string) => void;
}

export default function StageDetailPanel({ stageId, onClose, onEditChain }: StageDetailPanelProps) {
  const stages = usePlantPulseStore((s) => s.stages);
  const batchChains = usePlantPulseStore((s) => s.batchChains);
  const machines = usePlantPulseStore((s) => s.machines);
  const productLines = usePlantPulseStore((s) => s.productLines);
  const stageTypeDefinitions = usePlantPulseStore((s) => s.stageTypeDefinitions);
  const equipmentGroups = usePlantPulseStore((s) => s.equipmentGroups);
  const updateStage = usePlantPulseStore((s) => s.updateStage);
  const deleteStage = usePlantPulseStore((s) => s.deleteStage);
  const updateBatchChain = usePlantPulseStore((s) => s.updateBatchChain);

  // Find the stage and its batch chain
  const stage = useMemo(
    () => stages.find((s) => s.id === stageId) ?? null,
    [stages, stageId]
  );
  const batchChain = useMemo(
    () => (stage ? batchChains.find((bc) => bc.id === stage.batchChainId) ?? null : null),
    [batchChains, stage]
  );

  // Draft state for editable fields
  const [draftMachineId, setDraftMachineId] = useState('');
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [draftState, setDraftState] = useState<StageState>('planned');
  const [fixedDuration, setFixedDuration] = useState(true);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Custom status popover state
  const [showCustomPopover, setShowCustomPopover] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const customBtnRef = useRef<HTMLButtonElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const statusBarRef = useRef<HTMLDivElement>(null);

  // Reset draft when stage changes
  useEffect(() => {
    if (stage) {
      setDraftMachineId(stage.machineId);
      setDraftStart(toDatetimeLocal(stage.startDatetime));
      setDraftEnd(toDatetimeLocal(stage.endDatetime));
      setDraftState(stage.state);
      setShowConfirmDelete(false);
      setShowCustomPopover(false);
      setCustomLabel('');
    }
  }, [stage]);

  // Close popover on outside click
  useEffect(() => {
    if (!showCustomPopover) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        customBtnRef.current && !customBtnRef.current.contains(e.target as Node)
      ) {
        setShowCustomPopover(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCustomPopover]);

  // Focus input when popover opens
  useEffect(() => {
    if (showCustomPopover && customInputRef.current) {
      customInputRef.current.focus();
    }
  }, [showCustomPopover]);

  // Compute duration
  const draftStartDate = useMemo(() => new Date(draftStart), [draftStart]);
  const draftEndDate = useMemo(() => new Date(draftEnd), [draftEnd]);
  const durationHours = useMemo(
    () => differenceInHours(draftEndDate, draftStartDate),
    [draftStartDate, draftEndDate]
  );

  // Original duration (used in fixed-duration mode)
  const originalDuration = useMemo(
    () => (stage ? differenceInHours(stage.endDatetime, stage.startDatetime) : 0),
    [stage]
  );

  // Handle start change with fixed duration
  const handleStartChange = useCallback(
    (value: string) => {
      setDraftStart(value);
      if (fixedDuration) {
        const newStart = new Date(value);
        if (!isNaN(newStart.getTime())) {
          setDraftEnd(toDatetimeLocal(addHours(newStart, originalDuration)));
        }
      }
    },
    [fixedDuration, originalDuration]
  );

  // Look up display info
  const currentMachine = machines.find((m) => m.id === draftMachineId);
  const stageTypeDef = stageTypeDefinitions.find((st) => st.id === stage?.stageType);
  const productLine = productLines.find((pl) => pl.id === batchChain?.productLine);

  // Equipment group for this stage type — used to filter machine dropdown
  const stageEquipmentGroup = useMemo(() => {
    if (!stageTypeDef || !productLine) return '';
    const stageDefault = productLine.stageDefaults.find(
      (sd) => sd.stageType === stageTypeDef.id
    );
    return stageDefault?.machineGroup ?? currentMachine?.group ?? '';
  }, [stageTypeDef, productLine, currentMachine]);

  const equipmentGroupName = equipmentGroups.find(
    (eg) => eg.id === stageEquipmentGroup
  )?.name ?? stageEquipmentGroup;

  // Available machines for the dropdown (same equipment group)
  const availableMachines = useMemo(
    () =>
      stageEquipmentGroup
        ? machines.filter((m) => m.group === stageEquipmentGroup)
        : machines,
    [machines, stageEquipmentGroup]
  );

  // Overlap check
  const overlaps: OverlapConflict[] = useMemo(() => {
    if (!stage || !draftMachineId) return [];
    const start = new Date(draftStart);
    const end = new Date(draftEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
    return detectOverlaps(draftMachineId, start, end, stages, stage.id);
  }, [draftMachineId, draftStart, draftEnd, stages, stage]);

  // Chain siblings — other stages in the same batch chain
  const chainStages = useMemo(
    () =>
      stage
        ? stages
            .filter((s) => s.batchChainId === stage.batchChainId)
            .sort((a, b) => a.startDatetime.getTime() - b.startDatetime.getTime())
        : [],
    [stages, stage]
  );

  // Validation
  const startValid = !isNaN(draftStartDate.getTime());
  const endValid = !isNaN(draftEndDate.getTime());
  const dateOrderValid = startValid && endValid && draftStartDate <= draftEndDate;
  const canSave = startValid && endValid && dateOrderValid && draftMachineId;

  // Dirty check
  const isDirty = stage
    ? draftMachineId !== stage.machineId ||
      draftStart !== toDatetimeLocal(stage.startDatetime) ||
      draftEnd !== toDatetimeLocal(stage.endDatetime) ||
      draftState !== stage.state
    : false;

  // Is current draft state a custom (non-fixed) status?
  const isCustomState = !isFixedStatus(draftState);

  // Save
  function handleSave() {
    if (!stage || !canSave) return;
    if (isCustomState) {
      addRecentCustomStatus(draftState);
    }
    updateStage(stage.id, {
      machineId: draftMachineId,
      startDatetime: new Date(draftStart),
      endDatetime: new Date(draftEnd),
      state: draftState,
    });
    onClose();
  }

  // Delete
  function handleDelete() {
    if (!stage) return;
    deleteStage(stage.id);
    onClose();
  }

  // Select a fixed status
  function handleFixedStatusClick(value: StageState) {
    setDraftState(value);
    setShowCustomPopover(false);
  }

  // Apply custom status
  function handleApplyCustom(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    setDraftState(trimmed);
    setCustomLabel('');
    setShowCustomPopover(false);
  }

  // Keyboard navigation for status bar (arrow keys move focus between buttons)
  function handleStatusKeyDown(e: React.KeyboardEvent) {
    const bar = statusBarRef.current;
    if (!bar) return;
    const buttons = Array.from(bar.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const currentIndex = buttons.indexOf(e.target as HTMLButtonElement);
    if (currentIndex === -1) return;

    let nextIndex = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % buttons.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    }
    if (nextIndex >= 0) {
      buttons[nextIndex].focus();
    }
  }

  if (!stageId || !stage) return null;

  const recentCustomStatuses = getRecentCustomStatuses();

  return (
    <>
      {/* Backdrop */}
      <div className="pp-detail-backdrop" onClick={onClose} />

      {/* Panel */}
      <div className="pp-detail-panel">
        {/* Header */}
        <div className="pp-detail-header">
          <h3>Stage Details</h3>
          <button className="pp-detail-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="pp-detail-body">
          {/* ── Read-only info ────────────────────────────── */}
          <div className="pp-detail-section">
            <div className="pp-detail-field">
              <label>Batch Name</label>
              <span className="pp-detail-value">{batchChain?.batchName ?? '—'}</span>
            </div>
            <div className="pp-detail-field-row">
              <div className="pp-detail-field">
                <label>Series #</label>
                <span className="pp-detail-value">{batchChain?.seriesNumber ?? '—'}</span>
              </div>
              <div className="pp-detail-field">
                <label>Product Line</label>
                <span className="pp-detail-value">{productLine?.name ?? batchChain?.productLine ?? '—'}</span>
              </div>
            </div>
            <div className="pp-detail-field-row">
              <div className="pp-detail-field">
                <label>Stage Type</label>
                <span className="pp-detail-value">{stageTypeDef?.name ?? stage.stageType}</span>
              </div>
              <div className="pp-detail-field">
                <label>Equipment Group</label>
                <span className="pp-detail-value pp-detail-value-muted">{equipmentGroupName}</span>
              </div>
            </div>
          </div>

          {/* ── Editable fields ──────────────────────────── */}
          <div className="pp-detail-section">
            <div className="pp-detail-section-title">Assignment</div>

            <div className="pp-detail-field">
              <label htmlFor="dp-machine">Machine / Vessel</label>
              <select
                id="dp-machine"
                value={draftMachineId}
                onChange={(e) => setDraftMachineId(e.target.value)}
                className="pp-detail-input"
              >
                {availableMachines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
                {/* If current machine not in list, show it anyway */}
                {!availableMachines.find((m) => m.id === draftMachineId) && currentMachine && (
                  <option value={currentMachine.id}>{currentMachine.name} (other group)</option>
                )}
              </select>
            </div>

            {/* ── Segmented status bar ──────────────────── */}
            <div className="pp-detail-field">
              <label id="dp-state-label">State</label>
              <div
                className="pp-status-bar"
                role="radiogroup"
                aria-labelledby="dp-state-label"
                ref={statusBarRef}
                onKeyDown={handleStatusKeyDown}
              >
                {STATUS_OPTIONS.map((opt, idx) => {
                  const isSelected = draftState === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={opt.label}
                      tabIndex={isSelected || (idx === 0 && isCustomState) ? 0 : -1}
                      className={`pp-status-btn pp-status-btn-${opt.key}${isSelected ? ' pp-status-btn--selected' : ''}`}
                      onClick={() => handleFixedStatusClick(opt.value)}
                    >
                      {opt.icon}
                      <span>{opt.label}</span>
                    </button>
                  );
                })}

                {/* Custom "…" button */}
                <div className="pp-status-custom-wrapper">
                  <button
                    ref={customBtnRef}
                    type="button"
                    role="radio"
                    aria-checked={isCustomState}
                    aria-label={isCustomState ? `Custom status: ${draftState}` : 'Custom status'}
                    aria-expanded={showCustomPopover}
                    tabIndex={isCustomState ? 0 : -1}
                    className={`pp-status-btn pp-status-btn-custom${isCustomState ? ' pp-status-btn--selected' : ''}`}
                    onClick={() => setShowCustomPopover((prev) => !prev)}
                  >
                    <IconEllipsis />
                    <span>{isCustomState ? draftState : '…'}</span>
                  </button>

                  {showCustomPopover && (
                    <div
                      ref={popoverRef}
                      className="pp-status-popover"
                      role="dialog"
                      aria-label="Set custom status"
                    >
                      <div className="pp-status-popover-label">Custom status</div>
                      <input
                        ref={customInputRef}
                        type="text"
                        className="pp-status-popover-input"
                        placeholder="e.g. On Hold, Rework"
                        maxLength={24}
                        value={customLabel}
                        onChange={(e) => setCustomLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleApplyCustom(customLabel);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setShowCustomPopover(false);
                            customBtnRef.current?.focus();
                          }
                        }}
                      />

                      {recentCustomStatuses.length > 0 && (
                        <div className="pp-status-popover-recent">
                          <div className="pp-status-popover-recent-label">Recent</div>
                          {recentCustomStatuses.map((label) => (
                            <button
                              key={label}
                              type="button"
                              className="pp-status-popover-recent-item"
                              onClick={() => handleApplyCustom(label)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Show custom status badge when a non-fixed status is selected */}
              {isCustomState && !showCustomPopover && (
                <div className="pp-status-custom-label">
                  <IconEllipsis />
                  {draftState}
                </div>
              )}
            </div>
          </div>

          <div className="pp-detail-section">
            <div className="pp-detail-section-title">
              Timing
              <label className="pp-detail-toggle">
                <input
                  type="checkbox"
                  checked={fixedDuration}
                  onChange={(e) => setFixedDuration(e.target.checked)}
                />
                Fixed duration
              </label>
            </div>

            <div className="pp-detail-field">
              <label htmlFor="dp-start">Start</label>
              <input
                id="dp-start"
                type="datetime-local"
                value={draftStart}
                onChange={(e) => handleStartChange(e.target.value)}
                className="pp-detail-input"
              />
            </div>

            <div className="pp-detail-field">
              <label htmlFor="dp-end">End</label>
              <input
                id="dp-end"
                type="datetime-local"
                value={draftEnd}
                onChange={(e) => setDraftEnd(e.target.value)}
                disabled={fixedDuration}
                className={`pp-detail-input ${fixedDuration ? 'pp-detail-input-disabled' : ''}`}
              />
            </div>

            <div className="pp-detail-field">
              <label>Duration</label>
              <span className="pp-detail-value">
                {dateOrderValid ? formatDuration(durationHours) : '—'}
                {dateOrderValid && ` (${durationHours}h)`}
              </span>
            </div>

            {!dateOrderValid && startValid && endValid && (
              <div className="pp-detail-warning">Start must be before or equal to end.</div>
            )}
          </div>

          {/* ── Overlap warnings ─────────────────────────── */}
          {overlaps.length > 0 && (
            <div className="pp-detail-overlap-warning">
              <strong>⚠ Overlap detected</strong>
              {overlaps.map((o, i) => {
                const conflictMachine = machines.find((m) => m.id === o.machineId);
                return (
                  <div key={i} className="pp-detail-overlap-item">
                    {conflictMachine?.name ?? o.machineId}: {o.overlapHours}h overlap
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Batch chain stages ───────────────────────── */}
          {chainStages.length > 1 && (
            <div className="pp-detail-section">
              <div className="pp-detail-section-title">
                Batch Chain Stages
                {onEditChain && stage.batchChainId && (
                  <button
                    className="pp-detail-edit-chain-btn"
                    onClick={() => { onEditChain(stage.batchChainId); onClose(); }}
                  >
                    Edit Full Chain
                  </button>
                )}
              </div>
              {batchChain && (
                <div className="pp-link-row">
                  <div className="pp-link-row-label">
                    <svg className="pp-link-row-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M4 3v6a4 4 0 008 0V3"/>
                      <line x1="2" y1="9" x2="6" y2="9"/>
                      <line x1="10" y1="9" x2="14" y2="9"/>
                    </svg>
                    Link to next stage
                  </div>
                  <label className="pp-link-toggle">
                    <input
                      type="checkbox"
                      checked={batchChain.linkToNext ?? true}
                      onChange={(e) =>
                        updateBatchChain(batchChain.id, { linkToNext: e.target.checked })
                      }
                    />
                    <span className="pp-link-toggle-slider" />
                  </label>
                </div>
              )}
              <div className="pp-detail-chain-list">
                {chainStages.map((cs) => {
                  const csMachine = machines.find((m) => m.id === cs.machineId);
                  const csTypeDef = stageTypeDefinitions.find((st) => st.id === cs.stageType);
                  const isCurrentStage = cs.id === stage.id;
                  return (
                    <div
                      key={cs.id}
                      className={`pp-detail-chain-item ${isCurrentStage ? 'pp-detail-chain-item-active' : ''}`}
                    >
                      <span className="pp-detail-chain-type">
                        {csTypeDef?.shortName ?? cs.stageType}
                      </span>
                      <span className="pp-detail-chain-machine">
                        {csMachine?.name ?? cs.machineId}
                      </span>
                      <span className="pp-detail-chain-dates">
                        {format(cs.startDatetime, 'MMM d HH:mm')} → {format(cs.endDatetime, 'MMM d HH:mm')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="pp-detail-footer">
          {!showConfirmDelete ? (
            <>
              <button
                className="pp-detail-btn pp-detail-btn-delete"
                onClick={() => setShowConfirmDelete(true)}
              >
                Delete
              </button>
              <div className="pp-detail-footer-spacer" />
              <button className="pp-detail-btn pp-detail-btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                className="pp-detail-btn pp-detail-btn-save"
                onClick={handleSave}
                disabled={!canSave || !isDirty}
              >
                Save
              </button>
            </>
          ) : (
            <>
              <span className="pp-detail-confirm-text">Delete this stage?</span>
              <div className="pp-detail-footer-spacer" />
              <button
                className="pp-detail-btn pp-detail-btn-cancel"
                onClick={() => setShowConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                className="pp-detail-btn pp-detail-btn-delete"
                onClick={handleDelete}
              >
                Confirm Delete
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
