// 4-team, configurable-length shift rotation
// Ported from VBA: 8-step cycle array [0, 2, 1, 3, 2, 0, 3, 1]
// Teams: 0=Blue, 1=Green, 2=Red, 3=Yellow
//
// All functions accept optional cyclePattern and shiftLengthHours to support
// user-configurable rotation patterns via the ShiftRotation store state.

import { differenceInHours } from 'date-fns';

/** Default 8-step cycle: each element is a team index, each step is one shift block */
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
  cyclePattern: readonly number[] = SHIFT_CYCLE,
  shiftLengthHours: number = 12
): number {
  const hoursSinceAnchor = differenceInHours(now, anchorDate);
  const shiftIndex = Math.floor(hoursSinceAnchor / shiftLengthHours);
  const len = cyclePattern.length || 1;
  return cyclePattern[((shiftIndex % len) + len) % len] ?? 0;
}

/** A shift band segment — either a team shift or an uncovered gap. */
export interface ShiftBandSegment {
  start: Date;
  end: Date;
  /** Team index, or -1 for gap (no shift coverage). */
  teamIndex: number;
}

/** Sentinel value used for gap segments where no team is assigned. */
export const SHIFT_GAP_TEAM = -1;

/**
 * Get the shift team for every shift block in a date range,
 * aligned to shift boundaries.
 * Returns array of { start, teamIndex } objects.
 *
 * When activeDays and operatingHours are provided, hours outside the
 * operating window or on inactive days produce gap segments (teamIndex === -1).
 */
export function shiftBands(
  viewStart: Date,
  numberOfDays: number,
  anchorDate: Date = DEFAULT_ANCHOR,
  cyclePattern: readonly number[] = SHIFT_CYCLE,
  shiftLengthHours: number = 12,
  activeDays?: boolean[],
  operatingHoursStart?: number,
  operatingHoursEnd?: number
): ShiftBandSegment[] {
  const bands: ShiftBandSegment[] = [];
  const viewEnd = new Date(viewStart.getTime() + numberOfDays * 24 * 3600000);

  const hasPlantCoverage = activeDays && operatingHoursStart !== undefined && operatingHoursEnd !== undefined;
  const is24h = !hasPlantCoverage || (operatingHoursStart === 0 && operatingHoursEnd === 24);
  const allDaysActive = !hasPlantCoverage || activeDays.every((d) => d);

  // Fast path: 24/7 with all days active — no gaps possible
  if (is24h && allDaysActive) {
    const hoursSinceAnchor = differenceInHours(viewStart, anchorDate);
    const alignedShiftOffset = Math.floor(hoursSinceAnchor / shiftLengthHours) * shiftLengthHours;
    let cursor = new Date(anchorDate.getTime() + alignedShiftOffset * 3600000);

    while (cursor < viewEnd) {
      const end = new Date(cursor.getTime() + shiftLengthHours * 3600000);
      bands.push({
        start: new Date(cursor.getTime()),
        end,
        teamIndex: currentShiftTeam(cursor, anchorDate, cyclePattern, shiftLengthHours),
      });
      cursor = end;
    }
    return bands;
  }

  // Slow path: iterate hour by hour and merge consecutive segments
  let cursor = new Date(viewStart.getTime());
  // Snap to start of the hour
  cursor.setMinutes(0, 0, 0);

  let currentSegment: ShiftBandSegment | null = null;

  while (cursor < viewEnd) {
    const dayOfWeek = cursor.getDay(); // 0=Sun
    const hour = cursor.getHours();

    // Determine if this hour is within operating window
    const dayActive = activeDays![dayOfWeek] ?? true;
    let hourInWindow = true;
    if (!is24h) {
      const opStart = operatingHoursStart!;
      const opEnd = operatingHoursEnd!;
      if (opEnd > opStart) {
        hourInWindow = hour >= opStart && hour < opEnd;
      } else {
        // Overnight window (e.g. 22:00–06:00)
        hourInWindow = hour >= opStart || hour < opEnd;
      }
    }

    const isActive = dayActive && hourInWindow;
    let teamIndex: number;
    if (isActive) {
      teamIndex = currentShiftTeam(cursor, anchorDate, cyclePattern, shiftLengthHours);
    } else {
      teamIndex = SHIFT_GAP_TEAM;
    }

    const nextHour = new Date(cursor.getTime() + 3600000);

    if (currentSegment && currentSegment.teamIndex === teamIndex) {
      // Extend the current segment
      currentSegment.end = nextHour;
    } else {
      // Push previous segment and start a new one
      if (currentSegment) {
        bands.push(currentSegment);
      }
      currentSegment = {
        start: new Date(cursor.getTime()),
        end: nextHour,
        teamIndex,
      };
    }

    cursor = nextHour;
  }

  if (currentSegment) {
    bands.push(currentSegment);
  }

  return bands;
}
