'use client';

// Shift Schedule modal — configure shift teams, rotation pattern, plant coverage,
// and anchor date. Follows the same draft-state pattern as EquipmentSetup/ProcessSetup:
// all edits are local until Save. Reuses pp-modal-* CSS classes.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlantPulseStore } from '@/lib/store';
import type { ShiftRotation, ShiftTeam } from '@/lib/types';
import { SHIFT_GAP_COLOR } from '@/lib/colors';

// ─── Date helper ──────────────────────────────────────────────────────

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Rotation presets ─────────────────────────────────────────────────

interface RotationPreset {
  id: string;
  label: string;
  teams: number;
  shiftLength: number;
  pattern: number[];
  description: string;
}

const ROTATION_PRESETS: RotationPreset[] = [
  {
    id: 'russian',
    label: 'Russian 4-team',
    teams: 4, shiftLength: 12,
    pattern: [0, 2, 1, 3, 2, 0, 3, 1],
    description: '4 teams, 12h shifts, 4-day cycle. Classic pharma/chemical rotation.',
  },
  {
    id: 'simple-abcd',
    label: 'Simple A-B-C-D',
    teams: 4, shiftLength: 12,
    pattern: [0, 1, 2, 3],
    description: '4 teams rotate sequentially, each team works one 12h shift then rests.',
  },
  {
    id: '2-team',
    label: '2-team alternating',
    teams: 2, shiftLength: 12,
    pattern: [0, 1],
    description: '2 teams alternate day/night, simplest 24/7 coverage.',
  },
  {
    id: 'navy',
    label: 'Navy 3-shift (8h)',
    teams: 3, shiftLength: 8,
    pattern: [0, 1, 2],
    description: '3 teams, 8h shifts (06-14, 14-22, 22-06). Classic industrial 3-shift.',
  },
  {
    id: 'panama',
    label: 'Panama 2-2-3',
    teams: 4, shiftLength: 12,
    // 28-day cycle: 2on-2off-3on, 2off-2on-3off pattern for each team
    pattern: [
      0,0, 1,1, 0,0,0, 1,1, 0,0, 1,1,1,
      2,2, 3,3, 2,2,2, 3,3, 2,2, 3,3,3,
    ],
    description: '4 teams, 12h shifts, 28-day cycle. Workers average 42h/week.',
  },
  {
    id: 'pitman',
    label: 'Pitman 2-3-2',
    teams: 4, shiftLength: 12,
    // 14-day cycle per pair of teams
    pattern: [
      0,0, 1,1,1, 0,0, 1,1, 0,0,0, 1,1,
      2,2, 3,3,3, 2,2, 3,3, 2,2,2, 3,3,
    ],
    description: '4 teams, 12h shifts, 28-day cycle. 2on-3off-2on-2off-3on-2off.',
  },
  {
    id: 'dupont',
    label: 'DuPont',
    teams: 4, shiftLength: 12,
    // 28-day DuPont schedule (4 weeks, one 7-day off block per team per cycle)
    pattern: [
      // Week 1: Team 0 nights ×4, Team 1 days ×4, then swap
      0,1, 0,1, 0,1, 0,1,
      // Week 2
      2,3, 2,3, 2,3, 0,3,
      // Week 3
      2,1, 2,1, 2,1, 2,1,
      // Week 4
      0,3, 0,3, 0,3, 2,3,
    ],
    description: '4 teams, 12h shifts, 28-day cycle with a 7-day rest block.',
  },
  {
    id: '4on2off',
    label: '4-on-2-off',
    teams: 3, shiftLength: 8,
    pattern: [
      0,1,2, 0,1,2, 0,1,2, 0,1,2,
      1,2,0, 1,2,0,
    ],
    description: '3 teams, 8h shifts, work 4 days then rest 2. 18-slot cycle.',
  },
  {
    id: 'custom',
    label: 'Custom',
    teams: 0, shiftLength: 0,
    pattern: [],
    description: 'Define your own rotation pattern.',
  },
];

// ─── Operation presets ────────────────────────────────────────────────

interface OperationPreset {
  id: string;
  label: string;
  activeDays: boolean[];
  hoursStart: number;
  hoursEnd: number;
  description: string;
}

const OPERATION_PRESETS: OperationPreset[] = [
  {
    id: '24/7', label: '24/7',
    activeDays: [true, true, true, true, true, true, true],
    hoursStart: 0, hoursEnd: 24,
    description: 'Continuous operation, all days.',
  },
  {
    id: '24/6', label: '24/6',
    activeDays: [false, true, true, true, true, true, true],
    hoursStart: 0, hoursEnd: 24,
    description: '24h operation Monday–Saturday, Sunday off.',
  },
  {
    id: '24/5', label: '24/5',
    activeDays: [false, true, true, true, true, true, false],
    hoursStart: 0, hoursEnd: 24,
    description: '24h operation Monday–Friday.',
  },
  {
    id: '16/5', label: '16/5',
    activeDays: [false, true, true, true, true, true, false],
    hoursStart: 6, hoursEnd: 22,
    description: '2 shifts (06–22) Monday–Friday.',
  },
  {
    id: 'office', label: 'Office Hours',
    activeDays: [false, true, true, true, true, true, false],
    hoursStart: 7, hoursEnd: 15,
    description: 'Standard 8h day shift Monday–Friday.',
  },
  {
    id: 'custom-op', label: 'Custom',
    activeDays: [], hoursStart: 0, hoursEnd: 0,
    description: 'Define your own coverage window.',
  },
];

// Day abbreviations (Sunday first)
const DAY_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// ─── Coverage heatmap computation ─────────────────────────────────────

// Returns 7×24 grid: 'covered' | 'gap' | 'outside'
type CoverageCell = 'covered' | 'gap' | 'outside';

function computeCoverage(draft: ShiftRotation): CoverageCell[][] {
  const grid: CoverageCell[][] = Array.from({ length: 7 }, () => Array(24).fill('outside'));

  if (draft.cyclePattern.length === 0 || draft.shiftLengthHours <= 0) return grid;

  const is24h = draft.operatingHoursStart === 0 && draft.operatingHoursEnd === 24;

  // Mark operating window hours as 'gap' (potentially covered but not yet confirmed)
  for (let day = 0; day < 7; day++) {
    if (!draft.activeDays[day]) continue;
    for (let hour = 0; hour < 24; hour++) {
      const inWindow = is24h || (
        draft.operatingHoursEnd > draft.operatingHoursStart
          ? hour >= draft.operatingHoursStart && hour < draft.operatingHoursEnd
          : hour >= draft.operatingHoursStart || hour < draft.operatingHoursEnd // overnight window
      );
      if (inWindow) {
        grid[day][hour] = 'gap'; // default to gap, will mark covered below
      }
    }
  }

  // Simulate shift blocks across enough weeks to cover the full cycle.
  // Shift continuity: a shift block is "started" if its first hour falls
  // on an active day within the operating window. Once started, ALL hours
  // of that block are covered — even if they spill into an inactive day.
  const cycleLengthHours = draft.cyclePattern.length * draft.shiftLengthHours;
  const cycleLengthDays = Math.ceil(cycleLengthHours / 24);
  const weeksToSimulate = Math.max(1, Math.ceil(cycleLengthDays / 7));
  const totalDays = weeksToSimulate * 7;
  const totalHours = totalDays * 24;
  const shiftLenH = draft.shiftLengthHours;

  // Walk shift blocks (not individual hours)
  for (let blockStart = 0; blockStart < totalHours; blockStart += shiftLenH) {
    const startDay = Math.floor(blockStart / 24) % 7;
    const startHour = blockStart % 24;

    // Check if this shift block's START is in the operating window
    const dayActive = draft.activeDays[startDay] ?? true;
    const hourInWindow = is24h || (
      draft.operatingHoursEnd > draft.operatingHoursStart
        ? startHour >= draft.operatingHoursStart && startHour < draft.operatingHoursEnd
        : startHour >= draft.operatingHoursStart || startHour < draft.operatingHoursEnd
    );

    if (!dayActive || !hourInWindow) continue;

    // Valid team?
    const shiftBlockIdx = Math.floor(blockStart / shiftLenH);
    const patternIdx = shiftBlockIdx % draft.cyclePattern.length;
    const teamIdx = draft.cyclePattern[patternIdx];
    if (teamIdx === undefined || teamIdx < 0 || teamIdx >= draft.teams.length) continue;

    // Mark ALL hours of this shift block as covered (shift continuity)
    for (let h = 0; h < shiftLenH; h++) {
      const absHour = blockStart + h;
      const dayOfWeek = Math.floor(absHour / 24) % 7;
      const hourOfDay = absHour % 24;
      // Mark covered even if it's on an inactive day (shift spill-over)
      grid[dayOfWeek][hourOfDay] = 'covered';
    }
  }

  return grid;
}

function countGapHours(coverage: CoverageCell[][]): number {
  let gaps = 0;
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      if (coverage[day][hour] === 'gap') gaps++;
    }
  }
  return gaps;
}


/**
 * Check if a shift slot in the preview/sequence diagram is covered.
 * Each slot represents one full shift block — coverage is determined by
 * whether the block's START falls on an active day within operating hours.
 * (Shift continuity: once a shift starts, it runs to its natural end.)
 */
function isPreviewSlotCovered(stepIdx: number, draft: ShiftRotation): boolean {
  const shiftsPerDay = 24 / draft.shiftLengthHours;
  const dayIdx = Math.floor(stepIdx / shiftsPerDay) % 7;
  const slotHourStart = (stepIdx % shiftsPerDay) * draft.shiftLengthHours;

  if (!draft.activeDays[dayIdx]) return false;

  if (draft.operatingHoursStart === 0 && draft.operatingHoursEnd === 24) return true;

  if (draft.operatingHoursEnd > draft.operatingHoursStart) {
    return slotHourStart >= draft.operatingHoursStart && slotHourStart < draft.operatingHoursEnd;
  }

  return slotHourStart >= draft.operatingHoursStart || slotHourStart < draft.operatingHoursEnd;
}

// ─── Shift label helper ──────────────────────────────────────────────

function slotsPerDayForShiftLength(shiftLengthHours: number): number {
  return shiftLengthHours > 0 ? 24 / shiftLengthHours : 2;
}

function shiftStepLabel(stepIdx: number, shiftLengthHours: number): string {
  const shiftsPerDay = 24 / shiftLengthHours;
  const dayNum = Math.floor(stepIdx / shiftsPerDay) + 1;
  const slotInDay = stepIdx % shiftsPerDay;
  if (shiftsPerDay === 2) {
    return `D${dayNum} ${slotInDay === 0 ? 'Day' : 'Night'}`;
  }
  if (shiftsPerDay === 3) {
    const labels = ['Morn', 'Aftn', 'Night'];
    return `D${dayNum} ${labels[slotInDay] || `S${slotInDay + 1}`}`;
  }
  return `D${dayNum} S${slotInDay + 1}`;
}

// ─── Component ────────────────────────────────────────────────────────

interface ShiftScheduleProps {
  open: boolean;
  onClose: () => void;
}

export default function ShiftSchedule({ open, onClose }: ShiftScheduleProps) {
  const storeRotation = usePlantPulseStore((s) => s.shiftRotation);
  const setShiftRotation = usePlantPulseStore((s) => s.setShiftRotation);

  // Draft state
  const [draft, setDraft] = useState<ShiftRotation>({ ...storeRotation });
  const [dirty, setDirty] = useState(false);

  // Reload draft when modal opens
  useEffect(() => {
    if (open) {
      setDraft({
        ...storeRotation,
        teams: storeRotation.teams.map((t) => ({ ...t })),
        cyclePattern: [...storeRotation.cyclePattern],
        anchorDate: new Date(storeRotation.anchorDate),
        overrides: [...storeRotation.overrides],
        activeDays: [...(storeRotation.activeDays || [true, true, true, true, true, true, true])],
        operatingHoursStart: storeRotation.operatingHoursStart ?? 0,
        operatingHoursEnd: storeRotation.operatingHoursEnd ?? 24,
      });
      setDirty(false);
    }
  }, [open, storeRotation]);

  // ── Team editing ────────────────────────────────────────────────

  const updateTeam = useCallback((idx: number, updates: Partial<ShiftTeam>) => {
    setDraft((prev) => ({
      ...prev,
      teams: prev.teams.map((t, i) => (i === idx ? { ...t, ...updates } : t)),
    }));
    setDirty(true);
  }, []);

  const addTeam = useCallback(() => {
    const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'];
    const colors = ['#0066FF', '#00CC00', '#FF0000', '#FFFD00', '#FF6600', '#9966FF', '#00CCCC', '#CC6699'];
    const idx = draft.teams.length;
    setDraft((prev) => ({
      ...prev,
      teams: [...prev.teams, { name: names[idx] || `Team ${idx + 1}`, color: colors[idx] || '#888888' }],
    }));
    setDirty(true);
  }, [draft.teams.length]);

  const removeTeam = useCallback((idx: number) => {
    setDraft((prev) => {
      const newTeams = prev.teams.filter((_, i) => i !== idx);
      const newPattern = prev.cyclePattern.filter((t) => t < newTeams.length);
      return { ...prev, teams: newTeams, cyclePattern: newPattern.length > 0 ? newPattern : [0] };
    });
    setDirty(true);
  }, []);

  // ── Rotation preset ───────────────────────────────────────────

  const applyRotationPreset = useCallback((preset: RotationPreset) => {
    if (preset.id === 'custom') return;
    setDraft((prev) => {
      // Auto-adjust team count
      let newTeams = [...prev.teams.map((t) => ({ ...t }))];
      while (newTeams.length < preset.teams) {
        const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'];
        const colors = ['#0066FF', '#00CC00', '#FF0000', '#FFFD00', '#FF6600', '#9966FF', '#00CCCC', '#CC6699'];
        newTeams.push({
          name: names[newTeams.length] || `Team ${newTeams.length + 1}`,
          color: colors[newTeams.length] || '#888888',
        });
      }
      if (newTeams.length > preset.teams) {
        newTeams = newTeams.slice(0, preset.teams);
      }
      return {
        ...prev,
        teams: newTeams,
        shiftLengthHours: preset.shiftLength,
        cyclePattern: [...preset.pattern],
      };
    });
    setDirty(true);
  }, []);

  // ── Cycle editing ───────────────────────────────────────────────

  const updateCycleStep = useCallback((idx: number, teamIdx: number) => {
    setDraft((prev) => ({
      ...prev,
      cyclePattern: prev.cyclePattern.map((v, i) => (i === idx ? teamIdx : v)),
    }));
    setDirty(true);
  }, []);

  const addCycleStep = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      cyclePattern: [...prev.cyclePattern, 0],
    }));
    setDirty(true);
  }, []);

  const removeCycleStep = useCallback((idx: number) => {
    setDraft((prev) => ({
      ...prev,
      cyclePattern: prev.cyclePattern.filter((_, i) => i !== idx),
    }));
    setDirty(true);
  }, []);

  // ── Coverage / operation editing ──────────────────────────────

  const applyOperationPreset = useCallback((preset: OperationPreset) => {
    if (preset.id === 'custom-op') return;
    setDraft((prev) => ({
      ...prev,
      activeDays: [...preset.activeDays],
      operatingHoursStart: preset.hoursStart,
      operatingHoursEnd: preset.hoursEnd,
    }));
    setDirty(true);
  }, []);

  const toggleActiveDay = useCallback((dayIdx: number) => {
    setDraft((prev) => ({
      ...prev,
      activeDays: prev.activeDays.map((v, i) => (i === dayIdx ? !v : v)),
    }));
    setDirty(true);
  }, []);

  const updateOperatingHours = useCallback((field: 'operatingHoursStart' | 'operatingHoursEnd', value: number) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  }, []);

  // ── Anchor / day shift start ────────────────────────────────────

  const updateAnchor = useCallback((dateStr: string) => {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      setDraft((prev) => ({ ...prev, anchorDate: d }));
      setDirty(true);
    }
  }, []);

  const updateDayShiftStart = useCallback((hour: number) => {
    setDraft((prev) => ({ ...prev, dayShiftStartHour: hour }));
    setDirty(true);
  }, []);

  // ── Save ────────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    setShiftRotation(draft);
    setDirty(false);
  }, [draft, setShiftRotation]);

  // ── Computed values ─────────────────────────────────────────────

  const coverage = useMemo(() => computeCoverage(draft), [draft]);
  const gapHours = useMemo(() => countGapHours(coverage), [coverage]);
  const previewSlotsPerDay = useMemo(() => slotsPerDayForShiftLength(draft.shiftLengthHours), [draft.shiftLengthHours]);
  const sequenceDays = useMemo(() => {
    const cycleDays = Math.ceil(draft.cyclePattern.length / previewSlotsPerDay);
    return Math.min(14, Math.max(7, cycleDays));
  }, [draft.cyclePattern.length, previewSlotsPerDay]);

  // Detect matched rotation preset
  const patternStr = draft.cyclePattern.join(',');
  const matchedRotation = ROTATION_PRESETS.find(
    (p) => p.pattern.length > 0 && p.pattern.join(',') === patternStr && p.shiftLength === draft.shiftLengthHours
  );

  // Detect matched operation preset
  const matchedOperation = OPERATION_PRESETS.find(
    (p) => p.activeDays.length > 0 &&
      p.activeDays.join(',') === draft.activeDays.join(',') &&
      p.hoursStart === draft.operatingHoursStart &&
      p.hoursEnd === draft.operatingHoursEnd
  );

  // Cycle length in days
  const cycleDays = (draft.cyclePattern.length * draft.shiftLengthHours) / 24;

  const is24h = draft.operatingHoursStart === 0 && draft.operatingHoursEnd === 24;

  if (!open) return null;

  return (
    <div className="pp-modal-backdrop" onClick={onClose}>
      <div
        className="pp-modal"
        style={{ maxWidth: 680 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Shift Schedule"
      >
        {/* Header */}
        <div className="pp-modal-header">
          <h2 className="pp-modal-title">Shift Schedule</h2>
          <button className="pp-modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="pp-modal-body" style={{ padding: '16px 20px' }}>

          {/* ── Teams section ── */}
          <div className="pp-shift-section">
            <div className="pp-shift-section-header">
              <span className="pp-shift-section-title">Teams</span>
              <button
                className="pp-setup-add-btn"
                onClick={addTeam}
                disabled={draft.teams.length >= 8}
              >
                + Team
              </button>
            </div>

            <div className="pp-shift-teams-grid">
              {draft.teams.map((team, idx) => (
                <div key={idx} className="pp-shift-team-card">
                  <span className="pp-shift-team-index">{idx}</span>
                  <input
                    type="color"
                    value={team.color}
                    onChange={(e) => updateTeam(idx, { color: e.target.value })}
                    className="pp-shift-color-input"
                    title="Team color"
                  />
                  <input
                    type="text"
                    value={team.name}
                    onChange={(e) => updateTeam(idx, { name: e.target.value })}
                    className="pp-setup-input pp-shift-name-input"
                    placeholder="Team name"
                  />
                  {draft.teams.length > 2 && (
                    <button
                      className="pp-setup-action-btn pp-setup-delete-btn"
                      onClick={() => removeTeam(idx)}
                      title="Remove team"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Rotation pattern section ── */}
          <div className="pp-shift-section">
            <div className="pp-shift-section-header">
              <span className="pp-shift-section-title">Rotation Pattern</span>
              <span className="pp-shift-cycle-info">
                {draft.cyclePattern.length} slots &times; {draft.shiftLengthHours}h = {cycleDays} day{cycleDays !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Preset selector */}
            <div className="pp-shift-presets">
              {ROTATION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={`pp-shift-preset-btn${matchedRotation?.id === preset.id ? ' active' : ''}`}
                  onClick={() => applyRotationPreset(preset)}
                  disabled={preset.id === 'custom'}
                  title={preset.description}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Cycle grid — each step is one shift slot */}
            <div className="pp-shift-cycle-grid">
              {draft.cyclePattern.map((teamIdx, stepIdx) => (
                <div key={stepIdx} className="pp-shift-cycle-step">
                  <span className="pp-shift-step-label">
                    {shiftStepLabel(stepIdx, draft.shiftLengthHours)}
                  </span>
                  <select
                    value={teamIdx}
                    onChange={(e) => updateCycleStep(stepIdx, Number(e.target.value))}
                    className="pp-setup-select pp-shift-step-select"
                    style={{ borderLeftColor: draft.teams[teamIdx]?.color || '#ccc', borderLeftWidth: 3 }}
                  >
                    {draft.teams.map((t, ti) => (
                      <option key={ti} value={ti}>{t.name}</option>
                    ))}
                  </select>
                  {draft.cyclePattern.length > 2 && (
                    <button
                      className="pp-shift-step-remove"
                      onClick={() => removeCycleStep(stepIdx)}
                      title="Remove slot"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
              <button
                className="pp-shift-cycle-add"
                onClick={addCycleStep}
                title="Add shift slot"
              >
                +
              </button>
            </div>

            {/* Visual preview — small colored blocks with gap segments */}
            <div className="pp-shift-preview">
              <span className="pp-shift-preview-label">Preview:</span>
              {draft.cyclePattern.map((teamIdx, i) => {
                const covered = isPreviewSlotCovered(i, draft);
                const label = shiftStepLabel(i, draft.shiftLengthHours);
                const teamName = draft.teams[teamIdx]?.name || '?';
                return (
                  <span
                    key={i}
                    className="pp-shift-preview-block"
                    style={{ background: covered ? (draft.teams[teamIdx]?.color || '#ccc') : SHIFT_GAP_COLOR }}
                    title={covered ? `${teamName} — ${label}` : `No shift coverage — ${label}`}
                  />
                );
              })}
              <span className="pp-shift-preview-label" style={{ marginLeft: 8 }}>
                Gray = no coverage
              </span>
            </div>

            {/* Shift sequence diagram — Wikipedia-style grid: days × shift periods */}
            {draft.cyclePattern.length > 0 && (
              <div className="pp-shift-sequence">
                <span className="pp-shift-preview-label" style={{ marginBottom: 2 }}>Rotation sequence:</span>
                <div className="pp-shift-sequence-grid">
                  {/* Header row: day numbers */}
                  <div className="pp-shift-sequence-row">
                    <span className="pp-shift-sequence-label" />
                    {Array.from({ length: sequenceDays }, (_, d) => (
                      <span key={d} className="pp-shift-sequence-header">D{d + 1}</span>
                    ))}
                  </div>
                  {/* One row per shift period */}
                  {Array.from({ length: previewSlotsPerDay }, (_, slot) => {
                    const periodLabel = previewSlotsPerDay === 2
                      ? (slot === 0 ? 'Day' : 'Night')
                      : previewSlotsPerDay === 3
                        ? (['Morn', 'Aftn', 'Night'][slot] || `S${slot + 1}`)
                        : `S${slot + 1}`;
                    return (
                      <div key={slot} className="pp-shift-sequence-row">
                        <span className="pp-shift-sequence-label">{periodLabel}</span>
                        {Array.from({ length: sequenceDays }, (_, d) => {
                          const stepIdx = d * previewSlotsPerDay + slot;
                          const patternIdx = stepIdx % draft.cyclePattern.length;
                          const teamIdx = draft.cyclePattern[patternIdx];
                          const covered = isPreviewSlotCovered(stepIdx, draft);
                          const team = draft.teams[teamIdx];
                          const bg = covered ? (team?.color || '#ccc') : SHIFT_GAP_COLOR;
                          // Compute luminance to pick text color
                          const r = parseInt(bg.slice(1, 3), 16) || 0;
                          const g = parseInt(bg.slice(3, 5), 16) || 0;
                          const b = parseInt(bg.slice(5, 7), 16) || 0;
                          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                          return (
                            <span
                              key={d}
                              className="pp-shift-sequence-cell"
                              style={{ background: bg, color: lum > 0.55 ? '#1a1a2e' : '#fff' }}
                              title={covered ? `${team?.name || '?'} — D${d + 1} ${periodLabel}` : `No coverage — D${d + 1} ${periodLabel}`}
                            >
                              {covered ? (team?.name?.[0] || '?') : ''}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Plant Coverage section ── */}
          <div className="pp-shift-section">
            <div className="pp-shift-section-header">
              <span className="pp-shift-section-title">Plant Coverage</span>
              <span className={`pp-shift-coverage-badge${gapHours === 0 ? ' ok' : ' warning'}`}>
                {gapHours === 0 ? '\u2713 Fully covered' : `\u26A0 ${gapHours}h uncovered/week`}
              </span>
            </div>

            {/* Operation presets */}
            <div className="pp-shift-operation-presets">
              {OPERATION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={`pp-shift-operation-btn${matchedOperation?.id === preset.id ? ' active' : ''}`}
                  onClick={() => applyOperationPreset(preset)}
                  disabled={preset.id === 'custom-op'}
                  title={preset.description}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Active days toggles */}
            <div className="pp-shift-active-days">
              <span className="pp-shift-hint" style={{ marginRight: 6 }}>Active days:</span>
              {DAY_ABBR.map((abbr, i) => (
                <button
                  key={i}
                  className={`pp-shift-day-toggle${draft.activeDays[i] ? ' active' : ''}`}
                  onClick={() => toggleActiveDay(i)}
                  title={`Toggle ${abbr}`}
                >
                  {abbr}
                </button>
              ))}
            </div>

            {/* Operating hours (only when not 24h) */}
            {!is24h && (
              <div className="pp-shift-hours-row">
                <label className="pp-shift-hint">Open from</label>
                <select
                  value={draft.operatingHoursStart}
                  onChange={(e) => updateOperatingHours('operatingHoursStart', Number(e.target.value))}
                  className="pp-setup-select"
                  style={{ width: 80, fontSize: 11 }}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                  ))}
                </select>
                <label className="pp-shift-hint">to</label>
                <select
                  value={draft.operatingHoursEnd}
                  onChange={(e) => updateOperatingHours('operatingHoursEnd', Number(e.target.value))}
                  className="pp-setup-select"
                  style={{ width: 80, fontSize: 11 }}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1 === 24 ? '24:00' : `${String(i + 1).padStart(2, '0')}:00`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Plant operating window: green = open, gray = closed */}
            <span className="pp-shift-preview-label" style={{ marginBottom: 2, marginTop: 6, display: 'block' }}>
              Plant operating window:
            </span>
            <div className="pp-shift-heatmap">
              {/* Header row */}
              <div className="pp-shift-heatmap-row">
                <span className="pp-shift-heatmap-row-label" />
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h} className="pp-shift-heatmap-header">{h}</span>
                ))}
              </div>
              {/* Data rows — Monday first */}
              {[1, 2, 3, 4, 5, 6, 0].map((dayIdx) => {
                const dayActive = draft.activeDays[dayIdx];
                return (
                  <div key={dayIdx} className="pp-shift-heatmap-row">
                    <span className="pp-shift-heatmap-row-label">{DAY_ABBR[dayIdx]}</span>
                    {Array.from({ length: 24 }, (_, h) => {
                      let status: string;
                      if (!dayActive) {
                        status = 'outside';
                      } else if (is24h) {
                        status = 'covered';
                      } else {
                        const inWindow = draft.operatingHoursEnd > draft.operatingHoursStart
                          ? h >= draft.operatingHoursStart && h < draft.operatingHoursEnd
                          : h >= draft.operatingHoursStart || h < draft.operatingHoursEnd;
                        status = inWindow ? 'covered' : 'outside';
                      }
                      return (
                        <span
                          key={h}
                          className={`pp-shift-heatmap-cell ${status}`}
                          title={`${DAY_ABBR[dayIdx]} ${String(h).padStart(2, '0')}:00 — ${status === 'covered' ? 'operating' : 'closed'}`}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Shift coverage heatmap: 7 rows (days) × 24 columns (hours) */}
            <span className="pp-shift-preview-label" style={{ marginBottom: 2, marginTop: 10, display: 'block' }}>
              Shift coverage (green = covered, amber = gap within operating window, gray = outside):
            </span>
            <div className="pp-shift-heatmap">
              {/* Header row */}
              <div className="pp-shift-heatmap-row">
                <span className="pp-shift-heatmap-row-label" />
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h} className="pp-shift-heatmap-header">{h}</span>
                ))}
              </div>
              {/* Data rows — Monday first for display (reorder from Sun-first array) */}
              {[1, 2, 3, 4, 5, 6, 0].map((dayIdx) => (
                <div key={dayIdx} className="pp-shift-heatmap-row">
                  <span className="pp-shift-heatmap-row-label">{DAY_ABBR[dayIdx]}</span>
                  {coverage[dayIdx].map((cell, h) => (
                    <span key={h} className={`pp-shift-heatmap-cell ${cell}`} title={`${DAY_ABBR[dayIdx]} ${String(h).padStart(2, '0')}:00 — ${cell}`} />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* ── Timing section ── */}
          <div className="pp-shift-section">
            <div className="pp-shift-section-header">
              <span className="pp-shift-section-title">Timing</span>
            </div>

            <div className="pp-shift-timing-grid">
              <div className="pp-downtime-field">
                <label className="pp-downtime-field-label">Anchor Date &amp; Time</label>
                <input
                  type="datetime-local"
                  value={toDatetimeLocal(draft.anchorDate)}
                  onChange={(e) => updateAnchor(e.target.value)}
                  className="pp-setup-input pp-downtime-date-input"
                />
                <span className="pp-shift-hint">
                  The cycle starts counting from this date/time.
                </span>
              </div>

              <div className="pp-downtime-field">
                <label className="pp-downtime-field-label">Day Shift Starts At</label>
                <select
                  value={draft.dayShiftStartHour}
                  onChange={(e) => updateDayShiftStart(Number(e.target.value))}
                  className="pp-setup-select"
                  style={{ width: 100 }}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
                <span className="pp-shift-hint">
                  Shift length: {draft.shiftLengthHours}h (set by rotation preset).
                </span>
              </div>
            </div>
          </div>

          {/* ── Overrides (Enterprise CTA) ── */}
          <div className="pp-shift-section">
            <div className="pp-shift-section-header">
              <span className="pp-shift-section-title">
                Shift Overrides
                <span className="pp-naming-erp-badge" style={{ marginLeft: 6 }}>Enterprise</span>
              </span>
            </div>
            <p className="pp-shift-hint" style={{ margin: '4px 0 0' }}>
              Override specific shifts for holidays, emergencies, or one-off team swaps.
              Available in the Enterprise edition.
            </p>
          </div>

          {/* ── Holiday Calendar ── */}
          <div className="pp-shift-section">
            <div className="pp-shift-section-header">
              <span className="pp-shift-section-title">Holiday Calendar</span>
            </div>
            <p className="pp-shift-hint" style={{ margin: '4px 0 8px' }}>
              Slovenian public holidays (12 static dates + Easter Monday) are built into the
              system and automatically highlighted on the Wallboard and Schedule views.
            </p>
            <div className="pp-naming-erp-cta">
              <div className="pp-naming-erp-header">
                <span className="pp-naming-erp-icon">&#x1F4C5;</span>
                <span className="pp-naming-erp-title">Custom Holiday Calendars</span>
                <span className="pp-naming-erp-badge">Enterprise</span>
              </div>
              <p className="pp-naming-erp-desc">
                Import holiday calendars for any country or region. Support for
                multi-site operations with different regional calendars.
              </p>
              <a
                href="mailto:hello@plantpulse.pro?subject=Custom%20Holiday%20Calendar%20Inquiry"
                className="pp-naming-erp-link"
              >
                Ask for a quote &rarr; hello@plantpulse.pro
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pp-modal-footer">
          <span className="pp-modal-footer-hint">
            {dirty ? 'Unsaved changes' : ''}
          </span>
          <button
            className="pp-modal-btn pp-modal-btn-primary"
            onClick={handleSave}
            disabled={!dirty}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
