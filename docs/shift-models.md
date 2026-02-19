# Shift Models Reference

This document defines the shift patterns referenced in PlantPulse Scheduler. It serves as a reference for schedulers, operations managers, and administrators configuring shift rotation logic within the application.

> **Disclaimer:** Shift planning must comply with applicable local labor law, collective agreements, HR policy, fatigue-risk management standards, and internal operating procedures. The models described here are structural references — they do not constitute legal or occupational health advice. Always validate shift configurations with your facility's HR, EHS, and legal teams before deployment.

---

## About Shift Pattern Naming

Shift pattern names vary by region, industry, and employer. Two facilities may use the same rotation structure under different names, or use the same name for slightly different configurations. The models below represent commonly recognized patterns. Where a pattern is specific to PlantPulse, it is marked as such.

---

## Glossary

| Term | Definition |
|------|------------|
| **Crew / Team** | A group of workers assigned to the same shift slot. In continuous operations, multiple crews rotate to cover 24/7 production. |
| **Rotation** | The sequence in which a crew moves through different shift times (e.g., days → evenings → nights). A roster that does not change shift times is called **fixed** (non-rotating). |
| **Forward rotation** | Shifts progress in the order days → evenings → nights. Generally considered easier on circadian rhythm. |
| **Backward rotation** | Shifts progress in the order nights → evenings → days. Less common; associated with higher fatigue in some studies. |
| **Cycle length** | The number of days (or shifts) before the entire pattern repeats for a given crew. |
| **Shift length** | Duration of a single shift (typically 8h or 12h). |
| **Handover / Overlap** | The period where the outgoing and incoming crews are both present, enabling status transfer and task continuity. Duration varies by facility (commonly 15–30 minutes). |

---

## A. 8-Hour Rotating Systems

### Classic 3-Shift Rotation (Days / Evenings / Nights)

**What it is:** The most common rotating schedule worldwide. Three crews each work one 8-hour shift per day, cycling through day, evening, and night shifts on a fixed rotation interval.

**Typical structure:**
- Day shift: 06:00–14:00
- Evening shift: 14:00–22:00
- Night shift: 22:00–06:00
- Crews rotate weekly or every 2–3 days (depending on facility policy)

**Cycle length:** Varies — commonly 3 weeks (one week per shift) or shorter rapid-rotation variants (every 2–3 days).

**Typical teams/crews:** 3 (plus a relief/spare crew in some facilities).

**Pros/cons:**
- (+) Well-understood; widely used across manufacturing and healthcare
- (+) 8-hour shifts limit individual fatigue exposure per shift
- (−) Weekly night rotation means 5–7 consecutive nights, which is hard on circadian health
- (−) Requires at least 3 crews to cover 24/7; a 4th relief crew is often needed for leave coverage

**Common use cases:**
- General manufacturing, food and beverage, pharmaceutical batch production
- Facilities where regulatory or union agreements mandate 8-hour maximums

---

### Continental Shift (Rapid Rotation Variant)

**What it is:** A rapid-rotation 8-hour schedule where crews change shift times every 2–3 days instead of weekly. Sometimes called the "Metropolitan" or "Quick Changeover" pattern.

**Typical structure:**
- 2 day shifts → 2 evening shifts → 2 night shifts → 2 days off
- Some variants use 3-2-2 or 2-2-3 day groupings within the 8-hour framework

**Cycle length:** Typically 8 days per crew cycle (though variants exist at 6 or 7 days).

**Typical teams/crews:** 4 (to provide continuous coverage and rest days).

**Pros/cons:**
- (+) Rapid rotation reduces the number of consecutive nights (usually 2–3 max)
- (+) Better circadian adaptation than weekly night rotation
- (−) More complex scheduling; harder for employees to plan personal time
- (−) Frequent shift changes increase handover frequency

**Common use cases:**
- European manufacturing and process industries
- Facilities prioritizing occupational health and fatigue management

---

## B. 12-Hour Continuous Systems (4-Team Common)

### Panama Schedule (2-2-3)

**What it is:** A 14-day cycle where crews alternate between 2 and 3 consecutive workdays, producing a built-in long weekend every other week. Also called "2-2-3" or "Pitman" in some regions (though Pitman has specific variants — see below).

**Typical structure:**
- Week 1: Work 2, Off 2, Work 3
- Week 2: Off 2, Work 2, Off 3
- 12-hour shifts (day or night); crews swap day/night at the cycle midpoint

**Cycle length:** 14 days (28 days for a full day/night rotation).

**Typical teams/crews:** 4.

**Pros/cons:**
- (+) Every other weekend is a 3-day weekend
- (+) Only 2–3 consecutive workdays at a time
- (−) 12-hour shifts are fatiguing, especially nights
- (−) Unequal weekend distribution (alternating 3-day and split weekends)

**Common use cases:**
- Petrochemical, refining, and continuous process plants
- 24/7 manufacturing facilities with 12-hour shift norms

---

### Pitman Schedule (2-2-3 Variant / Weekend Balancing)

**What it is:** A variant of the 2-2-3 structure with specific attention to balancing weekend coverage across all crews. Sometimes used interchangeably with "Panama," but Pitman typically refers to configurations that ensure every crew gets an equal share of weekends off over the full cycle.

**Typical structure:**
- 14-day base cycle similar to Panama
- Crew rotation is arranged so that weekend assignments are distributed evenly across all 4 teams over a full 28-day super-cycle

**Cycle length:** 14 days per half-cycle; 28 days for full equalization.

**Typical teams/crews:** 4.

**Pros/cons:**
- (+) Fairer weekend distribution than basic Panama
- (+) Predictable long-term pattern
- (−) More complex to set up and explain to crews
- (−) Same 12-hour fatigue considerations as Panama

**Common use cases:**
- Facilities where union contracts or labor agreements require equitable weekend allocation
- Plants using Panama-like structures that need a fairness adjustment

---

### DuPont Schedule (4-Week Cycle with Long Break)

**What it is:** A 4-week (28-day) cycle featuring a 7-day consecutive break once per cycle. Widely used in heavy industry. Named after the DuPont chemical company where it was popularized.

**Typical structure:**
- 4 night shifts → 3 off → 3 day shifts → 1 off → 3 night shifts → 3 off → 4 day shifts → 7 off
- All shifts are 12 hours

**Cycle length:** 28 days.

**Typical teams/crews:** 4.

**Pros/cons:**
- (+) 7 consecutive days off per cycle — significant rest and recovery opportunity
- (+) Well-tested in heavy industry over decades
- (−) Includes stretches of 3–4 consecutive night shifts
- (−) The alternating day/night blocks within a single cycle can be disorienting

**Common use cases:**
- Chemical plants, refineries, steel mills
- Operations where a guaranteed week-long break per month is valued for retention

---

## C. Compressed Workweek Models

### 4-on / 3-off (Often 10h or 12h Shifts)

**What it is:** Workers complete their weekly hours in 4 longer shifts and receive 3 consecutive days off. Not inherently a rotating pattern — can be fixed or rotating.

**Typical structure:**
- 4 shifts of 10 hours (= 40h/week) or 4 shifts of 12 hours (= 48h/week, with compensatory time)
- Fixed days (e.g., Mon–Thu) or rotating assignment

**Cycle length:** 7 days (simple); longer if rotating.

**Typical teams/crews:** 1–2 for non-continuous; 3–4 if used for 24/7 coverage.

**Pros/cons:**
- (+) 3 consecutive days off per week
- (+) Fewer commuting days
- (−) Longer daily shifts increase fatigue risk
- (−) Less flexible for part-time or variable staffing

**Common use cases:**
- Warehousing, logistics, and non-continuous manufacturing
- Administrative or technical roles that benefit from extended focus time

---

### 5/4/9 Compressed Schedule

**What it is:** A two-week cycle where employees work eight 9-hour days and one 8-hour day, receiving one extra day off every two weeks. Total hours: 80 per pay period (same as standard 5×8).

**Typical structure:**
- Week 1: five 9-hour days (Mon–Fri)
- Week 2: four 9-hour days (Mon–Thu) + Friday off
- Some variants alternate the day off (e.g., every other Monday)

**Cycle length:** 14 days.

**Typical teams/crews:** 1 (non-continuous); staggered across teams for continuous coverage.

**Pros/cons:**
- (+) One extra day off every two weeks with no reduction in total hours
- (+) Minimal disruption to standard weekday patterns
- (−) 9-hour days are modestly longer — not suitable for all roles
- (−) Coordination is needed to ensure coverage on the alternating day off

**Common use cases:**
- Government, aerospace, defense contractors (common in U.S. federal schedules)
- Engineering and office environments with flexible hour norms

---

## D. Fixed Shifts (Non-Rotating)

### Permanent Days

**What it is:** Workers are assigned exclusively to day shifts. No rotation through evening or night shifts.

**Typical structure:**
- Fixed start/end (e.g., 06:00–14:00 or 07:00–15:00)
- 5-day or compressed workweek

**Cycle length:** N/A (no rotation).

**Typical teams/crews:** 1 per shift slot (additional crews if 24/7 coverage is split into fixed day/night).

**Pros/cons:**
- (+) Best for circadian health and work-life balance
- (+) Simplest to administer
- (−) Does not provide night or weekend coverage on its own
- (−) May create perceived unfairness if night crews have harder conditions

**Common use cases:**
- Day-only operations (offices, labs, non-continuous production)
- Senior or specialist roles exempt from rotation

---

### Permanent Nights

**What it is:** Workers are assigned exclusively to night shifts. Some individuals prefer or adapt to permanent nights; evidence on long-term health effects is mixed but generally less favorable than day-only work.

**Typical structure:**
- Fixed start/end (e.g., 22:00–06:00 or 18:00–06:00)
- 5-day or compressed workweek

**Cycle length:** N/A (no rotation).

**Typical teams/crews:** 1 per shift slot.

**Pros/cons:**
- (+) Workers can establish a consistent sleep schedule (no rotating disruption)
- (+) Night shift premiums may attract voluntary assignment
- (−) Long-term health risks associated with chronic night work
- (−) Social isolation; limited overlap with daytime colleagues and services

**Common use cases:**
- Security, healthcare, and emergency services with dedicated night staffing
- Facilities where a subset of workers volunteers for permanent nights

---

### Weekend-Only Crew ("Weekend Warrior")

**What it is:** A dedicated crew works only weekends (typically two or three 12-hour shifts), covering Saturday and Sunday production. Weekday crews are off on weekends.

**Typical structure:**
- Saturday and Sunday: 12-hour shifts (day or night)
- Some configurations add Friday evening or Monday morning to reach target hours
- Weekend crew often receives full-time pay for reduced calendar days (premium model)

**Cycle length:** 7 days.

**Typical teams/crews:** 1 weekend crew per shift slot; separate weekday crews.

**Pros/cons:**
- (+) Weekday employees get guaranteed weekends off
- (+) Attracts workers who prefer a compressed schedule with weekdays free
- (−) Higher labor cost per hour (weekend premium rates)
- (−) Weekend crew may feel disconnected from the rest of the organization

**Common use cases:**
- High-demand continuous operations where weekend output is critical
- Facilities supplementing rotating crews to reduce mandatory weekend work

---

## E. Public Service / Emergency Patterns

### 24/48 (24 Hours On, 48 Off)

**What it is:** A crew works a 24-hour shift followed by 48 hours off. Common in fire services and EMS. Not typical for manufacturing but referenced here for completeness.

**Typical structure:**
- On duty: 24 continuous hours (with designated rest periods)
- Off duty: 48 hours
- 3 crews/platoons rotate through the cycle

**Cycle length:** 3 days (72 hours).

**Typical teams/crews:** 3.

**Pros/cons:**
- (+) Simple, predictable pattern
- (+) Extended off-duty blocks for recovery
- (−) 24-hour shifts carry significant fatigue and safety risk
- (−) Not appropriate for tasks requiring sustained concentration or physical labor

**Common use cases:**
- Fire departments and EMS agencies
- On-call or standby roles where active work is intermittent

---

### 12/24/12/48

**What it is:** A variant of the 24/48 that breaks the on-duty period into shorter segments: 12 hours on, 24 hours off, 12 hours on, 48 hours off. Reduces continuous on-duty time compared to 24/48.

**Typical structure:**
- Day 1: 12h on duty
- Day 2: 24h off
- Day 3: 12h on duty
- Days 4–5: 48h off
- Repeats

**Cycle length:** 4 days (96 hours per crew).

**Typical teams/crews:** 4.

**Pros/cons:**
- (+) No single shift exceeds 12 hours — reduced fatigue vs. 24/48
- (+) Retains extended recovery blocks (48h off)
- (−) More transitions increase handover complexity
- (−) Less common; may require custom scheduling tools

**Common use cases:**
- EMS, police, and correctional facilities seeking to reduce 24-hour shift exposure
- Hybrid public service environments balancing coverage with fatigue management

---

## F. Split / Overlap Patterns

### Split Shift

**What it is:** A workday divided into two or more segments separated by an extended unpaid break (typically 2–4 hours). Total work hours per day remain standard (e.g., 8h) but are spread across a longer clock window.

**Typical structure:**
- Morning block: 06:00–10:00
- Break: 10:00–14:00 (unpaid)
- Afternoon block: 14:00–18:00
- Variations exist depending on demand peaks

**Cycle length:** Daily (repeats each scheduled workday).

**Typical teams/crews:** 1 (no crew rotation implied; used alongside other patterns).

**Pros/cons:**
- (+) Aligns staffing to demand peaks (e.g., restaurant lunch and dinner rushes)
- (+) Can reduce idle labor costs during low-demand windows
- (−) Long overall time commitment for the worker (12+ hours door-to-door)
- (−) May reduce job attractiveness and increase turnover

**Common use cases:**
- Hospitality, food service, and transit (bus drivers, rail operators)
- Facilities with pronounced bimodal demand peaks

---

### Earlies and Lates (Two Overlapping Day Shifts)

**What it is:** Two day-shift variants with staggered start times that overlap during core hours. Provides extended coverage without a full night shift.

**Typical structure:**
- Early shift: 06:00–14:00
- Late shift: 10:00–18:00 (or 14:00–22:00 depending on facility)
- Overlap window: 10:00–14:00 (peak staffing, handover, meetings)

**Cycle length:** Daily; crews may rotate between early and late weekly or biweekly.

**Typical teams/crews:** 2.

**Pros/cons:**
- (+) Extended operational hours without night work
- (+) Overlap window allows joint work, training, or handover
- (−) Does not cover overnight hours
- (−) Late shift workers may face some of the same social impacts as evening shift workers

**Common use cases:**
- Labs, QC departments, and support functions in manufacturing
- Offices and technical centers requiring extended but not 24/7 coverage

---

## G. PlantPulse-Specific Model

### Russian Shift Pattern (PlantPulse 8-Shift Cyclic Model)

**What it is:** A deterministic 4-team, 12-hour, 8-step cyclic rotation used as the default shift model in PlantPulse Scheduler. The pattern is ported from the legacy VBA system and provides continuous 24/7 coverage with a compact 4-day cycle. "Russian" is a PlantPulse label for this specific configuration — it is not necessarily a standardized industry name.

**Team assignments:**
| Team index | Team color |
|------------|------------|
| 0 | Blue |
| 1 | Green |
| 2 | Red |
| 3 | Yellow |

**Deterministic 8-step sequence** (consecutive 12-hour blocks):

```
[0, 2, 1, 3, 2, 0, 3, 1]
```

**Human-readable rotation** (starting from a day-shift anchor at 06:00):

```
Block 1 (Day   06:00–18:00): Blue
Block 2 (Night 18:00–06:00): Red
Block 3 (Day   06:00–18:00): Green
Block 4 (Night 18:00–06:00): Yellow
Block 5 (Day   06:00–18:00): Red
Block 6 (Night 18:00–06:00): Blue
Block 7 (Day   06:00–18:00): Yellow
Block 8 (Night 18:00–06:00): Green
→ repeat
```

Or equivalently: Blue → Red → Green → Yellow → Red → Blue → Yellow → Green → repeat.

**Shift boundaries:**
- Day shift: 06:00–18:00
- Night shift: 18:00–06:00

**Typical structure:**
- 4 teams, each identified by a color (Blue, Green, Red, Yellow)
- 12-hour shifts: day (06:00–18:00) and night (18:00–06:00)
- 8-step repeating cycle anchored to a configurable reference date/time (default anchor: 06:00)
- Each team appears exactly twice per cycle (2 × 12h = 24 working hours per 4-day cycle)

**Cycle length:** 8 shifts = 4 days (96 hours).

**Typical teams/crews:** 4.

**Pros/cons:**
- (+) Compact cycle — easy to memorize and predict
- (+) Deterministic: given any date/time and an anchor, the on-duty team is computable with no lookup table
- (+) Equal distribution — each team works the same number of day and night shifts over the cycle
- (−) Non-standard pattern; new hires may need onboarding to understand the rotation
- (−) Teams do not always work consecutive shifts — schedule perception can feel irregular

**Common use cases:**
- PlantPulse Scheduler default shift overlay for pharmaceutical fermentation and continuous bioprocess operations
- Facilities porting schedules from the legacy VBA wallboard system

**Implementation reference:**
- Source: `src/lib/shift-rotation.ts`
- Algorithm: `currentShiftTeam(now, anchorDate)` computes `floor(hoursSinceAnchor / 12)` and indexes into the 8-step cycle array with modular arithmetic
- Anchor date is facility-configurable (default: `2026-01-01T06:00:00`)
- `shiftBands(viewStart, numberOfDays, anchorDate)` returns the team assignment for every 12-hour block in a date range

---

## How PlantPulse Uses Shift Patterns

PlantPulse implements shift rotation as a **deterministic roster function** anchored to a configurable reference date and time. The core logic works as follows:

1. **Anchor date:** Each facility sets a reference point (date + time) that aligns to the start of the first shift in the cycle. This anchor is stored in the application configuration and can be adjusted by administrators.

2. **Cycle definition:** A shift pattern is defined as an ordered array of team indices. Each position in the array corresponds to one shift block (e.g., 12 hours). The array length determines the cycle length.

3. **Team resolution:** For any given date/time, PlantPulse computes the number of shift blocks elapsed since the anchor, takes the modular index into the cycle array, and returns the team on duty. This is a pure function with no external dependencies — it works offline and requires no database lookup.

4. **Visual rendering:** The resolved team is rendered as a colored band behind the timeline (the "shift ownership band"), using the team's assigned color. This provides at-a-glance visibility into which crew is responsible at any point in time.

5. **Override support (Enterprise):** Enterprise editions support shift overrides — manual reassignments for holidays, training days, or emergency coverage — stored as exceptions against the base cycle.

The Russian shift pattern (8-step, 4-team, 12-hour cycle) is the built-in default. Future versions may allow administrators to define custom shift patterns by specifying their own cycle arrays, shift lengths, and team counts. The underlying engine is pattern-agnostic: any cyclic shift model that can be expressed as a repeating sequence of team assignments can be implemented using the same deterministic anchor-and-index approach.
