// Zustand store — replaces VBA BigReadArray as in-memory schedule store
// CRUD actions for stages, batch chains, machines, product lines, display groups

import { create } from 'zustand';
import { startOfDay, subDays, addHours } from 'date-fns';
import type {
  Machine,
  BatchChain,
  Stage,
  ProductLine,
  MachineDisplayGroup,
  ViewConfig,
  TurnaroundActivity,
  EquipmentGroup,
  ShutdownPeriod,
} from './types';
import {
  DEFAULT_MACHINES,
  DEFAULT_GROUPS,
  DEFAULT_PRODUCT_LINES,
  DEFAULT_EQUIPMENT_GROUPS,
  generateDemoData,
} from './demo-data';

// ─── Helper: generate unique IDs ───────────────────────────────────────

let idCounter = Date.now();
export function generateId(prefix: string = ''): string {
  return `${prefix}${++idCounter}`;
}

// ─── State interface ───────────────────────────────────────────────────

interface PlantPulseState {
  // Data
  machines: Machine[];
  machineGroups: MachineDisplayGroup[];
  equipmentGroups: EquipmentGroup[];
  productLines: ProductLine[];
  batchChains: BatchChain[];
  stages: Stage[];
  turnaroundActivities: TurnaroundActivity[];
  shutdownPeriods: ShutdownPeriod[];
  viewConfig: ViewConfig;

  // ── View actions ──────────────────────────────────────────────────
  setViewConfig: (config: Partial<ViewConfig>) => void;
  resetViewToToday: () => void;
  loadDemoData: () => void;

  // ── Stage CRUD ────────────────────────────────────────────────────
  setStages: (stages: Stage[]) => void;
  addStage: (stage: Stage) => void;
  updateStage: (id: string, updates: Partial<Omit<Stage, 'id'>>) => void;
  deleteStage: (id: string) => void;
  moveStageToMachine: (stageId: string, newMachineId: string) => void;

  // ── Batch chain CRUD ──────────────────────────────────────────────
  setBatchChains: (chains: BatchChain[]) => void;
  addBatchChain: (chain: BatchChain) => void;
  updateBatchChain: (id: string, updates: Partial<Omit<BatchChain, 'id'>>) => void;
  deleteBatchChain: (id: string) => void;

  // ── Bulk operations ───────────────────────────────────────────────
  bulkShiftStages: (
    stageIds: string[],
    deltaHours: number,
  ) => void;

  // ── Machine CRUD ──────────────────────────────────────────────────
  setMachines: (machines: Machine[]) => void;
  addMachine: (machine: Machine) => void;
  updateMachine: (id: string, updates: Partial<Omit<Machine, 'id'>>) => void;
  deleteMachine: (id: string) => void;

  // ── Machine display groups ────────────────────────────────────────
  setMachineGroups: (groups: MachineDisplayGroup[]) => void;
  addMachineGroup: (group: MachineDisplayGroup) => void;
  updateMachineGroup: (id: string, updates: Partial<Omit<MachineDisplayGroup, 'id'>>) => void;
  deleteMachineGroup: (id: string) => void;

  // ── Equipment groups ─────────────────────────────────────────────
  setEquipmentGroups: (groups: EquipmentGroup[]) => void;
  addEquipmentGroup: (group: EquipmentGroup) => void;
  updateEquipmentGroup: (id: string, updates: Partial<Omit<EquipmentGroup, 'id'>>) => void;
  deleteEquipmentGroup: (id: string) => void;

  // ── Product line CRUD ─────────────────────────────────────────────
  setProductLines: (lines: ProductLine[]) => void;
  addProductLine: (line: ProductLine) => void;
  updateProductLine: (id: string, updates: Partial<Omit<ProductLine, 'id'>>) => void;
  deleteProductLine: (id: string) => void;

  // ── Turnaround activities ─────────────────────────────────────────
  setTurnaroundActivities: (activities: TurnaroundActivity[]) => void;
  addTurnaroundActivity: (activity: TurnaroundActivity) => void;
  updateTurnaroundActivity: (id: string, updates: Partial<Omit<TurnaroundActivity, 'id'>>) => void;
  deleteTurnaroundActivity: (id: string) => void;

  // ── Shutdown periods ────────────────────────────────────────────
  setShutdownPeriods: (periods: ShutdownPeriod[]) => void;
  addShutdownPeriod: (period: ShutdownPeriod) => void;
  updateShutdownPeriod: (id: string, updates: Partial<Omit<ShutdownPeriod, 'id'>>) => void;
  deleteShutdownPeriod: (id: string) => void;
}

// ─── Store ─────────────────────────────────────────────────────────────

export const usePlantPulseStore = create<PlantPulseState>((set, get) => ({
  machines: DEFAULT_MACHINES,
  machineGroups: DEFAULT_GROUPS,
  equipmentGroups: DEFAULT_EQUIPMENT_GROUPS,
  productLines: DEFAULT_PRODUCT_LINES,
  batchChains: [],
  stages: [],
  turnaroundActivities: [],
  shutdownPeriods: [],
  viewConfig: {
    viewStart: subDays(startOfDay(new Date()), 4),
    numberOfDays: 21,
  },

  // ── View actions ──────────────────────────────────────────────────

  setViewConfig: (config) =>
    set((state) => ({
      viewConfig: { ...state.viewConfig, ...config },
    })),

  resetViewToToday: () =>
    set((state) => ({
      viewConfig: {
        ...state.viewConfig,
        viewStart: subDays(startOfDay(new Date()), 4),
      },
    })),

  loadDemoData: () => {
    if (get().stages.length > 0) return; // already loaded
    const { chains, stages } = generateDemoData();
    set({ batchChains: chains, stages });
  },

  // ── Stage CRUD ────────────────────────────────────────────────────

  setStages: (stages) => set({ stages }),

  addStage: (stage) =>
    set((state) => ({ stages: [...state.stages, stage] })),

  updateStage: (id, updates) =>
    set((state) => ({
      stages: state.stages.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),

  deleteStage: (id) =>
    set((state) => ({
      stages: state.stages.filter((s) => s.id !== id),
    })),

  moveStageToMachine: (stageId, newMachineId) =>
    set((state) => ({
      stages: state.stages.map((s) =>
        s.id === stageId ? { ...s, machineId: newMachineId } : s
      ),
    })),

  // ── Batch chain CRUD ──────────────────────────────────────────────

  setBatchChains: (chains) => set({ batchChains: chains }),

  addBatchChain: (chain) =>
    set((state) => ({ batchChains: [...state.batchChains, chain] })),

  updateBatchChain: (id, updates) =>
    set((state) => ({
      batchChains: state.batchChains.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

  deleteBatchChain: (id) =>
    set((state) => ({
      // Remove chain and all its stages
      batchChains: state.batchChains.filter((c) => c.id !== id),
      stages: state.stages.filter((s) => s.batchChainId !== id),
    })),

  // ── Bulk operations ───────────────────────────────────────────────

  bulkShiftStages: (stageIds, deltaHours) =>
    set((state) => ({
      stages: state.stages.map((s) => {
        if (!stageIds.includes(s.id)) return s;
        return {
          ...s,
          startDatetime: addHours(s.startDatetime, deltaHours),
          endDatetime: addHours(s.endDatetime, deltaHours),
        };
      }),
    })),

  // ── Machine CRUD ──────────────────────────────────────────────────

  setMachines: (machines) => set({ machines }),

  addMachine: (machine) =>
    set((state) => ({ machines: [...state.machines, machine] })),

  updateMachine: (id, updates) =>
    set((state) => ({
      machines: state.machines.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    })),

  deleteMachine: (id) =>
    set((state) => ({
      machines: state.machines.filter((m) => m.id !== id),
      // Also remove from display groups
      machineGroups: state.machineGroups.map((g) => ({
        ...g,
        machineIds: g.machineIds.filter((mid) => mid !== id),
      })),
    })),

  // ── Machine display groups ────────────────────────────────────────

  setMachineGroups: (groups) => set({ machineGroups: groups }),

  addMachineGroup: (group) =>
    set((state) => ({ machineGroups: [...state.machineGroups, group] })),

  updateMachineGroup: (id, updates) =>
    set((state) => ({
      machineGroups: state.machineGroups.map((g) =>
        g.id === id ? { ...g, ...updates } : g
      ),
    })),

  deleteMachineGroup: (id) =>
    set((state) => ({
      machineGroups: state.machineGroups.filter((g) => g.id !== id),
    })),

  // ── Equipment groups ─────────────────────────────────────────────

  setEquipmentGroups: (groups) => set({ equipmentGroups: groups }),

  addEquipmentGroup: (group) =>
    set((state) => ({ equipmentGroups: [...state.equipmentGroups, group] })),

  updateEquipmentGroup: (id, updates) =>
    set((state) => ({
      equipmentGroups: state.equipmentGroups.map((eg) =>
        eg.id === id ? { ...eg, ...updates } : eg
      ),
    })),

  deleteEquipmentGroup: (id) =>
    set((state) => ({
      equipmentGroups: state.equipmentGroups.filter((eg) => eg.id !== id),
    })),

  // ── Product line CRUD ─────────────────────────────────────────────

  setProductLines: (lines) => set({ productLines: lines }),

  addProductLine: (line) =>
    set((state) => ({ productLines: [...state.productLines, line] })),

  updateProductLine: (id, updates) =>
    set((state) => ({
      productLines: state.productLines.map((pl) =>
        pl.id === id ? { ...pl, ...updates } : pl
      ),
    })),

  deleteProductLine: (id) =>
    set((state) => ({
      productLines: state.productLines.filter((pl) => pl.id !== id),
    })),

  // ── Turnaround activities ─────────────────────────────────────────

  setTurnaroundActivities: (activities) =>
    set({ turnaroundActivities: activities }),

  addTurnaroundActivity: (activity) =>
    set((state) => ({
      turnaroundActivities: [...state.turnaroundActivities, activity],
    })),

  updateTurnaroundActivity: (id, updates) =>
    set((state) => ({
      turnaroundActivities: state.turnaroundActivities.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    })),

  deleteTurnaroundActivity: (id) =>
    set((state) => ({
      turnaroundActivities: state.turnaroundActivities.filter((a) => a.id !== id),
    })),

  // ── Shutdown periods ────────────────────────────────────────────

  setShutdownPeriods: (periods) => set({ shutdownPeriods: periods }),

  addShutdownPeriod: (period) =>
    set((state) => ({ shutdownPeriods: [...state.shutdownPeriods, period] })),

  updateShutdownPeriod: (id, updates) =>
    set((state) => ({
      shutdownPeriods: state.shutdownPeriods.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),

  deleteShutdownPeriod: (id) =>
    set((state) => ({
      shutdownPeriods: state.shutdownPeriods.filter((p) => p.id !== id),
    })),
}));
