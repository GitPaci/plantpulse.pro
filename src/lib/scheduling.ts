// Scheduling engine — overlap detection, auto-vessel assignment, bulk shift validation
// Ported from VBA: overlap check in DodaneNoveSerije, auto-scheduling in NovaSer,
// bulk shift in Premik
//
// All functions are pure (no store access) — they receive data as arguments and
// return results. The caller (wizard / tool UI) reads from the Zustand store and
// writes back via store actions.

import { differenceInHours, addHours } from 'date-fns';
import type {
  Stage,
  Machine,
  TurnaroundActivity,
  ShutdownPeriod,
} from './types';
import { turnaroundTotalHours, isMachineUnavailable } from './types';
import type { BackCalculatedStage } from './seed-train';

// ─── Overlap detection ──────────────────────────────────────────────

/** Describes a conflict between two stages on the same machine. */
export interface OverlapConflict {
  /** The new/proposed stage that causes the overlap. */
  stageId?: string;
  /** The existing stage it overlaps with. */
  existingStageId: string;
  machineId: string;
  overlapHours: number;
}

/**
 * Check whether a proposed time window overlaps with existing stages
 * on a specific machine.
 *
 * Returns all conflicting stages. An empty array means no overlaps.
 *
 * Ported from VBA: `DateDiff("h", lastEndOnVessel, newStart) < 0`
 */
export function detectOverlaps(
  machineId: string,
  proposedStart: Date,
  proposedEnd: Date,
  existingStages: Stage[],
  excludeStageId?: string
): OverlapConflict[] {
  const conflicts: OverlapConflict[] = [];

  for (const stage of existingStages) {
    if (stage.machineId !== machineId) continue;
    if (excludeStageId && stage.id === excludeStageId) continue;

    // Two intervals overlap if one starts before the other ends and vice versa
    if (proposedStart < stage.endDatetime && proposedEnd > stage.startDatetime) {
      // Compute overlap magnitude
      const overlapStart = proposedStart > stage.startDatetime ? proposedStart : stage.startDatetime;
      const overlapEnd = proposedEnd < stage.endDatetime ? proposedEnd : stage.endDatetime;
      const overlapHours = differenceInHours(overlapEnd, overlapStart);

      conflicts.push({
        existingStageId: stage.id,
        machineId,
        overlapHours: Math.max(overlapHours, 0),
      });
    }
  }

  return conflicts;
}

/**
 * Check whether a proposed time window falls within any shutdown period.
 */
export function detectShutdownConflicts(
  proposedStart: Date,
  proposedEnd: Date,
  shutdowns: ShutdownPeriod[]
): ShutdownPeriod[] {
  return shutdowns.filter(
    (s) => proposedStart < s.endDate && proposedEnd > s.startDate
  );
}

/**
 * Compute how many hours to push a batch chain's production-stage start time so
 * that no stage in the chain (including back-calculated upstream stages) overlaps
 * with any shutdown period.
 *
 * The chain stages are all connected — shifting the production start by N hours
 * shifts every upstream stage by the same N hours. We find the stage that needs
 * the largest forward push and return that value. Returns 0 if no adjustment needed.
 */
export function chainShutdownShift(
  chainStages: Array<{ startDatetime: Date; endDatetime: Date }>,
  shutdownPeriods: ShutdownPeriod[]
): number {
  if (shutdownPeriods.length === 0) return 0;
  let maxPush = 0;
  for (const stage of chainStages) {
    const conflicts = detectShutdownConflicts(stage.startDatetime, stage.endDatetime, shutdownPeriods);
    for (const c of conflicts) {
      const push = differenceInHours(c.endDate, stage.startDatetime);
      if (push > maxPush) maxPush = push;
    }
  }
  return maxPush;
}

// ─── Turnaround gap computation ─────────────────────────────────────

/**
 * Compute the minimum required gap (in hours) between consecutive batches
 * on a machine, based on the default turnaround activities for that
 * machine's equipment group.
 *
 * Only activities marked as `isDefault` are included.
 */
export function requiredTurnaroundGap(
  machineGroup: string,
  turnaroundActivities: TurnaroundActivity[]
): number {
  return turnaroundActivities
    .filter((ta) => ta.equipmentGroup === machineGroup && ta.isDefault)
    .reduce((sum, ta) => sum + turnaroundTotalHours(ta), 0);
}

/**
 * Find the last stage end time on a specific machine.
 * Returns null if the machine has no stages.
 */
export function lastStageEndOnMachine(
  machineId: string,
  stages: Stage[]
): Date | null {
  let latest: Date | null = null;
  for (const s of stages) {
    if (s.machineId !== machineId) continue;
    if (!latest || s.endDatetime > latest) {
      latest = s.endDatetime;
    }
  }
  return latest;
}

/**
 * Compute the earliest available start time on a machine, accounting for
 * existing stages, turnaround gap, and plant shutdown periods.
 *
 * If the computed time falls inside a shutdown, it is pushed to after the
 * shutdown ends.
 */
export function earliestAvailableTime(
  machineId: string,
  machineGroup: string,
  stages: Stage[],
  turnaroundActivities: TurnaroundActivity[],
  shutdownPeriods: ShutdownPeriod[] = []
): Date {
  const lastEnd = lastStageEndOnMachine(machineId, stages);
  let earliest = lastEnd
    ? addHours(lastEnd, requiredTurnaroundGap(machineGroup, turnaroundActivities))
    : new Date();

  // Push past any overlapping shutdown (iterate in case shutdowns are consecutive)
  let safetyLimit = 20; // prevent infinite loops from misconfigured data
  while (safetyLimit-- > 0) {
    const conflicts = detectShutdownConflicts(earliest, earliest, shutdownPeriods);
    if (conflicts.length === 0) break;
    // Move to the end of the latest overlapping shutdown
    let latestEnd = conflicts[0].endDate;
    for (const c of conflicts) {
      if (c.endDate > latestEnd) latestEnd = c.endDate;
    }
    earliest = latestEnd;
  }

  return earliest;
}

// ─── Auto-vessel assignment ─────────────────────────────────────────

/** Result of finding an available vessel. */
export interface VesselSuggestion {
  machineId: string;
  machineName: string;
  earliestStart: Date;
}

/**
 * Find all available vessels in a machine group for a product line,
 * sorted by earliest availability.
 *
 * Excludes machines with active downtime at the proposed start time.
 *
 * Ported from VBA: auto-assign to first available (non-overlapping)
 * vessel in the product line's pool.
 */
export function findAvailableVessels(
  machineGroup: string,
  productLine: string | undefined,
  proposedStart: Date,
  proposedDurationHours: number,
  machines: Machine[],
  stages: Stage[],
  turnaroundActivities: TurnaroundActivity[],
  shutdownPeriods: ShutdownPeriod[] = []
): VesselSuggestion[] {
  const proposedEnd = addHours(proposedStart, proposedDurationHours);

  // Reject the entire window if it falls inside a plant shutdown
  const shutdownConflicts = detectShutdownConflicts(proposedStart, proposedEnd, shutdownPeriods);
  if (shutdownConflicts.length > 0) return [];

  const candidates = machines.filter((m) => {
    if (m.group !== machineGroup) return false;
    // Product line match: machine is either in the same line or unassigned
    if (productLine && m.productLine && m.productLine !== productLine) return false;
    // Exclude machines with active downtime
    if (isMachineUnavailable(m, proposedStart)) return false;
    // Also check downtime at proposed end
    if (isMachineUnavailable(m, proposedEnd)) return false;
    return true;
  });

  const suggestions: VesselSuggestion[] = [];

  for (const machine of candidates) {
    const earliest = earliestAvailableTime(
      machine.id, machine.group, stages, turnaroundActivities, shutdownPeriods
    );
    const overlaps = detectOverlaps(
      machine.id,
      proposedStart < earliest ? earliest : proposedStart,
      addHours(proposedStart < earliest ? earliest : proposedStart, proposedDurationHours),
      stages
    );

    suggestions.push({
      machineId: machine.id,
      machineName: machine.name,
      earliestStart: earliest,
    });
  }

  // Sort by earliest availability
  suggestions.sort((a, b) => a.earliestStart.getTime() - b.earliestStart.getTime());

  return suggestions;
}

/**
 * Find the single best vessel for a stage — the one with the earliest
 * availability that doesn't cause overlaps.
 *
 * Returns null if no vessel is available without overlap.
 */
export function findBestVessel(
  machineGroup: string,
  productLine: string | undefined,
  proposedStart: Date,
  proposedDurationHours: number,
  machines: Machine[],
  stages: Stage[],
  turnaroundActivities: TurnaroundActivity[],
  shutdownPeriods: ShutdownPeriod[] = []
): VesselSuggestion | null {
  const proposedEnd = addHours(proposedStart, proposedDurationHours);

  // Check if proposed window falls inside a plant shutdown
  const shutdownConflicts = detectShutdownConflicts(proposedStart, proposedEnd, shutdownPeriods);
  if (shutdownConflicts.length > 0) {
    // Push start past the shutdown and retry
    let latestEnd = shutdownConflicts[0].endDate;
    for (const c of shutdownConflicts) {
      if (c.endDate > latestEnd) latestEnd = c.endDate;
    }
    return findBestVessel(
      machineGroup, productLine, latestEnd,
      proposedDurationHours, machines, stages,
      turnaroundActivities, shutdownPeriods
    );
  }

  const candidates = machines.filter((m) => {
    if (m.group !== machineGroup) return false;
    if (productLine && m.productLine && m.productLine !== productLine) return false;
    if (isMachineUnavailable(m, proposedStart)) return false;
    if (isMachineUnavailable(m, proposedEnd)) return false;
    return true;
  });

  // Collect ALL overlap-free candidates, then pick the least-recently-used
  // (longest idle time) to distribute work across available vessels.
  const overlapFree: VesselSuggestion[] = [];
  for (const machine of candidates) {
    const overlaps = detectOverlaps(machine.id, proposedStart, proposedEnd, stages);
    if (overlaps.length === 0) {
      overlapFree.push({
        machineId: machine.id,
        machineName: machine.name,
        earliestStart: proposedStart,
      });
    }
  }

  if (overlapFree.length > 0) {
    if (overlapFree.length === 1) return overlapFree[0];

    // Prefer the machine whose last stage ended earliest (longest idle).
    // Machines with NO existing stages are preferred (completely idle).
    let best = overlapFree[0];
    let bestLastEnd = lastStageEndOnMachine(best.machineId, stages);

    for (let i = 1; i < overlapFree.length; i++) {
      const lastEnd = lastStageEndOnMachine(overlapFree[i].machineId, stages);
      if (bestLastEnd === null) break; // current best has no stages — can't beat idle
      if (lastEnd === null || lastEnd < bestLastEnd) {
        best = overlapFree[i];
        bestLastEnd = lastEnd;
      }
    }

    return best;
  }

  // No overlap-free vessel at proposed time — find earliest across all candidates
  let bestSuggestion: VesselSuggestion | null = null;
  for (const machine of candidates) {
    const earliest = earliestAvailableTime(
      machine.id, machine.group, stages, turnaroundActivities, shutdownPeriods
    );
    const adjustedStart = earliest > proposedStart ? earliest : proposedStart;
    const adjustedEnd = addHours(adjustedStart, proposedDurationHours);

    // Skip if adjusted window falls in a shutdown
    if (detectShutdownConflicts(adjustedStart, adjustedEnd, shutdownPeriods).length > 0) continue;

    const overlaps = detectOverlaps(machine.id, adjustedStart, adjustedEnd, stages);

    if (overlaps.length === 0) {
      if (!bestSuggestion || adjustedStart < bestSuggestion.earliestStart) {
        bestSuggestion = {
          machineId: machine.id,
          machineName: machine.name,
          earliestStart: adjustedStart,
        };
      }
    }
  }

  return bestSuggestion;
}

// ─── Auto-schedule a full chain ─────────────────────────────────────

/** A stage assignment with vessel and times. */
export interface ChainAssignment {
  stageType: string;
  machineId: string;
  machineName: string;
  startDatetime: Date;
  endDatetime: Date;
  durationHours: number;
  /** Overlap warnings (informational, not blocking for upstream stages). */
  overlaps: OverlapConflict[];
}

/**
 * Auto-schedule a full batch chain: assign vessels to each back-calculated
 * stage, starting from the production fermenter and working upstream.
 *
 * The production stage's machine is typically pre-selected by the user.
 * Upstream stages (seed_n1, seed_n2, inoculum) get auto-assigned to the
 * best available vessel in their equipment group.
 *
 * Ported from VBA: NovaSer auto-scheduling logic.
 */
export function autoScheduleChain(
  backCalculatedStages: BackCalculatedStage[],
  productLine: string,
  /** Pre-selected machine for the final (production) stage, or undefined for auto. */
  productionMachineId: string | undefined,
  machines: Machine[],
  existingStages: Stage[],
  turnaroundActivities: TurnaroundActivity[],
  shutdownPeriods: ShutdownPeriod[] = []
): ChainAssignment[] {
  const assignments: ChainAssignment[] = [];

  // Accumulated delay (hours) propagated from downstream → upstream so the
  // chain stays continuous when a vessel isn't free at the ideal time.
  let chainDelayHours = 0;

  // Work from the last stage (production) backwards — the final stage is most
  // constrained (fermenter), upstream stages have more vessel options.
  for (let i = backCalculatedStages.length - 1; i >= 0; i--) {
    const calc = backCalculatedStages[i];
    const isProduction = i === backCalculatedStages.length - 1;

    // Apply accumulated chain delay so this stage shifts with downstream
    const proposedStart = chainDelayHours > 0
      ? addHours(calc.startDatetime, chainDelayHours)
      : calc.startDatetime;
    const proposedEnd = addHours(proposedStart, calc.durationHours);

    let assignedMachine: { id: string; name: string } | null = null;
    let actualStart = proposedStart;

    if (isProduction && productionMachineId) {
      // User pre-selected the fermenter
      const m = machines.find((m) => m.id === productionMachineId);
      if (m) {
        assignedMachine = { id: m.id, name: m.name };
        // Even for pre-selected fermenter, respect its availability
        const chainStages: Stage[] = assignments.map((a) => ({
          id: `pending-${a.stageType}`,
          machineId: a.machineId,
          batchChainId: '',
          stageType: a.stageType,
          startDatetime: a.startDatetime,
          endDatetime: a.endDatetime,
          state: 'planned' as const,
        }));
        const allStages = [...existingStages, ...chainStages];
        const earliest = earliestAvailableTime(
          m.id, m.group, allStages, turnaroundActivities, shutdownPeriods
        );
        if (earliest > proposedStart) {
          actualStart = earliest;
        }
      }
    }

    if (!assignedMachine) {
      // Auto-assign: find best vessel
      // Include already-assigned stages from this chain in the conflict check
      const chainStages: Stage[] = assignments.map((a) => ({
        id: `pending-${a.stageType}`,
        machineId: a.machineId,
        batchChainId: '',
        stageType: a.stageType,
        startDatetime: a.startDatetime,
        endDatetime: a.endDatetime,
        state: 'planned' as const,
      }));
      const allStages = [...existingStages, ...chainStages];

      const best = findBestVessel(
        calc.machineGroup,
        productLine,
        proposedStart,
        calc.durationHours,
        machines,
        allStages,
        turnaroundActivities,
        shutdownPeriods
      );

      if (best) {
        assignedMachine = { id: best.machineId, name: best.machineName };
        if (best.earliestStart > proposedStart) {
          actualStart = best.earliestStart;
        }
      }
    }

    const actualEnd = addHours(actualStart, calc.durationHours);

    // If this stage was pushed later, propagate the extra delay upstream
    if (actualStart > proposedStart) {
      chainDelayHours += differenceInHours(actualStart, proposedStart);
    }

    // Check overlaps using actual times
    const chainStages: Stage[] = assignments.map((a) => ({
      id: `pending-${a.stageType}`,
      machineId: a.machineId,
      batchChainId: '',
      stageType: a.stageType,
      startDatetime: a.startDatetime,
      endDatetime: a.endDatetime,
      state: 'planned' as const,
    }));
    const allStages = [...existingStages, ...chainStages];

    const overlaps = assignedMachine
      ? detectOverlaps(assignedMachine.id, actualStart, actualEnd, allStages)
      : [];

    assignments.unshift({
      stageType: calc.stageType,
      machineId: assignedMachine?.id || '',
      machineName: assignedMachine?.name || 'Unassigned',
      startDatetime: actualStart,
      endDatetime: actualEnd,
      durationHours: calc.durationHours,
      overlaps,
    });
  }

  return assignments;
}

// ─── Bulk shift validation ──────────────────────────────────────────

/** Describes a new overlap introduced by a bulk shift operation. */
export interface BulkShiftConflict {
  stageId: string;
  machineId: string;
  conflictsWith: string; // existing stage ID
  overlapHours: number;
}

/**
 * Validate a bulk shift operation: check what overlaps would be introduced
 * if the specified stages are shifted by deltaHours.
 *
 * Returns an array of conflicts. Empty array = shift is safe.
 *
 * Ported from VBA: Premik — note that VBA did NOT validate after shift,
 * but we add validation as an improvement.
 *
 * @param stageIds — IDs of stages to shift
 * @param deltaHours — hours to shift (positive = forward, negative = backward)
 * @param allStages — all stages in the store
 */
export function validateBulkShift(
  stageIds: string[],
  deltaHours: number,
  allStages: Stage[]
): BulkShiftConflict[] {
  const conflicts: BulkShiftConflict[] = [];
  const shiftedSet = new Set(stageIds);

  // Build the post-shift state
  const postShiftStages = allStages.map((s) => {
    if (!shiftedSet.has(s.id)) return s;
    return {
      ...s,
      startDatetime: addHours(s.startDatetime, deltaHours),
      endDatetime: addHours(s.endDatetime, deltaHours),
    };
  });

  // Check each shifted stage against non-shifted stages on the same machine
  for (const stageId of stageIds) {
    const shifted = postShiftStages.find((s) => s.id === stageId);
    if (!shifted) continue;

    const overlaps = detectOverlaps(
      shifted.machineId,
      shifted.startDatetime,
      shifted.endDatetime,
      postShiftStages,
      shifted.id
    );

    for (const overlap of overlaps) {
      conflicts.push({
        stageId: shifted.id,
        machineId: shifted.machineId,
        conflictsWith: overlap.existingStageId,
        overlapHours: overlap.overlapHours,
      });
    }
  }

  return conflicts;
}

// ─── Bulk shift filtering (VBA Premik pattern) ──────────────────────

/**
 * Select stages for a bulk shift using the VBA Premik pattern:
 * all stages where series_number >= threshold AND start_date > cutoffDate.
 *
 * @param minSeriesNumber — minimum series number (inclusive)
 * @param cutoffDate — only shift stages starting after this date
 * @param stages — all stages
 * @param batchChainMap — map of batchChainId → seriesNumber
 */
export function selectStagesForBulkShift(
  minSeriesNumber: number,
  cutoffDate: Date,
  stages: Stage[],
  batchChainMap: Map<string, number>
): string[] {
  return stages
    .filter((s) => {
      const series = batchChainMap.get(s.batchChainId);
      if (series === undefined) return false;
      return series >= minSeriesNumber && s.startDatetime > cutoffDate;
    })
    .map((s) => s.id);
}
