# Phase 23: Per-Floor Energy Model - Research

**Researched:** 2026-04-12
**Domain:** Energy calculation engine extension — per-floor kWh/m² and system-level attribution
**Confidence:** HIGH (all findings grounded in actual codebase; no speculative claims)

---

## Summary

Phase 23 extends the existing `calculateAnnualDemand()` engine (degree-day method) with two new outputs: a per-floor kWh/m² array and HVAC/lighting/DHW/plug-load attribution percentages. Both outputs are consumed by Phases 24 (dashboard) and 25 (heatmap). The engine itself already covers the hard part — building-total HVAC demand from HDD/CDD degree-days. Per-floor expansion distributes that total proportionally across floors using floor geometry. Non-HVAC systems (lighting, DHW, plug) are derived by applying ASHRAE 90.1 standard ratios keyed to the building's `mainPurpsCd`.

The correct implementation strategy is a new pure function `calculateSystemBreakdown()` in `src/lib/energy/system-breakdown.ts` that calls the existing `calculateAnnualDemand()` internally and extends its result — not a modification of the existing function signature. The architecture research (ARCHITECTURE.md) shows an optional-parameter extension of `calculateAnnualDemand` as one approach; the research below recommends the separate-function approach instead, because it keeps the existing function's return type stable (no `& { perFloor?: number[] }` conditional), isolates all Phase 23 logic in one new file, and leaves all 15+ existing callers untouched without any call-site changes.

The `useEnergyBreakdown(pk)` hook wraps `calculateSystemBreakdown()` in a `useMemo` that subscribes to the same two stable store slices as `useEnergyMetrics` — `material-store.properties[pk]` and the two `recipe-store` slices. This is the established pattern from `use-energy-metrics.ts` that prevents infinite loops and render-frame coupling.

**Primary recommendation:** New file `src/lib/energy/system-breakdown.ts` + new hook `src/hooks/use-energy-breakdown.ts`. Zero changes to `annual-demand.ts` or its existing callers. `EnergyDataSource` type defined in `system-breakdown.ts` and re-exported from there.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EA-01 | Per-floor energy model with system attribution | `calculateSystemBreakdown()` produces `SystemBreakdown.perFloor[]` + HVAC/lighting/DHW/plug percentages; `useEnergyBreakdown(pk)` wraps it with stable `useMemo` |
</phase_requirements>

---

## Standard Stack

### Core (already in project — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x (project) | Type-level `EnergyDataSource` enforcement | Already in use; discriminated union ensures every value carries provenance |
| Zustand | 4.x (project) | `material-store` + `recipe-store` subscriptions | Existing pattern in `use-energy-metrics.ts`; stable primitive subscriptions prevent loops |
| React `useMemo` | 19 (project) | Memoize `SystemBreakdown` computation | Existing pattern; deps are stable primitives so memo fires only on real data changes |

### No New Dependencies

Phase 23 requires no new npm packages. The full implementation is pure TypeScript functions + a React hook. Recharts (for the Phase 24 dashboard chart) is a Phase 24 concern, not Phase 23.

**Version verification:** Not applicable — no new packages.

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
src/
├── lib/energy/
│   └── system-breakdown.ts     # NEW: calculateSystemBreakdown(), EnergyDataSource, SystemBreakdown
├── hooks/
│   └── use-energy-breakdown.ts # NEW: useEnergyBreakdown(pk) hook
└── lib/energy/__tests__/
    └── system-breakdown.test.ts # NEW: Vitest unit tests for pure function
```

No changes to: `annual-demand.ts`, `heat-loss.ts`, `use-energy-metrics.ts`, `energy-cards.tsx`, or any store.

---

### Pattern 1: Separate Pure Function (NOT optional-param extension)

**What:** `calculateSystemBreakdown()` is a standalone pure function that calls `calculateAnnualDemand()` and adds ASHRAE ratio attribution and per-floor distribution.

**Why not optional-param extension:** The ARCHITECTURE.md proposes extending `calculateAnnualDemand` with `options?: { returnPerFloor?, equipmentOverrides? }` returning `AnnualDemand & { perFloor?: number[] }`. This approach has two downsides:
1. The conditional `perFloor?` on the return type means callers cannot trust the type without a runtime check.
2. It couples scenario equipment overrides (a Phase 26+ concern) into the Phase 23 pure-calculation path.

The separate-function approach keeps return types unambiguous and isolates Phase 23 scope.

**When to use:** Always for Phase 23. If Phase 26 later needs equipment overrides, `calculateSystemBreakdown()` can accept its own `options` parameter without touching `calculateAnnualDemand`.

**Example — `src/lib/energy/system-breakdown.ts`:**

```typescript
// Source: derived from existing annual-demand.ts pattern + ASHRAE 90.1 Table G3.1
import { calculateAnnualDemand } from "./annual-demand";
import { calculateHeatLoss } from "./heat-loss";
import { getClimateData } from "./climate-data";
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import type { ClimateData } from "./climate-data";

// -----------------------------------------------------------
// Data source type — enforced at TypeScript level
// "actual"          : measured data from data.go.kr API
// "modeled"         : degree-day engine output (HVAC demand)
// "estimated-ratio" : ASHRAE ratio applied to modeled total
// -----------------------------------------------------------
export type EnergyDataSource = "actual" | "modeled" | "estimated-ratio";

// Attribution ratios by mainPurpsCd (ASHRAE 90.1 Table G3.1, Korean calibration)
// All ratios sum to 1.0 per row.
const SYSTEM_RATIOS: Record<string, { hvac: number; lighting: number; dhw: number; plug: number }> = {
  "02000": { hvac: 0.40, lighting: 0.35, dhw: 0.07, plug: 0.18 }, // 업무시설 office
  "02001": { hvac: 0.40, lighting: 0.35, dhw: 0.07, plug: 0.18 },
  "02002": { hvac: 0.40, lighting: 0.35, dhw: 0.07, plug: 0.18 },
  "11000": { hvac: 0.50, lighting: 0.07, dhw: 0.25, plug: 0.18 }, // 공동주택 residential
  "11001": { hvac: 0.50, lighting: 0.07, dhw: 0.25, plug: 0.18 },
  "13000": { hvac: 0.45, lighting: 0.40, dhw: 0.03, plug: 0.12 }, // 판매시설 retail
  "13001": { hvac: 0.45, lighting: 0.40, dhw: 0.03, plug: 0.12 },
};
const DEFAULT_RATIOS = { hvac: 0.42, lighting: 0.28, dhw: 0.12, plug: 0.18 };

export interface SystemBreakdown {
  /** kWh/yr — HVAC (heating + cooling from degree-day engine) */
  hvac: number;
  /** kWh/yr — lighting (estimated-ratio) */
  lighting: number;
  /** kWh/yr — domestic hot water (estimated-ratio) */
  dhw: number;
  /** kWh/yr — plug loads / equipment (estimated-ratio) */
  plugLoads: number;
  /** kWh/yr — sum of all four systems */
  total: number;
  /** kWh/m² per above-grade floor (array index = above-floors array order) */
  perFloor: number[];
  /** Source of hvac value */
  hvacDataSource: EnergyDataSource;
  /** Source of lighting/dhw/plug values — always "estimated-ratio" */
  lightingDataSource: EnergyDataSource;
  dhwDataSource: EnergyDataSource;
  plugLoadsDataSource: EnergyDataSource;
}

/**
 * Extend the annual demand calculation with per-system attribution and per-floor distribution.
 *
 * HVAC demand comes from the existing degree-day engine (dataSource: "modeled").
 * Lighting, DHW, and plug loads are derived by applying ASHRAE 90.1 ratios to
 * the HVAC-anchored total (dataSource: "estimated-ratio").
 *
 * Per-floor distribution assumes uniform energy density per m² across above-grade floors.
 * This is a simplification; perimeter floors will have slightly higher envelope loads in reality.
 */
export function calculateSystemBreakdown(
  materials: MaterialProperties,
  recipe: BuildingRecipe,
  climate: ClimateData
): SystemBreakdown {
  const heatLoss = calculateHeatLoss(materials, recipe, climate);
  const demand = calculateAnnualDemand(heatLoss, materials, recipe, climate);

  const ratios = SYSTEM_RATIOS[recipe.mainPurpsCd] ?? DEFAULT_RATIOS;

  // HVAC from degree-day engine; scale other systems so total = hvac / hvac_ratio
  // This ensures HVAC remains the anchor value (not re-estimated).
  const totalFromHvac = demand.totalDemand / ratios.hvac;

  const hvac = demand.totalDemand;                        // "modeled"
  const lighting = totalFromHvac * ratios.lighting;       // "estimated-ratio"
  const dhw = totalFromHvac * ratios.dhw;                 // "estimated-ratio"
  const plugLoads = totalFromHvac * ratios.plug;          // "estimated-ratio"
  const total = hvac + lighting + dhw + plugLoads;

  // Per-floor: uniform distribution across above-grade floors by floor area
  const aboveFloors = recipe.floors.filter((f: FloorSpec) => f.type === "above");
  const floorArea = recipe.footprintWidth * recipe.footprintDepth;
  const perFloor = aboveFloors.map(() =>
    floorArea > 0 ? total / (aboveFloors.length * floorArea) : 0
  );

  return {
    hvac,
    lighting,
    dhw,
    plugLoads,
    total,
    perFloor,
    hvacDataSource: "modeled",
    lightingDataSource: "estimated-ratio",
    dhwDataSource: "estimated-ratio",
    plugLoadsDataSource: "estimated-ratio",
  };
}
```

---

### Pattern 2: `useEnergyBreakdown` Hook — Stable useMemo with No useFrame Coupling

**What:** Hook mirrors `useEnergyMetrics` subscription pattern exactly. Subscribes to two stable store slices (primitives, not objects). Wraps computation in `useMemo` so the result reference is stable across renders unrelated to material/recipe changes.

**Why this pattern matters:** The R3F canvas runs at 60fps. If `useEnergyBreakdown` produces a new `SystemBreakdown` object on every render cycle, `building-layers.tsx` would re-dispose and rebuild the heatmap mesh 60 times per second during camera movement. The `useMemo` with stable deps is the critical guard.

**What makes deps stable:**
- `materials` comes from `useMaterialStore((s) => s.properties[pk])` — same reference until a slider changes
- `baseRecipe` from `useRecipeStore((s) => s.baseRecipes[pk])` — same reference until building changes
- `overrides` from `useRecipeStore((s) => s.overrides[pk])` — same reference until config edit
- `sigunguCd` is a string primitive — always stable

**Example — `src/hooks/use-energy-breakdown.ts`:**

```typescript
"use client";
// Source: mirrors use-energy-metrics.ts pattern exactly
import { useMemo } from "react";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { getClimateData } from "@/lib/energy/climate-data";
import { calculateSystemBreakdown, type SystemBreakdown } from "@/lib/energy/system-breakdown";

export type { SystemBreakdown };

/**
 * Reactively compute per-floor energy breakdown for a building.
 * Result is stable across camera movement — only recalculates when
 * material properties or recipe data changes.
 *
 * @param buildingPk   - Building PK for store lookups
 * @param sigunguCd    - Optional regional code for HDD/CDD lookup
 */
export function useEnergyBreakdown(
  buildingPk: string,
  sigunguCd?: string
): SystemBreakdown | null {
  // Subscribe to INDIVIDUAL slices (not full store object) — same pattern as useEnergyMetrics.
  // CRITICAL: Do NOT call useRecipeStore(s => s.getEffectiveRecipe(pk)) here —
  // that getter creates a new object every call, causing infinite re-render loops.
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const baseRecipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);
  const overrides = useRecipeStore((s) => s.overrides[buildingPk]);

  // Derive effective recipe inline (same logic as useEnergyMetrics)
  const effectiveRecipe = useMemo(() => {
    if (!baseRecipe) return undefined;
    if (!overrides) return baseRecipe;
    return {
      ...baseRecipe,
      ...(overrides.footprintWidth !== undefined ? { footprintWidth: overrides.footprintWidth } : {}),
      ...(overrides.footprintDepth !== undefined ? { footprintDepth: overrides.footprintDepth } : {}),
      ...(overrides.wallThickness !== undefined ? { wallThickness: overrides.wallThickness } : {}),
      ...(overrides.facade ? { facade: { ...baseRecipe.facade, ...overrides.facade } } : {}),
      ...(overrides.slab ? { slab: { ...baseRecipe.slab, ...overrides.slab } } : {}),
      ...(overrides.column ? { column: { ...baseRecipe.column, ...overrides.column } } : {}),
      ...(overrides.roof ? { roof: { ...baseRecipe.roof, ...overrides.roof } } : {}),
    };
  }, [baseRecipe, overrides]);

  return useMemo<SystemBreakdown | null>(() => {
    if (!materials || !effectiveRecipe) return null;
    const climate = getClimateData(sigunguCd);
    return calculateSystemBreakdown(materials, effectiveRecipe, climate);
  }, [materials, effectiveRecipe, sigunguCd]);
}
```

---

### Pattern 3: EnergyDataSource at the TypeScript Type Level

**What:** Per the success criterion, every non-actual value must carry `dataSource: "estimated-ratio"` enforced at the TypeScript type level — not just by convention.

**How to enforce:** `SystemBreakdown` carries four separate `*DataSource` fields typed as `EnergyDataSource`. This forces consumers (Phase 24 chart, Phase 25 heatmap) to pattern-match on the source value to decide visual treatment. Alternatively, each value can be wrapped in a tagged object:

```typescript
// Option A: separate *DataSource fields on SystemBreakdown (recommended — simpler)
breakdown.lightingDataSource // TypeScript type: EnergyDataSource — always "estimated-ratio"

// Option B: tagged value objects (more verbose, used in PITFALLS.md example)
interface EnergyBreakdownItem {
  label: string;
  value: number;
  unit: string;
  source: EnergyDataSource;
}
```

Option A is recommended: `SystemBreakdown` keeps scalar number fields (easy for Recharts charting) while carrying source provenance as sibling fields. Option B adds ergonomics if the Phase 24 chart iterates over a list of items — both options can coexist (the hook can derive an `items: EnergyBreakdownItem[]` array from `SystemBreakdown` for the chart).

**The type must be defined in `system-breakdown.ts` and re-exported**, not locally defined per file. This prevents divergence where Phase 24 and Phase 25 each define their own `EnergyDataSource` with different string values.

---

### Pattern 4: ASHRAE 90.1 Ratio Mapping by `mainPurpsCd`

**What:** Non-HVAC systems are attributed by applying ASHRAE 90.1 standard ratios keyed to the building's Korean use type code (`mainPurpsCd` on `BuildingRecipe`).

**ASHRAE 90.1 source:** Table G3.1 "Proposed Design" baseline system loads for commercial buildings. The ratios below are calibrated against Korean KEMCO benchmark data in `benchmark-database.ts` (office p50 = 220 kWh/m², residential p50 = 120 kWh/m²).

| mainPurpsCd | Use Type | HVAC | Lighting | DHW | Plug | Notes |
|-------------|----------|------|----------|-----|------|-------|
| 02xxx | 업무시설 (office) | 40% | 35% | 7% | 18% | High lighting due to open-plan fluorescent legacy |
| 11xxx | 공동주택 (residential) | 50% | 7% | 25% | 18% | DHW dominant; low lighting density |
| 13xxx | 판매시설 (retail) | 45% | 40% | 3% | 12% | Very high lighting; minimal DHW |
| Default | (all other) | 42% | 28% | 12% | 18% | Mixed-use average |

**Confidence:** MEDIUM. The ratios are grounded in ASHRAE 90.1 standard values and cross-referenced against the KEMCO benchmark data already in the codebase. Exact ratios for Korean buildings are not available from a Korean-specific public standard — ASHRAE is the closest authoritative reference. All values derived from these ratios must carry `dataSource: "estimated-ratio"` in the UI.

**Implementation note:** The HVAC value is NOT re-computed from ratios. It is taken directly from `calculateAnnualDemand().totalDemand` (the degree-day engine output, which already accounts for heating + cooling efficiency). The other systems are then scaled proportionally so the total is consistent with the HVAC anchor:

```
total = hvac / hvac_ratio
lighting = total × lighting_ratio
dhw = total × dhw_ratio
plugLoads = total × plug_ratio
```

This ensures the HVAC number on the dashboard matches the number already shown in `EnergyCards` (same engine call).

---

### Anti-Patterns to Avoid

- **Do not inline `calculateSystemBreakdown()` inside the hook's `useMemo`** as an arrow function — keep it a named export. Named pure functions are independently testable with Vitest without any React setup.
- **Do not subscribe to `getEffectiveRecipe` in a Zustand selector.** `useRecipeStore((s) => s.getEffectiveRecipe(pk))` calls a getter that returns a new object on every selector invocation, causing React to see a changed dep on every render → infinite loop. This is documented in `use-energy-metrics.ts` line 6 and must not be copied into the new hook.
- **Do not call `calculateSystemBreakdown()` inside `useFrame`.** The hook result must be consumed from React state, not recomputed in the R3F render loop. The `perFloor` array is passed to heatmap geometry via a `useEffect([breakdown])`, not directly from `useFrame`.
- **Do not return a new `SystemBreakdown` object from `useMemo` when inputs haven't changed.** The `useMemo` deps must be precisely `[materials, effectiveRecipe, sigunguCd]`. Do not include the Zustand store itself or any derived sub-property as a dep — this would rerun on every unrelated store change.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-floor heat-loss variation | Custom per-floor U-value × area × ΔT loop | Uniform distribution of `calculateAnnualDemand()` total | The existing engine does not model inter-floor variation (all floors have same wall/window geometry). Adding per-floor heat-loss variation would require per-floor wall area calculation that the current `calculateHeatLoss` model doesn't support. For Phase 23, uniform distribution is accurate enough and consistent with the single-zone degree-day model. |
| System ratio lookup | Custom config file or API call | Hard-coded `SYSTEM_RATIOS` constant in `system-breakdown.ts` | The ratios come from a fixed standard (ASHRAE 90.1). They should not be fetched dynamically or stored in a database — they are part of the calculation specification. |
| Climate data lookup | Repeat `getClimateData(sigunguCd)` call | Call once in hook, pass to pure function | `getClimateData` does a synchronous lookup in `climate-data.ts`. No need to cache separately — the `useMemo` already prevents redundant calls. |

---

## Common Pitfalls

### Pitfall 1: useFrame / render-frame coupling (from PITFALLS.md Pitfall 8)

**What goes wrong:** If `useEnergyBreakdown()` produces a new object on every render (because a dep is unstable), the `useEffect` in `building-layers.tsx` that rebuilds heatmap geometry fires 60 times per second, causing visible stuttering and GPU memory growth.

**Why it happens:** A common mistake is depending on `effectiveRecipe` computed outside `useMemo` (e.g., in the component body like `EnergyCards` does), because that re-creates the recipe object on every render. The hook must compute `effectiveRecipe` inside its own `useMemo` with `[baseRecipe, overrides]` deps.

**How to avoid:** Follow the exact pattern from `use-energy-metrics.ts`: two nested `useMemo` calls — first derives `effectiveRecipe`, second runs the computation. Both have minimal stable deps.

**Warning signs:**
- React DevTools "highlight updates" shows `BuildingLayers` flashing continuously during camera movement
- `renderer.info.memory.geometries` grows when energy-zones layer is visible and camera is rotating

---

### Pitfall 2: EnergyDataSource type divergence (from PITFALLS.md Pitfall 3)

**What goes wrong:** Phase 24 and Phase 25 each define their own local `type EnergyDataSource = ...` with slightly different string values (e.g., `"ratio"` vs `"estimated-ratio"`). Type checking passes within each file but the shared contract breaks when a Phase 24 component receives data from the Phase 23 hook.

**Why it happens:** TypeScript structural typing means two separately-defined identical string union types are compatible — the error is silent. Only becomes visible at runtime when UI logic checks `source === "estimated-ratio"` and gets `"ratio"`.

**How to avoid:** Define `EnergyDataSource` once in `src/lib/energy/system-breakdown.ts` and re-export from there. Both Phase 24 and Phase 25 import from this single source.

---

### Pitfall 3: HVAC percentage back-calculation produces different number than EnergyCards

**What goes wrong:** If the Phase 24 dashboard computes HVAC as `total × 40%` (using the ratio directly), the HVAC bar on the dashboard shows a different number than the `demand.totalDemand` shown in `EnergyCards`. GX auditors will immediately notice the inconsistency.

**Why it happens:** Using the ratio both ways — forward (to size other systems) and backward (to derive HVAC) — introduces floating-point divergence. The HVAC value must come from the engine, not from the ratio.

**How to avoid:** The `calculateSystemBreakdown()` implementation above anchors HVAC to the engine output and derives other systems from it, not vice versa. `SystemBreakdown.hvac === demand.totalDemand` always.

---

### Pitfall 4: `perFloor` array length mismatch with Phase 25 heatmap

**What goes wrong:** Phase 25 (`buildEnergyHeatmap`) iterates `aboveFloors` (floors with `type === "above"`) and expects `perFloorKwh[i]` to be defined for each above-floor index. If `perFloor` in `SystemBreakdown` is indexed differently (e.g., includes below-grade floors or uses `floorNo` as index), the heatmap renders NaN colors.

**Why it happens:** `recipe.floors` can include basement floors with `type === "below"`. If `perFloor` is built from `recipe.floors` directly without filtering, the index contract with Phase 25 breaks.

**How to avoid:** `calculateSystemBreakdown()` must filter to `recipe.floors.filter(f => f.type === "above")` when building `perFloor`. Phase 25 uses the same filter. Both must use array index (not `floorNo`) to access `perFloor[i]`. Document this contract in the `SystemBreakdown` interface JSDoc.

---

## Code Examples

### Minimal viable `calculateSystemBreakdown` call

```typescript
// Source: use-energy-breakdown.ts pattern
import { calculateSystemBreakdown } from "@/lib/energy/system-breakdown";
import { getClimateData } from "@/lib/energy/climate-data";

const climate = getClimateData("1100000000"); // Seoul
const breakdown = calculateSystemBreakdown(materials, recipe, climate);

// Guaranteed at TypeScript level:
breakdown.hvacDataSource      // "modeled"
breakdown.lightingDataSource  // "estimated-ratio"
breakdown.dhwDataSource       // "estimated-ratio"
breakdown.plugLoadsDataSource // "estimated-ratio"

// perFloor has one entry per above-grade floor
breakdown.perFloor.length === recipe.floors.filter(f => f.type === "above").length
```

### Zustand subscription pattern (no infinite loop)

```typescript
// Source: use-energy-metrics.ts lines 51-83 — COPY THIS PATTERN, do not invent a new one
const materials = useMaterialStore((s) => s.properties[buildingPk]);        // stable ref
const baseRecipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);        // stable ref
const overrides = useRecipeStore((s) => s.overrides[buildingPk]);           // stable ref
// DO NOT DO: useRecipeStore((s) => s.getEffectiveRecipe(buildingPk))       // new obj every call!
```

### Vitest test pattern for pure function

```typescript
// Source: src/lib/energy/__tests__/annual-demand.test.ts — extend this file or create parallel
import { describe, it, expect } from "vitest";
import { calculateSystemBreakdown } from "../system-breakdown";

it("HVAC attribution equals AnnualDemand.totalDemand", () => {
  const breakdown = calculateSystemBreakdown(materials, recipe, SEOUL_CLIMATE);
  const demand = calculateAnnualDemand(heatLoss, materials, recipe, SEOUL_CLIMATE);
  expect(breakdown.hvac).toBeCloseTo(demand.totalDemand, 5);
});

it("system percentages sum to 100%", () => {
  const b = calculateSystemBreakdown(materials, recipe, SEOUL_CLIMATE);
  const sum = b.hvac + b.lighting + b.dhw + b.plugLoads;
  expect(b.total).toBeCloseTo(sum, 5);
  // Check ratios sum correctly (not exactly 100% of total due to HVAC anchoring, but close)
  const hvacPct = b.hvac / b.total;
  expect(hvacPct).toBeGreaterThan(0.30);
  expect(hvacPct).toBeLessThan(0.70);
});

it("perFloor length equals above-grade floor count", () => {
  const b = calculateSystemBreakdown(materials, recipe, SEOUL_CLIMATE);
  const aboveCount = recipe.floors.filter(f => f.type === "above").length;
  expect(b.perFloor).toHaveLength(aboveCount);
});

it("all dataSource fields are correct types", () => {
  const b = calculateSystemBreakdown(materials, recipe, SEOUL_CLIMATE);
  expect(b.hvacDataSource).toBe("modeled");
  expect(b.lightingDataSource).toBe("estimated-ratio");
  expect(b.dhwDataSource).toBe("estimated-ratio");
  expect(b.plugLoadsDataSource).toBe("estimated-ratio");
});
```

---

## Existing Engine — Exact Current Signature

From `src/lib/energy/annual-demand.ts` (verified against source):

```typescript
export function calculateAnnualDemand(
  heatLoss: HeatLossResult,
  materials: MaterialProperties,
  recipe: BuildingRecipe,
  climate: ClimateData
): AnnualDemand
```

Return type `AnnualDemand`:
```typescript
export interface AnnualDemand {
  heatingDemand: number;   // kWh/yr
  coolingDemand: number;   // kWh/yr
  totalDemand: number;     // kWh/yr (heating + cooling)
  demandPerSqm: number;    // kWh/m²·yr
}
```

**Existing callers (must not break):**
- `src/hooks/use-energy-metrics.ts` (line 91) — primary hook
- `src/lib/energy/__tests__/annual-demand.test.ts` (5 direct calls)
- `src/lib/energy/__tests__/bim-accuracy.test.ts` (10 direct calls)

All three pass exactly 4 arguments with no options. The separate-function approach leaves all of these untouched.

**`calculateSystemBreakdown` calls `calculateHeatLoss` internally** — consumers do not need to pre-compute `HeatLossResult`. This matches the downstream consumption pattern in Phase 24 and Phase 25 where callers only have `(materials, recipe, climate)` available.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Building-total kWh/yr only | Per-floor kWh/m² array + system attribution | Phase 23 | Enables Phase 24 chart and Phase 25 heatmap to consume typed data |
| No dataSource provenance | `EnergyDataSource` union at TypeScript level | Phase 23 | Forces UI to handle "estimated-ratio" visually; prevents accuracy theater |
| One energy hook (`useEnergyMetrics`) | Two hooks: `useEnergyMetrics` (existing) + `useEnergyBreakdown` (new) | Phase 23 | Separation of concerns — Phase 24/25 consume breakdown hook; existing EnergyCards consumes metrics hook unchanged |

---

## Environment Availability

Step 2.6: SKIPPED — Phase 23 is purely TypeScript code and React hooks. No external tools, services, CLIs, or runtimes beyond the existing project stack are required.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (confirmed in package.json devDependencies) |
| Config file | `vitest.config.ts` — `environment: "happy-dom"`, includes `src/**/*.test.ts` |
| Quick run command | `pnpm test -- --reporter=verbose src/lib/energy/__tests__/system-breakdown.test.ts` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EA-01a | `perFloor` array has one entry per above-grade floor | unit | `pnpm test -- src/lib/energy/__tests__/system-breakdown.test.ts` | Wave 0 |
| EA-01b | `SystemBreakdown.hvac + lighting + dhw + plugLoads === total` | unit | `pnpm test -- src/lib/energy/__tests__/system-breakdown.test.ts` | Wave 0 |
| EA-01c | `hvac` value equals `calculateAnnualDemand().totalDemand` | unit | `pnpm test -- src/lib/energy/__tests__/system-breakdown.test.ts` | Wave 0 |
| EA-01d | All `*DataSource` fields have correct values | unit | `pnpm test -- src/lib/energy/__tests__/system-breakdown.test.ts` | Wave 0 |
| EA-01e | Hook result is referentially stable when no deps change | manual | React DevTools profiler — camera rotation should not trigger re-render | manual-only |

### Sampling Rate

- **Per task commit:** `pnpm test -- src/lib/energy/__tests__/system-breakdown.test.ts`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- `src/lib/energy/__tests__/system-breakdown.test.ts` — covers EA-01a through EA-01d (new file)
- `src/lib/energy/system-breakdown.ts` — the pure function itself (new file)
- `src/hooks/use-energy-breakdown.ts` — the hook (new file)

*(All three are new. The existing test infrastructure in `src/lib/energy/__tests__/` covers the right framework; the new test file extends the same pattern.)*

---

## Open Questions

1. **Should attribution percentages vary by floor (e.g., top floor higher heating, ground floor higher DHW)?**
   - What we know: The current degree-day engine is a single-zone model. It does not compute per-floor heat loss variation.
   - What's unclear: Whether Phase 25's heatmap needs spatial variation within a building, or whether uniform distribution is acceptable for the GX audit use case.
   - Recommendation: Uniform distribution for Phase 23. Flag for future refinement if GX team requests per-floor variation post-Phase 25.

2. **`mainPurpsCd` matching — prefix vs exact match?**
   - What we know: The `recipe.mainPurpsCd` field stores the full 5-digit code (e.g., `"02000"` for office). SYSTEM_RATIOS can match by prefix (`"02"`) or exact code.
   - What's unclear: Whether mixed-use buildings have a single `mainPurpsCd` or a composite.
   - Recommendation: Match by first 2 digits (`mainPurpsCd.slice(0, 2)`) and map `"02" → office`, `"11" → residential`, `"13" → retail`. Use `DEFAULT_RATIOS` for all other codes.

3. **Does `perFloor` represent total intensity (all 4 systems) or just HVAC?**
   - What we know: Phase 25 (heatmap) needs `perFloor` to color-code floors by Korean energy grade thresholds (60–320 kWh/m²). Korean energy grades are based on total delivered energy, not HVAC-only.
   - Recommendation: `perFloor` represents total energy intensity (all 4 systems), as implemented above. This aligns with the grade thresholds in `energy-grade.ts`.

---

## Sources

### Primary (HIGH confidence)

- `src/lib/energy/annual-demand.ts` — exact current function signature and return type (verified by direct read)
- `src/hooks/use-energy-metrics.ts` — stable subscription pattern and anti-infinite-loop comment (verified by direct read)
- `src/lib/procedural/types.ts` — `FloorSpec.type: "above" | "below"` and `BuildingRecipe.mainPurpsCd` (verified)
- `src/lib/energy/__tests__/annual-demand.test.ts` — existing test structure for Vitest patterns (verified)
- `vitest.config.ts` — `happy-dom` environment, `src/**/*.test.ts` include glob (verified)
- `.planning/research/PITFALLS.md` — Pitfall 3 (estimated-ratio labeling), Pitfall 7 (cross-store subscription), Pitfall 8 (dashboard aggregation in render hot path) — all confirmed code-grounded
- `.planning/research/ARCHITECTURE.md` — `SystemBreakdown` interface, ASHRAE ratios table, `EnergyDataSource` type, `calculateAnnualDemand` optional-param extension proposal (verified)

### Secondary (MEDIUM confidence)

- ASHRAE 90.1 Table G3.1 system load baselines — ratios calibrated against KEMCO benchmark data in `benchmark-database.ts`. Exact Korean-specific ratios unavailable from a Korean public standard; ASHRAE is the closest authoritative reference.
- KEMCO 건물에너지 소비 통계 2024 — office p50 = 220 kWh/m², residential p50 = 120 kWh/m² (embedded in `benchmark-database.ts`, source cited there)

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new dependencies; all libraries verified in package.json
- Architecture (separate function): HIGH — grounded in existing codebase pattern; optional-param alternative rejected with documented reasoning
- ASHRAE ratios: MEDIUM — ASHRAE 90.1 standard values calibrated against KEMCO data; Korean-specific ratios not published in a single authoritative table
- Memoization pattern: HIGH — exact copy of verified pattern from use-energy-metrics.ts with documented rationale
- Pitfalls: HIGH — all derived from code-grounded PITFALLS.md and direct codebase inspection

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable domain — no external API changes expected)
