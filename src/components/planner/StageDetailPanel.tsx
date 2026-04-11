'use client';

// StageDetailPanel — Side panel for viewing and editing a single stage
// Ported from VBA: ObdelavaSerija form (Edit Series form in FormaZaPlan)
//
// Opens when user clicks a batch bar on the Planner timeline canvas.
// Read-only fields: batch name, series number, product line, stage type.
// Editable fields: machine (vessel), start/end datetime, stage state.
// Edit modes: fixed duration (default), free duration.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { usePlantPulseStore } from '@/lib/store';
import { differenceInHours, addHours, format } from 'date-fns';
import { detectOverlaps } from '@/lib/scheduling';
import type { OverlapConflict } from '@/lib/scheduling';

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
  const [draftState, setDraftState] = useState<'planned' | 'active' | 'completed'>('planned');
  const [fixedDuration, setFixedDuration] = useState(true);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Reset draft when stage changes
  useEffect(() => {
    if (stage) {
      setDraftMachineId(stage.machineId);
      setDraftStart(toDatetimeLocal(stage.startDatetime));
      setDraftEnd(toDatetimeLocal(stage.endDatetime));
      setDraftState(stage.state);
      setShowConfirmDelete(false);
    }
  }, [stage]);

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

  // Save
  function handleSave() {
    if (!stage || !canSave) return;
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

  if (!stageId || !stage) return null;

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

            <div className="pp-detail-field">
              <label htmlFor="dp-state">State</label>
              <select
                id="dp-state"
                value={draftState}
                onChange={(e) => setDraftState(e.target.value as 'planned' | 'active' | 'completed')}
                className="pp-detail-input"
              >
                <option value="planned">Planned</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
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
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {batchChain && (
                    <label className="pp-detail-toggle">
                      <input
                        type="checkbox"
                        checked={batchChain.linkToNext ?? false}
                        onChange={(e) =>
                          updateBatchChain(batchChain.id, { linkToNext: e.target.checked })
                        }
                      />
                      Link to next
                    </label>
                  )}
                  {onEditChain && stage.batchChainId && (
                    <button
                      className="pp-detail-edit-chain-btn"
                      onClick={() => { onEditChain(stage.batchChainId); onClose(); }}
                    >
                      Edit Full Chain
                    </button>
                  )}
                </div>
              </div>
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
