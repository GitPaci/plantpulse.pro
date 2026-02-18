'use client';

// Schedule — Month view with equipment group filters
// Shows schedules for selected equipment groups
// User can filter: All | Propagators (PRs) | Pre-fermenters (PFs) | Fermenters (Fs)
// User can pick month (prev/next navigation)

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Navigation from '@/components/ui/Navigation';
import WallboardCanvas from '@/components/timeline/WallboardCanvas';
import { usePlantPulseStore } from '@/lib/store';
import { INOCULUM_GROUP } from '@/lib/demo-data';
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

const FILTER_OPTIONS: FilterOption[] = [
  { id: 'inoculum', label: 'Inoculum', groups: ['inoculum'] },
  { id: 'all', label: 'All Equipment', groups: ['inoculum', 'propagator', 'pre_fermenter', 'fermenter'] },
  { id: 'pr', label: 'Propagators (PR)', groups: ['propagator'] },
  { id: 'pf', label: 'Pre-fermenters (PF)', groups: ['pre_fermenter'] },
  { id: 'f', label: 'Fermenters (F)', groups: ['fermenter'] },
];

export default function SchedulePage() {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [activeFilter, setActiveFilter] = useState('all');
  const canvasContainerRef = useRef<HTMLDivElement>(null);

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

  // Build filtered group IDs based on active machine group filter
  const filteredGroupIds = useMemo(() => {
    const filterOption = FILTER_OPTIONS.find((f) => f.id === activeFilter);
    if (!filterOption) return scheduleMachineGroups.map((g) => g.id);

    const allowedGroups = new Set(filterOption.groups);

    // Find which display groups contain machines matching the filter
    return scheduleMachineGroups
      .filter((dg) => {
        const groupMachines = machines.filter(
          (m) => dg.machineIds.includes(m.id) && allowedGroups.has(m.group)
        );
        return groupMachines.length > 0;
      })
      .map((g) => g.id);
  }, [activeFilter, machines, scheduleMachineGroups]);

  // Build dynamic filtered machine groups (only include matching machines)
  const filteredMachineGroups = useMemo(() => {
    const filterOption = FILTER_OPTIONS.find((f) => f.id === activeFilter);
    if (!filterOption || activeFilter === 'all') {
      return undefined; // show all
    }

    const allowedGroups = new Set(filterOption.groups);
    return scheduleMachineGroups
      .map((dg) => ({
        ...dg,
        machineIds: dg.machineIds.filter((id) => {
          const m = machines.find((mx) => mx.id === id);
          return m && allowedGroups.has(m.group);
        }),
      }))
      .filter((dg) => dg.machineIds.length > 0);
  }, [activeFilter, machines, scheduleMachineGroups]);

  // Count stages per group for the current month
  const stages = usePlantPulseStore((s) => s.stages);
  const monthEnd = endOfMonth(currentMonth);
  const monthStageCount = stages.filter(
    (s) => s.startDatetime >= currentMonth && s.startDatetime <= monthEnd
  ).length;

  const handleExportPdf = useCallback(async () => {
    const container = canvasContainerRef.current;
    if (!container) return;
    const canvas = container.querySelector('canvas');
    if (!canvas) return;
    const { exportSchedulePdf } = await import('@/lib/schedule-pdf-export');
    exportSchedulePdf(canvas);
  }, []);

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

        {/* Equipment group filters */}
        <div className="filter-chips">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`filter-chip ${activeFilter === opt.id ? 'active' : ''}`}
              onClick={() => setActiveFilter(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={handleExportPdf}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--pp-pharma)] border border-[var(--pp-border)] rounded-md hover:bg-[#e2e8f0] transition-colors"
          title="Export schedule as PDF"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <polyline points="9 15 12 18 15 15" />
          </svg>
          Export PDF
        </button>

        <span className="text-xs text-[var(--pp-muted)]">
          {monthStageCount} stages this month
        </span>
      </div>

      {/* Timeline canvas — month scope with filtered groups */}
      <div ref={canvasContainerRef} className="flex-1 min-h-0">
        <WallboardCanvas
          customMachineGroups={scheduleMachineGroups}
          filteredGroupIds={
            filteredMachineGroups
              ? filteredMachineGroups.map((g) => g.id)
              : undefined
          }
          showTodayHighlight={false}
          showNowLine={false}
          showShiftBand={false}
        />
      </div>
    </div>
  );
}
