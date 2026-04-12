---
phase: 28-procedural-mep-equipment-models
plan: "03"
subsystem: layer-5-ventilation
tags: [three.js, instanced-mesh, merged-geometry, ahu, ventilation, mep, draw-calls]
dependency_graph:
  requires: [28-01]
  provides: [merged-ahu-geometry, buildAhuGeometry-helper]
  affects: [layer-5-ventilation, mep-hvac-sub-layer]
tech_stack:
  added: [BufferGeometryUtils.mergeGeometries, TorusGeometry]
  patterns: [multi-primitive-merged-geometry, instanced-mesh-per-floor]
key_files:
  created:
    - src/lib/layers/__tests__/layer-5-ventilation.test.ts
  modified:
    - src/lib/layers/layer-5-ventilation.ts
decisions:
  - "instanceMatrix.needsUpdate is a write-only setter in Three.js — tested via version increment (> 0) rather than direct boolean read"
  - "duct stubs use BoxGeometry (supply + return) rather than CylinderGeometry for simpler UV compatibility with mergeGeometries"
  - "pre-existing failures in layer-4-heating.test.ts and layer-7-lighting.test.ts logged as deferred — those are Wave 2 tests awaiting their own plan implementations"
metrics:
  duration: ~15 min
  completed: "2026-04-12"
  tasks_completed: 1
  files_changed: 2
requirements: [EQUIP-01]
---

# Phase 28 Plan 03: Merged AHU Geometry with Duct Stubs + Fan Ring Summary

**One-liner:** Replaced plain BoxGeometry AHU with `buildAhuGeometry()` merging body + supply/return duct stubs + TorusGeometry fan ring into one InstancedMesh, eliminating O(floors × 4) floating duct Meshes and reducing ventilation layer to 1 draw call.

## What Was Built

### `buildAhuGeometry(p: AhuParams): THREE.BufferGeometry`

A new pure function that merges up to 4 geometry pieces using `BufferGeometryUtils.mergeGeometries()`:

1. **Body** — `BoxGeometry(width, height, depth)` — always included
2. **Supply duct stub** — `BoxGeometry(0.4, h×0.5, d×0.5)` translated to +X face (if `showDuctStubs`)
3. **Return duct stub** — `BoxGeometry(0.35, h×0.4, d×0.4)` translated to -X face (if `showDuctStubs`)
4. **Fan ring** — `TorusGeometry(fanRadius, 0.04, 8, 16)` rotated and translated to +Z face (if `showFanFace`)

### `VentilationLayer.generate()` signature extended

```ts
generate(
  recipe: BuildingRecipe,
  density: number = 1.0,
  equipParams: Partial<AhuParams> = {}
): THREE.Group
```

The third argument is optional — backward compatible with all existing callers.

### Draw call reduction

| Before | After |
|--------|-------|
| 1 InstancedMesh (AHU box, plain BoxGeometry) | 1 InstancedMesh (merged body+ducts+fan) |
| 4 × floors individual duct Meshes (12 for 3-floor building) | 0 — duct stubs baked into merged geometry |
| **13 draw calls** (3-floor example) | **1 draw call** |

### InstancedMesh count formula updated

Was: `aboveFloors.length`
Now: `aboveFloors.length × ahuParams.unitsPerFloor`

Matrix positioning loop updated to handle `unitsPerFloor > 1` with X-offset spacing.

## Test Coverage

9 assertions in `src/lib/layers/__tests__/layer-5-ventilation.test.ts`:

| # | Assertion | Result |
|---|-----------|--------|
| 1 | Group named `layer-5-ventilation` | PASS |
| 2 | InstancedMesh with `userData.type === "vent-ahu"` | PASS |
| 3 | Merged geometry position.count > 24 (plain box) | PASS |
| 4 | `instanceMatrix.version > 0` (needsUpdate was called) | PASS |
| 5 | count === aboveFloors × default unitsPerFloor (1) | PASS |
| 6 | `unitsPerFloor: 2` doubles count | PASS |
| 7 | `showFanFace: false + showDuctStubs: false` → count === 24 (body only) | PASS |
| 8 | No `vent-duct` Meshes in group (floating ducts eliminated) | PASS |
| 9 | `vent-airflow` Line objects still present | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `instanceMatrix.needsUpdate` is a write-only setter**
- **Found during:** Test RED phase
- **Issue:** Three.js `BufferAttribute.needsUpdate` is a set-only property — reading it always returns `undefined` regardless of what was assigned. The plan's test spec said `expect(ahuIM.instanceMatrix.needsUpdate).toBe(true)` which always fails.
- **Fix:** Changed assertion to `expect(ahuIM.instanceMatrix.version).toBeGreaterThan(0)` — the setter increments `version` internally, which is the observable side effect proving `needsUpdate = true` was called.
- **Files modified:** `src/lib/layers/__tests__/layer-5-ventilation.test.ts`
- **Commit:** 49ba3fc

None — implementation executed exactly as specified in the plan's `<reference_pattern>` block.

## Known Stubs

None — the merged geometry is fully wired and functional.

## Out-of-Scope Pre-existing Failures

Failures in `layer-4-heating.test.ts` (7 tests) and `layer-7-lighting.test.ts` (3 tests) exist in the layers test suite. These are test files written by other Wave 2 agents (28-02 and 28-05 respectively) whose implementation plans have not yet run. They are pre-existing and unrelated to this plan's changes. Logged to deferred-items.

## Self-Check: PASSED

- `src/lib/layers/layer-5-ventilation.ts` — FOUND
- `src/lib/layers/__tests__/layer-5-ventilation.test.ts` — FOUND
- Commit `49ba3fc` — FOUND
- `pnpm build` — PASSED (0 errors)
- `pnpm lint` — PASSED (0 errors, 55 pre-existing warnings)
- `pnpm vitest run src/lib/layers/__tests__/layer-5-ventilation.test.ts` — 9/9 PASSED
