'use client';

// Wallboard — Read-only operator view
// Full-screen Canvas timeline with shift bands, batch bars, now-line
// Ported from VBA: InfoTabla20180201 (PowerPoint wallboard)

import Navigation from '@/components/ui/Navigation';
import WallboardCanvas from '@/components/timeline/WallboardCanvas';
import WallboardDisplaySettings from '@/components/wallboard/WallboardDisplaySettings';
import { usePlantPulseStore } from '@/lib/store';
import { currentShiftTeam } from '@/lib/shift-rotation';
import { useNightMode } from '@/lib/useNightMode';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { addDays, subHours, differenceInHours } from 'date-fns';
import type { MachineDisplayGroup } from '@/lib/types';

const ZOOM_LEVELS = [5, 7, 10, 14, 21, 30];
const ZOOM_DEFAULT_DESKTOP = 4; // 21d
const ZOOM_DEFAULT_MOBILE = 2;  // 10d

export default function WallboardPage() {
  const viewConfig = usePlantPulseStore((s) => s.viewConfig);
  const setViewConfig = usePlantPulseStore((s) => s.setViewConfig);
  const resetViewToToday = usePlantPulseStore((s) => s.resetViewToToday);
  const machines = usePlantPulseStore((s) => s.machines);
  const machineGroups = usePlantPulseStore((s) => s.machineGroups);
  const wallboardEquipmentGroups = usePlantPulseStore((s) => s.wallboardEquipmentGroups);
  const shiftRotation = usePlantPulseStore((s) => s.shiftRotation);
  const loadDemoData = usePlantPulseStore((s) => s.loadDemoData);

  // Load demo data on mount (page-level, not inside WallboardCanvas)
  useEffect(() => {
    loadDemoData();
  }, [loadDemoData]);

  // Reset timeline to today on every mount (direct nav, reload, returning from another page)
  useEffect(() => {
    resetViewToToday();
  }, [resetViewToToday]);

  // Filter machine groups to only show equipment groups selected in Wallboard Display settings
  const wallboardGroups: MachineDisplayGroup[] = useMemo(() => {
    const allowedSet = new Set(wallboardEquipmentGroups);
    return machineGroups
      .map((dg) => ({
        ...dg,
        machineIds: dg.machineIds.filter((id) => {
          const m = machines.find((mx) => mx.id === id);
          return m && allowedSet.has(m.group);
        }),
      }))
      .filter((dg) => dg.machineIds.length > 0);
  }, [machineGroups, machines, wallboardEquipmentGroups]);

  const [zoomIdx, setZoomIdx] = useState(() => {
    const idx = ZOOM_LEVELS.indexOf(viewConfig.numberOfDays);
    return idx !== -1 ? idx : ZOOM_DEFAULT_DESKTOP;
  });

  // On mobile, default to 10d for better clarity
  useEffect(() => {
    if (window.innerWidth < 768) {
      setZoomIdx(ZOOM_DEFAULT_MOBILE);
      setViewConfig({ numberOfDays: ZOOM_LEVELS[ZOOM_DEFAULT_MOBILE] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyZoom(newIdx: number) {
    const newDays = ZOOM_LEVELS[newIdx];
    const currentDays = viewConfig.numberOfDays;
    const now = new Date();
    const hoursFromStart = differenceInHours(now, viewConfig.viewStart);
    const fracPos = hoursFromStart / (currentDays * 24);
    const newViewStart = subHours(now, fracPos * newDays * 24);
    setViewConfig({ viewStart: newViewStart, numberOfDays: newDays });
    setZoomIdx(newIdx);
  }

  const [now, setNow] = useState(() => new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [wbMobileOpen, setWbMobileOpen] = useState(false);
  const wallboardRootRef = useRef<HTMLDivElement>(null);
  const wbMobileMenuRef = useRef<HTMLDivElement>(null);
  const wbMobileToggleRef = useRef<HTMLButtonElement>(null);
  const { nightMode, toggle: toggleNightMode } = useNightMode();

  const closeWbMobile = useCallback(() => setWbMobileOpen(false), []);

  // Close wallboard mobile menu on outside click or Escape
  useEffect(() => {
    if (!wbMobileOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        wbMobileMenuRef.current && !wbMobileMenuRef.current.contains(e.target as Node) &&
        wbMobileToggleRef.current && !wbMobileToggleRef.current.contains(e.target as Node)
      ) {
        setWbMobileOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setWbMobileOpen(false);
        wbMobileToggleRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [wbMobileOpen]);

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

  const teamIdx = useMemo(() => currentShiftTeam(now, shiftRotation.anchorDate, shiftRotation.cyclePattern, shiftRotation.shiftLengthHours), [now, shiftRotation.anchorDate, shiftRotation.cyclePattern, shiftRotation.shiftLengthHours]);
  const teamColor = shiftRotation.teams[teamIdx]?.color || '#888';
  const teamName = shiftRotation.teams[teamIdx]?.name || `Team ${teamIdx}`;
  const dayStart = shiftRotation.dayShiftStartHour;
  const nightStart = (dayStart + shiftRotation.shiftLengthHours) % 24;
  const shiftLabel = now.getHours() >= dayStart && now.getHours() < nightStart ? 'Day' : 'Night';

  const hasActiveShift =
    Number.isInteger(teamIdx) &&
    teamIdx >= 0 &&
    teamIdx < shiftRotation.teams.length &&
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
        <div className="bg-white border-b border-[var(--pp-border)] shrink-0 relative">
          {/* Desktop toolbar (>= 768px) */}
          <div className="h-10 hidden md:flex items-center px-4 gap-4 text-sm">
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

            {/* Zoom controls */}
            <div className="flex items-center gap-1 border-l border-[var(--pp-border)] pl-4">
              <button
                onClick={() => applyZoom(zoomIdx - 1)}
                disabled={zoomIdx === 0}
                className="px-2 py-0.5 border border-[var(--pp-border)] rounded text-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Zoom in (fewer days)"
              >+</button>
              <span className="text-xs text-[var(--pp-muted)] min-w-[2.5rem] text-center">
                {ZOOM_LEVELS[zoomIdx]}d
              </span>
              <button
                onClick={() => applyZoom(zoomIdx + 1)}
                disabled={zoomIdx === ZOOM_LEVELS.length - 1}
                className="px-2 py-0.5 border border-[var(--pp-border)] rounded text-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Zoom out (more days)"
              >−</button>
            </div>

            <div className="flex-1" />

            {/* Night View toggle */}
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

            {/* Fullscreen enter button */}
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

            {/* Wallboard Display settings — gear icon */}
            <button
              type="button"
              onClick={() => setShowDisplaySettings(true)}
              className="inline-flex items-center justify-center rounded border border-[var(--pp-border)] p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              aria-label="Wallboard Display Settings"
              title="Wallboard Display Settings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>

          {/* Mobile toolbar (< 768px) */}
          <div className="h-10 flex md:hidden items-center px-4 gap-3 text-sm">
            <button
              ref={wbMobileToggleRef}
              type="button"
              className="inline-flex items-center gap-1.5 rounded border border-[var(--pp-border)] px-3 py-1.5 text-sm font-medium text-[var(--pp-pharma)] hover:bg-slate-50"
              onClick={() => setWbMobileOpen((v) => !v)}
              aria-label="Toggle wallboard controls"
              aria-expanded={wbMobileOpen}
              aria-controls="wallboard-mobile-panel"
            >
              <span aria-hidden="true" className="text-base leading-none">&#9776;</span>
              Controls
            </button>
            <button
              onClick={resetView}
              className="px-3 py-1.5 border border-[var(--pp-border)] rounded text-sm font-medium hover:bg-gray-50"
            >
              Today
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-1 text-xs">
              <span
                className="px-2 py-0.5 rounded font-bold"
                style={{
                  backgroundColor: hasActiveShift ? `${teamColor}20` : '#F3F4F6',
                  color: hasActiveShift ? (teamIdx === 3 ? '#997700' : teamColor) : '#6B7280',
                  border: hasActiveShift ? `1px solid ${teamColor}40` : '1px solid #D1D5DB',
                }}
              >
                {hasActiveShift ? teamName : '—'}
              </span>
            </div>
          </div>

          {/* Mobile dropdown panel */}
          {wbMobileOpen && (
            <div
              id="wallboard-mobile-panel"
              ref={wbMobileMenuRef}
              className="wallboard-mobile-panel md:hidden"
              role="region"
              aria-label="Wallboard controls"
            >
              {/* Navigation */}
              <div className="wallboard-mobile-section">
                <div className="text-xs font-medium text-[var(--pp-muted)] uppercase tracking-wide mb-2">Navigation</div>
                <div className="flex items-center gap-2">
                  <button className="wallboard-mobile-btn flex-1" onClick={() => { shiftView(-7); closeWbMobile(); }}>&laquo; 7d</button>
                  <button className="wallboard-mobile-btn flex-1" onClick={() => { shiftView(-1); closeWbMobile(); }}>&lsaquo; 1d</button>
                  <button className="wallboard-mobile-btn flex-1 font-medium" onClick={() => { resetView(); closeWbMobile(); }}>Today</button>
                  <button className="wallboard-mobile-btn flex-1" onClick={() => { shiftView(1); closeWbMobile(); }}>1d &rsaquo;</button>
                  <button className="wallboard-mobile-btn flex-1" onClick={() => { shiftView(7); closeWbMobile(); }}>7d &raquo;</button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    className="wallboard-mobile-btn flex-1"
                    disabled={zoomIdx === 0}
                    onClick={() => applyZoom(zoomIdx - 1)}
                  >+ Zoom in</button>
                  <span className="text-xs text-[var(--pp-muted)] min-w-[3rem] text-center">{ZOOM_LEVELS[zoomIdx]}d</span>
                  <button
                    className="wallboard-mobile-btn flex-1"
                    disabled={zoomIdx === ZOOM_LEVELS.length - 1}
                    onClick={() => applyZoom(zoomIdx + 1)}
                  >− Zoom out</button>
                </div>
              </div>

              {/* Display */}
              <div className="wallboard-mobile-section">
                <div className="text-xs font-medium text-[var(--pp-muted)] uppercase tracking-wide mb-2">Display</div>
                <div className="flex flex-col gap-2">
                  <button
                    className="wallboard-mobile-action"
                    onClick={() => { toggleNightMode(); closeWbMobile(); }}
                  >
                    <span aria-hidden="true">{nightMode ? '\u2600' : '\uD83C\uDF19'}</span>
                    {nightMode ? 'Switch to Day View' : 'Switch to Night View'}
                  </button>
                  <button
                    className="wallboard-mobile-action"
                    onClick={() => { toggleFullscreen(); closeWbMobile(); }}
                  >
                    Fullscreen
                  </button>
                  <button
                    className="wallboard-mobile-action"
                    onClick={() => { setShowDisplaySettings(true); closeWbMobile(); }}
                  >
                    Display Settings
                  </button>
                </div>
              </div>

              {/* Shift info */}
              <div className="wallboard-mobile-section border-b-0 pb-0">
                <div className="text-xs font-medium text-[var(--pp-muted)] uppercase tracking-wide mb-2">Current Shift</div>
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className="px-3 py-1.5 rounded font-bold"
                    style={{
                      backgroundColor: hasActiveShift ? `${teamColor}20` : '#F3F4F6',
                      color: hasActiveShift ? (teamIdx === 3 ? '#997700' : teamColor) : '#6B7280',
                      border: hasActiveShift ? `1px solid ${teamColor}40` : '1px solid #D1D5DB',
                    }}
                  >
                    {hasActiveShift ? `${teamName} · ${shiftLabel}` : 'No active shift'}
                  </span>
                </div>
              </div>
            </div>
          )}
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
        <WallboardCanvas nightMode={nightMode} customMachineGroups={wallboardGroups} showShutdownLabels={true} showCheckpoints={true} />
      </div>

      {/* Wallboard Display Settings modal */}
      <WallboardDisplaySettings
        open={showDisplaySettings}
        onClose={() => setShowDisplaySettings(false)}
      />
    </div>
  );
}
