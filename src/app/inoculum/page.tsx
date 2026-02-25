'use client';

// Schedule — Month view with equipment group filters
// Shows schedules for selected equipment groups
// Multi-select toggle: user can combine PR, PF, F, Inoculum filters
// User can pick month (prev/next navigation)

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Navigation from '@/components/ui/Navigation';
import WallboardCanvas from '@/components/timeline/WallboardCanvas';
import { usePlantPulseStore } from '@/lib/store';
import { INOCULUM_GROUP } from '@/lib/demo-data';
import { exportSchedulePdf } from '@/utils/exportSchedulePdf';
import PrintSettings from '@/settings/PrintSettings';
import {
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  format,
  getDaysInMonth,
} from 'date-fns';
import type { EquipmentGroup } from '@/lib/types';

// Fixed export surface for deterministic A4 landscape PDF rendering.
// 297mm × 210mm at 96 CSS DPI ≈ 1166 × 794 px.
const SCHEDULE_PDF_CANVAS_ID = 'schedule-export-canvas-pdf';
const SCHEDULE_PDF_VIEWPORT = {
  widthPx: 1122,
  heightPx: 794,
};

export default function SchedulePage() {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  // Multi-select: set of active filter IDs. Empty set = show all.
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [showPrintSettings, setShowPrintSettings] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);

  const machines = usePlantPulseStore((s) => s.machines);
  const machineGroups = usePlantPulseStore((s) => s.machineGroups);
  const equipmentGroups = usePlantPulseStore((s) => s.equipmentGroups);
  const setViewConfig = usePlantPulseStore((s) => s.setViewConfig);
  const loadDemoData = usePlantPulseStore((s) => s.loadDemoData);

  // Build filter options from dynamic equipment groups
  const filterOptions = useMemo(() =>
    [...equipmentGroups]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((eg) => ({
        id: eg.id,
        label: `${eg.name} (${eg.shortName})`,
        groupId: eg.id,
      })),
    [equipmentGroups]
  );

  useEffect(() => {
    loadDemoData();
  }, [loadDemoData]);

  // Update view config when month changes
  useEffect(() => {
    const daysInMonth = getDaysInMonth(currentMonth);
    setViewConfig({
      viewStart: currentMonth,
      numberOfDays: daysInMonth,
    });
  }, [currentMonth, setViewConfig]);

  // Schedule view includes Inoculum group (not in default store groups)
  const scheduleMachineGroups = useMemo(
    () => [INOCULUM_GROUP, ...machineGroups],
    [machineGroups]
  );

  // No specific filters selected = show all equipment
  const isAllActive = activeFilters.size === 0;

  // Toggle handler: multi-select for group buttons, reset for "All Equipment"
  const handleFilterClick = useCallback((id: string) => {
    if (id === 'all') {
      // "All Equipment" clears all selections → show everything
      setActiveFilters(new Set());
      return;
    }
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Build the set of allowed equipment group IDs from active filters
  const allowedMachineGroups = useMemo(() => {
    if (isAllActive) return null; // null = show all
    const groups = new Set<string>();
    for (const filterId of activeFilters) {
      const opt = filterOptions.find((f) => f.id === filterId);
      if (opt) {
        groups.add(opt.groupId);
      }
    }
    return groups;
  }, [activeFilters, isAllActive, filterOptions]);

  // Build filtered machine groups: only include machines matching active filters
  const filteredMachineGroups = useMemo(() => {
    if (!allowedMachineGroups) return undefined; // show all
    return scheduleMachineGroups
      .map((dg) => ({
        ...dg,
        machineIds: dg.machineIds.filter((id) => {
          const m = machines.find((mx) => mx.id === id);
          return m && allowedMachineGroups.has(m.group);
        }),
      }))
      .filter((dg) => dg.machineIds.length > 0);
  }, [allowedMachineGroups, machines, scheduleMachineGroups]);

  // Count stages per group for the current month
  const stages = usePlantPulseStore((s) => s.stages);
  const monthEnd = endOfMonth(currentMonth);
  const monthStageCount = stages.filter(
    (s) => s.startDatetime >= currentMonth && s.startDatetime <= monthEnd
  ).length;

  // Close mobile menu on outside click or Escape
  useEffect(() => {
    if (!mobileMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(e.target as Node) &&
        mobileToggleRef.current &&
        !mobileToggleRef.current.contains(e.target as Node)
      ) {
        setMobileMenuOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        mobileToggleRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [mobileMenuOpen]);

  // Helper: close mobile menu after an action
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const monthLabel = format(currentMonth, 'MMMM yyyy');
      await exportSchedulePdf(SCHEDULE_PDF_CANVAS_ID, monthLabel);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Navigation />

      {/* Month picker + filters toolbar */}
      <div className="schedule-toolbar bg-white border-b border-[var(--pp-border)] px-4 py-2.5 shrink-0 relative">
        {/* Desktop toolbar (>= 768px) */}
        <div className="schedule-toolbar-desktop hidden md:flex items-center gap-6">
          {/* Month navigation */}
          <div className="month-picker">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              &lsaquo; Prev
            </button>
            <div className="month-label">{format(currentMonth, 'MMMM yyyy')}</div>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              Next &rsaquo;
            </button>
          </div>

          {/* Separator */}
          <div className="w-px h-6 bg-[var(--pp-border)]" />

          {/* Equipment group filters — multi-select toggles + All Equipment reset */}
          <div className="filter-chips">
            {filterOptions.map((opt) => (
              <button
                key={opt.id}
                className={`filter-chip ${activeFilters.has(opt.id) ? 'active' : ''}`}
                onClick={() => handleFilterClick(opt.id)}
              >
                {opt.label}
              </button>
            ))}
            <button
              className={`filter-chip ${isAllActive ? 'active' : ''}`}
              onClick={() => handleFilterClick('all')}
            >
              All Equipment
            </button>
          </div>

          <div className="flex-1" />

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 rounded border border-[var(--pp-border)] px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Export schedule to PDF"
          >
            {isExporting ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating&hellip;
              </>
            ) : (
              <>
                <span aria-hidden="true">&#x2B07;</span>
                Export PDF
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowPrintSettings(true)}
            className="inline-flex items-center justify-center rounded border border-[var(--pp-border)] p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            aria-label="Print settings"
            title="Print settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          <span className="text-xs text-[var(--pp-muted)]">
            {monthStageCount} stages this month
          </span>
        </div>

        {/* Mobile toolbar (< 768px): hamburger toggle + month label */}
        <div className="schedule-toolbar-mobile flex md:hidden items-center gap-3">
          <button
            ref={mobileToggleRef}
            type="button"
            className="inline-flex items-center gap-1.5 rounded border border-[var(--pp-border)] px-3 py-1.5 text-sm font-medium text-[var(--pp-pharma)] hover:bg-slate-50"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle schedule controls"
            aria-expanded={mobileMenuOpen}
            aria-controls="schedule-mobile-panel"
          >
            <span aria-hidden="true" className="text-base leading-none">&#9776;</span>
            Controls
          </button>
          <span className="text-sm font-semibold text-[var(--pp-pharma)]">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <span className="ml-auto text-xs text-[var(--pp-muted)]">
            {monthStageCount} stages
          </span>
        </div>

        {/* Mobile dropdown panel */}
        {mobileMenuOpen && (
          <div
            id="schedule-mobile-panel"
            ref={mobileMenuRef}
            className="schedule-mobile-panel md:hidden"
            role="region"
            aria-label="Schedule controls"
          >
            {/* Section A: Month navigation */}
            <div className="schedule-mobile-section">
              <div className="text-xs font-medium text-[var(--pp-muted)] uppercase tracking-wide mb-2">Month</div>
              <div className="flex items-center gap-3">
                <button
                  className="schedule-mobile-btn flex-1"
                  onClick={() => { setCurrentMonth(subMonths(currentMonth, 1)); closeMobileMenu(); }}
                >
                  &lsaquo; Prev
                </button>
                <span className="text-sm font-semibold text-[var(--pp-pharma)] text-center min-w-[120px]">
                  {format(currentMonth, 'MMMM yyyy')}
                </span>
                <button
                  className="schedule-mobile-btn flex-1"
                  onClick={() => { setCurrentMonth(addMonths(currentMonth, 1)); closeMobileMenu(); }}
                >
                  Next &rsaquo;
                </button>
              </div>
            </div>

            {/* Section B: Equipment filters */}
            <div className="schedule-mobile-section">
              <div className="text-xs font-medium text-[var(--pp-muted)] uppercase tracking-wide mb-2">Equipment Filters</div>
              <div className="grid grid-cols-2 gap-2">
                {filterOptions.map((opt) => (
                  <button
                    key={opt.id}
                    className={`schedule-mobile-filter ${activeFilters.has(opt.id) ? 'active' : ''}`}
                    onClick={() => { handleFilterClick(opt.id); closeMobileMenu(); }}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  className={`schedule-mobile-filter col-span-2 ${isAllActive ? 'active' : ''}`}
                  onClick={() => { handleFilterClick('all'); closeMobileMenu(); }}
                >
                  All Equipment
                </button>
              </div>
            </div>

            {/* Section C: Export/Print actions */}
            <div className="schedule-mobile-section border-b-0 pb-0">
              <div className="text-xs font-medium text-[var(--pp-muted)] uppercase tracking-wide mb-2">Actions</div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => { handleExportPdf(); closeMobileMenu(); }}
                  disabled={isExporting}
                  className="schedule-mobile-action"
                >
                  {isExporting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating&hellip;
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true">&#x2B07;</span>
                      Export PDF
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowPrintSettings(true); closeMobileMenu(); }}
                  className="schedule-mobile-action"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Print Settings
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Timeline canvas — month scope with filtered groups */}
      <div className="flex-1 min-h-0">
        <WallboardCanvas
          canvasId="schedule-export-canvas"
          // Schedule filtering must use the same machine set for rows + events.
          // Pass fully filtered groups directly so the canvas row layout and
          // stage filtering both derive from the same visible machine IDs.
          customMachineGroups={filteredMachineGroups ?? scheduleMachineGroups}
          showTodayHighlight={false}
          showNowLine={false}
          showShiftBand={false}
        />
      </div>

      {/* Hidden fixed-size render target used only for PDF export.
          Keeps export output independent from mobile/desktop viewport size. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed"
        style={{
          left: '-99999px',
          top: 0,
          width: `${SCHEDULE_PDF_VIEWPORT.widthPx}px`,
          height: `${SCHEDULE_PDF_VIEWPORT.heightPx}px`,
          visibility: 'hidden',
        }}
      >
        <WallboardCanvas
          canvasId={SCHEDULE_PDF_CANVAS_ID}
          customMachineGroups={filteredMachineGroups ?? scheduleMachineGroups}
          showTodayHighlight={false}
          showNowLine={false}
          showShiftBand={false}
        />
      </div>

      <PrintSettings
        open={showPrintSettings}
        onClose={() => setShowPrintSettings(false)}
      />
    </div>
  );
}
