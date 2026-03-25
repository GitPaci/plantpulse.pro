# Gaps and Open Questions

Known gaps in the specification, organized by what blocks the Free MVP build
versus what can wait for Enterprise phases.

---

## Decisions Made

### Free Edition Product Strategy (decided)

The Free edition is a **self-service demo that doubles as a lead generation tool**
for Enterprise sales.

**User flow:**
1. User visits plantpulse.pro
2. Sees a landing page explaining what PlantPulse does
3. Clicks "Try it" -> enters the app with **randomly generated demo data**
   (realistic 2-week batch chain schedule across GNT + KK lines)
4. User can explore the Wallboard and Planner views, edit bars, try the tools
5. User can **export to Excel** to save their work
6. **Nothing is persisted** between sessions -- next visit generates fresh random data
7. User can **import a previously exported Excel** to pick up where they left off
8. A waitlist/interest capture collects emails from users who want the full
   Enterprise version

**Key decisions:**
- Planner View is included in Free (it's the selling point -- "look how easy this is")
- No accounts, no login, no server-side persistence
- Random data generator replaces the need for a "blank start" or "upload first" flow
- Export is the only way to save; import is the only way to restore
- Waitlist capture uses an external link (mailto or hosted form on a separate domain) — no server component in Free Edition

### Deployment (decided)

**Vercel** is the best fit:
- Native Next.js support (zero config)
- Free tier handles the traffic of a product demo site
- Edge network for fast global loading
- Automatic preview deploys from git branches
- Easy custom domain setup for plantpulse.pro

**Architecture:**
- Next.js with App Router, static export (`output: 'export'`) — pure static site, no SSR
- Landing page: statically generated
- App pages (wallboard, planner, schedule): client-side rendered (all state in Zustand)
- **No API routes** — preserves the four privacy guarantees (browser-only, zero server roundtrips, no cookies, no telemetry)
- Waitlist capture: external link (e.g. mailto:hello@plantpulse.pro or hosted form on a separate domain) — keeps the Free Edition purely static
- Deployable to any static host (Vercel, Netlify, GitHub Pages, S3, etc.)

### Open Questions — Answered

| # | Question | Answer |
|---|----------|--------|
| 1 | Demo data or start blank? | **Random generated data** on every visit. Realistic schedule. |
| 2 | Static export or server? | **Pure static export** (`output: 'export'`). No API routes. Waitlist via external link. |
| 3 | Shift rotation editable in Free? | **Fully configurable** in Free: 9 presets (Russian, Panama, DuPont, Pitman, Navy, etc.), variable shift lengths (6/7.5/8/12h), plant coverage, teams. |
| 4 | Show Planner in Free? | **Yes** — it's the main selling point. |
| 5 | Deploy target? | **Vercel** on plantpulse.pro. |
| 6 | Tasks in same Excel or separate? | Same file, Sheet2. |
| 7 | Maintenance separate import? | Separate file — different update cadence. |

---

## Blocks Free MVP

### 1. Demo Data Generator — RESOLVED (implemented)

**Status:** Fully implemented in `lib/demo-data.ts`.

The generator produces realistic schedules using a **rotating biotech product catalog**
(20 products with daily-seeded shuffle). Each session gets 2 randomly selected product
lines with their machines and stage durations — all configurable by the user after load.

**What it produces:**
- 2 product lines (randomly selected from 20-product catalog) with machines and stage durations
- 8-15 active batch chains across those product lines
- Each chain with correct seed train stages (driven by product line's stageDefaults)
- Realistic durations from the default config
- Some chains completed (in the past), some active (spanning now), some planned (future)
- A few checkpoint tasks (mix of planned/done/not_possible)
- A few maintenance tasks
- No impossible overlaps, but maybe 1-2 tight fits to make it interesting
- Anchored to the current date so the wallboard now-line always shows activity

**Decision made:** Moderately busy — enough to fill the screen, not so much it overwhelms.
Product line shortName limited to 3 chars; Naming tab auto-defaults prefix from shortName.

### 2. Excel Template Schemas — MOSTLY RESOLVED

The Free edition's data layer is Excel import/export. The import parser and export
logic are fully implemented in `lib/excel-io.ts`.

**What's defined:** Column names and types in CLAUDE.md (pososda, nacep, precep, serija).

**Implemented:**
- `parseScheduleXlsx` / `exportScheduleXlsx` — schedule I/O with header validation, machine matching, series grouping
- `parseMaintenanceXlsx` / `exportMaintenanceXlsx` — maintenance task I/O
- **Smart machine resolution**: unknown machines during import get a guided resolution UI (Create/Map/Skip per machine, prefix-based bulk actions, fuzzy matching)
- Validation: duplicate rows flagged, empty rows skipped, partial rows warned, dates validated
- Date format: accepts ISO 8601, `YYYY-MMM-DD`, `DD-MMM-YYYY`, and Excel serial numbers
- Schedule: Sheet1 (stages), optional Sheet2 (tasks); Maintenance: separate file

**Still open:**
- Physical `.xlsx` template sample files not yet created in `public/templates/` — users export from the app to create their own de facto templates
- Consider creating downloadable starter templates with sample rows and instructions

### 3. Rule Engine Edge Cases — DECIDED

**Overlap detection:**
- **PF/PR overlap: Warn but do NOT block.** Show a warning with suggested
  better placement, but the user is allowed to create overlapping stages on
  propagators and pre-fermenters if they choose. Same spirit as VBA behavior.
- **Minimum turnaround gap:** At least one turnaround activity (e.g. CIP) must
  be defined in the gap between consecutive batches on the same vessel. The user
  sets the turnaround duration in the Process Setup menu using a days:hours:minutes
  picker, and can name the activity (e.g. "CIP", "SIP", "Cleaning"). Multiple
  turnaround activity types can be defined per equipment group.
- **Data model implemented:** `TurnaroundActivity` interface defined in
  `lib/types.ts` with `durationDays` / `durationHours` / `durationMinutes` fields,
  `equipmentGroup` assignment, and `isDefault` flag. Store CRUD for turnaround
  activities is in place (`add/update/delete` in `lib/store.ts`). Helper function
  `turnaroundTotalHours()` computes the effective gap duration for scheduling math.
- **Process Setup modal implemented:** Users can now configure turnaround
  activities per equipment group in the Process Setup modal (Turnaround Activities
  tab) with d:h:m duration picker, default flag, and equipment group filter.
- **Implemented:** Turnaround activities are wired into the scheduling engine
  (`lib/scheduling.ts`): `requiredTurnaroundGap()` computes the minimum gap,
  `earliestAvailableTime()` accounts for turnaround durations + machine downtime,
  and `findBestVessel()` uses turnaround gaps when selecting vessels.

**Auto-scheduling (new chain wizard):**
- **No vessel available: Warning + auto-move.** Show a warning and automatically
  move the entire batch chain to the next available slot where all vessels in the
  chain have capacity. Do not silently fail or just show an error.
- **NasPF_MAX / NasPR_MAX:** These are simply the longest expected PF and PR phase
  durations from the product line's stageDefaults. They are NOT a separate feature —
  the VBA references were an unfinished implementation. Use the product line's
  `defaultDurationHours` as the practical maximum tolerance window.
- **Chain spanning shutdown/weekend/holiday:** Yes, chains CAN span these boundaries.
  The shutdown, weekend, and holiday rules are configurable in the Process Setup
  and Shift Schedule menus. The system should visually indicate when a chain crosses
  a non-working boundary, but it is not blocked.

**Bulk shift:**
- **Yes, re-validate after bulk shift.** After a bulk shift operation, the system
  runs overlap detection on all affected stages and highlights any new conflicts.
  Conflicts are shown as warnings (not blocking) — the user decides whether to fix them.
- **Store action implemented:** `bulkShiftStages(stageIds[], deltaHours)` in
  `lib/store.ts`. Post-shift re-validation implemented via `validateBulkShift()` in `scheduling.ts`.

### 4. Test Strategy (Phase 1-2)

Need test patterns established before building lib modules, not after.

**What's needed for Free MVP:**
- Unit tests for all `lib/` modules (timeline-math, holidays, colors, shift-rotation,
  scheduling, seed-train, excel-io, demo-data-generator)
- Component tests for timeline rendering (does a known dataset produce expected
  bar positions?)
- Integration test: generate demo data -> render timeline -> export -> import -> compare
- Browser targets: Chrome, Firefox, Safari, Edge (last 2 versions)

**What can wait:**
- E2E tests with Playwright/Cypress (needs actual pages first)
- Role-permission test matrix (Enterprise RBAC)
- GxP evidence test pack (Enterprise compliance)

### 5. Landing Page and Waitlist

The landing page needs to convert visitors into waitlist signups.

**What's needed:**
- Hero section: tagline + screenshot/animation of the wallboard
- Problem/solution section: legacy VBA pain -> modern browser tool
- Feature highlights: wallboard, planner, Excel import/export
- "Try it now" CTA -> opens the app with demo data
- Waitlist capture: email + company name (optional) + plant type (optional)
- Social proof section (later: testimonials, logos)

**Waitlist capture:**
- External link (mailto:hello@plantpulse.pro or hosted form on a separate domain)
- No API route in Free Edition — keeps the four privacy guarantees intact
- Enterprise phase may add a dedicated waitlist API if needed

---

## Important but Enterprise-phase

### 6. Physical Database Schema

**Not needed for Free MVP** (in-memory + Excel only).

**When needed:** Phase 11 (Enterprise Cloud) and Phase 12 (On-Prem).

**What will be needed:**
- PostgreSQL table definitions with constraints, indexes, enums
- Migration scripts (up/down)
- Seed data for machines, shift config
- Tenant isolation model (schema-per-tenant vs row-level)
- Retention/archival policy for completed batches

### 7. API Contract

**Not needed for Free MVP** (no server, all client-side except waitlist endpoint).

**When needed:** Phase 11 (Enterprise Cloud).

**What will be needed:**
- OpenAPI 3.x spec or tRPC router definitions
- Endpoints for: plan state transitions (draft/propose/commit/reject),
  task confirmation, maintenance acknowledgement, bulk shift, export
- Auth middleware spec (JWT/session, role claims)
- Rate limiting and request validation rules
- Websocket or SSE for multi-user real-time updates

### 8. Event and Audit Taxonomy

**Partially needed for Free MVP** (Excel audit sheet with basic events).
**Full taxonomy needed for Enterprise** (immutable audit store).

**What's needed for Free:**
- Basic event list: import, export, task_confirmed, task_not_possible,
  maintenance_acknowledged, stage_edited, stage_moved, stage_deleted
- Fields: timestamp, event_type, entity_id, description

**What can wait for Enterprise:**
- Full event catalog with exact payload schemas
- Before/after snapshots for every mutation
- Actor role context capture
- Retention and immutability enforcement
- System log events (API access, auth, errors, performance)

### 9. Non-Functional Requirements / SLOs

**Mostly Enterprise concerns.** Items decided for Free:

**Decided:**
- Browser support: Chrome, Firefox, Safari, Edge (last 2 major versions)
- Primary screen: 1920x1080 (matches legacy wallboard)
- Also support: 1366x768 laptop (responsive, may reduce visible days)
- Canvas rendering: must be smooth at 30 machines x 25 days

**Enterprise-phase:**
- Uptime SLA (99.9%? 99.95%?)
- RPO/RTO targets
- Security baselines (pen test cadence, vulnerability scanning)
- Accessibility level (WCAG AA is already in design-guidelines.md)

---

## Remaining Open Items (Free MVP)

Items that are implemented conceptually but have pending polish or wiring work.

### 1. Excel Template Files

Physical `.xlsx` template files (`public/templates/schedule-template.xlsx`,
`public/templates/maintenance-template.xlsx`) do not exist yet. Users currently
export from the app to create their own templates. Consider creating downloadable
starter files with headers, sample rows, and instructions.

### 2. Shutdown "PLANT SHUTDOWN" Text Label

The shutdown calendar overlay (grey diagonal hatch on Wallboard) is implemented.
The full-width "PLANT SHUTDOWN (NO ELECTRICITY)" text label across all machines
is still pending (see Phase 13 in implementation plan).

### 3. Hold Risk & Shutdown Crossing Visual Indicators

Planner View does not yet show visual indicators for:
- Batches at risk of hold (conflict warnings beyond overlap detection)
- Batch chains that cross shutdown boundaries

These are informational indicators (not blocking) — the scheduling engine already
allows chains to span shutdowns.

### 4. Test Coverage

Unit tests for `lib/` modules exist (Vitest setup complete), but coverage could
be expanded:
- Component tests for timeline rendering (expected bar positions for known datasets)
- Integration test: generate demo data → export → import → compare
- E2E tests with Playwright/Cypress (deferred to after MVP stabilization)

### 5. Landing Page Content

`app/page.tsx` exists with navigation cards and a privacy footer, but the full
marketing landing page (hero section, problem/solution, feature highlights,
screenshot/animation, social proof) is not yet built. Current page serves as
a functional app entry point.

---

## Usage Analytics (Free edition — for Enterprise validation)

Track anonymous product usage to validate Enterprise demand:

**Events to capture (client-side, privacy-friendly):**
- Session started (with/without Excel import)
- Planner view opened
- Wallboard view opened
- Batch chain created/edited/deleted
- Bulk shift used
- Excel exported
- Excel imported
- Time spent in session
- Waitlist form opened / submitted

**Tool:** PostHog (free tier, self-hostable) or Plausible (privacy-first).
No PII in analytics events. Email only in waitlist (explicit opt-in).

---

## Planner View Gaps

The Planner View (`app/planner/page.tsx`) has a sidebar with tool sections and a
timeline canvas. The following tracks what is implemented vs. pending.

### Implemented

| Component | Status | Notes |
|-----------|--------|-------|
| Planner page layout (sidebar + timeline + toolbar) | Done | Collapsible sections, day/week nav |
| Store CRUD — all entities | Done | Stage, BatchChain, Machine, MachineDisplayGroup, ProductLine, TurnaroundActivity, EquipmentGroup |
| `bulkShiftStages()` store action | Done | Shifts selected stages by N hours |
| `generateId()` helper | Done | Monotonic counter with optional prefix |
| `TurnaroundActivity` type | Done | d:h:m duration, equipment group, isDefault flag |
| `turnaroundTotalHours()` helper | Done | Computes total hours from d:h:m fields |
| Equipment Setup modal — Machines tab | Done | Inline edit (name, group, product line), reorder, add/delete, downtime editor |
| Equipment Setup modal — Equipment Groups tab | Done | CRUD for dynamic equipment group types (no longer hardcoded union) |
| Equipment Setup modal — Product Lines tab | Done | Was "Display Groups"; auto-derives display groups from product line assignments on Save |
| Machine downtime / unavailability | Done | Yellow dot indicator (active/scheduled/ended states), `isMachineUnavailable()` helper, inline date editor |
| Dynamic equipment groups (`MachineGroup = string`) | Done | `EquipmentGroup` interface + store CRUD; Schedule view filter buttons built dynamically |
| Product line → display group sync | Done | `buildDisplayGroups()` auto-derives `MachineDisplayGroup[]` from product lines + machines |
| Downtime ended-state detection | Done | `isDowntimeEnded()` suppresses indicator for past finite windows; only active/upcoming shown |
| Reusable modal CSS (`pp-modal-*`) | Done | Backdrop, header, tabs, body, footer, buttons — shared by all setup modals |
| Process Setup modal — Stage Defaults tab | Done | Per product line: edit default durations, equipment groups, add/remove/reorder stages |
| Process Setup modal — Turnaround Activities tab | Done | CRUD for CIP/SIP/Cleaning per equipment group; d:h:m picker; default flag |
| Process Setup modal — Shutdowns tab | Done | CRUD for shutdown periods with date range, name, reason; past dimmed |
| `ShutdownPeriod` type + store CRUD | Done | `lib/types.ts` + `lib/store.ts`; full add/update/delete |
| Shift Schedule modal | Done | Team editor, rotation presets (Russian/Panama/DuPont/etc.), variable shift lengths, plant coverage heatmap, shift sequence diagram, Holiday Calendar section |
| Shift band gap segments | Done | Gray (`#b0b0b0`) segments for uncovered periods in Wallboard + Planner shift bands; `isShiftCoveredAt()` + `ShiftBandSegment` with `teamIndex: -1` |
| Recurring machine downtime | Done | `RecurringDowntimeRule` (weekly/monthly), `isDateInRecurringRule()`, integrated into `isMachineUnavailable()` |
| Stage Types scope toggle | Done | Shared vs per-product-line mode; validation dialog on mode switch; Stage Types ↔ Stage Defaults sync |
| `lib/scheduling.ts` — scheduling engine | Done | Overlap detection, LRU vessel assignment, auto-schedule chain, bulk shift validation, turnaround gap enforcement |
| `lib/seed-train.ts` — seed train engine | Done | Back/forward-calculation, stage type count expansion (`expandStageDefaults`), `buildStageTypeCounts` |
| `StageDetailPanel.tsx` | Done | Canvas click → side panel for stage view/edit (vessel, start/end, state) |
| `NewChainWizard.tsx` | Done | Multi-chain creation (+ button), auto-suggest start, per-vessel cursor, per-PL stage type resolution, count expansion |
| `BulkShiftTool.tsx` | Done | Cutoff date + series filter + delta hours; post-shift overlap validation |

### Implemented — Batch Operations (Steps 1–5)

> **Status:** All batch operation steps (1–5) are complete: scheduling engine,
> canvas click handlers, NewChainWizard, BulkShiftTool, ChainEditor, and
> drag-to-move / stretch-to-resize interactions.

| Step | Component | Status | Notes |
|------|-----------|--------|-------|
| 1 | `lib/scheduling.ts` | Done | `detectOverlaps()`, `findBestVessel()` (LRU heuristic), `autoScheduleChain()`, `validateBulkShift()`, `selectStagesForBulkShift()`, `requiredTurnaroundGap()`, `earliestAvailableTime()` — integrates turnaround durations + machine downtime |
| 1 | `lib/seed-train.ts` | Done | `backCalculateChain()` with `stageTypeCounts` support, `expandStageDefaults()` (count > 1), `buildStageTypeCounts()`, `forwardCalculateChain()`, `chainDurationHours()` |
| 2 | Canvas click handlers + `StageDetailPanel.tsx` | Done | Hit-test batch bars, side panel for view/edit stage properties |
| 3 | `NewChainWizard.tsx` | Done | Multi-chain via "+" button (up to 10), auto-suggest production start, per-vessel earliest-availability cursor, per-product-line stage type resolution, stage type count expansion, production end/span timing display |
| 4 | `BulkShiftTool.tsx` | Done | Cutoff date + series filter + hour delta; post-shift overlap validation |
| 5 | `ChainEditor.tsx` | Done | Full batch chain editor modal with up to 8 stages; fixed-duration mode (changing start auto-adjusts end); link-to-next mode (end of stage N syncs to start of stage N+1); real-time overlap detection against other chains |
| 5 | Drag-to-move / stretch-to-resize | Done | Ghost overlay during drag with semi-transparent highlight; snap-to-hour for consistent scheduling; edge detection for stretch-to-resize |

#### Key implementation details

- **LRU vessel assignment**: `findBestVessel()` prefers the machine with the longest idle time among overlap-free candidates, naturally distributing work across vessels (e.g. alternating F-2/F-3)
- **Multi-chain cursor**: when creating multiple chains, each chain's fermenter start is the earliest available time across all fermenter candidates (not sequential from previous chain's end), avoiding large gaps when vessels alternate
- **Stage type count expansion**: `expandStageDefaults()` repeats stage entries based on `StageTypeDefinition.count` (e.g. Seed n-1 with count=2 → two n-1 stages in the chain)
- **Per-product-line stage types**: wizard uses `productLineStageTypes[productLineId]` when `stageTypesMode === 'per_product_line'`, correctly resolving stage names and short labels

#### Dependencies diagram

```
lib/types.ts (done)
lib/store.ts (done — CRUD for Stage, BatchChain)
    │
    ▼
lib/scheduling.ts (done) ◄── lib/seed-train.ts (done)
    │                              │
    ▼                              ▼
StageDetailPanel (done) ◄── NewChainWizard (done)
    │                              │
    ▼                              ▼
Canvas click handlers (done)   BulkShiftTool (done)
    │
    ▼
ChainEditor (done)
    │
    ▼
Drag-to-move / stretch-to-resize (done)
```

### Implemented — Data I/O

| Component | Status | Notes |
|-----------|--------|-------|
| `lib/excel-io.ts` | Done | Schedule + maintenance .xlsx import/export via SheetJS; `parseScheduleXlsx`, `exportScheduleXlsx`, `parseMaintenanceXlsx`, `exportMaintenanceXlsx` |
| Import Schedule (xlsx) | Done | Sidebar button wired to file picker + confirmation modal with warnings |
| Export Schedule (xlsx) | Done | Sidebar button wired to `exportScheduleXlsx()` |
| Import/Export Maintenance | Done | Separate sidebar buttons for maintenance task .xlsx I/O |
| `maintenanceTasks` store CRUD | Done | `set/add/update/deleteMaintenanceTask` actions in Zustand store |

### Implemented — Downtime & Shift Enhancements

| Component | Status | Notes |
|-----------|--------|-------|
| Machine downtime visualization on Planner | Done | Amber-tinted overlays with diagonal hatch (135°, 6px step); hover tooltip with reason/time details; click-to-edit opens Equipment Setup scrolled to machine |
| `blocksPlanning` field | Done | `MachineDowntime.blocksPlanning` + `RecurringDowntimeRule.blocksPlanning` (default true); non-blocking downtime renders with halved opacity + dashed hatch; scheduling engine skips non-blocking downtime |
| `notifyShift` field | Done | `MachineDowntime.notifyShift` + `RecurringDowntimeRule.notifyShift` (default false); fuchsia shift-notification arrows on Planner + Wallboard |
| "Affects Planning" / "Notify Shift" toggles | Done | Two checkbox toggles in Equipment Setup downtime editor |
| `DowntimeWindow` type + helpers | Done | `expandRecurringRule()`, `collectDowntimeWindows()` in `lib/types.ts` |
| Notify shift arrows | Done | Fuchsia triangular arrows (10×12px) rendered via `drawNotifyShiftArrows()` on both Planner and Wallboard canvases; tooltip shows "Shift notification active" badge; decoupled from downtime block visibility |

### Implemented — Planner Interactions & Demo

| Component | Status | Notes |
|-----------|--------|-------|
| Click machine label → Equipment Setup | Done | `onMachineLabelClick` callback with left-column hit-testing; opens Equipment Setup in edit mode for that machine |
| Click shift band → Shift Schedule modal | Done | `onShiftBandClick` callback with top-strip hit-testing; opens Shift Schedule configuration modal |
| Rotating biotech demo product catalog | Done | 20-product catalog in `lib/demo-data.ts` with daily-rotating seeded shuffle; product line shortName limited to 3 chars; Naming tab auto-defaults prefix from shortName |
| Smart machine resolution during import | Done | Unknown machines in Excel import get guided resolution UI: Create (with group auto-suggestion), Map to existing (fuzzy match), or Skip; prefix-based bulk actions; see `docs/plans/smart-machine-resolution-import.md` |
| Planning horizon extension in wizard | Done | New Batch Chain wizard shows extended planning horizon for better visibility |

---

## PDF Export Gaps

The Schedule PDF export uses a dual-canvas architecture: a visible responsive
canvas for on-screen display and a hidden fixed-size canvas (1122×794 px) for
deterministic A4 capture. The export uses direct `canvas.toDataURL()` (not
`html2canvas`), which is the correct approach for native `<canvas>` elements.

### Gap 1: `visibility: hidden` container — ~~blank PDF body~~ FIXED

**Status:** Fixed

The hidden export canvas container previously used `visibility: hidden`, which
could cause `ResizeObserver` to report zero dimensions in some browsers (the
draw function early-returns when `dims.width === 0`).

**Fix applied:** Changed from `visibility: hidden` to `opacity: 0; overflow: hidden`
so the container remains "visible" in the CSS layout sense but invisible to the
user. Combined with existing `pointer-events: none` and `left: -99999px`.

Note: The export already uses `canvas.toDataURL()` (not `html2canvas`), so the
original `html2canvas` concern documented here was not applicable. The
`visibility: hidden` fix addresses only the `ResizeObserver` edge case.

### Gap 2: DPR double-scaling — ~~excessive memory~~ NOT APPLICABLE

**Status:** Not applicable

The export uses `canvas.toDataURL()` directly, not `html2canvas`. There is no
secondary scaling — the canvas buffer is captured as-is. The DPR scaling applied
by WallboardCanvas for display sharpness produces appropriate resolution for
print output.

### Gap 3: ~~Hidden canvas runs unnecessary 60-second redraw timer~~ FIXED

**Status:** Fixed

The 60-second `setInterval` for now-line refresh now checks `showNowLine` before
setting up the interval. When `showNowLine={false}` (as on the export canvas),
no interval is created — zero unnecessary CPU work on the off-screen surface.

### Gap 4: ~~`loadDemoData()` called by both canvas instances~~ FIXED

**Status:** Fixed

`loadDemoData()` has been removed from WallboardCanvas and is now called only at
the page level (inoculum, wallboard, and planner pages). This clarifies data
ownership: pages own initialization, components own rendering.

### Summary table

| # | Gap | Status | Notes |
|---|-----|--------|-------|
| 1 | `visibility: hidden` → `opacity: 0` | Fixed | Prevents `ResizeObserver` zero-dim edge case |
| 2 | DPR double-scaling | N/A | Export uses `toDataURL()`, no secondary scaling |
| 3 | 60s timer on hidden canvas | Fixed | Interval skipped when `showNowLine={false}` |
| 4 | Duplicate `loadDemoData()` calls | Fixed | Moved to page level only |
