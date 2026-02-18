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


function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function createSchedulePdfBlob(canvas: HTMLCanvasElement, printDate: string): Blob {
  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const jpegBase64 = jpegDataUrl.split(',')[1] ?? '';
  const imageBytes = Uint8Array.from(atob(jpegBase64), (char) => char.charCodeAt(0));

  const pageWidth = 841.89; // A4 landscape width (pt)
  const pageHeight = 595.28; // A4 landscape height (pt)
  const margin = 28.35; // 10 mm in points
  const contentGap = 10;
  const footerLineHeight = 13;
  const footerTopPadding = 10;
  const footerHeight = footerTopPadding + footerLineHeight * 4;

  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2 - footerHeight - contentGap;

  const imageAspect = canvas.width / canvas.height;
  const contentAspect = contentWidth / contentHeight;

  const drawWidth = imageAspect > contentAspect ? contentWidth : contentHeight * imageAspect;
  const drawHeight = imageAspect > contentAspect ? contentWidth / imageAspect : contentHeight;
  const drawX = margin + (contentWidth - drawWidth) / 2;
  const drawY = margin + footerHeight + contentGap + (contentHeight - drawHeight) / 2;

  const footerLineY = margin + footerHeight - 2;
  const footerTextStartY = footerLineY - 12;

  const footerLines = [
    'Printed by PlantPulse - valid only on the print date',
    `Print date: ${printDate} (local time)`,
    'Signature: __________________________',
    'Disclaimer: Consult the applicable internal procedure for correct use.',
  ];

  const contentCommands = [
    'q',
    `${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm`,
    '/Im0 Do',
    'Q',
    '0.86 0.89 0.93 RG',
    '1 w',
    `${margin.toFixed(2)} ${footerLineY.toFixed(2)} m ${(pageWidth - margin).toFixed(2)} ${footerLineY.toFixed(2)} l S`,
    '0.29 0.35 0.41 rg',
    '/F1 10 Tf',
  ];

  footerLines.forEach((line, index) => {
    const y = footerTextStartY - index * footerLineHeight;
    contentCommands.push(
      `BT 1 0 0 1 ${margin.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(line)}) Tj ET`
    );
  });

  const contentStream = `${contentCommands.join('\n')}\n`;

  const encoder = new TextEncoder();
  const chunks: BlobPart[] = [];
  const offsets: number[] = [0];
  let total = 0;

  const pushAscii = (value: string) => {
    const bytes = encoder.encode(value);
    chunks.push(bytes);
    total += bytes.length;
  };

  const pushBytes = (bytes: Uint8Array<ArrayBuffer>) => {
    chunks.push(bytes);
    total += bytes.length;
  };

  pushAscii('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  const startObject = (id: number) => {
    offsets[id] = total;
    pushAscii(`${id} 0 obj\n`);
  };

  startObject(1);
  pushAscii('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  startObject(2);
  pushAscii('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  startObject(3);
  pushAscii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> /Font << /F1 5 0 R >> >> /Contents 6 0 R >>\nendobj\n`);

  startObject(4);
  pushAscii(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
  pushBytes(imageBytes);
  pushAscii('\nendstream\nendobj\n');

  startObject(5);
  pushAscii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  const contentBytes = encoder.encode(contentStream);
  startObject(6);
  pushAscii(`<< /Length ${contentBytes.length} >>\nstream\n`);
  pushBytes(contentBytes);
  pushAscii('endstream\nendobj\n');

  const xrefStart = total;
  pushAscii('xref\n0 7\n');
  pushAscii('0000000000 65535 f \n');
  for (let i = 1; i <= 6; i++) {
    pushAscii(`${offsets[i].toString().padStart(10, '0')} 00000 n \n`);
  }
  pushAscii('trailer\n');
  pushAscii('<< /Size 7 /Root 1 0 R >>\n');
  pushAscii('startxref\n');
  pushAscii(`${xrefStart}\n`);
  pushAscii('%%EOF');

  return new Blob(chunks, { type: 'application/pdf' });
}

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

    const printDate = format(new Date(), 'yyyy-MM-dd HH:mm');
    const pdfBlob = createSchedulePdfBlob(scheduleCanvas, printDate);
    const downloadUrl = URL.createObjectURL(pdfBlob);

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `schedule-${format(currentMonth, 'yyyy-MM')}.pdf`;
    link.click();

    setTimeout(() => {
      URL.revokeObjectURL(downloadUrl);
    }, 1000);
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
