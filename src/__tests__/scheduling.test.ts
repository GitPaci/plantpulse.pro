import { describe, it, expect } from 'vitest';
import { autoScheduleChain, validateChainIntegrity } from '@/lib/scheduling';
import { backCalculateChain, shiftChain } from '@/lib/seed-train';
import type { Machine, Stage, TurnaroundActivity, ShutdownPeriod, StageDefault } from '@/lib/types';
import type { ChainAssignment } from '@/lib/scheduling';

// ─── Test fixtures ──────────────────────────────────────────────────

const stageDefaults: StageDefault[] = [
  { stageType: 'inoculum', defaultDurationHours: 24, machineGroup: 'inoculum' },
  { stageType: 'seed_n2', defaultDurationHours: 48, machineGroup: 'propagator' },
  { stageType: 'seed_n1', defaultDurationHours: 55, machineGroup: 'pre_fermenter' },
  { stageType: 'production', defaultDurationHours: 192, machineGroup: 'fermenter' },
];

function makeMachine(id: string, group: string, productLine?: string): Machine {
  return {
    id,
    name: id,
    group,
    productLine,
    displayOrder: 0,
  };
}

const machines: Machine[] = [
  makeMachine('BKK', 'inoculum', 'KK'),
  makeMachine('PR-3', 'propagator', 'KK'),
  makeMachine('PR-4', 'propagator', 'KK'),
  makeMachine('PF-3', 'pre_fermenter', 'KK'),
  makeMachine('PF-4', 'pre_fermenter', 'KK'),
  makeMachine('F-1', 'fermenter', 'KK'),
  makeMachine('F-4', 'fermenter', 'KK'),
  makeMachine('F-5', 'fermenter', 'KK'),
];

const turnaroundActivities: TurnaroundActivity[] = [];

function makeShutdown(name: string, startDate: Date, endDate: Date): ShutdownPeriod {
  return { id: `sd-${name}`, name, startDate, endDate };
}

function isChainContinuous(assignments: ChainAssignment[], toleranceMs = 60000): boolean {
  for (let i = 0; i < assignments.length - 1; i++) {
    const delta = Math.abs(
      assignments[i + 1].startDatetime.getTime() - assignments[i].endDatetime.getTime()
    );
    if (delta > toleranceMs) return false;
  }
  return true;
}

function isInsideShutdown(
  assignments: ChainAssignment[],
  shutdowns: ShutdownPeriod[]
): boolean {
  for (const a of assignments) {
    for (const s of shutdowns) {
      if (a.startDatetime < s.endDate && a.endDatetime > s.startDate) return true;
    }
  }
  return false;
}

// ─── autoScheduleChain — shutdown-aware propagation ─────────────────

describe('autoScheduleChain — shutdown-aware propagation', () => {
  it('shifts entire chain when shutdown is in the middle of the chain', () => {
    const productionStart = new Date('2026-06-15T06:00:00');
    const backCalc = backCalculateChain(productionStart, stageDefaults);

    // Shutdown during seed_n2 stage
    const shutdowns = [
      makeShutdown('Mid-chain shutdown', new Date('2026-06-09T00:00:00'), new Date('2026-06-11T00:00:00')),
    ];

    const result = autoScheduleChain(
      backCalc, 'KK', 'F-1', machines, [], turnaroundActivities, shutdowns
    );

    expect(result.length).toBe(stageDefaults.length);
    expect(isInsideShutdown(result, shutdowns)).toBe(false);
  });

  it('keeps every stage continuous after a shutdown shift', () => {
    const productionStart = new Date('2026-06-15T06:00:00');
    const backCalc = backCalculateChain(productionStart, stageDefaults);

    const shutdowns = [
      makeShutdown('Test shutdown', new Date('2026-06-10T00:00:00'), new Date('2026-06-12T00:00:00')),
    ];

    const result = autoScheduleChain(
      backCalc, 'KK', 'F-1', machines, [], turnaroundActivities, shutdowns
    );

    expect(isChainContinuous(result)).toBe(true);
  });

  it('does not place any stage inside a shutdown window', () => {
    const productionStart = new Date('2026-07-01T06:00:00');
    const backCalc = backCalculateChain(productionStart, stageDefaults);

    const shutdowns = [
      makeShutdown('Summer shutdown', new Date('2026-06-25T00:00:00'), new Date('2026-07-02T00:00:00')),
    ];

    const result = autoScheduleChain(
      backCalc, 'KK', 'F-1', machines, [], turnaroundActivities, shutdowns
    );

    expect(isInsideShutdown(result, shutdowns)).toBe(false);
  });

  it('respects vessel availability across multiple chains scheduled in sequence', () => {
    const productionStart = new Date('2026-06-15T06:00:00');
    const backCalc1 = backCalculateChain(productionStart, stageDefaults);

    const result1 = autoScheduleChain(
      backCalc1, 'KK', 'F-1', machines, [], turnaroundActivities, []
    );

    // Build existing stages from chain 1
    const existingStages: Stage[] = result1.map((a, i) => ({
      id: `chain1-${i}`,
      machineId: a.machineId,
      batchChainId: 'chain-1',
      stageType: a.stageType,
      startDatetime: a.startDatetime,
      endDatetime: a.endDatetime,
      state: 'planned' as const,
    }));

    // Schedule a second chain at the same start — should use different fermenters or push later
    const backCalc2 = backCalculateChain(productionStart, stageDefaults);
    const result2 = autoScheduleChain(
      backCalc2, 'KK', undefined, machines, existingStages, turnaroundActivities, []
    );

    expect(isChainContinuous(result2)).toBe(true);
    // The second chain's production should not overlap chain 1's production on the same machine
    const prod1 = result1[result1.length - 1];
    const prod2 = result2[result2.length - 1];
    if (prod1.machineId === prod2.machineId) {
      expect(prod2.startDatetime.getTime()).toBeGreaterThanOrEqual(prod1.endDatetime.getTime());
    }
  });

  it('produces continuous chains even with no shutdowns or constraints', () => {
    const productionStart = new Date('2026-08-01T06:00:00');
    const backCalc = backCalculateChain(productionStart, stageDefaults);

    const result = autoScheduleChain(
      backCalc, 'KK', 'F-1', machines, [], turnaroundActivities, []
    );

    expect(isChainContinuous(result)).toBe(true);
    expect(result.length).toBe(stageDefaults.length);
  });
});

// ─── validateChainIntegrity ─────────────────────────────────────────

describe('validateChainIntegrity', () => {
  it('reports no issues for a continuous, well-fitted chain', () => {
    const productionStart = new Date('2026-08-01T06:00:00');
    const backCalc = backCalculateChain(productionStart, stageDefaults);
    const result = autoScheduleChain(
      backCalc, 'KK', 'F-1', machines, [], turnaroundActivities, []
    );

    const issues = validateChainIntegrity(result, stageDefaults, [], [], new Set(), 1);
    expect(issues).toEqual([]);
  });

  it('flags a gap when a stage end != next stage start', () => {
    const assignments: ChainAssignment[] = [
      {
        stageType: 'inoculum', machineId: 'BKK', machineName: 'BKK',
        startDatetime: new Date('2026-06-01T06:00:00'),
        endDatetime: new Date('2026-06-02T06:00:00'),
        durationHours: 24, overlaps: [],
      },
      {
        stageType: 'seed_n2', machineId: 'PR-3', machineName: 'PR-3',
        startDatetime: new Date('2026-06-03T06:00:00'), // 24h gap
        endDatetime: new Date('2026-06-05T06:00:00'),
        durationHours: 48, overlaps: [],
      },
    ];

    const issues = validateChainIntegrity(assignments, stageDefaults, [], [], new Set(), 1);
    expect(issues.some((i) => i.type === 'gap')).toBe(true);
  });

  it('flags an overlap when a stage end > next stage start', () => {
    const assignments: ChainAssignment[] = [
      {
        stageType: 'inoculum', machineId: 'BKK', machineName: 'BKK',
        startDatetime: new Date('2026-06-01T06:00:00'),
        endDatetime: new Date('2026-06-02T12:00:00'), // overlaps by 6h
        durationHours: 30, overlaps: [],
      },
      {
        stageType: 'seed_n2', machineId: 'PR-3', machineName: 'PR-3',
        startDatetime: new Date('2026-06-02T06:00:00'),
        endDatetime: new Date('2026-06-04T06:00:00'),
        durationHours: 48, overlaps: [],
      },
    ];

    const issues = validateChainIntegrity(assignments, stageDefaults, [], [], new Set(), 1);
    expect(issues.some((i) => i.type === 'overlap')).toBe(true);
  });

  it('flags duration-exceeded when actual duration > maxDurationHours', () => {
    const stageDefaultsWithMax: StageDefault[] = [
      { stageType: 'production', defaultDurationHours: 192, maxDurationHours: 211, machineGroup: 'fermenter' },
    ];

    const assignments: ChainAssignment[] = [
      {
        stageType: 'production', machineId: 'F-1', machineName: 'F-1',
        startDatetime: new Date('2026-06-01T06:00:00'),
        endDatetime: new Date('2026-06-10T08:00:00'), // 218h > 211h
        durationHours: 218, overlaps: [],
      },
    ];

    const issues = validateChainIntegrity(assignments, stageDefaultsWithMax, [], [], new Set(), 1);
    expect(issues.some((i) => i.type === 'duration-exceeded')).toBe(true);
    expect(issues.find((i) => i.type === 'duration-exceeded')?.message).toContain('218');
  });

  it('flags shutdown-conflict when a stage falls inside a shutdown', () => {
    const shutdowns = [
      makeShutdown('Test', new Date('2026-06-05T00:00:00'), new Date('2026-06-07T00:00:00')),
    ];

    const assignments: ChainAssignment[] = [
      {
        stageType: 'production', machineId: 'F-1', machineName: 'F-1',
        startDatetime: new Date('2026-06-04T06:00:00'),
        endDatetime: new Date('2026-06-12T06:00:00'),
        durationHours: 192, overlaps: [],
      },
    ];

    const issues = validateChainIntegrity(assignments, stageDefaults, shutdowns, [], new Set(), 1);
    expect(issues.some((i) => i.type === 'shutdown-conflict')).toBe(true);
  });

  it('flags equipment-conflict when a stage overlaps an existing stage on same machine', () => {
    const existingStages: Stage[] = [
      {
        id: 'existing-1', machineId: 'F-1', batchChainId: 'other-chain',
        stageType: 'production',
        startDatetime: new Date('2026-06-05T00:00:00'),
        endDatetime: new Date('2026-06-12T00:00:00'),
        state: 'planned',
      },
    ];

    const assignments: ChainAssignment[] = [
      {
        stageType: 'production', machineId: 'F-1', machineName: 'F-1',
        startDatetime: new Date('2026-06-04T06:00:00'),
        endDatetime: new Date('2026-06-12T06:00:00'),
        durationHours: 192, overlaps: [],
      },
    ];

    const issues = validateChainIntegrity(
      assignments, stageDefaults, [], existingStages, new Set(), 1
    );
    expect(issues.some((i) => i.type === 'equipment-conflict')).toBe(true);
  });
});

// ─── shiftChain ─────────────────────────────────────────────────────

describe('shiftChain', () => {
  it('preserves continuity after shifting', () => {
    const productionStart = new Date('2026-08-01T06:00:00');
    const chain = backCalculateChain(productionStart, stageDefaults);
    const shifted = shiftChain(chain, 48);

    // All stages shifted by exactly 48h
    for (let i = 0; i < chain.length; i++) {
      expect(shifted[i].startDatetime.getTime() - chain[i].startDatetime.getTime()).toBe(48 * 60 * 60 * 1000);
      expect(shifted[i].endDatetime.getTime() - chain[i].endDatetime.getTime()).toBe(48 * 60 * 60 * 1000);
    }

    // Continuity preserved
    for (let i = 0; i < shifted.length - 1; i++) {
      expect(shifted[i].endDatetime.getTime()).toBe(shifted[i + 1].startDatetime.getTime());
    }
  });

  it('returns same stages when shift is 0', () => {
    const productionStart = new Date('2026-08-01T06:00:00');
    const chain = backCalculateChain(productionStart, stageDefaults);
    const shifted = shiftChain(chain, 0);
    expect(shifted).toBe(chain);
  });
});
