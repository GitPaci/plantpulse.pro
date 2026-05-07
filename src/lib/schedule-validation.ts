import { differenceInMinutes } from 'date-fns';
import type { BatchChain, Machine, ShutdownPeriod, Stage, StageDefault, StageTypeDefinition, TurnaroundActivity } from './types';
import { detectOverlaps } from './scheduling';
import { turnaroundTotalHours, collectDowntimeWindows } from './types';

export type ValidationSeverity = 'error' | 'warning';

export type ValidationRuleCode =
  | 'CHAIN_ORPHAN_STAGE'
  | 'CHAIN_STAGE_BATCH_MISMATCH'
  | 'CHAIN_STAGE_SEQUENCE'
  | 'CHAIN_STAGE_OVERLAP'
  | 'CHAIN_MISSING_STAGE'
  | 'CHAIN_DUPLICATE_ACTIVE_STAGE'
  | 'CHAIN_NOT_CONTIGUOUS'
  | 'CHAIN_LINK_CONTINUITY'
  | 'CHAIN_NON_MONOTONIC'
  | 'CHAIN_FLOATING_STAGE'
  | 'CHAIN_DISCONNECTED_PRODUCTION'
  | 'DURATION_BELOW_MIN'
  | 'DURATION_ABOVE_MAX'
  | 'EQUIPMENT_STAGE_OVERLAP'
  | 'EQUIPMENT_DOWNTIME_CONFLICT'
  | 'EQUIPMENT_SHUTDOWN_CONFLICT'
  | 'TURNAROUND_TOO_SHORT';

export interface ValidationIssue {
  id: string;
  code: ValidationRuleCode;
  severity: ValidationSeverity;
  message: string;
  batchChainId?: string;
  stageId?: string;
  relatedStageIds?: string[];
  machineId?: string;
}

export interface ScheduleValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  issuesByStageId: Record<string, ValidationIssue[]>;
  issuesByMachineId: Record<string, ValidationIssue[]>;
}

export interface ScheduleValidationInput {
  stages: Stage[];
  batchChains: BatchChain[];
  machines: Machine[];
  stageDefaultsByProductLine: Record<string, StageDefault[]>;
  stageTypeDefinitionsByProductLine?: Record<string, StageTypeDefinition[]>;
  shutdownPeriods?: ShutdownPeriod[];
  turnaroundActivities?: TurnaroundActivity[];
}

function stageDurationHours(stage: Stage): number {
  return Math.max(0, differenceInMinutes(stage.endDatetime, stage.startDatetime) / 60);
}

export function validateSchedule(input: ScheduleValidationInput): ScheduleValidationResult {
  const issues: ValidationIssue[] = [];
  const chainMap = new Map(input.batchChains.map((c) => [c.id, c]));
  const stagesByChain = new Map<string, Stage[]>();

  for (const stage of input.stages) {
    if (!chainMap.has(stage.batchChainId)) {
      issues.push({ id: `orphan-${stage.id}`, code: 'CHAIN_ORPHAN_STAGE', severity: 'error', stageId: stage.id, machineId: stage.machineId, message: `Orphan stage ${stage.id}: batch chain ${stage.batchChainId} not found.` });
      continue;
    }
    const list = stagesByChain.get(stage.batchChainId) ?? [];
    list.push(stage);
    stagesByChain.set(stage.batchChainId, list);
  }

  for (const chain of input.batchChains) {
    const chainStages = (stagesByChain.get(chain.id) ?? []).slice().sort((a, b) => a.startDatetime.getTime() - b.startDatetime.getTime());
    const defaults = input.stageDefaultsByProductLine[chain.productLine] ?? [];
    const typeDefs = input.stageTypeDefinitionsByProductLine?.[chain.productLine] ?? [];
    const configuredOrder = defaults.map((d) => d.stageType);
    const requiredStages = Array.from(new Set(configuredOrder));
    const defaultByType = new Map(defaults.map((d) => [d.stageType, d]));
    const stageIndex = new Map(configuredOrder.map((t, i) => [t, i]));
    const stageTypeAllowedCount = new Map(typeDefs.map((d) => [d.id, Math.max(1, d.count || 1)]));

    for (const req of requiredStages) {
      if (!chainStages.some((s) => s.stageType === req)) {
        issues.push({ id: `missing-${chain.id}-${req}`, code: 'CHAIN_MISSING_STAGE', severity: 'error', batchChainId: chain.id, message: `Chain ${chain.batchName} is missing required stage ${req}.` });
      }
    }

    // Canonical chain integrity checks from configured sequence
    for (let i = 1; i < configuredOrder.length; i++) {
      const currentType = configuredOrder[i];
      const prevType = configuredOrder[i - 1];
      const currentStages = chainStages.filter((s) => s.stageType === currentType);
      const prevStages = chainStages.filter((s) => s.stageType === prevType);
      if (currentStages.length > 0 && prevStages.length === 0) {
        for (const s of currentStages) {
          issues.push({ id: `floating-${chain.id}-${s.id}`, code: 'CHAIN_FLOATING_STAGE', severity: 'error', batchChainId: chain.id, stageId: s.id, message: `Chain ${chain.batchName} has floating stage ${currentType} without upstream ${prevType}.` });
        }
      }
    }

    for (let i = 0; i < chainStages.length; i++) {
      const stage = chainStages[i];
      if (stage.batchChainId !== chain.id) {
        issues.push({ id: `mismatch-${stage.id}`, code: 'CHAIN_STAGE_BATCH_MISMATCH', severity: 'error', stageId: stage.id, batchChainId: chain.id, message: `Stage ${stage.id} is assigned to wrong chain.` });
      }
      const orderIdx = stageIndex.get(stage.stageType) ?? -1;
      if (orderIdx === -1) continue;

      for (let j = i + 1; j < chainStages.length; j++) {
        const next = chainStages[j];
        if (stage.endDatetime > next.startDatetime) {
          issues.push({ id: `overlap-chain-${stage.id}-${next.id}`, code: 'CHAIN_STAGE_OVERLAP', severity: 'error', batchChainId: chain.id, stageId: stage.id, relatedStageIds: [stage.id, next.id], message: `Chain ${chain.batchName} has overlapping stages ${stage.stageType} and ${next.stageType}.` });
        }
        const nextOrder = stageIndex.get(next.stageType) ?? -1;
        if (nextOrder !== -1 && nextOrder < orderIdx) {
          issues.push({ id: `seq-${stage.id}-${next.id}`, code: 'CHAIN_STAGE_SEQUENCE', severity: 'error', batchChainId: chain.id, stageId: next.id, relatedStageIds: [stage.id, next.id], message: `Chain ${chain.batchName} stage order violation: ${next.stageType} appears before ${stage.stageType}.` });
        }
      }

      const activeSameType = chainStages.filter((s) => s.stageType === stage.stageType && (s.state === 'planned' || s.state === 'active'));
      const allowedCount = stageTypeAllowedCount.get(stage.stageType) ?? 1;
      if (activeSameType.length > allowedCount) {
        issues.push({ id: `dup-${chain.id}-${stage.stageType}`, code: 'CHAIN_DUPLICATE_ACTIVE_STAGE', severity: 'error', batchChainId: chain.id, stageId: stage.id, relatedStageIds: activeSameType.map((s) => s.id), message: `Chain ${chain.batchName} has duplicate active/planned ${stage.stageType} stages.` });
      }

      const duration = stageDurationHours(stage);
      const setup = defaultByType.get(stage.stageType);
      if (setup) {
        const min = setup.minDurationHours ?? setup.defaultDurationHours * 0.9;
        const max = setup.maxDurationHours ?? setup.defaultDurationHours * 1.1;
        if (duration < min) issues.push({ id: `dur-min-${stage.id}`, code: 'DURATION_BELOW_MIN', severity: 'error', batchChainId: chain.id, stageId: stage.id, message: `Stage ${stage.stageType} on chain ${chain.batchName} is below minimum duration (${duration.toFixed(2)}h < ${min}h).` });
        if (duration > max) issues.push({ id: `dur-max-${stage.id}`, code: 'DURATION_ABOVE_MAX', severity: 'error', batchChainId: chain.id, stageId: stage.id, message: `Stage ${stage.stageType} on chain ${chain.batchName} exceeds maximum duration (${duration.toFixed(2)}h > ${max}h).` });
      }
    }

    const ordered = chainStages
      .filter((s) => stageIndex.has(s.stageType))
      .sort((a, b) => (stageIndex.get(a.stageType) ?? -1) - (stageIndex.get(b.stageType) ?? -1));
    for (let i = 1; i < ordered.length; i++) {
      if (ordered[i].startDatetime < ordered[i - 1].startDatetime) {
        issues.push({ id: `mono-${ordered[i - 1].id}-${ordered[i].id}`, code: 'CHAIN_NON_MONOTONIC', severity: 'error', batchChainId: chain.id, stageId: ordered[i].id, relatedStageIds: [ordered[i - 1].id, ordered[i].id], message: `Chain ${chain.batchName} has non-monotonic stage timing.` });
      }
      if (ordered[i].startDatetime < ordered[i - 1].endDatetime) {
        issues.push({ id: `contig-${ordered[i - 1].id}-${ordered[i].id}`, code: 'CHAIN_NOT_CONTIGUOUS', severity: 'error', batchChainId: chain.id, stageId: ordered[i].id, relatedStageIds: [ordered[i - 1].id, ordered[i].id], message: `Chain ${chain.batchName} is not contiguous between ${ordered[i - 1].stageType} and ${ordered[i].stageType}.` });
      }
      if (chain.linkToNext && ordered[i].startDatetime.getTime() !== ordered[i - 1].endDatetime.getTime()) {
        issues.push({ id: `link-${ordered[i - 1].id}-${ordered[i].id}`, code: 'CHAIN_LINK_CONTINUITY', severity: 'error', batchChainId: chain.id, stageId: ordered[i].id, relatedStageIds: [ordered[i - 1].id, ordered[i].id], message: `Chain ${chain.batchName} link continuity broken between ${ordered[i - 1].stageType} and ${ordered[i].stageType}.` });
      }
    }

    const productionType = configuredOrder[configuredOrder.length - 1];
    const production = ordered.find((s) => s.stageType === productionType);
    if (production && ordered.length > 1) {
      const prev = ordered[ordered.length - 2];
      if (production.startDatetime.getTime() !== prev.endDatetime.getTime()) {
        issues.push({ id: `prod-disconnect-${chain.id}-${production.id}`, code: 'CHAIN_DISCONNECTED_PRODUCTION', severity: 'error', batchChainId: chain.id, stageId: production.id, relatedStageIds: [prev.id, production.id], message: `Production stage is disconnected from upstream seed chain in ${chain.batchName}.` });
      }
    }
  }

  for (const stage of input.stages) {
    for (const c of detectOverlaps(stage.machineId, stage.startDatetime, stage.endDatetime, input.stages, stage.id)) {
      issues.push({ id: `eq-overlap-${stage.id}-${c.existingStageId}`, code: 'EQUIPMENT_STAGE_OVERLAP', severity: 'error', stageId: stage.id, machineId: stage.machineId, relatedStageIds: [stage.id, c.existingStageId], message: `Equipment conflict on machine ${stage.machineId}: overlapping stages ${stage.id} and ${c.existingStageId}.` });
    }

    const machine = input.machines.find((m) => m.id === stage.machineId);
    if (machine) {
      const overlapsDowntime = collectDowntimeWindows(machine, stage.startDatetime, stage.endDatetime)
        .some((w) => w.blocksPlanning && w.start < stage.endDatetime && w.end > stage.startDatetime);
      if (overlapsDowntime) {
        issues.push({ id: `dt-${stage.id}`, code: 'EQUIPMENT_DOWNTIME_CONFLICT', severity: 'error', stageId: stage.id, machineId: stage.machineId, message: `Stage ${stage.id} is scheduled during machine downtime (${machine.name}).` });
      }
    }

    for (const s of input.shutdownPeriods ?? []) {
      if (stage.startDatetime < s.endDate && stage.endDatetime > s.startDate) {
        issues.push({ id: `shutdown-${stage.id}-${s.id}`, code: 'EQUIPMENT_SHUTDOWN_CONFLICT', severity: 'error', stageId: stage.id, machineId: stage.machineId, message: `Stage ${stage.id} overlaps shutdown period ${s.name}.` });
      }
    }
  }

  if ((input.turnaroundActivities ?? []).length > 0) {
    const byMachine = new Map<string, Stage[]>();
    for (const s of input.stages) {
      const arr = byMachine.get(s.machineId) ?? [];
      arr.push(s);
      byMachine.set(s.machineId, arr);
    }
    for (const [machineId, machineStages] of byMachine) {
      const machine = input.machines.find((m) => m.id === machineId);
      if (!machine) continue;
      const required = (input.turnaroundActivities ?? []).filter((t) => t.equipmentGroup === machine.group && t.isDefault).reduce((acc, t) => acc + turnaroundTotalHours(t), 0);
      const sorted = machineStages.sort((a, b) => a.startDatetime.getTime() - b.startDatetime.getTime());
      for (let i = 1; i < sorted.length; i++) {
        const gap = differenceInMinutes(sorted[i].startDatetime, sorted[i - 1].endDatetime) / 60;
        if (gap < required) {
          issues.push({ id: `ta-${sorted[i - 1].id}-${sorted[i].id}`, code: 'TURNAROUND_TOO_SHORT', severity: 'error', machineId, stageId: sorted[i].id, relatedStageIds: [sorted[i - 1].id, sorted[i].id], message: `Turnaround too short on ${machine.name}: requires ${required}h, found ${gap.toFixed(2)}h.` });
        }
      }
    }
  }

  const issuesByStageId: Record<string, ValidationIssue[]> = {};
  const issuesByMachineId: Record<string, ValidationIssue[]> = {};
  for (const issue of issues) {
    if (issue.stageId) (issuesByStageId[issue.stageId] ??= []).push(issue);
    if (issue.machineId) (issuesByMachineId[issue.machineId] ??= []).push(issue);
  }

  return { valid: issues.length === 0, issues, issuesByStageId, issuesByMachineId };
}
