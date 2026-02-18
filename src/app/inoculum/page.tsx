'use client';

// Schedule — Month view with equipment group filters
// Shows schedules for selected equipment groups
// User can filter: All | Propagators (PRs) | Pre-fermenters (PFs) | Fermenters (Fs)
// User can pick month (prev/next navigation)

import { useState, useMemo, useEffect } from 'react';
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

  const handleExportPdf = () => {
    const scheduleCanvas = document.getElementById('schedule-export-canvas') as HTMLCanvasElement | null;
    if (!scheduleCanvas) return;

    const imageDataUrl = scheduleCanvas.toDataURL('image/png');
    const printDate = format(new Date(), 'yyyy-MM-dd HH:mm');
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) return;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>PlantPulse Schedule Export</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 10mm;
            }

            html,
            body {
              margin: 0;
              width: 100%;
              height: 100%;
              font-family: Arial, sans-serif;
              color: #0f172a;
            }

            .page {
              box-sizing: border-box;
              width: 277mm;
              height: 190mm;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              gap: 5mm;
            }

            .schedule-area {
              flex: 1 1 auto;
              min-height: 0;
              border: 1px solid #dbe2ea;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
            }

            .schedule-image {
              width: 100%;
              height: 100%;
              object-fit: contain;
              object-position: center center;
            }

            .footer {
              flex: 0 0 auto;
              border-top: 1px solid #dbe2ea;
              padding-top: 3mm;
              font-size: 10px;
              line-height: 1.3;
              color: #475569;
            }

            .footer strong {
              color: #334155;
              font-weight: 600;
            }
          </style>
        </head>
        <body>
          <main class="page">
            <section class="schedule-area">
              <img class="schedule-image" src="${imageDataUrl}" alt="Schedule export" />
            </section>
            <footer class="footer">
              <div>Printed by PlantPulse — valid only on the print date</div>
              <div>Print date: ${printDate} (local time)</div>
              <div>Signature: __________________________</div>
              <div><strong>Disclaimer:</strong> Consult the applicable internal procedure for correct use.</div>
            </footer>
          </main>
          <script>
            window.addEventListener('load', () => {
              window.focus();
              window.print();
            });
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
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
          type="button"
          onClick={handleExportPdf}
          className="inline-flex items-center gap-1 rounded border border-[var(--pp-border)] px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          aria-label="Export schedule to PDF"
        >
          <span aria-hidden="true">🖨️</span>
          Export PDF
        </button>

        <span className="text-xs text-[var(--pp-muted)]">
          {monthStageCount} stages this month
        </span>
      </div>

      {/* Timeline canvas — month scope with filtered groups */}
      <div className="flex-1 min-h-0">
        <WallboardCanvas
          canvasId="schedule-export-canvas"
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
