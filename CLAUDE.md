# CLAUDE.md — PlantPulse Scheduler Development Guide

## Project Overview

PlantPulse Scheduler is a manufacturing wallboard + planning web app for pharmaceutical
fermentation operations. It modernizes a legacy VBA system (Excel + PowerPoint macros) into
a browser-based tool that preserves spatial-time cognition while adding governed planning,
shift ownership, maintenance coordination, and GxP-ready audit integrity.

**Tagline:** Feels like a calm pharma control room.

### Planning documents (read these first)

| File | Purpose |
|------|---------|
| `docs/masterplan.md` | Vision, editions, roles, data model, operating rules, GxP direction |
| `docs/app-flow-pages-and-roles.md` | Site map, role permissions, primary user journeys |
| `docs/design-guidelines.md` | Visual language, color system, interaction design, accessibility |
| `docs/implementation-plan.md` | Phased build sequence (Phase 0–12) |
| `docs/shift-models.md` | Shift pattern definitions, glossary, and PlantPulse rotation logic |
| `CODE_OF_CONDUCT.md` | Community standards, enterprise governance, GxP-aligned conduct principles |

### Legacy VBA source files (reference, do not modify)

| File | Origin | Purpose |
|------|--------|---------|
| `docs/legacy/FormaZaPlan_macros.txt` | `FormaZaPlan.xls` | Interactive planner: load data, render Gantt in UserForm, edit/add/delete/shift batches, export |
| `docs/legacy/InfoTabla20180201_macros.txt` | `InfoTabla20180201.ppt` | Operator wallboard: auto-render 25-day Gantt on 1920×1080 slide with shifts, tasks, KPI |
| `docs/legacy/Izberidatum5_macros.txt` | `Izberidatum5.ppt` | Configurable planning view: date picker + vessel group filters, renders Gantt on slide |

---

## Legacy VBA System — What It Does

The VBA system consists of three Excel/PowerPoint macro-driven tools used to schedule
pharmaceutical fermentation batches at a Novartis/Lek (Slovenia) facility. The code is
in Slovenian with some English comments.

### Architecture

```
┌──────────────────────────────────────────────────────┐
│  PlanFermentacije_Tabla.xlsx    (schedule data)      │
│  Sheet1: [pososda, nacep, precep, serija]            │
├──────────────────────────────────────────────────────┤
│  Opravila_Tabla.xlsx           (checkpoint tasks)    │
│  Sheet1: [pososda, nacep, task_desc, status]         │
└───────────┬──────────────────────┬───────────────────┘
            │ ADODB via Excel ODBC │
    ┌───────▼──────┐      ┌───────▼──────────────┐
    │ FormaZaPlan  │      │ InfoTabla / Izberi    │
    │ (Excel form) │      │ (PowerPoint slides)   │
    │ PLANNER      │      │ WALLBOARD / VIEWER    │
    └──────────────┘      └──────────────────────-┘
```

### Data model (from VBA)

The core data is `BigReadArray(0..3, 0..N)` — a 2D array loaded via `rs.GetRows`:

| Index | Column name | Content |
|-------|-------------|---------|
| 0 | `pososda` | Vessel/machine name (e.g. "F-2", "PR-1", "PF-3") |
| 1 | `nacep` | Inoculation start datetime |
| 2 | `precep` | Transfer/end datetime (or hours-as-number for tasks) |
| 3 | `serija` | Series/batch number (integer) |

The task file (Opravila_Tabla.xlsx) has:

| Index | Column name | Content |
|-------|-------------|---------|
| 0 | `pososda` | Vessel name |
| 1 | `nacep` | Task datetime |
| 2 | (col 3) | Task description text |
| 3 | (col 4) | Status / confirmation |

### Vessel hierarchy (seed train)

**Product lines, machines, and stage durations are fully user-configurable.**
Users can add, rename, or remove product lines and machines to match their
facility. The GNT/KK setup below is the legacy VBA default, used as the
demo data template for new sessions.

**Default demo configuration (from legacy VBA):**

**GNT (Gentamicin) line:**
- Propagators: PR-1, PR-2 (seed stage, default duration 48h)
- Pre-fermenters: PF-1, PF-2 (intermediate, default duration 55h)
- Fermenters: F-2, F-3 (production)

**KK line:**
- Propagators: PR-3, PR-4, PR-5, PR-6, PR-7, PR-8 (seed stage, default duration 44h)
- Pre-fermenters: PF-3, PF-4, PF-5, PF-6 (intermediate, default duration 20h)
- Fermenters: F-1, F-4, F-5, F-6, F-7, F-8, F-9, F-10, F-11 (production)

**Inoculum (both lines):**
- BKK (KK inoculum vessel, stage type: inoculation, default duration 24h)
- BGNT (GNT inoculum vessel, stage type: inoculation, default duration 24h)

The full display order (hardcoded in VBA as `imena` array, configurable in modern app):
```
PR-1, PR-2, PF-1, PF-2, F-2, F-3,
bkk1, bkk2, bkk3, bkk4, bkk5,
PR-3, PR-4, PR-5, PR-6, PR-7, PR-8,
PF-3, PF-4, PF-5, PF-6,
F-1, F-4, F-5, F-6, F-7, F-8, F-9, F-10, F-11
```

Groups are separated by an empty-string sentinel in the VBA array.

**Modern app:** Equipment groups are fully user-configurable via the Equipment
Setup modal (no longer a hardcoded enum). Display groups are auto-derived from
product line assignments via `buildDisplayGroups()`. The `imena` array order is
used only as the demo data default.

### Business rules (extracted from VBA logic)

#### 1. Overlap detection
When adding a new series, the system checks:
- `DateDiff("h", lastEndOnVessel, newStart) < 0` → overlap → blocked for fermenter, warned for PF/PR
- Conflict vessel names are collected and shown to user for confirmation

#### 2. Auto-scheduling (new chain wizard)
- Find earliest available fermenter → suggest start = last_end + turnaround gap
- Back-calculate upstream stages from fermenter start using product line's `stageDefaults`
- **LRU vessel assignment**: `findBestVessel()` collects all overlap-free candidates and picks the one with the longest idle time (earliest `lastStageEnd`), distributing work across available vessels (e.g. alternating F-2/F-3, PR-1/PR-2)
- **Multi-chain scheduling**: when creating multiple chains via the "+" button, the next chain's production start is the earliest available time across all fermenter candidates (per-vessel cursor), not the previous chain's end — avoids large gaps when vessels alternate
- **Stage type count expansion**: `expandStageDefaults()` repeats stage entries based on `StageTypeDefinition.count` (e.g. Seed n-1 with count=2 produces two consecutive n-1 stages in the chain)
- **Per-product-line stage types**: wizard resolves stage type names from `productLineStageTypes[productLineId]` when in per-product-line mode (not just the global shared list)
- Implementation: `NewChainWizard.tsx` (wizard UI) + `scheduling.ts` (`findBestVessel`, `autoScheduleChain`) + `seed-train.ts` (`backCalculateChain`, `expandStageDefaults`, `buildStageTypeCounts`)

#### 3. Bulk time-shift
- Filter: all entries where `series_number >= threshold AND start_date > cutoff_date`
- Shift both start and end by N hours (positive or negative)
- Post-shift overlap validation via `validateBulkShift()` warns about new conflicts
- Implementation: `BulkShiftTool.tsx` (UI) + `scheduling.ts` (`selectStagesForBulkShift`, `validateBulkShift`) + store action `bulkShiftStages()`

#### 4. Batch bar editing
- Up to 8 stages per series displayed simultaneously
- Each stage: editable vessel, start datetime, end datetime
- "Fixed duration" mode: changing start auto-adjusts end (preserves duration)
- "Link to next" mode: end of stage N syncs to start of stage N+1
- Validation: start must be <= end
- Delete: removes entry from array, shifts remaining entries down
- **Drag-to-move**: ghost overlay during drag with semi-transparent highlight, snap-to-hour
- **Stretch-to-resize**: edge detection for duration changes via canvas interaction
- Implementation: `ChainEditor.tsx` (modal editor with real-time overlap detection) + `WallboardCanvas.tsx` (drag/resize handlers)

#### 5. Color cycling
- Planner: `series_id mod 12` cycles through 12 colors (Lek/Novartis palette)
- Wallboard: `series_id mod 5` cycles through 5 border colors
- Future batches on wallboard: rendered in grey with transparency

#### 6. Shift rotation (wallboard + planner)
- **Configurable** via Shift Schedule modal (Planner toolbar button)
- **Teams**: user-defined names and colors (default 4: Blue, Green, Red, Yellow)
- **Variable shift lengths**: 6, 7.5, 8, or 12 hours (set by rotation preset)
- **Rotation presets**: Russian 4-team (default), Simple A-B-C-D, 2-team alternating, Navy 3-shift (8h), Panama 2-2-3, Pitman 2-3-2, DuPont, 4-on-2-off, Custom
- Default 8-step cycle array: `[0, 2, 1, 3, 2, 0, 3, 1]`
- Default team colors: Blue (0,102,255), Green (0,204,0), Red (255,0,0), Yellow (255,253,0)
- **Plant coverage**: configurable active days (per weekday toggle) and operating hours window (non-24h operation supported)
- **Gap segments**: time periods with no shift coverage rendered as neutral gray (`#b0b0b0`) in the shift band on both Wallboard and Planner views, visually distinct from team colors
- `isShiftCoveredAt(time, config)` — resolves whether a wall-clock hour is covered by an active shift
- `shiftBands()` returns `ShiftBandSegment[]` with `teamIndex: -1` for gap segments
- Shift band at top of canvas shows team color per shift block; gray for uncovered periods
- **Shift sequence diagram**: Wikipedia-style day×period grid in the Shift Schedule editor (days as columns, shift periods as rows, team-colored cells with initial, gray for gaps); shows 1–2 weeks depending on cycle length
- **Coverage heatmap**: 7×24 grid (days × hours) showing covered / gap / outside status per hour
- **Holiday Calendar**: Slovenian public holidays (12 static dates + Easter Monday) built-in; custom country/region calendars available in Enterprise edition (CTA → hello@plantpulse.pro)
- Full shift model reference: `docs/shift-models.md`
- Implementation: `lib/shift-rotation.ts` (data + `ShiftCoverageConfig` + `isShiftCoveredAt`), `components/planner/ShiftSchedule.tsx` (modal), `WallboardCanvas.tsx` (rendering)

#### 7. Calendar / holidays
- Weekend detection: `Weekday() = 7` (Saturday) or `= 1` (Sunday) → red styling
- Slovenian public holidays (12 static dates):
  ```
  Jan 1, Jan 2, Feb 8, Apr 27, May 1, May 2,
  Jun 25, Aug 15, Oct 31, Nov 1, Dec 25, Dec 26
  ```
- Easter Monday: computed via Gauss Easter algorithm (dynamic per year)
- Holidays and Sundays get hatched pattern fill; Saturdays get solid red

#### 8. Timeline rendering math (proven pixel geometry)
```
pixelsPerDay = (canvasWidth - leftMargin) / numberOfDays
barLeft = leftMargin + DateDiff("h", viewStart, batchStart) * (pixelsPerDay / 24)
barWidth = DateDiff("h", batchStart, batchEnd) * (pixelsPerDay / 24)
```
Partial-left-edge clipping:
- If `barLeft < -leftMargin` → clamp to leftMargin, set width = 5 (indicator only)
- If `barLeft < 0` → reduce width by the overshoot, clamp left to leftMargin

Now-line position:
```
nowX = (numberOfDays / offsetFactor) * pixelsPerDay + (pixelsPerDay / 24) * Hour(Now)
```

#### 9. Task arrows (wallboard)
- Tasks rendered as triangular arrows (right-pointing) at task datetime position
- Unconfirmed: green fill → clickable
- Confirmed: turns red or gets status indicator
- Task tooltip shows vessel + description + datetime

#### 10. Export
- Transpose `BigReadArray` into new Excel workbook
- Headers: ["pososda", "nacep", "precep", "serija"]
- Data starts at row A2

#### 11. Machine downtime / unavailability (modern, no VBA equivalent)
- Per-machine unavailability windows defined in Equipment Setup modal (Machines tab)
- **One-time downtime**: each window has start date, optional end date (indefinite if omitted), optional reason
- **Recurring downtime**: periodic unavailability rules (e.g. every Friday 08:00–12:00 for maintenance)
  - `RecurringDowntimeRule`: recurrenceType (`weekly` | `monthly`), dayOfWeek/dayOfMonth, startHour, startMinute, durationHours, validity window (startDate + optional endDate), optional reason
  - `isDateInRecurringRule(rule, atDate)` — checks if a date falls within any occurrence of a recurring rule
  - Expired rules (endDate in past) are visually dimmed; `isRecurringRuleExpired()` helper
- **Affects Planning toggle** (`blocksPlanning`, default true): controls whether downtime excludes machine from auto-scheduling
  - Non-blocking downtime (`blocksPlanning: false`): renders with halved opacity + dashed diagonal hatch; scheduling engine skips; tooltip shows "(informational)" tag
  - Blocking downtime (`blocksPlanning: true`, default): full opacity + solid diagonal hatch
- **Notify Shift toggle** (`notifyShift`, default false): flags unavailability for shift team notification
  - When enabled, renders fuchsia triangular arrows (10×12px) at downtime start on both Planner and Wallboard canvases
  - `drawNotifyShiftArrows()` in `WallboardCanvas.tsx`; decoupled from downtime block visibility
  - Tooltip shows "Shift notification active" badge
- Three visual states for yellow dot indicator:
  - **Active**: solid yellow dot (start ≤ now ≤ end or no end)
  - **Scheduled/upcoming**: outlined yellow dot (start > now)
  - **Ended**: no indicator (past finite windows suppressed by `isDowntimeEnded()`)
- **Planner canvas visualization**: amber-tinted overlays with diagonal hatch (135°, 6px step) rendered behind batch bars
  - Hover tooltip with reason/time details
  - Click-to-edit opens Equipment Setup scrolled to machine's unavailability section
  - `DowntimeWindow` type + `expandRecurringRule()` + `collectDowntimeWindows()` in `lib/types.ts`
  - `drawDowntimeBlocks()` in `WallboardCanvas.tsx`; `showDowntime`/`onDowntimeClick` props (Planner-only)
- `isMachineUnavailable(machine, atDate?)` — checks both one-time downtime and recurring rules; only considers `blocksPlanning !== false` windows
- `hasMachineDowntime(machine)` — checks if machine has active or future downtime (excludes past windows); also considers recurring rules
- Machines with active blocking downtime are excluded from auto-scheduling vessel assignment

#### 12. Turnaround activities (modern, no VBA equivalent)
- User-defined gap activities between consecutive batches on the same vessel (e.g. CIP, SIP, Cleaning)
- Configured per equipment group in Process Setup modal (Turnaround Activities tab)
- Duration specified as days:hours:minutes; `turnaroundTotalHours()` computes effective gap for scheduling math
- `isDefault` flag marks activities for auto-insertion during batch scheduling
- **`phase` field** (`'pre' | 'post'`, default `'pre'` for legacy/unset activities):
  - `pre` — executed **before** the next batch starts (CIP, SIP, Media Preparation). These anchor to `stage.startDatetime` and walk backward in the timeline visualization.
  - `post` — executed **after** the current batch ends (Transfer to Downstream, Handoff). These anchor to `stage.endDatetime` and walk forward in the timeline visualization.
- **Validity window** (`validityValue: number`, `validityUnit: 'h' | 'd' | 'w'`): how long a completed activity remains valid before it must be repeated. `validityValue: 0` means no expiry.
- **Auto-repeat** (`autoRepeat: boolean`): if validity expires before the next batch starts, the activity is automatically reinserted.
- **`turnaroundValidityHours(t)`** — computes validity window in hours (days×24 + hours + weeks×168).
- **`normalizeTurnaroundActivity(t)`** — migration helper that infers `phase`/`validityValue`/`validityUnit`/`autoRepeat` from activity name patterns for legacy activities that predate the field. Idempotent — safe to call on already-normalized records. Infers:
  - `CIP` → `phase: 'pre', validityValue: 7, validityUnit: 'd', autoRepeat: true`
  - `SIP` → `phase: 'pre', validityValue: 8, validityUnit: 'h', autoRepeat: true`
  - `Media Preparation` → `phase: 'pre', validityValue: 24, validityUnit: 'h', autoRepeat: false`
  - `transfer` / `harvest` / `handoff` → `phase: 'post', validityValue: 0, autoRepeat: false`
  - Applied on ProcessSetup modal open to migrate existing store data.
- **Pre-populated defaults** for all 4 equipment groups (11 activities total):
  - Inoculum: Media Preparation (2h, pre), Inoculation (2h, pre)
  - Propagator: CIP (1h, pre/7d validity), Media Preparation (2h, pre/24h validity), SIP (1h, pre/8h validity)
  - Pre-fermenter: CIP (1h, pre/7d validity), Media Preparation (4h, pre/24h validity), SIP (2h, pre/8h validity)
  - Fermenter: CIP (1h, pre/7d validity), Media Preparation (6h, pre/24h validity), SIP (3h, pre/8h validity), Transfer to Downstream (3h, post)
- **Process Setup Turnaround Activities tab (v2)** — redesigned UI with:
  - Per-group segmented selector at the top (one tab per equipment group, no "All" view)
  - Cycle summary strip: proportional colored blocks showing Pre activities → PRODUCTION BATCH → Post activities
  - Pre and Post sections separated by a "PRODUCTION BATCH" divider
  - Inline row editor on click: Name, When (phase seg), Duration (d:h:m), Validity (value + unit dropdown), Auto-insert toggle, sequence hint, Remove button
  - `expandedActivityId` state for accordion-style inline editor; only one row open at a time
  - Add buttons for Pre and Post sections independently
  - CSS prefix: `.pp-ta-*` in `globals.css`
- **`productChangeoverOnly` field** (`boolean`, default `false`): when `true`, the activity is only applied when the immediately adjacent batch (pre: the preceding batch, post: the following batch) on the same machine belongs to a **different product line**. Useful for cross-contamination cleaning steps on shared equipment. Canvas rendering (`drawTurnaroundBlocks()`) skips the hatch block for same-product transitions; scheduling (`requiredTurnaroundGap()`) conservatively includes the gap regardless (deferred: pass product line context to `requiredTurnaroundGap()`). Badge indicator `⇄` shown on the collapsed activity row when enabled. CSS: `.pp-ta-row-changeover` in `globals.css`.
- Still pending: wiring phase-aware validity/auto-repeat logic into overlap detection engine (`lib/scheduling.ts`)

#### 13. Shutdown periods (modern, no VBA equivalent)
- Plant-wide shutdown windows with name, date range, and optional reason
- Managed in Process Setup modal (Shutdowns tab)
- Past shutdowns are visually dimmed; sorted by start date
- Full CRUD in Zustand store (`add/update/deleteShutdownPeriod`)
- **Date boundary convention**: `endDate` is stored as midnight of the LAST shutdown day (inclusive). The scheduling engine uses `shutdownEnd(s) = addDays(s.endDate, 1)` as the exclusive upper bound, so a shutdown ending "Jun 22" blocks all of Jun 22 — the first valid batch start is Jun 23 00:00. The visual calendar overlay uses `t <= sdEnd` (same inclusive logic). Do not change the storage format; always use `shutdownEnd()` in scheduling comparisons.
- **Conflict warnings**: amber banner in Shutdowns tab when a shutdown period overlaps planned batch stages (informational, not blocking); shows affected batch names and conflict count badge
- **Calendar overlay**: shutdown days rendered on Wallboard canvas as grey fill + diagonal hatch pattern (8px step, clipped to column); theme-aware (day: `rgba(120,120,140,0.18)`, night: `rgba(100,100,130,0.25)`)
- **"PLANT SHUTDOWN" text label**: centered vertically across shutdown day columns on Wallboard canvas via `drawShutdownLabels()`; rotated -90° for multi-day shutdowns; includes shutdown name if set; theme-aware opacity
- **Shutdown crossing indicators** (Planner): amber warning triangles with "!" at shutdown boundary intersection points on batch bars that span shutdown periods; drawn via `drawShutdownCrossingIndicators()`; enabled via `showShutdownCrossing` prop
- **Hold risk indicators** (Planner): red warning dots with "!" on stages where the turnaround gap to the next stage on the same machine is below the required minimum (from turnaround activities); drawn via `drawHoldRiskIndicators()`; enabled via `showHoldRisk` prop
- Implementation: `WallboardCanvas.tsx` (`drawShutdownLabels`, `drawShutdownCrossingIndicators`, `drawHoldRiskIndicators`)

#### 14. PDF export (modern, Schedule view only)
- Client-side only: `html2canvas` captures the schedule `<canvas>` at 2× scale, `jsPDF` generates A4 landscape PDF
- Zero network calls, works offline, no cookies, no telemetry
- **Dual-canvas architecture** for viewport independence:
  - Visible canvas (`schedule-export-canvas`): responsive, adapts to browser viewport — used for on-screen display only
  - Hidden export canvas (`schedule-export-canvas-pdf`): fixed at 1122×794 px (A4 landscape at 96 CSS DPI = 297×210 mm), positioned off-screen (`left: -99999px; visibility: hidden`)
  - PDF export always captures the hidden fixed-size canvas, never the visible one, so output is identical regardless of device/viewport
  - Constants: `SCHEDULE_PDF_CANVAS_ID = 'schedule-export-canvas-pdf'`, `SCHEDULE_PDF_VIEWPORT = { widthPx: 1122, heightPx: 794 }`
- Configurable via Print Settings modal (persisted in `localStorage` key: `plantpulse.schedulePrintSettings.v1`)
- Header: optional facility title (Helvetica bold 11pt) + month/year (always) + separator line
- Footer (3-column, 7–8pt grey):
  - Left: app version, export timestamp with TZ abbreviation + UTC offset (e.g. `2026-02-19 14:32 CET (UTC+01:00)`), prepared-by placeholder, signature line
  - Center: disclaimer text (editable, default: `UNCONTROLLED COPY: Valid only at time of printing.`)
  - Right: page numbers (`Page x of y`, future-proof loop via `getNumberOfPages()`)
- All footer elements are individually toggleable (showVersion, showTimestamp, showPreparedBy, showSignature, showPageNumbers)
- Enterprise-locked fields (visible but disabled): company logo, custom color theme, custom footer presets, watermark overlay, multi-page export, auto user ID from SSO, electronic signatures, document control number
- Filename: `PlantPulse_{Month}_{Year}.pdf`
- Implementation: `utils/exportSchedulePdf.ts` (logic) + `settings/PrintSettings.tsx` (UI) + dual-canvas wiring in `app/inoculum/page.tsx`
- **Known gaps** (see `docs/gaps-and-open-questions.md § PDF Export Gaps`):
  - `html2canvas` + `visibility: hidden` interaction may produce blank captures — the hidden export canvas inherits `visibility: hidden` from its container, which `html2canvas` may respect, skipping all visual content. A more reliable approach is to read the native `<canvas>` pixel data directly via `canvas.toDataURL()`, bypassing `html2canvas` entirely for the export canvas.
  - DPR double-scaling: WallboardCanvas already scales by `devicePixelRatio` for crisp rendering; `html2canvas` then applies its own `scale: 2`. On a 2× DPR device this produces a 4× capture (≈ 4488×3176 px), consuming excess memory with no visual benefit in a 297mm-wide PDF.
  - The hidden export canvas runs a 60-second redraw interval (intended for now-line refresh) even though `showNowLine={false}` — unnecessary CPU work for an off-screen surface.

#### 15. Schedule toolbar — responsive / mobile
- Desktop (>= 768px): horizontal toolbar layout (month nav, filter chips, export/print, stage count) — unchanged
- Mobile (< 768px): toolbar collapses into a "☰ Controls" hamburger button + month label + stage count
- Tapping opens a dropdown panel with three sections: month navigation, equipment filter grid (2-col), export/print actions (full-width buttons)
- Panel closes on: outside click (backdrop), action tap, or Escape key (returns focus to toggle)
- All touch targets >= 44px; ARIA: `aria-expanded`, `aria-controls`, `role="region"`
- Implementation: inline in `app/inoculum/page.tsx`; CSS in `globals.css` (`.schedule-mobile-*` classes)
- Uses Tailwind responsive utilities: desktop = `hidden md:flex`, mobile = `flex md:hidden`

#### 16. Wallboard fullscreen mode
- Browser Fullscreen API: enter via toolbar button (positioned immediately before the Shift indicator), exit via hover-reveal button or Escape
- In fullscreen: navigation bar and toolbar hidden; canvas fills entire viewport
- Black background with TV-safe margin (EBU R95): 2.5% top/bottom, 3.5% left/right padding
- Exit overlay: top-right, semi-transparent button with backdrop blur, opacity 0 by default, fades in on hover or `:focus-within`
- State syncs with `fullscreenchange` event (handles browser Escape, OS-level fullscreen exit)
- Implementation: `app/wallboard/page.tsx` (logic) + `globals.css` (`.wallboard-fullscreen-*` classes)

#### 17. Wallboard Night View mode
- Toggleable dark, high-contrast theme optimized for TV displays in dimly lit control rooms
- **Toolbar toggle** (non-fullscreen): positioned immediately before the Fullscreen button
  - OFF: moon icon + "Night" (indigo tint)
  - ON: sun icon + "Day" (amber tint)
- **Fullscreen overlay toggle**: top-left corner, same show/hide behavior as the exit overlay (opacity 0 → 1 on hover or `:focus-within`)
- **Automatic switching** (device local time, no server):
  - Night View activates at 22:00 local
  - Day View restores at 05:00 local
  - Checks once per minute via `setInterval`
  - Manual toggle is respected until the next scheduled boundary, then auto-schedule resumes
- **Persistence**: `localStorage` key `wallboard-night` (survives reload)
- **Scope**: only affects Wallboard page — Schedule, Planner, and PDF export always use day theme
- **Canvas colors**: `DAY_THEME` / `NIGHT_THEME` objects in `WallboardCanvas.tsx`; night uses deep navy background (`#0c1021`), light labels (`#c8d6e5`), cyan series labels (`#4cc9f0`), brighter now-line (`rgba(255,60,60,0.80)`)
- **Print safety**: `@media print` CSS rule forces light theme
- Implementation: `lib/useNightMode.ts` (hook) + `WallboardCanvas.tsx` (theme) + `app/wallboard/page.tsx` (toggles) + `globals.css` (`.wallboard-night-*` classes)

#### 18. Wallboard equipment group filtering
- Wallboard shows only equipment groups selected in Equipment Setup > Wallboard Display tab
- Default: propagator, pre_fermenter, fermenter (excludes inoculum — not shift-managed on shopfloor)
- State: `wallboardEquipmentGroups: string[]` in Zustand store with `setWallboardEquipmentGroups()` action
- Filtering: `wallboard/page.tsx` builds `wallboardGroups` by filtering `machineGroups` against the allowed set, then passes via `customMachineGroups` prop to `WallboardCanvas`
- Wallboard Display tab in Equipment Setup: checkbox card per equipment group with machine count preview, draft state pattern
- Implementation: `app/wallboard/page.tsx` (filtering) + `EquipmentSetup.tsx` (Wallboard Display tab) + `store.ts` (state) + `demo-data.ts` (defaults)

#### 19. Equipment Setup — machine grouping and smart insertion
- **Equipment group filter**: dropdown in Machines tab to filter visible machines by equipment group (or "All")
- **Section headers**: machines grouped by equipment group + product line composite key (e.g. "Pre-fermenter / Gentamicin") with count badges; visual separators between sections
- **Smart insertion**: new machines inherit the active filter's equipment group and product line; inserted after siblings using fractional `displayOrder` (midpoint between last sibling and next machine)
- New machine default product line is "None" (unassigned)
- Save button keeps modal open (matches Process Setup behavior)
- CSS: `.pp-setup-section-header`, `.pp-setup-section-count`, `.pp-setup-section-separator` in `globals.css`

#### 20. Process Setup — Stage Types compact layout, count field, and scope toggle
- Stage Types tab columns (#, Name, Short, Count, Description, Actions) rendered in a single horizontal row using `pp-setup-row` flex wrapper inside `pp-setup-row-wrapper`
- **Count field**: `StageTypeDefinition.count` (number) — instances per batch chain (e.g. 2 if two inoculum vessels per chain); min 1, max 99
- **Scope toggle**: `stageTypesMode: 'shared' | 'per_product_line'` in Zustand store
  - **Shared** (default): one global list of stage types used by all product lines
  - **Per-product-line**: each product line defines its own stage type list
  - Mode switch triggers a **validation dialog** warning that existing per-line configurations may be affected; user must confirm before switching
  - Stage Types ↔ Stage Defaults stay synchronized: deleting a stage type removes corresponding defaults, adding a stage type auto-creates default entries
- CSS: `.pp-process-stage-col-count` (52px width) in `globals.css`

#### 21. Process Setup — Naming tab (batch nomenclature)
- 5th tab in Process Setup modal for configuring batch name generation rules
- **Naming scope**: shared (one rule for all product lines) or per-product-line (each line has its own rule)
- **BatchNamingRule**: prefix (optional), suffix (optional), startNumber, padDigits, step (counter increment, default 1), nextNumber (for continuous mode)
- **Counter reset modes**: annual (1st January), custom date (month + day picker), or none (continuous numbering from set start)
- When "no reset" is selected, each rule shows a "Next #" field instead of "Start #"
- **Live preview**: shows 3 example batch names using the configured rule and step (e.g. `010`, `011`, `012` or `GNT-001`, `GNT-002`, `GNT-003`)
- **Inheritance note**: final production stage sets the batch name; upstream stages inherit automatically
- **ERP CTA**: enterprise-locked section with mailto link to hello@plantpulse.pro for ERP batch number sync
- State: `batchNamingConfig: BatchNamingConfig` in Zustand store with `setBatchNamingConfig()` action
- Default: per_product_line mode, annual reset, GNT- and KK- prefixes, 3-digit padding, step 1
- Implementation: `components/planner/ProcessSetup.tsx` (Naming tab + NamingRuleEditor sub-component)
- CSS: `.pp-process-naming`, `.pp-naming-section`, `.pp-naming-mode-options`, `.pp-naming-radio`, `.pp-naming-reset-date`, `.pp-naming-field`, `.pp-naming-rules-list`, `.pp-naming-rule-card`, `.pp-naming-rule-label`, `.pp-naming-rule-fields`, `.pp-naming-rule-preview`, `.pp-naming-info`, `.pp-naming-erp-cta` in `globals.css`

#### 22. Schedule view — dynamic inoculum group
- Schedule view (`app/inoculum/page.tsx`) now computes inoculum equipment group dynamically from the Zustand store instead of using a static constant
- Machines are filtered by `group === 'inoculum'` and exclude any machines already present in product-line display groups (prevents duplicate rows)
- `machineIdsInGroups` useMemo tracks all machine IDs already in `buildDisplayGroups()` output
- Inoculum group only prepended to schedule machine groups when it has non-empty machineIds

#### 23. Shift Schedule modal (modern, no VBA equivalent)
- Planner toolbar button opens full configuration modal for shift rotation
- **Teams section**: add/remove teams, edit name and color per team (color picker input)
- **Rotation Presets**: one-click presets — Russian 4-team (default), Simple A-B-C-D, 2-team alternating, Navy 3-shift (8h), Panama 2-2-3, Pitman 2-3-2, DuPont, 4-on-2-off, Custom
- **Cycle grid editor**: per-slot team assignment with add/remove slots; each slot shows team color border
- **Preview bar**: colored blocks showing team order in the cycle; gray for uncovered slots
- **Shift sequence diagram**: Wikipedia-style grid (days × shift periods) showing one full rotation cycle (7–14 days); cells team-colored with initial, gray for gaps; auto-contrast text
- **Plant Coverage section**: operation presets (24/7, 24/6, 24/5, 16/5, Office Hours, Custom), per-day active toggles, operating hours window
- **Coverage heatmap**: 7×24 grid (Monday-first rows × hour columns) with covered (green) / gap (amber) / outside (gray) cells
- **Timing section**: anchor date/time picker, day shift start hour selector
- **Shift Overrides**: Enterprise CTA placeholder
- **Holiday Calendar**: notes Slovenian holidays built-in; Enterprise CTA card for custom country/region calendars (mailto: hello@plantpulse.pro)
- Draft-state pattern: all edits local until Save (matches EquipmentSetup/ProcessSetup)
- State: `shiftRotation: ShiftRotation` in Zustand store with `setShiftRotation()` action
- Implementation: `components/planner/ShiftSchedule.tsx` (modal) + `lib/shift-rotation.ts` (data) + `WallboardCanvas.tsx` (rendering)
- CSS: `.pp-shift-section`, `.pp-shift-team-card`, `.pp-shift-preview-*`, `.pp-shift-sequence-*`, `.pp-shift-heatmap-*`, `.pp-shift-operation-*`, `.pp-shift-day-toggle`, `.pp-shift-timing-grid` in `globals.css`

#### 24. Capacity Utilization panel (Planner sidebar, modern, no VBA equivalent)

- **Location**: Planning Tools sidebar → "Capacity Utilization" collapsible section (collapsed by default)
- **Purpose**: Live MAM-aligned capacity calculator; derives all numbers from the Zustand store — no separate data entry required for the core metrics
- **Period selector**: four-button pill row at the top of the panel; analysis window is independent of the planner view window:
  - **View** (default): mirrors the planner's current `viewStart` / `viewEnd`
  - **Quarter**: `startOfQuarter(now)` → `endOfQuarter(now)` (current calendar quarter)
  - **Year**: `startOfYear(now)` → `endOfYear(now)` (current calendar year)
  - **Custom**: two `<input type="date">` pickers (From / To); falls back to View window if range is invalid
- **Capacity hierarchy** (MAM-aligned, computed per equipment group):
  - **Nameplate** = `machineCount × periodDays × 24`
  - **Shutdown hours** = sum of `ShutdownPeriod[]` overlapping the scope window × machineCount
  - **Optimal** = Nameplate − Shutdown
  - **Limiting factor** = Optimal × (user slider %)
  - **Standard capacity** = Optimal − Limiting factor
  - **Idle capacity** = Standard × (user slider %)
  - **Planned utilization** = Standard − Idle
  - **Batch stage hours** = sum of `Stage.startDatetime`→`Stage.endDatetime` clipped to scope window, for all machines in the group
  - **Turnaround hours** = inter-batch gap time attributed to CIP/SIP/media prep (see below)
  - **Scheduled hours** = Batch stage hours + Turnaround hours
  - **Scheduled Util %** = Scheduled / Standard × 100 (headline KPI)
  - **Planned Util %** = Planned / Standard × 100
- **Turnaround hours computation** (key architectural decision):
  - Turnaround activities (`TurnaroundActivity[]`) are **gap rules, not Stage records** — CIP/SIP/media prep time never appears in `Stage[]`
  - For each machine, consecutive stage pairs are walked; the gap is clipped to the scope window; contribution = `min(actual gap hours, requiredTurnaroundGap(group))` — this counts only actual turnaround time, not idle slack
  - Reuses `requiredTurnaroundGap(machineGroup, turnaroundActivities)` from `lib/scheduling.ts` and `turnaroundTotalHours(t)` from `lib/types.ts`
- **Per-group summary rows**: one row per equipment group (sorted by `displayOrder`) showing group name, machine count badge, fill bar (green ≥ 80%, amber 50–79%, red < 50%), and Scheduled Util %
- **Expanded detail card** (click a group row to toggle accordion):
  - Stacked horizontal bar: Shutdown / Limiting / Idle / Turnaround / Batch / Slack segments
  - Turnaround activities breakdown: list of default activities for the group with name + decimal hours, total per batch, event count
  - Full metric list: Nameplate → Shutdown → Optimal → Limiting → **Standard** → Idle → Planned Util → **Scheduled** (bold), with Batch stages and Turnaround as indented sub-rows
- **Assumption sliders** (bottom of panel, affect all groups simultaneously):
  - Limiting factor % (0–50%): bottleneck deduction from Optimal (e.g. downstream constraint limits 3 of 4 vessels → 25%)
  - Idle capacity % (0–30%): reserved slots / extraordinary shutdowns inside Standard capacity
  - Slider values are local component state (not persisted in Free edition)
- **CSS prefix**: `.pp-cap-*` in `globals.css`; `.pp-cap-preset-*` for period buttons; `.pp-cap-date-*` for custom pickers; `.pp-cap-ta-*` for turnaround activity list; `.pp-cap-metric-sub` for indented sub-rows
- **Implementation**: `components/planner/CapacityPanel.tsx` (self-contained component) + wired into `app/planner/page.tsx` as `<SidebarSection title="Capacity Utilization" defaultOpen={false}>`
- **Planning reference**: `docs/plans/capacity-utilization.md` (MAM capacity hierarchy formulas, phasing, open questions)

#### 25. Planner view — density control, selection frame, turnaround activity blocks, clickable chain path

- **Density control**: Three-button segmented pill in the Planner toolbar (compact / comfortable / spacious) that changes the canvas row height. Row heights: compact = 20 px, comfortable = 26 px (default, matches original), spacious = 34 px. Selected density persisted to `localStorage` key `pp.planner.density` (read on mount, updated on change). Only the Planner view honours it; the Wallboard page uses its fixed default of 26 px by not passing the `rowHeight` prop.
  - Toolbar UI: `.pp-density-toggle` pill next to the Day/Week/Month/Quarter segmented control; each button uses `.pp-density-icon` (3 horizontal lines with varying `marginTop` conveying the row spacing); active state via `.pp-density-btn--active` (white background, inset border)
  - Plumbing: `rowHeight` prop on `WallboardCanvas` replaces the hardcoded `const ROW_HEIGHT = 26` constant, which is now the prop default. All dependent layout (row layout, backgrounds, bar positioning, hold-risk indicators, all hit-test callbacks) use the dynamic `rowHeight` value.

- **Selection frame**: When a batch bar is clicked, a 2 px outline is drawn 2 px outset around the bar on the canvas. Previously `selectedStageId` only updated the sidebar inspector with no visual feedback on the canvas itself.
  - Implementation: `selectedStageId?: string | null` prop added to `WallboardCanvasProps`; in `drawBatchBars()` after the bar fill/border, `ctx.strokeRect(left-2, barY-2, width+4, BAR_HEIGHT+4)` with `lineWidth=2` and colour `theme.selectionOutline`. New theme key `selectionOutline` added to both `DAY_THEME` (`#2563eb` pharma blue) and `NIGHT_THEME` (`#22d3ee` cyan).

- **Clickable chain path in sidebar inspector**: Each step in the "Chain Path" list in `StageInspector` is a `<button>` that switches `selectedStageId` to that stage, scrolling focus within the inspector and moving the canvas selection outline to the new bar. The current stage is rendered as a disabled button (no click). Previously all steps were non-interactive `<div>` elements.
  - Implementation: `onSelectStage: (stageId: string) => void` prop added to `StageInspector`; steps use `<button onClick={() => onSelectStage(s.id)} disabled={isCurrent}>`; call site passes `setSelectedStageId`. CSS: `.planner-chain-step` updated from `<div>` to `<button>` styles with hover/focus/disabled states in `globals.css`.

- **Chain connector overlay**: When a stage is selected, an absolute-positioned `<svg>` sibling to the `<canvas>` (inside the same `position: relative` container) draws dashed pharma-blue lines from each stage's trailing edge to the next stage's leading edge in the selected chain, with rounded L-elbows when stages hop between vessels and a small white-bordered dot anchoring each landing. Scoped to the selected chain only — no visual noise when nothing is picked.
  - Algorithm: filter all stages by the selected stage's `batchChainId`; sort by `startDatetime`; for each consecutive pair compute X endpoints via `stageBarPosition()` (trailing edge of cur, leading edge of nxt) and Y centers from the row layout (`row.y + rowHeight / 2`). Build SVG `path d=` using `M…L` for same-row links and an `M…L…Q…L…Q…L` rounded-elbow form for inter-row links (`r = min(6, |dx|/2, |dy|/2)`, `midX = x1 + clamp((x2-x1)*0.5, 8, 40)`). Pairs fully off-screen are skipped.
  - Density resilience: uses the live `rowHeight` and same `rows` map that drives canvas rendering — compact/comfortable/spacious all stay aligned automatically. No DPR compensation needed (SVG uses CSS pixels directly).
  - Colors: day mode uses `#2563eb` (matches the selection-outline pharma blue); night mode uses `#22d3ee` cyan via the `pp-chain-connector--night` modifier. Path stroke `1.5px` with `stroke-dasharray: 3 3` and a 1px white drop-shadow for legibility over batch bars.
  - Wallboard: not rendered (Wallboard never sets `selectedStageId`, so the overlay never activates — no opt-out flag needed).
  - PDF export: not captured (export reads the `<canvas>` pixel data; the SVG sibling is interactive guidance, not part of the printed schedule).
  - Implementation: `chainConnectorSegments` `useMemo` in `WallboardCanvas.tsx` keyed on `selectedStageId, stages, batchChains, productLines, rows, dims.width, rowHeight, viewConfig`. CSS: `.pp-chain-connector-path`, `.pp-chain-connector-dot`, `.pp-chain-connector--night` in `globals.css`.
  - **Canonical chain order**: chain is sorted by the product line's `stageDefaults` sequence (via `orderedChainStageIds()` in `lib/seed-train.ts`), not by `startDatetime`. This means dragging an upstream stage past its downstream stage doesn't reverse the connector direction. Falls back to `startDatetime` sort only when the chain or product line can't be resolved (orphaned data).
  - **Viewport-only lines**: connector lines are drawn ONLY between consecutive chain pairs where both endpoints (trailing edge of cur, leading edge of nxt) fall inside `[LEFT_MARGIN, dims.width]`. When one endpoint is off-canvas, the line is not drawn at all — it's replaced by a row-anchored breadcrumb pill (see below). This eliminates the long horizontal segments and many-row vertical crossings that earlier midX-clamping / U-bow mitigations couldn't fully suppress.
  - **Edge breadcrumb pills**: when a chain continues off-canvas, a small rounded pill anchored to the visible stage's row indicates the off-canvas neighbour. Format: `← {machine} · {batch}` on the leading edge of the visible stage when the previous chain step is off-canvas; `{machine} · {batch} →` on the trailing edge when the next step is off-canvas. Pills are rendered as positioned `<div>` siblings to the SVG (inside the same canvas container, same pattern as the drag-ghost). Style: 18 px height, rounded pill, pharma-blue tint in day (`#1d4ed8` text on `rgba(37,99,235,0.10)`), cyan in night (`#67e8f9` on `rgba(34,211,238,0.14)`). CSS: `.pp-chain-breadcrumb`, `.pp-chain-breadcrumb--prev`, `.pp-chain-breadcrumb--next`, `.pp-chain-breadcrumb--night`.
  - **Backward chains (handoff overlap)**: when `x2 < x1` for two visible stages on different rows, the connector draws a deliberate right-down-left U-bow under the bars (`midY = max(y1,y2) + rowHeight*0.55`, `pad = 12`) instead of a straight diagonal, so chain overlap reads as intentional rather than a render bug.
  - **Safety nets**: (1) `midX` for the rounded L-elbow is clamped into `[LEFT_MARGIN+4, dims.width-4]` as belt-and-suspenders, even though both endpoints are guaranteed visible by the viewport-only rule. (2) A `<clipPath id="pp-chain-connector-clip">` inside the SVG bounds path geometry to `[LEFT_MARGIN-16, dims.width+16]` × full height; applied to `<path>` only, never to `<circle>` so landing dots near the edge survive.

- **Light polish**: now-line redrawn as dashed `[2, 4]` segments with a glowing dot at the top (was a solid line with a triangle). Active segmented-control buttons (`planner-viewmode-btn--active`, `pp-density-btn--active`) get a subtle raised shadow. Canvas hover tooltip (`.pp-downtime-tooltip`) restyled to a dark `#0f1216` background with monospace uppercase title — matches the modern lab-control-room aesthetic without changing any layout.

- **Turnaround activity blocks**: Subtle diagonal-hatch blocks rendered around each batch on its machine lane — pre-phase activities (CIP → Media → SIP) walk backward from `stage.startDatetime`, post-phase activities (Transfer, Handoff, Cleaning) walk forward from `stage.endDatetime`. Drawn *before* batch bars so the production batch always wins visual hierarchy.
  - Algorithm (per machine, per stage): split default activities by `phase` field. Post-chain: forward-walk cursor from `stage.endDatetime`, clipped at the next batch's start so blocks never bleed across batches. Pre-chain: backward-walk cursor from `stage.startDatetime` (reversed order so the last pre activity ends exactly at batch start), clipped at the previous batch's end. Block height ≈ 55 % of `rowHeight`, vertically centred.
  - Colors: CIP = neutral gray hatch, Media = muted blue hatch, SIP = amber hatch; all very low alpha so they don't compete with bars. Night mode uses slightly higher alpha values.
  - Labels: short activity name (first 3 chars uppercase) visible at block width ≥ 22 px; full name at ≥ 60 px.
  - **Planner toolbar toggle** "Turnaround": pp-turnaround-toggle button after the density pill. ON = blocks visible; OFF = production batches only (simplified scheduling focus). Toggle is **visualization-only** — scheduling integrity (`requiredTurnaroundGap()` in `lib/scheduling.ts`) reads from the store regardless of the toggle, so drag/move/stretch operations and batch-chain movement always respect turnaround constraints even when hidden. Persisted in `localStorage` key `pp.planner.showTurnaround` (default `true`).
  - Props: `showTurnaroundBlocks?: boolean` (default `false`; Planner passes the toggle state, Wallboard omits to keep its view clean).
  - Function `drawTurnaroundBlocks()` in `WallboardCanvas.tsx`. Uses `turnaroundActivities` from the Zustand store and `machineGroupMap` already computed for hold-risk.
  - CSS: `.pp-density-*`, `.pp-turnaround-toggle*` classes in `globals.css`.

---

## Target Data Model (Modern)

Based on the masterplan vision + VBA reality:

### Core entities

```typescript
// Equipment groups are user-configurable (not a fixed enum).
// Machine.group and TurnaroundActivity.equipmentGroup store EquipmentGroup.id strings.
type MachineGroup = string;

interface EquipmentGroup {
  id: string;             // stable key, e.g. "propagator", "fermenter", "bioreactor"
  name: string;           // display label, e.g. "Propagator", "Fermenter"
  shortName: string;      // toolbar chip label, e.g. "PR", "F", "BIO"
  displayOrder: number;   // controls filter button order and general sort
}

// Product lines are user-configurable. GNT/KK are the legacy defaults used
// in demo data. Users can add/rename/remove product lines and their associated
// machines, stage types, and default durations.
interface ProductLine {
  id: string;             // user-defined, e.g. "GNT", "KK", "API-X"
  name: string;           // display name, e.g. "Gentamicin", "KK Line"
  shortName: string;      // compact label for chips/headers, e.g. "GNT", "KK"
  stageDefaults: StageDefault[];  // ordered seed train template
  displayOrder: number;
}

interface StageDefault {
  stageType: string;      // references StageTypeDefinition.id, e.g. "inoculum", "seed_n2", "seed_n1", "production"
  defaultDurationHours: number;
  minDurationHours?: number;     // optional floor; defaults to target × 0.9
  maxDurationHours?: number;     // optional ceiling; defaults to target × 1.1
  machineGroup: string;   // which machine group to pick from
}

// Stage type definition — user-configurable stage types for the seed train.
// Literature-aligned defaults: Inoculum → Seed (n-2) → Seed (n-1) → Production
interface StageTypeDefinition {
  id: string;             // stable key, e.g. "inoculum", "seed_n2", "production"
  name: string;           // display label, e.g. "Inoculum", "Seed (n-2)"
  shortName: string;      // compact label for bars/chips, e.g. "INO", "n-2"
  description?: string;   // optional note
  count: number;          // instances per batch chain (e.g. 2 if two inoculum vessels per chain)
  displayOrder: number;   // controls dropdown and display sort order
}

// Machine unavailability window — excludes machine from planning while active.
// If endDate is undefined the machine is unavailable indefinitely.
interface MachineDowntime {
  startDate: Date;
  endDate?: Date;         // undefined = indefinite (until manually cleared)
  reason?: string;        // optional note, e.g. "CIP rebuild", "Inspection"
}

interface Machine {
  id: string;             // e.g. "F-2", "PR-1"
  name: string;           // display name
  group: MachineGroup;    // user-defined equipment group (references EquipmentGroup.id)
  productLine?: string;   // assigned product line, or null if shared
  displayOrder: number;
  downtime?: MachineDowntime;            // one-time unavailability window
  recurringDowntime?: RecurringDowntimeRule[];  // repeating unavailability rules
}

interface BatchChain {
  id: string;             // unique chain identifier
  batchName: string;      // human-readable (e.g. "GNT-142")
  seriesNumber: number;   // legacy series_id
  productLine: string;    // references ProductLine.id
  status: "draft" | "proposed" | "committed";
  // Enterprise ERP fields omitted for Free edition
}

interface Stage {
  id: string;
  machineId: string;
  batchChainId: string;
  stageType: string;      // references StageTypeDefinition.id, e.g. "inoculum", "seed_n2", "seed_n1", "production"
  startDatetime: Date;    // "nacep" equivalent
  endDatetime: Date;      // "precep" equivalent
  state: "planned" | "active" | "completed";
}

// Display groups are auto-derived from product line + machine assignments
// via buildDisplayGroups(). No manual machine-to-group checkbox grid needed.
interface MachineDisplayGroup {
  id: string;
  name: string;
  machineIds: string[];
}

interface CheckpointTask {
  id: string;
  machineId: string;
  plannedDatetime: Date;
  taskCode: string;
  description: string;
  status: "planned" | "done" | "not_possible";
  confirmedBy?: string;
  confirmedAt?: Date;
  comment?: string;
  batchChainId?: string;  // derived by overlap
}

interface MaintenanceTask {
  id: string;
  machineId: string;
  plannedStart: Date;
  plannedEnd: Date;
  taskCode: string;
  taskType: string;
  status: "planned" | "acknowledged" | "not_possible";
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  comment?: string;
}

// Turnaround activity type — defines required gap activities between batches
// (e.g. CIP, SIP, Cleaning). Configured per equipment group in Process Setup.
export type TurnaroundPhase = 'pre' | 'post';
export type ValidityUnit = 'h' | 'd' | 'w';

interface TurnaroundActivity {
  id: string;
  name: string;               // user-defined label, e.g. "CIP", "SIP", "Cleaning"
  durationDays: number;       // days component of duration
  durationHours: number;      // hours component of duration
  durationMinutes: number;    // minutes component of duration
  equipmentGroup: string;     // references EquipmentGroup.id
  isDefault: boolean;         // if true, auto-inserted when scheduling new batches
  phase?: TurnaroundPhase;    // 'pre' = before next batch (default), 'post' = after current batch
  validityValue?: number;     // how long the activity stays valid; 0 = no expiry
  validityUnit?: ValidityUnit; // 'h' | 'd' | 'w' — unit for validityValue
  autoRepeat?: boolean;       // re-run if validity expires before next batch starts
  productChangeoverOnly?: boolean; // only apply when adjacent batch is a different product line (default: false)
  description?: string;       // optional operator note
}

// Helper functions exported from lib/types.ts:
// turnaroundTotalHours(t)    — duration in hours (days×24 + hours + minutes/60)
// turnaroundValidityHours(t) — validity window in hours (0 if validityValue is 0 or undefined)
// normalizeTurnaroundActivity(t) — infers phase/validity from name patterns; idempotent

// Planned shutdown period — blocks all machines for the duration.
// Used for plant-wide shutdowns, annual maintenance windows, etc.
interface ShutdownPeriod {
  id: string;
  name: string;            // e.g. "Annual Shutdown 2026", "Christmas Break"
  startDate: Date;
  endDate: Date;           // midnight of the LAST shutdown day (inclusive). scheduling.ts
                           // uses shutdownEnd(s) = addDays(endDate, 1) as the exclusive
                           // upper bound so that the entire last day is blocked.
  reason?: string;         // optional note
}

// Per-line naming rule — configures how batch names are generated.
// The final production stage sets the batch name; upstream stages inherit it.
interface BatchNamingRule {
  prefix: string;           // optional prefix, e.g. "GNT-", "KK-" (may be empty)
  suffix: string;           // optional suffix appended after the counter
  startNumber: number;      // first counter value after reset (default 1)
  padDigits: number;        // zero-padding width, e.g. 3 → "001"
  step: number;             // counter increment per batch (default 1)
  nextNumber?: number;      // current counter (used when counterResetMode === 'none')
}

// Top-level naming configuration stored in the Zustand store.
interface BatchNamingConfig {
  mode: 'shared' | 'per_product_line';          // one rule for all lines vs. one per line
  sharedRule: BatchNamingRule;                   // used when mode === 'shared'
  productLineRules: Record<string, BatchNamingRule>; // keyed by ProductLine.id
  counterResetMode: 'annual' | 'custom' | 'none';  // when counter resets
  counterResetMonth: number;                     // 1-12 (default 1 = January)
  counterResetDay: number;                       // 1-31 (default 1)
}

interface ShiftTeam {
  name: string;           // e.g. "Blue", "Alpha", "Team A"
  color: string;          // hex color for shift band, e.g. "#0066FF"
}

interface ShiftOverride {
  date: Date;
  shiftIndex: number;     // 0 = day, 1 = night (relative to shift boundaries)
  teamIndex: number;      // which team takes this slot
  reason?: string;
}

interface ShiftRotation {
  teams: ShiftTeam[];         // user-configurable (default 4 teams)
  shiftLengthHours: number;   // variable: 6, 7.5, 8, 12 (set by rotation preset)
  cyclePattern: number[];     // team indices, e.g. [0,2,1,3,2,0,3,1]
  anchorDate: Date;           // cycle alignment reference point
  dayShiftStartHour: number;  // when day shift begins (default 6)
  overrides: ShiftOverride[]; // Enterprise only
  // Plant coverage fields:
  activeDays: boolean[];          // [Sun, Mon, Tue, Wed, Thu, Fri, Sat] — which days are operational
  operatingHoursStart: number;    // 0–23, plant opens (used for non-24h operation)
  operatingHoursEnd: number;      // 0–24, plant closes (24 = midnight = 24h continuous)
}

// Recurring machine unavailability rule — generates periodic downtime windows.
type RecurrenceType = 'weekly' | 'monthly';

interface RecurringDowntimeRule {
  id: string;
  recurrenceType: RecurrenceType;
  dayOfWeek?: number;     // 0=Sun … 6=Sat (when recurrenceType === 'weekly')
  dayOfMonth?: number;    // 1–31 (when recurrenceType === 'monthly')
  startHour: number;      // 0–23: time-of-day the window starts
  startMinute: number;    // 0–59
  durationHours: number;  // length of each unavailability window
  startDate: Date;        // recurrence validity start
  endDate?: Date;         // optional recurrence validity end (undefined = indefinite)
  reason?: string;
}
```

### Mapping VBA → Modern

| VBA concept | Modern equivalent |
|-------------|-------------------|
| `BigReadArray` | In-memory Zustand store (Stage[], BatchChain[], Machine[], etc.) |
| `imena` array | Machine[] with displayOrder; display groups auto-derived via `buildDisplayGroups()` |
| Hardcoded vessel groups | EquipmentGroup[] — user-configurable via Equipment Setup modal |
| `serija` number | BatchChain.seriesNumber |
| `DodaneNoveSerije` staging | Draft batch chain creation |
| `Premik` bulk shift | `bulkShiftStages()` store action with cutoff filter |
| `ObdelavaSerija` form | Side panel / modal stage editor |
| `NovaSer` form | "Add new batch chain" wizard |
| `DynBtn` click handlers | Stage bar click → detail panel |
| ADODB Excel connection | Excel import/parse (Free) or DB query (Enterprise) |
| PowerPoint shape rendering | Canvas/SVG timeline rendering |
| UserForm maximize/restore | Responsive layout |
| *(no VBA equivalent)* | TurnaroundActivity — gap activities between batches (CIP/SIP/Cleaning) |
| *(no VBA equivalent)* | ShutdownPeriod — plant-wide shutdown windows |
| *(no VBA equivalent)* | MachineDowntime — per-machine unavailability windows |
| *(no VBA equivalent)* | StageTypeDefinition — user-configurable stage types (Inoculum, Seed n-2, Seed n-1, Production) with count per chain |
| *(no VBA equivalent)* | BatchNamingConfig — batch nomenclature rules (prefix, suffix, step, counter reset, per-line or shared) |
| Hardcoded 4-team 12h shift cycle | ShiftRotation — configurable teams, presets, variable shift lengths, plant coverage, gap detection |
| *(no VBA equivalent)* | RecurringDowntimeRule — periodic machine unavailability (weekly/monthly recurrence) |
| *(no VBA equivalent)* | CapacityUtilization panel — MAM-aligned Nameplate→Optimal→Standard→Planned→Scheduled hierarchy per equipment group; turnaround hours inferred from inter-batch gaps |

---

## Recommended Technology Stack

### Free Edition MVP (browser-only, no server required)

**Privacy architecture:** The Free Edition is a pure static site (`output: 'export'`).
It makes four verifiable guarantees: browser-only (no server process), zero server
roundtrips (no fetch/API/DB), no cookies, and no telemetry. All data lives in-memory
via Zustand and resets on reload. Excel import/export is the only data pathway.
Any new feature must preserve these guarantees — do not add analytics, tracking,
external network calls, cookies, or server-side API routes to the Free Edition.

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | **Next.js 15 + TypeScript** | App Router, static export for Free edition |
| Timeline rendering | **HTML Canvas** (with SVG overlay for interactive elements) | Performance for 30+ rows × 25+ days of bars; VBA pixel math maps directly |
| State management | **Zustand** | Lightweight, replaces BigReadArray as the in-memory store |
| Excel I/O | **SheetJS (xlsx)** | Read/write .xlsx for import/export, matches ADODB pattern |
| PDF export | **html2canvas + jsPDF** | Client-side A4 landscape PDF generation from canvas capture (Schedule view) |
| Date handling | **date-fns** | Lightweight, tree-shakeable, handles DateDiff/DateAdd equivalents |
| Styling | **Tailwind CSS** | Utility-first, matches design-guidelines typography/color system |
| Testing | **Vitest + Testing Library** | Fast, TypeScript-native |

### Enterprise (later phases)

| Layer | Technology |
|-------|-----------|
| Database | PostgreSQL |
| Auth | NextAuth.js → SSO (SAML/OIDC) |
| API | Next.js API routes or tRPC |
| Audit | Append-only audit table with immutability constraints |
| Deployment | Docker, single-tenant per customer |

---

## Project Structure (target)

```
plantpulse.pro/
├── CLAUDE.md                    # This file
├── README.md                    # Project introduction
├── .gitignore
├── docs/
│   ├── masterplan.md            # Vision document
│   ├── app-flow-pages-and-roles.md  # UX specification
│   ├── design-guidelines.md     # Visual design system
│   ├── implementation-plan.md   # Phased build plan
│   └── legacy/                  # Original VBA macro extracts (reference only)
│       ├── FormaZaPlan_macros.txt
│       ├── InfoTabla20180201_macros.txt
│       └── Izberidatum5_macros.txt
├── src/
│   ├── app/                     # Next.js App Router pages
│   │   ├── page.tsx             # Landing / session start
│   │   ├── wallboard/           # Manufacturing Wallboard (Operator lens)
│   │   ├── planner/             # Planner View (modern UrediPlan)
│   │   ├── inoculum/            # Schedule View (+ PDF export)
│   │   └── admin/               # Admin Settings (Enterprise)
│   ├── components/
│   │   ├── timeline/            # Core timeline engine (Phase 2)
│   │   │   ├── TimelineCanvas.tsx
│   │   │   ├── TimelineHeader.tsx
│   │   │   ├── MachineColumn.tsx
│   │   │   ├── StageBar.tsx
│   │   │   ├── NowLine.tsx
│   │   │   ├── ShiftBand.tsx
│   │   │   └── CalendarGrid.tsx
│   │   ├── planner/             # Planner-specific components
│   │   │   ├── ChainEditor.tsx
│   │   │   ├── BulkShiftTool.tsx
│   │   │   ├── NewChainWizard.tsx
│   │   │   ├── StageDetailPanel.tsx
│   │   │   ├── EquipmentSetup.tsx  # Equipment Setup modal (4 tabs)
│   │   │   └── ProcessSetup.tsx    # Process Setup modal (5 tabs)
│   │   ├── wallboard/           # Wallboard-specific components
│   │   │   ├── TaskArrow.tsx
│   │   │   └── MaintenanceMarker.tsx
│   │   └── ui/                  # Shared UI primitives
│   ├── utils/
│   │   └── exportSchedulePdf.ts # PDF export logic, settings I/O, timestamp helper
│   ├── settings/
│   │   └── PrintSettings.tsx    # Print Settings modal (localStorage-persisted)
│   ├── lib/
│   │   ├── store.ts             # Zustand store — CRUD for all entities (Stage, BatchChain, Machine, MachineDisplayGroup, ProductLine, TurnaroundActivity, EquipmentGroup, ShutdownPeriod, StageTypeDefinition, BatchNamingConfig) + wallboardEquipmentGroups
│   │   ├── excel-io.ts          # SheetJS import/export
│   │   ├── timeline-math.ts     # Pixel geometry (ported from VBA)
│   │   ├── scheduling.ts        # Overlap detection, auto-scheduling, bulk shift
│   │   ├── seed-train.ts        # Chain creation with back-calculation
│   │   ├── shift-rotation.ts    # 4-team, 12h, 8-step cycle
│   │   ├── holidays.ts          # Slovenian holidays + Easter algorithm
│   │   ├── colors.ts            # Deterministic batch color cycling
│   │   ├── useNightMode.ts      # Wallboard night/day auto-switch hook
│   │   └── types.ts             # TypeScript interfaces
│   └── __tests__/               # Test files mirroring src structure
├── public/
│   └── templates/               # Excel template files for download
│       ├── schedule-template.xlsx
│       └── maintenance-template.xlsx
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

---

## Development Workflow

### Getting started

```bash
npm install
npm run dev          # Start development server
npm run build        # Production build
npm run test         # Run tests
npm run lint         # Run linter
```

### Build order (Phase 1–6 for Free MVP)

1. **`lib/types.ts`** — Define all TypeScript interfaces (done: includes EquipmentGroup, MachineDowntime, RecurringDowntimeRule, TurnaroundActivity, ShutdownPeriod, MachineDisplayGroup, StageTypeDefinition, BatchNamingRule, BatchNamingConfig, ShiftTeam, ShiftOverride, ShiftRotation; StageType is `string` referencing StageTypeDefinition.id)
2. **`lib/excel-io.ts`** — Import from legacy `.xlsx` format + export
3. **`lib/store.ts`** — Zustand store with CRUD for all entities (done: Stage, BatchChain, Machine, MachineDisplayGroup, ProductLine, TurnaroundActivity, EquipmentGroup, ShutdownPeriod, StageTypeDefinition, BatchNamingConfig, ShiftRotation + bulkShiftStages + stageTypesMode)
4. **`lib/timeline-math.ts`** — Port the VBA pixel geometry functions
5. **`lib/holidays.ts`** — Slovenian holidays + Gauss Easter
6. **`lib/colors.ts`** — `seriesNumber mod 12` color palette
7. **`lib/shift-rotation.ts`** — Configurable shift rotation (done: multi-preset support, variable shift lengths, plant coverage with gap detection, `ShiftCoverageConfig`, `isShiftCoveredAt()`)
8. **`components/timeline/`** — Core timeline renderer
9. **`app/wallboard/`** — Operator wallboard view (read-only + task confirm)
10. **`lib/scheduling.ts`** + **`lib/seed-train.ts`** — Business rules engine
11. **`components/planner/EquipmentSetup.tsx`** — Equipment Setup modal: Machines (with downtime, section headers, smart insertion), Equipment Groups, Product Lines (with shortName), Wallboard Display (done)
12. **`components/planner/ProcessSetup.tsx`** — Process Setup modal: Stage Types (with count), Stage Defaults, Turnaround Activities, Shutdowns, Naming (done)
13. **`components/planner/`** — Interactive planning tools (ChainEditor, BulkShiftTool, NewChainWizard, StageDetailPanel)
14. **`app/planner/`** — Planner view with draft editing

### Excel template schema (Phase 1)

**Schedule template (`schedule-template.xlsx`, Sheet1):**

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | `pososda` | string | Machine/vessel name (must match machines list) |
| B | `nacep` | datetime | Inoculation/start datetime |
| C | `precep` | datetime | Transfer/end datetime |
| D | `serija` | integer | Series/batch number |

**Task template (same file or separate, Sheet2 or Opravila sheet):**

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | `pososda` | string | Machine/vessel name |
| B | `nacep` | datetime | Task planned datetime |
| C | `opis` | string | Task description |
| D | `status` | string | "planned" / "done" / "not_possible" |

**Maintenance template (`maintenance-template.xlsx`):**

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | `pososda` | string | Machine/vessel name |
| B | `zacetek` | datetime | Planned window start |
| C | `konec` | datetime | Planned window end |
| D | `tip` | string | Maintenance type code |
| E | `status` | string | "planned" / "acknowledged" / "not_possible" |

### Import validation rules

- All headers must match expected names
- All datetimes must parse correctly
- All machine names must exist in the machines list
- `nacep` must be <= `precep` (start <= end)
- `serija` must be a positive integer
- Duplicate entries (same machine + same start + same series) are flagged

---

## Color Palette

### Batch bar colors (12-color cycle, from VBA `barva` variable)

| Index | Name | RGB | Hex |
|-------|------|-----|-----|
| 0 | Light blue | (92, 173, 255) | `#5CADFF` |
| 1 | Orange | (255, 153, 0) | `#FF9900` |
| 2 | Indigo | (0, 102, 255) | `#0066FF` |
| 3 | Teal | (5, 255, 255) | `#05FFFF` |
| 4 | Sky | (102, 204, 255) | `#66CCFF` |
| 5 | Cyan | (87, 235, 255) | `#57EBFF` |
| 6 | Red | (255, 0, 0) | `#FF0000` |
| 7 | Novartis red | (228, 76, 22) | `#E44C16` |
| 8 | Carmine | (253, 15, 15) | `#FD0F0F` |
| 9 | Novartis maroon | (169, 7, 1) | `#A90701` |
| 10 | Dark olive | (40, 70, 10) | `#28460A` |
| 11 | Black | (0, 0, 0) | `#000000` |

### Wallboard border colors (5-color cycle)

| Index | RGB | Hex |
|-------|-----|-----|
| 0 | (56, 93, 138) | `#385D8A` |
| 1 | (195, 3, 8) | `#C30308` |
| 2 | (222, 202, 54) | `#DECA36` |
| 3 | (2, 2, 5) | `#020205` |
| 4 | (119, 158, 56) | `#779E38` |

### Shift team colors

| Team | RGB | Hex |
|------|-----|-----|
| 0 | (0, 102, 255) | `#0066FF` |
| 1 | (0, 204, 0) | `#00CC00` |
| 2 | (255, 0, 0) | `#FF0000` |
| 3 | (255, 253, 0) | `#FFFD00` |

### Semantic colors (from design-guidelines.md)

| Purpose | Use |
|---------|-----|
| Task planned | Red indicator |
| Task done | Green + checkmark |
| Warning | Amber + icon + label |
| Critical | "CRITICAL" chip + required comment |
| Weekend | Yellow with transparency (wallboard) / highlighted (planner) |
| Holiday | Red with hatched pattern |
| Today column | Light grey shading |
| Now-line | Dark red, semi-transparent vertical line |

---

## Key Algorithms to Port

### 1. Gauss Easter Algorithm (holidays.ts)

```typescript
function easterMonday(year: number): Date {
  const g = year % 19;
  const c = Math.floor(year / 100);
  const h = (c - Math.floor(c / 4) - Math.floor((8 * c + 13) / 25) + 19 * g + 15) % 30;
  const i = h - Math.floor(h / 28) * (1 - Math.floor(29 / (h + 1)) * Math.floor((21 - g) / 11));
  const j = (year + Math.floor(year / 4) + i + 2 - c + Math.floor(c / 4)) % 7;
  const l = i - j;
  const month = 3 + Math.floor((l + 40) / 44);  // 1-indexed
  const day = l + 28 - 31 * Math.floor(month / 4);
  // Easter Sunday + 1 = Easter Monday
  return new Date(year, month - 1, day + 1);
}
```

### 2. Timeline pixel math (timeline-math.ts)

```typescript
function stageBarPosition(
  viewStart: Date,
  stageStart: Date,
  stageEnd: Date,
  canvasWidth: number,
  leftMargin: number,
  numberOfDays: number
): { left: number; width: number } {
  const pixelsPerDay = (canvasWidth - leftMargin) / numberOfDays;
  const hoursFromViewStart = differenceInHours(stageStart, viewStart);
  let left = leftMargin + hoursFromViewStart * (pixelsPerDay / 24);
  let width = differenceInHours(stageEnd, stageStart) * (pixelsPerDay / 24);

  // Partial-left-edge clipping
  if (left < -leftMargin) {
    left = leftMargin;
    width = 5; // indicator dot only
  } else if (left < leftMargin) {
    width = width + (left - leftMargin);
    left = leftMargin;
    if (width < 0) width = 5;
  }

  return { left, width };
}
```

### 3. Shift rotation (shift-rotation.ts)

```typescript
const CYCLE = [0, 2, 1, 3, 2, 0, 3, 1]; // 8-step, 12h each = 4 days

function currentShiftTeam(now: Date, anchorDate: Date): number {
  const hoursSinceAnchor = differenceInHours(now, anchorDate);
  const shiftIndex = Math.floor(hoursSinceAnchor / 12);
  return CYCLE[((shiftIndex % CYCLE.length) + CYCLE.length) % CYCLE.length];
}
```

### 4. Seed train back-calculation (seed-train.ts)

Uses the product line's `stageDefaults` array to back-calculate from the
final stage. Works with any number of stages and any user-defined durations.
Supports `stageTypeCounts` for expanding stages with count > 1.

```typescript
// Expand stage defaults by count (e.g. Seed n-1 count=2 → two n-1 entries)
function expandStageDefaults(
  stageDefaults: StageDefault[],
  stageTypeCounts?: Map<string, number>
): StageDefault[] {
  if (!stageTypeCounts || stageTypeCounts.size === 0) return stageDefaults;
  const expanded: StageDefault[] = [];
  for (const sd of stageDefaults) {
    const count = stageTypeCounts.get(sd.stageType) ?? 1;
    for (let c = 0; c < count; c++) expanded.push(sd);
  }
  return expanded;
}

// Generic: works with any product line configuration
function backCalculateChain(
  finalStageStart: Date,
  stageDefaults: StageDefault[],
  stageTypeCounts?: Map<string, number>
): BackCalculatedStage[] {
  const expanded = expandStageDefaults(stageDefaults, stageTypeCounts);
  // ... walks backwards from final stage, computing start/end for each
}

// Modern defaults (4-stage seed train, literature-aligned naming):
// GNT: inoculum 24h, seed_n2 48h, seed_n1 55h, production (variable)
// KK:  inoculum 24h, seed_n2 44h, seed_n1 20h, production (variable)

```

---

## Coding Conventions

- **Language:** TypeScript with strict mode
- **Formatting:** Prettier (defaults)
- **Naming:** camelCase for variables/functions, PascalCase for components/types
- **Dates:** Always use `Date` objects internally; format only at display boundaries
- **State mutations:** Via Zustand actions only; never mutate store directly
- **Canvas rendering:** Separate draw functions per visual layer (background, grid, bars, tasks, now-line, shift band) — draw in back-to-front order
- **VBA comments preserved:** When porting VBA logic, add a comment referencing the original VBA Sub/Function name (e.g. `// Ported from: RisemPlan_z_Gumbi()`)
- **No Slovenian in new code:** Use English for all identifiers, but preserve Slovenian terms in comments when referencing VBA originals (nacep = inoculation, precep = transfer, pososda = vessel)

---

## Glossary (Slovenian VBA → English)

| Slovenian | English | Context |
|-----------|---------|---------|
| nacep / nacepitev | inoculation | Start datetime of a stage |
| precep / precepitev | transfer | End datetime of a stage |
| pososda / posoda | vessel | Machine/fermenter name |
| serija | series / batch | Batch chain identifier |
| fermentor | fermenter | Production vessel |
| izmena | shift | Work shift (12h) |
| opravilo / opravila | task(s) | Checkpoint tasks |
| prekrivanje | overlap | Schedule conflict |
| premik | shift/move | Bulk time-shift operation |
| risem | draw/render | Timeline rendering |
| gumb / gumbi | button(s) | Interactive bar elements |
| koledar | calendar | Background date grid |
| praznik / prazniki | holiday(s) | Public holidays |
| velikonoč | Easter | Easter date |
| danes | today | Current date highlight |
| dolžina | length/duration | Time duration |
| širina | width | Pixel width |
| začetek | start/beginning | Start position |
| brisi | delete/clear | Clear/remove elements |
| buča | baffled Erlenmeyer flask | Inoculum-scale cultivation vessel; prefix B- in nomenclature (BKK for KK line, BGNT for GNT line) |
| shrani | save | Save changes |
| zapri | close | Close form |
| preveri | check/validate | Validation |
