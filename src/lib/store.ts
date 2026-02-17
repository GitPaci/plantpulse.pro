// Zustand store — replaces VBA BigReadArray as in-memory schedule store

import { create } from 'zustand';
import { startOfDay, subDays } from 'date-fns';
import type {
  Machine,
  BatchChain,
  Stage,
  ProductLine,
  MachineDisplayGroup,
  ViewConfig,
} from './types';
import {
  DEFAULT_MACHINES,
  DEFAULT_GROUPS,
  DEFAULT_PRODUCT_LINES,
  generateDemoData,
} from './demo-data';

interface PlantPulseState {
  // Data
  machines: Machine[];
  machineGroups: MachineDisplayGroup[];
  productLines: ProductLine[];
  batchChains: BatchChain[];
  stages: Stage[];
  viewConfig: ViewConfig;

  // Actions
  setViewConfig: (config: Partial<ViewConfig>) => void;
  loadDemoData: () => void;
  setStages: (stages: Stage[]) => void;
  setBatchChains: (chains: BatchChain[]) => void;
}

export const usePlantPulseStore = create<PlantPulseState>((set, get) => ({
  machines: DEFAULT_MACHINES,
  machineGroups: DEFAULT_GROUPS,
  productLines: DEFAULT_PRODUCT_LINES,
  batchChains: [],
  stages: [],
  viewConfig: {
    viewStart: subDays(startOfDay(new Date()), 4),
    numberOfDays: 21,
  },

  setViewConfig: (config) =>
    set((state) => ({
      viewConfig: { ...state.viewConfig, ...config },
    })),

  loadDemoData: () => {
    if (get().stages.length > 0) return; // already loaded
    const { chains, stages } = generateDemoData();
    set({ batchChains: chains, stages });
  },

  setStages: (stages) => set({ stages }),
  setBatchChains: (chains) => set({ batchChains: chains }),
}));
