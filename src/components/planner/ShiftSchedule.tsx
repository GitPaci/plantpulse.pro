'use client';

// Shift Schedule modal — configure shift teams, rotation pattern, anchor date.
// Follows the same draft-state pattern as EquipmentSetup/ProcessSetup:
// all edits are local until Save. Reuses pp-modal-* CSS classes.

import { useState, useEffect, useCallback } from 'react';
import { usePlantPulseStore } from '@/lib/store';
import type { ShiftRotation, ShiftTeam } from '@/lib/types';

// ─── Date helper ──────────────────────────────────────────────────────

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Cycle pattern presets ────────────────────────────────────────────

const CYCLE_PRESETS: { label: string; pattern: number[] }[] = [
  { label: 'Russian 4-team (default)', pattern: [0, 2, 1, 3, 2, 0, 3, 1] },
  { label: 'Simple rotation A-B-C-D',  pattern: [0, 1, 2, 3] },
  { label: '2-team alternating',        pattern: [0, 1] },
  { label: 'Custom',                    pattern: [] },
];

// Day names for cycle visualization
const SHIFT_LABELS = ['Day', 'Night'] as const;

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
    const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];
    const colors = ['#0066FF', '#00CC00', '#FF0000', '#FFFD00', '#FF6600', '#9966FF'];
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
      // Remove references to deleted team from cycle pattern
      const newPattern = prev.cyclePattern.filter((t) => t < newTeams.length);
      return { ...prev, teams: newTeams, cyclePattern: newPattern.length > 0 ? newPattern : [0] };
    });
    setDirty(true);
  }, []);

  // ── Cycle editing ───────────────────────────────────────────────

  const applyPreset = useCallback((pattern: number[]) => {
    if (pattern.length === 0) return; // "Custom" — do nothing, user edits manually
    setDraft((prev) => ({ ...prev, cyclePattern: [...pattern] }));
    setDirty(true);
  }, []);

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

  if (!open) return null;

  // Detect which preset matches current pattern
  const patternStr = draft.cyclePattern.join(',');
  const matchedPreset = CYCLE_PRESETS.find(
    (p) => p.pattern.length > 0 && p.pattern.join(',') === patternStr
  );

  // Cycle length in days
  const cycleDays = (draft.cyclePattern.length * draft.shiftLengthHours) / 24;

  return (
    <div className="pp-modal-backdrop" onClick={onClose}>
      <div
        className="pp-modal"
        style={{ maxWidth: 600 }}
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
                {draft.cyclePattern.length} slots = {cycleDays} day{cycleDays !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Preset selector */}
            <div className="pp-shift-presets">
              {CYCLE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  className={`pp-shift-preset-btn${matchedPreset?.label === preset.label ? ' active' : ''}`}
                  onClick={() => applyPreset(preset.pattern)}
                  disabled={preset.pattern.length === 0}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Cycle grid — each step is one shift slot */}
            <div className="pp-shift-cycle-grid">
              {draft.cyclePattern.map((teamIdx, stepIdx) => {
                const shiftType = stepIdx % 2; // 0=day, 1=night within each day
                const dayNum = Math.floor(stepIdx / 2) + 1;
                return (
                  <div key={stepIdx} className="pp-shift-cycle-step">
                    <span className="pp-shift-step-label">
                      D{dayNum} {SHIFT_LABELS[shiftType]}
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
                );
              })}
              <button
                className="pp-shift-cycle-add"
                onClick={addCycleStep}
                title="Add shift slot"
              >
                +
              </button>
            </div>

            {/* Visual preview — small colored blocks */}
            <div className="pp-shift-preview">
              <span className="pp-shift-preview-label">Preview:</span>
              {draft.cyclePattern.map((teamIdx, i) => (
                <span
                  key={i}
                  className="pp-shift-preview-block"
                  style={{ background: draft.teams[teamIdx]?.color || '#ccc' }}
                  title={`${draft.teams[teamIdx]?.name || '?'} — ${SHIFT_LABELS[i % 2]}`}
                />
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
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
                <span className="pp-shift-hint">
                  Night shift starts {draft.shiftLengthHours}h later at{' '}
                  {String((draft.dayShiftStartHour + draft.shiftLengthHours) % 24).padStart(2, '0')}:00.
                </span>
              </div>

              <div className="pp-downtime-field">
                <label className="pp-downtime-field-label">Shift Length</label>
                <span className="pp-shift-readonly">{draft.shiftLengthHours}h</span>
                <span className="pp-shift-hint pp-shift-enterprise">
                  Custom shift lengths available in Enterprise edition.
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
