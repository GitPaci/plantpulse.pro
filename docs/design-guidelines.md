# Design Guidelines

## Emotional Thesis

Feels like a calm pharma control room: steady, readable, and accountable -- without drama.

---

## Visual Hierarchy Rules

- Operator wallboard is sacred:
  - Occupancy bars first
  - Tasks second
  - Shift band present but secondary
- Planning tools never appear in Operator lens.

---

## Typography

- Industrial sans-serif, high legibility
- Use tabular numerals if available
- Hierarchy:

| Level | Size / Weight |
|-------|---------------|
| H1 | 30px / 600 |
| H2 | 20px / 600 |
| H3 | 16px / 600 |
| Body | 14px / 400 |
| Caption | 12px / 400 |

- Line-height >= 1.5
- Never rely on tiny text for critical state

---

## Color System

- Neutral UI base
- Batch colors = tracking only
- Semantic state uses label + icon
- **Tasks:**
  - Planned = red
  - Done = green + checkmark
- **Warnings:**
  - Amber + icon + label
- **Critical:**
  - Explicit "CRITICAL" chip + required comment

---

## Shift Band Design

- Always visible at top
- 4 team colors
- Clearly segmented by 12h blocks
- Must be readable but not overpower bars
- Current shift label near now-line

---

## Wallboard Fullscreen Mode

The Manufacturing Wallboard supports browser-native fullscreen for dedicated display
screens (e.g. factory floor TVs, control room monitors).

**Enter fullscreen:**
- Toolbar button (expand icon, positioned immediately before the Shift indicator)
- Uses browser Fullscreen API (`Element.requestFullscreen()`)

**Fullscreen appearance:**
- Black background fills the entire screen
- Navigation bar and toolbar are hidden
- Canvas occupies the full viewport with TV-safe margins (EBU R95):
  - 2.5% top/bottom, 3.5% left/right padding
- Shift band, now-line, and batch bars remain fully visible

**Exit fullscreen:**
- Hover-reveal button: top-right corner, semi-transparent with backdrop blur, fades in on mouse movement (opacity 0 → 1 on hover), uses compress/shrink icon
- Browser Escape key or native fullscreen exit controls
- Fullscreen state syncs with `fullscreenchange` event

**Accessibility:**
- Enter button: `aria-label="Enter Fullscreen"`, `title="Enter Fullscreen"`
- Exit button: `aria-label="Exit Fullscreen"`, `title="Exit Fullscreen"`, reachable via keyboard (`:focus-within` makes overlay visible)

**Implementation:** `app/wallboard/page.tsx` (logic) + `globals.css` (`.wallboard-fullscreen-*` classes)

---

## Wallboard Night View Mode

The Manufacturing Wallboard supports a dark, high-contrast Night View optimized for
TV displays in dimly lit control rooms during night shifts.

**Toggle (non-fullscreen):**
- Button in toolbar, positioned immediately before the Fullscreen button (right side)
- OFF state: moon icon + "Night" label (indigo tint)
- ON state: sun icon + "Day" label (amber tint)

**Toggle (fullscreen):**
- Floating overlay button at **top-left** corner (mirrors the exit button at top-right)
- Hidden by default; appears on mouse movement or click, auto-hides after inactivity
- Same show/hide behavior as the fullscreen exit overlay (opacity 0 → 1 on hover/`:focus-within`)

**Automatic switching (local device time):**
- Night View activates automatically at **22:00** local time
- Day View restores automatically at **05:00** local time
- Uses a lightweight timer (checks once per minute via `setInterval`)
- No server calls — uses device clock only

**Manual override:**
- If the user manually toggles Night/Day, their choice is respected until the next
  scheduled boundary (22:00 or 05:00), then the automatic schedule resumes

**Persistence:**
- Current mode is stored in `localStorage` (key: `wallboard-night`)
- Survives page reload — wallboard opens in the last-used mode

**Scope:**
- Only affects the Wallboard page (canvas colors + toolbar + container background)
- Schedule view, Planner view, and PDF export are **never** affected
- `@media print` CSS rule ensures night styles do not leak into printed output

**Night theme colors (canvas):**

| Element | Day | Night |
|---------|-----|-------|
| Background | `#FFFFFF` | `#0c1021` (deep navy) |
| Row (even) | `#EBF4FB` | `#111827` |
| Row (odd) | `#FFFFFF` | `#0c1021` |
| Grid lines | `rgba(185,200,215,0.50)` | `rgba(60,75,95,0.50)` |
| Now-line | `rgba(160,0,0,0.65)` | `rgba(255,60,60,0.80)` (brighter) |
| Machine labels | `#1a365d` | `#c8d6e5` (light grey-blue) |
| Date text | `#334155` | `#94a3b8` |
| Series label | `#0088BB` | `#4cc9f0` (cyan) |
| Bar fill (past) | `#E2E2E2` | `#2a3040` |
| Bar fill (future) | `#EFEFEF` | `#1e2535` |
| Bar hour text | `#000000` | `#d1d5db` |

**Accessibility:**
- Night toggle: `aria-label` updates dynamically ("Switch to Day View" / "Switch to Night View")
- Fullscreen overlay: reachable via keyboard (`:focus-within` triggers visibility)
- High contrast ratios maintained in both themes (machine labels, date text, now-line)

**Implementation:** `lib/useNightMode.ts` (hook) + `WallboardCanvas.tsx` (theme-aware rendering) + `app/wallboard/page.tsx` (toggles) + `globals.css` (`.wallboard-night-*` classes)

---

## Shutdown Block Design

- Full-width across all machines
- Clear text: "PLANT SHUTDOWN (NO ELECTRICITY)"
- Operator: read-only
- Planner/Maintenance: editable in draft/layer
- Visually unmistakable boundary in timeline

---

## Interaction Design

- One-click confirmation for tasks and maintenance acknowledgements
- Long-press opens:
  - Comment
  - Not possible
- Undo is first-class (toast with undo)
- Planner interactions:
  - Drag/move/stretch with ghost preview
  - Snapping to grid (hour by default)
  - Clear conflict highlight when violating rules

---

## Copy Tone

Calm, neutral, precise.

**Examples:**

- "Draft proposed. Awaiting planner approval."
- "Critical change: comment required."
- "Shutdown boundary crossed. Override required."
- "Maintenance task marked not possible. Add reason."

---

## Accessibility

- WCAG AA minimum contrast
- Keyboard navigation in Planner and Admin
- Focus rings visible
- Never color-only meaning

---

## Compliance Surfaces (Enterprise)

From the GxP guidance: focus on audit trails, IAM, retention, and change control.

- Make draft vs committed obvious
- Make commit + critical flags obvious
- Make comment requirement unavoidable (not a weak modal)

---

## PDF Export Design (Schedule View)

The Schedule view includes a client-side PDF export that produces a professional
A4 landscape document suitable for printing and posting on a manufacturing wall.

**Layout rules:**
- A4 landscape (297 × 210 mm), 8 mm margins
- Header: optional facility title (Helvetica bold 11pt, dark grey, centered) + month/year (Helvetica normal 9pt, medium grey) + thin separator
- Schedule image: captured at 2× resolution, aspect-ratio preserved, centered in available content area
- Footer: visually secondary (7–8pt grey), 3-column layout with separator line above
  - Left: traceability (version, timestamp with timezone + UTC offset, prepared-by, signature line)
  - Center: disclaimer (bold, editable via Print Settings)
  - Right: page numbers (`Page x of y`)

**Print Settings modal:**
- Accessible via gear icon next to Export PDF button
- Free fields: facility title, disclaimer text, 5 boolean toggles for footer elements
- Enterprise fields: visible but disabled with "Enterprise" badge + tooltip
- Settings persist in `localStorage` (key: `plantpulse.schedulePrintSettings.v1`)

**Button states:**
- Default: "Export PDF" with down-arrow icon
- Exporting: "Generating..." (disabled, with spinner animation)

**Privacy:** Zero network calls during export. Works fully offline.

---

## Schedule Toolbar — Responsive / Mobile

On narrow viewports (< 768px), the Schedule toolbar collapses all controls behind
a single hamburger button to prevent horizontal overflow and ensure every control
is reachable on small screens.

**Breakpoint:** 768px (`md` in Tailwind). Desktop layout is unchanged above this width.

**Mobile toolbar bar:**
- Shows: "☰ Controls" toggle button, current month label, stage count badge
- Tapping "☰ Controls" opens/closes the dropdown panel below

**Mobile dropdown panel (three sections):**

| Section | Contents | Layout |
|---------|----------|--------|
| **Month** | Prev / Next buttons + centered month label | Single row, flex |
| **Equipment Filters** | Inoculum, Propagators (PR), Pre-fermenters (PF), Fermenters (F), All Equipment | 2-column grid, "All Equipment" spans full width |
| **Actions** | Export PDF, Print Settings | Full-width stacked buttons |

**Close behavior:**
- Tap outside the panel (backdrop click)
- Tap any action (month nav, filter, export, print settings)
- Press Escape key (returns focus to toggle button)

**Touch targets:** All interactive elements in the panel have a minimum height of 44px
(Apple HIG / WCAG 2.5.5 recommendation).

**Accessibility:**
- Toggle button: `aria-label="Toggle schedule controls"`, `aria-expanded`, `aria-controls`
- Panel: `role="region"`, `aria-label="Schedule controls"`
- Keyboard: Escape closes panel and returns focus to toggle

**Implementation:** Inline in `app/inoculum/page.tsx`. Desktop toolbar uses `hidden md:flex`;
mobile toolbar uses `flex md:hidden`. Panel is conditionally rendered when open.

---

## Design Snapshot

**Core rule:** Operator = calm instrument panel. Planner = controlled editor.

**Shift band:** Ownership layer. Not decoration.

**Shutdown:** Full-width boundary block.
