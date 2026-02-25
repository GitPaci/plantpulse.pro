# App Flow, Pages, and Roles

## Site Map (Top-Level)

- Manufacturing Wallboard
- Planner View
- Schedule
- Drafts & Approvals
- Commit Log (Planner only)
- Audit Trail
- Admin Settings
- Account/Profile

---

## Purpose of Each Page

| Page | Purpose |
|------|---------|
| **Manufacturing Wallboard** | Execute and monitor operations at a glance. Fullscreen button (top-right, before Shift indicator) enters browser fullscreen with black background and TV-safe margins; exit via hover-reveal button or Escape. Night View toggle (immediately before Fullscreen button) switches to a dark, high-contrast theme for TV displays; auto-switches at 22:00/05:00 local time; persisted in localStorage. |
| **Planner View** | Edit drafts: drag/move/stretch, chain editor, bulk shift, conflict handling. Sidebar includes Equipment Setup and Process Setup modals for facility configuration. |
| **Schedule** | Monthly cadence with weekend/staffing structure. Equipment group filtering via multi-select toggle buttons (Inoculum → PR → PF → F → All Equipment). Multiple groups can be active simultaneously; "All Equipment" resets to show everything. Export PDF button generates A4 landscape PDF with configurable header/footer via a hidden fixed-size export canvas (1122×794 px, viewport-independent); gear icon opens Print Settings (persisted in localStorage). On mobile (< 768px), all toolbar controls collapse into a "☰ Controls" hamburger menu with sectioned dropdown panel. |
| **Drafts & Approvals** | Draft lifecycle: propose/reject/approve/commit. |
| **Commit Log** | Planner-only: list of all commits and criticality. |
| **Audit Trail** | Business audit of all meaningful actions. |
| **Admin Settings** | Machines, rules, staffing, holds, shift rotation anchors/overrides, override permissions, templates, roles. |

### Planner Setup Modals (accessible from Planner sidebar)

| Modal | Tabs | Purpose |
|-------|------|---------|
| **Equipment Setup** | Machines, Equipment Groups, Product Lines | Configure facility equipment: add/rename/reorder machines, define equipment groups (dynamic, no longer hardcoded), manage product lines (auto-derives display groups via `buildDisplayGroups()`). Machines tab includes per-machine downtime editor (yellow dot indicator: active/scheduled/ended states). |
| **Process Setup** | Stage Defaults, Turnaround Activities, Shutdowns | Configure process parameters: edit default stage durations per product line, define turnaround activities (CIP/SIP/Cleaning) per equipment group with d:h:m picker, manage plant shutdown periods with date range and reason. |
| **Account/Profile** | Role assignments, default lens, language. |

---

## Roles and Access

| Role | Access |
|------|--------|
| **Operator** | Manufacturing wallboard: confirm tasks + maintenance acknowledgements. No planner tools, no approvals, no settings. |
| **Scheduler** | Planner view: create/edit draft. Drafts & approvals: propose. Cannot commit. |
| **Planner** | Drafts & approvals: approve/commit/reject. Commit log: view. Planner view: can edit drafts. |
| **Maintenance** | Maintenance layer tasks planning (draft/layer). Acknowledgements visible. |
| **Admin** | All settings + security + overrides + role management. |
| **Supervisor** | Oversight; optional co-approval policies (Enterprise). |

**Multi-role:**

- Mode switch changes tools, not permissions.
- Actions recorded with role context.

---

## Primary User Journeys (3 Steps Max)

### Operator Confirms a Task

1. Open Manufacturing Wallboard (now anchored).
2. Click red task → becomes green checkmark.
3. Long-press if comment/not possible needed.

### Operator Acknowledges Maintenance

1. Tap maintenance marker.
2. Mark done or long-press not possible + reason.
3. Audit entry recorded.

### Scheduler Proposes a Plan

1. Open Planner View → edit Draft.
2. Resolve conflicts or add overrides (if allowed).
3. Propose with comment.

### Planner Commits

1. Open Drafts & Approvals → review diff.
2. Critical actions require comment.
3. Commit → snapshot + audit + commit log entry.
