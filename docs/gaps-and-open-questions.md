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
- The app needs a server-side component for waitlist capture (not pure static)

### Deployment (decided)

**Vercel** is the best fit:
- Native Next.js support (zero config)
- Free tier handles the traffic of a product demo site
- Serverless functions for the waitlist API endpoint (email capture)
- Edge network for fast global loading
- Automatic preview deploys from git branches
- Easy custom domain setup for plantpulse.pro
- Analytics built in (or add PostHog/Plausible for product analytics)

**Architecture:**
- Next.js with App Router (SSR/SSG hybrid, not pure static export)
- Landing page: statically generated
- App pages (wallboard, planner): client-side rendered (all state in Zustand)
- One API route: `POST /api/waitlist` — stores email + optional metadata
- Waitlist storage: Vercel KV (Redis), or Vercel Postgres free tier, or
  external service (Loops, Resend, or simple Google Sheet via API)

### Open Questions — Answered

| # | Question | Answer |
|---|----------|--------|
| 1 | Demo data or start blank? | **Random generated data** on every visit. Realistic schedule. |
| 2 | Static export or server? | **Vercel with serverless** — need API route for waitlist. |
| 3 | Shift rotation editable in Free? | **Fixed** to 4-team/12h/8-step cycle. Enterprise: editable. |
| 4 | Show Planner in Free? | **Yes** — it's the main selling point. |
| 5 | Deploy target? | **Vercel** on plantpulse.pro. |
| 6 | Tasks in same Excel or separate? | Same file, Sheet2. |
| 7 | Maintenance separate import? | Separate file — different update cadence. |

---

## Blocks Free MVP

### 1. Demo Data Generator (new — Phase 0)

Since every session starts with random data, we need a generator that produces
realistic schedules. The generator uses the **default product line configuration**
(GNT + KK from legacy VBA) but all of this is configurable by the user after
the session starts.

**What it needs to produce:**
- A default facility config: 2 product lines (GNT, KK) with their machines and stage durations
- 8-15 active batch chains across those product lines
- Each chain with correct seed train stages (driven by product line's stageDefaults)
- Realistic durations from the default config
- Some chains completed (in the past), some active (spanning now), some planned (future)
- A few checkpoint tasks (mix of planned/done/not_possible)
- A few maintenance tasks
- No impossible overlaps, but maybe 1-2 tight fits to make it interesting
- Anchored to the current date so the wallboard now-line always shows activity

**After generation, users can:**
- Add/rename/remove product lines (e.g. replace "GNT" with their own product)
- Add/rename/remove machines and reassign to product lines
- Change default stage durations per product line
- All changes are in-memory; export to Excel to save

**Decision needed:** How many batches, how dense? Should it look busy or calm?
Suggest: moderately busy — enough to fill the screen, not so much it overwhelms.

### 2. Excel Template Schemas (Phase 1 blocker)

The Free edition's data layer is Excel import/export. Need finalized templates
before building the import validator.

**What's defined:** Column names and types in CLAUDE.md (pososda, nacep, precep, serija).

**What's missing:**
- Actual `.xlsx` template files with headers and sample rows
- Validation rules for edge cases:
  - What happens with duplicate rows (same machine + start + series)?
  - Are empty rows silently skipped or flagged?
  - How are partial rows handled (machine but no dates)?

**Partially decided:**
- **Date format:** Use unambiguous formats only. Preferred: `YYYY-MMM-DD`
  (e.g. `2025-Mar-15`) or `DD-MMM-YYYY` (e.g. `15-Mar-2025`). The three-letter
  month abbreviation eliminates day/month ambiguity across locales. On import,
  the parser should accept both formats and ISO 8601 (`YYYY-MM-DD`).
- **Machine names:** Multiple equipment templates loaded randomly when a new session
  opens (so users see variety). The user can rename, regroup, and reconfigure all
  equipment in the Equipment Setup menu. Templates are NOT hardcoded — they are
  demo presets that the user customizes.
- How many sheets per workbook? Current spec says schedule Sheet1 + optional
  tasks Sheet2, but this needs to be locked down.

**Still needed:** Create the actual `.xlsx` template sample files.

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
- **Still needed:** Wire turnaround activities into the overlap detection engine
  (`lib/scheduling.ts`) so that the minimum gap between consecutive batches on
  the same vessel is enforced (warn, not block). Build the Process Setup modal UI
  for users to configure turnaround activities per equipment group.

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
  `lib/store.ts`. Re-validation after shift is still pending (needs `scheduling.ts`).

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

**Waitlist API:**
- `POST /api/waitlist` with email, optional company, optional notes
- Store in Vercel KV or Postgres
- Send confirmation email (Resend or similar)
- Admin view or export for reviewing signups

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
| Store CRUD — all entities | Done | Stage, BatchChain, Machine, MachineDisplayGroup, ProductLine, TurnaroundActivity |
| `bulkShiftStages()` store action | Done | Shifts selected stages by N hours |
| `generateId()` helper | Done | Monotonic counter with optional prefix |
| `TurnaroundActivity` type | Done | d:h:m duration, equipment group, isDefault flag |
| `turnaroundTotalHours()` helper | Done | Computes total hours from d:h:m fields |
| Equipment Setup modal | Done | Machines tab (inline edit, reorder, add/delete) + Display Groups tab (checkbox grid) |
| Reusable modal CSS (`pp-modal-*`) | Done | Backdrop, header, tabs, body, footer, buttons — shared by all setup modals |

### Pending — Setup Modals

| Component | Gap | Priority |
|-----------|-----|----------|
| Process Setup modal | UI for stage defaults, turnaround activities (CIP/SIP), shutdown/holiday rules | High — needed before scheduling engine |
| Shift Schedule modal | UI for team names, rotation pattern, shift colors | Medium — wallboard already uses hardcoded cycle |

### Pending — Batch Operations

| Component | Gap | Priority |
|-----------|-----|----------|
| New Batch Chain wizard | Auto-scheduling with back-calculation, vessel suggestions, overlap check | High — core planner feature |
| Bulk Shift tool | UI for cutoff date/series filter + hour delta input, post-shift validation | High |
| Chain Editor / Stage Detail Panel | Click-to-edit side panel for stage properties | High |
| Drag-to-move / stretch-to-resize | Canvas interaction for stage bars | Medium |

### Pending — Data I/O

| Component | Gap | Priority |
|-----------|-----|----------|
| Import Schedule (xlsx) | Wire `lib/excel-io.ts` to sidebar button | High |
| Export Schedule (xlsx) | Wire `lib/excel-io.ts` to sidebar button | High |
| Import/Export Maintenance | Separate template, separate button | Medium |

---

## PDF Export Gaps

The Schedule PDF export uses a dual-canvas architecture: a visible responsive
canvas for on-screen display and a hidden fixed-size canvas (1122×794 px) for
deterministic A4 capture. While the overall design is sound, the current
implementation has several gaps that conflict with the project's core principles.

### Gap 1: `html2canvas` + `visibility: hidden` — blank PDF body

**Severity:** Critical (blocks usable PDF output)

The hidden export canvas container is styled with `visibility: hidden` and
`left: -99999px`. Two problems arise:

1. **`html2canvas` respects CSS visibility.** When it encounters an element (or
   its ancestor) with `visibility: hidden`, it may skip rendering the visual
   content entirely. The captured image is a blank white rectangle — only the
   jsPDF header/footer are visible in the final PDF.

2. **`ResizeObserver` may report zero dimensions.** WallboardCanvas relies on
   `ResizeObserver` on its container to get `dims.width` / `dims.height`. The
   draw function early-returns with `if (dims.width === 0) return;`. If the
   observer fires with zero dimensions (possible for `visibility: hidden` in
   some browsers), the canvas is never drawn at all.

**Recommended fix:** Replace `html2canvas` capture with a direct
`canvas.toDataURL('image/png')` call on the native `<canvas>` element. Since
WallboardCanvas already renders to a real HTML canvas, its pixel data is
accessible without any DOM-to-canvas re-rendering library. This eliminates the
`visibility: hidden` interaction entirely and is simpler, faster, and more
reliable.

If `html2canvas` is retained, change the container from `visibility: hidden` to
`opacity: 0; overflow: hidden; pointer-events: none` so the element remains
"visible" in the CSS rendering sense but is invisible to the user.

**Philosophy alignment:** The project favors "zero unnecessary dependencies."
Using `html2canvas` to capture a `<canvas>` element is redundant — the canvas
already holds its own pixel data.

### Gap 2: DPR double-scaling — excessive memory on high-DPI devices

**Severity:** Medium (performance, not correctness)

WallboardCanvas scales the canvas buffer by `window.devicePixelRatio` (e.g. 2×
on Retina). Then `html2canvas` applies its own `scale: 2`. On a 2× DPR device,
the final capture is 4× the CSS dimensions:

```
Export canvas: 1122 × 794 CSS px
After DPR 2×:  2244 × 1588 device px
After html2canvas scale 2×: 4488 × 3176 captured px
```

That is ≈ 14.3 million pixels — far more than needed for a 297mm A4 page at
print resolution. It wastes memory and slows export, especially on mobile.

**Recommended fix:** If using direct `canvas.toDataURL()`, no extra scaling is
needed — the canvas buffer already contains the high-DPI pixel data. If
retaining `html2canvas`, set `scale: 1` since the canvas is already DPR-scaled.

### Gap 3: Hidden canvas runs unnecessary 60-second redraw timer

**Severity:** Low (wasted CPU, no user-visible effect)

WallboardCanvas has a `setInterval` that redraws every 60 seconds to refresh
the now-line position. The hidden export canvas sets `showNowLine={false}`, so
the now-line is never drawn — but the timer still fires, triggering a full
canvas redraw every minute for an off-screen surface.

**Recommended fix:** Either skip the interval when `showNowLine` is `false`, or
accept the wasted redraw as negligible. A cleaner approach is to add a prop
(e.g. `disableAutoRefresh`) that the export canvas sets to `true`.

### Gap 4: `loadDemoData()` called by both canvas instances

**Severity:** Low (no functional impact due to Zustand idempotency)

Both the visible and hidden WallboardCanvas instances call `loadDemoData()` in
their `useEffect` mount hooks. The Zustand store is idempotent (only loads once
if not already loaded), so this doesn't cause duplicate data. But it is
redundant — the page-level component (`SchedulePage`) already calls
`loadDemoData()` before rendering either canvas.

**Recommended fix:** Remove `loadDemoData()` from WallboardCanvas and ensure
it is called only at the page level. This simplifies the component and makes
data ownership clearer.

### Summary table

| # | Gap | Severity | Philosophy conflict |
|---|-----|----------|---------------------|
| 1 | `visibility: hidden` produces blank capture | Critical | Unnecessary use of `html2canvas` on a native `<canvas>` element |
| 2 | DPR double-scaling wastes memory | Medium | Over-engineering: 4× resolution for a 297mm page |
| 3 | 60s timer on hidden canvas | Low | Unnecessary CPU work on off-screen surface |
| 4 | Duplicate `loadDemoData()` calls | Low | Redundant side-effect; data ownership unclear |
