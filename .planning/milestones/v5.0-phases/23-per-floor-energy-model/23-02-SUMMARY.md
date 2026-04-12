---
phase: 23-per-floor-energy-model
plan: "02"
subsystem: energy-hook
tags: [energy, react-hook, memoization, referential-stability, tdd, vitest]
dependency_graph:
  requires:
    - src/lib/energy/system-breakdown.ts
    - src/store/material-store.ts
    - src/store/recipe-store.ts
    - src/lib/energy/climate-data.ts
  provides:
    - useEnergyBreakdown() React hook
    - SystemBreakdown type re-export
  affects:
    - Phase 24 (dashboard chart — consumes useEnergyBreakdown)
    - Phase 25 (per-floor heatmap — depends on referential stability guarantee)
tech_stack:
  added: []
  patterns:
    - Two nested useMemo (Pitfall 1 referential stability guard)
    - Zustand slice subscription (never getEffectiveRecipe getter)
    - TDD (RED → GREEN)
key_files:
  created:
    - src/hooks/use-energy-breakdown.ts
    - src/hooks/__tests__/use-energy-breakdown.test.ts
  modified: []
decisions:
  - "Override-merge block kept byte-identical to use-energy-metrics.ts lines 56-83 — SYNC NOTE comment added to both reference each other"
  - "@testing-library/react was already installed (^16.3.2) — no new devDependency required"
  - "Stability test uses === (referential equality) not deepEqual — guards against Phase 25 60fps heatmap rebuild"
metrics:
  duration_seconds: 178
  completed_date: "2026-04-12"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 23 Plan 02: useEnergyBreakdown Hook Summary

**One-liner:** `useEnergyBreakdown(buildingPk, sigunguCd?)` wrapping `calculateSystemBreakdown` with two-useMemo referential stability and Zustand slice subscriptions — no getter-induced infinite loops.

---

## What Was Built

### `src/hooks/use-energy-breakdown.ts` (82 lines)

**Signature:**
```typescript
export function useEnergyBreakdown(
  buildingPk: string,
  sigunguCd?: string
): SystemBreakdown | null
```

**JSDoc excerpt:**
```
Reactively compute the per-system energy breakdown for a building.
Returns null if materials or recipe data is not yet in its store.

Stability guarantee: when materials, baseRecipe, overrides, and sigunguCd are all
referentially unchanged, this hook returns the SAME SystemBreakdown object reference
across re-renders. This is critical for Phase 25's heatmap useEffect — otherwise the
floor-plane geometry would rebuild on every camera frame.
```

**Two-useMemo structure:**
```typescript
// First useMemo: derive effectiveRecipe from [baseRecipe, overrides]
const effectiveRecipe = useMemo(() => { ... }, [baseRecipe, overrides]);

// Second useMemo: run pure calculation with stable deps
return useMemo<SystemBreakdown | null>(() => {
  if (!materials || !effectiveRecipe) return null;
  const climate = getClimateData(sigunguCd);
  return calculateSystemBreakdown(materials, effectiveRecipe, climate);
}, [materials, effectiveRecipe, sigunguCd]);
```

**Zustand subscriptions (three stable slices):**
```typescript
const materials  = useMaterialStore((s) => s.properties[buildingPk]);
const baseRecipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);
const overrides  = useRecipeStore((s) => s.overrides[buildingPk]);
// NEVER: useRecipeStore((s) => s.getEffectiveRecipe(pk)) — getter returns new object per call
```

**Re-export:**
```typescript
export type { SystemBreakdown };
```

---

## `@testing-library/react` Status

**Already installed** — `@testing-library/react ^16.3.2` was present in `package.json` devDependencies. No new dependency was added. `happy-dom` environment (Vitest config) was already configured, so `renderHook` worked out of the box.

---

## Referential Stability Test Result (Pitfall 1 Guard)

The critical test:
```typescript
it("returns the same reference across unrelated re-renders (stability)", () => {
  ...
  const first = result.current;
  rerender({ pk: TEST_PK }); // unrelated re-render, no store changes
  expect(result.current).toBe(first); // === referential equality, not deepEqual
});
```

**PASSED.** This is the primary guard against Phase 25's 60fps floor-mesh rebuild. When the Three.js camera moves and triggers component re-renders, `useEnergyBreakdown` returns the cached `SystemBreakdown` object without recomputing — preventing `useEffect` from firing on every frame.

---

## Tests

`src/hooks/__tests__/use-energy-breakdown.test.ts` — 6 tests (all pass):

| # | Test Name | Requirement |
|---|-----------|-------------|
| 1 | returns null when materials are missing | Must-have truth 1 |
| 2 | returns null when recipe is missing | Must-have truth 2 |
| 3 | returns a SystemBreakdown when both stores are populated | Must-have truth 3 |
| 4 | returns the same reference across unrelated re-renders (stability) | Must-have truth 4, Pitfall 1 |
| 5 | returns a new reference after a material change | Must-have truth 5 |
| 6 | perFloor length equals above-grade floor count | Must-have truth 6 |

Full suite: **456 tests, 36 files, 0 failures**. `pnpm build`: 0 TypeScript errors. `pnpm lint`: 0 errors (54 pre-existing warnings unrelated to this plan).

---

## Deviations from Plan

None — plan executed exactly as written. The override-merge block was copied byte-for-byte from `use-energy-metrics.ts` lines 56–83. A `SYNC NOTE` comment was added to the hook referencing the sibling file to ensure future refactors notice the coupling (plan explicitly requested this annotation).

---

## Known Stubs

None. The hook is fully wired: it calls real store selectors, real `getClimateData()`, and real `calculateSystemBreakdown()`. No hardcoded values, placeholders, or TODO markers.

---

## Handoff Notes for Phase 24 (Dashboard) and Phase 25 (Heatmap)

### Calling the hook

```typescript
import { useEnergyBreakdown, type SystemBreakdown } from "@/hooks/use-energy-breakdown";

// In a React component:
const breakdown = useEnergyBreakdown(buildingPk, sigunguCd);
if (!breakdown) return <Skeleton />;
```

### Fields to consume

| Phase | Field(s) | Purpose |
|-------|----------|---------|
| 24 dashboard | `breakdown.hvac`, `breakdown.lighting`, `breakdown.dhw`, `breakdown.plugLoads` | Bar/donut chart values (kWh/yr) |
| 24 dashboard | `breakdown.total` | Total energy consumption display |
| 24 dashboard | `breakdown.hvacDataSource` (and siblings) | Provenance badge — show "Estimated" label when `"estimated-ratio"` |
| 25 heatmap | `breakdown.perFloor` | Array of kWh/m² per above-grade floor; index matches floor array order |

### Stability contract

Phase 25 MUST use `useEnergyBreakdown` (not call `calculateSystemBreakdown` directly) — the hook's memoization prevents geometry rebuilds on camera frames. Only material slider changes or recipe overrides trigger recomputation.

---

## Commits

| Hash | Message |
|------|---------|
| `586e903` | `feat(23-02): useEnergyBreakdown hook with two-useMemo memoization` |
| `f4accfc` | `test(23-02): useEnergyBreakdown referential stability + null-return tests` |

---

## Self-Check: PASSED

- `src/hooks/use-energy-breakdown.ts` — FOUND
- `src/hooks/__tests__/use-energy-breakdown.test.ts` — FOUND
- Commit `586e903` — FOUND
- Commit `f4accfc` — FOUND
- 6 new tests pass, 450 existing tests unaffected
- `pnpm build` exit 0, 0 TypeScript errors
- `pnpm lint` 0 errors (54 pre-existing warnings, none from new files)
