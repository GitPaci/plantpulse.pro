# Fermentation Process Examples

Reference catalog of real industrial fermentation setups for future PlantPulse
configuration templates. Each example shows N-level seed trains, equipment sizes,
durations, and process-specific notes.

---

## 1. CHO Cell Culture (Monoclonal Antibodies)

**Example products:** rituximab biosimilars, trastuzumab, adalimumab.
Typical process used by Sandoz and other biosimilar manufacturers.

| Stage | Equipment Size | Duration |
|-------|---------------|----------|
| N-5 | Cryovial → shake flask (0.05–0.2 L) | 2–3 days |
| N-4 | Shake flask (0.5–2 L) | 2–3 days |
| N-3 | Seed bioreactor (5–20 L) | 2–3 days |
| N-2 | Seed bioreactor (50–200 L) | 2–3 days |
| N-1 | Seed bioreactor (500–2 000 L) | 3–4 days |
| N | Production bioreactor (2 000–20 000 L) | 12–16 days |

**Process notes:**
- Fed-batch with 1–2 feed additions/day
- Harvest at viability ~80%

---

## 2. E. coli Recombinant Protein Fermentation

**Example products:** insulin, filgrastim.

| Stage | Equipment Size | Duration |
|-------|---------------|----------|
| N-4 | Glycerol stock → shake flask (0.1–0.5 L) | 8–10 h |
| N-3 | Shake flask (1–2 L) | 8–12 h |
| N-2 | Seed fermenter (10–50 L) | 10–12 h |
| N-1 | Seed fermenter (100–500 L) | 10–14 h |
| N | Production fermenter (5 000–50 000 L) | 16–24 h |

**Process notes:**
- High cell density fed-batch
- Induction (IPTG/lactose) mid-run

---

## 3. Penicillium chrysogenum (Penicillin)

| Stage | Equipment Size | Duration |
|-------|---------------|----------|
| N-4 | Spores → flask | 24 h |
| N-3 | Seed fermenter (10–20 L) | 24 h |
| N-2 | Seed fermenter (200–500 L) | 24–36 h |
| N-1 | Seed fermenter (5 000 L) | 24–36 h |
| N | Production fermenter (50 000–200 000 L) | 120–160 h |

**Process notes:**
- Fed-batch lactose feeding
- Precursor addition (phenylacetic acid)

---

## 4. Streptomyces clavuligerus (Clavulanic Acid)

| Stage | Equipment Size | Duration |
|-------|---------------|----------|
| N-4 | Spores → flask | 24 h |
| N-3 | Seed fermenter (10–50 L) | 24–36 h |
| N-2 | Seed fermenter (500 L) | 24–36 h |
| N-1 | Seed fermenter (5 000 L) | 36–48 h |
| N | Production fermenter (60 000–150 000 L) | 5–7 days |

**Process notes:**
- Filamentous morphology
- Secondary metabolite production

---

## 5. Vitamin B12 Fermentation (Propionibacterium)

| Stage | Equipment Size | Duration |
|-------|---------------|----------|
| N-3 | Shake flask | 24–36 h |
| N-2 | Seed fermenter (20–100 L) | 24–36 h |
| N-1 | Seed fermenter (1 000–5 000 L) | 48 h |
| N | Production fermenter (50 000–150 000 L) | 6–8 days |

**Process notes:**
- Often two-stage fermentation with oxygen shift

---

## 6. Yeast Fermentation (Pichia pastoris)

| Stage | Equipment Size | Duration |
|-------|---------------|----------|
| N-4 | Shake flask | 18–24 h |
| N-3 | Seed fermenter (10–20 L) | 24 h |
| N-2 | Seed fermenter (200–500 L) | 24–36 h |
| N-1 | Seed fermenter (2 000 L) | 36 h |
| N | Production fermenter (10 000–100 000 L) | 3–5 days |

**Process notes:**
- Methanol induction for expression

---

## Industrial Equipment Scale Comparison

| Process | Production Reactor Size |
|---------|------------------------|
| Mammalian cell culture | 2 000–20 000 L |
| Recombinant bacteria | 5 000–50 000 L |
| Yeast fermentation | 10 000–100 000 L |
| Filamentous fungi | 50 000–200 000 L |
| Antibiotic actinomycetes | 60 000–150 000 L |

## Typical Number of Seed-Train Stages

| Organism Type | Typical Stages |
|---------------|---------------|
| Mammalian cells | 5–6 |
| Bacteria | 4–5 |
| Yeast | 4–5 |
| Filamentous fungi | 4–5 |
| Actinomycetes | 4–5 |

---

## Engineering Design Principles

The seed train is designed to maintain:

- **~5–10× volume scale-up per stage** — keeps shear and mixing conditions manageable
- **Similar oxygen transfer rates** — avoids metabolic stress during scale transitions
- **Consistent inoculum density (~5–10%)** — ensures cells remain in exponential growth
  while preparing enough biomass to inoculate the production fermenter

---

## PlantPulse Implementation Notes

These examples inform future PlantPulse features:

- **Variable seed-train depth**: processes range from 4 to 6 N-levels; the stage type
  system (`StageTypeDefinition.count`) already supports arbitrary depth
- **Duration ranges**: stage defaults should support min/max alongside the target
  (already modeled in `StageDefault.minDurationHours` / `maxDurationHours`)
- **Equipment group templates**: each organism type implies a different set of equipment
  groups (shake flasks, seed bioreactors, production fermenters) — future "process
  template" feature could pre-populate these from this catalog
- **Scale metadata**: equipment volume is not yet modeled; a future `Machine.volumeL`
  field would enable scale-up ratio validation
