# Gaps and Open Questions

Known gaps in the specification, organized by what blocks the Free MVP build
versus what can wait for Enterprise phases.

---

## Blocks Free MVP

### 1. Excel Template Schemas (Phase 1 blocker)

The Free edition's entire data layer is Excel import/export. Need finalized templates
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

### 2. Rule Engine Edge Cases (Phase 2 blocker)

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

### 3. Test Strategy (Phase 1-2)

Need test patterns established before building lib modules, not after.

**What's needed for Free MVP:**
- Unit tests for all `lib/` modules (timeline-math, holidays, colors, shift-rotation,
  scheduling, seed-train, excel-io)
- Component tests for timeline rendering (does a known dataset produce expected
  bar positions?)
- Integration test: import Excel -> store -> render timeline -> export Excel roundtrip
- Browser targets: which browsers and minimum versions?

**What can wait:**
- E2E tests with Playwright/Cypress (needs actual pages first)
- Role-permission test matrix (Enterprise RBAC)
- GxP evidence test pack (Enterprise compliance)

**Decision needed:** Pick browser support targets. Set up Vitest config.

---

## Important but Enterprise-phase

### 4. Physical Database Schema

**Not needed for Free MVP** (in-memory + Excel only).

**When needed:** Phase 11 (Enterprise Cloud) and Phase 12 (On-Prem).

**What will be needed:**
- PostgreSQL table definitions with constraints, indexes, enums
- Migration scripts (up/down)
- Seed data for machines, shift config
- Tenant isolation model (schema-per-tenant vs row-level)
- Retention/archival policy for completed batches

### 5. API Contract

**Not needed for Free MVP** (no server, all client-side).

**When needed:** Phase 11 (Enterprise Cloud).

**What will be needed:**
- OpenAPI 3.x spec or tRPC router definitions
- Endpoints for: plan state transitions (draft/propose/commit/reject),
  task confirmation, maintenance acknowledgement, bulk shift, export
- Auth middleware spec (JWT/session, role claims)
- Rate limiting and request validation rules
- Websocket or SSE for multi-user real-time updates

### 6. Event and Audit Taxonomy

**Partially needed for Free MVP** (Excel audit sheet with basic events).
**Full taxonomy needed for Enterprise** (immutable audit store).

**What's needed for Free:**
- Basic event list: import, export, task_confirmed, task_not_possible,
  maintenance_acknowledged, draft_created, draft_committed
- Fields: timestamp, actor (Free: "session user"), event_type, entity_id, description

**What can wait for Enterprise:**
- Full event catalog with exact payload schemas
- Before/after snapshots for every mutation
- Actor role context capture
- Retention and immutability enforcement
- System log events (API access, auth, errors, performance)

### 7. Non-Functional Requirements / SLOs

**Mostly Enterprise concerns.** A few items worth deciding now:

**Decide now:**
- Browser support: Chrome, Firefox, Safari, Edge — minimum versions?
- Minimum screen resolution: 1920x1080 (matches legacy wallboard)?
  What about tablet/laptop at 1366x768?
- Canvas rendering performance target: smooth at 30 machines x 25 days?
- Max Excel file size for import?

**Enterprise-phase:**
- Uptime SLA (99.9%? 99.95%?)
- RPO/RTO targets
- Security baselines (pen test cadence, vulnerability scanning)
- Accessibility level (WCAG AA is already in design-guidelines.md)

---

## Open Questions (need answers before or during build)

| # | Question | Impacts | Suggested default |
|---|----------|---------|-------------------|
| 1 | Should the app ship with hardcoded demo data for the landing page, or start blank? | Landing page UX | Hardcoded demo dataset showing a realistic 2-week schedule |
| 2 | Is the Free edition a static export (no server at all) or does it need `next start`? | Deployment to plantpulse.pro | Static export (`next export`) — host on any CDN |
| 3 | Should the shift rotation config be editable in Free, or fixed to the 4-team/12h/8-step cycle? | Admin page scope | Fixed in Free, editable in Enterprise |
| 4 | Do we show the Planner View in Free, or just the Wallboard? | Scope of Free demo | Show both — Planner with local draft editing, no governance workflow |
| 5 | What's the deploy target for plantpulse.pro? | CI/CD setup | Vercel (free tier works for static Next.js) |
| 6 | Do checkpoint tasks come from the same Excel file as the schedule, or a separate file? | Import UX | Same file, different sheet (Sheet2) |
| 7 | Should the maintenance template be a separate import, or combined? | Import UX | Separate file — different update cadence |
