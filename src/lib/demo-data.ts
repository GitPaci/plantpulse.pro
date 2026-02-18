// Demo data generator — produces realistic batch schedules matching VBA legacy defaults
// Machine configuration from VBA `imena` array; batch chains for KK + GNT lines

import { addHours, subHours, startOfDay, subDays } from 'date-fns';
import type {
  Machine,
  BatchChain,
  Stage,
  ProductLine,
  MachineDisplayGroup,
} from './types';

// ─── Default machines (from VBA imena array) ───────────────────────────

export const DEFAULT_MACHINES: Machine[] = [
  // Inoculum vessels — "B" prefix from Slovenian "Buča" (flask), lab inoculum flasks
  { id: 'BKK', name: 'BKK', group: 'inoculum', displayOrder: 0 },
  { id: 'BGNT', name: 'BGNT', group: 'inoculum', displayOrder: 0.5 },
  // GNT line — propagators
  { id: 'PR-1', name: 'PR-1', group: 'propagator', productLine: 'GNT', displayOrder: 1 },
  { id: 'PR-2', name: 'PR-2', group: 'propagator', productLine: 'GNT', displayOrder: 2 },
  // GNT line — pre-fermenters
  { id: 'PF-1', name: 'PF-1', group: 'pre_fermenter', productLine: 'GNT', displayOrder: 3 },
  { id: 'PF-2', name: 'PF-2', group: 'pre_fermenter', productLine: 'GNT', displayOrder: 4 },
  // GNT line — fermenters
  { id: 'F-2', name: 'F-2', group: 'fermenter', productLine: 'GNT', displayOrder: 5 },
  { id: 'F-3', name: 'F-3', group: 'fermenter', productLine: 'GNT', displayOrder: 6 },
  // KK line — propagators
  { id: 'PR-3', name: 'PR-3', group: 'propagator', productLine: 'KK', displayOrder: 10 },
  { id: 'PR-4', name: 'PR-4', group: 'propagator', productLine: 'KK', displayOrder: 11 },
  { id: 'PR-5', name: 'PR-5', group: 'propagator', productLine: 'KK', displayOrder: 12 },
  { id: 'PR-6', name: 'PR-6', group: 'propagator', productLine: 'KK', displayOrder: 13 },
  { id: 'PR-7', name: 'PR-7', group: 'propagator', productLine: 'KK', displayOrder: 14 },
  { id: 'PR-8', name: 'PR-8', group: 'propagator', productLine: 'KK', displayOrder: 15 },
  // KK line — pre-fermenters
  { id: 'PF-3', name: 'PF-3', group: 'pre_fermenter', productLine: 'KK', displayOrder: 16 },
  { id: 'PF-4', name: 'PF-4', group: 'pre_fermenter', productLine: 'KK', displayOrder: 17 },
  { id: 'PF-5', name: 'PF-5', group: 'pre_fermenter', productLine: 'KK', displayOrder: 18 },
  { id: 'PF-6', name: 'PF-6', group: 'pre_fermenter', productLine: 'KK', displayOrder: 19 },
  // KK line — fermenters
  { id: 'F-1', name: 'F-1', group: 'fermenter', productLine: 'KK', displayOrder: 20 },
  { id: 'F-4', name: 'F-4', group: 'fermenter', productLine: 'KK', displayOrder: 21 },
  { id: 'F-5', name: 'F-5', group: 'fermenter', productLine: 'KK', displayOrder: 22 },
  { id: 'F-6', name: 'F-6', group: 'fermenter', productLine: 'KK', displayOrder: 23 },
  { id: 'F-7', name: 'F-7', group: 'fermenter', productLine: 'KK', displayOrder: 24 },
  { id: 'F-8', name: 'F-8', group: 'fermenter', productLine: 'KK', displayOrder: 25 },
  { id: 'F-9', name: 'F-9', group: 'fermenter', productLine: 'KK', displayOrder: 26 },
  { id: 'F-10', name: 'F-10', group: 'fermenter', productLine: 'KK', displayOrder: 27 },
  { id: 'F-11', name: 'F-11', group: 'fermenter', productLine: 'KK', displayOrder: 28 },
];

// ─── Display groups (separated by sentinel in VBA) ─────────────────────

// Inoculum group — used only by Schedule view, not in the default display groups
// to avoid impacting Wallboard and Planner views
export const INOCULUM_GROUP: MachineDisplayGroup = {
  id: 'Inoculum',
  name: 'Inoculum',
  machineIds: ['BKK', 'BGNT'],
};

export const DEFAULT_GROUPS: MachineDisplayGroup[] = [
  {
    id: 'GNT',
    name: 'GNT Line',
    machineIds: ['PR-1', 'PR-2', 'PF-1', 'PF-2', 'F-2', 'F-3'],
  },
  {
    id: 'KK',
    name: 'KK Line',
    machineIds: [
      'PR-3', 'PR-4', 'PR-5', 'PR-6', 'PR-7', 'PR-8',
      'PF-3', 'PF-4', 'PF-5', 'PF-6',
      'F-1', 'F-4', 'F-5', 'F-6', 'F-7', 'F-8', 'F-9', 'F-10', 'F-11',
    ],
  },
];

// ─── Product lines ──────────────────────────────────────────────────────

export const DEFAULT_PRODUCT_LINES: ProductLine[] = [
  {
    id: 'GNT',
    name: 'Gentamicin',
    displayOrder: 1,
    stageDefaults: [
      { stageType: 'propagation', defaultDurationHours: 48, machineGroup: 'propagator' },
      { stageType: 'pre_fermentation', defaultDurationHours: 55, machineGroup: 'pre_fermenter' },
      { stageType: 'fermentation', defaultDurationHours: 192, machineGroup: 'fermenter' },
    ],
  },
  {
    id: 'KK',
    name: 'KK',
    displayOrder: 2,
    stageDefaults: [
      { stageType: 'propagation', defaultDurationHours: 44, machineGroup: 'propagator' },
      { stageType: 'pre_fermentation', defaultDurationHours: 20, machineGroup: 'pre_fermenter' },
      { stageType: 'fermentation', defaultDurationHours: 192, machineGroup: 'fermenter' },
    ],
  },
];

// ─── Demo data generation ───────────────────────────────────────────────

const KK_FERMENTERS = ['F-1', 'F-4', 'F-5', 'F-6', 'F-7', 'F-8', 'F-9', 'F-10', 'F-11'];
const KK_PRE_FERMENTERS = ['PF-3', 'PF-4', 'PF-5', 'PF-6'];
const KK_PROPAGATORS = ['PR-3', 'PR-4', 'PR-5', 'PR-6', 'PR-7', 'PR-8'];

const GNT_FERMENTERS = ['F-2', 'F-3'];
const GNT_PRE_FERMENTERS = ['PF-1', 'PF-2'];
const GNT_PROPAGATORS = ['PR-1', 'PR-2'];

/**
 * Generate deterministic demo batch data centered around today.
 * Creates realistic KK and GNT line schedules.
 */
export function generateDemoData(): {
  chains: BatchChain[];
  stages: Stage[];
} {
  const chains: BatchChain[] = [];
  const stages: Stage[] = [];

  const today = startOfDay(new Date());
  // Base date: 12 days before today so we have history + future
  const baseDate = subDays(today, 12);

  let seriesNum = 42;
  let pfIdx = 0;
  let prIdx = 0;
  let stageId = 1;

  // KK line: generate 2 batches per fermenter, staggered across time
  for (let fi = 0; fi < KK_FERMENTERS.length; fi++) {
    const fermenter = KK_FERMENTERS[fi];
    // Stagger start: each fermenter starts a bit later
    const fermenterBase = addHours(baseDate, fi * 28);

    for (let batch = 0; batch < 2; batch++) {
      const fDurationHours = 168 + (seriesNum % 5) * 24; // 7–11 days
      const fStart = addHours(fermenterBase, batch * (fDurationHours + 36));
      const fEnd = addHours(fStart, fDurationHours);

      // Back-calculate PF: 20h before fermenter start
      const pfStart = subHours(fStart, 20);
      const pfEnd = new Date(fStart.getTime());
      const pfMachine = KK_PRE_FERMENTERS[pfIdx % KK_PRE_FERMENTERS.length];
      pfIdx++;

      // Back-calculate PR: 44h before PF start
      const prStart = subHours(pfStart, 44);
      const prEnd = new Date(pfStart.getTime());
      const prMachine = KK_PROPAGATORS[prIdx % KK_PROPAGATORS.length];
      prIdx++;

      const chainId = `KK-${seriesNum}`;

      chains.push({
        id: chainId,
        batchName: `KK-${seriesNum}`,
        seriesNumber: seriesNum,
        productLine: 'KK',
        status: fStart < today ? 'committed' : 'proposed',
      });

      stages.push(
        {
          id: `s-${stageId++}`,
          machineId: prMachine,
          batchChainId: chainId,
          stageType: 'propagation',
          startDatetime: prStart,
          endDatetime: prEnd,
          state: prEnd < today ? 'completed' : prStart < today ? 'active' : 'planned',
        },
        {
          id: `s-${stageId++}`,
          machineId: pfMachine,
          batchChainId: chainId,
          stageType: 'pre_fermentation',
          startDatetime: pfStart,
          endDatetime: pfEnd,
          state: pfEnd < today ? 'completed' : pfStart < today ? 'active' : 'planned',
        },
        {
          id: `s-${stageId++}`,
          machineId: fermenter,
          batchChainId: chainId,
          stageType: 'fermentation',
          startDatetime: fStart,
          endDatetime: fEnd,
          state: fEnd < today ? 'completed' : fStart < today ? 'active' : 'planned',
        }
      );

      seriesNum++;
    }
  }

  // GNT line: generate 1 batch per fermenter
  let gntSeries = 10;
  let gntPfIdx = 0;
  let gntPrIdx = 0;

  for (let fi = 0; fi < GNT_FERMENTERS.length; fi++) {
    const fermenter = GNT_FERMENTERS[fi];
    const fStart = addHours(baseDate, fi * 72 + 48);
    const fEnd = addHours(fStart, 192);

    const pfStart = subHours(fStart, 55);
    const pfEnd = new Date(fStart.getTime());
    const pfMachine = GNT_PRE_FERMENTERS[gntPfIdx % GNT_PRE_FERMENTERS.length];
    gntPfIdx++;

    const prStart = subHours(pfStart, 48);
    const prEnd = new Date(pfStart.getTime());
    const prMachine = GNT_PROPAGATORS[gntPrIdx % GNT_PROPAGATORS.length];
    gntPrIdx++;

    const chainId = `GNT-${gntSeries}`;

    chains.push({
      id: chainId,
      batchName: `GNT-${gntSeries}`,
      seriesNumber: gntSeries,
      productLine: 'GNT',
      status: 'committed',
    });

    stages.push(
      {
        id: `s-${stageId++}`,
        machineId: prMachine,
        batchChainId: chainId,
        stageType: 'propagation',
        startDatetime: prStart,
        endDatetime: prEnd,
        state: prEnd < today ? 'completed' : 'active',
      },
      {
        id: `s-${stageId++}`,
        machineId: pfMachine,
        batchChainId: chainId,
        stageType: 'pre_fermentation',
        startDatetime: pfStart,
        endDatetime: pfEnd,
        state: pfEnd < today ? 'completed' : 'active',
      },
      {
        id: `s-${stageId++}`,
        machineId: fermenter,
        batchChainId: chainId,
        stageType: 'fermentation',
        startDatetime: fStart,
        endDatetime: fEnd,
        state: fEnd < today ? 'completed' : 'active',
      }
    );

    gntSeries++;
  }

  return { chains, stages };
}
