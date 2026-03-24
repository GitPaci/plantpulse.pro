# Plan: Smart Machine Resolution During Excel Import

## Context

When importing a schedule Excel file with unknown machine names (e.g. `B-RTX01` from the user's screenshot), the current import silently skips those rows with a warning. This creates a frustrating dead-end — users can't import data for machines that don't exist yet. The enhancement turns this blocking error into a guided resolution step where users can create, map, or skip unknown machines before completing the import.

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/excel-io.ts` | Collect unknown machines + pending rows; add `resolveUnknownStages()`, pattern detection, fuzzy matching helpers |
| `src/app/planner/page.tsx` | Enhanced import modal with machine resolution UI section; updated confirm handler |
| `src/app/globals.css` | `.pp-import-resolve-*` CSS classes for resolution UI |

## Implementation

### 1. `excel-io.ts` — Enhanced Parse + Resolution Helpers

**New types:**

```typescript
interface UnknownMachineInfo {
  name: string;               // original name from Excel (e.g. "B-RTX01")
  rowNumbers: number[];        // which rows reference this machine
  suggestedGroup?: string;     // auto-grouping hint from prefix matching
  similarExisting?: string;    // ID of most similar existing machine (fuzzy)
  namePrefix?: string;         // extracted prefix for bulk-grouping (e.g. "B-RTX")
}

interface PendingRow {
  rowNum: number;
  vesselName: string;          // original machine name
  seriesNum: number;
  startDate: Date;
  endDate: Date;
}

// Extend existing ScheduleImportResult:
interface ScheduleImportResult {
  chains: BatchChain[];
  stages: Stage[];
  warnings: string[];
  unknownMachines: UnknownMachineInfo[];   // NEW
  pendingRows: PendingRow[];               // NEW
}
```

**Modify `parseScheduleXlsx` loop** (lines 108-112): When `machineByName.get()` returns undefined, instead of just `continue`, also:
- Add name to `unknownMachinesMap: Map<string, UnknownMachineInfo>` (deduped)
- Continue parsing series/dates/duplicates normally → push to `pendingRows[]`
- Remove the "Unknown machine — skipped" warning (resolution UI handles it)

**After the loop**, run pattern detection on the collected unknowns:
- `extractMachinePrefix(name)`: Split into alpha prefix + numeric suffix. `"B-RTX01"` → `"B-RTX"`, `"F-2"` → `"F"`, `"PR-1"` → `"PR"`
- Match prefix against existing equipment group shortNames to suggest group
- `findSimilarMachine(name, machines)`: Normalize (strip hyphens/spaces, lowercase), check if any existing machine matches after normalization. E.g. `"F2"` → matches `"F-2"`. No external deps, ~15 lines.

**Add `resolveAndBuildStages()` function:**

```typescript
export function resolveAndBuildStages(
  pendingRows: PendingRow[],
  machineResolver: Map<string, Machine>,  // vesselName → resolved Machine (created or mapped)
  existingChainIds: Map<number, string>,  // seriesNum → chainId from first pass
): { newChains: BatchChain[]; newStages: Stage[] }
```
- For each pending row whose vesselName is in machineResolver: create a Stage with correct machineId and inferred stageType
- If the seriesNum already has a chain from the first pass, link to it; otherwise create a new BatchChain
- Skip rows whose vesselName is not in machineResolver (user chose "skip")

**Edge case**: A series may have some rows on known machines (already in `stages`) and some on unknown (in `pendingRows`). After resolution, pending stages merge into the existing chain. If all stages for a series were on unknown machines and all are skipped, the chain is excluded entirely.

### 2. `globals.css` — Resolution UI Styles

Follow existing `.pp-modal-*` and `.pp-setup-*` patterns:

```css
.pp-import-resolve          /* section container: left amber border, subtle bg */
.pp-import-resolve-header   /* "X unknown machines detected" banner */
.pp-import-resolve-card     /* per-machine card with radio options */
.pp-import-resolve-actions  /* radio button row (Create/Map/Skip) */
.pp-import-resolve-detail   /* conditional fields area (group dropdown, map dropdown) */
.pp-import-resolve-hint     /* fuzzy match suggestion text */
.pp-import-resolve-bulk     /* "Create all as group" button bar */
```

### 3. `planner/page.tsx` — Enhanced Import Modal

**State changes:**

Expand `importConfirm` type to include `unknownMachines` and `pendingRows`.

Add local resolution state:
```typescript
const [machineResolutions, setMachineResolutions] = useState<
  Map<string, { action: 'create' | 'map' | 'skip'; group?: string; mapTo?: string }>
>(new Map());
```

Initialize resolutions when `importConfirm` is set: default all unknown machines to `'create'` with the suggested equipment group pre-selected (encourages resolution over skipping).

**Modal UI layout:**

```
Found 3 batch chains with 12 stages.
+ 2 chains (5 stages) pending machine resolution.
This will replace the current schedule data.

┌─ ⚠ 2 unknown machines — resolve below to include ────┐
│                                                         │
│  B-RTX01 (3 rows)                                      │
│  ● Create  [Fermenter ▾]  ○ Map to [▾]  ○ Skip        │
│                                                         │
│  B-RTX02 (2 rows)                                      │
│  ● Create  [Fermenter ▾]  ○ Map to [▾]  ○ Skip        │
│                                                         │
│  💡 Create all 2 as "Fermenter" group                  │
└─────────────────────────────────────────────────────────┘

Warnings (1): Row 8: Start after end — skipped.

                                [Cancel]  [Import]
```

- Equipment group dropdown populated from store's `equipmentGroups`
- "Map to" shows dropdown of existing machine names; if fuzzy match found, pre-select it with a hint: `"Similar: F-2"`
- Bulk action shown when 2+ unknowns share a prefix → one-click sets all to "create" with same group
- Row count per unknown machine

**Updated `handleImportConfirm`:**

1. For each "create" resolution: `addMachine({ id: generateId('m-'), name, group, displayOrder: maxInGroup + 10 })`
2. Build `machineResolver` map from create/map resolutions
3. Call `resolveAndBuildStages(pendingRows, machineResolver, existingChainIds)`
4. Merge new stages/chains with originally-parsed ones
5. Call `setBatchChains()` and `setStages()` with merged data
6. Re-derive display groups: `setMachineGroups(buildDisplayGroups(productLines, updatedMachines))`

Note: `buildDisplayGroups()` currently lives in `EquipmentSetup.tsx`. Rather than extracting it to a shared module (unnecessary refactor), just duplicate the 15-line function inline in the import handler or import it from EquipmentSetup.

## Implementation Order

1. `src/lib/excel-io.ts` — types, modified parse, helpers, `resolveAndBuildStages()`
2. `src/app/globals.css` — `.pp-import-resolve-*` classes
3. `src/app/planner/page.tsx` — state, resolution UI, updated confirm handler

## Verification

1. `npm run build` — must pass
2. `npm run lint` — must pass
3. **Manual test:**
   - Export current schedule → edit Excel to rename a machine to `B-RTX01` → import
   - Verify resolution UI appears with correct row counts
   - Test "Create" → new machine appears in Equipment Setup + stages imported
   - Test "Map to existing" → stages assigned to mapped machine
   - Test "Skip" → those rows excluded, rest imports fine
   - Test with multiple unknowns sharing prefix → bulk create button works
   - Test with all machines known → no resolution UI (current behavior preserved)
   - Test with all machines unknown → resolution UI for all, import works after resolution
