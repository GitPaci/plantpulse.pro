'use client';

// NewChainWizard — Guided batch chain creation wizard
// Ported from VBA: NovaSer form in FormaZaPlan
//
// Flow: Select product line → Pick fermenter + start time (or auto-find)
// → Back-calculate seed train → Preview with overlap warnings → Confirm
//
// Supports creating multiple consecutive chains in one go via the "+" button.
// Each additional chain starts after the previous one's production end + turnaround gap.

import { useState, useMemo, useCallback, useEffect } from 'react';
import { usePlantPulseStore, generateId } from '@/lib/store';
import { backCalculateChain, chainDurationHours, expandStageDefaults, buildStageTypeCounts } from '@/lib/seed-train';
import { autoScheduleChain, earliestAvailableTime, requiredTurnaroundGap } from '@/lib/scheduling';
import { isMachineUnavailable } from '@/lib/types';
import type { ChainAssignment } from '@/lib/scheduling';
import { batchNamePreview } from '@/lib/types';
import type { BatchNamingRule, ProductLine, Stage } from '@/lib/types';
import { format, addHours, startOfHour, endOfMonth, endOfQuarter, endOfYear, differenceInHours } from 'date-fns';

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

/** Preview result for one chain in multi-chain mode. */
interface ChainPreview {
  batchName: string;
  seriesNumber: number;
  assignments: ChainAssignment[];
}

// ─── Component ────────────────────────────────────────────────────────────

interface NewChainWizardProps {
  open: boolean;
  onClose: () => void;
  onOpenProcessSetup?: () => void;
}

type WizardStep = 'select' | 'preview';

export default function NewChainWizard({ open, onClose, onOpenProcessSetup }: NewChainWizardProps) {
  const productLines = usePlantPulseStore((s) => s.productLines);
  const machines = usePlantPulseStore((s) => s.machines);
  const stages = usePlantPulseStore((s) => s.stages);
  const batchChains = usePlantPulseStore((s) => s.batchChains);
  const turnaroundActivities = usePlantPulseStore((s) => s.turnaroundActivities);
  const stageTypeDefinitions = usePlantPulseStore((s) => s.stageTypeDefinitions);
  const stageTypesMode = usePlantPulseStore((s) => s.stageTypesMode);
  const productLineStageTypes = usePlantPulseStore((s) => s.productLineStageTypes);
  const batchNamingConfig = usePlantPulseStore((s) => s.batchNamingConfig);
  const addBatchChain = usePlantPulseStore((s) => s.addBatchChain);
  const addStage = usePlantPulseStore((s) => s.addStage);

  // ── Step 1 state ──
  const [step, setStep] = useState<WizardStep>('select');
  const [selectedProductLine, setSelectedProductLine] = useState('');
  const [selectedFermenter, setSelectedFermenter] = useState('auto');
  const [startTime, setStartTime] = useState(() =>
    toDatetimeLocal(addHours(startOfHour(new Date()), 12))
  );
  const [chainCount, setChainCount] = useState(1);

  // ── Horizon editor state ──
  const [horizonMode, setHorizonMode] = useState(false);
  const [horizonTargetDate, setHorizonTargetDate] = useState('');
  const [horizonApplied, setHorizonApplied] = useState(false);
  const [horizonConfirmed, setHorizonConfirmed] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [batchListPage, setBatchListPage] = useState(1);

  // ── Step 2 state: preview for all chains ──
  const [chainPreviews, setChainPreviews] = useState<ChainPreview[]>([]);

  // ── Derived data ──
  const productLine: ProductLine | undefined = useMemo(
    () => productLines.find((pl) => pl.id === selectedProductLine),
    [productLines, selectedProductLine]
  );

  // Effective stage types for the selected product line (per-PL or shared)
  const effectiveStageTypes = useMemo(() => {
    if (stageTypesMode === 'per_product_line' && selectedProductLine) {
      return productLineStageTypes[selectedProductLine] ?? stageTypeDefinitions;
    }
    return stageTypeDefinitions;
  }, [stageTypesMode, selectedProductLine, productLineStageTypes, stageTypeDefinitions]);

  // Stage type counts (for expanding stages with count > 1, e.g. 2× Seed n-1)
  const stageTypeCounts = useMemo(
    () => buildStageTypeCounts(effectiveStageTypes),
    [effectiveStageTypes]
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

  // Suggested start time: earliest available slot across fermenter candidates
  const suggestedStart = useMemo(() => {
    if (!productLine || fermenterMachines.length === 0) return null;
    const lastStage = productLine.stageDefaults[productLine.stageDefaults.length - 1];
    if (!lastStage) return null;

    if (selectedFermenter !== 'auto') {
      const m = fermenterMachines.find((fm) => fm.id === selectedFermenter);
      if (!m) return null;
      return earliestAvailableTime(m.id, m.group, stages, turnaroundActivities);
    }

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

  // Naming rule for this product line
  const namingRule: BatchNamingRule | null = useMemo(() => {
    if (!selectedProductLine) return null;
    return batchNamingConfig.mode === 'per_product_line'
      ? batchNamingConfig.productLineRules[selectedProductLine] ?? batchNamingConfig.sharedRule
      : batchNamingConfig.sharedRule;
  }, [selectedProductLine, batchNamingConfig]);

  // First series number
  const baseSeriesNum = useMemo(
    () => nextSeriesNumber(batchChains, selectedProductLine),
    [batchChains, selectedProductLine]
  );

  // Batch names for all chains in the queue
  const chainNames = useMemo(() => {
    if (!namingRule) return [];
    const step = namingRule.step || 1;
    return Array.from({ length: chainCount }, (_, i) =>
      batchNamePreview(namingRule, baseSeriesNum + i * step)
    );
  }, [namingRule, baseSeriesNum, chainCount]);

  // Turnaround gap for fermenters
  const fermenterTurnaroundGap = useMemo(() => {
    if (!productLine) return 0;
    const lastStage = productLine.stageDefaults[productLine.stageDefaults.length - 1];
    if (!lastStage) return 0;
    return requiredTurnaroundGap(lastStage.machineGroup, turnaroundActivities);
  }, [productLine, turnaroundActivities]);

  // Production duration
  const prodDuration = useMemo(() => {
    if (!productLine || !productLine.stageDefaults.length) return 0;
    return productLine.stageDefaults[productLine.stageDefaults.length - 1].defaultDurationHours;
  }, [productLine]);

  // Horizon presets: end-of-month, end-of-quarter, end-of-year from start time
  const horizonPresets = useMemo(() => {
    const st = new Date(startTime);
    if (isNaN(st.getTime()) || !productLine) return null;
    return {
      endOfMonth: endOfMonth(st),
      endOfQuarter: endOfQuarter(st),
      endOfYear: endOfYear(st),
    };
  }, [startTime, productLine]);

  // Quick estimate: how many chains fit before a target date
  const estimateChainCount = useCallback((targetDate: Date): number => {
    if (!productLine || prodDuration <= 0) return 0;
    const st = new Date(startTime);
    if (isNaN(st.getTime())) return 0;
    const cycleDuration = prodDuration + fermenterTurnaroundGap;
    if (cycleDuration <= 0) return 0;
    const parallelism = selectedFermenter === 'auto'
      ? Math.max(1, fermenterMachines.length)
      : 1;
    const totalHoursAvailable = differenceInHours(targetDate, st);
    if (totalHoursAvailable <= 0) return 0;
    return Math.min(999, Math.max(1, Math.floor((totalHoursAvailable / cycleDuration) * parallelism)));
  }, [productLine, prodDuration, fermenterTurnaroundGap, startTime, selectedFermenter, fermenterMachines]);

  // Check if horizon exceeds 12 months
  const horizonExceeds12Months = useMemo(() => {
    if (!horizonTargetDate || !startTime) return false;
    const target = new Date(horizonTargetDate);
    const start = new Date(startTime);
    if (isNaN(target.getTime()) || isNaN(start.getTime())) return false;
    return differenceInHours(target, start) > 12 * 30.44 * 24;
  }, [horizonTargetDate, startTime]);

  // Current horizon estimate for display
  const horizonEstimate = useMemo(() => {
    if (!horizonTargetDate) return null;
    const target = new Date(horizonTargetDate);
    if (isNaN(target.getTime())) return null;
    return estimateChainCount(target);
  }, [horizonTargetDate, estimateChainCount]);

  // Total overlap count across all chain previews
  const totalOverlaps = useMemo(
    () => chainPreviews.reduce(
      (sum, cp) => sum + cp.assignments.reduce((s, a) => s + a.overlaps.length, 0),
      0
    ),
    [chainPreviews]
  );

  const hasUnassigned = useMemo(
    () => chainPreviews.some((cp) => cp.assignments.some((a) => !a.machineId)),
    [chainPreviews]
  );

  // ── Actions ──

  const handleCalculate = useCallback(() => {
    if (!productLine || !productLine.stageDefaults.length || !namingRule) return;

    const firstStart = new Date(startTime);
    if (isNaN(firstStart.getTime())) return;

    const previews: ChainPreview[] = [];
    // Accumulate stages from previous chains so overlap detection considers them
    let accumulatedStages: Stage[] = [...stages];
    let cursor = firstStart;
    const step = namingRule.step || 1;

    for (let i = 0; i < chainCount; i++) {
      const backCalc = backCalculateChain(cursor, productLine.stageDefaults, stageTypeCounts);
      const fermId = selectedFermenter === 'auto' ? undefined : selectedFermenter;

      const result = autoScheduleChain(
        backCalc,
        productLine.id,
        fermId,
        machines,
        accumulatedStages,
        turnaroundActivities
      );

      const seriesNumber = baseSeriesNum + i * step;
      previews.push({
        batchName: batchNamePreview(namingRule, seriesNumber),
        seriesNumber,
        assignments: result,
      });

      // Add this chain's stages to accumulated stages for next chain's overlap check
      const chainId = `preview-${i}`;
      for (const a of result) {
        accumulatedStages.push({
          id: `preview-${i}-${a.stageType}`,
          machineId: a.machineId,
          batchChainId: chainId,
          stageType: a.stageType,
          startDatetime: a.startDatetime,
          endDatetime: a.endDatetime,
          state: 'planned',
        });
      }

      // Next chain's production start: use earliest available fermenter slot
      // across ALL candidates (considering accumulated stages), not just the
      // previous chain's end. This avoids huge gaps when vessels alternate —
      // e.g. F-3 may be free days before F-2's chain ends.
      if (selectedFermenter === 'auto') {
        let nextEarliest: Date | null = null;
        for (const m of fermenterMachines) {
          if (isMachineUnavailable(m, cursor)) continue;
          const t = earliestAvailableTime(
            m.id, m.group, accumulatedStages, turnaroundActivities
          );
          if (!nextEarliest || t < nextEarliest) nextEarliest = t;
        }
        if (nextEarliest) cursor = nextEarliest;
      } else {
        // User pinned a specific fermenter — sequential cursor is correct
        const prodAssignment = result[result.length - 1];
        if (prodAssignment) {
          cursor = addHours(prodAssignment.endDatetime, fermenterTurnaroundGap);
        }
      }
    }

    setChainPreviews(previews);
    setStep('preview');
  }, [productLine, startTime, selectedFermenter, chainCount, machines, stages, turnaroundActivities, namingRule, baseSeriesNum, fermenterTurnaroundGap, stageTypeCounts]);

  // Horizon apply: set chainCount from estimate
  const handleHorizonApply = useCallback(() => {
    if (!horizonTargetDate) return;
    const target = new Date(horizonTargetDate);
    if (isNaN(target.getTime())) return;
    const est = estimateChainCount(target);
    if (est <= 0) return;
    setChainCount(est);
    setHorizonApplied(true);
    setHorizonMode(false);
    setBatchListPage(1);
  }, [horizonTargetDate, estimateChainCount]);

  // Wrapper for Calculate that shows progress bar for large counts
  const handleCalculateWithProgress = useCallback(() => {
    if (chainCount > 20) {
      setIsCalculating(true);
      // Defer to let React render the progress indicator
      setTimeout(() => {
        handleCalculate();
        setIsCalculating(false);
      }, 50);
    } else {
      handleCalculate();
    }
  }, [chainCount, handleCalculate]);

  const handleCreate = useCallback(() => {
    if (!productLine || chainPreviews.length === 0) return;

    for (const cp of chainPreviews) {
      const chainId = generateId('chain-');
      addBatchChain({
        id: chainId,
        batchName: cp.batchName,
        seriesNumber: cp.seriesNumber,
        productLine: productLine.id,
        status: 'draft',
      });

      for (const a of cp.assignments) {
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
    }

    handleClose();
  }, [productLine, chainPreviews, addBatchChain, addStage]);

  const handleClose = useCallback(() => {
    setStep('select');
    setSelectedProductLine('');
    setSelectedFermenter('auto');
    setStartTime(toDatetimeLocal(addHours(startOfHour(new Date()), 12)));
    setChainCount(1);
    setChainPreviews([]);
    setHorizonMode(false);
    setHorizonTargetDate('');
    setHorizonApplied(false);
    setHorizonConfirmed(false);
    setIsCalculating(false);
    setBatchListPage(1);
    onClose();
  }, [onClose]);

  const handleBack = useCallback(() => {
    setStep('select');
    setChainPreviews([]);
    setIsCalculating(false);
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
                    setChainCount(1);
                    setHorizonMode(false);
                    setHorizonApplied(false);
                    setHorizonTargetDate('');
                    setHorizonConfirmed(false);
                    setBatchListPage(1);
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
                  {/* Batch name(s) preview with +/- buttons */}
                  <div className="pp-wizard-preview-name">
                    <div className="pp-wizard-batch-header">
                      <div>
                        {chainCount === 1 ? (
                          <>
                            Batch: <strong>{chainNames[0]}</strong>
                            <span className="pp-wizard-preview-series">
                              (series #{baseSeriesNum})
                            </span>
                          </>
                        ) : (
                          <>
                            <strong>{chainCount} batches:</strong>{' '}
                            {chainNames.slice(0, 10 * batchListPage).map((name, i) => (
                              <span key={i}>
                                {i > 0 && ', '}
                                <strong>{name}</strong>
                              </span>
                            ))}
                            {chainNames.length > 10 * batchListPage && (
                              <button
                                type="button"
                                className="pp-wizard-batch-show-more"
                                onClick={() => setBatchListPage((p) => p + 1)}
                              >
                                {' '}... +{chainNames.length - 10 * batchListPage} more
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      <div className="pp-wizard-count-controls">
                        {chainCount > 1 && (
                          <button
                            type="button"
                            className="pp-wizard-count-btn"
                            onClick={() => {
                              setChainCount((c) => Math.max(1, c - 1));
                              setHorizonApplied(false);
                              setHorizonMode(false);
                              setBatchListPage(1);
                            }}
                            title="Remove last batch"
                          >
                            −
                          </button>
                        )}
                        <button
                          type="button"
                          className="pp-wizard-count-btn pp-wizard-count-btn-add"
                          onClick={() => {
                            setChainCount((c) => {
                              const max = horizonApplied ? 999 : 10;
                              return Math.min(max, c + 1);
                            });
                            setHorizonApplied(false);
                            setHorizonMode(false);
                          }}
                          title="Add another batch"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Seed train summary */}
                  <div className="pp-wizard-info">
                    Seed train: {expandStageDefaults(productLine.stageDefaults, stageTypeCounts).length} stages
                    {productLine.stageDefaults.map((sd) => {
                      const stDef = effectiveStageTypes.find((st) => st.id === sd.stageType);
                      const count = stageTypeCounts?.get(sd.stageType) ?? 1;
                      return (
                        <span key={sd.stageType} className="pp-wizard-stage-chip">
                          {count > 1 && `${count}× `}{stDef?.shortName ?? sd.stageType} {sd.defaultDurationHours}h
                        </span>
                      );
                    })}
                    {fermenterTurnaroundGap > 0 && (
                      <span className="pp-wizard-stage-chip">
                        + {fermenterTurnaroundGap}h turnaround
                      </span>
                    )}
                    {onOpenProcessSetup && (
                      <button
                        type="button"
                        className="pp-wizard-edit-stages-link"
                        onClick={onOpenProcessSetup}
                        title="Edit stage defaults in Process Setup"
                      >
                        edit
                      </button>
                    )}
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

                  {/* Timing summary */}
                  {(() => {
                    const st = new Date(startTime);
                    if (isNaN(st.getTime()) || !productLine.stageDefaults.length) return null;
                    const totalHours = chainDurationHours(productLine.stageDefaults, stageTypeCounts);
                    const firstProdEnd = addHours(st, prodDuration);
                    // For multi-chain: last chain's production end
                    const lastProdEnd = chainCount === 1
                      ? firstProdEnd
                      : addHours(st, prodDuration + (chainCount - 1) * (prodDuration + fermenterTurnaroundGap));
                    const firstChainStart = addHours(st, -(totalHours - prodDuration));
                    return (
                      <div className="pp-wizard-timing-summary">
                        <div className="pp-wizard-timing-row">
                          <span className="pp-wizard-timing-label">
                            {chainCount === 1 ? 'Production End' : `Last Prod End`}
                          </span>
                          <span className="pp-wizard-timing-value">
                            {format(lastProdEnd, 'MMM d, yyyy HH:mm')}
                          </span>
                          <button
                            type="button"
                            className="pp-wizard-edit-stages-link"
                            onClick={() => {
                              setHorizonMode((prev) => !prev);
                              setHorizonConfirmed(false);
                            }}
                            title="Set a target end date to auto-calculate batch count"
                          >
                            {horizonMode ? 'close' : 'edit'}
                          </button>
                          <span className="pp-wizard-timing-dur">
                            {chainCount === 1
                              ? formatDuration(prodDuration)
                              : `${chainCount} × ${formatDuration(prodDuration)}`}
                          </span>
                        </div>
                        <div className="pp-wizard-timing-row">
                          <span className="pp-wizard-timing-label">Full Span</span>
                          <span className="pp-wizard-timing-value">
                            {format(firstChainStart, 'MMM d HH:mm')} → {format(lastProdEnd, 'MMM d HH:mm')}
                          </span>
                          <span className="pp-wizard-timing-dur">
                            {formatDuration((lastProdEnd.getTime() - firstChainStart.getTime()) / 3600000)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Horizon editor — extend planning to a target end date */}
                  {horizonMode && (() => {
                    const st = new Date(startTime);
                    if (isNaN(st.getTime()) || !productLine) return null;
                    const needsConfirmation = horizonExceeds12Months && !horizonConfirmed;
                    return (
                      <div className="pp-wizard-horizon-editor">
                        <div className="pp-wizard-horizon-label">Target End Date</div>

                        <div className="pp-wizard-horizon-presets">
                          {horizonPresets && (
                            <>
                              <button
                                type="button"
                                className={`pp-wizard-horizon-preset-btn${horizonTargetDate === toDatetimeLocal(horizonPresets.endOfMonth) ? ' pp-wizard-horizon-preset-active' : ''}`}
                                onClick={() => { setHorizonTargetDate(toDatetimeLocal(horizonPresets.endOfMonth)); setHorizonConfirmed(false); }}
                              >
                                End of Month ({format(horizonPresets.endOfMonth, 'MMM d')})
                              </button>
                              <button
                                type="button"
                                className={`pp-wizard-horizon-preset-btn${horizonTargetDate === toDatetimeLocal(horizonPresets.endOfQuarter) ? ' pp-wizard-horizon-preset-active' : ''}`}
                                onClick={() => { setHorizonTargetDate(toDatetimeLocal(horizonPresets.endOfQuarter)); setHorizonConfirmed(false); }}
                              >
                                End of Quarter ({format(horizonPresets.endOfQuarter, 'MMM d')})
                              </button>
                              <button
                                type="button"
                                className={`pp-wizard-horizon-preset-btn${horizonTargetDate === toDatetimeLocal(horizonPresets.endOfYear) ? ' pp-wizard-horizon-preset-active' : ''}`}
                                onClick={() => { setHorizonTargetDate(toDatetimeLocal(horizonPresets.endOfYear)); setHorizonConfirmed(false); }}
                              >
                                End of Year ({format(horizonPresets.endOfYear, 'MMM d')})
                              </button>
                            </>
                          )}
                        </div>

                        <input
                          type="datetime-local"
                          value={horizonTargetDate}
                          onChange={(e) => { setHorizonTargetDate(e.target.value); setHorizonConfirmed(false); }}
                          className="pp-detail-input pp-wizard-horizon-datepicker"
                          min={toDatetimeLocal(st)}
                        />

                        {horizonEstimate !== null && horizonEstimate > 0 && (
                          <div className="pp-wizard-horizon-estimate">
                            ~{horizonEstimate} batch{horizonEstimate !== 1 ? 'es' : ''} fit within this horizon
                          </div>
                        )}

                        {horizonTargetDate && new Date(horizonTargetDate) <= st && (
                          <div className="pp-wizard-horizon-warning">
                            Target date must be after the production start time.
                          </div>
                        )}

                        {horizonExceeds12Months && !horizonConfirmed && (
                          <div className="pp-wizard-horizon-warning">
                            This horizon exceeds 12 months. Large schedules may increase calculation time and browser memory usage.
                          </div>
                        )}

                        <div className="pp-wizard-horizon-actions">
                          <button
                            type="button"
                            className="pp-detail-btn pp-detail-btn-cancel pp-wizard-horizon-action-btn"
                            onClick={() => { setHorizonMode(false); setHorizonTargetDate(''); setHorizonConfirmed(false); }}
                          >
                            Cancel
                          </button>
                          {needsConfirmation ? (
                            <button
                              type="button"
                              className="pp-detail-btn pp-detail-btn-save pp-wizard-horizon-action-btn pp-wizard-horizon-confirm-btn"
                              onClick={() => setHorizonConfirmed(true)}
                              disabled={!horizonTargetDate || !horizonEstimate}
                            >
                              Continue
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="pp-detail-btn pp-detail-btn-save pp-wizard-horizon-action-btn"
                              onClick={handleHorizonApply}
                              disabled={!horizonTargetDate || !horizonEstimate || (horizonTargetDate ? new Date(horizonTargetDate) <= new Date(startTime) : true)}
                            >
                              Apply
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {isCalculating && (
            <div className="pp-wizard-progress">
              <div className="pp-wizard-progress-bar">
                <div className="pp-wizard-progress-fill" />
              </div>
              <span className="pp-wizard-progress-text">
                Calculating {chainCount} chain{chainCount !== 1 ? 's' : ''}...
              </span>
            </div>
          )}

          {step === 'preview' && (
            <div className="pp-wizard-step">
              {/* Summary */}
              <div className="pp-wizard-preview-name">
                <strong>{chainPreviews.length} batch{chainPreviews.length > 1 ? 'es' : ''}</strong>
                <span className="pp-wizard-preview-series">
                  {productLine?.name}
                  {chainPreviews.length > 0 && ` — ${chainPreviews[0].batchName}`}
                  {chainPreviews.length > 1 && ` to ${chainPreviews[chainPreviews.length - 1].batchName}`}
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

              {/* Assignment tables — one per chain */}
              {chainPreviews.map((cp, ci) => (
                <div key={ci}>
                  {chainPreviews.length > 1 && (
                    <div className="pp-wizard-chain-divider">
                      {cp.batchName} <span className="pp-wizard-chain-divider-sub">(series #{cp.seriesNumber})</span>
                    </div>
                  )}
                  <div className="pp-wizard-table">
                    <div className="pp-wizard-table-header">
                      <span className="pp-wizard-col-type">Stage</span>
                      <span className="pp-wizard-col-machine">Vessel</span>
                      <span className="pp-wizard-col-time">Start</span>
                      <span className="pp-wizard-col-time">End</span>
                      <span className="pp-wizard-col-dur">Duration</span>
                    </div>
                    {cp.assignments.map((a, i) => {
                      const stDef = effectiveStageTypes.find((st) => st.id === a.stageType);
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
              ))}
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
                onClick={handleCalculateWithProgress}
                disabled={!productLine || !startTime || isCalculating}
              >
                {isCalculating ? 'Calculating...' : 'Calculate \u2192'}
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
                Create {chainPreviews.length > 1 ? `${chainPreviews.length} Chains` : 'Chain'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
