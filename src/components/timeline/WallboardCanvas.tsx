'use client';

// WallboardCanvas — Canvas-based timeline renderer for the operator wallboard
// Ported from VBA: InfoTabla20180201 PowerPoint shape rendering
// Renders: row backgrounds, calendar grid, shift band, batch bars, now-line

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { usePlantPulseStore } from '@/lib/store';
import { getWallboardBorderColor, SHIFT_GAP_COLOR, SHIFT_TEAM_COLORS } from '@/lib/colors';
import { stageBarPosition, nowLineX, pixelsPerDay as getPPD } from '@/lib/timeline-math';
import { isHoliday, isWeekend, isSaturday, isSunday } from '@/lib/holidays';
import { isShiftCoveredAt, shiftBands } from '@/lib/shift-rotation';
import type { ShiftCoverageConfig } from '@/lib/shift-rotation';
import {
  addDays,
  addHours,
  startOfDay,
  format,
  getDate,
  getMonth,
  differenceInHours,
} from 'date-fns';
import type { Machine, Stage, MachineDisplayGroup, ShutdownPeriod, BatchChain, BatchNamingConfig, DowntimeWindow } from '@/lib/types';
import { batchNamePreview, collectDowntimeWindows } from '@/lib/types';

// ─── Batch naming helper ────────────────────────────────────────────────

/** Generate the display label for a batch chain using the naming config. */
function buildBatchLabel(chain: BatchChain, config: BatchNamingConfig): string {
  const rule =
    config.mode === 'per_product_line' && chain.productLine
      ? config.productLineRules[chain.productLine] ?? config.sharedRule
      : config.sharedRule;
  return batchNamePreview(rule, chain.seriesNumber);
}

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
  shutdown: string;
  barBorder: string;
  barHourText: string;
  downtime: string;
  downtimeHatch: string;
  downtimeNonBlocking: string;
  downtimeHatchNonBlocking: string;
  notifyShiftArrow: string;
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
  shutdown: 'rgba(120, 120, 140, 0.18)',
  headerBg: '#FFFFFF',
  barBorder: 'rgba(0,0,0,0.12)',
  barHourText: '#000000',
  downtime: 'rgba(234, 179, 8, 0.12)',
  downtimeHatch: 'rgba(234, 179, 8, 0.25)',
  downtimeNonBlocking: 'rgba(234, 179, 8, 0.06)',
  downtimeHatchNonBlocking: 'rgba(234, 179, 8, 0.12)',
  notifyShiftArrow: '#D946EF',
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
  shutdown: 'rgba(100, 100, 130, 0.25)',
  headerBg: '#0c1021',
  barBorder: 'rgba(255,255,255,0.10)',
  barHourText: '#d1d5db',
  downtime: 'rgba(234, 179, 8, 0.15)',
  downtimeHatch: 'rgba(234, 179, 8, 0.30)',
  downtimeNonBlocking: 'rgba(234, 179, 8, 0.08)',
  downtimeHatchNonBlocking: 'rgba(234, 179, 8, 0.15)',
  notifyShiftArrow: '#E879F9',
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
  theme: CanvasTheme = DAY_THEME,
  shutdowns: ShutdownPeriod[] = []
) {
  const ppd = getPPD(width, LEFT_MARGIN, numDays);
  const today = startOfDay(new Date());

  // Pre-compute shutdown day set for O(1) lookup per day column
  const shutdownDays = new Set<number>();
  for (const sd of shutdowns) {
    const sdStart = startOfDay(sd.startDate).getTime();
    const sdEnd = startOfDay(sd.endDate).getTime();
    for (let t = sdStart; t <= sdEnd; t += 86400000) {
      shutdownDays.add(t);
    }
  }

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

    // Shutdown overlay — grey shade over affected days
    if (shutdownDays.has(startOfDay(date).getTime())) {
      ctx.fillStyle = theme.shutdown;
      ctx.fillRect(x, TOP_MARGIN, ppd, totalHeight - TOP_MARGIN);

      // Diagonal hatch pattern to distinguish from weekends
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, TOP_MARGIN, ppd, totalHeight - TOP_MARGIN);
      ctx.clip();
      ctx.strokeStyle = theme.shutdown;
      ctx.lineWidth = 0.5;
      const step = 8;
      for (let i = -totalHeight; i < ppd + totalHeight; i += step) {
        ctx.beginPath();
        ctx.moveTo(x + i, TOP_MARGIN);
        ctx.lineTo(x + i + totalHeight, TOP_MARGIN + totalHeight);
        ctx.stroke();
      }
      ctx.restore();
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

function drawDowntimeBlocks(
  ctx: CanvasRenderingContext2D,
  windows: DowntimeWindow[],
  rows: RowInfo[],
  viewStart: Date,
  numDays: number,
  width: number,
  theme: CanvasTheme
) {
  if (windows.length === 0) return;

  const machineRowMap = new Map<string, RowInfo>();
  for (const r of rows) {
    if (r.type === 'machine') machineRowMap.set(r.machineId, r);
  }

  for (const win of windows) {
    const row = machineRowMap.get(win.machineId);
    if (!row) continue;

    const pos = stageBarPosition(viewStart, win.start, win.end, width, LEFT_MARGIN, numDays);
    if (pos.offScreen) continue;

    const y = row.y;
    const h = ROW_HEIGHT;
    const isBlocking = win.blocksPlanning;

    // Semi-transparent amber fill (full row height, behind batch bars)
    // Non-blocking downtime uses halved opacity for visual distinction
    ctx.fillStyle = isBlocking ? theme.downtime : theme.downtimeNonBlocking;
    ctx.fillRect(pos.left, y, pos.width, h);

    // Diagonal hatch pattern (135°, 6px step) — distinct from shutdown hatch (45°, 8px)
    // Non-blocking downtime uses dashed lines + reduced opacity
    ctx.save();
    ctx.beginPath();
    ctx.rect(pos.left, y, pos.width, h);
    ctx.clip();
    ctx.strokeStyle = isBlocking ? theme.downtimeHatch : theme.downtimeHatchNonBlocking;
    ctx.lineWidth = 0.5;
    if (!isBlocking) {
      ctx.setLineDash([3, 3]);
    }
    const step = 6;
    for (let i = -h; i < pos.width + h; i += step) {
      ctx.beginPath();
      ctx.moveTo(pos.left + i + h, y);
      ctx.lineTo(pos.left + i, y + h);
      ctx.stroke();
    }
    if (!isBlocking) {
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}

function drawNotifyShiftArrows(
  ctx: CanvasRenderingContext2D,
  windows: DowntimeWindow[],
  rows: RowInfo[],
  viewStart: Date,
  numDays: number,
  width: number,
  theme: CanvasTheme
) {
  const notifyWindows = windows.filter(w => w.notifyShift);
  if (notifyWindows.length === 0) return;

  const machineRowMap = new Map<string, RowInfo>();
  for (const r of rows) {
    if (r.type === 'machine') machineRowMap.set(r.machineId, r);
  }

  const ARROW_W = 10;
  const ARROW_H = 12;

  for (const win of notifyWindows) {
    const row = machineRowMap.get(win.machineId);
    if (!row) continue;

    const pos = stageBarPosition(viewStart, win.start, win.end, width, LEFT_MARGIN, numDays);
    if (pos.offScreen) continue;

    const arrowX = pos.left;
    if (arrowX < LEFT_MARGIN) continue;

    const arrowY = row.y;

    // Downward-pointing triangle
    ctx.fillStyle = theme.notifyShiftArrow;
    ctx.beginPath();
    ctx.moveTo(arrowX - ARROW_W / 2, arrowY);
    ctx.lineTo(arrowX + ARROW_W / 2, arrowY);
    ctx.lineTo(arrowX, arrowY + ARROW_H);
    ctx.closePath();
    ctx.fill();

    // Subtle stroke for definition
    ctx.strokeStyle = theme.notifyShiftArrow;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawShiftBand(
  ctx: CanvasRenderingContext2D,
  viewStart: Date,
  numDays: number,
  width: number,
  theme: CanvasTheme,
  anchorDate?: Date,
  cyclePattern?: readonly number[],
  teamColors?: string[],
  shiftLengthHours: number = 12,
  shiftRotation?: ShiftCoverageConfig
) {
  const bands = shiftBands(viewStart, numDays, anchorDate, cyclePattern, shiftLengthHours, shiftRotation?.activeDays, shiftRotation?.operatingHoursStart, shiftRotation?.operatingHoursEnd);
  const ppd = getPPD(width, LEFT_MARGIN, numDays);
  const pph = ppd / 24;

  ctx.fillStyle = theme.headerBg;
  ctx.fillRect(0, 0, width, SHIFT_BAND_H);

  for (const band of bands) {
    const hoursOffset = (band.start.getTime() - viewStart.getTime()) / 3600000;
    const durationHours = (band.end.getTime() - band.start.getTime()) / 3600000;
    const x = LEFT_MARGIN + hoursOffset * pph;
    const w = durationHours * pph;

    if (x + w < LEFT_MARGIN || x > width) continue;

    const clampedX = Math.max(x, LEFT_MARGIN);
    const clampedW = Math.min(x + w, width) - clampedX;

    const covered = shiftRotation
      ? isShiftCoveredAt(band.start, shiftRotation)
      : true;
    ctx.fillStyle = covered
      ? (teamColors && teamColors[band.teamIndex]) || SHIFT_TEAM_COLORS[band.teamIndex] || '#888'
      : SHIFT_GAP_COLOR;
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
  batchSeriesMap: Map<string, number>,
  batchLabelMap: Map<string, string>,
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

    const seriesNum = batchSeriesMap.get(stage.batchChainId) ?? 0;
    const label = batchLabelMap.get(stage.batchChainId) ?? String(seriesNum);
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

    // End hour label at right edge (production/fermenter stages only)
    if (stage.stageType === 'production' && pos.width > 40) {
      const endHour = String(stage.endDatetime.getHours());
      ctx.font = '8px sans-serif';
      ctx.fillStyle = theme.barHourText;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(endHour, pos.left + pos.width - 2, barY + BAR_HEIGHT / 2);
    }

    // Batch name label — centered in bar
    if (pos.width > 20) {
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
  /** Called when a batch bar is clicked — passes the stage ID. Planner uses this to open StageDetailPanel. */
  onStageClick?: (stageId: string) => void;
  /** Called when a machine label in the left column is clicked — Planner uses this to open Equipment Setup. */
  onMachineLabelClick?: (machineId: string) => void;
  /** Called when the shift band at the top is clicked — Planner uses this to open Shift Schedule modal. */
  onShiftBandClick?: () => void;
  /** When true, draws machine downtime blocks on the timeline (Planner only). */
  showDowntime?: boolean;
  /** Called when a downtime block is clicked — Planner uses this to open Equipment Setup unavailability. */
  onDowntimeClick?: (machineId: string, ruleId?: string) => void;
  /** Enable drag-to-move and stretch-to-resize for stage bars (Planner only). */
  enableDragResize?: boolean;
  /** Called when a stage bar is dragged or resized to a new time window. */
  onStageDragEnd?: (stageId: string, newStart: Date, newEnd: Date) => void;
}

export default function WallboardCanvas({
  filteredGroupIds,
  customMachineGroups,
  showTodayHighlight = true,
  showNowLine: showNowLineProp = true,
  showShiftBand: showShiftBandProp = true,
  canvasId,
  nightMode = false,
  onStageClick,
  onMachineLabelClick,
  onShiftBandClick,
  showDowntime = false,
  onDowntimeClick,
  enableDragResize = false,
  onStageDragEnd,
}: WallboardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });

  const machines = usePlantPulseStore((s) => s.machines);
  const machineGroups = usePlantPulseStore((s) => s.machineGroups);
  const stages = usePlantPulseStore((s) => s.stages);
  const batchChains = usePlantPulseStore((s) => s.batchChains);
  const viewConfig = usePlantPulseStore((s) => s.viewConfig);
  const shutdownPeriods = usePlantPulseStore((s) => s.shutdownPeriods);
  const batchNamingConfig = usePlantPulseStore((s) => s.batchNamingConfig);
  const shiftRotation = usePlantPulseStore((s) => s.shiftRotation);
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

  // Build batch chain maps: series number (for color) and display label (from naming config)
  const batchSeriesMap = new Map<string, number>();
  const batchLabelMap = new Map<string, string>();
  for (const chain of batchChains) {
    batchSeriesMap.set(chain.id, chain.seriesNumber);
    batchLabelMap.set(chain.id, buildBatchLabel(chain, batchNamingConfig));
  }

  // Filter stages to visible machines
  const visibleMachineIds = new Set(
    rows.filter((r) => r.type === 'machine').map((r) => r.machineId)
  );
  const visibleStages = stages.filter((s) => visibleMachineIds.has(s.machineId));

  // Precompute downtime windows for visible machines
  const downtimeWindows = useMemo(() => {
    if (!showDowntime) return [];
    const rangeStart = viewConfig.viewStart;
    const rangeEnd = addDays(viewConfig.viewStart, viewConfig.numberOfDays);
    const wins: DowntimeWindow[] = [];
    for (const m of machines) {
      if (!visibleMachineIds.has(m.id)) continue;
      const mWins = collectDowntimeWindows(m, rangeStart, rangeEnd);
      for (const w of mWins) wins.push(w);
    }
    return wins;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDowntime, machines, viewConfig.viewStart, viewConfig.numberOfDays, visibleMachineIds]);

  // Notify-shift windows — always computed (operators need these on Wallboard)
  const notifyShiftWindows = useMemo(() => {
    if (showDowntime) {
      // Full downtime already computed — just filter
      return downtimeWindows.filter(w => w.notifyShift);
    }
    const rangeStart = viewConfig.viewStart;
    const rangeEnd = addDays(viewConfig.viewStart, viewConfig.numberOfDays);
    const wins: DowntimeWindow[] = [];
    for (const m of machines) {
      if (!visibleMachineIds.has(m.id)) continue;
      for (const w of collectDowntimeWindows(m, rangeStart, rangeEnd)) {
        if (w.notifyShift) wins.push(w);
      }
    }
    return wins;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDowntime, downtimeWindows, machines, viewConfig.viewStart, viewConfig.numberOfDays, visibleMachineIds]);

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
    drawCalendarColumns(ctx, viewConfig.viewStart, viewConfig.numberOfDays, dims.width, canvasHeight, showTodayHighlight, theme, shutdownPeriods);
    if (showDowntime && downtimeWindows.length > 0) {
      drawDowntimeBlocks(ctx, downtimeWindows, rows, viewConfig.viewStart, viewConfig.numberOfDays, dims.width, theme);
    }
    drawBatchBars(ctx, visibleStages, batchSeriesMap, batchLabelMap, rows, viewConfig.viewStart, viewConfig.numberOfDays, dims.width, theme);
    if (notifyShiftWindows.length > 0) {
      drawNotifyShiftArrows(ctx, notifyShiftWindows, rows, viewConfig.viewStart, viewConfig.numberOfDays, dims.width, theme);
    }
    if (showNowLineProp) {
      drawNowLine(ctx, viewConfig.viewStart, viewConfig.numberOfDays, dims.width, canvasHeight, theme);
    }
    drawMachineLabels(ctx, rows, theme);
    if (showShiftBandProp) {
      drawShiftBand(ctx, viewConfig.viewStart, viewConfig.numberOfDays, dims.width, theme, shiftRotation.anchorDate, shiftRotation.cyclePattern, shiftRotation.teams.map((t) => t.color), shiftRotation.shiftLengthHours, shiftRotation);
    }
    drawDateHeader(ctx, viewConfig.viewStart, viewConfig.numberOfDays, dims.width, theme);
  }, [dims, rows, visibleStages, batchSeriesMap, batchLabelMap, viewConfig, totalHeight, showTodayHighlight, showNowLineProp, showShiftBandProp, theme, shutdownPeriods, shiftRotation, showDowntime, downtimeWindows, notifyShiftWindows]);

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

  // ── Hit-testing: find which stage bar is at a given CSS pixel coordinate ──

  const machineRowMap = new Map<string, RowInfo>();
  for (const r of rows) {
    if (r.type === 'machine') machineRowMap.set(r.machineId, r);
  }

  const hitTestStage = useCallback(
    (cssX: number, cssY: number): string | null => {
      for (const stage of visibleStages) {
        const row = machineRowMap.get(stage.machineId);
        if (!row) continue;

        const pos = stageBarPosition(
          viewConfig.viewStart,
          stage.startDatetime,
          stage.endDatetime,
          dims.width,
          LEFT_MARGIN,
          viewConfig.numberOfDays
        );
        if (pos.offScreen) continue;

        const barY = row.y + BAR_Y_PAD;
        if (
          cssX >= pos.left &&
          cssX <= pos.left + pos.width &&
          cssY >= barY &&
          cssY <= barY + BAR_HEIGHT
        ) {
          return stage.id;
        }
      }
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleStages, viewConfig, dims.width, rows]
  );

  const hitTestMachineLabel = useCallback(
    (cssX: number, cssY: number): string | null => {
      if (cssX >= LEFT_MARGIN) return null;
      for (const row of rows) {
        if (row.type === 'separator') continue;
        if (cssY >= row.y && cssY < row.y + ROW_HEIGHT) {
          return row.machineId;
        }
      }
      return null;
    },
    [rows]
  );

  const hitTestDowntime = useCallback(
    (cssX: number, cssY: number): DowntimeWindow | null => {
      if (cssX < LEFT_MARGIN) return null;
      // When showDowntime is on, hit-test full downtime blocks; otherwise only notify-shift arrows
      const windowsToTest = showDowntime ? downtimeWindows : notifyShiftWindows;
      if (windowsToTest.length === 0) return null;
      for (const win of windowsToTest) {
        const row = machineRowMap.get(win.machineId);
        if (!row) continue;
        const pos = stageBarPosition(
          viewConfig.viewStart,
          win.start,
          win.end,
          dims.width,
          LEFT_MARGIN,
          viewConfig.numberOfDays
        );
        if (pos.offScreen) continue;
        if (showDowntime) {
          // Full downtime block hit region
          if (
            cssX >= pos.left &&
            cssX <= pos.left + pos.width &&
            cssY >= row.y &&
            cssY <= row.y + ROW_HEIGHT
          ) {
            return win;
          }
        } else {
          // Tight hit region around the arrow indicator (±8px horizontal, 14px vertical)
          if (
            cssX >= pos.left - 8 &&
            cssX <= pos.left + 8 &&
            cssY >= row.y &&
            cssY <= row.y + 14
          ) {
            return win;
          }
        }
      }
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showDowntime, downtimeWindows, notifyShiftWindows, viewConfig, dims.width, rows]
  );

  // ── Drag/resize state (Planner only) ────────────────────────────────
  // Edge detection: if click is within EDGE_PX of left/right edge of bar → resize
  const EDGE_PX = 6;
  const DRAG_THRESHOLD_PX = 3;

  type DragType = 'move' | 'resize-start' | 'resize-end';
  const dragRef = useRef<{
    type: DragType;
    stageId: string;
    originalStart: Date;
    originalEnd: Date;
    startMouseX: number;
    pixelsPerHour: number;
    committed: boolean; // past drag threshold?
  } | null>(null);

  const [dragGhost, setDragGhost] = useState<{
    left: number; top: number; width: number; height: number;
  } | null>(null);

  const hitTestStageEdge = useCallback(
    (cssX: number, cssY: number): { stageId: string; type: DragType } | null => {
      if (!enableDragResize) return null;
      for (const stage of visibleStages) {
        const row = machineRowMap.get(stage.machineId);
        if (!row) continue;
        const pos = stageBarPosition(
          viewConfig.viewStart, stage.startDatetime, stage.endDatetime,
          dims.width, LEFT_MARGIN, viewConfig.numberOfDays
        );
        if (pos.offScreen) continue;
        const barY = row.y + BAR_Y_PAD;
        if (cssY < barY || cssY > barY + BAR_HEIGHT) continue;
        if (cssX < pos.left || cssX > pos.left + pos.width) continue;

        // Determine if near edge
        if (cssX <= pos.left + EDGE_PX) return { stageId: stage.id, type: 'resize-start' };
        if (cssX >= pos.left + pos.width - EDGE_PX) return { stageId: stage.id, type: 'resize-end' };
        return { stageId: stage.id, type: 'move' };
      }
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enableDragResize, visibleStages, viewConfig, dims.width, rows]
  );

  const handleCanvasMouseDown = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!enableDragResize || !onStageDragEnd) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cssX = event.clientX - rect.left;
      const cssY = event.clientY - rect.top;

      const hit = hitTestStageEdge(cssX, cssY);
      if (!hit) return;

      const stage = visibleStages.find((s) => s.id === hit.stageId);
      if (!stage) return;

      const ppd = getPPD(dims.width, LEFT_MARGIN, viewConfig.numberOfDays);
      const pixelsPerHour = ppd / 24;

      dragRef.current = {
        type: hit.type,
        stageId: hit.stageId,
        originalStart: stage.startDatetime,
        originalEnd: stage.endDatetime,
        startMouseX: event.clientX,
        pixelsPerHour,
        committed: false,
      };

      event.preventDefault();
    },
    [enableDragResize, onStageDragEnd, hitTestStageEdge, visibleStages, dims.width, viewConfig.numberOfDays]
  );

  // Track latest drag coordinates for mouseup handler
  const latestDragDelta = useRef<{ newStart: Date; newEnd: Date } | null>(null);

  useEffect(() => {
    if (!enableDragResize) return;

    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = e.clientX - drag.startMouseX;
      if (!drag.committed && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      drag.committed = true;

      const deltaHours = Math.round(dx / drag.pixelsPerHour);

      let newStart = drag.originalStart;
      let newEnd = drag.originalEnd;

      if (drag.type === 'move') {
        newStart = addHours(drag.originalStart, deltaHours);
        newEnd = addHours(drag.originalEnd, deltaHours);
      } else if (drag.type === 'resize-start') {
        newStart = addHours(drag.originalStart, deltaHours);
        if (newStart >= drag.originalEnd) newStart = addHours(drag.originalEnd, -1);
        newEnd = drag.originalEnd;
      } else if (drag.type === 'resize-end') {
        newEnd = addHours(drag.originalEnd, deltaHours);
        if (newEnd <= drag.originalStart) newEnd = addHours(drag.originalStart, 1);
        newStart = drag.originalStart;
      }

      latestDragDelta.current = { newStart, newEnd };

      // Compute ghost position
      const stage = visibleStages.find((s) => s.id === drag.stageId);
      const row = stage ? machineRowMap.get(stage.machineId) : null;
      if (row) {
        const pos = stageBarPosition(
          viewConfig.viewStart, newStart, newEnd,
          dims.width, LEFT_MARGIN, viewConfig.numberOfDays
        );
        setDragGhost({
          left: pos.left,
          top: row.y + BAR_Y_PAD,
          width: Math.max(pos.width, 4),
          height: BAR_HEIGHT,
        });
      }
    };

    const handleMouseUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      setDragGhost(null);

      if (!drag || !drag.committed || !onStageDragEnd || !latestDragDelta.current) {
        latestDragDelta.current = null;
        return;
      }

      wasDragging.current = true;
      onStageDragEnd(drag.stageId, latestDragDelta.current.newStart, latestDragDelta.current.newEnd);
      latestDragDelta.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableDragResize, onStageDragEnd, viewConfig, dims.width, visibleStages, rows]);

  // Tooltip state for downtime hover
  const [downtimeTooltip, setDowntimeTooltip] = useState<{
    x: number;
    y: number;
    window: DowntimeWindow;
  } | null>(null);

  // Track whether last mousedown was a drag start (suppress click)
  const wasDragging = useRef(false);

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      // Suppress click if we just finished a drag
      if (wasDragging.current) {
        wasDragging.current = false;
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const cssX = event.clientX - rect.left;
      const cssY = event.clientY - rect.top;

      // Check shift band click (top strip)
      if (onShiftBandClick && cssY <= SHIFT_BAND_H) {
        onShiftBandClick();
        return;
      }

      // Check machine label click first (left column)
      if (onMachineLabelClick) {
        const machineId = hitTestMachineLabel(cssX, cssY);
        if (machineId) {
          onMachineLabelClick(machineId);
          return;
        }
      }

      // Then check batch bar click (takes priority over downtime)
      if (onStageClick) {
        const stageId = hitTestStage(cssX, cssY);
        if (stageId) {
          onStageClick(stageId);
          return;
        }
      }

      // Then check downtime block click
      if (onDowntimeClick) {
        const win = hitTestDowntime(cssX, cssY);
        if (win) {
          onDowntimeClick(win.machineId, win.ruleId);
        }
      }
    },
    [onStageClick, onMachineLabelClick, onShiftBandClick, onDowntimeClick, hitTestStage, hitTestMachineLabel, hitTestDowntime]
  );

  const handleCanvasMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const hasAnyHandler = onStageClick || onMachineLabelClick || onShiftBandClick || onDowntimeClick;
      const hasNotifyShift = notifyShiftWindows.length > 0;
      if (!hasAnyHandler && !showDowntime && !hasNotifyShift) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const cssX = event.clientX - rect.left;
      const cssY = event.clientY - rect.top;

      if (onShiftBandClick && cssY <= SHIFT_BAND_H) {
        canvas.style.cursor = 'pointer';
        setDowntimeTooltip(null);
      } else if (onMachineLabelClick && hitTestMachineLabel(cssX, cssY)) {
        canvas.style.cursor = 'pointer';
        setDowntimeTooltip(null);
      } else if (enableDragResize && hitTestStageEdge(cssX, cssY)) {
        const edge = hitTestStageEdge(cssX, cssY);
        if (edge?.type === 'move') canvas.style.cursor = 'grab';
        else canvas.style.cursor = 'ew-resize';
        setDowntimeTooltip(null);
      } else if (onStageClick && hitTestStage(cssX, cssY)) {
        canvas.style.cursor = 'pointer';
        setDowntimeTooltip(null);
      } else {
        // Check downtime hover (for tooltip and cursor)
        const win = (showDowntime || notifyShiftWindows.length > 0) ? hitTestDowntime(cssX, cssY) : null;
        if (win) {
          canvas.style.cursor = onDowntimeClick ? 'pointer' : 'default';
          setDowntimeTooltip({ x: cssX, y: cssY, window: win });
        } else {
          canvas.style.cursor = 'default';
          setDowntimeTooltip(null);
        }
      }
    },
    [onStageClick, onMachineLabelClick, onShiftBandClick, onDowntimeClick, showDowntime, notifyShiftWindows, hitTestStage, hitTestMachineLabel, hitTestDowntime, enableDragResize, hitTestStageEdge]
  );

  const handleCanvasMouseLeave = useCallback(() => {
    setDowntimeTooltip(null);
  }, []);

  // Format downtime tooltip content
  const formatDowntimeTime = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'auto', position: 'relative' }}
    >
      <canvas
        ref={canvasRef}
        id={canvasId}
        onClick={handleCanvasClick}
        onMouseDown={enableDragResize ? handleCanvasMouseDown : undefined}
        onMouseMove={(onStageClick || onMachineLabelClick || onShiftBandClick || showDowntime || notifyShiftWindows.length > 0 || enableDragResize) ? handleCanvasMouseMove : undefined}
        onMouseLeave={(showDowntime || notifyShiftWindows.length > 0) ? handleCanvasMouseLeave : undefined}
      />
      {/* Drag ghost overlay */}
      {dragGhost && (
        <div
          style={{
            position: 'absolute',
            left: dragGhost.left,
            top: dragGhost.top,
            width: dragGhost.width,
            height: dragGhost.height,
            background: 'rgba(49, 130, 206, 0.35)',
            border: '2px solid rgba(49, 130, 206, 0.7)',
            borderRadius: 3,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
      )}
      {downtimeTooltip && (
        <div
          className="pp-downtime-tooltip"
          style={{
            left: Math.min(downtimeTooltip.x + 12, dims.width - 200),
            top: downtimeTooltip.y - 8,
          }}
        >
          <div className="pp-downtime-tooltip-title">
            {downtimeTooltip.window.type === 'recurring' ? 'Recurring maintenance' : 'Machine unavailable'}
            {!downtimeTooltip.window.blocksPlanning && (
              <span style={{ fontWeight: 400, fontSize: '10px', marginLeft: '6px', opacity: 0.7 }}>(informational)</span>
            )}
          </div>
          {downtimeTooltip.window.reason && (
            <div className="pp-downtime-tooltip-reason">{downtimeTooltip.window.reason}</div>
          )}
          {downtimeTooltip.window.notifyShift && (
            <div style={{ fontSize: '10px', color: '#D946EF', fontWeight: 500, marginTop: '2px' }}>
              &#9660; Shift notification active
            </div>
          )}
          <div className="pp-downtime-tooltip-time">
            {downtimeTooltip.window.type === 'recurring'
              ? `Every ${DAY_NAMES[downtimeTooltip.window.start.getDay()]}, ${formatDowntimeTime(downtimeTooltip.window.start)} — ${formatDowntimeTime(downtimeTooltip.window.end)}`
              : `${formatDowntimeTime(downtimeTooltip.window.start)} — ${formatDowntimeTime(downtimeTooltip.window.end)}`}
          </div>
        </div>
      )}
    </div>
  );
}
