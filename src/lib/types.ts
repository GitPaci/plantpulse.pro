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

export type StageType = 'propagation' | 'pre_fermentation' | 'fermentation';
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

// Check if a machine has any downtime defined (active, future, or past open-ended).
// Used for the yellow indicator dot in Equipment Setup.
export function hasMachineDowntime(m: Machine): boolean {
  return m.downtime !== undefined;
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
