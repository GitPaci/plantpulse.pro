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
import { usePlantPulseStore } from '@/lib/store';
import {
  parseScheduleXlsx,
  exportScheduleXlsx,
  parseMaintenanceXlsx,
  exportMaintenanceXlsx,
  downloadXlsx,
} from '@/lib/excel-io';
import { subDays, addDays, startOfDay, differenceInDays, format } from 'date-fns';
import { useState, useCallback, useRef, useEffect } from 'react';

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

  // Import/export state
  const scheduleFileRef = useRef<HTMLInputElement>(null);
  const maintenanceFileRef = useRef<HTMLInputElement>(null);
  const [importConfirm, setImportConfirm] = useState<{
    type: 'schedule' | 'maintenance';
    chains?: import('@/lib/types').BatchChain[];
    stages?: import('@/lib/types').Stage[];
    tasks?: import('@/lib/types').MaintenanceTask[];
    warnings: string[];
  } | null>(null);

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
      });
    },
    [machines]
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
      setBatchChains(importConfirm.chains);
      setStages(importConfirm.stages);
    } else if (importConfirm.type === 'maintenance' && importConfirm.tasks) {
      setMaintenanceTasks(importConfirm.tasks);
    }
    setImportConfirm(null);
  }, [importConfirm, setBatchChains, setStages, setMaintenanceTasks]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Navigation />

      {/* Toolbar */}
      <div className="h-10 bg-white border-b border-[var(--pp-border)] flex items-center px-4 gap-4 text-sm shrink-0">
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

        <div className="flex-1" />

        <span className="text-xs text-[var(--pp-muted)]">
          {batchChains.length} chains &middot; {stages.length} stages
        </span>
      </div>

      {/* Main content: timeline + sidebar */}
      <div className="flex-1 min-h-0 flex">
        {/* Timeline + horizontal scrollbar */}
        <div className="flex-1 min-w-0 flex flex-col" ref={timelineRef}>
          <div
            className="flex-1 min-h-0"
            onWheel={handleTimelineWheel}
          >
            <WallboardCanvas onStageClick={(id) => setSelectedStageId(id)} onMachineLabelClick={handleMachineLabelClick} onShiftBandClick={() => setShiftScheduleOpen(true)} showDowntime={true} onDowntimeClick={handleDowntimeClick} enableDragResize={true} onStageDragEnd={handleStageDragEnd} />
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

        {/* Planning sidebar */}
        <div className="planner-sidebar">
          <div className="planner-sidebar-header">
            <h3>Planning Tools</h3>
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
              </p>
              {importConfirm.type === 'schedule' && (importConfirm.chains?.length ?? 0) > 0 && (
                <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--pp-muted)' }}>
                  This will replace the current schedule data.
                </p>
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
              <button className="pp-modal-btn" onClick={() => setImportConfirm(null)}>Cancel</button>
              <button
                className="pp-modal-btn pp-modal-btn-primary"
                onClick={handleImportConfirm}
                disabled={
                  importConfirm.type === 'schedule'
                    ? (importConfirm.chains?.length ?? 0) === 0
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
