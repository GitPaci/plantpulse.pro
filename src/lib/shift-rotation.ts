// 4-team, 12-hour shift rotation
// Ported from VBA: 8-step cycle array [0, 2, 1, 3, 2, 0, 3, 1]
// Teams: 0=Blue, 1=Green, 2=Red, 3=Yellow

import { differenceInHours } from 'date-fns';

/** 8-step cycle: each element is a team index, each step is 12 hours */
export const SHIFT_CYCLE = [0, 2, 1, 3, 2, 0, 3, 1] as const;

/** Default anchor date — used to align the cycle. Adjustable per facility. */
export const DEFAULT_ANCHOR = new Date(2026, 0, 1, 6, 0, 0); // Jan 1 2026, 06:00

/**
 * Determine which team is on shift at a given time.
 * Ported from VBA shift detection logic.
 */
export function currentShiftTeam(
  now: Date,
  anchorDate: Date = DEFAULT_ANCHOR
): number {
  const hoursSinceAnchor = differenceInHours(now, anchorDate);
  const shiftIndex = Math.floor(hoursSinceAnchor / 12);
  return SHIFT_CYCLE[
    ((shiftIndex % SHIFT_CYCLE.length) + SHIFT_CYCLE.length) %
      SHIFT_CYCLE.length
  ];
}

/**
 * Get the shift team for every 12-hour block in a date range.
 * Returns array of { start, teamIndex } objects.
 */
export function shiftBands(
  viewStart: Date,
  numberOfDays: number,
  anchorDate: Date = DEFAULT_ANCHOR
): { start: Date; teamIndex: number }[] {
  const bands: { start: Date; teamIndex: number }[] = [];
  const totalHours = numberOfDays * 24;

  for (let h = 0; h < totalHours; h += 12) {
    const bandStart = new Date(viewStart.getTime() + h * 3600000);
    bands.push({
      start: bandStart,
      teamIndex: currentShiftTeam(bandStart, anchorDate),
    });
  }

  return bands;
}
