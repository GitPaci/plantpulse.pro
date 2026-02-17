'use client';

// Planner — Interactive planning view
// Modern replacement for VBA FormaZaPlan (Excel UserForm)
// Phase 1: read-only timeline + placeholder editing sidebar

import Navigation from '@/components/ui/Navigation';
import WallboardCanvas from '@/components/timeline/WallboardCanvas';
import { usePlantPulseStore } from '@/lib/store';
import { subDays, addDays, startOfDay } from 'date-fns';

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
        <div className="w-72 bg-white border-l border-[var(--pp-border)] p-4 overflow-y-auto shrink-0">
          <h3 className="text-sm font-semibold text-[var(--pp-pharma)] mb-4">
            Planning Tools
          </h3>

          <div className="space-y-3">
            <button className="w-full text-left px-3 py-2.5 rounded-lg border border-[var(--pp-border)] hover:border-[var(--pp-pharma)]/30 hover:bg-[var(--pp-surface)] transition-colors text-sm">
              <div className="font-medium text-[var(--pp-pharma)]">New Batch Chain</div>
              <div className="text-xs text-[var(--pp-muted)] mt-0.5">
                Auto-schedule with seed train wizard
              </div>
            </button>

            <button className="w-full text-left px-3 py-2.5 rounded-lg border border-[var(--pp-border)] hover:border-[var(--pp-pharma)]/30 hover:bg-[var(--pp-surface)] transition-colors text-sm">
              <div className="font-medium text-[var(--pp-pharma)]">Bulk Shift</div>
              <div className="text-xs text-[var(--pp-muted)] mt-0.5">
                Shift batches by N hours after cutoff
              </div>
            </button>

            <button className="w-full text-left px-3 py-2.5 rounded-lg border border-[var(--pp-border)] hover:border-[var(--pp-pharma)]/30 hover:bg-[var(--pp-surface)] transition-colors text-sm">
              <div className="font-medium text-[var(--pp-pharma)]">Import Excel</div>
              <div className="text-xs text-[var(--pp-muted)] mt-0.5">
                Load schedule from .xlsx template
              </div>
            </button>

            <button className="w-full text-left px-3 py-2.5 rounded-lg border border-[var(--pp-border)] hover:border-[var(--pp-pharma)]/30 hover:bg-[var(--pp-surface)] transition-colors text-sm">
              <div className="font-medium text-[var(--pp-pharma)]">Export Excel</div>
              <div className="text-xs text-[var(--pp-muted)] mt-0.5">
                Download current schedule as .xlsx
              </div>
            </button>
          </div>

          <div className="mt-6 pt-4 border-t border-[var(--pp-border)]">
            <p className="text-xs text-[var(--pp-muted)] leading-relaxed">
              Click a batch bar on the timeline to view and edit stage details.
              Planning tools above will be interactive in the next release.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
