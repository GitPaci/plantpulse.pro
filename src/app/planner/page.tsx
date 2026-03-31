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
import { subDays, addDays, startOfDay, differenceInDays, format } from 'date-fns';
import { useState, useCallback, useRef, useEffect } from 'react';

const ZOOM_LEVELS = [5, 7, 10, 14, 21, 30];
const ZOOM_DEFAULT_DESKTOP = 4; // 21d
const ZOOM_DEFAULT_MOBILE = 2;  // 10d

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
  const setMachineGroups = usePlantPulseStore((s) => s.setMachineGroups);
  const updateStage = usePlantPulseStore((s) => s.updateStage);
  const loadDemoData = usePlantPulseStore((s) => s.loadDemoData);

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

  // Sidebar visibility
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Zoom controls
  const [zoomIdx, setZoomIdx] = useState(() => {
    const idx = ZOOM_LEVELS.indexOf(viewConfig.numberOfDays);
    return idx !== -1 ? idx : ZOOM_DEFAULT_DESKTOP;
  });

  // On mobile, default to 10d for better clarity
  useEffect(() => {
    if (window.innerWidth < 768) {
      setZoomIdx(ZOOM_DEFAULT_MOBILE);
      setViewConfig({ numberOfDays: ZOOM_LEVELS[ZOOM_DEFAULT_MOBILE] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyZoom(newIdx: number) {
    const newDays = ZOOM_LEVELS[newIdx];
    const currentDays = viewConfig.numberOfDays;
    const centerMs = viewConfig.viewStart.getTime() + (currentDays / 2) * 24 * 3600 * 1000;
    const newViewStart = new Date(centerMs - (newDays / 2) * 24 * 3600 * 1000);
    setViewConfig({ viewStart: newViewStart, numberOfDays: newDays });
    setZoomIdx(newIdx);
  }

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

  function shiftView(days: number) {
    setViewConfig({
      viewStart: addDays(viewConfig.viewStart, days),
    });
  }

  function resetView() {
    setViewConfig({
      viewStart: subDays(startOfDay(new Date()), 4),
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

  // Total scrollable range: 90 days before today to 90 days after = ~180 days
  const SCROLL_RANGE_DAYS = 180;
  const SCROLL_RANGE_BEFORE = 90;
  const today = startOfDay(new Date());
  const scrollMin = subDays(today, SCROLL_RANGE_BEFORE);

  // Current position as fraction (0..1) of the scroll range
  const currentOffset = differenceInDays(viewConfig.viewStart, scrollMin);
  const maxOffset = SCROLL_RANGE_DAYS - viewConfig.numberOfDays;
  const scrollFraction = Math.max(0, Math.min(1, currentOffset / maxOffset));
  const thumbWidth = Math.max(8, (viewConfig.numberOfDays / SCROLL_RANGE_DAYS) * 100);

  const handleTimelineWheel = useCallback(
    (e: React.WheelEvent) => {
      // Shift + wheel or horizontal wheel → pan timeline
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

  // Drag state for scrollbar thumb
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
      e.target.value = ''; // reset so same file can be re-selected
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
      // Initialize resolutions: default to "create" with suggested group
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
      updateStage(stageId, { startDatetime: newStart, endDatetime: newEnd });
    },
    [updateStage]
  );

  const handleImportConfirm = useCallback(() => {
    if (!importConfirm) return;
    if (importConfirm.type === 'schedule' && importConfirm.chains && importConfirm.stages) {
      let finalChains = [...importConfirm.chains];
      let finalStages = [...importConfirm.stages];

      // Resolve unknown machines if any
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

        // Re-derive display groups with new machines
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

      {/* Toolbar */}
      <div className="bg-white border-b border-[var(--pp-border)] shrink-0 relative">
        {/* Desktop toolbar (>= 768px) */}
        <div className="h-10 hidden md:flex items-center px-4 gap-4 text-sm">
          <button
            onClick={() => shiftView(-7)}
            className="px-2 py-0.5 border border-[var(--pp-border)] rounded text-xs hover:bg-gray-50"
          >
            &laquo; 7d
          </button>
          <button
            onClick={() => shiftView(-1)}
            className="px-2 py-0.5 border border-[var(--pp-border)] rounded text-xs hover:bg-gray-50"
          >
            &lsaquo; 1d
          </button>
          <button
            onClick={resetView}
            className="px-3 py-0.5 border border-[var(--pp-border)] rounded text-xs hover:bg-gray-50 font-medium"
          >
            Today
          </button>
          <button
            onClick={() => shiftView(1)}
            className="px-2 py-0.5 border border-[var(--pp-border)] rounded text-xs hover:bg-gray-50"
          >
            1d &rsaquo;
          </button>
          <button
            onClick={() => shiftView(7)}
            className="px-2 py-0.5 border border-[var(--pp-border)] rounded text-xs hover:bg-gray-50"
          >
            7d &raquo;
          </button>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 border-l border-[var(--pp-border)] pl-4">
            <button
              onClick={() => applyZoom(zoomIdx - 1)}
              disabled={zoomIdx === 0}
              className="px-2 py-0.5 border border-[var(--pp-border)] rounded text-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Zoom in (fewer days)"
            >+</button>
            <span className="text-xs text-[var(--pp-muted)] min-w-[2.5rem] text-center">
              {ZOOM_LEVELS[zoomIdx]}d
            </span>
            <button
              onClick={() => applyZoom(zoomIdx + 1)}
              disabled={zoomIdx === ZOOM_LEVELS.length - 1}
              className="px-2 py-0.5 border border-[var(--pp-border)] rounded text-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Zoom out (more days)"
            >−</button>
          </div>

          <div className="flex-1" />

          <span className="text-xs text-[var(--pp-muted)]">
            {batchChains.length} chains &middot; {stages.length} stages
          </span>

          {/* Sidebar collapse toggle */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="inline-flex items-center justify-center rounded border border-[var(--pp-border)] p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            aria-label={sidebarCollapsed ? 'Show Planning Tools' : 'Hide Planning Tools'}
            title={sidebarCollapsed ? 'Show Planning Tools' : 'Hide Planning Tools'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {sidebarCollapsed ? (
                /* panel-left-open icon */
                <>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                  <polyline points="14 9 17 12 14 15" />
                </>
              ) : (
                /* panel-left-close icon */
                <>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                  <polyline points="16 9 13 12 16 15" />
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
          <button
            onClick={resetView}
            className="px-3 py-1.5 border border-[var(--pp-border)] rounded text-sm font-medium hover:bg-gray-50"
          >
            Today
          </button>
          <div className="flex-1" />
          <span className="text-xs text-[var(--pp-muted)]">
            {batchChains.length} chains
          </span>
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
              <div className="text-xs font-medium text-[var(--pp-muted)] uppercase tracking-wide mb-2">Navigation</div>
              <div className="flex items-center gap-2">
                <button className="planner-mobile-btn flex-1" onClick={() => { shiftView(-7); closePlannerMobile(); }}>&laquo; 7d</button>
                <button className="planner-mobile-btn flex-1" onClick={() => { shiftView(-1); closePlannerMobile(); }}>&lsaquo; 1d</button>
                <button className="planner-mobile-btn flex-1 font-medium" onClick={() => { resetView(); closePlannerMobile(); }}>Today</button>
                <button className="planner-mobile-btn flex-1" onClick={() => { shiftView(1); closePlannerMobile(); }}>1d &rsaquo;</button>
                <button className="planner-mobile-btn flex-1" onClick={() => { shiftView(7); closePlannerMobile(); }}>7d &raquo;</button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  className="planner-mobile-btn flex-1"
                  disabled={zoomIdx === 0}
                  onClick={() => applyZoom(zoomIdx - 1)}
                >+ Zoom in</button>
                <span className="text-xs text-[var(--pp-muted)] min-w-[3rem] text-center">{ZOOM_LEVELS[zoomIdx]}d</span>
                <button
                  className="planner-mobile-btn flex-1"
                  disabled={zoomIdx === ZOOM_LEVELS.length - 1}
                  onClick={() => applyZoom(zoomIdx + 1)}
                >− Zoom out</button>
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
      <div className="flex-1 min-h-0 flex">
        {/* Timeline + horizontal scrollbar */}
        <div className="flex-1 min-w-0 flex flex-col" ref={timelineRef}>
          <div
            className="flex-1 min-h-0"
            onWheel={handleTimelineWheel}
          >
            <WallboardCanvas onStageClick={(id) => setSelectedStageId(id)} onMachineLabelClick={handleMachineLabelClick} onShiftBandClick={() => setShiftScheduleOpen(true)} showDowntime={true} onDowntimeClick={handleDowntimeClick} enableDragResize={true} onStageDragEnd={handleStageDragEnd} showShutdownCrossing={true} showHoldRisk={true} showCheckpoints={true} onCheckpointClick={handleCheckpointClick} />
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

        {/* Planning sidebar */}
        <div className={`planner-sidebar${sidebarOpen ? ' planner-sidebar-open' : ''}${sidebarCollapsed ? ' planner-sidebar-collapsed' : ''}`}>
          <div className="planner-sidebar-header">
            <h3>Planning Tools</h3>
            <button
              type="button"
              className="planner-sidebar-close md:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close Planning Tools"
            >
              ✕
            </button>
          </div>

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
          </div>

          {/* Footer help text */}
          <div className="planner-sidebar-footer">
            <p>
              Click a batch bar on the timeline to view and edit stage details.
              Setup menus configure your facility, processes, and shift patterns.
            </p>
          </div>
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
        stageId={selectedStageId}
        onClose={() => setSelectedStageId(null)}
        onEditChain={(chainId) => {
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
                    // Find most common prefix
                    const prefixCounts = new Map<string, number>();
                    for (const um of unknowns) {
                      const p = um.namePrefix ?? um.name;
                      prefixCounts.set(p, (prefixCounts.get(p) ?? 0) + 1);
                    }
                    const [commonPrefix, count] = [...prefixCounts.entries()].sort((a, b) => b[1] - a[1])[0];
                    if (count < 2) return null;
                    // Find suggested group for this prefix
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
