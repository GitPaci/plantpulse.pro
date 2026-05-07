import { describe, it, expect } from 'vitest';
import type { BatchChain, Machine, Stage, StageDefault, TurnaroundActivity } from './types';
import { validateSchedule } from './schedule-validation';

const chain: BatchChain = { id: 'c1', batchName: 'B-001', seriesNumber: 1, productLine: 'pl1', status: 'draft' };
const machines: Machine[] = [
  { id: 'm-ino', name: 'Ino-1', group: 'inoculum', displayOrder: 1 },
  { id: 'm-fer', name: 'Fer-1', group: 'fermenter', displayOrder: 2 },
];
const defaults: StageDefault[] = [
  { stageType: 'inoculum', defaultDurationHours: 12, minDurationHours: 10, maxDurationHours: 14, machineGroup: 'inoculum' },
  { stageType: 'production', defaultDurationHours: 48, minDurationHours: 40, maxDurationHours: 60, machineGroup: 'fermenter' },
];

function d(s: string) { return new Date(s); }

describe('validateSchedule', () => {
  it('detects sequence violation and overlap inside chain', () => {
    const stages: Stage[] = [
      { id: 's-prod', batchChainId: 'c1', machineId: 'm-fer', stageType: 'production', startDatetime: d('2026-01-01T00:00:00Z'), endDatetime: d('2026-01-03T00:00:00Z'), state: 'planned' },
      { id: 's-ino', batchChainId: 'c1', machineId: 'm-ino', stageType: 'inoculum', startDatetime: d('2026-01-02T00:00:00Z'), endDatetime: d('2026-01-02T12:00:00Z'), state: 'planned' },
    ];
    const result = validateSchedule({ stages, batchChains: [chain], machines, stageDefaultsByProductLine: { pl1: defaults } });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'CHAIN_STAGE_SEQUENCE')).toBe(true);
    expect(result.issues.some((i) => i.code === 'CHAIN_STAGE_OVERLAP')).toBe(true);
  });

  it('detects equipment overlap and downtime conflict', () => {
    const withDowntime = [{ ...machines[1], downtime: { startDate: d('2026-01-02T06:00:00Z'), endDate: d('2026-01-02T08:00:00Z'), blocksPlanning: true } }, machines[0]];
    const stages: Stage[] = [
      { id: 'a', batchChainId: 'c1', machineId: 'm-fer', stageType: 'production', startDatetime: d('2026-01-02T00:00:00Z'), endDatetime: d('2026-01-03T00:00:00Z'), state: 'planned' },
      { id: 'b', batchChainId: 'c1', machineId: 'm-fer', stageType: 'production', startDatetime: d('2026-01-02T12:00:00Z'), endDatetime: d('2026-01-03T12:00:00Z'), state: 'planned' },
    ];
    const result = validateSchedule({
      stages,
      batchChains: [chain],
      machines: withDowntime,
      stageDefaultsByProductLine: { pl1: defaults },
    });
    expect(result.issues.some((i) => i.code === 'EQUIPMENT_STAGE_OVERLAP')).toBe(true);
    expect(result.issues.some((i) => i.code === 'EQUIPMENT_DOWNTIME_CONFLICT')).toBe(true);
  });

  it('detects missing stages and turnaround gap failures', () => {
    const ta: TurnaroundActivity[] = [{ id: 'ta1', name: 'CIP', durationDays: 0, durationHours: 8, durationMinutes: 0, equipmentGroup: 'fermenter', isDefault: true }];
    const stages: Stage[] = [
      { id: 's1', batchChainId: 'c1', machineId: 'm-fer', stageType: 'production', startDatetime: d('2026-01-01T00:00:00Z'), endDatetime: d('2026-01-02T00:00:00Z'), state: 'completed' },
      { id: 's2', batchChainId: 'c1', machineId: 'm-fer', stageType: 'production', startDatetime: d('2026-01-02T02:00:00Z'), endDatetime: d('2026-01-03T00:00:00Z'), state: 'planned' },
    ];
    const result = validateSchedule({ stages, batchChains: [chain], machines, stageDefaultsByProductLine: { pl1: defaults }, turnaroundActivities: ta });
    expect(result.issues.some((i) => i.code === 'CHAIN_MISSING_STAGE')).toBe(true);
    expect(result.issues.some((i) => i.code === 'TURNAROUND_TOO_SHORT')).toBe(true);
  });

  it('respects custom per-product-line stage order from Stage Defaults', () => {
    const chain2: BatchChain = { ...chain, id: 'c2', batchName: 'B-002' };
    const customDefaults: StageDefault[] = [
      { stageType: 'prep', defaultDurationHours: 6, machineGroup: 'inoculum' },
      { stageType: 'main', defaultDurationHours: 12, machineGroup: 'fermenter' },
    ];
    const stages: Stage[] = [
      { id: 'x1', batchChainId: 'c2', machineId: 'm-fer', stageType: 'main', startDatetime: d('2026-02-01T00:00:00Z'), endDatetime: d('2026-02-02T00:00:00Z'), state: 'planned' },
      { id: 'x2', batchChainId: 'c2', machineId: 'm-ino', stageType: 'prep', startDatetime: d('2026-02-01T12:00:00Z'), endDatetime: d('2026-02-01T18:00:00Z'), state: 'planned' },
    ];
    const result = validateSchedule({ stages, batchChains: [chain2], machines, stageDefaultsByProductLine: { pl1: customDefaults } });
    expect(result.issues.some((i) => i.code === 'CHAIN_STAGE_SEQUENCE')).toBe(true);
  });

  it('allows parallel same-type stages up to configured stage count', () => {
    const stages: Stage[] = [
      { id: 'p1', batchChainId: 'c1', machineId: 'm-ino', stageType: 'inoculum', startDatetime: d('2026-03-01T00:00:00Z'), endDatetime: d('2026-03-01T10:00:00Z'), state: 'planned' },
      { id: 'p2', batchChainId: 'c1', machineId: 'm-fer', stageType: 'inoculum', startDatetime: d('2026-03-01T00:00:00Z'), endDatetime: d('2026-03-01T10:00:00Z'), state: 'active' },
      { id: 'p3', batchChainId: 'c1', machineId: 'm-fer', stageType: 'production', startDatetime: d('2026-03-02T00:00:00Z'), endDatetime: d('2026-03-04T00:00:00Z'), state: 'planned' },
    ];
    const result = validateSchedule({
      stages,
      batchChains: [chain],
      machines,
      stageDefaultsByProductLine: { pl1: defaults },
      stageTypeDefinitionsByProductLine: { pl1: [{ id: 'inoculum', name: 'Inoculum', shortName: 'INO', count: 2, displayOrder: 1 }] },
    });
    expect(result.issues.some((i) => i.code === 'CHAIN_DUPLICATE_ACTIVE_STAGE')).toBe(false);
  });

  it('flags duplicate same-type stages when configured count is exceeded', () => {
    const stages: Stage[] = [
      { id: 'd1', batchChainId: 'c1', machineId: 'm-ino', stageType: 'inoculum', startDatetime: d('2026-03-01T00:00:00Z'), endDatetime: d('2026-03-01T10:00:00Z'), state: 'planned' },
      { id: 'd2', batchChainId: 'c1', machineId: 'm-fer', stageType: 'inoculum', startDatetime: d('2026-03-01T00:00:00Z'), endDatetime: d('2026-03-01T10:00:00Z'), state: 'active' },
      { id: 'd3', batchChainId: 'c1', machineId: 'm-fer', stageType: 'inoculum', startDatetime: d('2026-03-01T00:00:00Z'), endDatetime: d('2026-03-01T10:00:00Z'), state: 'planned' },
      { id: 'd4', batchChainId: 'c1', machineId: 'm-fer', stageType: 'production', startDatetime: d('2026-03-02T00:00:00Z'), endDatetime: d('2026-03-04T00:00:00Z'), state: 'planned' },
    ];
    const result = validateSchedule({
      stages,
      batchChains: [chain],
      machines,
      stageDefaultsByProductLine: { pl1: defaults },
      stageTypeDefinitionsByProductLine: { pl1: [{ id: 'inoculum', name: 'Inoculum', shortName: 'INO', count: 2, displayOrder: 1 }] },
    });
    expect(result.issues.some((i) => i.code === 'CHAIN_DUPLICATE_ACTIVE_STAGE')).toBe(true);
  });

  it('flags shutdown overlap occurring mid-stage interval', () => {
    const stages: Stage[] = [
      { id: 's-mid', batchChainId: 'c1', machineId: 'm-fer', stageType: 'production', startDatetime: d('2026-04-01T00:00:00Z'), endDatetime: d('2026-04-01T12:00:00Z'), state: 'planned' },
    ];
    const result = validateSchedule({
      stages,
      batchChains: [chain],
      machines,
      stageDefaultsByProductLine: { pl1: defaults },
      shutdownPeriods: [{ id: 'sd1', name: 'Window', startDate: d('2026-04-01T05:00:00Z'), endDate: d('2026-04-01T06:00:00Z') }],
    });
    expect(result.issues.some((i) => i.code === 'EQUIPMENT_SHUTDOWN_CONFLICT')).toBe(true);
  });

  it('rejects disconnected linked chains with continuity rule', () => {
    const linkedChain: BatchChain = { ...chain, linkToNext: true };
    const stages: Stage[] = [
      { id: 'l1', batchChainId: 'c1', machineId: 'm-ino', stageType: 'inoculum', startDatetime: d('2026-05-01T00:00:00Z'), endDatetime: d('2026-05-01T08:00:00Z'), state: 'planned' },
      { id: 'l2', batchChainId: 'c1', machineId: 'm-fer', stageType: 'production', startDatetime: d('2026-05-01T10:00:00Z'), endDatetime: d('2026-05-02T10:00:00Z'), state: 'planned' },
    ];
    const result = validateSchedule({
      stages,
      batchChains: [linkedChain],
      machines,
      stageDefaultsByProductLine: { pl1: defaults },
    });
    expect(result.issues.some((i) => i.code === 'CHAIN_LINK_CONTINUITY')).toBe(true);
  });

  it('detects floating seed stage without upstream stage', () => {
    const chain3: BatchChain = { ...chain, id: 'c3', linkToNext: true };
    const defaults3: StageDefault[] = [
      { stageType: 'seed_a', defaultDurationHours: 10, machineGroup: 'inoculum' },
      { stageType: 'seed_b', defaultDurationHours: 10, machineGroup: 'inoculum' },
      { stageType: 'prod', defaultDurationHours: 20, machineGroup: 'fermenter' },
    ];
    const stages: Stage[] = [
      { id: 'f1', batchChainId: 'c3', machineId: 'm-fer', stageType: 'seed_b', startDatetime: d('2026-06-01T00:00:00Z'), endDatetime: d('2026-06-01T10:00:00Z'), state: 'planned' },
    ];
    const result = validateSchedule({ stages, batchChains: [chain3], machines, stageDefaultsByProductLine: { pl1: defaults3 } });
    expect(result.issues.some((i) => i.code === 'CHAIN_FLOATING_STAGE')).toBe(true);
  });

  it('detects disconnected production from upstream', () => {
    const chain4: BatchChain = { ...chain, id: 'c4', linkToNext: true };
    const defaults4: StageDefault[] = [
      { stageType: 'seed', defaultDurationHours: 10, machineGroup: 'inoculum' },
      { stageType: 'production', defaultDurationHours: 20, machineGroup: 'fermenter' },
    ];
    const stages: Stage[] = [
      { id: 'pseed', batchChainId: 'c4', machineId: 'm-ino', stageType: 'seed', startDatetime: d('2026-06-01T00:00:00Z'), endDatetime: d('2026-06-01T10:00:00Z'), state: 'planned' },
      { id: 'pprod', batchChainId: 'c4', machineId: 'm-fer', stageType: 'production', startDatetime: d('2026-06-01T12:00:00Z'), endDatetime: d('2026-06-02T12:00:00Z'), state: 'planned' },
    ];
    const result = validateSchedule({ stages, batchChains: [chain4], machines, stageDefaultsByProductLine: { pl1: defaults4 } });
    expect(result.issues.some((i) => i.code === 'CHAIN_DISCONNECTED_PRODUCTION')).toBe(true);
  });

  it('detects broken continuity in parallel material-flow paths', () => {
    const chain5: BatchChain = { ...chain, id: 'c5', linkToNext: true };
    const defaults5: StageDefault[] = [
      { stageType: 'seed', defaultDurationHours: 8, machineGroup: 'inoculum' },
      { stageType: 'production', defaultDurationHours: 24, machineGroup: 'fermenter' },
    ];
    const stages: Stage[] = [
      { id: 'pa-seed', batchChainId: 'c5', machineId: 'm-ino', stageType: 'seed', startDatetime: d('2026-07-01T00:00:00Z'), endDatetime: d('2026-07-01T08:00:00Z'), state: 'planned' },
      { id: 'pb-seed', batchChainId: 'c5', machineId: 'm-ino', stageType: 'seed', startDatetime: d('2026-07-01T01:00:00Z'), endDatetime: d('2026-07-01T09:00:00Z'), state: 'planned' },
      { id: 'pa-prod', batchChainId: 'c5', machineId: 'm-fer', stageType: 'production', startDatetime: d('2026-07-01T08:00:00Z'), endDatetime: d('2026-07-02T08:00:00Z'), state: 'planned' },
      { id: 'pb-prod', batchChainId: 'c5', machineId: 'm-fer', stageType: 'production', startDatetime: d('2026-07-01T10:00:00Z'), endDatetime: d('2026-07-02T10:00:00Z'), state: 'planned' },
    ];
    const result = validateSchedule({ stages, batchChains: [chain5], machines, stageDefaultsByProductLine: { pl1: defaults5 } });
    expect(result.issues.some((i) => i.code === 'CHAIN_LINK_CONTINUITY')).toBe(true);
  });
});
