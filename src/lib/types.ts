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
  displayOrder: number;  // controls dropdown and display sort order
}

export type StageState = 'planned' | 'active' | 'completed';
export type BatchStatus = 'draft' | 'proposed' | 'committed';

export interface ProductLine {
  id: string;
  name: string;
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

export interface Machine {
  id: string;
  name: string;
  group: MachineGroup;
  productLine?: string;
  displayOrder: number;
  downtime?: MachineDowntime;  // optional unavailability window
}

// Check if a machine is currently unavailable at a given point in time.
// Used by the scheduling engine to exclude machines from auto-assignment.
export function isMachineUnavailable(m: Machine, atDate?: Date): boolean {
  if (!m.downtime) return false;
  const now = atDate ?? new Date();
  if (m.downtime.startDate > now) return false; // downtime is in the future
  if (m.downtime.endDate && m.downtime.endDate < now) return false; // downtime has ended
  return true;
}

// Check if a machine's downtime window has already ended.
export function isDowntimeEnded(m: Machine): boolean {
  if (!m.downtime) return false;
  if (!m.downtime.endDate) return false; // open-ended → never "ended"
  return m.downtime.endDate < new Date();
}

// Check if a machine has active or future downtime (relevant for planning).
// Past finite windows are excluded — they no longer affect planning decisions.
export function hasMachineDowntime(m: Machine): boolean {
  if (!m.downtime) return false;
  return !isDowntimeEnded(m);
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
