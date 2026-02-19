# Implementation Plan

Step-by-step build sequence. Phases 0-7 produce the Free MVP for plantpulse.pro.
Phases 8-12 are Enterprise-only.

---

## Free MVP (plantpulse.pro)

### Phase 0 — Project scaffold + foundations

- Initialize Next.js 15 + TypeScript + Tailwind CSS + Zustand
- Configure Vitest + Testing Library
- Define TypeScript interfaces (`src/lib/types.ts`), including ProductLine, StageDefault
- Define default facility config (product lines, machines, stage durations)
  - GNT + KK as demo defaults, but all user-configurable at runtime
  - Users can add/rename/remove product lines, machines, and stage durations
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
- `lib/scheduling.ts` — Overlap detection, conflict checking
- `lib/seed-train.ts` — Chain creation with back-calculation (PR -> PF -> F)
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
  - Stage CRUD operations
  - Batch chain operations
  - Task confirmation actions
  - No persistence (state resets on page reload)

### Phase 3 — Excel import/export

- Create schedule Excel template (`public/templates/schedule-template.xlsx`):
  - Sheet1: stages (pososda, nacep, precep, serija)
  - Sheet2: checkpoint tasks (pososda, nacep, opis, status)
- Create maintenance Excel template (`public/templates/maintenance-template.xlsx`)
- `lib/excel-io.ts` — SheetJS import/export:
  - Import validator (headers, dates, machine names, start <= end)
  - Schedule export (stages + tasks + audit sheet)
  - Maintenance export
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
  - Includes Inoculum group (BKK, BGNT) not shown in other views
  - Reuses `WallboardCanvas` with `customMachineGroups` for filtered display

### Phase 6 — Planner View page

- `app/planner/page.tsx` — Interactive schedule editor:
  - Drag to move stage blocks
  - Stretch to change duration
  - Click to edit in side panel
  - Delete / reassign machine
- `components/planner/ChainEditor.tsx` — View/edit chain segments
- `components/planner/NewChainWizard.tsx` — Add new batch chain:
  - Auto-scheduling with back-calculation
  - Vessel availability suggestions
  - Overlap checking
- `components/planner/BulkShiftTool.tsx` — Shift multiple batches by N hours
- `components/planner/StageDetailPanel.tsx` — Side panel editor
- Facility configuration panel (in Planner or Settings):
  - Add/rename/remove product lines
  - Add/rename/remove machines, assign to product lines
  - Edit default stage durations per product line
  - Changes apply to current session (export to save)
- Conflict indicators: overlap, hold risk, shutdown crossing

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

- Shutdown blocks: full-width "PLANT SHUTDOWN" across all machines
- Planning rule: no chains crossing shutdown unless override
- Rotation reset anchor at shutdown
- Staffing windows: warnings (Free) / hard enforcement (Enterprise)

> **Note:** Schedule View (full month + equipment group filters) was implemented
> as part of the Free MVP. See Phase 5 notes.
