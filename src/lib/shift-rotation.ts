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

export interface ShiftCoverageConfig {
  teams: { color: string }[];
  activeDays: boolean[];
  operatingHoursStart: number;
  operatingHoursEnd: number;
  anchorDate: Date;
  cyclePattern: number[];
  shiftLengthHours: number;
}


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
 * Returns array of ShiftBandSegment objects.
 *
 * When activeDays and operatingHours are provided, hours outside the
 * operating window or on inactive days produce gap segments (teamIndex === -1).
 *
 * Shift continuity rule: if a shift block starts during a valid operating
 * window on an active day, the entire shift runs to its natural end — even
 * if it crosses into an inactive day or outside operating hours (e.g. a
 * Friday night shift extending into Saturday in a 24/5 setup).
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

  // Snap to the shift boundary at or before viewStart
  const hoursSinceAnchor = differenceInHours(viewStart, anchorDate);
  const alignedShiftOffset = Math.floor(hoursSinceAnchor / shiftLengthHours) * shiftLengthHours;
  let cursor = new Date(anchorDate.getTime() + alignedShiftOffset * 3600000);

  // Fast path: 24/7 with all days active — no gaps possible
  if (is24h && allDaysActive) {
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

  // Coverage-aware path: iterate shift-block by shift-block.
  // A shift is covered if its START falls on an active day within operating hours.
  // Once a shift starts, it runs its full duration (shift continuity rule).
  while (cursor < viewEnd) {
    const shiftStart = new Date(cursor.getTime());
    const shiftEnd = new Date(cursor.getTime() + shiftLengthHours * 3600000);

    const dayOfWeek = shiftStart.getDay();
    const hour = shiftStart.getHours();
    const dayActive = activeDays![dayOfWeek] ?? true;
    const hourInWindow = is24h || isHourInOperatingWindow(hour, operatingHoursStart!, operatingHoursEnd!);
    const shiftStartCovered = dayActive && hourInWindow;

    if (shiftStartCovered) {
      // Entire shift block gets the team color
      bands.push({
        start: shiftStart,
        end: shiftEnd,
        teamIndex: currentShiftTeam(shiftStart, anchorDate, cyclePattern, shiftLengthHours),
      });
    } else {
      // Gap: no shift coverage for this block
      bands.push({
        start: shiftStart,
        end: shiftEnd,
        teamIndex: SHIFT_GAP_TEAM,
      });
    }

    cursor = shiftEnd;
  }

  return bands;
}

function isHourInOperatingWindow(hour: number, operatingHoursStart: number, operatingHoursEnd: number): boolean {
  if (operatingHoursStart === 0 && operatingHoursEnd === 24) return true;
  if (operatingHoursEnd > operatingHoursStart) {
    return hour >= operatingHoursStart && hour < operatingHoursEnd;
  }
  return hour >= operatingHoursStart || hour < operatingHoursEnd;
}

/**
 * Resolve whether a specific wall-clock time is covered by an active shift.
 *
 * Shift continuity: checks the shift block's START time against plant coverage,
 * not the queried time itself. A shift that starts during valid hours continues
 * to its natural end even if it crosses into an inactive day or off-hours.
 */
export function isShiftCoveredAt(time: Date, rotation: ShiftCoverageConfig): boolean {
  // Find the start of the shift block that contains `time`
  const hoursSinceAnchor = differenceInHours(time, rotation.anchorDate);
  const blockIndex = Math.floor(hoursSinceAnchor / rotation.shiftLengthHours);
  const shiftStart = new Date(rotation.anchorDate.getTime() + blockIndex * rotation.shiftLengthHours * 3600000);

  const dayIndex = shiftStart.getDay();
  if (!rotation.activeDays[dayIndex]) return false;
  if (!isHourInOperatingWindow(shiftStart.getHours(), rotation.operatingHoursStart, rotation.operatingHoursEnd)) {
    return false;
  }
  const teamIndex = currentShiftTeam(
    shiftStart,
    rotation.anchorDate,
    rotation.cyclePattern,
    rotation.shiftLengthHours
  );
  return teamIndex >= 0 && teamIndex < rotation.teams.length;
}
