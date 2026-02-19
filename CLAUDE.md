# CLAUDE.md — PlantPulse Scheduler Development Guide

## Project Overview

PlantPulse Scheduler is a manufacturing wallboard + planning web app for pharmaceutical
fermentation operations. It modernizes a legacy VBA system (Excel + PowerPoint macros) into
a browser-based tool that preserves spatial-time cognition while adding governed planning,
shift ownership, maintenance coordination, and GxP-ready audit integrity.

**Tagline:** Feels like a calm pharma control room.

### Planning documents (read these first)

| File | Purpose |
|------|---------|
| `docs/masterplan.md` | Vision, editions, roles, data model, operating rules, GxP direction |
| `docs/app-flow-pages-and-roles.md` | Site map, role permissions, primary user journeys |
| `docs/design-guidelines.md` | Visual language, color system, interaction design, accessibility |
| `docs/implementation-plan.md` | Phased build sequence (Phase 0–12) |
| `CODE_OF_CONDUCT.md` | Community standards, enterprise governance, GxP-aligned conduct principles |

### Legacy VBA source files (reference, do not modify)

| File | Origin | Purpose |
|------|--------|---------|
| `docs/legacy/FormaZaPlan_macros.txt` | `FormaZaPlan.xls` | Interactive planner: load data, render Gantt in UserForm, edit/add/delete/shift batches, export |
| `docs/legacy/InfoTabla20180201_macros.txt` | `InfoTabla20180201.ppt` | Operator wallboard: auto-render 25-day Gantt on 1920×1080 slide with shifts, tasks, KPI |
| `docs/legacy/Izberidatum5_macros.txt` | `Izberidatum5.ppt` | Configurable planning view: date picker + vessel group filters, renders Gantt on slide |

---

## Legacy VBA System — What It Does

The VBA system consists of three Excel/PowerPoint macro-driven tools used to schedule
pharmaceutical fermentation batches at a Novartis/Lek (Slovenia) facility. The code is
in Slovenian with some English comments.

### Architecture

```
┌──────────────────────────────────────────────────────┐
│  PlanFermentacije_Tabla.xlsx    (schedule data)      │
│  Sheet1: [pososda, nacep, precep, serija]            │
├──────────────────────────────────────────────────────┤
│  Opravila_Tabla.xlsx           (checkpoint tasks)    │
│  Sheet1: [pososda, nacep, task_desc, status]         │
└───────────┬──────────────────────┬───────────────────┘
            │ ADODB via Excel ODBC │
    ┌───────▼──────┐      ┌───────▼──────────────┐
    │ FormaZaPlan  │      │ InfoTabla / Izberi    │
    │ (Excel form) │      │ (PowerPoint slides)   │
    │ PLANNER      │      │ WALLBOARD / VIEWER    │
    └──────────────┘      └──────────────────────-┘
```

### Data model (from VBA)

The core data is `BigReadArray(0..3, 0..N)` — a 2D array loaded via `rs.GetRows`:

| Index | Column name | Content |
|-------|-------------|---------|
| 0 | `pososda` | Vessel/machine name (e.g. "F-2", "PR-1", "PF-3") |
| 1 | `nacep` | Inoculation start datetime |
| 2 | `precep` | Transfer/end datetime (or hours-as-number for tasks) |
| 3 | `serija` | Series/batch number (integer) |

The task file (Opravila_Tabla.xlsx) has:

| Index | Column name | Content |
|-------|-------------|---------|
| 0 | `pososda` | Vessel name |
| 1 | `nacep` | Task datetime |
| 2 | (col 3) | Task description text |
| 3 | (col 4) | Status / confirmation |

### Vessel hierarchy (seed train)

**Product lines, machines, and stage durations are fully user-configurable.**
Users can add, rename, or remove product lines and machines to match their
facility. The GNT/KK setup below is the legacy VBA default, used as the
demo data template for new sessions.

**Default demo configuration (from legacy VBA):**

**GNT (Gentamicin) line:**
- Propagators: PR-1, PR-2 (seed stage, default duration 48h)
- Pre-fermenters: PF-1, PF-2 (intermediate, default duration 55h)
- Fermenters: F-2, F-3 (production)

**KK line:**
- Propagators: PR-3, PR-4, PR-5, PR-6, PR-7, PR-8 (seed stage, default duration 44h)
- Pre-fermenters: PF-3, PF-4, PF-5, PF-6 (intermediate, default duration 20h)
- Fermenters: F-1, F-4, F-5, F-6, F-7, F-8, F-9, F-10, F-11 (production)

**Other:** bkk1–bkk5 (inoculum/flask-scale vessels)

The full display order (hardcoded in VBA as `imena` array, configurable in modern app):
```
PR-1, PR-2, PF-1, PF-2, F-2, F-3,
bkk1, bkk2, bkk3, bkk4, bkk5,
PR-3, PR-4, PR-5, PR-6, PR-7, PR-8,
PF-3, PF-4, PF-5, PF-6,
F-1, F-4, F-5, F-6, F-7, F-8, F-9, F-10, F-11
```

Groups are separated by an empty-string sentinel in the VBA array.

### Business rules (extracted from VBA logic)

#### 1. Overlap detection
When adding a new series, the system checks:
- `DateDiff("h", lastEndOnVessel, newStart) < 0` → overlap → blocked for fermenter, warned for PF/PR
- Conflict vessel names are collected and shown to user for confirmation

#### 2. Auto-scheduling (new chain wizard)
- Find earliest available fermenter → suggest start = last_end + 12h
- Back-calculate PF start = fermenter_start - PF_duration
- Back-calculate PR start = PF_start - PR_duration
- Auto-assign to first available (non-overlapping) PF and PR vessel in the product line's pool
- Maximum tolerance windows (`NasPF_MAX`, `NasPR_MAX`) constrain how far back to look

#### 3. Bulk time-shift
- Filter: all entries where `series_number >= threshold AND start_date > cutoff_date`
- Shift both start and end by N hours (positive or negative)
- No re-validation of overlaps after shift (manual check needed)

#### 4. Batch bar editing
- Up to 8 stages per series displayed simultaneously
- Each stage: editable vessel, start datetime, end datetime
- "Fixed duration" mode: changing start auto-adjusts end (preserves duration)
- "Link to next" mode: end of stage N syncs to start of stage N+1
- Validation: start must be <= end
- Delete: removes entry from array, shifts remaining entries down

#### 5. Color cycling
- Planner: `series_id mod 12` cycles through 12 colors (Lek/Novartis palette)
- Wallboard: `series_id mod 5` cycles through 5 border colors
- Future batches on wallboard: rendered in grey with transparency

#### 6. Shift rotation (wallboard)
- 4 teams, 12-hour shifts
- 8-step cycle array: `[0, 2, 1, 3, 2, 0, 3, 1]`
- Team colors: Blue (0,102,255), Green (0,204,0), Red (255,0,0), Yellow (255,253,0)
- Current shift determined by `Hour(Now)`: 18-23→shift 2, 0-5→shift 4, else→shift 0

#### 7. Calendar / holidays
- Weekend detection: `Weekday() = 7` (Saturday) or `= 1` (Sunday) → red styling
- Slovenian public holidays (12 static dates):
  ```
  Jan 1, Jan 2, Feb 8, Apr 27, May 1, May 2,
  Jun 25, Aug 15, Oct 31, Nov 1, Dec 25, Dec 26
  ```
- Easter Monday: computed via Gauss Easter algorithm (dynamic per year)
- Holidays and Sundays get hatched pattern fill; Saturdays get solid red

#### 8. Timeline rendering math (proven pixel geometry)
```
pixelsPerDay = (canvasWidth - leftMargin) / numberOfDays
barLeft = leftMargin + DateDiff("h", viewStart, batchStart) * (pixelsPerDay / 24)
barWidth = DateDiff("h", batchStart, batchEnd) * (pixelsPerDay / 24)
```
Partial-left-edge clipping:
- If `barLeft < -leftMargin` → clamp to leftMargin, set width = 5 (indicator only)
- If `barLeft < 0` → reduce width by the overshoot, clamp left to leftMargin

Now-line position:
```
nowX = (numberOfDays / offsetFactor) * pixelsPerDay + (pixelsPerDay / 24) * Hour(Now)
```

#### 9. Task arrows (wallboard)
- Tasks rendered as triangular arrows (right-pointing) at task datetime position
- Unconfirmed: green fill → clickable
- Confirmed: turns red or gets status indicator
- Task tooltip shows vessel + description + datetime

#### 10. Export
- Transpose `BigReadArray` into new Excel workbook
- Headers: ["pososda", "nacep", "precep", "serija"]
- Data starts at row A2

#### 11. PDF export (modern, Schedule view only)
- Client-side only: `html2canvas` captures the schedule `<canvas>` at 2× scale, `jsPDF` generates A4 landscape PDF
- Zero network calls, works offline, no cookies, no telemetry
- Configurable via Print Settings modal (persisted in `localStorage` key: `plantpulse.schedulePrintSettings.v1`)
- Header: optional facility title (Helvetica bold 11pt) + month/year (always) + separator line
- Footer (3-column, 7–8pt grey):
  - Left: app version, export timestamp with TZ abbreviation + UTC offset (e.g. `2026-02-19 14:32 CET (UTC+01:00)`), prepared-by placeholder, signature line
  - Center: disclaimer text (editable, default: `UNCONTROLLED COPY: Valid only at time of printing.`)
  - Right: page numbers (`Page x of y`, future-proof loop via `getNumberOfPages()`)
- All footer elements are individually toggleable (showVersion, showTimestamp, showPreparedBy, showSignature, showPageNumbers)
- Enterprise-locked fields (visible but disabled): company logo, custom color theme, custom footer presets, watermark overlay, multi-page export, auto user ID from SSO, electronic signatures, document control number
- Filename: `PlantPulse_{Month}_{Year}.pdf`
- Implementation: `utils/exportSchedulePdf.ts` (logic) + `settings/PrintSettings.tsx` (UI)

#### 12. Schedule toolbar — responsive / mobile
- Desktop (>= 768px): horizontal toolbar layout (month nav, filter chips, export/print, stage count) — unchanged
- Mobile (< 768px): toolbar collapses into a "☰ Controls" hamburger button + month label + stage count
- Tapping opens a dropdown panel with three sections: month navigation, equipment filter grid (2-col), export/print actions (full-width buttons)
- Panel closes on: outside click (backdrop), action tap, or Escape key (returns focus to toggle)
- All touch targets >= 44px; ARIA: `aria-expanded`, `aria-controls`, `role="region"`
- Implementation: inline in `app/inoculum/page.tsx`; CSS in `globals.css` (`.schedule-mobile-*` classes)
- Uses Tailwind responsive utilities: desktop = `hidden md:flex`, mobile = `flex md:hidden`

---

## Target Data Model (Modern)

Based on the masterplan vision + VBA reality:

### Core entities

```typescript
// Product lines are user-configurable. GNT/KK are the legacy defaults used
// in demo data. Users can add/rename/remove product lines and their associated
// machines, stage types, and default durations.
interface ProductLine {
  id: string;             // user-defined, e.g. "GNT", "KK", "API-X"
  name: string;           // display name, e.g. "Gentamicin", "KK Line"
  stageDefaults: StageDefault[];  // ordered seed train template
  displayOrder: number;
}

interface StageDefault {
  stageType: string;      // e.g. "propagation", "pre_fermentation", "fermentation"
  defaultDurationHours: number;
  machineGroup: string;   // which machine group to pick from
}

interface Machine {
  id: string;             // e.g. "F-2", "PR-1"
  name: string;           // display name
  group: MachineGroup;    // "propagator" | "pre_fermenter" | "fermenter" | "inoculum"
  productLine?: string;   // assigned product line, or null if shared
  displayOrder: number;
  holds?: HoldConfig;     // min/max duration constraints
}

interface BatchChain {
  id: string;             // unique chain identifier
  batchName: string;      // human-readable (e.g. "GNT-142")
  seriesNumber: number;   // legacy series_id
  productLine: string;    // references ProductLine.id
  color: string;          // deterministic from seriesNumber
  status: "draft" | "proposed" | "committed";
  nameLocked: boolean;
  // Enterprise ERP fields omitted for Free edition
}

interface Stage {
  id: string;
  machineId: string;
  batchChainId: string;
  stageType: "propagation" | "pre_fermentation" | "fermentation";
  startDatetime: Date;    // "nacep" equivalent
  endDatetime: Date;      // "precep" equivalent
  state: "planned" | "active" | "completed";
  minDuration?: number;   // hours
  maxDuration?: number;   // hours
}

interface CheckpointTask {
  id: string;
  machineId: string;
  plannedDatetime: Date;
  taskCode: string;
  description: string;
  status: "planned" | "done" | "not_possible";
  confirmedBy?: string;
  confirmedAt?: Date;
  comment?: string;
  batchChainId?: string;  // derived by overlap
}

interface MaintenanceTask {
  id: string;
  machineId: string;
  plannedStart: Date;
  plannedEnd: Date;
  taskCode: string;
  taskType: string;
  status: "planned" | "acknowledged" | "not_possible";
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  comment?: string;
}

interface ShiftRotation {
  teams: string[];        // 4 team names
  shiftLengthHours: 12;
  cyclePattern: number[]; // [0, 2, 1, 3, 2, 0, 3, 1]
  anchorDate: Date;       // shutdown-to-shutdown anchor
  overrides: ShiftOverride[];
}
```

### Mapping VBA → Modern

| VBA concept | Modern equivalent |
|-------------|-------------------|
| `BigReadArray` | In-memory store (Stage[] array for Free edition) |
| `imena` array | Machine[] with displayOrder |
| `serija` number | BatchChain.seriesNumber |
| `DodaneNoveSerije` staging | Draft batch chain creation |
| `Premik` bulk shift | Bulk shift tool with cutoff filter |
| `ObdelavaSerija` form | Side panel / modal stage editor |
| `NovaSer` form | "Add new batch chain" wizard |
| `DynBtn` click handlers | Stage bar click → detail panel |
| ADODB Excel connection | Excel import/parse (Free) or DB query (Enterprise) |
| PowerPoint shape rendering | Canvas/SVG timeline rendering |
| UserForm maximize/restore | Responsive layout |

---

## Recommended Technology Stack

### Free Edition MVP (browser-only, no server required)

**Privacy architecture:** The Free Edition is a pure static site (`output: 'export'`).
It makes four verifiable guarantees: browser-only (no server process), zero server
roundtrips (no fetch/API/DB), no cookies, and no telemetry. All data lives in-memory
via Zustand and resets on reload. Excel import/export is the only data pathway.
Any new feature must preserve these guarantees — do not add analytics, tracking,
external network calls, cookies, or server-side API routes to the Free Edition.

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | **Next.js 15 + TypeScript** | App Router, static export for Free edition |
| Timeline rendering | **HTML Canvas** (with SVG overlay for interactive elements) | Performance for 30+ rows × 25+ days of bars; VBA pixel math maps directly |
| State management | **Zustand** | Lightweight, replaces BigReadArray as the in-memory store |
| Excel I/O | **SheetJS (xlsx)** | Read/write .xlsx for import/export, matches ADODB pattern |
| PDF export | **html2canvas + jsPDF** | Client-side A4 landscape PDF generation from canvas capture (Schedule view) |
| Date handling | **date-fns** | Lightweight, tree-shakeable, handles DateDiff/DateAdd equivalents |
| Styling | **Tailwind CSS** | Utility-first, matches design-guidelines typography/color system |
| Testing | **Vitest + Testing Library** | Fast, TypeScript-native |

### Enterprise (later phases)

| Layer | Technology |
|-------|-----------|
| Database | PostgreSQL |
| Auth | NextAuth.js → SSO (SAML/OIDC) |
| API | Next.js API routes or tRPC |
| Audit | Append-only audit table with immutability constraints |
| Deployment | Docker, single-tenant per customer |

---

## Project Structure (target)

```
plantpulse.pro/
├── CLAUDE.md                    # This file
├── README.md                    # Project introduction
├── .gitignore
├── docs/
│   ├── masterplan.md            # Vision document
│   ├── app-flow-pages-and-roles.md  # UX specification
│   ├── design-guidelines.md     # Visual design system
│   ├── implementation-plan.md   # Phased build plan
│   └── legacy/                  # Original VBA macro extracts (reference only)
│       ├── FormaZaPlan_macros.txt
│       ├── InfoTabla20180201_macros.txt
│       └── Izberidatum5_macros.txt
├── src/
│   ├── app/                     # Next.js App Router pages
│   │   ├── page.tsx             # Landing / session start
│   │   ├── wallboard/           # Manufacturing Wallboard (Operator lens)
│   │   ├── planner/             # Planner View (modern UrediPlan)
│   │   ├── inoculum/            # Schedule View (+ PDF export)
│   │   └── admin/               # Admin Settings (Enterprise)
│   ├── components/
│   │   ├── timeline/            # Core timeline engine (Phase 2)
│   │   │   ├── TimelineCanvas.tsx
│   │   │   ├── TimelineHeader.tsx
│   │   │   ├── MachineColumn.tsx
│   │   │   ├── StageBar.tsx
│   │   │   ├── NowLine.tsx
│   │   │   ├── ShiftBand.tsx
│   │   │   └── CalendarGrid.tsx
│   │   ├── planner/             # Planner-specific components
│   │   │   ├── ChainEditor.tsx
│   │   │   ├── BulkShiftTool.tsx
│   │   │   ├── NewChainWizard.tsx
│   │   │   └── StageDetailPanel.tsx
│   │   ├── wallboard/           # Wallboard-specific components
│   │   │   ├── TaskArrow.tsx
│   │   │   └── MaintenanceMarker.tsx
│   │   └── ui/                  # Shared UI primitives
│   ├── utils/
│   │   └── exportSchedulePdf.ts # PDF export logic, settings I/O, timestamp helper
│   ├── settings/
│   │   └── PrintSettings.tsx    # Print Settings modal (localStorage-persisted)
│   ├── lib/
│   │   ├── store.ts             # Zustand store (BigReadArray replacement)
│   │   ├── excel-io.ts          # SheetJS import/export
│   │   ├── timeline-math.ts     # Pixel geometry (ported from VBA)
│   │   ├── scheduling.ts        # Overlap detection, auto-scheduling, bulk shift
│   │   ├── seed-train.ts        # Chain creation with back-calculation
│   │   ├── shift-rotation.ts    # 4-team, 12h, 8-step cycle
│   │   ├── holidays.ts          # Slovenian holidays + Easter algorithm
│   │   ├── colors.ts            # Deterministic batch color cycling
│   │   └── types.ts             # TypeScript interfaces
│   └── __tests__/               # Test files mirroring src structure
├── public/
│   └── templates/               # Excel template files for download
│       ├── schedule-template.xlsx
│       └── maintenance-template.xlsx
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

---

## Development Workflow

### Getting started

```bash
npm install
npm run dev          # Start development server
npm run build        # Production build
npm run test         # Run tests
npm run lint         # Run linter
```

### Build order (Phase 1–4 for Free MVP)

1. **`lib/types.ts`** — Define all TypeScript interfaces
2. **`lib/excel-io.ts`** — Import from legacy `.xlsx` format + export
3. **`lib/store.ts`** — Zustand store with BigReadArray-equivalent operations
4. **`lib/timeline-math.ts`** — Port the VBA pixel geometry functions
5. **`lib/holidays.ts`** — Slovenian holidays + Gauss Easter
6. **`lib/colors.ts`** — `seriesNumber mod 12` color palette
7. **`lib/shift-rotation.ts`** — 4-team cycle
8. **`components/timeline/`** — Core timeline renderer
9. **`app/wallboard/`** — Operator wallboard view (read-only + task confirm)
10. **`lib/scheduling.ts`** + **`lib/seed-train.ts`** — Business rules engine
11. **`components/planner/`** — Interactive planning tools
12. **`app/planner/`** — Planner view with draft editing

### Excel template schema (Phase 1)

**Schedule template (`schedule-template.xlsx`, Sheet1):**

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | `pososda` | string | Machine/vessel name (must match machines list) |
| B | `nacep` | datetime | Inoculation/start datetime |
| C | `precep` | datetime | Transfer/end datetime |
| D | `serija` | integer | Series/batch number |

**Task template (same file or separate, Sheet2 or Opravila sheet):**

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | `pososda` | string | Machine/vessel name |
| B | `nacep` | datetime | Task planned datetime |
| C | `opis` | string | Task description |
| D | `status` | string | "planned" / "done" / "not_possible" |

**Maintenance template (`maintenance-template.xlsx`):**

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | `pososda` | string | Machine/vessel name |
| B | `zacetek` | datetime | Planned window start |
| C | `konec` | datetime | Planned window end |
| D | `tip` | string | Maintenance type code |
| E | `status` | string | "planned" / "acknowledged" / "not_possible" |

### Import validation rules

- All headers must match expected names
- All datetimes must parse correctly
- All machine names must exist in the machines list
- `nacep` must be <= `precep` (start <= end)
- `serija` must be a positive integer
- Duplicate entries (same machine + same start + same series) are flagged

---

## Color Palette

### Batch bar colors (12-color cycle, from VBA `barva` variable)

| Index | Name | RGB | Hex |
|-------|------|-----|-----|
| 0 | Light blue | (92, 173, 255) | `#5CADFF` |
| 1 | Orange | (255, 153, 0) | `#FF9900` |
| 2 | Indigo | (0, 102, 255) | `#0066FF` |
| 3 | Teal | (5, 255, 255) | `#05FFFF` |
| 4 | Sky | (102, 204, 255) | `#66CCFF` |
| 5 | Cyan | (87, 235, 255) | `#57EBFF` |
| 6 | Red | (255, 0, 0) | `#FF0000` |
| 7 | Novartis red | (228, 76, 22) | `#E44C16` |
| 8 | Carmine | (253, 15, 15) | `#FD0F0F` |
| 9 | Novartis maroon | (169, 7, 1) | `#A90701` |
| 10 | Dark olive | (40, 70, 10) | `#28460A` |
| 11 | Black | (0, 0, 0) | `#000000` |

### Wallboard border colors (5-color cycle)

| Index | RGB | Hex |
|-------|-----|-----|
| 0 | (56, 93, 138) | `#385D8A` |
| 1 | (195, 3, 8) | `#C30308` |
| 2 | (222, 202, 54) | `#DECA36` |
| 3 | (2, 2, 5) | `#020205` |
| 4 | (119, 158, 56) | `#779E38` |

### Shift team colors

| Team | RGB | Hex |
|------|-----|-----|
| 0 | (0, 102, 255) | `#0066FF` |
| 1 | (0, 204, 0) | `#00CC00` |
| 2 | (255, 0, 0) | `#FF0000` |
| 3 | (255, 253, 0) | `#FFFD00` |

### Semantic colors (from design-guidelines.md)

| Purpose | Use |
|---------|-----|
| Task planned | Red indicator |
| Task done | Green + checkmark |
| Warning | Amber + icon + label |
| Critical | "CRITICAL" chip + required comment |
| Weekend | Yellow with transparency (wallboard) / highlighted (planner) |
| Holiday | Red with hatched pattern |
| Today column | Light grey shading |
| Now-line | Dark red, semi-transparent vertical line |

---

## Key Algorithms to Port

### 1. Gauss Easter Algorithm (holidays.ts)

```typescript
function easterMonday(year: number): Date {
  const g = year % 19;
  const c = Math.floor(year / 100);
  const h = (c - Math.floor(c / 4) - Math.floor((8 * c + 13) / 25) + 19 * g + 15) % 30;
  const i = h - Math.floor(h / 28) * (1 - Math.floor(29 / (h + 1)) * Math.floor((21 - g) / 11));
  const j = (year + Math.floor(year / 4) + i + 2 - c + Math.floor(c / 4)) % 7;
  const l = i - j;
  const month = 3 + Math.floor((l + 40) / 44);  // 1-indexed
  const day = l + 28 - 31 * Math.floor(month / 4);
  // Easter Sunday + 1 = Easter Monday
  return new Date(year, month - 1, day + 1);
}
```

### 2. Timeline pixel math (timeline-math.ts)

```typescript
function stageBarPosition(
  viewStart: Date,
  stageStart: Date,
  stageEnd: Date,
  canvasWidth: number,
  leftMargin: number,
  numberOfDays: number
): { left: number; width: number } {
  const pixelsPerDay = (canvasWidth - leftMargin) / numberOfDays;
  const hoursFromViewStart = differenceInHours(stageStart, viewStart);
  let left = leftMargin + hoursFromViewStart * (pixelsPerDay / 24);
  let width = differenceInHours(stageEnd, stageStart) * (pixelsPerDay / 24);

  // Partial-left-edge clipping
  if (left < -leftMargin) {
    left = leftMargin;
    width = 5; // indicator dot only
  } else if (left < leftMargin) {
    width = width + (left - leftMargin);
    left = leftMargin;
    if (width < 0) width = 5;
  }

  return { left, width };
}
```

### 3. Shift rotation (shift-rotation.ts)

```typescript
const CYCLE = [0, 2, 1, 3, 2, 0, 3, 1]; // 8-step, 12h each = 4 days

function currentShiftTeam(now: Date, anchorDate: Date): number {
  const hoursSinceAnchor = differenceInHours(now, anchorDate);
  const shiftIndex = Math.floor(hoursSinceAnchor / 12);
  return CYCLE[((shiftIndex % CYCLE.length) + CYCLE.length) % CYCLE.length];
}
```

### 4. Seed train back-calculation (seed-train.ts)

Uses the product line's `stageDefaults` array to back-calculate from the
final stage. Works with any number of stages and any user-defined durations.

```typescript
// Generic: works with any product line configuration
function backCalculateChain(
  finalStageStart: Date,
  stageDefaults: StageDefault[]  // from ProductLine.stageDefaults
): { stageType: string; start: Date }[] {
  const stages: { stageType: string; start: Date }[] = [];
  let cursor = finalStageStart;

  // Walk backwards through stage defaults (last = final stage)
  for (let i = stageDefaults.length - 1; i >= 0; i--) {
    stages.unshift({ stageType: stageDefaults[i].stageType, start: cursor });
    if (i > 0) {
      cursor = subHours(cursor, stageDefaults[i].defaultDurationHours);
    }
  }
  return stages;
}

// Legacy VBA defaults for reference:
// GNT: propagation 48h, pre_fermentation 55h, fermentation (variable)
// KK:  propagation 44h, pre_fermentation 20h, fermentation (variable)

```

---

## Coding Conventions

- **Language:** TypeScript with strict mode
- **Formatting:** Prettier (defaults)
- **Naming:** camelCase for variables/functions, PascalCase for components/types
- **Dates:** Always use `Date` objects internally; format only at display boundaries
- **State mutations:** Via Zustand actions only; never mutate store directly
- **Canvas rendering:** Separate draw functions per visual layer (background, grid, bars, tasks, now-line, shift band) — draw in back-to-front order
- **VBA comments preserved:** When porting VBA logic, add a comment referencing the original VBA Sub/Function name (e.g. `// Ported from: RisemPlan_z_Gumbi()`)
- **No Slovenian in new code:** Use English for all identifiers, but preserve Slovenian terms in comments when referencing VBA originals (nacep = inoculation, precep = transfer, pososda = vessel)

---

## Glossary (Slovenian VBA → English)

| Slovenian | English | Context |
|-----------|---------|---------|
| nacep / nacepitev | inoculation | Start datetime of a stage |
| precep / precepitev | transfer | End datetime of a stage |
| pososda / posoda | vessel | Machine/fermenter name |
| serija | series / batch | Batch chain identifier |
| fermentor | fermenter | Production vessel |
| izmena | shift | Work shift (12h) |
| opravilo / opravila | task(s) | Checkpoint tasks |
| prekrivanje | overlap | Schedule conflict |
| premik | shift/move | Bulk time-shift operation |
| risem | draw/render | Timeline rendering |
| gumb / gumbi | button(s) | Interactive bar elements |
| koledar | calendar | Background date grid |
| praznik / prazniki | holiday(s) | Public holidays |
| velikonoč | Easter | Easter date |
| danes | today | Current date highlight |
| dolžina | length/duration | Time duration |
| širina | width | Pixel width |
| začetek | start/beginning | Start position |
| brisi | delete/clear | Clear/remove elements |
| buča | baffled Erlenmeyer flask | Inoculum-scale cultivation vessel; prefix B- in nomenclature (BKK for KK line, BGNT for GNT line) |
| shrani | save | Save changes |
| zapri | close | Close form |
| preveri | check/validate | Validation |
