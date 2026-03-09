// 4-team, 12-hour shift rotation
// Ported from VBA: 8-step cycle array [0, 2, 1, 3, 2, 0, 3, 1]
// Teams: 0=Blue, 1=Green, 2=Red, 3=Yellow
//
// All functions accept optional cyclePattern to support user-configurable
// rotation patterns via the ShiftRotation store state.

import { differenceInHours } from 'date-fns';

/** Default 8-step cycle: each element is a team index, each step is 12 hours */
export const SHIFT_CYCLE: readonly number[] = [0, 2, 1, 3, 2, 0, 3, 1];

/** Default anchor date — used to align the cycle. Adjustable per facility. */
export const DEFAULT_ANCHOR = new Date(2026, 0, 1, 6, 0, 0); // Jan 1 2026, 06:00

/**
 * Determine which team is on shift at a given time.
 * Ported from VBA shift detection logic.
 */
export function currentShiftTeam(
  now: Date,
  anchorDate: Date = DEFAULT_ANCHOR,
  cyclePattern: readonly number[] = SHIFT_CYCLE
): number {
  const hoursSinceAnchor = differenceInHours(now, anchorDate);
  const shiftIndex = Math.floor(hoursSinceAnchor / 12);
  const len = cyclePattern.length || 1;
  return cyclePattern[((shiftIndex % len) + len) % len] ?? 0;
}

/**
 * Get the shift team for every 12-hour block in a date range,
 * aligned to shift boundaries (06:00 / 18:00).
 * Returns array of { start, teamIndex } objects.
 */
export function shiftBands(
  viewStart: Date,
  numberOfDays: number,
  anchorDate: Date = DEFAULT_ANCHOR,
  cyclePattern: readonly number[] = SHIFT_CYCLE
): { start: Date; teamIndex: number }[] {
  const bands: { start: Date; teamIndex: number }[] = [];
  const viewEnd = new Date(viewStart.getTime() + numberOfDays * 24 * 3600000);

  // Snap to the shift boundary (06:00 or 18:00) at or before viewStart
  const hoursSinceAnchor = differenceInHours(viewStart, anchorDate);
  const alignedShiftOffset = Math.floor(hoursSinceAnchor / 12) * 12;
  let cursor = new Date(anchorDate.getTime() + alignedShiftOffset * 3600000);

  while (cursor < viewEnd) {
    bands.push({
      start: new Date(cursor.getTime()),
      teamIndex: currentShiftTeam(cursor, anchorDate, cyclePattern),
    });
    cursor = new Date(cursor.getTime() + 12 * 3600000);
  }

  return bands;
}
