// PlantPulse Scheduler — Core TypeScript interfaces
// Mapped from VBA BigReadArray + modern extensions (see CLAUDE.md)

export type MachineGroup = 'propagator' | 'pre_fermenter' | 'fermenter' | 'inoculum';
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

export interface Machine {
  id: string;
  name: string;
  group: MachineGroup;
  productLine?: string;
  displayOrder: number;
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
