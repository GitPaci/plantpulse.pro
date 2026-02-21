'use client';

// Wallboard — Read-only operator view
// Full-screen Canvas timeline with shift bands, batch bars, now-line
// Ported from VBA: InfoTabla20180201 (PowerPoint wallboard)

import Navigation from '@/components/ui/Navigation';
import WallboardCanvas from '@/components/timeline/WallboardCanvas';
import { usePlantPulseStore } from '@/lib/store';
import { currentShiftTeam } from '@/lib/shift-rotation';
import { SHIFT_TEAM_COLORS } from '@/lib/colors';
import { useNightMode } from '@/lib/useNightMode';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wallboardRootRef = useRef<HTMLDivElement>(null);
  const { nightMode, toggle: toggleNightMode } = useNightMode();

  // Keep badge in sync with real time (and any shift boundary crossing) without refresh.
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Fullscreen API: sync state when user exits via ESC or browser controls
  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!wallboardRootRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await wallboardRootRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen toggle failed:', err);
    }
  }, []);

  const teamIdx = useMemo(() => currentShiftTeam(now), [now]);
  const teamColor = SHIFT_TEAM_COLORS[teamIdx];
  const teamName = TEAM_NAMES[teamIdx];
  const shiftLabel = now.getHours() >= 6 && now.getHours() < 18 ? 'Day' : 'Night';

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
    <div ref={wallboardRootRef} className={`h-screen flex flex-col overflow-hidden ${isFullscreen ? 'wallboard-fullscreen' : ''} ${nightMode ? 'wallboard-night' : ''}`}>
      {!isFullscreen && <Navigation />}

      {/* Toolbar */}
      {!isFullscreen && (
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

          {/* Night View toggle — immediately before Fullscreen button */}
          <button
            type="button"
            onClick={toggleNightMode}
            className={`wallboard-night-toggle inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-medium transition-colors ${
              nightMode
                ? 'border-amber-400/40 bg-amber-50 text-amber-700 hover:bg-amber-100'
                : 'border-indigo-300/40 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
            aria-label={nightMode ? 'Switch to Day View' : 'Switch to Night View'}
            title={nightMode ? 'Switch to Day View' : 'Switch to Night View'}
          >
            <span aria-hidden="true">{nightMode ? '\u2600' : '\uD83C\uDF19'}</span>
            {nightMode ? 'Day' : 'Night'}
          </button>

          {/* Fullscreen enter button — immediately before Shift indicator */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center justify-center rounded border border-[var(--pp-border)] p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            aria-label="Enter Fullscreen"
            title="Enter Fullscreen"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>

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
              {hasActiveShift ? `${teamName} · ${shiftLabel}` : '—'}
            </span>
          </div>
        </div>
      )}

      {/* Fullscreen overlays — appear on hover/interaction */}
      {isFullscreen && (
        <>
          {/* Night toggle overlay — top-left */}
          <div className="wallboard-fullscreen-overlay wallboard-fullscreen-night-overlay">
            <button
              type="button"
              onClick={toggleNightMode}
              className="wallboard-fullscreen-exit-btn"
              aria-label={nightMode ? 'Switch to Day View' : 'Switch to Night View'}
              title={nightMode ? 'Switch to Day View' : 'Switch to Night View'}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }} aria-hidden="true">
                {nightMode ? '\u2600\uFE0E' : '\uD83C\uDF19'}
              </span>
            </button>
          </div>

          {/* Exit fullscreen overlay — top-right */}
          <div className="wallboard-fullscreen-overlay">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="wallboard-fullscreen-exit-btn"
              aria-label="Exit Fullscreen"
              title="Exit Fullscreen"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          </div>
        </>
      )}

      {/* Canvas fills remaining space */}
      <div className="flex-1 min-h-0">
        <WallboardCanvas nightMode={nightMode} />
      </div>
    </div>
  );
}
