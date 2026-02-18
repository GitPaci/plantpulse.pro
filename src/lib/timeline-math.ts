// Timeline pixel geometry — ported from VBA RisemPlan_z_Gumbi()
// Maps datetime ranges to canvas pixel positions

import { differenceInHours } from 'date-fns';

export interface BarPosition {
  left: number;
  width: number;
  clipped: boolean;
  offScreen: boolean;
}

/**
 * Calculate pixel position for a stage bar on the timeline canvas.
 * Ported from VBA: barLeft / barWidth calculation with partial-left-edge clipping.
 */
export function stageBarPosition(
  viewStart: Date,
  stageStart: Date,
  stageEnd: Date,
  canvasWidth: number,
  leftMargin: number,
  numberOfDays: number
): BarPosition {
  const pixelsPerDay = (canvasWidth - leftMargin) / numberOfDays;
  const pixelsPerHour = pixelsPerDay / 24;

  const hoursFromViewStart = differenceInHours(stageStart, viewStart);
  let left = leftMargin + hoursFromViewStart * pixelsPerHour;
  let width = differenceInHours(stageEnd, stageStart) * pixelsPerHour;

  // Completely off-screen (left)
  if (left + width < leftMargin) {
    return { left: -1, width: 0, clipped: true, offScreen: true };
  }

  // Completely off-screen (right)
  if (left > canvasWidth) {
    return { left: -1, width: 0, clipped: true, offScreen: true };
  }

  // Partial left-edge clipping
  let clipped = false;
  if (left < leftMargin) {
    width = width - (leftMargin - left);
    left = leftMargin;
    clipped = true;
    if (width < 5) width = 5;
  }

  // Clamp right edge to canvas
  if (left + width > canvasWidth) {
    width = canvasWidth - left;
    clipped = true;
  }

  return { left, width, clipped, offScreen: false };
}

/**
 * Calculate x-position for the now-line.
 */
export function nowLineX(
  viewStart: Date,
  now: Date,
  canvasWidth: number,
  leftMargin: number,
  numberOfDays: number
): number {
  const pixelsPerDay = (canvasWidth - leftMargin) / numberOfDays;
  const hoursFromViewStart = differenceInHours(now, viewStart);
  return leftMargin + hoursFromViewStart * (pixelsPerDay / 24);
}

/**
 * Calculate x-position for a given date on the timeline.
 */
export function dateToX(
  viewStart: Date,
  date: Date,
  canvasWidth: number,
  leftMargin: number,
  numberOfDays: number
): number {
  const pixelsPerDay = (canvasWidth - leftMargin) / numberOfDays;
  const hoursFromViewStart = differenceInHours(date, viewStart);
  return leftMargin + hoursFromViewStart * (pixelsPerDay / 24);
}

/**
 * Get pixels per day for the current view.
 */
export function pixelsPerDay(
  canvasWidth: number,
  leftMargin: number,
  numberOfDays: number
): number {
  return (canvasWidth - leftMargin) / numberOfDays;
}
