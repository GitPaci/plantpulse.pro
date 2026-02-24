'use client';

// Planner — Interactive planning view
// Modern replacement for VBA FormaZaPlan (Excel UserForm)
// Sidebar: organized tool sections (Batch Ops, Data I/O, Setup)

import Navigation from '@/components/ui/Navigation';
import WallboardCanvas from '@/components/timeline/WallboardCanvas';
import { usePlantPulseStore } from '@/lib/store';
import { subDays, addDays, startOfDay } from 'date-fns';
import { useState } from 'react';

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

  // Placeholder handlers — will be wired to modals/panels in next phases
  function handleNotImplemented(feature: string) {
    return () => {
      // These will be replaced with actual modal/panel opens
      console.log(`[Planner] ${feature} — coming in next phase`);
    };
  }

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
        {/* Timeline */}
        <div className="flex-1 min-w-0">
          <WallboardCanvas />
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
                onClick={handleNotImplemented('New Batch Chain')}
              />
              <ToolButton
                icon={<IconBulkShift />}
                label="Bulk Shift"
                description="Shift batches by hours after cutoff"
                onClick={handleNotImplemented('Bulk Shift')}
              />
            </SidebarSection>

            {/* ── Schedule Data ─────────────────────────────── */}
            <SidebarSection title="Schedule Data">
              <ToolButton
                icon={<IconUpload />}
                label="Import Schedule"
                description="Load schedule from .xlsx file"
                onClick={handleNotImplemented('Import Schedule')}
              />
              <ToolButton
                icon={<IconDownload />}
                label="Export Schedule"
                description="Download schedule as .xlsx"
                onClick={handleNotImplemented('Export Schedule')}
              />
              <ToolButton
                icon={<IconUpload />}
                label="Import Maintenance"
                description="Load maintenance tasks from .xlsx"
                onClick={handleNotImplemented('Import Maintenance')}
                badge="MT"
              />
              <ToolButton
                icon={<IconDownload />}
                label="Export Maintenance"
                description="Download maintenance tasks as .xlsx"
                onClick={handleNotImplemented('Export Maintenance')}
                badge="MT"
              />
            </SidebarSection>

            {/* ── Setup ─────────────────────────────────────── */}
            <SidebarSection title="Setup">
              <ToolButton
                icon={<IconEquipment />}
                label="Equipment Setup"
                description="Names, groups, product line assignments"
                onClick={handleNotImplemented('Equipment Setup')}
              />
              <ToolButton
                icon={<IconProcess />}
                label="Process Setup"
                description="Stage defaults, CIP/turnaround, shutdown and holiday rules"
                onClick={handleNotImplemented('Process Setup')}
              />
              <ToolButton
                icon={<IconShift />}
                label="Shift Schedule"
                description="Teams, rotation pattern, shift bar colors"
                onClick={handleNotImplemented('Shift Schedule')}
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
    </div>
  );
}
