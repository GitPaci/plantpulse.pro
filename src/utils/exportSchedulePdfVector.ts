// Vector PDF renderer for Schedule view
// Renders directly into jsPDF drawing primitives — no canvas capture, fully scalable output.
// Browser-local only: no server calls, no network, works offline.
//
// Architecture: mirrors the WallboardCanvas draw pipeline but outputs PDF vector commands
// instead of canvas pixels.  The same layout constants and timeline-math functions are
// reused so the visual result matches the on-screen canvas exactly.

import { jsPDF } from 'jspdf';
import { addDays, format, getDate } from 'date-fns';
import type {
  Machine,
  Stage,
  MachineDisplayGroup,
  ShutdownPeriod,
  BatchChain,
  BatchNamingConfig,
} from '@/lib/types';
import { batchNamePreview } from '@/lib/types';
import { stageBarPosition, pixelsPerDay as getPPD } from '@/lib/timeline-math';
import { getWallboardBorderColor } from '@/lib/colors';
import { isHoliday, isWeekend, isSunday } from '@/lib/holidays';
import { loadPrintSettings, formatExportTimestamp } from './exportSchedulePdf';

// ─── Layout constants (must match WallboardCanvas.tsx exactly) ──────────────────
const LEFT_MARGIN = 72;
const SHIFT_BAND_H = 10;          // not drawn in PDF; included only for TOP_MARGIN calc
const DATE_HEADER_H = 32;
const TOP_MARGIN = SHIFT_BAND_H + DATE_HEADER_H + 4;  // 46 px
const ROW_HEIGHT = 26;
const BAR_HEIGHT = 16;
const BAR_Y_PAD = (ROW_HEIGHT - BAR_HEIGHT) / 2;      // 5 px
const SEPARATOR_HEIGHT = 12;
const BORDER_WIDTH = 3;

// Virtual canvas width — matches SCHEDULE_PDF_VIEWPORT.widthPx in inoculum/page.tsx.
// All internal positions are computed in "virtual pixels"; the scale factor converts to mm.
const VIRTUAL_W = 1122;

// ─── App version (keep in sync with exportSchedulePdf.ts) ───────────────────────
const APP_VERSION = '0.1.0';

// ─── Day-theme colors (pre-blended against white for PDF compatibility) ─────────
// rgba values from DAY_THEME in WallboardCanvas.tsx, composited over #FFFFFF
const C = {
  rowEven:      '#EBF4FB',
  rowOdd:       '#FFFFFF',
  separator:    '#F1F5F9',
  weekendTint:  '#FFF3F3',   // rgba(255,220,220,0.25) × white
  holidayTint:  '#FFECEC',   // rgba(255,180,180,0.30) × white
  shutdownTint: '#EBEBEF',   // rgba(120,120,140,0.18) × white
  grid:         '#B9C8D7',   // rgba(185,200,215,0.50) × white
  barFill:      '#E2E2E2',
  labelBg:      '#EAEAEA',
  labelBorder:  '#D0D0D0',
  labelText:    '#0088BB',
  machineText:  '#1A365D',
  dateText:     '#334155',
  dateWeekend:  '#DC2626',
  headerBg:     '#FFFFFF',
  outline:      '#CCCCCC',
} as const;

// ─── Data contract ──────────────────────────────────────────────────────────────

export interface SchedulePdfVectorData {
  machines: Machine[];
  stages: Stage[];
  batchChains: BatchChain[];
  /** Determines row order on the canvas; pass filteredMachineGroups or scheduleMachineGroups */
  machineGroups: MachineDisplayGroup[];
  viewConfig: { viewStart: Date; numberOfDays: number };
  shutdownPeriods: ShutdownPeriod[];
  batchNamingConfig: BatchNamingConfig;
  /** Optional: passed through for future use (e.g. group-level styling) */
  equipmentGroups?: import('@/lib/types').EquipmentGroup[];
}

// ─── Internal types ─────────────────────────────────────────────────────────────

interface RowInfo {
  machineId: string;
  machineName: string;
  y: number;
  type: 'machine' | 'separator';
  rowIndex: number;   // includes separator rows, same semantics as WallboardCanvas
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [
    parseInt(c.slice(0, 2), 16),
    parseInt(c.slice(2, 4), 16),
    parseInt(c.slice(4, 6), 16),
  ];
}

function sf(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
}

function sd(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
}

function st(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

function buildRowLayout(
  machines: Machine[],
  groups: MachineDisplayGroup[],
): RowInfo[] {
  const rows: RowInfo[] = [];
  let py = TOP_MARGIN;
  let rowIndex = 0;

  for (let g = 0; g < groups.length; g++) {
    if (g > 0) {
      rows.push({ machineId: '', machineName: '', y: py, type: 'separator', rowIndex: rowIndex++ });
      py += SEPARATOR_HEIGHT;
    }
    for (const mId of groups[g].machineIds) {
      const m = machines.find((mx) => mx.id === mId);
      if (m) {
        rows.push({ machineId: m.id, machineName: m.name, y: py, type: 'machine', rowIndex: rowIndex++ });
        py += ROW_HEIGHT;
      }
    }
  }

  return rows;
}

function buildBatchLabel(chain: BatchChain, config: BatchNamingConfig): string {
  const rule =
    config.mode === 'per_product_line' && chain.productLine
      ? (config.productLineRules[chain.productLine] ?? config.sharedRule)
      : config.sharedRule;
  return batchNamePreview(rule, chain.seriesNumber);
}

// ─── Core vector renderer ───────────────────────────────────────────────────────
//
// ax, ay  — top-left corner of the schedule area on the PDF page (mm)
// aw, ah  — width and height of the schedule area (mm)
//
// Internal coordinate system:
//   scale = aw / VIRTUAL_W      (mm per virtual pixel, uniform)
//   px(v)  → size in mm
//   mx(v)  → absolute x on page (mm)
//   my(v)  → absolute y on page (mm)

function renderScheduleVector(
  doc: jsPDF,
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  data: SchedulePdfVectorData,
): void {
  const scale = aw / VIRTUAL_W;
  const px = (v: number) => v * scale;
  const mx = (v: number) => ax + v * scale;
  const my = (v: number) => ay + v * scale;

  const { machines, stages, batchChains, machineGroups, viewConfig, shutdownPeriods, batchNamingConfig } = data;
  const { viewStart, numberOfDays } = viewConfig;

  // ── Layout ─────────────────────────────────────────────────────────
  const rows = buildRowLayout(machines, machineGroups);
  const ppd = getPPD(VIRTUAL_W, LEFT_MARGIN, numberOfDays);

  // Total virtual height of the schedule content
  let totalH = TOP_MARGIN;
  for (const row of rows) {
    const bottom = row.y + (row.type === 'machine' ? ROW_HEIGHT : SEPARATOR_HEIGHT);
    if (bottom > totalH) totalH = bottom;
  }
  // Clamp to the visible PDF area
  const maxVirtualH = ah / scale;
  if (totalH > maxVirtualH) totalH = maxVirtualH;

  // ── Lookup maps ────────────────────────────────────────────────────
  const batchSeriesMap = new Map<string, number>();
  const batchLabelMap = new Map<string, string>();
  for (const chain of batchChains) {
    batchSeriesMap.set(chain.id, chain.seriesNumber);
    batchLabelMap.set(chain.id, buildBatchLabel(chain, batchNamingConfig));
  }

  const machineRowMap = new Map<string, RowInfo>();
  for (const row of rows) {
    if (row.type === 'machine') machineRowMap.set(row.machineId, row);
  }

  const shutdownDaySet = new Set<string>();
  for (const sd of shutdownPeriods) {
    let d = new Date(sd.startDate);
    const end = new Date(sd.endDate);
    while (d <= end) {
      shutdownDaySet.add(format(d, 'yyyy-MM-dd'));
      d = addDays(d, 1);
    }
  }

  // ═══ Layer 1: White base + row backgrounds ══════════════════════════

  sf(doc, C.headerBg);
  doc.rect(ax, ay, aw, ah, 'F');

  for (const row of rows) {
    if (row.y >= maxVirtualH) continue;
    if (row.type === 'separator') {
      sf(doc, C.separator);
      doc.rect(mx(LEFT_MARGIN), my(row.y), px(VIRTUAL_W - LEFT_MARGIN), px(SEPARATOR_HEIGHT), 'F');
    } else {
      // rowIndex % 2 mirrors WallboardCanvas drawRowBackgrounds() exactly
      sf(doc, row.rowIndex % 2 === 0 ? C.rowEven : C.rowOdd);
      doc.rect(mx(LEFT_MARGIN), my(row.y), px(VIRTUAL_W - LEFT_MARGIN), px(ROW_HEIGHT), 'F');
    }
  }

  // ═══ Layer 2: Calendar column tints + vertical grid lines ════════════

  const colBottom = totalH;
  const colH = colBottom - TOP_MARGIN;

  for (let dayIdx = 0; dayIdx < numberOfDays; dayIdx++) {
    const dayDate = addDays(viewStart, dayIdx);
    const colX = LEFT_MARGIN + dayIdx * ppd;
    const isSd = shutdownDaySet.has(format(dayDate, 'yyyy-MM-dd'));
    const isHol = isHoliday(dayDate);
    const isSun = isSunday(dayDate);
    const isWknd = isWeekend(dayDate);

    if (isSd) {
      sf(doc, C.shutdownTint);
      doc.rect(mx(colX), my(TOP_MARGIN), px(ppd), px(colH), 'F');
    } else if (isHol || isSun) {
      sf(doc, C.holidayTint);
      doc.rect(mx(colX), my(TOP_MARGIN), px(ppd), px(colH), 'F');
    } else if (isWknd) {
      sf(doc, C.weekendTint);
      doc.rect(mx(colX), my(TOP_MARGIN), px(ppd), px(colH), 'F');
    }

    // Vertical grid line at right edge of each day column
    sd(doc, C.grid);
    doc.setLineWidth(px(0.5));
    doc.line(mx(colX + ppd), my(TOP_MARGIN), mx(colX + ppd), my(colBottom));
  }

  // ═══ Layer 3: Batch bars ═══════════════════════════════════════════════

  for (const stage of stages) {
    const row = machineRowMap.get(stage.machineId);
    if (!row || row.y >= maxVirtualH) continue;

    const pos = stageBarPosition(
      viewStart, stage.startDatetime, stage.endDatetime,
      VIRTUAL_W, LEFT_MARGIN, numberOfDays,
    );
    if (pos.offScreen) continue;

    const bx = pos.left;
    const bw = pos.width;
    const by = row.y + BAR_Y_PAD;

    // Main fill (top portion, above border)
    sf(doc, C.barFill);
    doc.rect(mx(bx), my(by), px(bw), px(BAR_HEIGHT - BORDER_WIDTH), 'F');

    // Colored bottom border (series-cycled)
    const seriesNum = batchSeriesMap.get(stage.batchChainId) ?? 0;
    sf(doc, getWallboardBorderColor(seriesNum));
    doc.rect(mx(bx), my(by + BAR_HEIGHT - BORDER_WIDTH), px(bw), px(BORDER_WIDTH), 'F');

    // Thin outline: top, left, right edges only
    sd(doc, C.outline);
    doc.setLineWidth(px(0.3));
    doc.line(mx(bx),      my(by),            mx(bx + bw), my(by));            // top
    doc.line(mx(bx),      my(by),            mx(bx),      my(by + BAR_HEIGHT)); // left
    doc.line(mx(bx + bw), my(by),            mx(bx + bw), my(by + BAR_HEIGHT)); // right

    // Start-hour label (small, left edge)
    if (bw > 25) {
      const h = stage.startDatetime.getHours();
      st(doc, '#444444');
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(3.5);
      doc.text(String(h), mx(bx + 1.5), my(by + BAR_HEIGHT - BORDER_WIDTH - 1.5));
    }

    // Centered batch-name label
    if (bw > 22) {
      const label = batchLabelMap.get(stage.batchChainId) ?? '';
      if (label) {
        const lh = 8;
        const lw = Math.min(bw - 6, 60);
        const lx = bx + (bw - lw) / 2;
        const ly = by + (BAR_HEIGHT - BORDER_WIDTH - lh) / 2;

        // Rounded label background
        sf(doc, C.labelBg);
        doc.roundedRect(mx(lx), my(ly), px(lw), px(lh), px(1.5), px(1.5), 'F');
        sd(doc, C.labelBorder);
        doc.setLineWidth(px(0.3));
        doc.roundedRect(mx(lx), my(ly), px(lw), px(lh), px(1.5), px(1.5), 'S');

        // Label text (centered)
        st(doc, C.labelText);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(5);
        doc.text(label, mx(lx + lw / 2), my(ly + lh / 2), {
          align: 'center',
          baseline: 'middle',
        });
      }
    }
  }

  // ═══ Layer 4: Left column — machine labels ══════════════════════════

  // White background covers any bar overflow into the label column
  sf(doc, C.headerBg);
  doc.rect(ax, my(TOP_MARGIN), px(LEFT_MARGIN), px(totalH - TOP_MARGIN), 'F');

  st(doc, C.machineText);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(6.5);

  for (const row of rows) {
    if (row.type !== 'machine' || row.y >= maxVirtualH) continue;
    doc.text(row.machineName, mx(LEFT_MARGIN - 3), my(row.y + ROW_HEIGHT / 2), {
      align: 'right',
      baseline: 'middle',
    });
  }

  // Left column right border
  sd(doc, C.grid);
  doc.setLineWidth(px(1));
  doc.line(mx(LEFT_MARGIN), ay, mx(LEFT_MARGIN), my(totalH));

  // ═══ Layer 5: Date header ════════════════════════════════════════════

  // Header background (covers entire top area)
  sf(doc, C.headerBg);
  doc.rect(ax, ay, aw, px(TOP_MARGIN), 'F');

  for (let dayIdx = 0; dayIdx < numberOfDays; dayIdx++) {
    const dayDate = addDays(viewStart, dayIdx);
    const colX = LEFT_MARGIN + dayIdx * ppd;
    const dayNum = getDate(dayDate);
    const isWknd = isWeekend(dayDate);
    const isHol = isHoliday(dayDate);

    // Day number — centred in the day column
    if (isWknd || isHol) {
      st(doc, C.dateWeekend);
      doc.setFont('Helvetica', 'bold');
    } else {
      st(doc, C.dateText);
      doc.setFont('Helvetica', 'normal');
    }
    doc.setFontSize(6);
    doc.text(String(dayNum), mx(colX + ppd / 2), my(TOP_MARGIN - 5), {
      align: 'center',
      baseline: 'middle',
    });
  }

  // Header bottom separator line
  sd(doc, C.grid);
  doc.setLineWidth(px(1));
  doc.line(ax, my(TOP_MARGIN), ax + aw, my(TOP_MARGIN));

  // Top-left corner box (covers header + label column intersection)
  sf(doc, C.headerBg);
  doc.rect(ax, ay, px(LEFT_MARGIN), px(TOP_MARGIN), 'F');
}

// ─── Public export function ──────────────────────────────────────────────────────

/**
 * Generate a fully-vector A4 landscape PDF of the schedule.
 *
 * All elements (grid lines, bars, labels, header, footer) are rendered as PDF
 * primitives — no canvas capture involved.  Output is sharp at any print scale.
 *
 * @param data       Schedule data from the Zustand store
 * @param monthLabel Human-readable month, e.g. "March 2026"
 */
export async function exportSchedulePdfVector(
  data: SchedulePdfVectorData,
  monthLabel: string,
): Promise<void> {
  const settings = loadPrintSettings();

  const pageW = 297;   // A4 landscape width (mm)
  const pageH = 210;   // A4 landscape height (mm)
  const margin = 5;
  const contentW = pageW - margin * 2;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // ── Header ────────────────────────────────────────────────────────────
  let cursorY = margin;

  if (settings.facilityTitle.trim()) {
    cursorY += 4;
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text(settings.facilityTitle.trim(), pageW / 2, cursorY, { align: 'center' });
    cursorY += 4;
  }

  // Month/year label
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(monthLabel, pageW / 2, cursorY + 2, { align: 'center' });
  cursorY += 5;

  // Thin separator under header
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(margin, cursorY, pageW - margin, cursorY);
  cursorY += 2;

  const scheduleTopY = cursorY;

  // ── Footer zone (calculate height first so schedule fills remaining space) ──
  const footerFontSize = 7.5;
  const footerLineH = 3.5;

  let leftLineCount = 0;
  if (settings.showVersion) leftLineCount++;
  if (settings.showTimestamp) leftLineCount++;
  if (settings.showPreparedBy) leftLineCount++;
  if (settings.showSignature) leftLineCount++;

  const minLines = Math.max(leftLineCount, 1);
  const footerTextH = minLines * footerLineH;
  const footerTotalH = footerTextH + 5;
  const footerSepY = pageH - margin - footerTotalH;
  const scheduleBottomY = footerSepY - 2;
  const scheduleH = scheduleBottomY - scheduleTopY;

  // ── Vector schedule ──────────────────────────────────────────────────
  renderScheduleVector(doc, margin, scheduleTopY, contentW, scheduleH, data);

  // ── Footer ────────────────────────────────────────────────────────────
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(margin, footerSepY, pageW - margin, footerSepY);

  doc.setFontSize(footerFontSize);
  doc.setTextColor(140, 140, 140);
  doc.setFont('Helvetica', 'normal');

  let leftY = footerSepY + 3;
  if (settings.showVersion) {
    doc.text(`PlantPulse Scheduler v${APP_VERSION}`, margin, leftY);
    leftY += footerLineH;
  }
  if (settings.showTimestamp) {
    doc.text(`Exported: ${formatExportTimestamp()}`, margin, leftY);
    leftY += footerLineH;
  }
  if (settings.showPreparedBy) {
    doc.text('Prepared by: Unknown', margin, leftY);
    leftY += footerLineH;
  }
  if (settings.showSignature) {
    doc.text('Signature: ____________________', margin, leftY);
  }

  if (settings.disclaimerText.trim()) {
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    const disclaimerY = footerSepY + 3 + footerTextH / 2;
    doc.text(settings.disclaimerText.trim(), pageW / 2, disclaimerY, { align: 'center' });
    doc.setFont('Helvetica', 'normal');
  }

  if (settings.showPageNumbers) {
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(footerFontSize);
      doc.setTextColor(140, 140, 140);
      doc.setFont('Helvetica', 'normal');
      const pageNumY = footerSepY + 3 + footerTextH / 2;
      doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageNumY, { align: 'right' });
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────
  const filenameMonth = monthLabel.replace(/\s+/g, '_');
  doc.save(`PlantPulse_${filenameMonth}.pdf`);
}
