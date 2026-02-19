'use client';

// Schedule — Month view with equipment group filters
// Shows schedules for selected equipment groups
// Multi-select toggle: user can combine PR, PF, F, Inoculum filters
// User can pick month (prev/next navigation)

import { useState, useMemo, useEffect, useCallback } from 'react';
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
import type { MachineGroup } from '@/lib/types';

interface FilterOption {
  id: string;
  label: string;
  groups: MachineGroup[];
}

// Button order: Inoculum, Propagators, Pre-fermenters, Fermenters, All Equipment
const FILTER_OPTIONS: FilterOption[] = [
  { id: 'inoculum', label: 'Inoculum', groups: ['inoculum'] },
  { id: 'pr', label: 'Propagators (PR)', groups: ['propagator'] },
  { id: 'pf', label: 'Pre-fermenters (PF)', groups: ['pre_fermenter'] },
  { id: 'f', label: 'Fermenters (F)', groups: ['fermenter'] },
];

export default function SchedulePage() {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  // Multi-select: set of active filter IDs. Empty set = show all.
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [showPrintSettings, setShowPrintSettings] = useState(false);

  const machines = usePlantPulseStore((s) => s.machines);
  const machineGroups = usePlantPulseStore((s) => s.machineGroups);
  const setViewConfig = usePlantPulseStore((s) => s.setViewConfig);
  const loadDemoData = usePlantPulseStore((s) => s.loadDemoData);

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

  // Build the set of allowed MachineGroup values from active filters
  const allowedMachineGroups = useMemo(() => {
    if (isAllActive) return null; // null = show all
    const groups = new Set<MachineGroup>();
    for (const filterId of activeFilters) {
      const opt = FILTER_OPTIONS.find((f) => f.id === filterId);
      if (opt) {
        for (const g of opt.groups) {
          groups.add(g);
        }
      }
    }
    return groups;
  }, [activeFilters, isAllActive]);

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

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const monthLabel = format(currentMonth, 'MMMM yyyy');
      await exportSchedulePdf('schedule-export-canvas', monthLabel);
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
      <div className="bg-white border-b border-[var(--pp-border)] px-4 py-2.5 flex items-center gap-6 shrink-0">
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
          {FILTER_OPTIONS.map((opt) => (
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

      <PrintSettings
        open={showPrintSettings}
        onClose={() => setShowPrintSettings(false)}
      />
    </div>
  );
}
