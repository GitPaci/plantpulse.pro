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
   (realistic 2-week fermentation schedule across GNT + KK lines)
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
realistic schedules.

**What it needs to produce:**
- 8-15 active batch chains across GNT and KK product lines
- Each chain with correct seed train stages (PR -> PF -> F)
- Realistic durations (GNT: 48h PR, 55h PF, variable F; KK: 44h PR, 20h PF, variable F)
- Some chains completed (in the past), some active (spanning now), some planned (future)
- A few checkpoint tasks (mix of planned/done/not_possible)
- A few maintenance tasks
- No impossible overlaps, but maybe 1-2 tight fits to make it interesting
- Anchored to the current date so the wallboard now-line always shows activity

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
  - Date format tolerance: does "2025-03-15" vs "15.3.2025" both work?
- Machine reference sheet: should the template contain a list of valid machines,
  or is that hardcoded in the app?
- How many sheets per workbook? Current spec says schedule Sheet1 + optional
  tasks Sheet2, but this needs to be locked down.

**Decision needed:** Freeze the template schema and create sample files.

### 3. Rule Engine Edge Cases (Phase 2 blocker)

The VBA business rules are documented, but several edge cases need decisions
before coding the scheduling module.

**Overlap detection:**
- If a batch overlaps on a propagator/pre-fermenter, VBA warns but allows.
  Do we keep that behavior, or block it in the modern version?
- What's the minimum gap between batches on the same vessel? VBA uses 0 hours
  (any non-negative gap is OK). Should we enforce a turnaround/CIP window?

**Auto-scheduling (new chain wizard):**
- When no vessel is available in the product line's pool, does the wizard:
  (a) show an error, (b) suggest the next available date, or (c) allow override?
- `NasPF_MAX` and `NasPR_MAX` tolerance windows: what are the actual values?
  These are referenced in VBA but the constants aren't in the extracted macros.
- Can a chain span across a shutdown boundary? VBA doesn't check this.

**Bulk shift:**
- VBA doesn't re-validate overlaps after a bulk shift. Should we?
  At minimum: warn. Block? Or just highlight conflicts?

**Decision needed:** Document exact rules for each case, even if "same as VBA" is the answer.

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
