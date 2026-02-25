# PlantPulse Scheduler — Masterplan

## 30-Second Elevator Pitch

PlantPulse Scheduler is a manufacturing wallboard + planning web app that preserves spatial time cognition (like your PowerPoint board) while adding governed planning (draft → propose → approve/commit), shift ownership visibility, maintenance coordination, and GxP-ready audit integrity.

**It feels like a calm pharma control room.**

---

## Problem & Mission

### Problem

Excel + PowerPoint macros are spatial and fast, but fragile:

- Hard-coded paths
- Monolithic logic
- Limited traceability
- No governed change workflow
- No enterprise security or integration foundation

### Mission

- Preserve the wallboard as a digital production instrument (operator-first).
- Add planning power via a modern Planner View (VBA BigReadArray behavior, modernized).
- Enforce governance: Draft → Propose → Approve/Commit with undo.
- Make accountability visible via shift ownership band.
- Coordinate maintenance via timeline-layered maintenance tasks.
- Be GxP-ready by design (Part 11/Annex 11 direction), with clear audit vs system logs separation.

---

## Editions

### Free (Community / Session Mode)

- Import from two Excel templates at session start:
  - Scheduling Excel
  - Maintenance Excel
- Operate in-memory (BigReadArray-style)
- Export back to Excel (including an audit sheet)
- Export Schedule to PDF (A4 landscape, client-side only, configurable header/footer)
- No persistent database
- No multi-user concurrency
- No SSO

**Privacy guarantees (Free Edition):**

- Browser-only: static HTML/JS/CSS, no server process, deployable to any CDN
- Zero server roundtrips: no fetch calls, no API routes, no database connections
- No cookies: no session cookies, no tracking cookies, no auth tokens
- No telemetry: no analytics, no tracking scripts, no external network requests
- All data lives in-memory and resets on page reload; Excel import/export is the only persistence

### Enterprise Cloud (Single-tenant per customer)

- Cloud-hosted, single-tenant deployment per customer
- Persistent database
- Enterprise security (SSO + MFA + RBAC)
- Plan checkout system
- Immutable audit trail + commit log
- ERP batch integration layer (SAP S/4HANA, SAP ECC, or other ERP)
- GxP controls, monitoring, backups, retention policies

### Enterprise On-Prem (Single-tenant, self-hosted/private cloud)

- Same enterprise features
- Customer-managed infrastructure (private cloud/on-prem)
- Supports AD/LDAP + SSO
- Customer-managed backups/retention (with PlantPulse support patterns)

---

## Target Audience and Roles

| Role | Description |
|------|-------------|
| **Manufacturing Operator** | Uses the manufacturing wallboard. Confirms tasks + maintenance acknowledgements. Never sees planning tools. |
| **Operator** | Uses monthly schedule view with weekends/staffing constraints. |
| **Scheduler** | Creates schedules from scratch or extends existing as draft. Cannot commit. |
| **Planner** | Reviews diffs, impacts, and commits the active plan. Planner-only access to commit log. |
| **Supervisor** | Oversight; may be optional co-approver depending on configuration. |
| **Maintenance** | Plans maintenance tasks (layered), coordinates timing with production. |
| **Admin** | Configuration, governance, security, templates, shift rotation anchors/overrides. |

Multi-role users are allowed:

- Mode switching is easy.
- Permissions stay strict.
- Audit logs store role context.

---

## Core Views (Lenses)

- **Manufacturing Wallboard (Operator view)**
  - Dynamic now-centered range: 4 days back + today + 2--3 weeks forward
  - Shift ownership band at top (secondary layer)
  - Bars + tasks + maintenance acknowledgements
  - Night View: dark, high-contrast TV-optimized mode (toggle or auto-switch at 22:00/05:00 local)

- **Planner View (modern UrediPlan)**
  - Interactive schedule editor in drafts
  - Drag/move/stretch bars
  - Chain editor, bulk shift, add new chain wizard
  - Conflict detection + overrides (if enabled)

- **Schedule View**
  - Whole month, weekends highlighted, staffing windows enforced
  - Equipment group filter toolbar with multi-select toggle buttons
  - Button order (left → right): Inoculum, Propagators (PR), Pre-fermenters (PF), Fermenters (F), All Equipment
  - Multiple groups can be active simultaneously (e.g. PR + PF shows both)
  - "All Equipment" acts as reset: clears all selections, shows everything
  - If no specific group is selected, defaults to showing all equipment
  - Filtering affects visible equipment rows and their events; hidden equipment does not render
  - **Export PDF**: client-side A4 landscape PDF generation (html2canvas + jsPDF, zero network calls)
    - Dual-canvas architecture: hidden fixed-size canvas (1122×794 px = A4 at 96 DPI) ensures identical output regardless of device/viewport; visible responsive canvas is for on-screen display only
    - Configurable header (facility title, month/year) and compliance-inspired footer
    - Footer includes: app version, export timestamp with timezone + UTC offset, prepared-by, signature line, disclaimer, page numbers
    - Print Settings modal with localStorage persistence (gear icon next to Export PDF button)
    - Enterprise-locked fields visible but disabled (logo, watermark, electronic signatures, document control, etc.)
  - **Responsive toolbar**: on mobile (< 768px), toolbar controls collapse into a "☰ Controls" hamburger menu with month navigation, equipment filter grid, and export/print actions in a dropdown panel

- **Drafts & Approvals**
  - Propose, review, approve/commit, reject with comments

- **Commit Log (Planner only)**
  - List of all commits and criticality

- **Audit Trail**
  - Filterable business audit entries

- **Admin Settings**

---

## Core Data Model (Conceptual)

- **Product Line** (user-configurable)
  - id, name, stage_defaults (ordered seed train template with default durations), display_order
  - Users can add/rename/remove product lines to match their facility
  - GNT and KK are legacy defaults used in demo data, not hardcoded

- **Equipment Group** (user-configurable)
  - id, name, short_name, display_order
  - Fully dynamic — no longer a hardcoded enum. Managed via Equipment Setup modal.
  - Schedule view filter buttons are built dynamically from equipment groups.

- **Machine** (user-configurable)
  - name, group (references EquipmentGroup.id), product_line (optional), display_order
  - Users can add/rename/remove machines and assign them to product lines
  - Optional downtime window (start date, optional end date, optional reason)
  - `isMachineUnavailable()` checks availability at a point in time; `isDowntimeEnded()` suppresses past windows

- **Batch**
  - batch_chain_id, batch_name, batch_color (deterministic), product_line, status, name_locked
  - ERP fields (Enterprise): erp_system, erp_batch_number, erp_material_code, erp_status, last_sync

- **Stage/Occupancy**
  - machine_id, batch_chain_id, stage_type, start/end, state, min/max durations

- **Checkpoint Task**
  - machine_id, planned_datetime, task_code, status, confirmed_by/at, comment, derived batch_chain_id by overlap

- **Maintenance Task** (independent, layered)
  - machine_id, planned window, task_code/type, status, acknowledged_by/at, comment/not-possible reason

- **Turnaround Activity** (user-configurable per equipment group)
  - name, duration (days:hours:minutes), equipment_group, is_default flag
  - Defines required gap activities between consecutive batches (e.g. CIP, SIP, Cleaning)
  - Configured in Process Setup modal; `turnaroundTotalHours()` computes effective gap

- **Shutdown Period**
  - name, start_date, end_date, reason (optional)
  - Plant-wide shutdown windows managed in Process Setup modal
  - Past shutdowns visually dimmed; new batches can still cross shutdown boundaries (with visual indication)

- **Machine Display Group** (auto-derived)
  - name, machine_ids
  - Automatically derived from product line + machine assignments via `buildDisplayGroups()`
  - No manual machine-to-group assignment needed

- **Shift Rotation**
  - 4 teams, 12-hour shifts
  - Rotation anchored from shutdown-to-shutdown
  - Rare override windows (audited)

- **Plan Governance**
  - Plan (Draft/Proposed/Committed)
  - Plan Snapshot (rollback point)
  - Approvals
  - Commit Log (Planner-only)

- **Audit Trail** (business)
  - Append-only, time-stamped, before/after, attributable

- **System Logs** (technical)
  - API/access/errors/security/performance (Enterprise)

---

## Key Operating Rules

### Shift Band Is Operational Ownership

- Not decoration
- Shows who was / will be on duty
- Derived deterministically from rotation + overrides

### Shutdown Day Is a First-Class Boundary

- Displays "PLANT SHUTDOWN (NO ELECTRICITY)" across all machines
- Operators: read-only
- Planner/Maintenance: editable in draft/maintenance layer
- Batch chains must finish before shutdown
- New chains start after shutdown
- Rotation anchor can reset at shutdown

### Overrides Are Allowed, but Controlled

Admin settings control whether users may override:

- Staffing rules
- Hold rules
- Shutdown constraints

Overrides:

- Auto-flag as Critical
- Comment mandatory
- Shown in commit log
- Captured in audit trail

### GxP-Ready Controls (Enterprise)

Based on GxP cloud guidance: secure records, audit trails, IAM, retention, change control, monitoring, incident response.

- **Identity & Access**
  - SSO (SAML/OIDC, Azure AD, Okta) + MFA support
  - RBAC + segregation of duties
  - Role change audit

- **Electronic Records**
  - Immutable, time-stamped audit trail
  - Dual approval options for critical overrides

- **Governance & Conduct**
  - [Code of Conduct](../CODE_OF_CONDUCT.md) defines enforceable standards for all participants
  - ALCOA+ data integrity principles (Attributable, Legible, Contemporaneous, Original, Accurate, Complete, Consistent, Enduring, Available)
  - Override governance with mandatory justification and audit capture
  - Training and attestation requirements for enterprise roles
