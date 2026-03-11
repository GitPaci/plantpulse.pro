// Seed train back-calculation engine
// Ported from VBA: NovaSer form — auto-scheduling with back-calculation
//
// Given a final (production) stage start time and a product line's stage defaults,
// walks backwards through the seed train to compute start/end times for each
// upstream stage. Works with any number of user-defined stages and durations.

import { subHours, addHours } from 'date-fns';
import type { StageDefault } from './types';

/** Result of back-calculating one stage in the seed train. */
export interface BackCalculatedStage {
  stageType: string;       // references StageTypeDefinition.id
  machineGroup: string;    // which equipment group to pick from
  startDatetime: Date;
  endDatetime: Date;
  durationHours: number;
}

/**
 * Back-calculate a full batch chain from the final stage start time.
 *
 * The stageDefaults array is ordered earliest-to-latest (e.g. inoculum → seed_n2
 * → seed_n1 → production). The last entry is the final/production stage.
 *
 * Each stage's end time is the next stage's start time (continuous chain).
 * The final stage's duration comes from stageDefaults; its end = start + duration.
 *
 * Example (GNT line):
 *   stageDefaults: [inoculum 24h, seed_n2 48h, seed_n1 55h, production 192h]
 *   finalStageStart: March 15 06:00
 *
 *   Result (back-calculated):
 *     inoculum:   start = Mar 9 23:00, end = Mar 10 23:00 (24h)
 *     seed_n2:    start = Mar 10 23:00, end = Mar 12 23:00 (48h)
 *     seed_n1:    start = Mar 12 23:00, end = Mar 15 06:00 (55h)
 *     production: start = Mar 15 06:00, end = Mar 23 06:00 (192h)
 *
 * Ported from VBA: backCalculateChain logic in NovaSer form
 */
export function backCalculateChain(
  finalStageStart: Date,
  stageDefaults: StageDefault[]
): BackCalculatedStage[] {
  if (stageDefaults.length === 0) return [];

  const stages: BackCalculatedStage[] = [];

  // Start with the final (production) stage
  const lastDefault = stageDefaults[stageDefaults.length - 1];
  const finalEnd = addHours(finalStageStart, lastDefault.defaultDurationHours);

  stages.push({
    stageType: lastDefault.stageType,
    machineGroup: lastDefault.machineGroup,
    startDatetime: new Date(finalStageStart.getTime()),
    endDatetime: finalEnd,
    durationHours: lastDefault.defaultDurationHours,
  });

  // Walk backwards through upstream stages
  let nextStageStart = finalStageStart;
  for (let i = stageDefaults.length - 2; i >= 0; i--) {
    const def = stageDefaults[i];
    const stageStart = subHours(nextStageStart, def.defaultDurationHours);
    const stageEnd = nextStageStart;

    stages.unshift({
      stageType: def.stageType,
      machineGroup: def.machineGroup,
      startDatetime: stageStart,
      endDatetime: new Date(stageEnd.getTime()),
      durationHours: def.defaultDurationHours,
    });

    nextStageStart = stageStart;
  }

  return stages;
}

/**
 * Forward-calculate: given a first stage start, compute all stages forward.
 * Each stage starts when the previous one ends.
 *
 * Useful when the user picks an inoculation start instead of a fermenter start.
 */
export function forwardCalculateChain(
  firstStageStart: Date,
  stageDefaults: StageDefault[]
): BackCalculatedStage[] {
  if (stageDefaults.length === 0) return [];

  const stages: BackCalculatedStage[] = [];
  let cursor = firstStageStart;

  for (const def of stageDefaults) {
    const stageEnd = addHours(cursor, def.defaultDurationHours);
    stages.push({
      stageType: def.stageType,
      machineGroup: def.machineGroup,
      startDatetime: new Date(cursor.getTime()),
      endDatetime: stageEnd,
      durationHours: def.defaultDurationHours,
    });
    cursor = stageEnd;
  }

  return stages;
}

/**
 * Compute the total chain duration in hours (sum of all stage defaults).
 */
export function chainDurationHours(stageDefaults: StageDefault[]): number {
  return stageDefaults.reduce((sum, d) => sum + d.defaultDurationHours, 0);
}
