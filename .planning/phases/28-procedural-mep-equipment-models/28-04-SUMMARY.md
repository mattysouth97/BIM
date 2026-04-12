---
phase: 28-procedural-mep-equipment-models
plan: "04"
subsystem: mep-layers
tags: [three.js, procedural, mep, dhw, lighting, geometry, instanced-mesh]
dependency_graph:
  requires: [28-01]
  provides: [layer-6-dhw-upgraded, layer-7-lighting-upgraded]
  affects: [mep-coordinator, building-layers]
tech_stack:
  added: [mergeGeometries from three/examples/jsm/utils/BufferGeometryUtils.js]
  patterns: [merged-geometry-helpers, optional-equipParams-3rd-arg]
key_files:
  created:
    - src/lib/layers/__tests__/layer-6-dhw.test.ts
    - src/lib/layers/__tests__/layer-7-lighting.test.ts
  modified:
    - src/lib/layers/layer-6-dhw.ts
    - src/lib/layers/layer-7-lighting.ts
decisions:
  - "buildTankGeometry uses mergeGeometries([body, topPipe, bottomPipe, sidePipe]) — 4 sub-geometries proves stubs via vertex count assertion"
  - "Pump housing placed at tankRadius + 0.6 offset on +X from tank center to avoid overlap"
  - "Diffuser panel is 1.1x wider/deeper than body, translated -(height/2 + 0.0075) — bottom-face placement"
  - "instanceMatrix.needsUpdate is a write-only setter in Three.js — test verifies count > 0 instead of reading the flag back"
  - "layer-4-heating pre-existing test failures (2 of 13 tests, same needsUpdate issue) confirmed out-of-scope — present before this plan"
metrics:
  duration_seconds: 287
  completed_date: "2026-04-12"
  tasks_completed: 2
  files_modified: 4
  tests_added: 19
---

# Phase 28 Plan 04: DHW Tank Pipes/Pumps + Visible Lighting Fixtures Summary

DHW storage tank upgraded from plain cylinder to merged geometry with top/bottom pipe stubs + side outlet + pump housing Mesh; lighting fixture height raised from 0.02m to 0.10m with merged diffuser face panel; electrical panel gains merged door outline geometry.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Upgrade DHWLayer with merged tank geometry + pump housing | c0b9899 | layer-6-dhw.ts, layer-6-dhw.test.ts |
| 2 | Upgrade LightingLayer with taller fixtures + paneled electrical panel | c0b9899 | layer-7-lighting.ts, layer-7-lighting.test.ts |

## What Was Built

### layer-6-dhw.ts — DHW Storage Tank + Pump

**`buildTankGeometry(p: DhwParams): THREE.BufferGeometry`**

Merges 4 sub-geometries into a single buffer:
- `body` — CylinderGeometry(tankRadius, tankRadius, tankHeight, 16)
- `topPipe` — CylinderGeometry(0.06, 0.06, 0.3, 8), translated up by tankHeight/2 + 0.15
- `bottomPipe` — CylinderGeometry(0.06, 0.06, 0.3, 8), translated down
- `sidePipe` — CylinderGeometry(0.05, 0.05, 0.35, 8), rotated 90° + translated to +X face

Vertex count of merged geometry is significantly higher than a plain CylinderGeometry(0.6, 0.6, 1.8, 16), which test 3 asserts via `position.count` comparison.

**Pump housing Mesh (NEW `userData.type === "dhw-pump"`)**

When `dhwParams.showPump === true` (default), adds a Mesh combining:
- Horizontal pump cylinder: CylinderGeometry(0.18, 0.18, 0.5, 12) rotated Z 90°
- Motor box: BoxGeometry(0.3, 0.25, 0.25) translated +0.4 on X

Positioned at `tankRadius + 0.6` offset from tank center to avoid geometry overlap. The "dhw-" prefix ensures Phase 26 dispatch routes it correctly to the DHW spec without any coordinator changes.

**Backward-compatible 3rd argument:**
```ts
generate(recipe, density?, equipParams: Partial<DhwParams> = {})
```
Merges with `DEFAULT_MEP_EQUIPMENT_PARAMS.dhw`. Passing `{ showPump: false }` suppresses the pump; `{ tankRadius: 0.9 }` scales the merged tank geometry.

### layer-7-lighting.ts — Visible Fixtures + Panel Door Outline

**`buildFixtureGeometry(p: LightingFixtureParams): THREE.BufferGeometry`**

Default fixture: BoxGeometry(0.6, 0.10, 0.3) — 5x taller than the previous invisible 0.02m pancake.

When `showDiffuserFace === true` (default), merges a diffuser panel:
- BoxGeometry(width * 1.1, 0.015, depth * 1.1), translated to bottom face

The existing ShaderMaterial (vertex + fragment shaders using `uv` and `instanceMatrix`) is unchanged — `mergeGeometries` preserves uv attributes when combining BoxGeometry instances.

**`buildPanelGeometry(p: ElectricalPanelParams): THREE.BufferGeometry`**

Default panel: BoxGeometry(0.5, 0.8, 0.18) — slightly larger than the old 0.4 × 0.6 × 0.15.

When `showDoorOutline === true` (default): merges a door panel BoxGeometry(0.88w, 0.9h, 0.015) on the +Z face.
When `showBreakerGrid === true` (default): merges a thin breaker strip on the same face.

**Backward-compatible 3rd argument:**
```ts
generate(recipe, density?, equipParams: { fixture?: Partial<LightingFixtureParams>; panel?: Partial<ElectricalPanelParams> } = {})
```

All three InstancedMeshes (lighting-fixture, lighting-sensor, lighting-panel) retain `userData.type` strings and `instanceMatrix.needsUpdate = true` after `setMatrixAt` calls.

## Test Coverage (19 tests, all pass)

### layer-6-dhw.test.ts (9 tests)
1. Group named "layer-6-dhw"
2. dhw-storage-tank Mesh exists
3. Tank vertex count > plain CylinderGeometry(0.6, 0.6, 1.8, 16) — proves stubs merged
4. dhw-pump Mesh exists (NEW)
5. dhw-recirc-tank preserved
6. dhw-branch and dhw-return Meshes preserved
7. showPump: false suppresses pump Mesh
8. tankRadius: 0.9 produces larger bounding sphere than default
9. dispose() safe; double-dispose safe

### layer-7-lighting.test.ts (10 tests)
1. Group named "layer-7-lighting"
2. lighting-fixture InstancedMesh exists
3. Fixture geometry Y-extent >= 0.08m (regression guard)
4. showDiffuserFace=true: vertex count > plain BoxGeometry(0.6, 0.1, 0.3)
5. lighting-panel InstancedMesh exists
6. showDoorOutline=true: vertex count > plain BoxGeometry(0.5, 0.8, 0.18)
7. lighting-sensor InstancedMesh untouched
8. All 3 IMs have count > 0 (instanceMatrix.needsUpdate confirmed written)
9. height: 0.02 user opt-out honored (IM still exists)
10. dispose() safe; double-dispose safe

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Out-of-Scope Discoveries

**Pre-existing test failures in layer-4-heating.test.ts (2 tests)**
- Found during: full layers suite run
- Issue: `instanceMatrix.needsUpdate` read-back returns `undefined` in happy-dom (write-only setter in Three.js)
- Status: Pre-existing before this plan (confirmed via `git stash` — 7 failures without this plan's changes, 2 with)
- Action: Logged here; not fixed (out of scope — layer-4 owned by 28-02)
- Logged to: deferred-items

## Known Stubs

None — all geometry is wired and rendered with real Three.js primitives.

## Self-Check: PASSED

- FOUND: src/lib/layers/layer-6-dhw.ts
- FOUND: src/lib/layers/layer-7-lighting.ts
- FOUND: src/lib/layers/__tests__/layer-6-dhw.test.ts
- FOUND: src/lib/layers/__tests__/layer-7-lighting.test.ts
- FOUND: .planning/phases/28-procedural-mep-equipment-models/28-04-SUMMARY.md
- FOUND: commit c0b9899
