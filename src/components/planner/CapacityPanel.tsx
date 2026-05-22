'use client';

// Capacity Utilization Panel — Planning Tools sidebar section
// Derives MAM capacity hierarchy from live schedule data.
// No server calls; all numbers are computed from Zustand store data.

import { useState, useMemo } from 'react';
import { differenceInHours, differenceInDays, max, min, format, addDays } from 'date-fns';
import type { Machine, EquipmentGroup, Stage, ShutdownPeriod } from '@/lib/types';

interface CapacityPanelProps {
  viewStart: Date;
  viewEnd: Date;
  machines: Machine[];
  equipmentGroups: EquipmentGroup[];
  stages: Stage[];
  shutdownPeriods: ShutdownPeriod[];
}

interface GroupMetrics {
  groupId: string;
  groupName: string;
  groupShortName: string;
  machineCount: number;
  nameplate: number;
  shutdownH: number;
  optimal: number;
  limitingH: number;
  standard: number;
  idleH: number;
  planned: number;
  scheduled: number;
  scheduledPct: number;
  plannedPct: number;
}

function fmtH(h: number): string {
  return Math.round(h).toLocaleString() + ' h';
}

function utilColor(pct: number): string {
  if (pct >= 80) return '#16a34a';
  if (pct >= 50) return '#d97706';
  return '#dc2626';
}

export default function CapacityPanel({
  viewStart,
  viewEnd,
  machines,
  equipmentGroups,
  stages,
  shutdownPeriods,
}: CapacityPanelProps) {
  const [limitingPct, setLimitingPct] = useState(0);
  const [idlePct, setIdlePct] = useState(0);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const periodDays = Math.max(0, differenceInDays(viewEnd, viewStart));

  // Total shutdown hours overlapping the view window (plant-wide — applies to all groups)
  const shutdownHoursBase = useMemo(() => {
    return shutdownPeriods.reduce((acc, sp) => {
      const s = max([sp.startDate, viewStart]);
      const e = min([sp.endDate, viewEnd]);
      return e > s ? acc + differenceInHours(e, s) : acc;
    }, 0);
  }, [shutdownPeriods, viewStart, viewEnd]);

  // Build machine ID sets per group for fast stage lookups
  const machineIdsByGroup = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const m of machines) {
      if (!map.has(m.group)) map.set(m.group, new Set());
      map.get(m.group)!.add(m.id);
    }
    return map;
  }, [machines]);

  // Compute metrics for all groups that have at least one machine
  const groupMetrics: GroupMetrics[] = useMemo(() => {
    const sorted = [...equipmentGroups].sort((a, b) => a.displayOrder - b.displayOrder);
    return sorted
      .map((g) => {
        const ids = machineIdsByGroup.get(g.id);
        if (!ids || ids.size === 0) return null;
        const machineCount = ids.size;

        const nameplate = machineCount * periodDays * 24;
        const shutdownH = shutdownHoursBase * machineCount;
        const optimal = nameplate - shutdownH;
        const limitingH = optimal * (limitingPct / 100);
        const standard = optimal - limitingH;
        const idleH = standard * (idlePct / 100);
        const planned = standard - idleH;

        const scheduled = stages.reduce((acc, s) => {
          if (!ids.has(s.machineId)) return acc;
          const start = max([s.startDatetime, viewStart]);
          const end = min([s.endDatetime, viewEnd]);
          return end > start ? acc + differenceInHours(end, start) : acc;
        }, 0);

        const effectiveStandard = Math.max(standard, 1);
        const scheduledPct = (scheduled / effectiveStandard) * 100;
        const plannedPct = (planned / effectiveStandard) * 100;

        return {
          groupId: g.id,
          groupName: g.name,
          groupShortName: g.shortName,
          machineCount,
          nameplate,
          shutdownH,
          optimal,
          limitingH,
          standard,
          idleH,
          planned,
          scheduled,
          scheduledPct,
          plannedPct,
        } satisfies GroupMetrics;
      })
      .filter((m): m is GroupMetrics => m !== null);
  }, [equipmentGroups, machineIdsByGroup, periodDays, shutdownHoursBase, limitingPct, idlePct, stages, viewStart, viewEnd]);

  const periodLabel = useMemo(() => {
    const end = addDays(viewEnd, -1);
    const sameMonth =
      viewStart.getMonth() === end.getMonth() &&
      viewStart.getFullYear() === end.getFullYear();
    const label = sameMonth
      ? `${format(viewStart, 'MMM d')} – ${format(end, 'd')}`
      : `${format(viewStart, 'MMM d')} – ${format(end, 'MMM d')}`;
    return `${label} · ${periodDays}d`;
  }, [viewStart, viewEnd, periodDays]);

  if (groupMetrics.length === 0) {
    return (
      <div className="pp-cap-empty">
        No equipment groups configured. Add machines in Equipment Setup.
      </div>
    );
  }

  return (
    <div className="pp-cap-panel">
      {/* Period */}
      <div className="pp-cap-period">{periodLabel}</div>

      {/* Group rows */}
      <div className="pp-cap-groups">
        {groupMetrics.map((m) => {
          const isExpanded = expandedGroupId === m.groupId;
          const color = utilColor(m.scheduledPct);
          return (
            <div key={m.groupId} className="pp-cap-group">
              {/* Summary row */}
              <button
                className={`pp-cap-group-row${isExpanded ? ' pp-cap-group-row--active' : ''}`}
                onClick={() => setExpandedGroupId(isExpanded ? null : m.groupId)}
                aria-expanded={isExpanded}
              >
                <span className="pp-cap-group-name">{m.groupName}</span>
                <span className="pp-cap-group-count">{m.machineCount}</span>
                <span className="pp-cap-group-bar" aria-hidden="true">
                  <span
                    className="pp-cap-group-bar-fill"
                    style={{
                      width: `${Math.min(100, m.scheduledPct)}%`,
                      background: color,
                    }}
                  />
                </span>
                <span className="pp-cap-group-pct" style={{ color }}>
                  {m.scheduledPct.toFixed(0)}%
                </span>
              </button>

              {/* Expanded detail card */}
              {isExpanded && (
                <div className="pp-cap-detail">
                  {/* Stacked bar */}
                  {m.nameplate > 0 && (
                    <div className="pp-cap-stack" role="img" aria-label="Capacity breakdown">
                      <div
                        className="pp-cap-stack-seg pp-cap-stack-shutdown"
                        style={{ width: `${(m.shutdownH / m.nameplate) * 100}%` }}
                        title={`Shutdown · ${fmtH(m.shutdownH)}`}
                      />
                      <div
                        className="pp-cap-stack-seg pp-cap-stack-limiting"
                        style={{ width: `${(m.limitingH / m.nameplate) * 100}%` }}
                        title={`Limiting factor · ${fmtH(m.limitingH)}`}
                      />
                      <div
                        className="pp-cap-stack-seg pp-cap-stack-idle"
                        style={{ width: `${(m.idleH / m.nameplate) * 100}%` }}
                        title={`Idle · ${fmtH(m.idleH)}`}
                      />
                      <div
                        className="pp-cap-stack-seg pp-cap-stack-scheduled"
                        style={{ width: `${Math.min(100, (m.scheduled / m.nameplate) * 100)}%` }}
                        title={`Scheduled · ${fmtH(m.scheduled)}`}
                      />
                      <div
                        className="pp-cap-stack-seg pp-cap-stack-slack"
                        style={{
                          width: `${Math.max(0, ((m.standard - m.scheduled) / m.nameplate) * 100)}%`,
                        }}
                        title={`Available slack · ${fmtH(Math.max(0, m.standard - m.scheduled))}`}
                      />
                    </div>
                  )}

                  {/* Stack legend */}
                  <div className="pp-cap-legend">
                    <span><span className="pp-cap-sw pp-cap-sw-scheduled" />Scheduled</span>
                    <span><span className="pp-cap-sw pp-cap-sw-idle" />Idle</span>
                    <span><span className="pp-cap-sw pp-cap-sw-limiting" />Limiting</span>
                    <span><span className="pp-cap-sw pp-cap-sw-shutdown" />Shutdown</span>
                  </div>

                  {/* Metric list */}
                  <dl className="pp-cap-metrics">
                    <div className="pp-cap-metric-row">
                      <dt>Nameplate</dt><dd>{fmtH(m.nameplate)}</dd>
                    </div>
                    <div className="pp-cap-metric-row">
                      <dt>− Shutdown</dt><dd>{fmtH(m.shutdownH)}</dd>
                    </div>
                    <div className="pp-cap-metric-row">
                      <dt>Optimal</dt><dd>{fmtH(m.optimal)}</dd>
                    </div>
                    <div className="pp-cap-metric-row">
                      <dt>− Limiting factor</dt><dd>{fmtH(m.limitingH)}</dd>
                    </div>
                    <div className="pp-cap-metric-row pp-cap-metric-bold">
                      <dt>Standard capacity</dt><dd>{fmtH(m.standard)}</dd>
                    </div>
                    <div className="pp-cap-metric-row">
                      <dt>− Idle capacity</dt><dd>{fmtH(m.idleH)}</dd>
                    </div>
                    <div className="pp-cap-metric-row">
                      <dt>Planned util.</dt>
                      <dd>{fmtH(m.planned)} <span className="pp-cap-metric-pct">({m.plannedPct.toFixed(0)}%)</span></dd>
                    </div>
                    <div className="pp-cap-metric-row pp-cap-metric-bold">
                      <dt>Scheduled</dt>
                      <dd style={{ color }}>{fmtH(m.scheduled)} <span className="pp-cap-metric-pct">({m.scheduledPct.toFixed(0)}%)</span></dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assumptions */}
      <div className="pp-cap-assumptions">
        <div className="pp-cap-assump-title">Assumptions</div>
        <label className="pp-cap-slider">
          <div className="pp-cap-slider-head">
            <span>Limiting factor</span>
            <span className="pp-cap-slider-val">{limitingPct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={limitingPct}
            onChange={(e) => setLimitingPct(Number(e.target.value))}
          />
          <div className="pp-cap-slider-hint">Bottleneck deduction from Optimal capacity</div>
        </label>
        <label className="pp-cap-slider">
          <div className="pp-cap-slider-head">
            <span>Idle capacity</span>
            <span className="pp-cap-slider-val">{idlePct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={idlePct}
            onChange={(e) => setIdlePct(Number(e.target.value))}
          />
          <div className="pp-cap-slider-hint">Reserved slots / extraordinary shutdowns</div>
        </label>
        <div className="pp-cap-note">
          Shutdown hours are auto-calculated from planned shutdowns in Process Setup.
        </div>
      </div>
    </div>
  );
}
