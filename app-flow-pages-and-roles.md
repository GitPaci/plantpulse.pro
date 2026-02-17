Site map (top-level)
	•	Manufacturing Wallboard
	•	Planner View
	•	Inoculum Month
	•	Drafts & Approvals
	•	Commit Log (Planner only)
	•	Audit Trail
	•	Admin Settings
	•	Account/Profile
Purpose of each page
	•	Manufacturing Wallboard
	◦	Execute and monitor operations at a glance.
	•	Planner View
	◦	Edit drafts: drag/move/stretch, chain editor, bulk shift, conflict handling.
	•	Inoculum Month
	◦	Monthly cadence with weekend/staffing structure.
	•	Drafts & Approvals
	◦	Draft lifecycle: propose/reject/approve/commit.
	•	Commit Log
	◦	Planner-only: list of all commits and criticality.
	•	Audit Trail
	◦	Business audit of all meaningful actions.
	•	Admin Settings
	◦	Machines, rules, staffing, holds, shift rotation anchors/overrides, override permissions, templates, roles.
	•	Account/Profile
	◦	Role assignments, default lens, language.
Roles and access
	•	Operator
	◦	Manufacturing wallboard: confirm tasks + maintenance acknowledgements
	◦	No planner tools, no approvals, no settings
	•	Scheduler
	◦	Planner view: create/edit draft
	◦	Drafts & approvals: propose
	◦	Cannot commit
	•	Planner
	◦	Drafts & approvals: approve/commit/reject
	◦	Commit log: view
	◦	Planner view: can edit drafts
	•	Maintenance
	◦	Maintenance layer tasks planning (draft/layer)
	◦	Acknowledgements visible
	•	Admin
	◦	All settings + security + overrides + role management
	•	Supervisor
	◦	Oversight; optional co-approval policies (Enterprise)
Multi-role:
	•	Mode switch changes tools, not permissions
	•	Actions recorded with role context
Primary user journeys (3 steps max)
	•	Operator confirms a task
	1	Open Manufacturing Wallboard (now anchored).
	2	Click red task → becomes green ✓.
	3	Long-press if comment/not possible needed.
	•	Operator acknowledges maintenance
	1	Tap maintenance marker.
	2	Mark done or long-press not possible + reason.
	3	Audit entry recorded.
	•	Scheduler proposes a plan
	1	Open Planner View → edit Draft.
	2	Resolve conflicts or add overrides (if allowed).
	3	Propose with comment.
	•	Planner commits
	1	Open Drafts & Approvals → review diff.
	2	Critical actions require comment.
	3	Commit → snapshot + audit + commit log entry.
