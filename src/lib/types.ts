// PlantPulse Scheduler — Core TypeScript interfaces
// Mapped from VBA BigReadArray + modern extensions (see CLAUDE.md)

// Equipment groups are user-configurable (not a fixed enum).
// Machine.group and TurnaroundActivity.equipmentGroup store EquipmentGroup.id strings.
export type MachineGroup = string;

export interface EquipmentGroup {
  id: string;             // stable key, e.g. "propagator", "fermenter", "bioreactor"
  name: string;           // display label, e.g. "Propagator", "Fermenter"
  shortName: string;      // toolbar chip label, e.g. "PR", "F", "BIO"
  displayOrder: number;   // controls filter button order and general sort
}

// Stage types are user-configurable (not a fixed enum).
// Default stage types: inoculum, seed (n-2), seed (n-1), production.
// Users can define custom stage types via Process Setup > Stage Types tab.
export type StageType = string;

// Stage type definition — user-editable metadata for each stage type.
// StageDefault.stageType stores the StageTypeDefinition.id string.
export interface StageTypeDefinition {
  id: string;            // stable key, e.g. "inoculum", "seed_n2", "production"
  name: string;          // display label, e.g. "Inoculum", "Seed (n-2)"
  shortName: string;     // compact label for bars/chips, e.g. "INO", "n-2"
  description?: string;  // optional note
  count: number;         // instances per batch chain (e.g. 2 if two inoculum vessels per chain)
  displayOrder: number;  // controls dropdown and display sort order
}

export type StageState = 'planned' | 'active' | 'completed';
export type BatchStatus = 'draft' | 'proposed' | 'committed';

export interface ProductLine {
  id: string;
  name: string;
  shortName: string;            // compact label for toolbar chips, batch names, e.g. "GNT", "KK"
  stageDefaults: StageDefault[];
  displayOrder: number;
}

export interface StageDefault {
  stageType: StageType;
  defaultDurationHours: number;
  minDurationHours?: number;     // optional floor; defaults to target × 0.9
  maxDurationHours?: number;     // optional ceiling; defaults to target × 1.1
  machineGroup: string;
}

// Machine unavailability window — excludes machine from planning while active.
// If endDate is undefined the machine is unavailable indefinitely.
export interface MachineDowntime {
  startDate: Date;
  endDate?: Date;         // undefined = indefinite (until manually cleared)
  reason?: string;        // optional note, e.g. "CIP rebuild", "Inspection"
}

// Recurring machine unavailability rule — generates periodic downtime windows.
// Used for scheduled maintenance blocks (e.g. every Friday 08:00–12:00).
export type RecurrenceType = 'weekly' | 'monthly';

export interface RecurringDowntimeRule {
  id: string;
  recurrenceType: RecurrenceType;
  dayOfWeek?: number;     // 0=Sun … 6=Sat (used when recurrenceType === 'weekly')
  dayOfMonth?: number;    // 1–31 (used when recurrenceType === 'monthly'; clamped to month length)
  startHour: number;      // 0–23: time-of-day the window starts
  startMinute: number;    // 0–59
  durationHours: number;  // length of each unavailability window
  startDate: Date;        // recurrence validity start (first occurrence on or after this date)
  endDate?: Date;         // optional recurrence validity end (undefined = indefinite)
  reason?: string;
}

export interface Machine {
  id: string;
  name: string;
  group: MachineGroup;
  productLine?: string;
  displayOrder: number;
  downtime?: MachineDowntime;  // one-time unavailability window
  recurringDowntime?: RecurringDowntimeRule[];  // repeating unavailability rules
}

// Check if a date falls within any occurrence of a recurring downtime rule.
export function isDateInRecurringRule(rule: RecurringDowntimeRule, atDate: Date): boolean {
  // Rule hasn't started yet
  if (atDate < rule.startDate) return false;
  // Rule has ended (check end-of-day of endDate to be inclusive)
  if (rule.endDate && atDate > rule.endDate) return false;

  const dayOfWeek = atDate.getDay();
  const dayOfMonth = atDate.getDate();
  const hour = atDate.getHours();
  const minute = atDate.getMinutes();

  let matchesPattern = false;
  if (rule.recurrenceType === 'weekly') {
    matchesPattern = dayOfWeek === (rule.dayOfWeek ?? 0);
  } else if (rule.recurrenceType === 'monthly') {
    // Clamp to last day of month
    const lastDay = new Date(atDate.getFullYear(), atDate.getMonth() + 1, 0).getDate();
    const targetDay = Math.min(rule.dayOfMonth ?? 1, lastDay);
    matchesPattern = dayOfMonth === targetDay;
  }

  if (!matchesPattern) {
    // Also check if a window that started on a matching day is still active
    // (i.e. a window that spans midnight into the next day)
    const yesterday = new Date(atDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yDow = yesterday.getDay();
    const yDom = yesterday.getDate();

    let prevDayMatches = false;
    if (rule.recurrenceType === 'weekly') {
      prevDayMatches = yDow === (rule.dayOfWeek ?? 0);
    } else {
      const lastDayPrev = new Date(yesterday.getFullYear(), yesterday.getMonth() + 1, 0).getDate();
      prevDayMatches = yDom === Math.min(rule.dayOfMonth ?? 1, lastDayPrev);
    }

    if (prevDayMatches) {
      // Check if yesterday's window extends into today
      const windowStartMinutes = rule.startHour * 60 + rule.startMinute;
      const windowEndMinutes = windowStartMinutes + rule.durationHours * 60;
      // windowEndMinutes > 24*60 means the window spills past midnight.
      // currentMinutes (today) falls in the spillover if it's before the
      // overflow portion: 0 <= currentMinutes < (windowEndMinutes - 24*60)
      const currentMinutes = hour * 60 + minute;
      if (windowEndMinutes > 24 * 60 && currentMinutes < windowEndMinutes - 24 * 60) {
        // Re-check validity for yesterday's date
        if (yesterday >= rule.startDate && (!rule.endDate || yesterday <= rule.endDate)) {
          return true;
        }
      }
    }
    return false;
  }

  // Pattern matches today — check time window
  const windowStartMinutes = rule.startHour * 60 + rule.startMinute;
  const windowEndMinutes = windowStartMinutes + rule.durationHours * 60;
  const currentMinutes = hour * 60 + minute;

  return currentMinutes >= windowStartMinutes && currentMinutes < windowEndMinutes;
}

// Check if a machine is currently unavailable at a given point in time.
// Used by the scheduling engine to exclude machines from auto-assignment.
// Checks both one-time downtime and recurring rules.
export function isMachineUnavailable(m: Machine, atDate?: Date): boolean {
  const now = atDate ?? new Date();

  // Check one-time downtime
  if (m.downtime) {
    if (m.downtime.startDate <= now && (!m.downtime.endDate || m.downtime.endDate >= now)) {
      return true;
    }
  }

  // Check recurring rules
  if (m.recurringDowntime) {
    for (const rule of m.recurringDowntime) {
      if (isDateInRecurringRule(rule, now)) return true;
    }
  }

  return false;
}

// Check if a machine's one-time downtime window has already ended.
export function isDowntimeEnded(m: Machine): boolean {
  if (!m.downtime) return false;
  if (!m.downtime.endDate) return false; // open-ended → never "ended"
  return m.downtime.endDate < new Date();
}

// Check if a machine has active or future downtime (relevant for planning).
// Past finite windows are excluded — they no longer affect planning decisions.
// Also considers recurring rules that are still active or scheduled.
export function hasMachineDowntime(m: Machine): boolean {
  if (m.downtime && !isDowntimeEnded(m)) return true;
  if (m.recurringDowntime && m.recurringDowntime.length > 0) {
    const now = new Date();
    return m.recurringDowntime.some(
      (r) => !r.endDate || r.endDate >= now
    );
  }
  return false;
}

// Check if a recurring rule has expired (end date is in the past).
export function isRecurringRuleExpired(rule: RecurringDowntimeRule): boolean {
  if (!rule.endDate) return false;
  return rule.endDate < new Date();
}

export interface BatchChain {
  id: string;
  batchName: string;
  seriesNumber: number;
  productLine: string;
  status: BatchStatus;
}

export interface Stage {
  id: string;
  machineId: string;
  batchChainId: string;
  stageType: StageType;
  startDatetime: Date;
  endDatetime: Date;
  state: StageState;
}

export interface MachineDisplayGroup {
  id: string;
  name: string;
  machineIds: string[];
}

export interface ViewConfig {
  viewStart: Date;
  numberOfDays: number;
}

export interface CheckpointTask {
  id: string;
  machineId: string;
  plannedDatetime: Date;
  taskCode: string;
  description: string;
  status: 'planned' | 'done' | 'not_possible';
  confirmedBy?: string;
  confirmedAt?: Date;
  comment?: string;
  batchChainId?: string;
}

export interface MaintenanceTask {
  id: string;
  machineId: string;
  plannedStart: Date;
  plannedEnd: Date;
  taskCode: string;
  taskType: string;
  status: 'planned' | 'acknowledged' | 'not_possible';
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  comment?: string;
}

// Turnaround activity type — defines required gap activities between batches
// (e.g. CIP, SIP, Cleaning). Configured per equipment group in Process Setup.
export interface TurnaroundActivity {
  id: string;
  name: string;               // user-defined label, e.g. "CIP", "SIP", "Cleaning"
  durationDays: number;       // days component of duration
  durationHours: number;      // hours component of duration
  durationMinutes: number;    // minutes component of duration
  equipmentGroup: string;       // references EquipmentGroup.id
  isDefault: boolean;         // if true, auto-inserted when scheduling new batches
}

// Computed total duration in hours for scheduling math
export function turnaroundTotalHours(t: TurnaroundActivity): number {
  return t.durationDays * 24 + t.durationHours + t.durationMinutes / 60;
}

// Planned shutdown period — blocks all machines for the duration.
// Used for plant-wide shutdowns, annual maintenance windows, etc.
export interface ShutdownPeriod {
  id: string;
  name: string;            // e.g. "Annual Shutdown 2026", "Christmas Break"
  startDate: Date;
  endDate: Date;
  reason?: string;         // optional note
}

// ── Batch naming / nomenclature ──────────────────────────────────────

// Per-line naming rule (prefix, suffix, padding).
// The final production stage sets the batch name; upstream stages inherit it.
export interface BatchNamingRule {
  prefix: string;           // optional prefix, e.g. "LOT-", "B-" (may be empty)
  suffix: string;           // optional suffix appended after the counter
  startNumber: number;      // first counter value after reset (default 1)
  padDigits: number;        // zero-padding width, e.g. 3 → "001"
  step: number;             // counter increment per batch (default 1)
  nextNumber?: number;      // current counter (used when counterResetMode === 'none')
}

// Top-level naming configuration stored in the Zustand store.
export interface BatchNamingConfig {
  mode: 'shared' | 'per_product_line';          // one rule for all lines vs. one per line
  sharedRule: BatchNamingRule;                   // used when mode === 'shared'
  productLineRules: Record<string, BatchNamingRule>; // keyed by ProductLine.id, used when mode === 'per_product_line'
  counterResetMode: 'annual' | 'custom' | 'none';  // when counter resets (none = continuous)
  counterResetMonth: number;                     // 1-12 (default 1 = January)
  counterResetDay: number;                       // 1-31 (default 1)
}


const TYPICAL_BATCH_PREFIXES = ['B', 'LOT', 'BAT', 'LB', 'BT', 'L', 'P'];

function randomLetters(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

/** Generate one random lot-style prefix (with trailing dash), e.g. "LOT-" or "AB-". */
export function generateRandomBatchPrefix(maxLetters: number = 3): string {
  const maxLen = Math.max(1, Math.min(3, maxLetters || 3));
  const fromTypical = Math.random() < 0.7;
  const base = fromTypical
    ? TYPICAL_BATCH_PREFIXES[Math.floor(Math.random() * TYPICAL_BATCH_PREFIXES.length)]
    : randomLetters(1 + Math.floor(Math.random() * maxLen));
  return `${base}-`;
}

/** Build a preview batch name from a naming rule and a sample counter value. */
export function batchNamePreview(rule: BatchNamingRule, counter: number): string {
  const num = String(counter).padStart(rule.padDigits, '0');
  return `${rule.prefix}${num}${rule.suffix}`;
}

/** Build a sequence of preview batch names showing the step pattern. */
export function batchNamePreviewSequence(rule: BatchNamingRule, startCounter: number, count: number): string[] {
  const step = rule.step || 1;
  return Array.from({ length: count }, (_, i) =>
    batchNamePreview(rule, startCounter + i * step)
  );
}

// ── Shift rotation configuration ────────────────────────────────────

export interface ShiftTeam {
  name: string;           // e.g. "Blue", "Alpha", "Team A"
  color: string;          // hex color for shift band, e.g. "#0066FF"
}

/** Manual override for a specific shift slot (Enterprise feature). */
export interface ShiftOverride {
  date: Date;
  shiftIndex: number;     // 0 = day (06–18), 1 = night (18–06)
  teamIndex: number;      // which team takes this slot
  reason?: string;
}

/**
 * User-configurable shift rotation. The cycle array defines which team
 * works each consecutive 12-hour block starting from the anchor date.
 * Ported from VBA: default is 8-step Russian pattern [0,2,1,3,2,0,3,1].
 */
export interface ShiftRotation {
  teams: ShiftTeam[];         // typically 4 teams
  shiftLengthHours: number;   // variable: 6, 7.5, 8, 12 (set by rotation preset)
  cyclePattern: number[];     // team indices, e.g. [0,2,1,3,2,0,3,1]
  anchorDate: Date;           // cycle alignment reference point
  dayShiftStartHour: number;  // when day shift begins (default 6)
  overrides: ShiftOverride[]; // Enterprise only
  // Plant coverage fields:
  activeDays: boolean[];          // [Sun, Mon, Tue, Wed, Thu, Fri, Sat] — which days are operational
  operatingHoursStart: number;    // 0–23, plant opens (used for non-24h operation)
  operatingHoursEnd: number;      // 0–24, plant closes (24 = midnight = 24h continuous)
}
