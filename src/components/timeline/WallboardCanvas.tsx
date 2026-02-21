'use client';

// WallboardCanvas — Canvas-based timeline renderer for the operator wallboard
// Ported from VBA: InfoTabla20180201 PowerPoint shape rendering
// Renders: row backgrounds, calendar grid, shift band, batch bars, now-line

import { useRef, useEffect, useState, useCallback } from 'react';
import { usePlantPulseStore } from '@/lib/store';
import { getWallboardBorderColor, SHIFT_TEAM_COLORS } from '@/lib/colors';
import { stageBarPosition, nowLineX, pixelsPerDay as getPPD } from '@/lib/timeline-math';
import { isHoliday, isWeekend, isSaturday, isSunday } from '@/lib/holidays';
import { shiftBands } from '@/lib/shift-rotation';
import {
  addDays,
  startOfDay,
  format,
  getDate,
  getMonth,
} from 'date-fns';
import type { Machine, Stage, MachineDisplayGroup } from '@/lib/types';

// ─── Layout constants ───────────────────────────────────────────────────

const LEFT_MARGIN = 72;
const SHIFT_BAND_H = 10;
const DATE_HEADER_H = 32;
const TOP_MARGIN = SHIFT_BAND_H + DATE_HEADER_H + 4;
const ROW_HEIGHT = 26;
const BAR_HEIGHT = 16;
const BAR_Y_PAD = (ROW_HEIGHT - BAR_HEIGHT) / 2;
const SEPARATOR_HEIGHT = 12;
const BORDER_WIDTH = 3;

// ─── Color themes ───────────────────────────────────────────────────────

interface CanvasTheme {
  background: string;
  rowEven: string;
  rowOdd: string;
  weekend: string;
  holiday: string;
  today: string;
  grid: string;
  now: string;
  barFill: string;
  barFuture: string;
  labelBg: string;
  labelBorder: string;
  labelText: string;
  machineText: string;
  dateText: string;
  dateWeekend: string;
  separator: string;
  headerBg: string;
  barBorder: string;
  barHourText: string;
}

const DAY_THEME: CanvasTheme = {
  background: '#FFFFFF',
  rowEven: '#EBF4FB',
  rowOdd: '#FFFFFF',
  weekend: 'rgba(255, 220, 220, 0.25)',
  holiday: 'rgba(255, 180, 180, 0.30)',
  today: 'rgba(255, 255, 200, 0.20)',
  grid: 'rgba(185, 200, 215, 0.50)',
  now: 'rgba(160, 0, 0, 0.65)',
  barFill: '#E2E2E2',
  barFuture: '#EFEFEF',
  labelBg: '#EAEAEA',
  labelBorder: '#D0D0D0',
  labelText: '#0088BB',
  machineText: '#1a365d',
  dateText: '#334155',
  dateWeekend: '#DC2626',
  separator: '#F1F5F9',
  headerBg: '#FFFFFF',
  barBorder: 'rgba(0,0,0,0.12)',
  barHourText: '#000000',
};

const NIGHT_THEME: CanvasTheme = {
  background: '#0c1021',
  rowEven: '#111827',
  rowOdd: '#0c1021',
  weekend: 'rgba(120, 40, 40, 0.25)',
  holiday: 'rgba(140, 50, 50, 0.30)',
  today: 'rgba(80, 80, 30, 0.20)',
  grid: 'rgba(60, 75, 95, 0.50)',
  now: 'rgba(255, 60, 60, 0.80)',
  barFill: '#2a3040',
  barFuture: '#1e2535',
  labelBg: '#1e2535',
  labelBorder: '#3a4a60',
  labelText: '#4cc9f0',
  machineText: '#c8d6e5',
  dateText: '#94a3b8',
  dateWeekend: '#f87171',
  separator: '#151d2e',
  headerBg: '#0c1021',
  barBorder: 'rgba(255,255,255,0.10)',
  barHourText: '#d1d5db',
};

// ─── Row layout ─────────────────────────────────────────────────────────

interface RowInfo {
  machineId: string;
  machineName: string;
  y: number;
  type: 'machine' | 'separator';
  rowIndex: number;
}

function buildRowLayout(
  machines: Machine[],
  groups: MachineDisplayGroup[]
): RowInfo[] {
  const rows: RowInfo[] = [];
  let y = TOP_MARGIN;
  let rowIndex = 0;

  for (let g = 0; g < groups.length; g++) {
    if (g > 0) {
      rows.push({
        machineId: '',
        machineName: '',
        y,
        type: 'separator',
        rowIndex: rowIndex++,
      });
      y += SEPARATOR_HEIGHT;
    }
    for (const mId of groups[g].machineIds) {
      const m = machines.find((mx) => mx.id === mId);
      if (m) {
        rows.push({
          machineId: m.id,
          machineName: m.name,
          y,
          type: 'machine',
          rowIndex: rowIndex++,
        });
        y += ROW_HEIGHT;
      }
    }
  }

  return rows;
}

// ─── Drawing functions ──────────────────────────────────────────────────

function drawRowBackgrounds(
  ctx: CanvasRenderingContext2D,
  rows: RowInfo[],
  width: number,
  theme: CanvasTheme
) {
  let machineIdx = 0;
  for (const row of rows) {
    if (row.type === 'separator') {
      ctx.fillStyle = theme.separator;
      ctx.fillRect(0, row.y, width, SEPARATOR_HEIGHT);
    } else {
      ctx.fillStyle = machineIdx % 2 === 0 ? theme.rowEven : theme.rowOdd;
      ctx.fillRect(0, row.y, width, ROW_HEIGHT);
      machineIdx++;
    }
  }
}

function drawCalendarColumns(
  ctx: CanvasRenderingContext2D,
  viewStart: Date,
  numDays: number,
  width: number,
  totalHeight: number,
  todayHighlight: boolean = true,
  theme: CanvasTheme = DAY_THEME
) {
  const ppd = getPPD(width, LEFT_MARGIN, numDays);
  const today = startOfDay(new Date());

  for (let d = 0; d < numDays; d++) {
    const date = addDays(viewStart, d);
    const x = LEFT_MARGIN + d * ppd;

    // Weekend / holiday tint
    if (isHoliday(date) || isSunday(date)) {
      ctx.fillStyle = theme.holiday;
      ctx.fillRect(x, TOP_MARGIN, ppd, totalHeight - TOP_MARGIN);
    } else if (isSaturday(date)) {
      ctx.fillStyle = theme.weekend;
      ctx.fillRect(x, TOP_MARGIN, ppd, totalHeight - TOP_MARGIN);
    }

    // Today highlight
    if (todayHighlight && date.getTime() === today.getTime()) {
      ctx.fillStyle = theme.today;
      ctx.fillRect(x, TOP_MARGIN, ppd, totalHeight - TOP_MARGIN);
    }

    // Vertical grid line
    ctx.beginPath();
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 0.5;
    ctx.moveTo(x, TOP_MARGIN);
    ctx.lineTo(x, totalHeight);
    ctx.stroke();
  }
}

function drawShiftBand(
  ctx: CanvasRenderingContext2D,
  viewStart: Date,
  numDays: number,
  width: number,
  theme: CanvasTheme
) {
  const bands = shiftBands(viewStart, numDays);
  const ppd = getPPD(width, LEFT_MARGIN, numDays);
  const pph = ppd / 24;

  ctx.fillStyle = theme.headerBg;
  ctx.fillRect(0, 0, width, SHIFT_BAND_H);

  for (const band of bands) {
    const hoursOffset = (band.start.getTime() - viewStart.getTime()) / 3600000;
    const x = LEFT_MARGIN + hoursOffset * pph;
    const w = 12 * pph;

    if (x + w < LEFT_MARGIN || x > width) continue;

    const clampedX = Math.max(x, LEFT_MARGIN);
    const clampedW = Math.min(x + w, width) - clampedX;

    ctx.fillStyle = SHIFT_TEAM_COLORS[band.teamIndex];
    ctx.globalAlpha = 0.7;
    ctx.fillRect(clampedX, 1, clampedW, SHIFT_BAND_H - 2);
    ctx.globalAlpha = 1.0;
  }
}

function drawDateHeader(
  ctx: CanvasRenderingContext2D,
  viewStart: Date,
  numDays: number,
  width: number,
  theme: CanvasTheme
) {
  const ppd = getPPD(width, LEFT_MARGIN, numDays);

  // Header background
  ctx.fillStyle = theme.headerBg;
  ctx.fillRect(0, SHIFT_BAND_H, width, DATE_HEADER_H);

  // Bottom border
  ctx.beginPath();
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.moveTo(0, TOP_MARGIN - 1);
  ctx.lineTo(width, TOP_MARGIN - 1);
  ctx.stroke();

  let lastMonth = -1;

  for (let d = 0; d < numDays; d++) {
    const date = addDays(viewStart, d);
    const x = LEFT_MARGIN + d * ppd;
    const dayNum = getDate(date);
    const month = getMonth(date);

    // Month label when month changes
    if (month !== lastMonth) {
      ctx.fillStyle = theme.machineText;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(format(date, 'MMMM'), x + 2, SHIFT_BAND_H + 2);
      lastMonth = month;
    }

    // Day number
    const isWE = isWeekend(date);
    const isHol = isHoliday(date);

    ctx.font = isHol ? 'bold 11px sans-serif' : '11px sans-serif';
    ctx.fillStyle = isWE || isHol ? theme.dateWeekend : theme.dateText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(dayNum), x + ppd / 2, TOP_MARGIN - 3);

    // Vertical grid line in header
    ctx.beginPath();
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 0.5;
    ctx.moveTo(x, SHIFT_BAND_H + 16);
    ctx.lineTo(x, TOP_MARGIN);
    ctx.stroke();
  }
}

function drawMachineLabels(
  ctx: CanvasRenderingContext2D,
  rows: RowInfo[],
  theme: CanvasTheme
) {
  // Left column background
  ctx.fillStyle = theme.headerBg;
  ctx.fillRect(0, TOP_MARGIN, LEFT_MARGIN, rows.length * ROW_HEIGHT + 200);

  // Border
  ctx.beginPath();
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.moveTo(LEFT_MARGIN, 0);
  ctx.lineTo(LEFT_MARGIN, rows.length * ROW_HEIGHT + TOP_MARGIN + 200);
  ctx.stroke();

  for (const row of rows) {
    if (row.type !== 'machine') continue;

    const isFermenter = row.machineName.startsWith('F-');
    ctx.font = isFermenter ? 'bold 11px sans-serif' : '11px sans-serif';
    ctx.fillStyle = theme.machineText;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(row.machineName, LEFT_MARGIN - 8, row.y + ROW_HEIGHT / 2);
  }
}

function drawBatchBars(
  ctx: CanvasRenderingContext2D,
  stages: Stage[],
  batchChainMap: Map<string, number>,
  rows: RowInfo[],
  viewStart: Date,
  numDays: number,
  width: number,
  theme: CanvasTheme
) {
  const now = new Date();
  const machineRowMap = new Map<string, RowInfo>();
  for (const r of rows) {
    if (r.type === 'machine') machineRowMap.set(r.machineId, r);
  }

  for (const stage of stages) {
    const row = machineRowMap.get(stage.machineId);
    if (!row) continue;

    const pos = stageBarPosition(
      viewStart,
      stage.startDatetime,
      stage.endDatetime,
      width,
      LEFT_MARGIN,
      numDays
    );

    if (pos.offScreen) continue;

    const seriesNum = batchChainMap.get(stage.batchChainId) ?? 0;
    const isFuture = stage.startDatetime > now;
    const barY = row.y + BAR_Y_PAD;

    // Bar fill
    ctx.fillStyle = isFuture ? theme.barFuture : theme.barFill;
    ctx.fillRect(pos.left, barY, pos.width, BAR_HEIGHT);

    // Colored bottom border — wallboard style
    const borderColor = getWallboardBorderColor(seriesNum);
    ctx.fillStyle = borderColor;
    ctx.fillRect(pos.left, barY + BAR_HEIGHT - BORDER_WIDTH, pos.width, BORDER_WIDTH);

    // Thin top/right/left borders
    ctx.strokeStyle = theme.barBorder;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(pos.left, barY, pos.width, BAR_HEIGHT);

    // Start hour label at left edge
    if (pos.width > 25) {
      const startHour = String(stage.startDatetime.getHours());
      ctx.font = '8px sans-serif';
      ctx.fillStyle = theme.barHourText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(startHour, pos.left + 2, barY + BAR_HEIGHT / 2);
    }

    // End hour label at right edge (fermenter stages only)
    if (stage.stageType === 'fermentation' && pos.width > 40) {
      const endHour = String(stage.endDatetime.getHours());
      ctx.font = '8px sans-serif';
      ctx.fillStyle = theme.barHourText;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(endHour, pos.left + pos.width - 2, barY + BAR_HEIGHT / 2);
    }

    // Series number label — centered in bar
    if (pos.width > 20) {
      const label = String(seriesNum);
      ctx.font = '9px sans-serif';
      const textW = ctx.measureText(label).width;
      const labelW = textW + 8;
      const labelH = 13;
      const labelX = pos.left + (pos.width - labelW) / 2;
      const labelY = barY + (BAR_HEIGHT - labelH) / 2;

      // Label background
      ctx.fillStyle = theme.labelBg;
      ctx.beginPath();
      roundRect(ctx, labelX, labelY, labelW, labelH, 2);
      ctx.fill();
      ctx.strokeStyle = theme.labelBorder;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      roundRect(ctx, labelX, labelY, labelW, labelH, 2);
      ctx.stroke();

      // Label text
      ctx.fillStyle = theme.labelText;
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, labelX + labelW / 2, labelY + labelH / 2);
    }
  }
}

function drawNowLine(
  ctx: CanvasRenderingContext2D,
  viewStart: Date,
  numDays: number,
  width: number,
  totalHeight: number,
  theme: CanvasTheme
) {
  const x = nowLineX(viewStart, new Date(), width, LEFT_MARGIN, numDays);
  if (x < LEFT_MARGIN || x > width) return;

  ctx.beginPath();
  ctx.strokeStyle = theme.now;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.moveTo(x, TOP_MARGIN);
  ctx.lineTo(x, totalHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // Small triangle at top
  ctx.fillStyle = theme.now;
  ctx.beginPath();
  ctx.moveTo(x - 4, TOP_MARGIN);
  ctx.lineTo(x + 4, TOP_MARGIN);
  ctx.lineTo(x, TOP_MARGIN + 6);
  ctx.closePath();
  ctx.fill();
}

/** Helper: draw a rounded rectangle path */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
}

// ─── Component ──────────────────────────────────────────────────────────

interface WallboardCanvasProps {
  filteredGroupIds?: string[];
  customMachineGroups?: MachineDisplayGroup[];
  showTodayHighlight?: boolean;
  showNowLine?: boolean;
  showShiftBand?: boolean;
  canvasId?: string;
  nightMode?: boolean;
}

export default function WallboardCanvas({
  filteredGroupIds,
  customMachineGroups,
  showTodayHighlight = true,
  showNowLine: showNowLineProp = true,
  showShiftBand: showShiftBandProp = true,
  canvasId,
  nightMode = false,
}: WallboardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });

  const machines = usePlantPulseStore((s) => s.machines);
  const machineGroups = usePlantPulseStore((s) => s.machineGroups);
  const stages = usePlantPulseStore((s) => s.stages);
  const batchChains = usePlantPulseStore((s) => s.batchChains);
  const viewConfig = usePlantPulseStore((s) => s.viewConfig);
  const loadDemoData = usePlantPulseStore((s) => s.loadDemoData);

  // Load demo data on mount
  useEffect(() => {
    loadDemoData();
  }, [loadDemoData]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDims({ width: Math.floor(width), height: Math.floor(height) });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Build layout data
  const baseGroups = customMachineGroups ?? machineGroups;
  const groups = filteredGroupIds
    ? baseGroups.filter((g) => filteredGroupIds.includes(g.id))
    : baseGroups;
  const rows = buildRowLayout(machines, groups);

  // Build batch chain series number map
  const batchChainMap = new Map<string, number>();
  for (const chain of batchChains) {
    batchChainMap.set(chain.id, chain.seriesNumber);
  }

  // Filter stages to visible machines
  const visibleMachineIds = new Set(
    rows.filter((r) => r.type === 'machine').map((r) => r.machineId)
  );
  const visibleStages = stages.filter((s) => visibleMachineIds.has(s.machineId));

  // Calculate total canvas height
  const lastRow = rows[rows.length - 1];
  const totalHeight = lastRow
    ? lastRow.y + (lastRow.type === 'separator' ? SEPARATOR_HEIGHT : ROW_HEIGHT) + 4
    : TOP_MARGIN + 100;

  // Select color theme
  const theme = nightMode ? NIGHT_THEME : DAY_THEME;

  // Main draw callback
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || dims.width === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const canvasHeight = Math.max(totalHeight, dims.height);

    canvas.width = dims.width * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${dims.width}px`;
    canvas.style.height = `${canvasHeight}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, dims.width, canvasHeight);

    // Background
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, dims.width, canvasHeight);

    // Draw layers (back to front)
    drawRowBackgrounds(ctx, rows, dims.width, theme);
    drawCalendarColumns(ctx, viewConfig.viewStart, viewConfig.numberOfDays, dims.width, canvasHeight, showTodayHighlight, theme);
    drawBatchBars(ctx, visibleStages, batchChainMap, rows, viewConfig.viewStart, viewConfig.numberOfDays, dims.width, theme);
    if (showNowLineProp) {
      drawNowLine(ctx, viewConfig.viewStart, viewConfig.numberOfDays, dims.width, canvasHeight, theme);
    }
    drawMachineLabels(ctx, rows, theme);
    if (showShiftBandProp) {
      drawShiftBand(ctx, viewConfig.viewStart, viewConfig.numberOfDays, dims.width, theme);
    }
    drawDateHeader(ctx, viewConfig.viewStart, viewConfig.numberOfDays, dims.width, theme);
  }, [dims, rows, visibleStages, batchChainMap, viewConfig, totalHeight, showTodayHighlight, showNowLineProp, showShiftBandProp, theme]);

  // Redraw on any change
  useEffect(() => {
    draw();
  }, [draw]);

  // Auto-refresh now-line every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      draw();
    }, 60000);
    return () => clearInterval(interval);
  }, [draw]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'auto' }}
    >
      <canvas ref={canvasRef} id={canvasId} />
    </div>
  );
}
