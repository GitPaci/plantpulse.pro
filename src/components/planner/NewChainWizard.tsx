'use client';

// NewChainWizard — Guided batch chain creation wizard
// Ported from VBA: NovaSer form in FormaZaPlan
//
// Flow: Select product line → Pick fermenter + start time (or auto-find)
// → Back-calculate seed train → Preview with overlap warnings → Confirm

import { useState, useMemo, useCallback, useEffect } from 'react';
import { usePlantPulseStore, generateId } from '@/lib/store';
import { backCalculateChain, chainDurationHours } from '@/lib/seed-train';
import { autoScheduleChain, earliestAvailableTime } from '@/lib/scheduling';
import type { ChainAssignment } from '@/lib/scheduling';
import { batchNamePreview } from '@/lib/types';
import type { BatchNamingRule, ProductLine } from '@/lib/types';
import { format, addHours, startOfHour } from 'date-fns';

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

/** Get the next series number based on existing batch chains for a product line. */
function nextSeriesNumber(
  existingChains: { productLine: string; seriesNumber: number }[],
  productLineId: string
): number {
  let max = 0;
  for (const c of existingChains) {
    if (c.productLine === productLineId && c.seriesNumber > max) {
      max = c.seriesNumber;
    }
  }
  return max + 1;
}

// ─── Component ────────────────────────────────────────────────────────────

interface NewChainWizardProps {
  open: boolean;
  onClose: () => void;
}

type WizardStep = 'select' | 'preview';

export default function NewChainWizard({ open, onClose }: NewChainWizardProps) {
  const productLines = usePlantPulseStore((s) => s.productLines);
  const machines = usePlantPulseStore((s) => s.machines);
  const stages = usePlantPulseStore((s) => s.stages);
  const batchChains = usePlantPulseStore((s) => s.batchChains);
  const turnaroundActivities = usePlantPulseStore((s) => s.turnaroundActivities);
  const stageTypeDefinitions = usePlantPulseStore((s) => s.stageTypeDefinitions);
  const batchNamingConfig = usePlantPulseStore((s) => s.batchNamingConfig);
  const addBatchChain = usePlantPulseStore((s) => s.addBatchChain);
  const addStage = usePlantPulseStore((s) => s.addStage);

  // ── Step 1 state: product line, fermenter, start time ──
  const [step, setStep] = useState<WizardStep>('select');
  const [selectedProductLine, setSelectedProductLine] = useState('');
  const [selectedFermenter, setSelectedFermenter] = useState('auto');
  const [startTime, setStartTime] = useState(() =>
    toDatetimeLocal(addHours(startOfHour(new Date()), 12))
  );

  // ── Step 2 state: preview assignments ──
  const [assignments, setAssignments] = useState<ChainAssignment[]>([]);

  // ── Derived data ──
  const productLine: ProductLine | undefined = useMemo(
    () => productLines.find((pl) => pl.id === selectedProductLine),
    [productLines, selectedProductLine]
  );

  // Fermenter machines for the selected product line
  const fermenterMachines = useMemo(() => {
    if (!productLine) return [];
    const lastStage = productLine.stageDefaults[productLine.stageDefaults.length - 1];
    if (!lastStage) return [];
    return machines.filter(
      (m) =>
        m.group === lastStage.machineGroup &&
        (!m.productLine || m.productLine === productLine.id)
    );
  }, [machines, productLine]);

  // Suggested start time: earliest available slot across fermenter candidates,
  // accounting for turnaround gap (CIP, SIP, Cleaning, etc.)
  const suggestedStart = useMemo(() => {
    if (!productLine || fermenterMachines.length === 0) return null;
    const lastStage = productLine.stageDefaults[productLine.stageDefaults.length - 1];
    if (!lastStage) return null;

    if (selectedFermenter !== 'auto') {
      // Specific fermenter selected — find its earliest slot
      const m = fermenterMachines.find((fm) => fm.id === selectedFermenter);
      if (!m) return null;
      return earliestAvailableTime(m.id, m.group, stages, turnaroundActivities);
    }

    // Auto mode: find the earliest across all fermenters
    let earliest: Date | null = null;
    for (const m of fermenterMachines) {
      const t = earliestAvailableTime(m.id, m.group, stages, turnaroundActivities);
      if (!earliest || t < earliest) earliest = t;
    }
    return earliest;
  }, [productLine, fermenterMachines, selectedFermenter, stages, turnaroundActivities]);

  // Auto-populate start time when product line or fermenter changes
  useEffect(() => {
    if (suggestedStart) {
      setStartTime(toDatetimeLocal(suggestedStart));
    }
  }, [suggestedStart]);

  // Next series number & batch name preview
  const seriesNum = useMemo(
    () => nextSeriesNumber(batchChains, selectedProductLine),
    [batchChains, selectedProductLine]
  );

  const batchName = useMemo(() => {
    if (!selectedProductLine) return '';
    const rule: BatchNamingRule =
      batchNamingConfig.mode === 'per_product_line'
        ? batchNamingConfig.productLineRules[selectedProductLine] ?? batchNamingConfig.sharedRule
        : batchNamingConfig.sharedRule;
    return batchNamePreview(rule, seriesNum);
  }, [selectedProductLine, seriesNum, batchNamingConfig]);

  // Total overlap count
  const totalOverlaps = useMemo(
    () => assignments.reduce((sum, a) => sum + a.overlaps.length, 0),
    [assignments]
  );

  const hasUnassigned = useMemo(
    () => assignments.some((a) => !a.machineId),
    [assignments]
  );

  // ── Actions ──

  const handleCalculate = useCallback(() => {
    if (!productLine || !productLine.stageDefaults.length) return;

    const fermStart = new Date(startTime);
    if (isNaN(fermStart.getTime())) return;

    // Back-calculate the chain
    const backCalc = backCalculateChain(fermStart, productLine.stageDefaults);

    // Auto-schedule: assign vessels
    const fermId = selectedFermenter === 'auto' ? undefined : selectedFermenter;
    const result = autoScheduleChain(
      backCalc,
      productLine.id,
      fermId,
      machines,
      stages,
      turnaroundActivities
    );

    setAssignments(result);
    setStep('preview');
  }, [productLine, startTime, selectedFermenter, machines, stages, turnaroundActivities]);

  const handleCreate = useCallback(() => {
    if (!productLine || assignments.length === 0) return;

    const chainId = generateId('chain-');
    addBatchChain({
      id: chainId,
      batchName,
      seriesNumber: seriesNum,
      productLine: productLine.id,
      status: 'draft',
    });

    for (const a of assignments) {
      addStage({
        id: generateId('stage-'),
        machineId: a.machineId,
        batchChainId: chainId,
        stageType: a.stageType,
        startDatetime: a.startDatetime,
        endDatetime: a.endDatetime,
        state: 'planned',
      });
    }

    handleClose();
  }, [productLine, assignments, batchName, seriesNum, addBatchChain, addStage]);

  const handleClose = useCallback(() => {
    setStep('select');
    setSelectedProductLine('');
    setSelectedFermenter('auto');
    setStartTime(toDatetimeLocal(addHours(startOfHour(new Date()), 12)));
    setAssignments([]);
    onClose();
  }, [onClose]);

  const handleBack = useCallback(() => {
    setStep('select');
    setAssignments([]);
  }, []);

  if (!open) return null;

  return (
    <div className="pp-modal-backdrop" onClick={handleClose}>
      <div className="pp-modal pp-wizard-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="pp-modal-header">
          <h2>New Batch Chain</h2>
          <button className="pp-modal-close" onClick={handleClose}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="pp-modal-body">
          {step === 'select' && (
            <div className="pp-wizard-step">
              {/* Product line */}
              <div className="pp-wizard-field">
                <label htmlFor="wiz-pl">Product Line</label>
                <select
                  id="wiz-pl"
                  value={selectedProductLine}
                  onChange={(e) => {
                    setSelectedProductLine(e.target.value);
                    setSelectedFermenter('auto');
                  }}
                  className="pp-detail-input"
                >
                  <option value="">— Select —</option>
                  {productLines.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name} ({pl.shortName})
                    </option>
                  ))}
                </select>
              </div>

              {productLine && (
                <>
                  {/* Batch name preview */}
                  <div className="pp-wizard-preview-name">
                    Batch: <strong>{batchName}</strong>
                    <span className="pp-wizard-preview-series">
                      (series #{seriesNum})
                    </span>
                  </div>

                  {/* Seed train summary */}
                  <div className="pp-wizard-info">
                    Seed train: {productLine.stageDefaults.length} stages
                    {productLine.stageDefaults.map((sd) => {
                      const stDef = stageTypeDefinitions.find((st) => st.id === sd.stageType);
                      return (
                        <span key={sd.stageType} className="pp-wizard-stage-chip">
                          {stDef?.shortName ?? sd.stageType} {sd.defaultDurationHours}h
                        </span>
                      );
                    })}
                  </div>

                  {/* Fermenter selection */}
                  <div className="pp-wizard-field">
                    <label htmlFor="wiz-ferm">Production Vessel</label>
                    <select
                      id="wiz-ferm"
                      value={selectedFermenter}
                      onChange={(e) => setSelectedFermenter(e.target.value)}
                      className="pp-detail-input"
                    >
                      <option value="auto">Auto-assign (earliest available)</option>
                      {fermenterMachines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Start time */}
                  <div className="pp-wizard-field">
                    <label htmlFor="wiz-start">
                      Production Start Time
                      {suggestedStart && startTime !== toDatetimeLocal(suggestedStart) && (
                        <button
                          type="button"
                          className="pp-wizard-suggest-btn"
                          onClick={() => setStartTime(toDatetimeLocal(suggestedStart))}
                          title="Use suggested time (earliest available after turnaround)"
                        >
                          Reset to suggested
                        </button>
                      )}
                    </label>
                    <input
                      id="wiz-start"
                      type="datetime-local"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="pp-detail-input"
                    />
                    {suggestedStart && startTime === toDatetimeLocal(suggestedStart) && (
                      <span className="pp-wizard-suggest-hint">
                        Suggested: earliest available after turnaround
                      </span>
                    )}
                  </div>

                  {/* Production end time + chain span (computed, read-only) */}
                  {(() => {
                    const st = new Date(startTime);
                    if (isNaN(st.getTime()) || !productLine.stageDefaults.length) return null;
                    const prodDuration = productLine.stageDefaults[productLine.stageDefaults.length - 1].defaultDurationHours;
                    const prodEnd = addHours(st, prodDuration);
                    const totalHours = chainDurationHours(productLine.stageDefaults);
                    return (
                      <div className="pp-wizard-timing-summary">
                        <div className="pp-wizard-timing-row">
                          <span className="pp-wizard-timing-label">Production End</span>
                          <span className="pp-wizard-timing-value">
                            {format(prodEnd, 'MMM d, yyyy HH:mm')}
                          </span>
                          <span className="pp-wizard-timing-dur">{formatDuration(prodDuration)}</span>
                        </div>
                        <div className="pp-wizard-timing-row">
                          <span className="pp-wizard-timing-label">Full Chain</span>
                          <span className="pp-wizard-timing-value">
                            {format(addHours(st, -totalHours + prodDuration), 'MMM d HH:mm')} → {format(prodEnd, 'MMM d HH:mm')}
                          </span>
                          <span className="pp-wizard-timing-dur">{formatDuration(totalHours)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="pp-wizard-step">
              <div className="pp-wizard-preview-name">
                <strong>{batchName}</strong>
                <span className="pp-wizard-preview-series">
                  {productLine?.name} — {assignments.length} stages
                </span>
              </div>

              {/* Overlap summary */}
              {totalOverlaps > 0 && (
                <div className="pp-detail-overlap-warning">
                  <strong>⚠ {totalOverlaps} overlap{totalOverlaps > 1 ? 's' : ''} detected</strong>
                  <div className="pp-detail-overlap-item">
                    Review the assignments below. Overlaps on upstream stages are warnings only.
                  </div>
                </div>
              )}

              {hasUnassigned && (
                <div className="pp-detail-overlap-warning">
                  <strong>⚠ Some stages have no available vessel</strong>
                  <div className="pp-detail-overlap-item">
                    Check equipment configuration or adjust the start time.
                  </div>
                </div>
              )}

              {/* Assignment table */}
              <div className="pp-wizard-table">
                <div className="pp-wizard-table-header">
                  <span className="pp-wizard-col-type">Stage</span>
                  <span className="pp-wizard-col-machine">Vessel</span>
                  <span className="pp-wizard-col-time">Start</span>
                  <span className="pp-wizard-col-time">End</span>
                  <span className="pp-wizard-col-dur">Duration</span>
                </div>
                {assignments.map((a, i) => {
                  const stDef = stageTypeDefinitions.find((st) => st.id === a.stageType);
                  const hasOverlap = a.overlaps.length > 0;
                  return (
                    <div
                      key={i}
                      className={`pp-wizard-table-row ${hasOverlap ? 'pp-wizard-table-row-warn' : ''} ${!a.machineId ? 'pp-wizard-table-row-error' : ''}`}
                    >
                      <span className="pp-wizard-col-type">
                        {stDef?.shortName ?? a.stageType}
                      </span>
                      <span className="pp-wizard-col-machine">
                        {a.machineName}
                        {hasOverlap && (
                          <span className="pp-wizard-overlap-badge" title={`${a.overlaps.length} overlap(s)`}>
                            ⚠
                          </span>
                        )}
                      </span>
                      <span className="pp-wizard-col-time">
                        {format(a.startDatetime, 'MMM d HH:mm')}
                      </span>
                      <span className="pp-wizard-col-time">
                        {format(a.endDatetime, 'MMM d HH:mm')}
                      </span>
                      <span className="pp-wizard-col-dur">
                        {formatDuration(a.durationHours)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pp-modal-footer pp-wizard-footer">
          {step === 'select' ? (
            <>
              <button className="pp-detail-btn pp-detail-btn-cancel" onClick={handleClose}>
                Cancel
              </button>
              <button
                className="pp-detail-btn pp-detail-btn-save"
                onClick={handleCalculate}
                disabled={!productLine || !startTime}
              >
                Calculate &rarr;
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
                onClick={handleCreate}
                disabled={hasUnassigned}
              >
                Create Chain
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
