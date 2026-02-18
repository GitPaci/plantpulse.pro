# PlantPulse Scheduler

Manufacturing wallboard and planning web app for multistep batch chain processes (e.g., fermentation, bioprocessing, chemical synthesis).

PlantPulse preserves the spatial-time visualization operators already rely on (the factory wallboard) while adding governed scheduling, shift ownership, maintenance coordination, and compliance-ready audit integrity. While pharmaceutical fermentation is the original use case, PlantPulse supports any multistep batch chain process where stages flow through a sequence of vessels or equipment.

## The Problem

Production scheduling for multistep batch chain processes — fermentation, bioprocessing, and similar operations — often lives inside Excel spreadsheets and PowerPoint macros. These tools are spatial and fast, but fragile:

- Hard-coded file paths and monolithic VBA logic
- No governed change workflow (anyone can edit, no approval trail)
- No traceability or audit integrity
- Limited to a single workstation, no multi-user access
- No integration path to ERP or enterprise systems

## What PlantPulse Does

| View | Who uses it | What it does |
|------|-------------|--------------|
| **Manufacturing Wallboard** | Operators | Now-centered timeline with batch bars, checkpoint tasks, maintenance markers, and shift ownership band. One-click task confirmation. |
| **Planner View** | Schedulers & Planners | Interactive draft editor: drag/move/stretch bars, chain editor, bulk shift, new batch chain wizard with auto-scheduling and conflict detection. |
| **Inoculum Month** | Inoculum Operators | Full-month view with weekend highlighting and staffing window enforcement. |
| **Drafts & Approvals** | Schedulers & Planners | Governed workflow: Draft, Propose, Review diff, Approve/Commit or Reject. |
| **Commit Log** | Planners only | Immutable record of all committed plan changes with criticality flags. |
| **Audit Trail** | Compliance | Append-only, time-stamped, attributable business audit entries. |

## Try It Free

Visit **plantpulse.pro** to try PlantPulse instantly:

1. Open the app -- a realistic demo schedule is generated automatically
2. Explore the **Wallboard** (operator view) and **Planner** (scheduling view)
3. Edit the schedule: drag, stretch, add new batch chains, bulk shift
4. **Export to Excel** to save your work
5. Next visit: fresh demo data, or **import your Excel** to pick up where you left off

No account needed. No data stored on our servers. Your browser, your data.

Interested in the full Enterprise version with multi-user, approvals, audit trail,
and ERP integration? **Join the waitlist** on the landing page.

## Editions

| | Free (plantpulse.pro) | Enterprise Cloud | Enterprise On-Prem |
|---|---|---|---|
| Demo data on every visit | Yes | N/A | N/A |
| Import/export Excel | Yes | Yes | Yes |
| In-memory (no persistence) | Yes | Persistent DB | Persistent DB |
| Planner + Wallboard | Yes | Yes | Yes |
| Drafts & approvals workflow | No | Yes | Yes |
| Multi-user | No | Yes | Yes |
| SSO / MFA / RBAC | No | Yes | Yes |
| ERP integration | No | SAP S/4HANA, ECC | SAP S/4HANA, ECC |
| GxP audit trail | Excel audit sheet | Immutable store | Immutable store |
| Deployment | Vercel (free) | Single-tenant cloud | Self-hosted / private cloud |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js + TypeScript |
| Timeline rendering | HTML Canvas + SVG overlays |
| State management | Zustand |
| Excel I/O | SheetJS |
| Styling | Tailwind CSS |
| Testing | Vitest + Testing Library |

## Project Structure

```
plantpulse.pro/
├── CLAUDE.md              # Development guide (business rules, algorithms, data model)
├── docs/
│   ├── masterplan.md      # Vision, editions, roles, operating rules
│   ├── app-flow-pages-and-roles.md
│   ├── design-guidelines.md
│   ├── implementation-plan.md
│   └── legacy/            # Original VBA macro extracts (reference only)
├── src/
│   ├── app/               # Next.js App Router pages
│   ├── components/        # React components (timeline, planner, wallboard, ui)
│   └── lib/               # Core logic (store, scheduling, timeline math, Excel I/O)
└── public/
    └── templates/         # Downloadable Excel templates
```

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | Full development guide: legacy VBA analysis, extracted business rules, data model, algorithms, color palettes, glossary |
| [Masterplan](docs/masterplan.md) | Product vision, editions, roles, data model, operating rules, GxP direction |
| [App Flow & Roles](docs/app-flow-pages-and-roles.md) | Site map, role-based access, primary user journeys |
| [Design Guidelines](docs/design-guidelines.md) | Visual design system, interaction patterns, accessibility |
| [Implementation Plan](docs/implementation-plan.md) | Phased build sequence (Phase 0-13) |
| [Gaps & Open Questions](docs/gaps-and-open-questions.md) | Specification gaps, decisions made, remaining open items |
| [Code of Conduct](CODE_OF_CONDUCT.md) | Community standards, enterprise governance, GxP-aligned conduct principles |
| [Security Policy](SECURITY.md) | Vulnerability reporting and security practices |

## Security

If you discover a security vulnerability, please report it responsibly via [hello@plantpulse.pro](mailto:hello@plantpulse.pro). **Do not open a public issue.** See [SECURITY.md](SECURITY.md) for full details.

## Background

This project modernizes a legacy VBA system originally built for pharmaceutical fermentation scheduling at a production facility in Slovenia. The architecture generalizes to any multistep batch chain process. The original system consisted of:

- **FormaZaPlan.xls** -- Interactive Excel planner with Gantt chart UserForm, batch editing, chain creation, and export
- **InfoTabla.ppt** -- PowerPoint-based operator wallboard rendering a 25-day timeline at 1920x1080 with shift bands and task markers
- **Izberidatum.ppt** -- Configurable planning view with date/vessel group filters

The VBA code, Slovenian-language comments, and all extracted business rules are preserved in `docs/legacy/` and documented in `CLAUDE.md` for reference during the modernization.

## License

Proprietary. All rights reserved.
