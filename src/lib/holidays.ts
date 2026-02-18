// Slovenian public holidays + Gauss Easter algorithm
// Ported from VBA holiday detection in InfoTabla wallboard

import { getDay } from 'date-fns';

/** Static Slovenian public holidays [month, day] (1-indexed month) */
const STATIC_HOLIDAYS: readonly [number, number][] = [
  [1, 1],   // New Year's Day
  [1, 2],   // New Year's Day (2nd)
  [2, 8],   // Prešeren Day (Slovenian Cultural Day)
  [4, 27],  // Day of Uprising Against Occupation
  [5, 1],   // Labour Day
  [5, 2],   // Labour Day (2nd)
  [6, 25],  // Statehood Day
  [8, 15],  // Assumption of Mary
  [10, 31], // Reformation Day
  [11, 1],  // All Saints' Day
  [12, 25], // Christmas Day
  [12, 26], // Independence and Unity Day
];

/**
 * Compute Easter Monday using the Gauss Easter algorithm.
 * Ported from VBA: velikonoč (Easter) calculation
 */
export function easterMonday(year: number): Date {
  const g = year % 19;
  const c = Math.floor(year / 100);
  const h =
    (c - Math.floor(c / 4) - Math.floor((8 * c + 13) / 25) + 19 * g + 15) %
    30;
  const i =
    h -
    Math.floor(h / 28) *
      (1 - Math.floor(29 / (h + 1)) * Math.floor((21 - g) / 11));
  const j = (year + Math.floor(year / 4) + i + 2 - c + Math.floor(c / 4)) % 7;
  const l = i - j;
  const month = 3 + Math.floor((l + 40) / 44); // 1-indexed
  const day = l + 28 - 31 * Math.floor(month / 4);
  // Easter Sunday + 1 day = Easter Monday
  return new Date(year, month - 1, day + 1);
}

/** Check if a date is a Slovenian public holiday */
export function isHoliday(date: Date): boolean {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();

  for (const [m, d] of STATIC_HOLIDAYS) {
    if (month === m && day === d) return true;
  }

  const em = easterMonday(year);
  if (
    date.getFullYear() === em.getFullYear() &&
    date.getMonth() === em.getMonth() &&
    date.getDate() === em.getDate()
  ) {
    return true;
  }

  return false;
}

/** Saturday or Sunday */
export function isWeekend(date: Date): boolean {
  const d = getDay(date);
  return d === 0 || d === 6;
}

export function isSaturday(date: Date): boolean {
  return getDay(date) === 6;
}

export function isSunday(date: Date): boolean {
  return getDay(date) === 0;
}

/** Holiday OR Sunday — gets hatched pattern in VBA wallboard */
export function isHolidayOrSunday(date: Date): boolean {
  return isSunday(date) || isHoliday(date);
}
