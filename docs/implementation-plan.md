Step-by-step build sequence (micro-tasks)
Phase 0 — Lock editions and adapters
	•	Define editions:
	◦	Free Session Mode
	◦	Enterprise Cloud (single-tenant)
	◦	Enterprise On-Prem (single-tenant)
	•	Define adapter interfaces (conceptual):
	◦	StorageAdapter: ExcelSession | CloudDB | OnPremDB
	◦	AuthAdapter: None/Local | SSO(SAML/OIDC) | AD/LDAP
	◦	ERPAdapter: None | ERP Batch Integration (pluggable)
	◦	AuditAdapter: SessionAuditSheet | ImmutableAuditStore
	◦	LoggingAdapter: Minimal | EnterpriseLogs
Phase 1 — Excel templates (Free MVP cornerstone)
	•	Create Scheduling Excel template:
	◦	Machines reference
	◦	Stage/Occupancy rows
	◦	Checkpoint task rows
	◦	Optional: shift rotation config sheet
	•	Create Maintenance Excel template:
	◦	Maintenance task rows
	◦	Shutdown block rows
	◦	Optional: override windows sheet
	•	Implement import validator:
	◦	header validation
	◦	datetime parsing
	◦	machine existence
	◦	start <= end
	◦	allowed enum values (stage_type/state/task_code)
	•	Implement export writer:
	◦	schedule export
	◦	maintenance export
	◦	audit export sheet (Free)
Phase 2 — Core timeline engine (shared across views)
	•	Build timeline header:
	◦	month label
	◦	day grid
	◦	today shading
	◦	current hour red line
	•	Build row layout:
	◦	fixed left machine column
	◦	scrollable timeline canvas
	•	Build bar renderer:
	◦	stage bar style (light fill + batch border)
	◦	label placement (start hour left, batch center)
	◦	state label/icon visible
Phase 3 — Shift engine (must match top band)
	•	Implement admin-defined shift rotation:
	◦	4 teams
	◦	12-hour length
	◦	cycle anchored to shutdown-to-shutdown
	•	Add override windows (rare, audited)
	•	Render shift band across timeline (secondary layer)
	•	Add “current shift” label near now-line (subtle)
Phase 4 — Manufacturing Wallboard (Operator lens)
	•	Default time window:
	◦	4 days back
	◦	today anchored
	◦	2–3 weeks forward
	•	Render:
	◦	stage bars
	◦	checkpoint tasks
	◦	maintenance tasks
	•	Task interactions:
	◦	one-click done
	◦	long-press menu:
	▪	comment
	▪	not possible
	•	Operator permissions:
	◦	confirm tasks + maintenance acknowledgements
	◦	no edits to bars, plans, or settings
Phase 5 — Shutdown modeling
	•	Represent shutdown as:
	◦	a full-width “PLANT SHUTDOWN (NO ELECTRICITY)” block across all machine rows
	•	Enforce planning rule checks:
	◦	no batch chains crossing shutdown boundary unless override enabled
	•	Rotation reset anchor:
	◦	shutdown end time can restart shift cycle (admin-defined)
Phase 6 — Inoculum Month view
	•	Render full month with weekend highlight
	•	bkk machines grouped
	•	Staffing windows:
	◦	MVP: warnings + suggested staffed slots
	◦	Enterprise: optionally hard enforcement
Phase 7 — Planner View (modern UrediPlan)
Goal: modern replacement for BigReadArray editor.
	•	Enable draft editing tools:
	◦	drag to move stage blocks
	◦	stretch to change duration
	◦	click to edit properties in side panel
	◦	delete block
	◦	reassign machine
	•	Provide batch chain editor:
	◦	view chain segments across machines
	◦	edit up to N segments
	•	Provide “Add new batch chain” wizard:
	◦	create dependent stages (Inoculum → MFG1 → MFG2 → MFG3)
	◦	suggest machines based on availability
	◦	check overlaps
	•	Provide bulk shift tool:
	◦	cutoff datetime + series threshold (optional)
	◦	shift by N hours
	•	Conflict indicators:
	◦	overlap
	◦	staffing violation
	◦	hold risk
	◦	shutdown crossing
	•	Override behavior:
	◦	allowed only if enabled in settings
	◦	creates Critical commit requirement
Phase 8 — Drafts & approvals workflow (governed truth)
	•	Implement plan states:
	◦	Draft → Proposed → Committed
	•	Scheduler:
	◦	create/edit draft
	◦	propose with comment (optional or required by policy)
	•	Planner:
	◦	review diff
	◦	commit or reject with comment
	•	Commit creates:
	◦	snapshot
	◦	audit trail entries
	◦	commit log row (Planner-only)
Phase 9 — Commit log table (Planner-only)
	•	Build commit log view:
	◦	list of commits
	◦	critical flags
	◦	filters by time, machine, batch_chain_id, planner
	•	Critical behavior:
	◦	critical flag preset by system for overrides/bulk shifts/shutdown edits
	◦	comment mandatory for critical
	◦	user can modify critical flag in Enterprise (as you specified)
Phase 10 — Audit vs system logs separation
	•	Audit Trail (business):
	◦	immutable, append-only in Enterprise
	◦	Free: exported as Excel audit sheet
	•	System Logs (technical) (Enterprise):
	◦	access logs, errors, security events, performance metrics
	◦	alerting hooks
Phase 11 — Enterprise Cloud (single-tenant) rollout plan
	•	Tenant-per-customer deployment pipeline
	•	SSO integration options (SAML/OIDC)
	•	MFA enforcement option
	•	RBAC admin UI + role audits
	•	Backups, retention, monitoring
Phase 12 — Enterprise On-Prem rollout plan
	•	Containerized distribution
	•	Customer-managed DB
	•	AD/LDAP + SSO integration
	•	Backup integration guidance
	•	Patch/release process + validation pack
