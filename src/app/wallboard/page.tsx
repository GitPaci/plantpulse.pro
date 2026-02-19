'use client';

// Wallboard — Read-only operator view
// Full-screen Canvas timeline with shift bands, batch bars, now-line
// Ported from VBA: InfoTabla20180201 (PowerPoint wallboard)

import Navigation from '@/components/ui/Navigation';
import WallboardCanvas from '@/components/timeline/WallboardCanvas';
import { usePlantPulseStore } from '@/lib/store';
import { currentShiftTeam } from '@/lib/shift-rotation';
import { SHIFT_TEAM_COLORS } from '@/lib/colors';
import { useEffect, useMemo, useState } from 'react';
import { addDays } from 'date-fns';

const TEAM_NAMES = ['Blue', 'Green', 'Red', 'Yellow'];

export default function WallboardPage() {
  const viewConfig = usePlantPulseStore((s) => s.viewConfig);
  const setViewConfig = usePlantPulseStore((s) => s.setViewConfig);
  const resetViewToToday = usePlantPulseStore((s) => s.resetViewToToday);

  // Reset timeline to today on every mount (direct nav, reload, returning from another page)
  useEffect(() => {
    resetViewToToday();
  }, [resetViewToToday]);

  const [now, setNow] = useState(() => new Date());

  // Keep badge in sync with real time (and any shift boundary crossing) without refresh.
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const teamIdx = useMemo(() => currentShiftTeam(now), [now]);
  const teamColor = SHIFT_TEAM_COLORS[teamIdx];
  const teamName = TEAM_NAMES[teamIdx];

  const hasActiveShift =
    Number.isInteger(teamIdx) &&
    teamIdx >= 0 &&
    teamIdx < TEAM_NAMES.length &&
    Boolean(teamColor);

  function shiftView(days: number) {
    setViewConfig({
      viewStart: addDays(viewConfig.viewStart, days),
    });
  }

  function resetView() {
    resetViewToToday();
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Navigation />

      {/* Toolbar */}
      <div className="h-10 bg-white border-b border-[var(--pp-border)] flex items-center px-4 gap-4 text-sm shrink-0">
        <button
          onClick={() => shiftView(-7)}
          className="px-2 py-0.5 border border-[var(--pp-border)] rounded text-xs hover:bg-gray-50"
        >
          &laquo; 7d
        </button>
        <button
          onClick={() => shiftView(-1)}
          className="px-2 py-0.5 border border-[var(--pp-border)] rounded text-xs hover:bg-gray-50"
        >
          &lsaquo; 1d
        </button>
        <button
          onClick={resetView}
          className="px-3 py-0.5 border border-[var(--pp-border)] rounded text-xs hover:bg-gray-50 font-medium"
        >
          Today
        </button>
        <button
          onClick={() => shiftView(1)}
          className="px-2 py-0.5 border border-[var(--pp-border)] rounded text-xs hover:bg-gray-50"
        >
          1d &rsaquo;
        </button>
        <button
          onClick={() => shiftView(7)}
          className="px-2 py-0.5 border border-[var(--pp-border)] rounded text-xs hover:bg-gray-50"
        >
          7d &raquo;
        </button>

        <div className="flex-1" />

        {/* Current shift indicator */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--pp-muted)]">Shift:</span>
          <span
            className="px-2 py-0.5 rounded font-bold"
            style={{
              backgroundColor: hasActiveShift ? `${teamColor}20` : '#F3F4F6',
              color: hasActiveShift ? (teamIdx === 3 ? '#997700' : teamColor) : '#6B7280',
              border: hasActiveShift ? `1px solid ${teamColor}40` : '1px solid #D1D5DB',
              boxShadow: hasActiveShift ? `0 0 0 1px ${teamColor}22` : 'none',
            }}
          >
            {hasActiveShift ? teamName : '—'}
          </span>
        </div>
      </div>

      {/* Canvas fills remaining space */}
      <div className="flex-1 min-h-0">
        <WallboardCanvas />
      </div>
    </div>
  );
}
