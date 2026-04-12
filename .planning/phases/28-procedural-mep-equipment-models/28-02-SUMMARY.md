---
phase: 28-procedural-mep-equipment-models
plan: "02"
subsystem: mep-layers
tags: [three.js, instanced-mesh, merge-geometries, hvac, chiller, boiler, vrf, fan-coil]
dependency_graph:
  requires: [28-01]
  provides: [layer-3-cooling-geometry, layer-4-heating-geometry]
  affects: [layer-manager, building-layers, equipment-store]
tech_stack:
  added: []
  patterns:
    - mergeGeometries for multi-primitive IM-compatible equipment assembly
    - InstancedMesh per equipment sub-type (VRF heads, fan coils)
    - Backward-compatible optional 3rd arg pattern for LayerGenerator.generate()
key_files:
  created:
    - src/lib/layers/__tests__/layer-3-cooling.test.ts
    - src/lib/layers/__tests__/layer-4-heating.test.ts
  modified:
    - src/lib/layers/layer-3-cooling.ts
    - src/lib/layers/layer-4-heating.ts
decisions:
  - "instanceMatrix.needsUpdate is a write-only setter — tests check .version >= 1 instead of reading needsUpdate back"
  - "Chiller rendered as single Mesh (one per building, no instancing needed); VRF and fan coil as InstancedMesh"
  - "userData.type strings cooling-plant and heating-boiler preserved verbatim for Phase 26 prefix dispatch"
metrics:
  duration: "~14 min"
  completed_date: "2026-04-12"
  tasks_completed: 2
  files_changed: 4
---

# Phase 28 Plan 02: HVAC Equipment Geometry Upgrade Summary

Upgraded `layer-3-cooling.ts` and `layer-4-heating.ts` with distinct, recognizable procedural 3D models using `mergeGeometries` + `InstancedMesh`. Chiller is a 4-primitive merged assembly (body + condenser grille + 2 pipe stubs). Boiler is a CylinderGeometry body with flue stack + 2 pipe stubs. VRF outdoor units and fan coil units are InstancedMesh for per-floor rendering with a single draw call each.

## What Was Built

### Layer 3: Cooling

**`buildChillerGeometry(p: ChillerParams): THREE.BufferGeometry`**
- Body: `BoxGeometry(bodyWidth, bodyHeight, bodyDepth)` — main chiller cabinet
- Grille: thinner `BoxGeometry` translated to +Z face (condenser grille)
- PipeA: `CylinderGeometry` rotated Z, translated to +X face at -Y (supply stub)
- PipeB: `CylinderGeometry` rotated Z, translated to +X face at +Y (return stub)
- All merged with `mergeGeometries([body, grille, pipeA, pipeB])` — 1 draw call

**Optional cooling tower** (when `showCoolingTower === true`):
- CylinderGeometry body + TorusGeometry fan ring, merged, offset 2m on X axis
- `userData.type = "cooling-tower"` (matches `cooling-*` Phase 26 prefix dispatch)

### Layer 4: Heating

**`buildBoilerGeometry(p: BoilerParams): THREE.BufferGeometry`**
- Body: `CylinderGeometry(radius, radius, height, 16)` — main boiler tank
- Flue: `CylinderGeometry` translated to top of body (flue stack)
- PipeA: `CylinderGeometry` rotated Z at -Y (supply stub)
- PipeB: `CylinderGeometry` rotated Z at +Y (return stub)
- All merged — 1 draw call per boiler

**VRF outdoor unit InstancedMesh** (`userData.type = "heating-vrf-head"`):
- Box cassette (0.8×0.6×0.35) + 3 louvre stripe boxes merged
- Count: `vrfHeadsPerFloor × 2` for roof cluster, or `aboveFloors.length × vrfHeadsPerFloor` for perimeter
- Skipped entirely when `vrfHeads === false`
- Cyan tint (0x0891b2) for visual distinction

**Fan coil InstancedMesh** (`userData.type = "heating-fan-coil"`):
- Flat box cassette (0.9×0.1×0.5)
- Count: `aboveFloors.length` — one per above floor at ceiling level
- Blue tint (0x1d4ed8) for visual distinction
- Always present (not conditional)

## New userData.type Strings Introduced

| Type | Layer | IM? | Phase 26 Prefix Dispatch |
|------|-------|-----|--------------------------|
| `cooling-tower` | 3 | No (single Mesh) | `cooling-*` → HVAC cooling spec |
| `heating-vrf-head` | 4 | Yes | `heating-*` → HVAC heating spec |
| `heating-fan-coil` | 4 | Yes | `heating-*` → HVAC heating spec |

Existing types preserved: `cooling-plant`, `heating-boiler`.

## Draw Call Budget (Layers 3+4)

| Equipment | Draw Calls | Notes |
|-----------|-----------|-------|
| Chiller plant | 1 | Single Mesh, merged geometry |
| Cooling tower (optional) | 0–1 | Off by default |
| Boiler | 1 | Single Mesh, merged cylinder geometry |
| VRF heads | 1 | InstancedMesh, N instances |
| Fan coil units | 1 | InstancedMesh, N instances |
| **Subtotal layers 3+4** | **4–5** | Well within ≤10 budget |

## Generator Signature (Backward-Compatible)

```ts
// Layer 3
generate(recipe: BuildingRecipe, density?: number, equipParams?: Partial<ChillerParams>): THREE.Group

// Layer 4
generate(recipe: BuildingRecipe, density?: number, equipParams?: Partial<BoilerParams>): THREE.Group
```

Existing call sites passing 1–2 args compile unchanged. Third arg is always optional with `= {}` default.

## Test Coverage

**layer-3-cooling.test.ts** (8 tests, all pass):
- Group name, cooling-plant userData.type, vertex count > 48 (merged vs plain box), risers/branches intact, flow particles intact, 2-arg backward compat, equipParams override changes bounding box, dispose without throw

**layer-4-heating.test.ts** (13 tests, all pass):
- Group name, heating-boiler userData.type, boiler vertex count > 48, VRF IM exists, VRF instanceMatrix.version >= 1, VRF count = 4 (roof default), fan coil IM exists, fan coil instanceMatrix.version >= 1, fan coil count = 3 (3 floors), vrfHeads=false skips VRF IM, risers/floor pipes intact, 2-arg backward compat, dispose without throw

**Full layers suite:** 97/97 tests pass (9 test files).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `instanceMatrix.needsUpdate` is a write-only setter**
- **Found during:** Task 2 verification
- **Issue:** `BufferAttribute.needsUpdate` is a set-only property in Three.js — it increments `.version` but reading it back always returns `undefined`. The test plan specified `expect(vrfIM!.instanceMatrix.needsUpdate).toBe(true)` which can never pass.
- **Fix:** Changed both failing assertions to `expect(...instanceMatrix.version).toBeGreaterThanOrEqual(1)`. `version` starts at 0 and increments to 1 when `needsUpdate = true` is assigned, which is the correct observable proof that the flag was set.
- **Files modified:** `src/lib/layers/__tests__/layer-4-heating.test.ts`
- **Commit:** 93c593c (same commit)

## Known Stubs

None — all equipment geometry, userData.type strings, and InstancedMesh instance matrices are fully wired.

## Self-Check: PASSED

- `src/lib/layers/layer-3-cooling.ts` — exists, modified
- `src/lib/layers/layer-4-heating.ts` — exists, modified
- `src/lib/layers/__tests__/layer-3-cooling.test.ts` — exists, created
- `src/lib/layers/__tests__/layer-4-heating.test.ts` — exists, created
- Commit `93c593c` — verified in git log
- All 21 target tests pass; 97/97 full suite pass
- `pnpm build` exit code 0 (TypeScript clean)
- `pnpm lint` 0 errors (55 pre-existing warnings in unrelated files)
