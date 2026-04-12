---
phase: 28-procedural-mep-equipment-models
plan: "01"
subsystem: mep-equipment
tags: [types, zustand, foundation, wave-1]
dependency_graph:
  requires: []
  provides:
    - MepEquipmentParams (type contract for Plans 02–05)
    - useEquipmentStore (per-buildingPk params store)
    - DEFAULT_MEP_EQUIPMENT_PARAMS (research-spec defaults)
  affects:
    - Plans 28-02 through 28-05 (all consume MepEquipmentParams + useEquipmentStore)
tech_stack:
  added: []
  patterns:
    - Zustand store with dot-path overrideParam (mirrors material-store pattern)
    - TDD (RED/GREEN per task, no REFACTOR pass needed)
key_files:
  created:
    - src/lib/layers/mep-equipment-params.ts
    - src/lib/layers/mep-equipment-params.test.ts
    - src/store/equipment-store.ts
    - src/store/__tests__/equipment-store.test.ts
  modified: []
decisions:
  - "overrideParam initializes from DEFAULT_MEP_EQUIPMENT_PARAMS on missing pk (diverges from material-store which silently drops the write — critical for equipment params where user may adjust before building is loaded)"
  - "No persist middleware — equipment params are per-session defaults derived from building era; persisting cross-session would lock users to stale defaults"
  - "lightingFixture.height = 0.10m not 0.02m — 2cm fixtures are invisible at scene distance"
  - "boiler.vrfLocation = 'roof' resolves Open Question 1 from research"
metrics:
  duration_minutes: 12
  completed_date: "2026-04-12"
  tasks_completed: 2
  files_created: 4
  files_modified: 0
  tests_added: 16
---

# Phase 28 Plan 01: MepEquipmentParams Types + Equipment-Store Foundation Summary

**One-liner:** Pure-TS MepEquipmentParams type system with 6 sub-interfaces and research-spec defaults, plus Zustand equipment-store with safe-initialize overrideParam — unblocks all Wave 2 MEP generator plans.

## What Was Built

### `src/lib/layers/mep-equipment-params.ts`

Exports 7 types and one constant:

- `ChillerParams` — bodyWidth/bodyDepth/bodyHeight/showCoolingTower/pipeStubRadius
- `BoilerParams` — radius/height/flueRadius/flueHeight/vrfHeads/vrfHeadsPerFloor/vrfLocation
- `AhuParams` — width/height/depth/showDuctStubs/showFanFace/unitsPerFloor
- `DhwParams` — tankRadius/tankHeight/showPump/showInsulationJacket
- `LightingFixtureParams` — width/depth/height/showDiffuserFace
- `ElectricalPanelParams` — width/height/depth/showDoorOutline/showBreakerGrid
- `MepEquipmentParams` — composite of all 6 sub-interfaces
- `DEFAULT_MEP_EQUIPMENT_PARAMS` — all defaults per research spec

No Three.js imports — pure TypeScript, safe to import in any context.

### `src/store/equipment-store.ts`

Zustand store (`useEquipmentStore`) with:

- `params: Record<string, MepEquipmentParams>` — keyed by mgmBldrgstPk
- `setParams(pk, params)` — full replacement
- `getParams(pk)` — returns deep copy of DEFAULT when pk absent (never undefined)
- `overrideParam(pk, path, value)` — dot-path setter that **initializes from DEFAULT on missing pk** (key divergence from material-store)

No persist middleware (per plan spec — equipment params are session-local defaults).

## Decisions Made

### 1. overrideParam initializes from DEFAULT on missing pk

Material-store's `overrideProperty` returns `state` unchanged when pk is absent — a safe approach for inferred material properties where a no-op is acceptable. Equipment params are user-adjustable geometry overrides: if a user sets a param before the building entry is initialized, silently dropping the write would cause confusing UI state where the slider appears to have changed but nothing persists. The fix initializes from `DEFAULT_MEP_EQUIPMENT_PARAMS` first, then applies the override.

### 2. No persist middleware

Equipment params are derived from building era during generator initialization. Persisting them in localStorage would cause stale defaults to override the era-based initialization on next load — a subtle regression harder to debug than the cost of re-deriving defaults. This is explicitly called out in the plan.

### 3. lightingFixture.height = 0.10m

Research explicitly flagged 0.02m (2cm) as too flat to be visible at typical scene distances (5–50m). 0.10m (10cm) is the research-recommended value and matches real suspended fixture depths.

### 4. boiler.vrfLocation = "roof"

Resolves Open Question 1 from 28-RESEARCH.md. Roof placement is appropriate for the majority of Korean commercial buildings; perimeter is available as an override for specific cases.

## Test Coverage

| File | Tests | Coverage |
|------|-------|----------|
| mep-equipment-params.test.ts | 9 | All 6 sub-keys, 7 specific default values, type check |
| equipment-store.test.ts | 7 | getParams fallback, setParams round-trip, overrideParam nested path, init-on-missing-pk, boolean persist, DEFAULT immutability, pk isolation |
| **Total** | **16** | — |

Full store regression: 75/75 passing (no regressions in other stores).

## Deviations from Plan

None — plan executed exactly as written. The divergence from material-store behavior (initialize on missing pk) was prescribed in the plan spec, not discovered during execution.

## Known Stubs

None — this plan creates pure type/store infrastructure with no UI rendering.

## Self-Check: PASSED

- `src/lib/layers/mep-equipment-params.ts` — EXISTS
- `src/lib/layers/mep-equipment-params.test.ts` — EXISTS
- `src/store/equipment-store.ts` — EXISTS
- `src/store/__tests__/equipment-store.test.ts` — EXISTS
- Commit `483f7d0` — EXISTS (feat(28-01): MepEquipmentParams types + equipment-store foundation)
- `pnpm build` — PASSED (0 errors)
- `pnpm lint` — PASSED (0 errors, 54 pre-existing warnings)
- All 16 new tests — PASSED
- All 75 store tests — PASSED (no regressions)
