'use client';

// BulkShiftTool — Bulk time-shift for batch stages
// Ported from VBA: Premik (bulk shift form in FormaZaPlan)
//
// Inputs: cutoff date, min series number, hour delta (+/-)
// Validates overlaps before applying, then calls bulkShiftStages() store action.

import { useState, useMemo, useCallback } from 'react';
import { usePlantPulseStore } from '@/lib/store';
import { selectStagesForBulkShift, validateBulkShift } from '@/lib/scheduling';
import type { BulkShiftConflict } from '@/lib/scheduling';
import { format, startOfDay } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────────────────

function toDateLocal(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

// ─── Component ────────────────────────────────────────────────────────────

interface BulkShiftToolProps {
  open: boolean;
  onClose: () => void;
}

type ShiftStep = 'configure' | 'preview';

export default function BulkShiftTool({ open, onClose }: BulkShiftToolProps) {
  const stages = usePlantPulseStore((s) => s.stages);
  const batchChains = usePlantPulseStore((s) => s.batchChains);
  const machines = usePlantPulseStore((s) => s.machines);
  const bulkShiftStages = usePlantPulseStore((s) => s.bulkShiftStages);

  // ── Configure state ──
  const [step, setStep] = useState<ShiftStep>('configure');
  const [cutoffDate, setCutoffDate] = useState(() => toDateLocal(new Date()));
  const [minSeries, setMinSeries] = useState(1);
  const [deltaHours, setDeltaHours] = useState(0);

  // ── Preview state ──
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [conflicts, setConflicts] = useState<BulkShiftConflict[]>([]);

  // Build batchChainId → seriesNumber map
  const batchChainMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of batchChains) {
      map.set(c.id, c.seriesNumber);
    }
    return map;
  }, [batchChains]);

  // Build batchChainId → batchName map
  const batchNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of batchChains) {
      map.set(c.id, c.batchName);
    }
    return map;
  }, [batchChains]);

  // Machine name lookup
  const machineNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of machines) {
      map.set(m.id, m.name);
    }
    return map;
  }, [machines]);

  const handlePreview = useCallback(() => {
    const cutoff = startOfDay(new Date(cutoffDate));
    if (isNaN(cutoff.getTime()) || deltaHours === 0) return;

    const ids = selectStagesForBulkShift(minSeries, cutoff, stages, batchChainMap);
    const warns = validateBulkShift(ids, deltaHours, stages);

    setMatchedIds(ids);
    setConflicts(warns);
    setStep('preview');
  }, [cutoffDate, minSeries, deltaHours, stages, batchChainMap]);

  const handleApply = useCallback(() => {
    if (matchedIds.length === 0) return;
    bulkShiftStages(matchedIds, deltaHours);
    handleClose();
  }, [matchedIds, deltaHours, bulkShiftStages]);

  const handleClose = useCallback(() => {
    setStep('configure');
    setCutoffDate(toDateLocal(new Date()));
    setMinSeries(1);
    setDeltaHours(0);
    setMatchedIds([]);
    setConflicts([]);
    onClose();
  }, [onClose]);

  const handleBack = useCallback(() => {
    setStep('configure');
    setMatchedIds([]);
    setConflicts([]);
  }, []);

  // Matched stages details for preview
  const matchedStages = useMemo(() => {
    const idSet = new Set(matchedIds);
    return stages.filter((s) => idSet.has(s.id));
  }, [stages, matchedIds]);

  if (!open) return null;

  return (
    <div className="pp-modal-backdrop" onClick={handleClose}>
      <div className="pp-modal pp-wizard-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="pp-modal-header">
          <h2>Bulk Shift</h2>
          <button className="pp-modal-close" onClick={handleClose}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="pp-modal-body">
          {step === 'configure' && (
            <div className="pp-wizard-step">
              <p className="pp-bulk-desc">
                Shift all stages matching the filter by the specified hours.
                Positive values shift forward, negative shift backward.
              </p>

              <div className="pp-wizard-field">
                <label htmlFor="bs-cutoff">Cutoff Date</label>
                <input
                  id="bs-cutoff"
                  type="date"
                  value={cutoffDate}
                  onChange={(e) => setCutoffDate(e.target.value)}
                  className="pp-detail-input"
                />
                <span className="pp-bulk-hint">Only stages starting after this date</span>
              </div>

              <div className="pp-bulk-row">
                <div className="pp-wizard-field">
                  <label htmlFor="bs-series">Min Series #</label>
                  <input
                    id="bs-series"
                    type="number"
                    min={1}
                    value={minSeries}
                    onChange={(e) => setMinSeries(Math.max(1, parseInt(e.target.value) || 1))}
                    className="pp-detail-input"
                  />
                </div>

                <div className="pp-wizard-field">
                  <label htmlFor="bs-delta">Shift (hours)</label>
                  <input
                    id="bs-delta"
                    type="number"
                    value={deltaHours}
                    onChange={(e) => setDeltaHours(parseInt(e.target.value) || 0)}
                    className="pp-detail-input"
                  />
                </div>
              </div>

              {deltaHours !== 0 && (
                <div className="pp-bulk-direction">
                  {deltaHours > 0
                    ? `→ Shift forward by ${deltaHours}h`
                    : `← Shift backward by ${Math.abs(deltaHours)}h`}
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="pp-wizard-step">
              <div className="pp-bulk-summary">
                <strong>{matchedIds.length}</strong> stage{matchedIds.length !== 1 ? 's' : ''} matched
                {deltaHours > 0 ? ` — shifting forward ${deltaHours}h` : ` — shifting backward ${Math.abs(deltaHours)}h`}
              </div>

              {matchedIds.length === 0 && (
                <div className="pp-bulk-empty">
                  No stages match the filter criteria. Adjust the cutoff date or series number.
                </div>
              )}

              {/* Conflict warnings */}
              {conflicts.length > 0 && (
                <div className="pp-detail-overlap-warning">
                  <strong>⚠ {conflicts.length} overlap{conflicts.length > 1 ? 's' : ''} after shift</strong>
                  {conflicts.slice(0, 8).map((c, i) => (
                    <div key={i} className="pp-detail-overlap-item">
                      {machineNameMap.get(c.machineId) ?? c.machineId}: {c.overlapHours}h overlap
                    </div>
                  ))}
                  {conflicts.length > 8 && (
                    <div className="pp-detail-overlap-item">
                      ...and {conflicts.length - 8} more
                    </div>
                  )}
                </div>
              )}

              {/* Matched stages list */}
              {matchedStages.length > 0 && (
                <div className="pp-wizard-table">
                  <div className="pp-wizard-table-header">
                    <span className="pp-wizard-col-machine">Vessel</span>
                    <span className="pp-wizard-col-type">Batch</span>
                    <span className="pp-wizard-col-time">Current Start</span>
                    <span className="pp-wizard-col-time">New Start</span>
                  </div>
                  {matchedStages.slice(0, 20).map((s) => {
                    const newStart = new Date(s.startDatetime.getTime() + deltaHours * 3600000);
                    return (
                      <div key={s.id} className="pp-wizard-table-row">
                        <span className="pp-wizard-col-machine">
                          {machineNameMap.get(s.machineId) ?? s.machineId}
                        </span>
                        <span className="pp-wizard-col-type">
                          {batchNameMap.get(s.batchChainId) ?? '—'}
                        </span>
                        <span className="pp-wizard-col-time">
                          {format(s.startDatetime, 'MMM d HH:mm')}
                        </span>
                        <span className="pp-wizard-col-time">
                          {format(newStart, 'MMM d HH:mm')}
                        </span>
                      </div>
                    );
                  })}
                  {matchedStages.length > 20 && (
                    <div className="pp-wizard-table-row" style={{ justifyContent: 'center', color: 'var(--pp-muted)' }}>
                      ...and {matchedStages.length - 20} more stages
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pp-modal-footer pp-wizard-footer">
          {step === 'configure' ? (
            <>
              <button className="pp-detail-btn pp-detail-btn-cancel" onClick={handleClose}>
                Cancel
              </button>
              <button
                className="pp-detail-btn pp-detail-btn-save"
                onClick={handlePreview}
                disabled={deltaHours === 0}
              >
                Preview &rarr;
              </button>
            </>
          ) : (
            <>
              <button className="pp-detail-btn pp-detail-btn-cancel" onClick={handleBack}>
                &larr; Back
              </button>
              <div className="pp-detail-footer-spacer" />
              <button className="pp-detail-btn pp-detail-btn-cancel" onClick={handleClose}>
                Cancel
              </button>
              <button
                className="pp-detail-btn pp-detail-btn-save"
                onClick={handleApply}
                disabled={matchedIds.length === 0}
              >
                Apply Shift
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
