# Implementation Plan

Step-by-step build sequence. Phases 0-7 produce the Free MVP for plantpulse.pro.
Phases 8-12 are Enterprise-only.

---

## Free MVP (plantpulse.pro)

### Phase 0 — Project scaffold + foundations

- Initialize Next.js 15 + TypeScript + Tailwind CSS + Zustand
- Configure Vitest + Testing Library
- Define TypeScript interfaces (`src/lib/types.ts`), including ProductLine, StageDefault
  - `StageType` is `string` (user-configurable, not a fixed union)
  - `StageTypeDefinition` interface: id, name, shortName, description, count, displayOrder
  - Default stage types (literature-aligned): inoculum (INO), seed_n2 (n-2), seed_n1 (n-1), production (PROD)
- Define default facility config (product lines, machines, stage durations)
  - GNT + KK as demo defaults, but all user-configurable at runtime
  - 4-stage seed train: inoculum (24h) → seed_n2 → seed_n1 → production
  - Users can add/rename/remove product lines, machines, stage types, and stage durations
- Set up Vercel project + connect plantpulse.pro domain
- Define edition adapter interfaces (conceptual):
  - StorageAdapter: ExcelSession | CloudDB | OnPremDB
  - AuthAdapter: None/Local | SSO(SAML/OIDC) | AD/LDAP
  - ERPAdapter: None | ERP Batch Integration (pluggable)
  - AuditAdapter: SessionAuditSheet | ImmutableAuditStore

### Phase 1 — Core library modules

- `lib/holidays.ts` — Slovenian public holidays + Gauss Easter algorithm
- `lib/colors.ts` — 12-color batch cycle + 5-color wallboard border cycle
- `lib/shift-rotation.ts` — 4-team, 12h, 8-step cycle
- `lib/timeline-math.ts` — Pixel geometry (bar positioning, clipping, now-line)
- `lib/scheduling.ts` — Overlap detection, conflict checking, auto-vessel assignment, turnaround gap enforcement (done)
- `lib/seed-train.ts` — Chain creation with back-calculation using ProductLine.stageDefaults (done)
- `lib/shift-rotation.ts` — Configurable shift rotation with presets, plant coverage, gap detection, shift continuity (done)
- Unit tests for all of the above

### Phase 2 — Demo data generator + Zustand store

- `lib/demo-data.ts` — Random realistic schedule generator:
  - 8-15 batch chains across GNT + KK lines
  - Correct seed train stages with realistic durations
  - Mix of completed, active, and planned batches
  - Anchored to current date (wallboard always shows activity)
  - Checkpoint tasks (planned/done/not_possible mix)
  - Maintenance tasks
- `lib/store.ts` — Zustand store (in-memory BigReadArray replacement):
  - Load from demo generator or Excel import
  - **Stage CRUD** (implemented): add, update, delete, moveToMachine
  - **Batch chain CRUD** (implemented): add, update, delete (cascades to child stages)
  - **Machine CRUD** (implemented): add, update, delete (cleans up display groups)
  - **Machine display group CRUD** (implemented): add, update, delete
  - **Product line CRUD** (implemented): add, update, delete
  - **Turnaround activity CRUD** (implemented): add, update, delete
  - **Equipment group CRUD** (implemented): add, update, delete
  - **Shutdown period CRUD** (implemented): add, update, delete
  - **Stage type definition CRUD** (implemented): add, update, delete — literature-aligned defaults (inoculum, seed_n2, seed_n1, production); includes count field (instances per batch chain)
  - **Batch naming config** (implemented): `batchNamingConfig: BatchNamingConfig` + `setBatchNamingConfig()` — configures batch name generation rules (prefix, suffix, step, counter reset, per-line or shared)
  - **Wallboard equipment groups** (implemented): `wallboardEquipmentGroups: string[]` + `setWallboardEquipmentGroups()` — configurable subset of equipment groups shown on Wallboard
  - **Bulk shift** (implemented): `bulkShiftStages(stageIds[], deltaHours)` shifts selected stages
  - Task confirmation actions
  - No persistence (state resets on page reload)
  - Helper: `generateId(prefix)` for unique ID generation

### Phase 3 — Excel import/export (implemented)

- Create schedule Excel template (`public/templates/schedule-template.xlsx`):
  - Sheet1: stages (pososda, nacep, precep, serija)
  - Sheet2: checkpoint tasks (pososda, nacep, opis, status)
- Create maintenance Excel template (`public/templates/maintenance-template.xlsx`)
- `lib/excel-io.ts` — SheetJS import/export (implemented):
  - `parseScheduleXlsx` / `exportScheduleXlsx` — schedule I/O with header validation, machine matching, series grouping
  - `parseMaintenanceXlsx` / `exportMaintenanceXlsx` — maintenance task I/O
  - Planner sidebar Import/Export buttons wired to handlers with confirmation modal
  - `maintenanceTasks` CRUD added to Zustand store
- Integration test: generate -> export -> import -> compare

### Phase 4 — Core timeline engine

- `components/timeline/TimelineCanvas.tsx` — Canvas-based renderer:
  - Day grid with month labels
  - Weekend highlighting (yellow)
  - Holiday markers (red hatched)
  - Today column shading
  - Now-line (dark red vertical)
- `components/timeline/TimelineHeader.tsx` — Date header row
- `components/timeline/MachineColumn.tsx` — Fixed left column with vessel names
- `components/timeline/StageBar.tsx` — Batch stage bars:
  - Color from series number (12-color cycle)
  - Labels: start hour, batch name
  - State indicator (planned/active/completed)
- `components/timeline/ShiftBand.tsx` — Shift ownership band at top
- `components/timeline/NowLine.tsx` — Current time indicator
- `components/timeline/CalendarGrid.tsx` — Background grid

### Phase 5 — Manufacturing Wallboard page

- `app/wallboard/page.tsx` — Operator wallboard view:
  - Default window: 4 days back + today + 2-3 weeks forward
  - Stage bars + checkpoint tasks + maintenance markers
  - Now-centered timeline
  - **Fullscreen mode** (implemented):
    - Enter via toolbar button (positioned immediately before the Shift indicator, top-right)
    - Uses browser Fullscreen API (`requestFullscreen` / `exitFullscreen`)
    - In fullscreen: navigation bar and toolbar are hidden; canvas fills the entire screen
    - TV-safe margin (EBU R95): 2.5% top/bottom, 3.5% sides — black background
    - Exit via hover-reveal button (top-right corner, fades in on mouse movement) or browser Escape key
    - State syncs with browser fullscreen change events (e.g. user presses Escape)
    - CSS: `.wallboard-fullscreen`, `.wallboard-fullscreen-overlay`, `.wallboard-fullscreen-exit-btn` in `globals.css`
  - **Night View mode** (implemented):
    - Toggleable dark, high-contrast theme optimized for TV displays during night shifts
    - Toolbar toggle button positioned immediately before the Fullscreen button; shows moon/Night (off) or sun/Day (on)
    - Fullscreen: floating overlay toggle at top-left corner (mirrors exit button pattern), auto-hides on inactivity
    - Automatic switching: Night View at 22:00 local, Day View at 05:00 local (device clock, no server)
    - Manual override respected until next scheduled boundary, then auto-schedule resumes
    - Preference persisted in `localStorage` (key: `wallboard-night`)
    - Canvas uses theme-aware color system (`DAY_THEME` / `NIGHT_THEME` in `WallboardCanvas.tsx`)
    - Only affects Wallboard page; Schedule, Planner, and PDF export always use day theme
    - `@media print` CSS rule prevents night styles from leaking into print output
    - Hook: `lib/useNightMode.ts`; CSS: `.wallboard-night-*` classes in `globals.css`
  - **Equipment group filtering** (implemented):
    - Wallboard shows only equipment groups selected in Equipment Setup > Wallboard Display tab
    - Default: propagator, pre_fermenter, fermenter (excludes inoculum, which is not shift-managed)
    - Filtering done via `wallboardEquipmentGroups` store state + `customMachineGroups` prop on WallboardCanvas
    - Configurable at runtime without code changes
  - **Shutdown calendar overlay** (implemented):
    - Shutdown periods render as grey diagonal-hatch columns on the wallboard canvas
    - Theme-aware: day mode uses `rgba(120,120,140,0.18)`, night mode uses `rgba(100,100,130,0.25)`
    - Diagonal hatch pattern drawn via Canvas clipping + 8px-step line pattern
- `components/wallboard/TaskArrow.tsx` — Task markers:
  - Planned: red indicator, clickable
  - Done: green + checkmark
  - One-click confirmation
  - Long-press: comment / not possible
- `components/wallboard/MaintenanceMarker.tsx` — Maintenance task display

### Phase 5b — Schedule View page (implemented)

- `app/inoculum/page.tsx` — Monthly schedule view:
  - Full-month timeline (auto-adjusts days per month)
  - Month navigation (prev/next)
  - Equipment group filter toolbar with multi-select toggle buttons
  - Button order (left → right): Inoculum, Propagators (PR), Pre-fermenters (PF), Fermenters (F), All Equipment
  - Multi-select: multiple groups can be active simultaneously (e.g. PR + PF)
  - "All Equipment" acts as reset (clears all selections, shows everything)
  - Empty selection defaults to showing all equipment
  - Filtering affects visible equipment rows and events; hidden equipment does not render
  - Includes Inoculum group dynamically computed from store (not hardcoded); deduplicates machines already present in product-line display groups to prevent duplicate rows
  - Reuses `WallboardCanvas` with `customMachineGroups` for filtered display
  - **PDF export** (implemented):
    - "Export PDF" button + gear icon for Print Settings in toolbar
    - Client-side only: `html2canvas` captures schedule canvas at 2× scale, `jsPDF` generates A4 landscape PDF
    - **Dual-canvas architecture**: visible responsive canvas for on-screen display + hidden fixed-size canvas (1122×794 px, A4 at 96 DPI) positioned off-screen for deterministic PDF capture regardless of device/viewport
    - `utils/exportSchedulePdf.ts` — all export logic, settings I/O, timestamp helper
    - `settings/PrintSettings.tsx` — modal for configurable header/footer with localStorage persistence
    - `app/inoculum/page.tsx` — dual-canvas wiring, export trigger, constants (`SCHEDULE_PDF_CANVAS_ID`, `SCHEDULE_PDF_VIEWPORT`)
    - Header: optional facility title + month/year + separator
    - Footer: version, timestamp with TZ + UTC offset, prepared-by, signature line, disclaimer, page numbers
    - Enterprise fields (logo, watermark, electronic signatures, document control) visible but disabled
    - Filename: `PlantPulse_{Month}_{Year}.pdf`
    - Zero network calls, works offline, no cookies, no telemetry
    - **Known gap**: `html2canvas` may produce blank captures due to `visibility: hidden` on the export canvas container — see `docs/gaps-and-open-questions.md § PDF Export Gaps`
  - **Responsive toolbar** (implemented):
    - Desktop (>= 768px): horizontal toolbar layout unchanged
    - Mobile (< 768px): toolbar collapses into a "☰ Controls" hamburger button
    - Tapping opens a dropdown panel with three sections: month navigation, equipment filter grid (2-col), export/print actions
    - Panel closes on: outside click, action tap, or Escape key
    - All touch targets >= 44px; proper ARIA attributes for accessibility

### Phase 6 — Planner View page

- `app/planner/page.tsx` — Interactive schedule editor (implemented):
  - Sidebar with collapsible tool sections: Batch Operations, Schedule Data, Setup
  - Toolbar with day/week navigation and Today reset
  - Drag to move stage blocks (implemented — ghost overlay, snap-to-hour)
  - Stretch to change duration (implemented — edge detection for resize)
  - Click to edit in side panel (implemented — StageDetailPanel)
  - Click machine label to open Equipment Setup in edit mode (implemented)
  - Click shift band to open Shift Schedule modal (implemented)
- **Batch operations** (Steps 1–5 implemented):
  1. `lib/scheduling.ts` + `lib/seed-train.ts` — Pure business logic engines (implemented):
     - `scheduling.ts`: `detectOverlaps()`, `findBestVessel()` (LRU heuristic for vessel distribution), `autoScheduleChain()`, `validateBulkShift()`, `selectStagesForBulkShift()`, `requiredTurnaroundGap()`, `earliestAvailableTime()` — integrates turnaround durations + machine downtime
     - `seed-train.ts`: `backCalculateChain(finalStageStart, stageDefaults, stageTypeCounts?)`, `forwardCalculateChain()`, `expandStageDefaults()` (count > 1 support), `buildStageTypeCounts()`, `chainDurationHours()`
  2. Canvas click handlers + `StageDetailPanel.tsx` (implemented) — Hit-test batch bars, open side panel for view/edit stage properties (vessel, start/end, state, fixed-duration mode, link-to-next mode)
  3. `NewChainWizard.tsx` (implemented) — Guided batch creation: select product line → pick fermenter + start (auto-suggested from earliest available) → back-calculate seed train → overlap preview → confirm; multi-chain creation via "+" button (up to 10); per-vessel earliest-availability cursor; per-product-line stage type resolution; stage type count expansion; production end/span timing display
  4. `BulkShiftTool.tsx` (implemented) — Cutoff date + series filter + hour delta; calls `bulkShiftStages()` store action; post-shift overlap validation via `validateBulkShift()`
  5. `ChainEditor.tsx` (implemented) — Full batch chain editor modal with up to 8 stages; fixed-duration mode; link-to-next mode; real-time overlap detection
- **Data I/O** (implemented):
  - `lib/excel-io.ts` — Schedule + maintenance .xlsx import/export via SheetJS
  - Planner sidebar Import/Export buttons wired with confirmation modal + warnings
  - `maintenanceTasks` CRUD in Zustand store
- **Machine downtime visualization on Planner** (implemented):
  - Amber-tinted overlays with diagonal hatch (135°, 6px step) behind batch bars
  - Hover tooltip with reason/time details; click-to-edit opens Equipment Setup
  - `blocksPlanning` field: non-blocking downtime renders with halved opacity + dashed hatch
  - `notifyShift` field: fuchsia shift-notification arrows on Planner + Wallboard
  - "Affects Planning" / "Notify Shift" toggles in Equipment Setup downtime editor
- **Rotating demo product catalog** (implemented):
  - 20-product biotech catalog in `lib/demo-data.ts` with daily-rotating seeded shuffle
  - Product line shortName limited to 3 chars; Naming tab auto-defaults prefix from shortName
- **Equipment Setup modal** (implemented):
  - `components/planner/EquipmentSetup.tsx` — full CRUD modal for facility equipment (4 tabs)
  - **Machines tab**: inline editing of name, equipment group, product line assignment, display order (up/down reorder), add/delete
    - **Machine downtime**: yellow dot indicator per machine; click to define an unavailability window (start date, optional end date, optional reason)
    - Active downtime = solid yellow dot; upcoming/scheduled = outlined yellow dot; past (ended) = no indicator
    - Machines with active downtime are excluded from the scheduling engine via `isMachineUnavailable()`
    - **Equipment group filter**: dropdown to filter machine list by equipment group (or "All")
    - **Section headers**: machines grouped by equipment group + product line composite key (e.g. "Pre-fermenter / Gentamicin") with count badges
    - **Smart insertion**: new machines inherit the active filter's equipment group and product line; inserted after siblings with fractional `displayOrder` midpoint
    - New machine default product line is "None" (unassigned)
  - **Equipment Groups tab**: CRUD for equipment group types (propagator, pre-fermenter, fermenter, inoculum, etc.) — fully user-configurable, no longer hardcoded
  - **Product Lines tab** (was "Display Groups"): shows machines grouped by product line, read-only machine list per line, add/rename/reorder/delete product lines
    - **Short name** field: editable per product line (e.g. "GNT", "KK") — displayed in Process Setup Stage Defaults tab header and used in toolbar chips / batch labels
    - Display groups are auto-derived from product line assignments on Save via `buildDisplayGroups()`
    - No manual machine-to-group checkbox grid — assignment is driven by the machine's product line in the Machines tab
  - **Wallboard Display tab**: configure which equipment groups appear on the Wallboard page
    - Checkbox card per equipment group with machine count preview
    - Default: propagator, pre_fermenter, fermenter (excludes inoculum — not shift-managed)
    - Supports the Wallboard's focus on shopfloor operations and shift handover
    - Changes persisted via `wallboardEquipmentGroups` store state
  - Draft state pattern: all changes buffered in local state, applied to Zustand store on Save only
  - Save button keeps modal open (matches Process Setup behavior)
  - Unsaved changes indicator in footer
  - Reusable modal CSS (`pp-modal-*` classes in `globals.css`) shared by all setup modals
  - Wired to Planner sidebar via "Equipment Setup" tool button
- **Process Setup modal** (implemented):
  - `components/planner/ProcessSetup.tsx` — five-tab modal for process configuration
  - **Stage Types tab**: full CRUD for `StageTypeDefinition` entities — name, short name, count (instances per batch chain), description, display order (reorder up/down); compact single-row layout; literature-aligned defaults: Inoculum (INO), Seed n-2 (n-2), Seed n-1 (n-1), Production (PROD)
  - **Stage Defaults tab**: per product line (header shows `shortName || id`), edit default duration and equipment group for each stage type; stage type dropdown dynamically populated from user-defined stage types; add/remove/reorder stages in the seed train template
  - **Turnaround Activities tab**: CRUD for CIP/SIP/Cleaning activities per equipment group; d:h:m duration picker with total-hours readout; "default" checkbox for auto-insertion during scheduling; equipment group filter; pre-populated defaults for all 4 equipment groups (inoculum 2h media, propagator CIP/media/SIP, pre-fermenter CIP/media/SIP, fermenter CIP/media/SIP/transfer)
  - **Shutdowns tab**: CRUD for plant shutdown periods with name, date range, reason; click-to-expand editor; past shutdowns dimmed; sorted by start date; **conflict warnings**: amber banner when shutdown overlaps planned batches (informational, not blocking) showing affected batch names and count badge
  - **Naming tab**: batch nomenclature rules — naming scope (shared or per-product-line), counter reset (annual / custom date / none = continuous), per-rule config: prefix (optional), start number, step (counter increment, default 1), pad digits, suffix; live preview showing 3 example names; inheritance info note (production stage sets name, upstream inherits); ERP integration CTA (Enterprise, mailto hello@plantpulse.pro)
  - `BatchNamingRule` and `BatchNamingConfig` types defined in `lib/types.ts`; `batchNamePreview()` and `batchNamePreviewSequence()` utility functions
  - `ShutdownPeriod` type defined in `lib/types.ts`; full store CRUD in `lib/store.ts`
  - `TurnaroundActivity` type defined in `lib/types.ts` with d:h:m duration fields
  - `StageTypeDefinition` type defined in `lib/types.ts`; full store CRUD in `lib/store.ts`
  - Draft state pattern: all changes buffered locally, applied to Zustand store on Save
  - Wired to Planner sidebar via "Process Setup" tool button
- **Shift Schedule modal** (implemented):
  - `components/planner/ShiftSchedule.tsx` — configurable teams (name + color), rotation presets (Russian/Panama/DuPont/Pitman/Navy/etc.), variable shift lengths (6/7.5/8/12h), plant coverage (active days + operating hours), coverage heatmap (7×24 grid), shift sequence diagram (Wikipedia-style day×period grid), Holiday Calendar (Slovenian built-in + Enterprise CTA for custom calendars)
  - Draft state pattern; wired to Planner sidebar via "Shift Schedule" tool button
  - Gray gap segments for uncovered periods in Wallboard + Planner shift band
  - Shift continuity: shifts run their full duration even across day boundaries
- Conflict indicators: overlap detection implemented in `scheduling.ts`; hold risk and shutdown crossing visual indicators pending

### Phase 7 — Landing page + deploy

- `app/page.tsx` — Landing page:
  - Hero: tagline + wallboard screenshot/animation
  - Problem/solution (legacy VBA -> modern browser)
  - Feature highlights (wallboard, planner, Excel I/O)
  - "Try it now" CTA -> opens app with demo data
  - Privacy footer: browser-only, zero server roundtrips, no cookies, no telemetry
  - Enterprise waitlist: external link (e.g. mailto or hosted form on a separate domain)
- **No API routes** — the Free Edition is a pure static export with no server component
- **No analytics** — no tracking scripts, no telemetry, no external network requests
- Deploy as static site to any CDN (Vercel, Netlify, GitHub Pages, S3, etc.)

> **Privacy constraint:** Any feature that requires server roundtrips, cookies,
> analytics, or external network calls belongs in the Enterprise Edition only.
> The Free Edition must remain verifiably browser-only.

---

## Enterprise (future phases)

### Phase 8 — Drafts & approvals workflow (governed truth)

- Implement plan states: Draft -> Proposed -> Committed
- Scheduler: create/edit draft, propose with comment
- Planner: review diff, commit or reject with comment
- Commit creates: snapshot + audit trail entries + commit log row

### Phase 9 — Commit log table (Planner-only)

- Build commit log view: list of commits, critical flags
- Filters by time, machine, batch_chain_id, planner
- Critical behavior: auto-flagged for overrides/bulk shifts/shutdown edits
- Comment mandatory for critical commits

### Phase 10 — Audit vs system logs separation

- Audit Trail (business): immutable, append-only
- System Logs (technical): access, errors, security, performance, alerting

### Phase 11 — Enterprise Cloud (single-tenant)

- PostgreSQL database + migrations
- Tenant-per-customer deployment pipeline
- SSO integration (SAML/OIDC) + MFA enforcement
- RBAC admin UI + role audits
- Backups, retention, monitoring
- API contract (OpenAPI or tRPC)

### Phase 12 — Enterprise On-Prem

- Containerized distribution (Docker)
- Customer-managed DB + AD/LDAP + SSO
- Backup integration guidance
- Patch/release process + validation pack

### Phase 13 — Shutdown modeling (Enterprise features)

- Basic shutdown CRUD already implemented in Free MVP (Process Setup modal > Shutdowns tab, `ShutdownPeriod` type + store CRUD)
- Shutdown blocks: full-width "PLANT SHUTDOWN" across all machines (timeline rendering — pending)
- Planning rule: no chains crossing shutdown unless override (Enterprise enforcement)
- Rotation reset anchor at shutdown
- Staffing windows: warnings (Free) / hard enforcement (Enterprise)

> **Note:** Schedule View (full month + equipment group filters) was implemented
> as part of the Free MVP. See Phase 5 notes.
