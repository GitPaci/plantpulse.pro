'use client';

// Planner — Interactive planning view
// Modern replacement for VBA FormaZaPlan (Excel UserForm)
// Sidebar: organized tool sections (Batch Ops, Data I/O, Setup)

import Navigation from '@/components/ui/Navigation';
import WallboardCanvas from '@/components/timeline/WallboardCanvas';
import EquipmentSetup from '@/components/planner/EquipmentSetup';
import ProcessSetup from '@/components/planner/ProcessSetup';
import ShiftSchedule from '@/components/planner/ShiftSchedule';
import StageDetailPanel from '@/components/planner/StageDetailPanel';
import NewChainWizard from '@/components/planner/NewChainWizard';
import BulkShiftTool from '@/components/planner/BulkShiftTool';
import ChainEditor from '@/components/planner/ChainEditor';
import CapacityPanel from '@/components/planner/CapacityPanel';
import { usePlantPulseStore, generateId } from '@/lib/store';
import {
  parseScheduleXlsx,
  exportScheduleXlsx,
  parseMaintenanceXlsx,
  exportMaintenanceXlsx,
  downloadXlsx,
  resolveAndBuildStages,
  inferStageTypeFromMachine,
  type UnknownMachineInfo,
  type PendingRow,
} from '@/lib/excel-io';
import { currentShiftTeam } from '@/lib/shift-rotation';
import { subDays, addDays, startOfDay, differenceInDays, format, isToday, isFuture } from 'date-fns';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { validateSchedule } from '@/lib/schedule-validation';

// ─── View mode presets ────────────────────────────────────────────────
type ViewMode = 'day' | 'week' | 'month' | 'quarter';

const VIEW_MODE_DAYS: Record<ViewMode, number> = {
  day: 1,
  week: 7,
  month: 30,
  quarter: 90,
};

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
];

function inferViewMode(numberOfDays: number): ViewMode {
  if (numberOfDays <= 1) return 'day';
  if (numberOfDays <= 7) return 'week';
  if (numberOfDays <= 31) return 'month';
  return 'quarter';
}

function orderedChainStageIds(chainId: string, allStages: import('@/lib/types').Stage[], stageDefaults: import('@/lib/types').StageDefault[]): string[] {
  const idx = new Map(stageDefaults.map((d, i) => [d.stageType, i]));
  return allStages
    .filter((s) => s.batchChainId === chainId)
    .sort((a, b) => (idx.get(a.stageType) ?? 999) - (idx.get(b.stageType) ?? 999))
    .map((s) => s.id);
}

// ─── Inline SVG icons (16×16, stroke-based) ───────────────────────────

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function IconBulkShift() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 8h9M8 5l3 3-3 3" />
      <path d="M13 3v10" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 10V3M5 5l3-3 3 3" />
      <path d="M3 11v2a1 1 0 001 1h8a1 1 0 001-1v-2" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v8M5 7l3 3 3-3" />
      <path d="M3 11v2a1 1 0 001 1h8a1 1 0 001-1v-2" />
    </svg>
  );
}

function IconWrench() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.5 2.5a3.5 3.5 0 00-4.45 4.45L2.5 10.5 3 13l2.5.5 3.55-3.55a3.5 3.5 0 004.45-4.45L11.5 7.5 10 8l-2-2 1.5-2z" />
    </svg>
  );
}

function IconEquipment() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="2" width="10" height="9" rx="1.5" />
      <path d="M6 11v3M10 11v3M4 14h8" />
      <circle cx="8" cy="6.5" r="2" />
    </svg>
  );
}

function IconProcess() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2v4l-2 3v3a1 1 0 001 1h8a1 1 0 001-1V9l-2-3V2" />
      <path d="M5 2h6" />
      <path d="M3 9h10" />
    </svg>
  );
}

function IconShift() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 4.5V8l2.5 1.5" />
      <circle cx="5" cy="13.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="14" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="13.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4.5l3 3 3-3" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 3l3 3-3 3" />
    </svg>
  );
}

function IconChevronLeft({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3L5 7l4 4" />
    </svg>
  );
}

function IconInbox({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12l2-6h12l2 6" />
      <rect x="2" y="12" width="20" height="8" rx="2" />
      <path d="M9 16h6" />
    </svg>
  );
}

function IconCheck({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5l2.5 2.5L8 3" />
    </svg>
  );
}

function IconEdit({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2.5l2 2-6 6H3.5v-2l6-6z" />
    </svg>
  );
}

// ─── Sidebar section (collapsible) ─────────────────────────────────────

function SidebarSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="planner-sidebar-section">
      <button
        className="planner-sidebar-section-header"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="planner-sidebar-section-chevron">
          {open ? <IconChevronDown /> : <IconChevronRight />}
        </span>
        <span>{title}</span>
      </button>
      {open && <div className="planner-sidebar-section-body">{children}</div>}
    </div>
  );
}

// ─── Sidebar tool button ───────────────────────────────────────────────

function ToolButton({
  icon,
  label,
  description,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick?: () => void;
  badge?: string;
}) {
  return (
    <button
      className="planner-tool-btn"
      onClick={onClick}
      title={description}
    >
      <span className="planner-tool-icon">{icon}</span>
      <span className="planner-tool-text">
        <span className="planner-tool-label">{label}</span>
        <span className="planner-tool-desc">{description}</span>
      </span>
      {badge && <span className="planner-tool-badge">{badge}</span>}
    </button>
  );
}

// ─── Stage Inspector (inline in sidebar) ─────────────────────────────

function StageInspector({
  stageId,
  onEditChain,
  onEditStage,
}: {
  stageId: string | null;
  onEditChain: (chainId: string) => void;
  onEditStage: (stageId: string) => void;
}) {
  const stages = usePlantPulseStore((s) => s.stages);
  const batchChains = usePlantPulseStore((s) => s.batchChains);
  const machines = usePlantPulseStore((s) => s.machines);
  const productLines = usePlantPulseStore((s) => s.productLines);
  const stageTypeDefinitions = usePlantPulseStore((s) => s.stageTypeDefinitions);
  const stageTypesMode = usePlantPulseStore((s) => s.stageTypesMode);
  const productLineStageTypes = usePlantPulseStore((s) => s.productLineStageTypes);

  const stage = stageId ? stages.find((s) => s.id === stageId) : null;
  const chain = stage ? batchChains.find((c) => c.id === stage.batchChainId) : null;
  const machine = stage ? machines.find((m) => m.id === stage.machineId) : null;
  const productLine = chain ? productLines.find((p) => p.id === chain.productLine) : null;

  const stageTypeDefs = useMemo(() => {
    if (!chain) return stageTypeDefinitions;
    if (stageTypesMode === 'per_product_line' && chain.productLine) {
      return productLineStageTypes[chain.productLine] ?? stageTypeDefinitions;
    }
    return stageTypeDefinitions;
  }, [chain, stageTypesMode, productLineStageTypes, stageTypeDefinitions]);

  const stageTypeDef = stage ? stageTypeDefs.find((d) => d.id === stage.stageType) : null;

  // Ordered chain stages
  const chainStages = useMemo(() => {
    if (!stage) return [];
    const stageDefaults = productLine?.stageDefaults ?? [];
    const idx = new Map(stageDefaults.map((d, i) => [d.stageType, i]));
    return stages
      .filter((s) => s.batchChainId === stage.batchChainId)
      .sort((a, b) => {
        const ai = idx.get(a.stageType) ?? 999;
        const bi = idx.get(b.stageType) ?? 999;
        if (ai !== bi) return ai - bi;
        return a.startDatetime.getTime() - b.startDatetime.getTime();
      });
  }, [stage, stages, productLine]);

  if (!stage || !chain || !machine) {
    return (
      <div className="planner-inspector-empty">
        <div className="planner-inspector-empty-icon">
          <IconInbox size={20} />
        </div>
        <div className="planner-inspector-empty-title">No stage selected</div>
        <div className="planner-inspector-empty-desc">
          Click any batch bar on the timeline to inspect its details and chain path.
        </div>
      </div>
    );
  }

  const durationHrs = Math.round((stage.endDatetime.getTime() - stage.startDatetime.getTime()) / 3600000);
  const now = new Date();
  const isActive = stage.state === 'active';
  const progress = isActive
    ? Math.min(1, Math.max(0, (now.getTime() - stage.startDatetime.getTime()) / (stage.endDatetime.getTime() - stage.startDatetime.getTime())))
    : 0;
  const remainingHrs = isActive ? Math.max(0, Math.round((stage.endDatetime.getTime() - now.getTime()) / 3600000)) : null;

  const stateLabels: Record<string, string> = {
    planned: 'Scheduled',
    active: 'Running',
    completed: 'Completed',
    aborted: 'Aborted',
  };
  const stateLabel = stateLabels[stage.state] ?? stage.state;

  return (
    <div className="planner-inspector-content">
      <div className="planner-inspector-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="planner-inspector-code">
              <span>{chain.batchName}</span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>{machine.name}</span>
            </div>
            <h3 className="planner-inspector-title">
              {stageTypeDef?.name ?? stage.stageType}
            </h3>
          </div>
        </div>
        <span className={`planner-status-pill planner-status-pill--${stage.state}`}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
            background: stage.state === 'active' ? '#22c55e' : stage.state === 'completed' ? '#94a3b8' : stage.state === 'aborted' ? '#ef4444' : '#3b82f6',
            flexShrink: 0,
          }} />
          {stateLabel}
        </span>
      </div>

      {isActive && (
        <>
          <div className="planner-progress-bar">
            <div className="planner-progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="planner-progress-meta">
            <span>{Math.round(progress * 100)}% complete</span>
            {remainingHrs !== null && <span>{remainingHrs}h remaining</span>}
          </div>
        </>
      )}

      <div className="planner-meta-grid">
        <div className="planner-meta-item">
          <div className="planner-meta-label">Product Line</div>
          <div className="planner-meta-value">{productLine?.name ?? '—'}</div>
        </div>
        <div className="planner-meta-item">
          <div className="planner-meta-label">Equipment</div>
          <div className="planner-meta-value planner-meta-value--mono">{machine.name}</div>
        </div>
        <div className="planner-meta-item">
          <div className="planner-meta-label">Start</div>
          <div className="planner-meta-value">{format(stage.startDatetime, 'MMM d, HH:mm')}</div>
        </div>
        <div className="planner-meta-item">
          <div className="planner-meta-label">End</div>
          <div className="planner-meta-value">{format(stage.endDatetime, 'MMM d, HH:mm')}</div>
        </div>
        <div className="planner-meta-item">
          <div className="planner-meta-label">Duration</div>
          <div className="planner-meta-value planner-meta-value--mono">{durationHrs}h</div>
        </div>
        <div className="planner-meta-item">
          <div className="planner-meta-label">Batch</div>
          <div className="planner-meta-value planner-meta-value--mono">{chain.batchName}</div>
        </div>
      </div>

      {chainStages.length > 1 && (
        <>
          <div className="planner-chain-section-title">Chain path</div>
          <div className="planner-chain-path">
            {chainStages.map((s, i) => {
              const isDone = s.state === 'completed' || s.state === 'aborted';
              const isCurrent = s.id === stage.id;
              const sm = machines.find((m) => m.id === s.machineId);
              const std = stageTypeDefs.find((d) => d.id === s.stageType);
              return (
                <div
                  key={s.id}
                  className={`planner-chain-step${isCurrent ? ' planner-chain-step--current' : ''}${isDone ? ' planner-chain-step--done' : ''}`}
                >
                  <div className="planner-chain-step-dot">
                    {isDone ? <IconCheck size={10} /> : i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="planner-chain-step-name">{std?.name ?? s.stageType}</div>
                    <div className="planner-chain-step-machine">{sm?.name ?? s.machineId}</div>
                  </div>
                  <div className="planner-chain-step-time">
                    {format(s.startDatetime, 'MMM d')}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="planner-inspector-actions">
        <button
          className="planner-inspector-btn"
          onClick={() => onEditStage(stage.id)}
          title="View full stage details"
        >
          <IconEdit size={14} />
          Stage details
        </button>
        <button
          className="planner-inspector-btn planner-inspector-btn--primary"
          onClick={() => onEditChain(chain.id)}
          title="Edit batch chain"
        >
          <IconEdit size={14} />
          Edit chain
        </button>
      </div>
    </div>
  );
}

// ─── Today Strip ──────────────────────────────────────────────────────

function TodayStrip({
  runningCount,
  startingTodayCount,
  atRiskCount,
  maintenanceCount,
  shiftTeamName,
  shiftTeamColor,
  shiftHours,
}: {
  runningCount: number;
  startingTodayCount: number;
  atRiskCount: number;
  maintenanceCount: number;
  shiftTeamName: string;
  shiftTeamColor: string;
  shiftHours: string;
}) {
  const today = new Date();
  return (
    <div className="planner-today-strip">
      <div className="planner-today-date">
        <div className="planner-today-date-num">
          {format(today, 'MMM d')}
        </div>
        <div className="planner-today-date-label">
          {format(today, 'EEEE')} · Today
        </div>
      </div>

      <div className="planner-today-stats">
        <div className="planner-stat">
          <div className="planner-stat-label">
            <span className="planner-stat-dot planner-stat-dot--running" />
            Running now
          </div>
          <div className="planner-stat-value">
            {runningCount}
            <span className="planner-stat-unit">active</span>
          </div>
        </div>
        <div className="planner-stat">
          <div className="planner-stat-label">
            <span className="planner-stat-dot planner-stat-dot--starting" />
            Starting today
          </div>
          <div className="planner-stat-value">
            {startingTodayCount}
            <span className="planner-stat-unit">stages</span>
          </div>
        </div>
        <div className="planner-stat">
          <div className="planner-stat-label">
            <span className="planner-stat-dot planner-stat-dot--risk" />
            Needs attention
          </div>
          <div className="planner-stat-value">
            {atRiskCount}
            <span className="planner-stat-unit">conflicts</span>
          </div>
        </div>
        <div className="planner-stat">
          <div className="planner-stat-label">
            <span className="planner-stat-dot planner-stat-dot--maint" />
            Maintenance
          </div>
          <div className="planner-stat-value">
            {maintenanceCount}
            <span className="planner-stat-unit">this week</span>
          </div>
        </div>
      </div>

      <div className="planner-shift-card">
        <div className="planner-shift-card-head">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="6" cy="6" r="4.5" />
            <path d="M6 3.5V6l1.5 1" />
          </svg>
          On shift now
        </div>
        <div className="planner-shift-card-team">
          <span
            className="planner-shift-card-swatch"
            style={{ background: shiftTeamColor }}
          />
          {shiftTeamName}
        </div>
        <div className="planner-shift-card-meta">{shiftHours}</div>
      </div>
    </div>
  );
}

// ─── Page Header ──────────────────────────────────────────────────────

function PageHeader({
  machineCount,
  chainCount,
  stageCount,
  onNewChain,
  onImport,
  onCollapse,
}: {
  machineCount: number;
  chainCount: number;
  stageCount: number;
  onNewChain: () => void;
  onImport: () => void;
  onCollapse: () => void;
}) {
  return (
    <div className="planner-page-header">
      <div className="planner-page-header-left">
        <h1>Production schedule</h1>
        <p>
          {machineCount} machines · {chainCount} active chains · {stageCount} stages
        </p>
      </div>
      <div className="planner-page-header-actions">
        <button className="planner-collapse-btn" onClick={onCollapse} title="Focus on the plan">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9L3 6l3-3" />
            <path d="M9 9L6 6l3-3" />
          </svg>
          Focus plan
        </button>
        <button className="planner-header-btn" onClick={onImport} title="Import schedule">
          <IconUpload />
          Import
        </button>
        <button className="planner-header-btn planner-header-btn--primary" onClick={onNewChain} title="Create new batch chain">
          <IconPlus />
          New batch chain
        </button>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────

export default function PlannerPage() {
  const viewConfig = usePlantPulseStore((s) => s.viewConfig);
  const setViewConfig = usePlantPulseStore((s) => s.setViewConfig);
  const stages = usePlantPulseStore((s) => s.stages);
  const batchChains = usePlantPulseStore((s) => s.batchChains);
  const machines = usePlantPulseStore((s) => s.machines);
  const maintenanceTasks = usePlantPulseStore((s) => s.maintenanceTasks);
  const setStages = usePlantPulseStore((s) => s.setStages);
  const setBatchChains = usePlantPulseStore((s) => s.setBatchChains);
  const setMaintenanceTasks = usePlantPulseStore((s) => s.setMaintenanceTasks);
  const addMachine = usePlantPulseStore((s) => s.addMachine);
  const equipmentGroups = usePlantPulseStore((s) => s.equipmentGroups);
  const productLines = usePlantPulseStore((s) => s.productLines);
  const turnaroundActivities = usePlantPulseStore((s) => s.turnaroundActivities);
  const shutdownPeriods = usePlantPulseStore((s) => s.shutdownPeriods);
  const stageTypesMode = usePlantPulseStore((s) => s.stageTypesMode);
  const productLineStageTypes = usePlantPulseStore((s) => s.productLineStageTypes);
  const stageTypeDefinitions = usePlantPulseStore((s) => s.stageTypeDefinitions);
  const setMachineGroups = usePlantPulseStore((s) => s.setMachineGroups);
  const updateStage = usePlantPulseStore((s) => s.updateStage);
  const loadDemoData = usePlantPulseStore((s) => s.loadDemoData);
  const shiftRotation = usePlantPulseStore((s) => s.shiftRotation);

  // Load demo data on mount (page-level, not inside WallboardCanvas)
  useEffect(() => {
    loadDemoData();
  }, [loadDemoData]);

  // Modal / panel state
  const [equipmentSetupOpen, setEquipmentSetupOpen] = useState(false);
  const [equipmentSetupMachineId, setEquipmentSetupMachineId] = useState<string | null>(null);
  const [processSetupOpen, setProcessSetupOpen] = useState(false);
  const [processSetupInitialTab, setProcessSetupInitialTab] = useState<string | undefined>();
  const [shiftScheduleOpen, setShiftScheduleOpen] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [newChainWizardOpen, setNewChainWizardOpen] = useState(false);
  const [bulkShiftOpen, setBulkShiftOpen] = useState(false);
  const [chainEditorOpen, setChainEditorOpen] = useState(false);
  const [chainEditorChainId, setChainEditorChainId] = useState<string | null>(null);
  const [equipmentSetupFocusSection, setEquipmentSetupFocusSection] = useState<string | null>(null);
  const [stageDetailOpen, setStageDetailOpen] = useState(false);

  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'inspector' | 'tools'>('tools');

  // Page header collapse state
  const [headerCollapsed, setHeaderCollapsed] = useState(false);

  // Auto-switch to inspector tab when a stage is selected
  useEffect(() => {
    if (selectedStageId) {
      setSidebarTab('inspector');
      setSidebarCollapsed(false);
    }
  }, [selectedStageId]);

  // View mode (Day / Week / Month / Quarter)
  const [viewMode, setViewMode] = useState<ViewMode>(() => inferViewMode(viewConfig.numberOfDays));

  // On mobile, default to week for better clarity
  useEffect(() => {
    if (window.innerWidth < 768 && viewConfig.numberOfDays > 7) {
      setViewMode('week');
      setViewConfig({ numberOfDays: 7 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyViewMode(mode: ViewMode) {
    const newDays = VIEW_MODE_DAYS[mode];
    const currentDays = viewConfig.numberOfDays;
    const centerMs = viewConfig.viewStart.getTime() + (currentDays / 2) * 24 * 3600 * 1000;
    const newViewStart = new Date(centerMs - (newDays / 2) * 24 * 3600 * 1000);
    setViewConfig({ viewStart: startOfDay(newViewStart), numberOfDays: newDays });
    setViewMode(mode);
  }

  // Formatted date range for the toolbar
  const viewRangeLabel = useMemo(() => {
    const start = viewConfig.viewStart;
    const end = addDays(start, viewConfig.numberOfDays - 1);
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    const sameYear = start.getFullYear() === end.getFullYear();
    if (viewConfig.numberOfDays <= 1) {
      return format(start, 'MMM d, yyyy');
    }
    if (sameMonth) {
      return `${format(start, 'MMM d')} – ${format(end, 'd, yyyy')}`;
    }
    if (sameYear) {
      return `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
    }
    return `${format(start, 'MMM d, yy')} – ${format(end, 'MMM d, yy')}`;
  }, [viewConfig.viewStart, viewConfig.numberOfDays]);

  const viewEnd = addDays(viewConfig.viewStart, viewConfig.numberOfDays);

  // Mobile state
  const [plannerMobileOpen, setPlannerMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const plannerMobileMenuRef = useRef<HTMLDivElement>(null);
  const plannerMobileToggleRef = useRef<HTMLButtonElement>(null);

  const closePlannerMobile = useCallback(() => setPlannerMobileOpen(false), []);

  // Close planner mobile menu on outside click or Escape
  useEffect(() => {
    if (!plannerMobileOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        plannerMobileMenuRef.current && !plannerMobileMenuRef.current.contains(e.target as Node) &&
        plannerMobileToggleRef.current && !plannerMobileToggleRef.current.contains(e.target as Node)
      ) {
        setPlannerMobileOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPlannerMobileOpen(false);
        plannerMobileToggleRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [plannerMobileOpen]);

  // Close sidebar drawer on Escape (mobile)
  useEffect(() => {
    if (!sidebarOpen) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setSidebarOpen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [sidebarOpen]);

  // Import/export state
  const scheduleFileRef = useRef<HTMLInputElement>(null);
  const maintenanceFileRef = useRef<HTMLInputElement>(null);
  const [importConfirm, setImportConfirm] = useState<{
    type: 'schedule' | 'maintenance';
    chains?: import('@/lib/types').BatchChain[];
    stages?: import('@/lib/types').Stage[];
    tasks?: import('@/lib/types').MaintenanceTask[];
    warnings: string[];
    unknownMachines?: UnknownMachineInfo[];
    pendingRows?: PendingRow[];
    existingChainIds?: Map<number, string>;
  } | null>(null);

  // Machine resolution state for unknown machines during import
  const [machineResolutions, setMachineResolutions] = useState<
    Map<string, { action: 'create' | 'map' | 'skip'; group?: string; productLine?: string; mapTo?: string }>
  >(new Map());

  function shiftView(direction: number) {
    const days = VIEW_MODE_DAYS[viewMode] * direction;
    setViewConfig({
      viewStart: addDays(viewConfig.viewStart, days),
    });
  }

  function resetView() {
    const days = VIEW_MODE_DAYS[viewMode];
    const offset = Math.max(0, Math.floor(days * 0.2));
    setViewConfig({
      viewStart: subDays(startOfDay(new Date()), offset),
    });
  }

  // Machine label click → open Equipment Setup with that machine in edit mode
  const handleMachineLabelClick = useCallback((machineId: string) => {
    setEquipmentSetupMachineId(machineId);
    setEquipmentSetupFocusSection(null);
    setEquipmentSetupOpen(true);
  }, []);

  // Downtime block click → open Equipment Setup with unavailability section focused
  const handleDowntimeClick = useCallback((machineId: string, _ruleId?: string) => {
    setEquipmentSetupMachineId(machineId);
    setEquipmentSetupFocusSection('unavailability');
    setEquipmentSetupOpen(true);
  }, []);

  // Checkpoint marker click → open Equipment Setup with checkpoints section focused
  const handleCheckpointClick = useCallback((machineId: string, _defId: string) => {
    setEquipmentSetupMachineId(machineId);
    setEquipmentSetupFocusSection('checkpoints');
    setEquipmentSetupOpen(true);
  }, []);

  // Horizontal scroll — pan the timeline by scrolling or dragging the scrollbar
  const timelineRef = useRef<HTMLDivElement>(null);

  const SCROLL_RANGE_DAYS = 180;
  const SCROLL_RANGE_BEFORE = 90;
  const today = startOfDay(new Date());
  const scrollMin = subDays(today, SCROLL_RANGE_BEFORE);

  const currentOffset = differenceInDays(viewConfig.viewStart, scrollMin);
  const maxOffset = SCROLL_RANGE_DAYS - viewConfig.numberOfDays;
  const scrollFraction = Math.max(0, Math.min(1, currentOffset / maxOffset));
  const thumbWidth = Math.max(8, (viewConfig.numberOfDays / SCROLL_RANGE_DAYS) * 100);

  const handleTimelineWheel = useCallback(
    (e: React.WheelEvent) => {
      const delta = e.shiftKey ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      e.preventDefault();
      const dayShift = delta > 0 ? 1 : -1;
      setViewConfig({
        viewStart: addDays(viewConfig.viewStart, dayShift),
      });
    },
    [viewConfig.viewStart, setViewConfig]
  );

  const handleScrollbarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickFraction = (e.clientX - rect.left) / rect.width;
      const newOffset = Math.round(clickFraction * maxOffset);
      setViewConfig({
        viewStart: addDays(scrollMin, newOffset),
      });
    },
    [maxOffset, scrollMin, setViewConfig]
  );

  const [dragging, setDragging] = useState(false);
  const scrollbarRef = useRef<HTMLDivElement>(null);

  const handleThumbMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(true);
      const startX = e.clientX;
      const startOffset = currentOffset;

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!scrollbarRef.current) return;
        const trackWidth = scrollbarRef.current.getBoundingClientRect().width;
        const dx = moveEvent.clientX - startX;
        const daysDelta = Math.round((dx / trackWidth) * maxOffset);
        const newOffset = Math.max(0, Math.min(maxOffset, startOffset + daysDelta));
        setViewConfig({
          viewStart: addDays(scrollMin, newOffset),
        });
      };

      const onMouseUp = () => {
        setDragging(false);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [currentOffset, maxOffset, scrollMin, setViewConfig]
  );

  // ── Import/Export handlers ──────────────────────────────────────────

  const handleImportSchedule = useCallback(() => {
    scheduleFileRef.current?.click();
  }, []);

  const handleScheduleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      const buffer = await file.arrayBuffer();
      const result = parseScheduleXlsx(buffer, machines);
      setImportConfirm({
        type: 'schedule',
        chains: result.chains,
        stages: result.stages,
        warnings: result.warnings,
        unknownMachines: result.unknownMachines,
        pendingRows: result.pendingRows,
        existingChainIds: result.existingChainIds,
      });
      if (result.unknownMachines.length > 0) {
        const initial = new Map<string, { action: 'create' | 'map' | 'skip'; group?: string; mapTo?: string }>();
        for (const um of result.unknownMachines) {
          initial.set(um.name.toLowerCase(), {
            action: 'create',
            group: um.suggestedGroup ?? equipmentGroups[0]?.id ?? 'fermenter',
          });
        }
        setMachineResolutions(initial);
      } else {
        setMachineResolutions(new Map());
      }
    },
    [machines, equipmentGroups]
  );

  const handleExportSchedule = useCallback(() => {
    const buffer = exportScheduleXlsx(stages, batchChains, machines);
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    downloadXlsx(buffer, `PlantPulse_Schedule_${dateStr}.xlsx`);
  }, [stages, batchChains, machines]);

  const handleImportMaintenance = useCallback(() => {
    maintenanceFileRef.current?.click();
  }, []);

  const handleMaintenanceFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      const buffer = await file.arrayBuffer();
      const result = parseMaintenanceXlsx(buffer, machines);
      setImportConfirm({
        type: 'maintenance',
        tasks: result.tasks,
        warnings: result.warnings,
      });
    },
    [machines]
  );

  const handleExportMaintenance = useCallback(() => {
    const buffer = exportMaintenanceXlsx(maintenanceTasks, machines);
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    downloadXlsx(buffer, `PlantPulse_Maintenance_${dateStr}.xlsx`);
  }, [maintenanceTasks, machines]);

  const handleStageDragEnd = useCallback(
    (stageId: string, newStart: Date, newEnd: Date) => {
      const targetStage = stages.find((s) => s.id === stageId);
      if (!targetStage) return;
      const chain = batchChains.find((c) => c.id === targetStage.batchChainId);
      const productLine = productLines.find((p) => p.id === chain?.productLine);
      const stageOrderIds = orderedChainStageIds(targetStage.batchChainId, stages, productLine?.stageDefaults ?? []);
      const durations = new Map(stages.map((s) => [s.id, s.endDatetime.getTime() - s.startDatetime.getTime()]));

      let draftStages = stages.map((s) => (s.id === stageId ? { ...s, startDatetime: newStart, endDatetime: newEnd } : s));
      if (chain?.linkToNext) {
        const movedIdx = stageOrderIds.indexOf(stageId);
        if (movedIdx > 0) {
          const prev = draftStages.find((s) => s.id === stageOrderIds[movedIdx - 1]);
          const moved = draftStages.find((s) => s.id === stageId);
          if (prev && moved) {
            moved.startDatetime = new Date(prev.endDatetime);
            moved.endDatetime = new Date(moved.startDatetime.getTime() + (durations.get(stageId) ?? 0));
          }
        }
        for (let i = Math.max(1, stageOrderIds.indexOf(stageId) + 1); i < stageOrderIds.length; i++) {
          const prev = draftStages.find((s) => s.id === stageOrderIds[i - 1]);
          const cur = draftStages.find((s) => s.id === stageOrderIds[i]);
          if (prev && cur) {
            cur.startDatetime = new Date(prev.endDatetime);
            cur.endDatetime = new Date(cur.startDatetime.getTime() + (durations.get(cur.id) ?? 0));
          }
        }
      }
      const stageTypeDefinitionsByProductLine = Object.fromEntries(
        productLines.map((p) => [p.id, stageTypesMode === 'per_product_line' ? (productLineStageTypes[p.id] ?? stageTypeDefinitions) : stageTypeDefinitions])
      );
      const validation = validateSchedule({
        stages: draftStages,
        batchChains,
        machines,
        stageDefaultsByProductLine: Object.fromEntries(productLines.map((p) => [p.id, p.stageDefaults])),
        stageTypeDefinitionsByProductLine,
        turnaroundActivities,
        shutdownPeriods,
      });
      if (!validation.valid) {
        const first = validation.issues[0];
        window.alert(`Cannot apply stage move: ${first?.message ?? 'Schedule validation failed.'}`);
        return;
      }
      for (const s of draftStages) {
        const original = stages.find((x) => x.id === s.id);
        if (!original) continue;
        if (original.startDatetime.getTime() !== s.startDatetime.getTime() || original.endDatetime.getTime() !== s.endDatetime.getTime()) {
          updateStage(s.id, { startDatetime: s.startDatetime, endDatetime: s.endDatetime });
        }
      }
    },
    [updateStage, stages, batchChains, machines, productLines, turnaroundActivities, shutdownPeriods, stageTypesMode, productLineStageTypes, stageTypeDefinitions]
  );

  const liveValidation = useMemo(() => {
    const stageTypeDefinitionsByProductLine = Object.fromEntries(
      productLines.map((p) => [p.id, stageTypesMode === 'per_product_line' ? (productLineStageTypes[p.id] ?? stageTypeDefinitions) : stageTypeDefinitions])
    );
    return validateSchedule({
      stages,
      batchChains,
      machines,
      stageDefaultsByProductLine: Object.fromEntries(productLines.map((p) => [p.id, p.stageDefaults])),
      stageTypeDefinitionsByProductLine,
      turnaroundActivities,
      shutdownPeriods,
    });
  }, [stages, batchChains, machines, productLines, turnaroundActivities, shutdownPeriods, stageTypesMode, productLineStageTypes, stageTypeDefinitions]);

  // ── Today Strip stats ──────────────────────────────────────────────
  const todayStats = useMemo(() => {
    const now = new Date();
    const weekEnd = addDays(now, 7);
    return {
      running: stages.filter((s) => s.state === 'active').length,
      startingToday: stages.filter((s) => isToday(s.startDatetime) && s.state === 'planned').length,
      atRisk: liveValidation.issues.length,
      maintenance: maintenanceTasks.filter((mt) => {
        const start = mt.plannedStart instanceof Date ? mt.plannedStart : new Date(mt.plannedStart);
        return isFuture(start) && start <= weekEnd;
      }).length,
    };
  }, [stages, maintenanceTasks, liveValidation.issues.length]);

  // Current shift info
  const shiftInfo = useMemo(() => {
    const now = new Date();
    const teamIdx = currentShiftTeam(
      now,
      shiftRotation.anchorDate,
      shiftRotation.cyclePattern,
      shiftRotation.shiftLengthHours
    );
    const team = shiftRotation.teams[teamIdx];
    const shiftLengthHrs = shiftRotation.shiftLengthHours;
    // Compute shift start and end
    const hoursSinceAnchor = Math.floor((now.getTime() - shiftRotation.anchorDate.getTime()) / 3600000);
    const shiftIdx = Math.floor(hoursSinceAnchor / shiftLengthHrs);
    const shiftStartMs = shiftRotation.anchorDate.getTime() + shiftIdx * shiftLengthHrs * 3600000;
    const shiftEndMs = shiftStartMs + shiftLengthHrs * 3600000;
    const shiftStart = new Date(shiftStartMs);
    const shiftEnd = new Date(shiftEndMs);
    return {
      teamName: team?.name ?? `Team ${teamIdx + 1}`,
      teamColor: team?.color ?? '#3b82f6',
      shiftHours: `${format(shiftStart, 'HH:mm')} – ${format(shiftEnd, 'HH:mm')}`,
    };
  }, [shiftRotation]);

  const handleImportConfirm = useCallback(() => {
    if (!importConfirm) return;
    if (importConfirm.type === 'schedule' && importConfirm.chains && importConfirm.stages) {
      let finalChains = [...importConfirm.chains];
      let finalStages = [...importConfirm.stages];

      const unknowns = importConfirm.unknownMachines ?? [];
      const pending = importConfirm.pendingRows ?? [];
      if (unknowns.length > 0 && pending.length > 0) {
        const resolver = new Map<string, import('@/lib/types').Machine>();
        const currentMachines = usePlantPulseStore.getState().machines;
        let maxOrder = Math.max(0, ...currentMachines.map((m) => m.displayOrder));

        for (const um of unknowns) {
          const key = um.name.toLowerCase();
          const res = machineResolutions.get(key);
          if (!res || res.action === 'skip') continue;

          if (res.action === 'create') {
            const newMachine: import('@/lib/types').Machine = {
              id: generateId('m-'),
              name: um.name,
              group: res.group ?? 'fermenter',
              productLine: res.productLine || undefined,
              displayOrder: maxOrder + 10,
            };
            maxOrder = newMachine.displayOrder;
            addMachine(newMachine);
            resolver.set(key, newMachine);
          } else if (res.action === 'map' && res.mapTo) {
            const target = currentMachines.find((m) => m.id === res.mapTo);
            if (target) resolver.set(key, target);
          }
        }

        if (resolver.size > 0) {
          const { newChains, newStages } = resolveAndBuildStages(
            pending,
            resolver,
            importConfirm.existingChainIds ?? new Map(),
            inferStageTypeFromMachine,
          );
          finalChains = [...finalChains, ...newChains];
          finalStages = [...finalStages, ...newStages];
        }

        const updatedMachines = usePlantPulseStore.getState().machines;
        const derivedGroups = [...productLines]
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((pl) => ({
            id: pl.id,
            name: pl.name,
            machineIds: updatedMachines
              .filter((m) => m.productLine === pl.id)
              .sort((a, b) => {
                const egA = equipmentGroups.find(eg => eg.id === a.group)?.displayOrder ?? 999;
                const egB = equipmentGroups.find(eg => eg.id === b.group)?.displayOrder ?? 999;
                if (egA !== egB) return egA - egB;
                return a.displayOrder - b.displayOrder;
              })
              .map((m) => m.id),
          }))
          .filter((g) => g.machineIds.length > 0);
        setMachineGroups(derivedGroups);
      }

      setBatchChains(finalChains);
      setStages(finalStages);
    } else if (importConfirm.type === 'maintenance' && importConfirm.tasks) {
      setMaintenanceTasks(importConfirm.tasks);
    }
    setImportConfirm(null);
    setMachineResolutions(new Map());
  }, [importConfirm, machineResolutions, setBatchChains, setStages, setMaintenanceTasks, addMachine, productLines, equipmentGroups, setMachineGroups]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Navigation />

      {/* Page Header (collapsible) */}
      {!headerCollapsed && (
        <PageHeader
          machineCount={machines.length}
          chainCount={batchChains.length}
          stageCount={stages.length}
          onNewChain={() => setNewChainWizardOpen(true)}
          onImport={handleImportSchedule}
          onCollapse={() => setHeaderCollapsed(true)}
        />
      )}

      {/* Today Strip (collapsible with header) */}
      {!headerCollapsed && (
        <TodayStrip
          runningCount={todayStats.running}
          startingTodayCount={todayStats.startingToday}
          atRiskCount={todayStats.atRisk}
          maintenanceCount={todayStats.maintenance}
          shiftTeamName={shiftInfo.teamName}
          shiftTeamColor={shiftInfo.teamColor}
          shiftHours={shiftInfo.shiftHours}
        />
      )}

      {/* Toolbar */}
      <div className="bg-white border-b border-[var(--pp-border)] shrink-0 relative">
        {/* Desktop toolbar (>= 768px) */}
        <div className="h-10 hidden md:flex items-center px-4 gap-4 text-sm">

          {/* Expand header button when collapsed */}
          {headerCollapsed && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs text-[var(--pp-muted)] hover:text-[var(--pp-pharma)] border border-[var(--pp-border)] rounded px-2 py-1 bg-white"
              onClick={() => setHeaderCollapsed(false)}
              title="Show header and stats"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3L9 6l-3 3" />
                <path d="M3 3L6 6l-3 3" />
              </svg>
              Stats
            </button>
          )}

          {/* View mode segmented control */}
          <div className="planner-viewmode-bar" role="radiogroup" aria-label="View time range">
            {VIEW_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={viewMode === m.key}
                className={`planner-viewmode-btn${viewMode === m.key ? ' planner-viewmode-btn--active' : ''}`}
                onClick={() => applyViewMode(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Date range navigation */}
          <div className="planner-timenav">
            <button
              type="button"
              className="planner-timenav-arrow"
              onClick={() => shiftView(-1)}
              aria-label="Previous period"
              title="Previous period"
            >
              &lsaquo;
            </button>
            <span className="planner-timenav-range">{viewRangeLabel}</span>
            <button
              type="button"
              className="planner-timenav-arrow"
              onClick={() => shiftView(1)}
              aria-label="Next period"
              title="Next period"
            >
              &rsaquo;
            </button>
          </div>

          <button
            type="button"
            className="planner-timenav-today"
            onClick={resetView}
          >
            Today
          </button>

          <div className="flex-1" />

          {/* Live conflict indicator */}
          {!liveValidation.valid && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 1L1 11h10L6 1zm0 2l3.5 7h-7L6 3zm0 2.5v2h-1v-2h1zm0 3v1H5v-1h1z"/></svg>
              {liveValidation.issues.length} conflict{liveValidation.issues.length !== 1 ? 's' : ''}
            </span>
          )}

          <span className="text-xs text-[var(--pp-muted)]">
            {batchChains.length} chains &middot; {stages.length} stages
          </span>

          {/* Sidebar collapse toggle */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="inline-flex items-center justify-center rounded border border-[var(--pp-border)] p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {sidebarCollapsed ? (
                <>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                  <polyline points="14 9 17 12 14 15" />
                </>
              ) : (
                <>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="15" y1="3" x2="15" y2="21" />
                  <polyline points="10 9 7 12 10 15" />
                </>
              )}
            </svg>
          </button>
        </div>

        {/* Mobile toolbar (< 768px) */}
        <div className="h-10 flex md:hidden items-center px-4 gap-3 text-sm">
          <button
            ref={plannerMobileToggleRef}
            type="button"
            className="inline-flex items-center gap-1.5 rounded border border-[var(--pp-border)] px-3 py-1.5 text-sm font-medium text-[var(--pp-pharma)] hover:bg-slate-50"
            onClick={() => setPlannerMobileOpen((v) => !v)}
            aria-label="Toggle planner controls"
            aria-expanded={plannerMobileOpen}
            aria-controls="planner-mobile-panel"
          >
            <span aria-hidden="true" className="text-base leading-none">&#9776;</span>
            Controls
          </button>

          <div className="planner-timenav" style={{ gap: '2px' }}>
            <button type="button" className="planner-timenav-arrow" onClick={() => shiftView(-1)} aria-label="Previous period">&lsaquo;</button>
            <span className="planner-timenav-range" style={{ fontSize: '12px', minWidth: 'auto' }}>{viewRangeLabel}</span>
            <button type="button" className="planner-timenav-arrow" onClick={() => shiftView(1)} aria-label="Next period">&rsaquo;</button>
          </div>

          <div className="flex-1" />
          <button type="button" className="planner-timenav-today" onClick={resetView}>Today</button>
        </div>

        {/* Mobile dropdown panel */}
        {plannerMobileOpen && (
          <div
            id="planner-mobile-panel"
            ref={plannerMobileMenuRef}
            className="planner-mobile-panel md:hidden"
            role="region"
            aria-label="Planner controls"
          >
            <div className="planner-mobile-section">
              <div className="text-xs font-medium text-[var(--pp-muted)] uppercase tracking-wide mb-2">View Range</div>
              <div className="flex items-center gap-2">
                {VIEW_MODES.map((m) => (
                  <button
                    key={m.key}
                    className={`planner-mobile-btn flex-1${viewMode === m.key ? ' font-bold' : ''}`}
                    style={viewMode === m.key ? { background: 'var(--pp-text, #1a202c)', color: '#fff', borderColor: 'var(--pp-text, #1a202c)' } : undefined}
                    onClick={() => { applyViewMode(m.key); closePlannerMobile(); }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="planner-mobile-section">
              <div className="text-xs font-medium text-[var(--pp-muted)] uppercase tracking-wide mb-2">Navigate</div>
              <div className="flex items-center gap-2">
                <button className="planner-mobile-btn flex-1" onClick={() => { shiftView(-1); closePlannerMobile(); }}>&lsaquo; Prev</button>
                <button className="planner-mobile-btn flex-1 font-medium" onClick={() => { resetView(); closePlannerMobile(); }}>Today</button>
                <button className="planner-mobile-btn flex-1" onClick={() => { shiftView(1); closePlannerMobile(); }}>Next &rsaquo;</button>
              </div>
            </div>
            <div className="planner-mobile-section border-b-0 pb-0">
              <div className="text-xs font-medium text-[var(--pp-muted)] uppercase tracking-wide mb-2">Stats</div>
              <span className="text-sm text-[var(--pp-muted)]">
                {batchChains.length} chains &middot; {stages.length} stages
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main content: timeline + sidebar */}
      <div className="flex-1 min-h-0 flex relative">
        {/* Timeline + horizontal scrollbar */}
        <div className="flex-1 min-w-0 flex flex-col" ref={timelineRef}>
          <div
            className="flex-1 min-h-0"
            onWheel={handleTimelineWheel}
          >
            <WallboardCanvas
              onStageClick={(id) => setSelectedStageId(id)}
              onMachineLabelClick={handleMachineLabelClick}
              onShiftBandClick={() => setShiftScheduleOpen(true)}
              showDowntime={true}
              onDowntimeClick={handleDowntimeClick}
              enableDragResize={true}
              enableBackgroundPan={true}
              onStageDragEnd={handleStageDragEnd}
              showShutdownCrossing={true}
              showHoldRisk={true}
              showCheckpoints={true}
              onCheckpointClick={handleCheckpointClick}
            />
          </div>
          {/* Horizontal scrollbar */}
          <div
            ref={scrollbarRef}
            className="planner-hscroll-track"
            onClick={handleScrollbarClick}
          >
            <div
              className={`planner-hscroll-thumb${dragging ? ' planner-hscroll-thumb-active' : ''}`}
              style={{
                left: `${scrollFraction * (100 - thumbWidth)}%`,
                width: `${thumbWidth}%`,
              }}
              onMouseDown={handleThumbMouseDown}
            />
          </div>
        </div>

        {/* Sidebar backdrop (mobile only) */}
        {sidebarOpen && <div className="planner-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

        {/* Show-tab when sidebar is collapsed */}
        {sidebarCollapsed && (
          <button
            className="planner-sidebar-show-tab"
            onClick={() => setSidebarCollapsed(false)}
            title="Show sidebar"
          >
            <IconChevronLeft size={14} />
            <span>Inspector</span>
          </button>
        )}

        {/* Planning sidebar */}
        <div className={`planner-sidebar${sidebarOpen ? ' planner-sidebar-open' : ''}${sidebarCollapsed ? ' planner-sidebar-collapsed' : ''}`}>

          {/* Sidebar tabs */}
          <div className="planner-sidebar-tabs">
            <button
              className={`planner-sidebar-tab${sidebarTab === 'inspector' ? ' planner-sidebar-tab--active' : ''}`}
              onClick={() => setSidebarTab('inspector')}
            >
              Inspector
              {selectedStageId && <span className="planner-sidebar-tab-count">· selected</span>}
            </button>
            <button
              className={`planner-sidebar-tab${sidebarTab === 'tools' ? ' planner-sidebar-tab--active' : ''}`}
              onClick={() => setSidebarTab('tools')}
            >
              Planning Tools
            </button>
            <button
              className="planner-sidebar-hide"
              onClick={() => setSidebarCollapsed(true)}
              title="Hide sidebar"
              aria-label="Hide sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 3L9 7l-4 4" />
              </svg>
            </button>
          </div>

          {/* Tab content */}
          {sidebarTab === 'inspector' ? (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <StageInspector
                stageId={selectedStageId}
                onEditChain={(chainId) => {
                  setChainEditorChainId(chainId);
                  setChainEditorOpen(true);
                }}
                onEditStage={(stageId) => {
                  setSelectedStageId(stageId);
                  setStageDetailOpen(true);
                }}
              />
            </div>
          ) : (
            <>
              <div className="planner-sidebar-scroll">
                {/* ── Batch Operations ─────────────────────────── */}
                <SidebarSection title="Batch Operations">
                  <ToolButton
                    icon={<IconPlus />}
                    label="New Batch Chain"
                    description="Auto-schedule with seed train wizard"
                    onClick={() => setNewChainWizardOpen(true)}
                  />
                  <ToolButton
                    icon={<IconBulkShift />}
                    label="Bulk Shift"
                    description="Shift batches by hours after cutoff"
                    onClick={() => setBulkShiftOpen(true)}
                  />
                </SidebarSection>

                {/* ── Schedule Data ─────────────────────────────── */}
                <SidebarSection title="Schedule Data">
                  <ToolButton
                    icon={<IconUpload />}
                    label="Import Schedule"
                    description="Load schedule from .xlsx file"
                    onClick={handleImportSchedule}
                  />
                  <ToolButton
                    icon={<IconDownload />}
                    label="Export Schedule"
                    description="Download schedule as .xlsx"
                    onClick={handleExportSchedule}
                  />
                  <ToolButton
                    icon={<IconUpload />}
                    label="Import Maintenance"
                    description="Load maintenance tasks from .xlsx"
                    onClick={handleImportMaintenance}
                    badge="MT"
                  />
                  <ToolButton
                    icon={<IconDownload />}
                    label="Export Maintenance"
                    description="Download maintenance tasks as .xlsx"
                    onClick={handleExportMaintenance}
                    badge="MT"
                  />
                </SidebarSection>

                {/* ── Setup ─────────────────────────────────────── */}
                <SidebarSection title="Setup">
                  <ToolButton
                    icon={<IconEquipment />}
                    label="Equipment Setup"
                    description="Names, groups, product line assignments"
                    onClick={() => setEquipmentSetupOpen(true)}
                  />
                  <ToolButton
                    icon={<IconProcess />}
                    label="Process Setup"
                    description="Stage defaults, CIP/turnaround, shutdown and holiday rules"
                    onClick={() => setProcessSetupOpen(true)}
                  />
                  <ToolButton
                    icon={<IconShift />}
                    label="Shift Schedule"
                    description="Teams, rotation pattern, shift bar colors"
                    onClick={() => setShiftScheduleOpen(true)}
                  />
                </SidebarSection>

                {/* ── Capacity Utilization ──────────────────────── */}
                <SidebarSection title="Capacity Utilization" defaultOpen={false}>
                  <CapacityPanel
                    viewStart={viewConfig.viewStart}
                    viewEnd={viewEnd}
                    machines={machines}
                    equipmentGroups={equipmentGroups}
                    stages={stages}
                    shutdownPeriods={shutdownPeriods}
                  />
                </SidebarSection>
              </div>

              {/* Footer help text */}
              <div className="planner-sidebar-footer">
                <p>
                  Click a batch bar on the timeline to inspect its details in the Inspector tab.
                  Setup menus configure your facility, processes, and shift patterns.
                </p>
              </div>
            </>
          )}

          {/* Close button (mobile only) */}
          <button
            type="button"
            className="planner-sidebar-close md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            style={{ position: 'absolute', top: 12, right: 12 }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Mobile FAB to open sidebar */}
      <button
        type="button"
        className="planner-fab"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open Planning Tools"
        title="Planning Tools"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      </button>

      {/* Modals */}
      <EquipmentSetup
        open={equipmentSetupOpen}
        onClose={() => { setEquipmentSetupOpen(false); setEquipmentSetupMachineId(null); setEquipmentSetupFocusSection(null); }}
        initialEditMachineId={equipmentSetupMachineId}
        initialFocusSection={equipmentSetupFocusSection}
      />
      <ProcessSetup
        open={processSetupOpen}
        onClose={() => { setProcessSetupOpen(false); setProcessSetupInitialTab(undefined); }}
        initialTab={processSetupInitialTab as any}
      />
      <ShiftSchedule
        open={shiftScheduleOpen}
        onClose={() => setShiftScheduleOpen(false)}
      />
      <StageDetailPanel
        stageId={stageDetailOpen ? selectedStageId : null}
        onClose={() => { setStageDetailOpen(false); }}
        onEditChain={(chainId) => {
          setStageDetailOpen(false);
          setChainEditorChainId(chainId);
          setChainEditorOpen(true);
        }}
      />
      <ChainEditor
        open={chainEditorOpen}
        batchChainId={chainEditorChainId}
        onClose={() => { setChainEditorOpen(false); setChainEditorChainId(null); }}
      />
      <NewChainWizard
        open={newChainWizardOpen}
        onClose={() => setNewChainWizardOpen(false)}
        onOpenProcessSetup={() => {
          setNewChainWizardOpen(false);
          setProcessSetupInitialTab('stages');
          setProcessSetupOpen(true);
        }}
      />
      <BulkShiftTool
        open={bulkShiftOpen}
        onClose={() => setBulkShiftOpen(false)}
      />

      {/* Hidden file inputs for import */}
      <input
        ref={scheduleFileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleScheduleFileChange}
      />
      <input
        ref={maintenanceFileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleMaintenanceFileChange}
      />

      {/* Import confirmation modal */}
      {importConfirm && (
        <div className="pp-modal-backdrop" onClick={() => setImportConfirm(null)}>
          <div className="pp-modal" onClick={e => e.stopPropagation()}>
            <div className="pp-modal-header">
              <h3>Import {importConfirm.type === 'schedule' ? 'Schedule' : 'Maintenance'}</h3>
              <button className="pp-modal-close" onClick={() => setImportConfirm(null)}>✕</button>
            </div>
            <div className="pp-modal-body" style={{ padding: '16px 20px' }}>
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--pp-text)' }}>
                {importConfirm.type === 'schedule'
                  ? `Found ${importConfirm.chains?.length ?? 0} batch chains with ${importConfirm.stages?.length ?? 0} stages.`
                  : `Found ${importConfirm.tasks?.length ?? 0} maintenance tasks.`}
                {importConfirm.type === 'schedule' && (importConfirm.pendingRows?.length ?? 0) > 0 && (
                  <span style={{ color: '#8a6500' }}>
                    {' '}+ {importConfirm.pendingRows!.length} stages pending machine resolution.
                  </span>
                )}
              </p>
              {importConfirm.type === 'schedule' && ((importConfirm.chains?.length ?? 0) > 0 || (importConfirm.pendingRows?.length ?? 0) > 0) && (
                <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--pp-muted)' }}>
                  This will replace the current schedule data.
                </p>
              )}

              {/* Unknown machines resolution UI */}
              {importConfirm.type === 'schedule' && (importConfirm.unknownMachines?.length ?? 0) > 0 && (
                <div className="pp-import-resolve">
                  <div className="pp-import-resolve-header">
                    <span>&#9888;</span>
                    <span>{importConfirm.unknownMachines!.length} unknown machine{importConfirm.unknownMachines!.length > 1 ? 's' : ''} — resolve below to include</span>
                  </div>

                  {importConfirm.unknownMachines!.map((um) => {
                    const key = um.name.toLowerCase();
                    const res = machineResolutions.get(key) ?? { action: 'create' as const };
                    const similarMachine = um.similarExisting ? machines.find((m) => m.id === um.similarExisting) : undefined;

                    return (
                      <div key={key} className="pp-import-resolve-card">
                        <div className="pp-import-resolve-card-name">
                          {um.name}
                          <span className="pp-import-resolve-card-rows">
                            ({um.rowNumbers.length} row{um.rowNumbers.length > 1 ? 's' : ''})
                          </span>
                        </div>

                        <div className="pp-import-resolve-actions">
                          <label>
                            <input
                              type="radio"
                              name={`resolve-${key}`}
                              checked={res.action === 'create'}
                              onChange={() => setMachineResolutions((prev) => {
                                const next = new Map(prev);
                                next.set(key, { action: 'create', group: res.group ?? um.suggestedGroup ?? equipmentGroups[0]?.id });
                                return next;
                              })}
                            />
                            Create
                          </label>
                          <label>
                            <input
                              type="radio"
                              name={`resolve-${key}`}
                              checked={res.action === 'map'}
                              onChange={() => setMachineResolutions((prev) => {
                                const next = new Map(prev);
                                next.set(key, { action: 'map', mapTo: um.similarExisting ?? machines[0]?.id });
                                return next;
                              })}
                            />
                            Map to existing
                          </label>
                          <label>
                            <input
                              type="radio"
                              name={`resolve-${key}`}
                              checked={res.action === 'skip'}
                              onChange={() => setMachineResolutions((prev) => {
                                const next = new Map(prev);
                                next.set(key, { action: 'skip' });
                                return next;
                              })}
                            />
                            Skip
                          </label>
                        </div>

                        {res.action === 'create' && (
                          <div className="pp-import-resolve-detail">
                            <span>Group:</span>
                            <select
                              value={res.group ?? ''}
                              onChange={(ev) => setMachineResolutions((prev) => {
                                const next = new Map(prev);
                                next.set(key, { ...res, group: ev.target.value });
                                return next;
                              })}
                            >
                              {equipmentGroups.map((eg) => (
                                <option key={eg.id} value={eg.id}>{eg.name}</option>
                              ))}
                            </select>
                            <span>Product Line:</span>
                            <select
                              value={res.productLine ?? ''}
                              onChange={(ev) => setMachineResolutions((prev) => {
                                const next = new Map(prev);
                                next.set(key, { ...res, productLine: ev.target.value || undefined });
                                return next;
                              })}
                            >
                              <option value="">None</option>
                              {productLines
                                .slice()
                                .sort((a, b) => a.displayOrder - b.displayOrder)
                                .map((pl) => (
                                  <option key={pl.id} value={pl.id}>{pl.name}</option>
                                ))}
                            </select>
                          </div>
                        )}

                        {res.action === 'map' && (
                          <div className="pp-import-resolve-detail">
                            <span>Target:</span>
                            <select
                              value={res.mapTo ?? ''}
                              onChange={(ev) => setMachineResolutions((prev) => {
                                const next = new Map(prev);
                                next.set(key, { ...res, mapTo: ev.target.value });
                                return next;
                              })}
                            >
                              {machines.map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                            {similarMachine && (
                              <span className="pp-import-resolve-hint">Similar: {similarMachine.name}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Bulk action: if 2+ unknowns share a prefix */}
                  {(() => {
                    const unknowns = importConfirm.unknownMachines!;
                    if (unknowns.length < 2) return null;
                    const prefixCounts = new Map<string, number>();
                    for (const um of unknowns) {
                      const p = um.namePrefix ?? um.name;
                      prefixCounts.set(p, (prefixCounts.get(p) ?? 0) + 1);
                    }
                    const [commonPrefix, count] = [...prefixCounts.entries()].sort((a, b) => b[1] - a[1])[0];
                    if (count < 2) return null;
                    const sugGroup = unknowns.find((um) => (um.namePrefix ?? um.name) === commonPrefix)?.suggestedGroup;
                    const groupName = equipmentGroups.find((eg) => eg.id === sugGroup)?.name ?? equipmentGroups[0]?.name ?? 'Fermenter';
                    const groupId = sugGroup ?? equipmentGroups[0]?.id ?? 'fermenter';

                    return (
                      <div className="pp-import-resolve-bulk">
                        <button
                          onClick={() => setMachineResolutions((prev) => {
                            const next = new Map(prev);
                            for (const um of unknowns) {
                              if ((um.namePrefix ?? um.name) === commonPrefix) {
                                next.set(um.name.toLowerCase(), { action: 'create', group: groupId });
                              }
                            }
                            return next;
                          })}
                        >
                          Create all {count} &quot;{commonPrefix}&quot; machines as {groupName}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}

              {importConfirm.warnings.length > 0 && (
                <div style={{ margin: '0 0 12px', padding: '8px 10px', background: '#fef3cd', border: '1px solid #ffc107', borderRadius: '4px', fontSize: '12px', maxHeight: '120px', overflowY: 'auto' }}>
                  <strong>Warnings ({importConfirm.warnings.length}):</strong>
                  {importConfirm.warnings.map((w, i) => (
                    <div key={i} style={{ marginTop: '4px' }}>{w}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="pp-modal-footer">
              <button className="pp-modal-btn" onClick={() => { setImportConfirm(null); setMachineResolutions(new Map()); }}>Cancel</button>
              <button
                className="pp-modal-btn pp-modal-btn-primary"
                onClick={handleImportConfirm}
                disabled={
                  importConfirm.type === 'schedule'
                    ? (importConfirm.chains?.length ?? 0) === 0 && (importConfirm.pendingRows?.length ?? 0) === 0
                    : (importConfirm.tasks?.length ?? 0) === 0
                }
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
