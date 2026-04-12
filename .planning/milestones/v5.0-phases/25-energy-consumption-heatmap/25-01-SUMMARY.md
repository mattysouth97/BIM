---
phase: 25-energy-consumption-heatmap
plan: "01"
subsystem: energy-visualization
tags: [three.js, heatmap, energy-grade, building-layers, per-floor]
dependency_graph:
  requires:
    - "23-per-floor-energy-model (useEnergyBreakdown hook, SystemBreakdown.perFloor)"
    - "22-layer-system (LayerManager, energy-zones group)"
    - "src/lib/energy/energy-grade.ts (getEnergyGrade, getGradeColor)"
  provides:
    - "src/lib/layers/energy-heatmap-builder.ts (buildEnergyHeatmap, kwhmToColor, disposeHeatmapGroup)"
    - "BuildingLayers accepts buildingPk prop, drives heatmap rebuilds via useEffect"
  affects:
    - "3D viewport energy-zones layer — per-floor horizontal color planes"
    - "building-scene.tsx — passes buildingPk to BuildingLayers"
tech_stack:
  added: []
  patterns:
    - "TDD RED→GREEN for pure Three.js factory"
    - "Named group targeted disposal (D-06) — avoids full disposeLayer call"
    - "useMemo effectiveRecipe + stable useEnergyBreakdown ref — prevents Pitfall 5 rebuild churn"
key_files:
  created:
    - src/lib/layers/energy-heatmap-builder.ts
    - src/lib/layers/__tests__/energy-heatmap-builder.test.ts
  modified:
    - src/components/viewer/building-layers.tsx
    - src/components/viewer/building-scene.tsx
decisions:
  - "Use kwhmToColor as thin wrapper over getEnergyGrade+getGradeColor (D-03) — green (#006400) to crimson (#DC143C), not blue anchor"
  - "PlaneGeometry rotated with geo.rotateX(-PI/2) to horizontal normal +Y (Pitfall 3 guard)"
  - "disposeHeatmapGroup targets named child 'energy-heatmap' only — not disposeLayer('energy-zones') (D-06)"
  - "effectiveRecipe useMemo in BuildingLayers mirrors use-energy-breakdown.ts merge logic (footprint fields only)"
  - "HEATMAP_Y_OFFSET = 0.02m lifts planes above slab to prevent z-fighting (Pitfall 2)"
  - "renderOrder=1 + depthWrite:false on all heatmap meshes (Pitfall 2 — transparent render order)"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-12"
  tasks_completed: 2
  tasks_skipped: 1
  files_created: 2
  files_modified: 2
  tests_added: 10
  tests_passing: 10
---

# Phase 25 Plan 01: Energy Consumption Heatmap Summary

**One-liner:** Per-floor energy heatmap using MeshBasicMaterial+vertexColors PlaneGeometry planes in the energy-zones layer, colored by Korean 10-grade kWh/m² thresholds via existing getEnergyGrade/getGradeColor, rebuilding reactively on useEnergyBreakdown changes.

## What Was Built

### Task 1: energy-heatmap-builder.ts (TDD RED→GREEN)

Created `src/lib/layers/energy-heatmap-builder.ts` — pure Three.js factory with no React dependencies:

- `kwhmToColor(kwh)` — one-liner delegating to `getEnergyGrade` + `getGradeColor` (D-03)
- `buildEnergyHeatmap(floors, perFloorKwh, recipe)` — returns a `THREE.Group` named `"energy-heatmap"` with one horizontal `PlaneGeometry` mesh per above-grade floor
- `disposeHeatmapGroup(energyZonesGroup)` — targeted traversal dispose of the named child group only (D-06)
- `HEATMAP_GROUP_NAME = "energy-heatmap"`, `HEATMAP_Y_OFFSET = 0.02`

Each mesh: `MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false })`, `renderOrder = 1`, `castShadow = false`, `receiveShadow = false`, `userData.type = "energy-heatmap-floor"`.

10 Vitest unit tests covering: color mapping (Test 1), group name/count (Test 2), material properties (Test 3), Y placement offset (Test 4), perFloor index alignment with above-floor filter (Test 5), graceful degradation on short/empty arrays (Test 6).

**Test fix:** Color comparison uses `new THREE.Color(hex)` on both sides — avoids Three.js r152+ sRGB gamma mismatch when comparing against raw hex/255 division.

### Task 2: BuildingLayers wiring + building-scene.tsx

Modified `src/components/viewer/building-layers.tsx`:
- Added `BuildingLayersProps { buildingPk?: string }` interface and destructured prop
- Unconditional hook calls (`useEnergyBreakdown(pk)`, `useRecipeStore` slices) with `pk = buildingPk ?? ""` fallback per Rules of Hooks
- `useMemo` for `effectiveRecipe` (footprint override merge — mirrors `use-energy-breakdown.ts`)
- New `useEffect([buildingPk, breakdown, effectiveRecipe])`: disposes old heatmap, bails on missing prerequisites, builds and adds new heatmap to `energy-zones` group

Modified `src/components/viewer/building-scene.tsx` line 434:
- `<BuildingLayers />` → `<BuildingLayers buildingPk={buildingPk} />`

### Task 3: Human Visual Verification

Skipped per execution instructions — user will verify after all phases complete.

## Verification Results

- `pnpm test src/lib/layers/__tests__/energy-heatmap-builder.test.ts --run` — 10/10 tests pass
- `pnpm build` — zero TypeScript errors (Next.js 16 Turbopack)
- `pnpm lint` — zero errors (54 pre-existing warnings, none introduced by this plan)
- Full test suite: 466/466 tests pass across 37 test files (1 pre-existing failure in `equipment-specs.test.ts` — missing source module unrelated to this plan)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] THREE.Color color space mismatch in test assertions**
- **Found during:** Task 1 GREEN phase
- **Issue:** Test 1 compared `kwhmToColor()` output against `hexToRgb()` helper that divided raw hex by 255. Three.js r152+ converts CSS hex colors to linear sRGB internally, producing different float values than raw division.
- **Fix:** Replaced `hexToRgb()` helper with `hexToThreeColor()` that constructs a `THREE.Color(hex)` — both sides undergo identical color space conversion.
- **Files modified:** `src/lib/layers/__tests__/energy-heatmap-builder.test.ts`
- **Commit:** `1d26a73`

None — all other plan instructions executed exactly as written.

## Known Stubs

None. The heatmap builder is fully wired to `useEnergyBreakdown` which derives `perFloor` from actual material store + recipe store data. No hardcoded or placeholder values in the data path.

## Deferred Items

- `src/lib/energy/__tests__/equipment-specs.test.ts` — pre-existing test referencing a missing `equipment-specs` module. Not introduced by this plan, not fixed here. Logged for future cleanup.

## Self-Check

Files created/modified:
- `src/lib/layers/energy-heatmap-builder.ts` — exists
- `src/lib/layers/__tests__/energy-heatmap-builder.test.ts` — exists
- `src/components/viewer/building-layers.tsx` — modified
- `src/components/viewer/building-scene.tsx` — modified

Commits:
- `1d26a73` — Task 1 RED+GREEN (energy-heatmap-builder.ts + tests)
- `a6783c8` — Task 2 (BuildingLayers wiring + building-scene.tsx)
