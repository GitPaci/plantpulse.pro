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

// ─── Smart Machine Resolution Types ─────────────────────────────────────

export interface UnknownMachineInfo {
  name: string;               // original name from Excel (e.g. "B-RTX01")
  rowNumbers: number[];        // which rows reference this machine
  suggestedGroup?: string;     // auto-grouping hint from prefix matching
  similarExisting?: string;    // ID of most similar existing machine (fuzzy)
  namePrefix?: string;         // extracted prefix for bulk-grouping (e.g. "B-RTX")
}

export interface PendingRow {
  rowNum: number;
  vesselName: string;          // original machine name
  seriesNum: number;
  startDate: Date;
  endDate: Date;
}

// ─── Schedule Import ──────────────────────────────────────────────────────

interface ScheduleImportResult {
  chains: BatchChain[];
  stages: Stage[];
  warnings: string[];
  unknownMachines: UnknownMachineInfo[];
  pendingRows: PendingRow[];
  /** Map from seriesNum to chainId for the first-pass chains (used by resolveAndBuildStages) */
  existingChainIds: Map<number, string>;
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
    return { chains: [], stages: [], warnings, unknownMachines: [], pendingRows: [], existingChainIds: new Map() };
  }

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  if (rows.length === 0) {
    warnings.push('Sheet is empty.');
    return { chains: [], stages: [], warnings, unknownMachines: [], pendingRows: [], existingChainIds: new Map() };
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
    return { chains: [], stages: [], warnings, unknownMachines: [], pendingRows: [], existingChainIds: new Map() };
  }

  // Build machine lookup by name (case-insensitive)
  const machineByName = new Map<string, Machine>();
  for (const m of existingMachines) {
    machineByName.set(m.name.toLowerCase().trim(), m);
  }

  // Infer stage type from equipment group (also exported standalone below)
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
  const unknownMachinesMap = new Map<string, UnknownMachineInfo>();
  const pendingRows: PendingRow[] = [];

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

    // Validate series number (needed for both known and unknown machines)
    const seriesNum = typeof seriesRaw === 'number' ? seriesRaw : parseInt(String(seriesRaw), 10);
    if (!Number.isInteger(seriesNum) || seriesNum <= 0) {
      warnings.push(`Row ${rowNum}: Invalid series number "${seriesRaw}" — skipped.`);
      continue;
    }

    // Parse dates (needed for both known and unknown machines)
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

    // Unknown machine → collect for resolution instead of skipping
    if (!machine) {
      const key = vesselRaw.toLowerCase();
      const existing = unknownMachinesMap.get(key);
      if (existing) {
        existing.rowNumbers.push(rowNum);
      } else {
        unknownMachinesMap.set(key, {
          name: vesselRaw,
          rowNumbers: [rowNum],
          namePrefix: extractMachinePrefix(vesselRaw),
          suggestedGroup: suggestEquipmentGroup(vesselRaw, existingMachines),
          similarExisting: findSimilarMachine(vesselRaw, existingMachines)?.id,
        });
      }
      pendingRows.push({ rowNum, vesselName: vesselRaw, seriesNum, startDate, endDate });
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
  const existingChainIds = new Map<number, string>();

  for (const [seriesNum, chainStages] of stagesByChain) {
    const chainId = generateId('bc-');
    const productLine = chainProductLines.get(seriesNum) ?? '';
    existingChainIds.set(seriesNum, chainId);

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

  const unknownMachines = Array.from(unknownMachinesMap.values());

  return { chains, stages: allStages, warnings, unknownMachines, pendingRows, existingChainIds };
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

// ─── Smart Machine Resolution Helpers ─────────────────────────────────────

/**
 * Infer stage type from a machine's equipment group. Exported for use by resolveAndBuildStages.
 */
export function inferStageTypeFromMachine(machine: Machine): string {
  const group = machine.group.toLowerCase();
  if (group.includes('inocul')) return 'inoculum';
  if (group.includes('propag')) return 'seed_n2';
  if (group.includes('pre_ferment') || group.includes('pre-ferment') || group.includes('preferment')) return 'seed_n1';
  if (group.includes('ferment')) return 'production';
  return 'production';
}

/**
 * Extract a prefix from a machine name by splitting at the numeric suffix.
 * E.g. "B-RTX01" → "B-RTX", "F-2" → "F", "PR-1" → "PR", "PF-3" → "PF"
 */
export function extractMachinePrefix(name: string): string {
  // Remove trailing digits (and optional dash before them)
  const match = name.match(/^(.+?)[-\s]?\d+$/);
  return match ? match[1] : name;
}

/**
 * Normalize a machine name for fuzzy comparison:
 * strip hyphens, spaces, underscores; lowercase.
 */
function normalizeMachineName(name: string): string {
  return name.replace(/[-_\s]/g, '').toLowerCase();
}

/**
 * Find the most similar existing machine by normalized name comparison.
 * Returns the matching Machine or undefined if no close match.
 */
export function findSimilarMachine(name: string, machines: Machine[]): Machine | undefined {
  const normalized = normalizeMachineName(name);
  // First try exact normalized match (e.g. "F2" matches "F-2")
  for (const m of machines) {
    if (normalizeMachineName(m.name) === normalized) {
      return m;
    }
  }
  // Then try prefix match: if the unknown name starts with or is a prefix of an existing name
  for (const m of machines) {
    const mNorm = normalizeMachineName(m.name);
    if (mNorm.startsWith(normalized) || normalized.startsWith(mNorm)) {
      return m;
    }
  }
  return undefined;
}

/**
 * Suggest an equipment group for an unknown machine by matching its prefix
 * against existing machines' name prefixes.
 */
function suggestEquipmentGroup(name: string, machines: Machine[]): string | undefined {
  const prefix = extractMachinePrefix(name).toLowerCase();
  for (const m of machines) {
    const mPrefix = extractMachinePrefix(m.name).toLowerCase();
    if (mPrefix === prefix) {
      return m.group;
    }
  }
  return undefined;
}

/**
 * Resolve pending rows (from unknown machines) into stages and chains
 * after the user has chosen create/map/skip for each unknown machine.
 *
 * @param pendingRows - Rows that were deferred during first parse pass
 * @param machineResolver - Map from lowercase vessel name to the resolved Machine
 * @param existingChainIds - Map from seriesNum to chainId from the first pass
 * @param inferStageTypeFn - Stage type inference function
 */
export function resolveAndBuildStages(
  pendingRows: PendingRow[],
  machineResolver: Map<string, Machine>,
  existingChainIds: Map<number, string>,
  inferStageTypeFn: (machine: Machine) => string,
): { newChains: BatchChain[]; newStages: Stage[] } {
  const newChains: BatchChain[] = [];
  const newStages: Stage[] = [];
  const newChainIds = new Map<number, string>();

  for (const row of pendingRows) {
    const machine = machineResolver.get(row.vesselName.toLowerCase());
    if (!machine) continue; // user chose "skip"

    // Find or create chain
    let chainId = existingChainIds.get(row.seriesNum) ?? newChainIds.get(row.seriesNum);
    if (!chainId) {
      chainId = generateId('bc-');
      newChainIds.set(row.seriesNum, chainId);
      const productLine = machine.productLine ?? '';
      newChains.push({
        id: chainId,
        batchName: `${productLine ? productLine + '-' : ''}${String(row.seriesNum).padStart(3, '0')}`,
        seriesNumber: row.seriesNum,
        productLine,
        status: 'draft' as BatchStatus,
      });
    }

    newStages.push({
      id: generateId('stg-'),
      machineId: machine.id,
      batchChainId: chainId,
      stageType: inferStageTypeFn(machine),
      startDatetime: row.startDate,
      endDatetime: row.endDate,
      state: 'planned' as StageState,
    });
  }

  return { newChains, newStages };
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
