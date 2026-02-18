30-second elevator pitch
PlantPulse Scheduler is a manufacturing wallboard + planning web app that preserves spatial time cognition (like your PowerPoint board) while adding governed planning (draft → propose → approve/commit), shift ownership visibility, maintenance coordination, and GxP-ready audit integrity.
It feels like a calm pharma control room.
Problem & mission
	•	Problem
	◦	Excel + PowerPoint macros are spatial and fast, but fragile:
	▪	hard-coded paths
	▪	monolithic logic
	▪	limited traceability
	▪	no governed change workflow
	▪	no enterprise security or integration foundation
	•	Mission
	◦	Preserve the wallboard as a digital production instrument (operator-first).
	◦	Add planning power via a modern Planner View (VBA BigReadArray behavior, modernized).
	◦	Enforce governance: Draft → Propose → Approve/Commit with undo.
	◦	Make accountability visible via shift ownership band.
	◦	Coordinate maintenance via timeline-layered maintenance tasks.
	◦	Be GxP-ready by design (Part 11/Annex 11 direction), with clear audit vs system logs separation.
Editions
Free (Community / Session Mode)
	•	Import from two Excel templates at session start:
	◦	Scheduling Excel
	◦	Maintenance Excel
	•	Operate in-memory (BigReadArray-style)
	•	Export back to Excel (including an audit sheet)
	•	No persistent database
	•	No multi-user concurrency
	•	No SSO
Enterprise Cloud (Single-tenant per customer)
	•	Cloud-hosted, single-tenant deployment per customer
	•	Persistent database
	•	Enterprise security (SSO + MFA + RBAC)
	•	Plan checkout system
	•	Immutable audit trail + commit log
	•	ERP batch integration layer (SAP S/4HANA, SAP ECC, or other ERP)
	•	GxP controls, monitoring, backups, retention policies
Enterprise On-Prem (Single-tenant, self-hosted/private cloud)
	•	Same enterprise features
	•	Customer-managed infrastructure (private cloud/on-prem)
	•	Supports AD/LDAP + SSO
	•	Customer-managed backups/retention (with PlantPulse support patterns)
Target audience and roles
	•	Manufacturing Operator (execution)
	◦	Uses the manufacturing wallboard
	◦	Confirms tasks + maintenance acknowledgements
	◦	Never sees planning tools
	•	Inoculum Operator
	◦	Uses monthly inoculum view with weekends/staffing constraints
	•	Scheduler (draft/propose)
	◦	Creates schedules from scratch or extends existing as draft
	◦	Cannot commit
	•	Planner (approve/commit)
	◦	Reviews diffs, impacts, and commits the active plan
	◦	Planner-only access to commit log
	•	Supervisor
	◦	Oversight; may be optional co-approver depending on configuration
	•	Maintenance
	◦	Plans maintenance tasks (layered), coordinates timing with production
	•	Admin
	◦	Configuration, governance, security, templates, shift rotation anchors/overrides
Multi-role users are allowed.
	•	Mode switching is easy.
	•	Permissions stay strict.
	•	Audit logs store role context.
Core views (lenses)
	•	Manufacturing Wallboard (Operator view)
	◦	dynamic now-centered range: 4 days back + today + 2–3 weeks forward
	◦	shift ownership band at top (secondary layer)
	◦	bars + tasks + maintenance acknowledgements
	•	Planner View (modern UrediPlan)
	◦	interactive schedule editor in drafts
	◦	drag/move/stretch bars
	◦	chain editor, bulk shift, add new chain wizard
	◦	conflict detection + overrides (if enabled)
	•	Inoculum Month View
	◦	whole month, weekends highlighted, staffing windows enforced
	•	Drafts & Approvals
	◦	propose, review, approve/commit, reject with comments
	•	Commit Log (Planner only)
	◦	list of all commits and criticality
	•	Audit Trail
	◦	filterable business audit entries
	•	Admin Settings
Core data model (conceptual)
	•	Product Line (user-configurable)
	◦	id, name, stage_defaults (ordered seed train template with default durations), display_order
	◦	Users can add/rename/remove product lines to match their facility
	◦	GNT and KK are legacy defaults used in demo data, not hardcoded
	•	Machine (user-configurable)
	◦	name, group, product_line (optional), holds, display_order
	◦	Users can add/rename/remove machines and assign them to product lines
	•	Batch
	◦	batch_chain_id, batch_name, batch_color (deterministic), product_line, status, name_locked
	◦	ERP fields (Enterprise): erp_system, erp_batch_number, erp_material_code, erp_status, last_sync
	•	Stage/Occupancy
	◦	machine_id, batch_chain_id, stage_type, start/end, state, min/max durations
	•	Checkpoint Task
	◦	machine_id, planned_datetime, task_code, status, confirmed_by/at, comment, derived batch_chain_id by overlap
	•	Maintenance Task (independent, layered)
	◦	machine_id, planned window, task_code/type, status, acknowledged_by/at, comment/not-possible reason
	•	Shift Rotation
	◦	4 teams, 12-hour shifts
	◦	rotation anchored from shutdown-to-shutdown
	◦	rare override windows (audited)
	•	Plan Governance
	◦	Plan (Draft/Proposed/Committed)
	◦	Plan Snapshot (rollback point)
	◦	Approvals
	◦	Commit Log (Planner-only)
	•	Audit Trail (business)
	◦	append-only, time-stamped, before/after, attributable
	•	System Logs (technical)
	◦	API/access/errors/security/performance (Enterprise)
Key operating rules
Shift band is operational ownership
	•	Not decoration
	•	Shows who was / will be on duty
	•	Derived deterministically from rotation + overrides
Shutdown day is a first-class boundary
	•	Displays “PLANT SHUTDOWN (NO ELECTRICITY)” across all machines
	•	Operators: read-only
	•	Planner/Maintenance: editable in draft/maintenance layer
	•	Batch chains must finish before shutdown
	•	New chains start after shutdown
	•	Rotation anchor can reset at shutdown
Overrides are allowed, but controlled
Admin settings control whether users may override:
	•	staffing rules
	•	hold rules
	•	shutdown constraints
Overrides:
	•	auto-flag as Critical
	•	comment mandatory
	•	shown in commit log
	•	captured in audit trail
GxP-ready controls (Enterprise)
Based on GxP cloud guidance: secure records, audit trails, IAM, retention, change control, monitoring, incident response.
	•	Identity & Access
	◦	SSO (SAML/OIDC, Azure AD, Okta) + MFA support
	◦	RBAC + segregation of duties
	◦	role change audit
	•	Electronic records
	◦	immutable, time-stamped audit trail
	◦	
	•	Dual approval options for critical overrides
	
