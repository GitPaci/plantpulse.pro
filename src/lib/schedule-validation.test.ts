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
    const result = validateSchedule({ stages, batchChains: [chain], machines, stageDefaultsByProductLine: { pl1: defaults }, stageOrder: ['inoculum', 'production'], requiredStages: ['inoculum', 'production'] });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'CHAIN_STAGE_SEQUENCE')).toBe(true);
    expect(result.issues.some((i) => i.code === 'CHAIN_STAGE_OVERLAP')).toBe(true);
  });

  it('detects equipment overlap and downtime conflict', () => {
    const withDowntime = [{ ...machines[1], downtime: { startDate: d('2026-01-01T00:00:00Z'), endDate: d('2026-01-05T00:00:00Z'), blocksPlanning: true } }, machines[0]];
    const stages: Stage[] = [
      { id: 'a', batchChainId: 'c1', machineId: 'm-fer', stageType: 'production', startDatetime: d('2026-01-02T00:00:00Z'), endDatetime: d('2026-01-03T00:00:00Z'), state: 'planned' },
      { id: 'b', batchChainId: 'c1', machineId: 'm-fer', stageType: 'production', startDatetime: d('2026-01-02T12:00:00Z'), endDatetime: d('2026-01-03T12:00:00Z'), state: 'planned' },
    ];
    const result = validateSchedule({ stages, batchChains: [chain], machines: withDowntime, stageDefaultsByProductLine: { pl1: defaults }, stageOrder: ['production'], requiredStages: [] });
    expect(result.issues.some((i) => i.code === 'EQUIPMENT_STAGE_OVERLAP')).toBe(true);
    expect(result.issues.some((i) => i.code === 'EQUIPMENT_DOWNTIME_CONFLICT')).toBe(true);
  });

  it('detects missing stages and turnaround gap failures', () => {
    const ta: TurnaroundActivity[] = [{ id: 'ta1', name: 'CIP', durationDays: 0, durationHours: 8, durationMinutes: 0, equipmentGroup: 'fermenter', isDefault: true }];
    const stages: Stage[] = [
      { id: 's1', batchChainId: 'c1', machineId: 'm-fer', stageType: 'production', startDatetime: d('2026-01-01T00:00:00Z'), endDatetime: d('2026-01-02T00:00:00Z'), state: 'completed' },
      { id: 's2', batchChainId: 'c1', machineId: 'm-fer', stageType: 'production', startDatetime: d('2026-01-02T02:00:00Z'), endDatetime: d('2026-01-03T00:00:00Z'), state: 'planned' },
    ];
    const result = validateSchedule({ stages, batchChains: [chain], machines, stageDefaultsByProductLine: { pl1: defaults }, stageOrder: ['inoculum', 'production'], requiredStages: ['inoculum', 'production'], turnaroundActivities: ta });
    expect(result.issues.some((i) => i.code === 'CHAIN_MISSING_STAGE')).toBe(true);
    expect(result.issues.some((i) => i.code === 'TURNAROUND_TOO_SHORT')).toBe(true);
  });
});
