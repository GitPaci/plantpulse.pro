// Excel import/export — SheetJS-based schedule and maintenance I/O
// Maps between legacy .xlsx format (pososda, nacep, precep, serija) and
// modern Zustand store entities (Stage, BatchChain, Machine, MaintenanceTask).
//
// Free edition: Excel is the only data pathway (no server, no DB).

import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import type {
  Stage,
  BatchChain,
  Machine,
  MaintenanceTask,
  StageState,
  BatchStatus,
} from './types';
import { generateId } from './store';

// ─── Schedule Import ──────────────────────────────────────────────────────

interface ScheduleImportResult {
  chains: BatchChain[];
  stages: Stage[];
  warnings: string[];
}

/**
 * Parse a schedule .xlsx file into BatchChain + Stage entities.
 *
 * Expected Sheet1 columns: pososda (vessel), nacep (start), precep (end), serija (series#).
 * Rows are grouped by serija to form batch chains. Stage types are inferred from
 * the machine's equipment group.
 */
export function parseScheduleXlsx(
  buffer: ArrayBuffer,
  existingMachines: Machine[]
): ScheduleImportResult {
  const warnings: string[] = [];
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    warnings.push('Workbook has no sheets.');
    return { chains: [], stages: [], warnings };
  }

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  if (rows.length === 0) {
    warnings.push('Sheet is empty.');
    return { chains: [], stages: [], warnings };
  }

  // Validate headers
  const firstRow = rows[0];
  const headers = Object.keys(firstRow);
  const requiredHeaders = ['pososda', 'nacep', 'precep', 'serija'];
  for (const h of requiredHeaders) {
    if (!headers.some((k) => k.toLowerCase().trim() === h)) {
      warnings.push(`Missing required column: "${h}". Found: [${headers.join(', ')}]`);
    }
  }
  if (warnings.length > 0) {
    return { chains: [], stages: [], warnings };
  }

  // Build machine lookup by name (case-insensitive)
  const machineByName = new Map<string, Machine>();
  for (const m of existingMachines) {
    machineByName.set(m.name.toLowerCase().trim(), m);
  }

  // Infer stage type from equipment group
  function inferStageType(machine: Machine): string {
    const group = machine.group.toLowerCase();
    if (group.includes('inocul')) return 'inoculum';
    if (group.includes('propag')) return 'seed_n2';
    if (group.includes('pre_ferment') || group.includes('pre-ferment') || group.includes('preferment')) return 'seed_n1';
    if (group.includes('ferment')) return 'production';
    return 'production'; // fallback
  }

  // Parse rows
  const stagesByChain = new Map<number, Stage[]>();
  const chainProductLines = new Map<number, string>();
  const seenKeys = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed header + 1-indexed data

    // Normalize column access (case-insensitive)
    const getCol = (name: string): unknown => {
      const key = Object.keys(row).find((k) => k.toLowerCase().trim() === name);
      return key ? row[key] : undefined;
    };

    const vesselRaw = String(getCol('pososda') ?? '').trim();
    const seriesRaw = getCol('serija');
    const startRaw = getCol('nacep');
    const endRaw = getCol('precep');

    // Skip empty rows
    if (!vesselRaw && !seriesRaw) continue;

    // Validate vessel
    const machine = machineByName.get(vesselRaw.toLowerCase());
    if (!machine) {
      warnings.push(`Row ${rowNum}: Unknown machine "${vesselRaw}" — skipped.`);
      continue;
    }

    // Validate series number
    const seriesNum = typeof seriesRaw === 'number' ? seriesRaw : parseInt(String(seriesRaw), 10);
    if (!Number.isInteger(seriesNum) || seriesNum <= 0) {
      warnings.push(`Row ${rowNum}: Invalid series number "${seriesRaw}" — skipped.`);
      continue;
    }

    // Parse dates
    const startDate = parseExcelDate(startRaw);
    const endDate = parseExcelDate(endRaw);

    if (!startDate) {
      warnings.push(`Row ${rowNum}: Cannot parse start date "${startRaw}" — skipped.`);
      continue;
    }
    if (!endDate) {
      warnings.push(`Row ${rowNum}: Cannot parse end date "${endRaw}" — skipped.`);
      continue;
    }

    if (startDate > endDate) {
      warnings.push(`Row ${rowNum}: Start (${format(startDate, 'yyyy-MM-dd HH:mm')}) is after end (${format(endDate, 'yyyy-MM-dd HH:mm')}) — skipped.`);
      continue;
    }

    // Duplicate check
    const dupeKey = `${machine.id}|${startDate.getTime()}|${seriesNum}`;
    if (seenKeys.has(dupeKey)) {
      warnings.push(`Row ${rowNum}: Duplicate entry (${vesselRaw}, series ${seriesNum}) — skipped.`);
      continue;
    }
    seenKeys.add(dupeKey);

    // Create stage
    const stage: Stage = {
      id: generateId('stg-'),
      machineId: machine.id,
      batchChainId: '', // will be set below
      stageType: inferStageType(machine),
      startDatetime: startDate,
      endDatetime: endDate,
      state: 'planned' as StageState,
    };

    if (!stagesByChain.has(seriesNum)) {
      stagesByChain.set(seriesNum, []);
    }
    stagesByChain.get(seriesNum)!.push(stage);

    // Track product line from machine assignment
    if (machine.productLine && !chainProductLines.has(seriesNum)) {
      chainProductLines.set(seriesNum, machine.productLine);
    }
  }

  // Build batch chains and link stages
  const chains: BatchChain[] = [];
  const allStages: Stage[] = [];

  for (const [seriesNum, chainStages] of stagesByChain) {
    const chainId = generateId('bc-');
    const productLine = chainProductLines.get(seriesNum) ?? '';

    chains.push({
      id: chainId,
      batchName: `${productLine ? productLine + '-' : ''}${String(seriesNum).padStart(3, '0')}`,
      seriesNumber: seriesNum,
      productLine,
      status: 'draft' as BatchStatus,
    });

    // Sort stages by start time and link to chain
    chainStages.sort((a, b) => a.startDatetime.getTime() - b.startDatetime.getTime());
    for (const s of chainStages) {
      s.batchChainId = chainId;
      allStages.push(s);
    }
  }

  return { chains, stages: allStages, warnings };
}

// ─── Schedule Export ──────────────────────────────────────────────────────

/**
 * Export stages + batch chains to an .xlsx ArrayBuffer.
 * Sheet1 columns: pososda, nacep, precep, serija (legacy format).
 */
export function exportScheduleXlsx(
  stages: Stage[],
  batchChains: BatchChain[],
  machines: Machine[]
): ArrayBuffer {
  const machineMap = new Map(machines.map((m) => [m.id, m]));
  const chainMap = new Map(batchChains.map((c) => [c.id, c]));

  // Build rows sorted by series then start time
  const sorted = [...stages].sort((a, b) => {
    const chainA = chainMap.get(a.batchChainId);
    const chainB = chainMap.get(b.batchChainId);
    const serA = chainA?.seriesNumber ?? 0;
    const serB = chainB?.seriesNumber ?? 0;
    if (serA !== serB) return serA - serB;
    return a.startDatetime.getTime() - b.startDatetime.getTime();
  });

  const data = sorted.map((s) => ({
    pososda: machineMap.get(s.machineId)?.name ?? s.machineId,
    nacep: s.startDatetime,
    precep: s.endDatetime,
    serija: chainMap.get(s.batchChainId)?.seriesNumber ?? 0,
  }));

  const ws = XLSX.utils.json_to_sheet(data, {
    header: ['pososda', 'nacep', 'precep', 'serija'],
    dateNF: 'yyyy-mm-dd hh:mm',
  });

  // Set column widths
  ws['!cols'] = [
    { wch: 12 }, // pososda
    { wch: 18 }, // nacep
    { wch: 18 }, // precep
    { wch: 8 },  // serija
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Schedule');

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

// ─── Maintenance Import ───────────────────────────────────────────────────

interface MaintenanceImportResult {
  tasks: MaintenanceTask[];
  warnings: string[];
}

/**
 * Parse a maintenance .xlsx file into MaintenanceTask entities.
 * Expected columns: pososda (vessel), zacetek (start), konec (end), tip (type), status.
 */
export function parseMaintenanceXlsx(
  buffer: ArrayBuffer,
  existingMachines: Machine[]
): MaintenanceImportResult {
  const warnings: string[] = [];
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    warnings.push('Workbook has no sheets.');
    return { tasks: [], warnings };
  }

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  if (rows.length === 0) {
    warnings.push('Sheet is empty.');
    return { tasks: [], warnings };
  }

  const machineByName = new Map<string, Machine>();
  for (const m of existingMachines) {
    machineByName.set(m.name.toLowerCase().trim(), m);
  }

  const tasks: MaintenanceTask[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const getCol = (name: string): unknown => {
      const key = Object.keys(row).find((k) => k.toLowerCase().trim() === name);
      return key ? row[key] : undefined;
    };

    const vesselRaw = String(getCol('pososda') ?? '').trim();
    const startRaw = getCol('zacetek');
    const endRaw = getCol('konec');
    const typeRaw = String(getCol('tip') ?? '').trim();
    const statusRaw = String(getCol('status') ?? 'planned').trim().toLowerCase();

    if (!vesselRaw) continue;

    const machine = machineByName.get(vesselRaw.toLowerCase());
    if (!machine) {
      warnings.push(`Row ${rowNum}: Unknown machine "${vesselRaw}" — skipped.`);
      continue;
    }

    const startDate = parseExcelDate(startRaw);
    const endDate = parseExcelDate(endRaw);

    if (!startDate) {
      warnings.push(`Row ${rowNum}: Cannot parse start date — skipped.`);
      continue;
    }
    if (!endDate) {
      warnings.push(`Row ${rowNum}: Cannot parse end date — skipped.`);
      continue;
    }

    const validStatuses = ['planned', 'acknowledged', 'not_possible'] as const;
    const status = validStatuses.includes(statusRaw as typeof validStatuses[number])
      ? (statusRaw as MaintenanceTask['status'])
      : 'planned';

    tasks.push({
      id: generateId('mt-'),
      machineId: machine.id,
      plannedStart: startDate,
      plannedEnd: endDate,
      taskCode: typeRaw || 'MAINT',
      taskType: typeRaw || 'general',
      status,
    });
  }

  return { tasks, warnings };
}

// ─── Maintenance Export ───────────────────────────────────────────────────

/**
 * Export maintenance tasks to an .xlsx ArrayBuffer.
 * Columns: pososda, zacetek, konec, tip, status.
 */
export function exportMaintenanceXlsx(
  tasks: MaintenanceTask[],
  machines: Machine[]
): ArrayBuffer {
  const machineMap = new Map(machines.map((m) => [m.id, m]));

  const sorted = [...tasks].sort(
    (a, b) => a.plannedStart.getTime() - b.plannedStart.getTime()
  );

  const data = sorted.map((t) => ({
    pososda: machineMap.get(t.machineId)?.name ?? t.machineId,
    zacetek: t.plannedStart,
    konec: t.plannedEnd,
    tip: t.taskType,
    status: t.status,
  }));

  const ws = XLSX.utils.json_to_sheet(data, {
    header: ['pososda', 'zacetek', 'konec', 'tip', 'status'],
    dateNF: 'yyyy-mm-dd hh:mm',
  });

  ws['!cols'] = [
    { wch: 12 }, // pososda
    { wch: 18 }, // zacetek
    { wch: 18 }, // konec
    { wch: 16 }, // tip
    { wch: 14 }, // status
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Maintenance');

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Trigger a browser file download from an ArrayBuffer.
 */
export function downloadXlsx(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Parse an Excel cell value into a Date.
 * Handles: Date objects (from cellDates), ISO strings, Excel serial numbers.
 */
function parseExcelDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    // Excel serial date number
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + value * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
