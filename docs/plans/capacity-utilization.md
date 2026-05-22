# Capacity Utilization — Planner View Feature Plan

> **Status: Implemented** (Phase A + B complete — see `components/planner/CapacityPanel.tsx`)
>
> What was built:
> - Per-group rows with colour-coded utilisation bar and % (green/amber/red)
> - Period selector: View / Quarter / Year / Custom date range (independent of planner window)
> - MAM capacity hierarchy: Nameplate → Optimal → Standard → Planned → Scheduled
> - Turnaround hours inferred from inter-batch gaps using `requiredTurnaroundGap()` + `turnaroundTotalHours()`
> - Expanded detail card: stacked bar, turnaround activity list (names + durations), full metric list
> - Two assumption sliders: Limiting factor % and Idle capacity %
> - CSS prefix: `.pp-cap-*` in `globals.css`
>
> What remains (Phase C — Enterprise):
> - Export utilisation table to Excel (one row per machine group per month)
> - Actual Capacity Utilization from logged hours (requires time-tracking data)
> - Period comparison (current vs. prior year same period)
> - Per-group limiting factor inputs (Free edition uses a single slider for all groups)

## Why this fits the Planner

The Planner already holds every data point required to compute capacity utilization:

| Required input | Where it lives in PlantPulse |
|----------------|------------------------------|
| Machine list + count | `Machine[]` in Zustand store |
| View date range | Planner month/date window |
| Scheduled stage hours | `Stage[]` with `startDatetime` / `endDatetime` |
| Plant-wide shutdowns | `ShutdownPeriod[]` |
| Per-machine downtime | `MachineDowntime` + `RecurringDowntimeRule[]` |
| Turnaround activities | `TurnaroundActivity[]` (gap hours between batches) |
| Batch count / changeovers | `BatchChain[]` |

Adding a capacity utilization panel to the Planner view gives planners a live KPI
dashboard without any new data entry — all numbers derive from what is already scheduled.

---

## Capacity hierarchy (MAM-aligned)

The following chain of capacity definitions is standard in pharmaceutical manufacturing
(aligned with how Novartis/Lek site controllers calculate and set capacities).

```
Nameplate Capacity
  │  minus: mandatory shutdowns (plant-wide)
  ▼
Optimal Capacity
  │  minus: budgeting limitations + operative limiting factors (bottlenecks)
  ▼
Standard Capacity               ← baseline for Standard Costing
  │  minus: planned idle capacity (extraordinary shutdowns, unscheduled slots)
  ▼
Planned Capacity Utilization    ← expressed as % of Standard Capacity
  │
  │  (replace planned hours with actual logged hours)
  ▼
Actual Capacity Utilization     ← Enterprise / Phase 2 feature
```

### Definitions and formulas

#### 1. Nameplate Capacity (NC)
Total theoretical hours — machines × days × 24 h, no deductions.

```
NC = numberOfDays × 24 h × numberOfMachines
```

*Example: 4 bioreactors × 365 days × 24 h = 35,040 h/year*

#### 2. Optimal Capacity (OC)
Nameplate minus mandatory (planned) shutdowns from `ShutdownPeriod[]`.

```
OC = NC − (totalShutdownDays × 24 h × numberOfMachines)
```

*Example: 35,040 − (10 days × 24 h × 4 machines) = 34,080 h*

#### 3. Standard Capacity (SC)
Optimal Capacity reduced by operative limiting factors (bottlenecks) and
budgeting-level constraints. These are user-entered percentages or fixed hour deductions.

```
SC = OC − limitingFactorHours
limitingFactorHours = limitingFactorPct × OC
```

*Example: downstream bottleneck allows only 3/4 bioreactors simultaneously → 25% LF*
*SC = 34,080 − (0.25 × 34,080) = 25,560 h*

Standard Capacity is the **denominator** for all utilization percentages in
Standard Costing. It represents the realistic productive ceiling, not the
theoretical maximum.

#### 4. Hours per Slot (batch slot)
Used to convert batch counts into hours for idle capacity math.

```
hoursPerSlot = SC / totalSlotsInPeriod
```

*Example: SC 25,560 h ÷ 55 batches (incl. 5 changeovers) = 464.7 h/slot*

#### 5. Planned Idle Capacity (PIC)
Extraordinary shutdowns, planned gaps, or reserved slots that will not produce.

```
PIC = idleSlots × hoursPerSlot
```

*Example: 2 extraordinary shutdown slots × 464.7 h = 929 h*

#### 6. Planned Capacity Utilization (PCU)
Hours actually planned for production-related work.

```
PCU = SC − PIC
```

*Example: 25,560 − 929 = 24,631 h*

#### 7. Planned Capacity Utilization % (PCU%)
```
PCU% = PCU / SC × 100
```

*Example: 24,631 / 25,560 = 96.4 %*

#### 8. Actual Capacity Utilization % (ACU%) — Enterprise / Phase 2
Same formula but uses logged actual hours instead of planned hours.

```
ACU% = actualProductionHours / SC × 100
```

---

## Suggested UI: Capacity Panel in Planner toolbar / side panel

### Input fields (user-configurable per period)

| Field | Type | Source / note |
|-------|------|---------------|
| Analysis scope | Date range picker | Defaults to current Planner month window |
| Machine filter | Multi-select chip | Filter to a subset (e.g. only fermenters) |
| Limiting factor % | Number input 0–100% | User-entered; represents bottleneck deduction |
| Budgeting limitation h | Number input | Optional fixed-hour deduction (alternative to %) |
| Total slots in period | Number input | Batch count incl. changeovers; can auto-count from `BatchChain[]` |
| Idle slots | Number input | Extraordinary shutdowns or reserved slots |

### Computed outputs (read-only, live)

| KPI | Formula | Unit |
|-----|---------|------|
| Nameplate Capacity | `days × 24 × machines` | h |
| Shutdown hours | Sum of `ShutdownPeriod` overlap with scope | h |
| Optimal Capacity | NC − shutdown h | h |
| Limiting Factor h | LF% × OC | h |
| Standard Capacity | OC − LF h | h |
| Hours per Slot | SC ÷ total slots | h |
| Idle Capacity | idle slots × h/slot | h |
| Planned Utilization | SC − idle capacity | h |
| **Planned Util %** | PCU ÷ SC × 100 | **%** |
| Scheduled hours | Sum of stage hours in scope (from `Stage[]`) | h |
| **Scheduled Util %** | scheduled h ÷ SC × 100 | **%** |

The two percentage rows — Planned Util % and Scheduled Util % — are the headline KPIs.
Scheduled Util % is fully automatic (derived from scheduled stages); Planned Util % requires
the user to set the limiting factor and idle-slot inputs.

### Turnaround hours treatment

Turnaround activities (CIP, SIP, media prep) are *included* in scheduled hours because
they represent real equipment occupation. They are **not** deducted from utilization — the
bioreactor is unavailable during CIP regardless of whether it is producing. This matches
how the VBA legacy system counted vessel occupation.

If a future reporting requirement needs "production-only hours" separately, add a
**Production Hours** row = scheduled stage hours where `stageType === 'production'`.

### Maintenance / downtime treatment

Per-machine downtime from `MachineDowntime` and `RecurringDowntimeRule[]` reduces
available machine-hours in the Nameplate Capacity baseline only when `blocksPlanning === true`.
Informational downtime (blocksPlanning: false) is excluded from the deduction but shown
in a tooltip/footnote.

---

## Data model additions required

```typescript
// Stored per analysis period (not persisted between sessions in Free edition)
interface CapacityUtilizationConfig {
  scopeStart: Date;
  scopeEnd: Date;
  machineFilter: string[];          // machine IDs; empty = all machines
  limitingFactorPct: number;        // 0–100
  budgetLimitationHours: number;    // fixed deduction (alternative / additive to %)
  totalSlotsInPeriod: number;       // auto-counted or user-overridden
  idleSlots: number;                // extraordinary shutdowns + reserved slots
}

// Computed — no storage required
interface CapacityUtilizationResult {
  nameplateHours: number;
  shutdownHours: number;
  optimalHours: number;
  limitingFactorHours: number;
  standardHours: number;
  hoursPerSlot: number;
  idleCapacityHours: number;
  plannedUtilizationHours: number;
  plannedUtilizationPct: number;
  scheduledHours: number;
  scheduledUtilizationPct: number;
}
```

`CapacityUtilizationConfig` can live in component state (not in the Zustand store)
for the Free Edition. Enterprise edition may persist it per reporting period.

---

## Phasing recommendation

### Phase A — Scheduled Utilization (low effort, high value)
Automatic — no user inputs beyond machine filter and date range.

- Sum stage hours from `Stage[]` in scope
- Compute Nameplate and Optimal Capacity from store data
- Show Scheduled Util % vs. Optimal Capacity
- Add as a collapsible "Utilization" section in the Planner toolbar or a
  small KPI bar below the timeline header

### Phase B — Standard Capacity inputs
Add the limiting factor %, budgeting limitation, and slot-count fields.
Compute the full SC → PCU → PCU% chain.

### Phase C — Export / reporting (Enterprise)
- Export utilization table to Excel (one row per machine group per month)
- Actual Capacity Utilization from logged hours (requires time-tracking data)
- Period comparison (current vs. prior year same period)

---

## Open questions

1. **Scope granularity**: Should the analysis window be the current Planner month,
   a custom date range, or a full calendar year? A date-range picker is most flexible.

2. **Per-machine-group breakdown**: Show one utilization row per equipment group
   (inoculum, propagator, pre-fermenter, fermenter) or a single aggregate?
   A grouped breakdown is more useful for identifying which stage is the bottleneck.

3. **Limiting factor source**: The bottleneck (e.g. downstream constraint) is manually
   entered in this design. A future enhancement could auto-detect it from the scheduling
   engine when a vessel is never the first to free up.

4. **Changeover vs. production hours**: Should changeovers (turnaround activities) be
   counted toward "productive" hours or reported separately? Current plan: included.

5. **Standard vs. Actual Costing flag**: In Standard Costing, SC is the fixed baseline
   even if actual output differs. In Actual Costing, the baseline adjusts to actual hours.
   The Free edition supports Standard Costing only; Actual Costing is an Enterprise feature.
