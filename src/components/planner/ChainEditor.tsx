'use client';

// ChainEditor — Full batch chain editor modal
// Ported from VBA: ObdelavaSerija form (Edit Series) — up to 8 stages per series,
// with fixed duration and link-to-next editing modes.
//
// Opens from StageDetailPanel's "Edit Full Chain" button.
// Shows all stages in a batch chain simultaneously for batch-level editing.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { usePlantPulseStore } from '@/lib/store';
import { differenceInHours, addHours, format } from 'date-fns';
import { detectOverlaps } from '@/lib/scheduling';
import type { OverlapConflict } from '@/lib/scheduling';
import type { Stage, StageState, BatchStatus } from '@/lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDuration(hours: number): string {
  const d = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  if (d === 0) return `${h}h`;
  if (h === 0) return `${d}d`;
  return `${d}d ${h}h`;
}

function toDatetimeLocal(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

// ─── Draft stage type ─────────────────────────────────────────────────────

interface DraftStage {
  id: string;
  stageType: string;
  machineId: string;
  startDatetime: string;
  endDatetime: string;
  state: StageState;
  durationHours: number;
  isDeleted: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────

interface ChainEditorProps {
  open: boolean;
  batchChainId: string | null;
  onClose: () => void;
}

export default function ChainEditor({ open, batchChainId, onClose }: ChainEditorProps) {
  const stages = usePlantPulseStore((s) => s.stages);
  const batchChains = usePlantPulseStore((s) => s.batchChains);
  const machines = usePlantPulseStore((s) => s.machines);
  const productLines = usePlantPulseStore((s) => s.productLines);
  const stageTypeDefinitions = usePlantPulseStore((s) => s.stageTypeDefinitions);
  const equipmentGroups = usePlantPulseStore((s) => s.equipmentGroups);
  const updateStage = usePlantPulseStore((s) => s.updateStage);
  const deleteStage = usePlantPulseStore((s) => s.deleteStage);
  const updateBatchChain = usePlantPulseStore((s) => s.updateBatchChain);
  const deleteBatchChain = usePlantPulseStore((s) => s.deleteBatchChain);

  // Find batch chain
  const batchChain = useMemo(
    () => batchChains.find((bc) => bc.id === batchChainId) ?? null,
    [batchChains, batchChainId]
  );

  const productLine = useMemo(
    () => productLines.find((pl) => pl.id === batchChain?.productLine) ?? null,
    [productLines, batchChain]
  );

  // Chain stages from store (sorted by start time)
  const chainStages = useMemo(
    () =>
      batchChainId
        ? stages
            .filter((s) => s.batchChainId === batchChainId)
            .sort((a, b) => a.startDatetime.getTime() - b.startDatetime.getTime())
        : [],
    [stages, batchChainId]
  );

  // Draft state
  const [draftStages, setDraftStages] = useState<DraftStage[]>([]);
  const [draftBatchName, setDraftBatchName] = useState('');
  const [draftStatus, setDraftStatus] = useState<BatchStatus>('draft');
  const [fixedDuration, setFixedDuration] = useState(true);
  const [linkToNext, setLinkToNext] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Initialize draft when opening or chain changes
  useEffect(() => {
    if (open && batchChain && chainStages.length > 0) {
      setDraftStages(
        chainStages.map((s) => ({
          id: s.id,
          stageType: s.stageType,
          machineId: s.machineId,
          startDatetime: toDatetimeLocal(s.startDatetime),
          endDatetime: toDatetimeLocal(s.endDatetime),
          state: s.state,
          durationHours: differenceInHours(s.endDatetime, s.startDatetime),
          isDeleted: false,
        }))
      );
      setDraftBatchName(batchChain.batchName);
      setDraftStatus(batchChain.status);
      setLinkToNext(batchChain.linkToNext ?? false);
      setShowConfirmDelete(false);
    }
  }, [open, batchChain, chainStages]);

  // Visible (non-deleted) drafts
  const visibleDrafts = useMemo(
    () => draftStages.filter((d) => !d.isDeleted),
    [draftStages]
  );

  // ── Stage editing handlers ────────────────────────────────────────

  const updateDraftStage = useCallback(
    (index: number, updates: Partial<DraftStage>) => {
      setDraftStages((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...updates };
        return next;
      });
    },
    []
  );

  const handleStageStartChange = useCallback(
    (stageIndex: number, value: string) => {
      setDraftStages((prev) => {
        const next = [...prev];
        next[stageIndex] = { ...next[stageIndex], startDatetime: value };

        if (fixedDuration) {
          const newStart = new Date(value);
          if (!isNaN(newStart.getTime())) {
            const newEnd = addHours(newStart, next[stageIndex].durationHours);
            next[stageIndex].endDatetime = toDatetimeLocal(newEnd);

            // Link to next: cascade forward
            if (linkToNext) {
              for (let j = stageIndex + 1; j < next.length; j++) {
                if (next[j].isDeleted) continue;
                const prevEnd = new Date(next[j - 1].endDatetime);
                next[j].startDatetime = toDatetimeLocal(prevEnd);
                if (fixedDuration) {
                  next[j].endDatetime = toDatetimeLocal(addHours(prevEnd, next[j].durationHours));
                }
              }
            }
          }
        }
        return next;
      });
    },
    [fixedDuration, linkToNext]
  );

  const handleStageEndChange = useCallback(
    (stageIndex: number, value: string) => {
      setDraftStages((prev) => {
        const next = [...prev];
        next[stageIndex] = { ...next[stageIndex], endDatetime: value };

        // Link to next: cascade forward
        if (linkToNext) {
          for (let j = stageIndex + 1; j < next.length; j++) {
            if (next[j].isDeleted) continue;
            const prevEnd = new Date(next[j - 1].endDatetime);
            next[j].startDatetime = toDatetimeLocal(prevEnd);
            if (fixedDuration) {
              next[j].endDatetime = toDatetimeLocal(addHours(prevEnd, next[j].durationHours));
            }
          }
        }
        return next;
      });
    },
    [fixedDuration, linkToNext]
  );

  const handleDeleteStage = useCallback(
    (stageIndex: number) => {
      setDraftStages((prev) => {
        const next = [...prev];
        next[stageIndex] = { ...next[stageIndex], isDeleted: true };
        return next;
      });
    },
    []
  );

  const handleRestoreStage = useCallback(
    (stageIndex: number) => {
      setDraftStages((prev) => {
        const next = [...prev];
        next[stageIndex] = { ...next[stageIndex], isDeleted: false };
        return next;
      });
    },
    []
  );

  // ── Overlap detection ─────────────────────────────────────────────

  const allOverlaps = useMemo(() => {
    const results: Map<string, OverlapConflict[]> = new Map();
    for (const draft of draftStages) {
      if (draft.isDeleted) continue;
      const start = new Date(draft.startDatetime);
      const end = new Date(draft.endDatetime);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;

      // Exclude all stages in this chain from existing stages
      const chainStageIds = new Set(chainStages.map((s) => s.id));
      const otherStages = stages.filter((s) => !chainStageIds.has(s.id));
      const conflicts = detectOverlaps(draft.machineId, start, end, otherStages);
      if (conflicts.length > 0) {
        results.set(draft.id, conflicts);
      }
    }
    return results;
  }, [draftStages, stages, chainStages]);

  // ── Machine dropdown helpers ──────────────────────────────────────

  const getMachinesForStage = useCallback(
    (stageType: string): typeof machines => {
      if (!productLine) return machines;
      const stageDefault = productLine.stageDefaults.find(
        (sd) => sd.stageType === stageType
      );
      if (!stageDefault) return machines;
      return machines.filter((m) => m.group === stageDefault.machineGroup);
    },
    [machines, productLine]
  );

  // ── Dirty check ───────────────────────────────────────────────────

  const isDirty = useMemo(() => {
    if (!batchChain) return false;
    if (draftBatchName !== batchChain.batchName) return true;
    if (draftStatus !== batchChain.status) return true;
    for (const draft of draftStages) {
      if (draft.isDeleted) return true;
      const original = chainStages.find((s) => s.id === draft.id);
      if (!original) continue;
      if (draft.machineId !== original.machineId) return true;
      if (draft.startDatetime !== toDatetimeLocal(original.startDatetime)) return true;
      if (draft.endDatetime !== toDatetimeLocal(original.endDatetime)) return true;
      if (draft.state !== original.state) return true;
    }
    return false;
  }, [draftStages, draftBatchName, draftStatus, batchChain, chainStages]);

  // ── Save ──────────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    if (!batchChainId || !batchChain) return;

    // Update batch chain
    if (draftBatchName !== batchChain.batchName || draftStatus !== batchChain.status) {
      updateBatchChain(batchChainId, {
        batchName: draftBatchName,
        status: draftStatus,
      });
    }

    // Update/delete stages
    for (const draft of draftStages) {
      if (draft.isDeleted) {
        deleteStage(draft.id);
        continue;
      }
      const original = chainStages.find((s) => s.id === draft.id);
      if (!original) continue;

      const startDate = new Date(draft.startDatetime);
      const endDate = new Date(draft.endDatetime);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue;

      const changed =
        draft.machineId !== original.machineId ||
        draft.startDatetime !== toDatetimeLocal(original.startDatetime) ||
        draft.endDatetime !== toDatetimeLocal(original.endDatetime) ||
        draft.state !== original.state;

      if (changed) {
        updateStage(draft.id, {
          machineId: draft.machineId,
          startDatetime: startDate,
          endDatetime: endDate,
          state: draft.state,
        });
      }
    }

    onClose();
  }, [batchChainId, batchChain, draftStages, draftBatchName, draftStatus, chainStages, updateStage, deleteStage, updateBatchChain, onClose]);

  // ── Delete chain ──────────────────────────────────────────────────

  const handleDeleteChain = useCallback(() => {
    if (!batchChainId) return;
    deleteBatchChain(batchChainId);
    onClose();
  }, [batchChainId, deleteBatchChain, onClose]);

  if (!open || !batchChainId || !batchChain) return null;

  return (
    <div className="pp-modal-backdrop" onClick={onClose}>
      <div className="pp-modal pp-modal-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="pp-modal-header">
          <h3>Chain Editor</h3>
          <button className="pp-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="pp-modal-body" style={{ padding: '16px 20px' }}>
          {/* Chain info */}
          <div className="pp-chain-editor-info">
            <div className="pp-chain-editor-field">
              <label>Batch Name</label>
              <input
                type="text"
                value={draftBatchName}
                onChange={(e) => setDraftBatchName(e.target.value)}
                className="pp-detail-input"
                style={{ width: '140px' }}
              />
            </div>
            <div className="pp-chain-editor-field">
              <label>Series #</label>
              <span className="pp-detail-value">{batchChain.seriesNumber}</span>
            </div>
            <div className="pp-chain-editor-field">
              <label>Product Line</label>
              <span className="pp-detail-value">{productLine?.name ?? batchChain.productLine}</span>
            </div>
            <div className="pp-chain-editor-field">
              <label>Status</label>
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value as BatchStatus)}
                className="pp-detail-input"
                style={{ width: '120px' }}
              >
                <option value="draft">Draft</option>
                <option value="proposed">Proposed</option>
                <option value="committed">Committed</option>
              </select>
            </div>
          </div>

          {/* Edit modes */}
          <div className="pp-chain-editor-modes">
            <label className="pp-detail-toggle">
              <input
                type="checkbox"
                checked={fixedDuration}
                onChange={(e) => setFixedDuration(e.target.checked)}
              />
              Fixed duration
            </label>
            <label className="pp-detail-toggle">
              <input
                type="checkbox"
                checked={linkToNext}
                onChange={(e) => {
                  setLinkToNext(e.target.checked);
                  if (batchChainId) updateBatchChain(batchChainId, { linkToNext: e.target.checked });
                }}
              />
              Link to next
            </label>
          </div>

          {/* Stage list */}
          <div className="pp-chain-editor-stages">
            {/* Header row */}
            <div className="pp-chain-editor-row pp-chain-editor-row-header">
              <span className="pp-chain-editor-col-idx">#</span>
              <span className="pp-chain-editor-col-type">Type</span>
              <span className="pp-chain-editor-col-machine">Machine</span>
              <span className="pp-chain-editor-col-start">Start</span>
              <span className="pp-chain-editor-col-end">End</span>
              <span className="pp-chain-editor-col-dur">Duration</span>
              <span className="pp-chain-editor-col-actions" />
            </div>

            {draftStages.map((draft, i) => {
              const stageTypeDef = stageTypeDefinitions.find((st) => st.id === draft.stageType);
              const availableMachines = getMachinesForStage(draft.stageType);
              const startDate = new Date(draft.startDatetime);
              const endDate = new Date(draft.endDatetime);
              const dur = !isNaN(startDate.getTime()) && !isNaN(endDate.getTime())
                ? differenceInHours(endDate, startDate)
                : 0;
              const stageOverlaps = allOverlaps.get(draft.id) ?? [];

              return (
                <div
                  key={draft.id}
                  className={`pp-chain-editor-row${draft.isDeleted ? ' pp-chain-editor-row-deleted' : ''}${stageOverlaps.length > 0 ? ' pp-chain-editor-row-warning' : ''}`}
                >
                  <span className="pp-chain-editor-col-idx">{i + 1}</span>
                  <span className="pp-chain-editor-col-type" title={stageTypeDef?.name}>
                    {stageTypeDef?.shortName ?? draft.stageType}
                  </span>
                  <span className="pp-chain-editor-col-machine">
                    <select
                      value={draft.machineId}
                      onChange={(e) => updateDraftStage(i, { machineId: e.target.value })}
                      className="pp-detail-input"
                      disabled={draft.isDeleted}
                    >
                      {availableMachines.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                      {!availableMachines.find((m) => m.id === draft.machineId) && (
                        <option value={draft.machineId}>
                          {machines.find((m) => m.id === draft.machineId)?.name ?? draft.machineId}
                        </option>
                      )}
                    </select>
                  </span>
                  <span className="pp-chain-editor-col-start">
                    <input
                      type="datetime-local"
                      value={draft.startDatetime}
                      onChange={(e) => handleStageStartChange(i, e.target.value)}
                      className="pp-detail-input"
                      disabled={draft.isDeleted}
                    />
                  </span>
                  <span className="pp-chain-editor-col-end">
                    <input
                      type="datetime-local"
                      value={draft.endDatetime}
                      onChange={(e) => handleStageEndChange(i, e.target.value)}
                      className="pp-detail-input"
                      disabled={fixedDuration || draft.isDeleted}
                    />
                  </span>
                  <span className="pp-chain-editor-col-dur">
                    {dur > 0 ? formatDuration(dur) : '—'}
                  </span>
                  <span className="pp-chain-editor-col-actions">
                    {draft.isDeleted ? (
                      <button
                        className="pp-chain-editor-restore-btn"
                        onClick={() => handleRestoreStage(i)}
                        title="Restore"
                      >
                        ↩
                      </button>
                    ) : (
                      <button
                        className="pp-chain-editor-delete-btn"
                        onClick={() => handleDeleteStage(i)}
                        title="Remove stage"
                        disabled={visibleDrafts.length <= 1}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Overlap warnings */}
          {allOverlaps.size > 0 && (
            <div className="pp-chain-editor-warnings">
              <strong>⚠ Overlap warnings</strong>
              {Array.from(allOverlaps.entries()).map(([stageId, conflicts]) => {
                const draft = draftStages.find((d) => d.id === stageId);
                const stageTypeDef = stageTypeDefinitions.find((st) => st.id === draft?.stageType);
                const machineName = machines.find((m) => m.id === draft?.machineId)?.name ?? '';
                return conflicts.map((c, ci) => (
                  <div key={`${stageId}-${ci}`} className="pp-chain-editor-warning-item">
                    {stageTypeDef?.shortName ?? draft?.stageType} on {machineName}: {c.overlapHours}h overlap
                  </div>
                ));
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pp-modal-footer">
          {!showConfirmDelete ? (
            <>
              <button
                className="pp-modal-btn"
                style={{ color: '#dc2626' }}
                onClick={() => setShowConfirmDelete(true)}
              >
                Delete Chain
              </button>
              <div style={{ flex: 1 }} />
              <button className="pp-modal-btn" onClick={onClose}>Cancel</button>
              <button
                className="pp-modal-btn pp-modal-btn-primary"
                onClick={handleSave}
                disabled={!isDirty}
              >
                Save
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: '13px', color: '#dc2626' }}>
                Delete this chain and all {chainStages.length} stages?
              </span>
              <div style={{ flex: 1 }} />
              <button
                className="pp-modal-btn"
                onClick={() => setShowConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                className="pp-modal-btn"
                style={{ color: '#fff', background: '#dc2626' }}
                onClick={handleDeleteChain}
              >
                Confirm Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
