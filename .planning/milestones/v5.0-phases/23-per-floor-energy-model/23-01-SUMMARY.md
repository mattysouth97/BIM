---
phase: 23-per-floor-energy-model
plan: "01"
subsystem: energy-engine
tags: [energy, calculation, typescript, tdd, pure-function]
dependency_graph:
  requires:
    - src/lib/energy/annual-demand.ts
    - src/lib/energy/heat-loss.ts
    - src/lib/procedural/types.ts
    - src/lib/material-types.ts
    - src/lib/energy/climate-data.ts
  provides:
    - calculateSystemBreakdown() pure function
    - EnergyDataSource discriminated union
    - SystemBreakdown interface
    - SYSTEM_RATIOS table (2-char prefix keyed)
  affects:
    - Plan 23-02 (useEnergyBreakdown hook consumes this)
    - Phase 24 (dashboard chart)
    - Phase 25 (per-floor heatmap)
tech_stack:
  added: []
  patterns:
    - TDD (RED → GREEN)
    - HVAC-anchored ratio scaling
    - 2-char mainPurpsCd prefix lookup
key_files:
  created:
    - src/lib/energy/system-breakdown.ts
    - src/lib/energy/__tests__/system-breakdown.test.ts
  modified: []
decisions:
  - "EnergyDataSource = actual | estimated-ratio | estimated-inferred (CONTEXT.md D4 overrides RESEARCH.md modeled variant)"
  - "HVAC anchored to calculateAnnualDemand().totalDemand — not back-calculated from ratio"
  - "SYSTEM_RATIOS keyed by 2-char prefix (02, 11, 13) not 5-digit exact code"
  - "Office ratios 55/25/10/10 from CONTEXT.md D6 — RESEARCH.md 40/35/7/18 superseded"
  - "perFloor uses f.type === above filter; array index = Phase 25 contract"
metrics:
  duration_seconds: 195
  completed_date: "2026-04-12"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 23 Plan 01: calculateSystemBreakdown Core Engine Summary

**One-liner:** Pure `calculateSystemBreakdown()` with HVAC-anchored ASHRAE ratio attribution, per-floor kWh/m² distribution, and `EnergyDataSource` discriminated union — no existing callers touched.

---

## What Was Built

### `src/lib/energy/system-breakdown.ts` (135 lines)

Three exports consumed by Plan 23-02 (hook) and downstream Phases 24/25:

**`EnergyDataSource` type:**
```typescript
export type EnergyDataSource =
  | "actual"              // measured from data.go.kr API (future Phase 26)
  | "estimated-ratio"     // ASHRAE/KEMCO ratio applied to modeled total
  | "estimated-inferred"; // inferred from building metadata (Phase 26)
```

**`SystemBreakdown` interface:**
```typescript
export interface SystemBreakdown {
  hvac: number;          // kWh/yr — from calculateAnnualDemand().totalDemand
  lighting: number;      // kWh/yr — ratio × totalFromHvac
  dhw: number;           // kWh/yr — ratio × totalFromHvac
  plugLoads: number;     // kWh/yr — ratio × totalFromHvac
  total: number;         // kWh/yr — hvac + lighting + dhw + plugLoads
  perFloor: number[];    // kWh/m² per above-grade floor (uniform distribution)
  hvacDataSource: EnergyDataSource;
  lightingDataSource: EnergyDataSource;
  dhwDataSource: EnergyDataSource;
  plugLoadsDataSource: EnergyDataSource;
}
```

**`calculateSystemBreakdown` signature:**
```typescript
export function calculateSystemBreakdown(
  materials: MaterialProperties,
  recipe: BuildingRecipe,
  climate: ClimateData
): SystemBreakdown
```

---

## SYSTEM_RATIOS Table (final values for Plans 23-02+)

| Prefix | Use Type | HVAC | Lighting | DHW | Plug | Sum |
|--------|----------|------|----------|-----|------|-----|
| `"02"` | 업무시설 office | 0.55 | 0.25 | 0.10 | 0.10 | 1.00 |
| `"11"` | 공동주택 residential | 0.50 | 0.07 | 0.25 | 0.18 | 1.00 |
| `"13"` | 판매시설 retail | 0.45 | 0.40 | 0.03 | 0.12 | 1.00 |
| DEFAULT | all other | 0.42 | 0.28 | 0.12 | 0.18 | 1.00 |

Lookup: `recipe.mainPurpsCd.slice(0, 2)` → 2-char prefix match → fallback to DEFAULT.

---

## Algorithm

```
heatLoss = calculateHeatLoss(materials, recipe, climate)
demand   = calculateAnnualDemand(heatLoss, materials, recipe, climate)

prefix = recipe.mainPurpsCd.slice(0, 2)
ratios = SYSTEM_RATIOS[prefix] ?? DEFAULT_RATIOS

hvac           = demand.totalDemand                    // anchored to engine
totalFromHvac  = hvac / ratios.hvac                    // scale so total is consistent
lighting       = totalFromHvac × ratios.lighting
dhw            = totalFromHvac × ratios.dhw
plugLoads      = totalFromHvac × ratios.plug
total          = hvac + lighting + dhw + plugLoads

aboveFloors    = recipe.floors.filter(f => f.type === "above")
floorArea      = footprintWidth × footprintDepth
perFloor       = aboveFloors.map(() => total / (aboveFloors.length × floorArea))
```

---

## Tests

`src/lib/energy/__tests__/system-breakdown.test.ts` — 7 tests (all pass):

| # | Test Name | Req |
|---|-----------|-----|
| 1 | HVAC attribution equals calculateAnnualDemand().totalDemand | EA-01c, D2 |
| 2 | total equals sum of the four system buckets | EA-01b |
| 3 | perFloor length equals count of above-grade floors only | EA-01a, D3 |
| 4 | every *DataSource field carries the correct runtime string | EA-01d, D4 |
| 5 | mainPurpsCd prefix '02' selects office ratios: hvac/total ≈ 0.55 | D6, D7 |
| 6 | mainPurpsCd prefix '11' selects residential ratios (DHW-dominant) | D7 |
| 7 | unknown mainPurpsCd falls back to DEFAULT_RATIOS | D7 |

Full suite: 35 test files, 450 tests, 0 failures. `pnpm build`: 0 TypeScript errors.

---

## Deviations from Plan

### Auto-applied: CONTEXT.md overrides RESEARCH.md on two points

**1. [Rule 2 - Superseded spec] EnergyDataSource excludes "modeled" variant**
- **Found during:** Task 1 (test writing)
- **Issue:** RESEARCH.md Pattern 1 code showed `"actual" | "modeled" | "estimated-ratio"`. CONTEXT.md D4 (locked decision) specifies `"actual" | "estimated-ratio" | "estimated-inferred"`.
- **Fix:** Used CONTEXT.md D4 values. The test for EA-01d asserts `"estimated-ratio"` (not `"modeled"`).
- **Impact:** `hvacDataSource` is `"estimated-ratio"` in Phase 23. Phase 26 introduces `"actual"`.

**2. [Rule 2 - Superseded spec] Office ratios 55/25/10/10 not 40/35/7/18**
- **Found during:** Task 2 (implementation)
- **Issue:** RESEARCH.md Pattern 4 table showed office as 40/35/7/18. CONTEXT.md D6 specifies 55/25/10/10 for Korean office.
- **Fix:** Used CONTEXT.md D6 values in SYSTEM_RATIOS["02"]. Test EA-01 verifies hvac/total ≈ 0.55.
- **Files modified:** `system-breakdown.ts` only (new file).

Both deviations are explicitly directed by the plan: `"Copy RESEARCH.md's 40/35/7/18 office ratios — those are superseded by CONTEXT.md D6 (55/25/10/10)"`.

---

## Known Stubs

None. The pure function is fully wired: it calls real engine functions and returns computed values. No hardcoded empty arrays, placeholders, or TODO markers.

---

## Commits

| Hash | Message |
|------|---------|
| `fcb8e03` | `test(23-01): add failing Vitest tests for calculateSystemBreakdown (RED)` |
| `bf3e3b9` | `feat(23-01): calculateSystemBreakdown + EnergyDataSource types` |

---

## Self-Check: PASSED

- `src/lib/energy/system-breakdown.ts` — FOUND
- `src/lib/energy/__tests__/system-breakdown.test.ts` — FOUND
- Commit `fcb8e03` — FOUND
- Commit `bf3e3b9` — FOUND
- 7 new tests pass, 443 existing tests unaffected
- `pnpm build` exit 0, 0 TypeScript errors
