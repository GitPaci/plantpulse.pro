// Demo data generator — produces realistic batch schedules for biotech fermentation
// Machine configuration from VBA `imena` array; rotating product catalog for demo variety

import { addHours, subHours, startOfDay, subDays } from 'date-fns';
import type {
  Machine,
  BatchChain,
  Stage,
  ProductLine,
  MachineDisplayGroup,
  EquipmentGroup,
  StageTypeDefinition,
  TurnaroundActivity,
  BatchNamingConfig,
  ShiftRotation,
} from './types';

// ─── Default equipment groups (user-configurable at runtime) ─────────

export const DEFAULT_EQUIPMENT_GROUPS: EquipmentGroup[] = [
  { id: 'inoculum',       name: 'Inoculum',       shortName: 'INO',  displayOrder: 0 },
  { id: 'propagator',     name: 'Propagator',     shortName: 'PR',   displayOrder: 1 },
  { id: 'pre_fermenter',  name: 'Pre-fermenter',  shortName: 'PF',   displayOrder: 2 },
  { id: 'fermenter',      name: 'Fermenter',      shortName: 'F',    displayOrder: 3 },
];

// ─── Default stage type definitions (biopharma literature nomenclature) ──

export const DEFAULT_STAGE_TYPE_DEFINITIONS: StageTypeDefinition[] = [
  { id: 'inoculum',   name: 'Inoculum',    shortName: 'INO',  description: 'Flask-scale inoculum preparation',  count: 1, displayOrder: 0 },
  { id: 'seed_n2',    name: 'Seed (n-2)',   shortName: 'n-2',  description: 'Early seed expansion',              count: 1, displayOrder: 1 },
  { id: 'seed_n1',    name: 'Seed (n-1)',   shortName: 'n-1',  description: 'Late seed expansion',               count: 1, displayOrder: 2 },
  { id: 'production', name: 'Production',   shortName: 'PROD', description: 'Main/production fermenter',         count: 1, displayOrder: 3 },
];

// ─── Default turnaround activities per equipment group ──────────────────
// Activities that occur between consecutive batches on the same vessel.
// Durations scale with vessel size: inoculum < propagator < pre-fermenter < fermenter.

export const DEFAULT_TURNAROUND_ACTIVITIES: TurnaroundActivity[] = [
  // Inoculum — minimal turnaround (flask-scale)
  { id: 'ta-ino-media',    name: 'Media Preparation & Inoculation', durationDays: 0, durationHours: 2, durationMinutes: 0, equipmentGroup: 'inoculum',      isDefault: true },

  // Propagator (Seed n-2) — small vessel CIP/media/SIP cycle
  { id: 'ta-pr-cip',       name: 'CIP',                durationDays: 0, durationHours: 1, durationMinutes: 0, equipmentGroup: 'propagator',    isDefault: true },
  { id: 'ta-pr-media',     name: 'Media Preparation',  durationDays: 0, durationHours: 2, durationMinutes: 0, equipmentGroup: 'propagator',    isDefault: true },
  { id: 'ta-pr-sip',       name: 'SIP',                durationDays: 0, durationHours: 1, durationMinutes: 0, equipmentGroup: 'propagator',    isDefault: true },

  // Pre-fermenter (Seed n-1) — medium vessel CIP/media/SIP cycle
  { id: 'ta-pf-cip',       name: 'CIP',                durationDays: 0, durationHours: 1, durationMinutes: 0, equipmentGroup: 'pre_fermenter', isDefault: true },
  { id: 'ta-pf-media',     name: 'Media Preparation',  durationDays: 0, durationHours: 4, durationMinutes: 0, equipmentGroup: 'pre_fermenter', isDefault: true },
  { id: 'ta-pf-sip',       name: 'SIP',                durationDays: 0, durationHours: 2, durationMinutes: 0, equipmentGroup: 'pre_fermenter', isDefault: true },

  // Fermenter (Production) — large vessel full turnaround cycle + downstream transfer
  { id: 'ta-f-cip',        name: 'CIP',                     durationDays: 0, durationHours: 1, durationMinutes: 0, equipmentGroup: 'fermenter',     isDefault: true },
  { id: 'ta-f-media',      name: 'Media Preparation',       durationDays: 0, durationHours: 6, durationMinutes: 0, equipmentGroup: 'fermenter',     isDefault: true },
  { id: 'ta-f-sip',        name: 'SIP',                     durationDays: 0, durationHours: 3, durationMinutes: 0, equipmentGroup: 'fermenter',     isDefault: true },
  { id: 'ta-f-transfer',   name: 'Transfer to Downstream',  durationDays: 0, durationHours: 3, durationMinutes: 0, equipmentGroup: 'fermenter',     isDefault: true },
];

// ─── Default wallboard equipment groups (shopfloor focus, excludes inoculum) ─

export const DEFAULT_WALLBOARD_EQUIPMENT_GROUPS: string[] = [
  'propagator', 'pre_fermenter', 'fermenter',
];

// ─── PlantPulse demo product catalog ─────────────────────────────────────
// Rotating list of realistic biotech fermentation products. Each demo session
// picks 2 products to showcase that PlantPulse handles diverse product types.

export interface DemoProduct {
  id: string;
  name: string;
  shortName: string;
}

export const DEMO_PRODUCT_CATALOG: DemoProduct[] = [
  { id: 'AD',  name: 'Adalimumab',      shortName: 'AD'  },
  { id: 'RTX', name: 'Rituximab',       shortName: 'RTX' },
  { id: 'TRZ', name: 'Trastuzumab',     shortName: 'TRZ' },
  { id: 'BVZ', name: 'Bevacizumab',     shortName: 'BVZ' },
  { id: 'INS', name: 'Insulin',         shortName: 'INS' },
  { id: 'FIL', name: 'Filgrastim',      shortName: 'FIL' },
  { id: 'PEN', name: 'Penicillin G',    shortName: 'PEN' },
  { id: 'AZM', name: 'Azithromycin',    shortName: 'AZM' },
  { id: 'VAN', name: 'Vancomycin',      shortName: 'VAN' },
  { id: 'GNT', name: 'Gentamicin',      shortName: 'GNT' },
  { id: 'TOB', name: 'Tobramycin',      shortName: 'TOB' },
  { id: 'STR', name: 'Streptomycin',    shortName: 'STR' },
  { id: 'DOX', name: 'Doxycycline',     shortName: 'DOX' },
  { id: 'CEX', name: 'Cephalexin',      shortName: 'CEX' },
  { id: 'CFX', name: 'Cefuroxime',      shortName: 'CFX' },
  { id: 'CLA', name: 'Clavulanic Acid', shortName: 'CLA' },
  { id: 'B12', name: 'Vitamin B12',     shortName: 'B12' },
  { id: 'CAC', name: 'Citric Acid',     shortName: 'CAC' },
  { id: 'LYS', name: 'L-Lysine',        shortName: 'LYS' },
  { id: 'LAC', name: 'Lactic Acid',     shortName: 'LAC' },
];

/**
 * Pick N distinct products from the catalog using a deterministic daily seed.
 * The selection rotates each day so returning visitors see variety over time.
 */
function pickDemoProducts(count: number): DemoProduct[] {
  const today = new Date();
  // Simple date-based seed: changes daily
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  // Fisher-Yates shuffle with a seeded LCG pseudo-random
  const catalog = [...DEMO_PRODUCT_CATALOG];
  let rng = seed;
  for (let i = catalog.length - 1; i > 0; i--) {
    rng = ((rng * 1103515245 + 12345) & 0x7fffffff);
    const j = rng % (i + 1);
    [catalog[i], catalog[j]] = [catalog[j], catalog[i]];
  }
  return catalog.slice(0, count);
}

// Pick 2 demo products for this session (changes daily)
const [DEMO_LINE_A, DEMO_LINE_B] = pickDemoProducts(2);

// ─── Default batch naming configuration ──────────────────────────────────

export const DEFAULT_BATCH_NAMING_CONFIG: BatchNamingConfig = {
  mode: 'per_product_line',
  sharedRule: { prefix: 'B-', suffix: '', startNumber: 1, padDigits: 3, step: 1 },
  productLineRules: {
    [DEMO_LINE_A.id]: { prefix: `${DEMO_LINE_A.shortName}-`, suffix: '', startNumber: 1, padDigits: 3, step: 1 },
    [DEMO_LINE_B.id]: { prefix: `${DEMO_LINE_B.shortName}-`, suffix: '', startNumber: 1, padDigits: 3, step: 1 },
  },
  counterResetMode: 'annual',
  counterResetMonth: 1,
  counterResetDay: 1,
};

// ─── Default shift rotation (4-team Russian pattern from VBA) ───────────

export const DEFAULT_SHIFT_ROTATION: ShiftRotation = {
  teams: [
    { name: 'Blue',   color: '#0066FF' },
    { name: 'Green',  color: '#00CC00' },
    { name: 'Red',    color: '#FF0000' },
    { name: 'Yellow', color: '#FFFD00' },
  ],
  shiftLengthHours: 12,
  cyclePattern: [0, 2, 1, 3, 2, 0, 3, 1],
  anchorDate: new Date(2026, 0, 1, 6, 0, 0), // Jan 1 2026, 06:00
  dayShiftStartHour: 6,
  overrides: [],
  activeDays: [true, true, true, true, true, true, true],  // 24/7 default
  operatingHoursStart: 0,
  operatingHoursEnd: 24,
};

// ─── Default machines (from VBA imena array, tagged with demo product lines) ─

export const DEFAULT_MACHINES: Machine[] = [
  // Inoculum vessels — "B-" prefix from Slovenian "Buča" (flask), lab inoculum flasks
  { id: `B-${DEMO_LINE_B.shortName}`, name: `B-${DEMO_LINE_B.shortName}`, group: 'inoculum', displayOrder: 0 },
  { id: `B-${DEMO_LINE_A.shortName}`, name: `B-${DEMO_LINE_A.shortName}`, group: 'inoculum', displayOrder: 0.5 },
  // Line A (small line) — propagators
  { id: 'PR-1', name: 'PR-1', group: 'propagator', productLine: DEMO_LINE_A.id, displayOrder: 1 },
  { id: 'PR-2', name: 'PR-2', group: 'propagator', productLine: DEMO_LINE_A.id, displayOrder: 2 },
  // Line A — pre-fermenters
  { id: 'PF-1', name: 'PF-1', group: 'pre_fermenter', productLine: DEMO_LINE_A.id, displayOrder: 3 },
  { id: 'PF-2', name: 'PF-2', group: 'pre_fermenter', productLine: DEMO_LINE_A.id, displayOrder: 4 },
  // Line A — fermenters
  { id: 'F-2', name: 'F-2', group: 'fermenter', productLine: DEMO_LINE_A.id, displayOrder: 5 },
  { id: 'F-3', name: 'F-3', group: 'fermenter', productLine: DEMO_LINE_A.id, displayOrder: 6 },
  // Line B (large line) — propagators
  { id: 'PR-3', name: 'PR-3', group: 'propagator', productLine: DEMO_LINE_B.id, displayOrder: 10 },
  { id: 'PR-4', name: 'PR-4', group: 'propagator', productLine: DEMO_LINE_B.id, displayOrder: 11 },
  { id: 'PR-5', name: 'PR-5', group: 'propagator', productLine: DEMO_LINE_B.id, displayOrder: 12 },
  { id: 'PR-6', name: 'PR-6', group: 'propagator', productLine: DEMO_LINE_B.id, displayOrder: 13 },
  { id: 'PR-7', name: 'PR-7', group: 'propagator', productLine: DEMO_LINE_B.id, displayOrder: 14 },
  { id: 'PR-8', name: 'PR-8', group: 'propagator', productLine: DEMO_LINE_B.id, displayOrder: 15 },
  // Line B — pre-fermenters
  { id: 'PF-3', name: 'PF-3', group: 'pre_fermenter', productLine: DEMO_LINE_B.id, displayOrder: 16 },
  { id: 'PF-4', name: 'PF-4', group: 'pre_fermenter', productLine: DEMO_LINE_B.id, displayOrder: 17 },
  { id: 'PF-5', name: 'PF-5', group: 'pre_fermenter', productLine: DEMO_LINE_B.id, displayOrder: 18 },
  { id: 'PF-6', name: 'PF-6', group: 'pre_fermenter', productLine: DEMO_LINE_B.id, displayOrder: 19 },
  // Line B — fermenters
  { id: 'F-1', name: 'F-1', group: 'fermenter', productLine: DEMO_LINE_B.id, displayOrder: 20 },
  { id: 'F-4', name: 'F-4', group: 'fermenter', productLine: DEMO_LINE_B.id, displayOrder: 21 },
  { id: 'F-5', name: 'F-5', group: 'fermenter', productLine: DEMO_LINE_B.id, displayOrder: 22 },
  { id: 'F-6', name: 'F-6', group: 'fermenter', productLine: DEMO_LINE_B.id, displayOrder: 23 },
  { id: 'F-7', name: 'F-7', group: 'fermenter', productLine: DEMO_LINE_B.id, displayOrder: 24 },
  { id: 'F-8', name: 'F-8', group: 'fermenter', productLine: DEMO_LINE_B.id, displayOrder: 25 },
  { id: 'F-9', name: 'F-9', group: 'fermenter', productLine: DEMO_LINE_B.id, displayOrder: 26 },
  { id: 'F-10', name: 'F-10', group: 'fermenter', productLine: DEMO_LINE_B.id, displayOrder: 27 },
  { id: 'F-11', name: 'F-11', group: 'fermenter', productLine: DEMO_LINE_B.id, displayOrder: 28 },
];

// ─── Display groups (separated by sentinel in VBA) ─────────────────────

// Inoculum group — used only by Schedule view, not in the default display groups
// to avoid impacting Wallboard and Planner views
export const INOCULUM_GROUP: MachineDisplayGroup = {
  id: 'Inoculum',
  name: 'Inoculum',
  machineIds: [`B-${DEMO_LINE_B.shortName}`, `B-${DEMO_LINE_A.shortName}`],
};

export const DEFAULT_GROUPS: MachineDisplayGroup[] = [
  {
    id: DEMO_LINE_A.id,
    name: `${DEMO_LINE_A.shortName} Line`,
    machineIds: ['PR-1', 'PR-2', 'PF-1', 'PF-2', 'F-2', 'F-3'],
  },
  {
    id: DEMO_LINE_B.id,
    name: `${DEMO_LINE_B.shortName} Line`,
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
    id: DEMO_LINE_A.id,
    name: DEMO_LINE_A.name,
    shortName: DEMO_LINE_A.shortName,
    displayOrder: 1,
    stageDefaults: [
      { stageType: 'inoculum', defaultDurationHours: 24, minDurationHours: 22, maxDurationHours: 26, machineGroup: 'inoculum' },
      { stageType: 'seed_n2', defaultDurationHours: 48, minDurationHours: 43, maxDurationHours: 53, machineGroup: 'propagator' },
      { stageType: 'seed_n1', defaultDurationHours: 55, minDurationHours: 50, maxDurationHours: 61, machineGroup: 'pre_fermenter' },
      { stageType: 'production', defaultDurationHours: 192, minDurationHours: 173, maxDurationHours: 211, machineGroup: 'fermenter' },
    ],
  },
  {
    id: DEMO_LINE_B.id,
    name: DEMO_LINE_B.name,
    shortName: DEMO_LINE_B.shortName,
    displayOrder: 2,
    stageDefaults: [
      { stageType: 'inoculum', defaultDurationHours: 24, minDurationHours: 22, maxDurationHours: 26, machineGroup: 'inoculum' },
      { stageType: 'seed_n2', defaultDurationHours: 44, minDurationHours: 40, maxDurationHours: 48, machineGroup: 'propagator' },
      { stageType: 'seed_n1', defaultDurationHours: 20, minDurationHours: 18, maxDurationHours: 22, machineGroup: 'pre_fermenter' },
      { stageType: 'production', defaultDurationHours: 192, minDurationHours: 173, maxDurationHours: 211, machineGroup: 'fermenter' },
    ],
  },
];

// ─── Demo data generation ───────────────────────────────────────────────

const LINE_B_FERMENTERS = ['F-1', 'F-4', 'F-5', 'F-6', 'F-7', 'F-8', 'F-9', 'F-10', 'F-11'];
const LINE_B_PRE_FERMENTERS = ['PF-3', 'PF-4', 'PF-5', 'PF-6'];
const LINE_B_PROPAGATORS = ['PR-3', 'PR-4', 'PR-5', 'PR-6', 'PR-7', 'PR-8'];

const LINE_A_FERMENTERS = ['F-2', 'F-3'];
const LINE_A_PRE_FERMENTERS = ['PF-1', 'PF-2'];
const LINE_A_PROPAGATORS = ['PR-1', 'PR-2'];

const LINE_B_INO_ID = `B-${DEMO_LINE_B.shortName}`;
const LINE_A_INO_ID = `B-${DEMO_LINE_A.shortName}`;

/**
 * Generate deterministic demo batch data centered around today.
 * Creates realistic schedules for two rotating product lines.
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

  const bPrefix = DEMO_LINE_B.shortName;

  // Line B (large line): generate 2 batches per fermenter, staggered across time
  for (let fi = 0; fi < LINE_B_FERMENTERS.length; fi++) {
    const fermenter = LINE_B_FERMENTERS[fi];
    // Stagger start: each fermenter starts a bit later
    const fermenterBase = addHours(baseDate, fi * 28);

    for (let batch = 0; batch < 2; batch++) {
      const fDurationHours = 168 + (seriesNum % 5) * 24; // 7–11 days
      const fStart = addHours(fermenterBase, batch * (fDurationHours + 36));
      const fEnd = addHours(fStart, fDurationHours);

      // Back-calculate PF: 20h before fermenter start
      const pfStart = subHours(fStart, 20);
      const pfEnd = new Date(fStart.getTime());
      const pfMachine = LINE_B_PRE_FERMENTERS[pfIdx % LINE_B_PRE_FERMENTERS.length];
      pfIdx++;

      // Back-calculate PR: 44h before PF start
      const prStart = subHours(pfStart, 44);
      const prEnd = new Date(pfStart.getTime());
      const prMachine = LINE_B_PROPAGATORS[prIdx % LINE_B_PROPAGATORS.length];
      prIdx++;

      // Back-calculate inoculation: 24h before PR start
      const inoStart = subHours(prStart, 24);
      const inoEnd = new Date(prStart.getTime());

      const chainId = `${bPrefix}-${seriesNum}`;

      chains.push({
        id: chainId,
        batchName: `${bPrefix}-${seriesNum}`,
        seriesNumber: seriesNum,
        productLine: DEMO_LINE_B.id,
        status: fStart < today ? 'committed' : 'proposed',
      });

      stages.push(
        {
          id: `s-${stageId++}`,
          machineId: LINE_B_INO_ID,
          batchChainId: chainId,
          stageType: 'inoculum',
          startDatetime: inoStart,
          endDatetime: inoEnd,
          state: inoEnd < today ? 'completed' : inoStart < today ? 'active' : 'planned',
        },
        {
          id: `s-${stageId++}`,
          machineId: prMachine,
          batchChainId: chainId,
          stageType: 'seed_n2',
          startDatetime: prStart,
          endDatetime: prEnd,
          state: prEnd < today ? 'completed' : prStart < today ? 'active' : 'planned',
        },
        {
          id: `s-${stageId++}`,
          machineId: pfMachine,
          batchChainId: chainId,
          stageType: 'seed_n1',
          startDatetime: pfStart,
          endDatetime: pfEnd,
          state: pfEnd < today ? 'completed' : pfStart < today ? 'active' : 'planned',
        },
        {
          id: `s-${stageId++}`,
          machineId: fermenter,
          batchChainId: chainId,
          stageType: 'production',
          startDatetime: fStart,
          endDatetime: fEnd,
          state: fEnd < today ? 'completed' : fStart < today ? 'active' : 'planned',
        }
      );

      seriesNum++;
    }
  }

  // Line A (small line): generate 1 batch per fermenter
  const aPrefix = DEMO_LINE_A.shortName;
  let aSeries = 10;
  let aPfIdx = 0;
  let aPrIdx = 0;

  for (let fi = 0; fi < LINE_A_FERMENTERS.length; fi++) {
    const fermenter = LINE_A_FERMENTERS[fi];
    const fStart = addHours(baseDate, fi * 72 + 48);
    const fEnd = addHours(fStart, 192);

    const pfStart = subHours(fStart, 55);
    const pfEnd = new Date(fStart.getTime());
    const pfMachine = LINE_A_PRE_FERMENTERS[aPfIdx % LINE_A_PRE_FERMENTERS.length];
    aPfIdx++;

    const prStart = subHours(pfStart, 48);
    const prEnd = new Date(pfStart.getTime());
    const prMachine = LINE_A_PROPAGATORS[aPrIdx % LINE_A_PROPAGATORS.length];
    aPrIdx++;

    // Back-calculate inoculation: 24h before PR start
    const inoStart = subHours(prStart, 24);
    const inoEnd = new Date(prStart.getTime());

    const chainId = `${aPrefix}-${aSeries}`;

    chains.push({
      id: chainId,
      batchName: `${aPrefix}-${aSeries}`,
      seriesNumber: aSeries,
      productLine: DEMO_LINE_A.id,
      status: 'committed',
    });

    stages.push(
      {
        id: `s-${stageId++}`,
        machineId: LINE_A_INO_ID,
        batchChainId: chainId,
        stageType: 'inoculum',
        startDatetime: inoStart,
        endDatetime: inoEnd,
        state: inoEnd < today ? 'completed' : 'active',
      },
      {
        id: `s-${stageId++}`,
        machineId: prMachine,
        batchChainId: chainId,
        stageType: 'seed_n2',
        startDatetime: prStart,
        endDatetime: prEnd,
        state: prEnd < today ? 'completed' : 'active',
      },
      {
        id: `s-${stageId++}`,
        machineId: pfMachine,
        batchChainId: chainId,
        stageType: 'seed_n1',
        startDatetime: pfStart,
        endDatetime: pfEnd,
        state: pfEnd < today ? 'completed' : 'active',
      },
      {
        id: `s-${stageId++}`,
        machineId: fermenter,
        batchChainId: chainId,
        stageType: 'production',
        startDatetime: fStart,
        endDatetime: fEnd,
        state: fEnd < today ? 'completed' : 'active',
      }
    );

    aSeries++;
  }

  return { chains, stages };
}
