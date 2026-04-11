---
phase: 20-footprint-extrusion
plan: "03"
subsystem: procedural-building
tags: [polygon, extrusion, earcut, three.js, facade, slab, instanced-mesh]
dependency_graph:
  requires: [20-01-earcut-extrude, 20-02-footprint-pipeline]
  provides: [polygon-shaped-buildings, polygon-facade-wrapping]
  affects: [building-scene.tsx, procedural-building-model.tsx]
tech_stack:
  added: []
  patterns:
    - "generateSlabs() dual-path: Group of extrudePolygon meshes (polygon) vs InstancedMesh (rectangular)"
    - "getPolygonFaces() derives FaceDesc[] from outer ring edges for N-edge facade instancing"
    - "footprintPolygon guard: && footprintPolygon.length >= 1 && footprintPolygon[0].length >= 3"
    - "all polygon faces use side: 'front' — no side-ratio (0.6×) reduction for arbitrary edges"
key_files:
  created: []
  modified:
    - src/lib/procedural/structure-generator.ts
    - src/lib/procedural/facade-generator.ts
    - src/lib/procedural/procedural-building.ts
decisions:
  - "generateSlabs() return type widened to InstancedMesh | Group — Group used for polygon path, InstancedMesh preserved for rectangular fallback"
  - "polygon slab Group uses one Mesh per floor (not InstancedMesh) because each floor has a unique geometry from extrudePolygon()"
  - "getPolygonFaces() treats all edges as side='front' to prevent 0.6× side-ratio reduction on arbitrary polygon perimeter edges"
  - "getSlabMesh() return type widened to InstancedMesh | Group | null; getFloorFromInstanceId() handles both via same instanceToFloor Map"
  - "generateColumns() and generateRoof() unchanged — rectangular column grid and bbox roof are acceptable for v4.0 (polygon variants deferred to v4.1 per ARCHITECTURE.md)"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-12"
  tasks_completed: 3
  files_modified: 3
  files_created: 0
---

# Phase 20 Plan 03: Polygon Extrusion Integration Summary

**One-liner:** Wired `extrudePolygon()` and `getPolygonFaces()` into all three procedural generators so buildings with `footprintPolygon` in their recipe render as real cadastral polygon masses with facade glass/mullion strips wrapping each polygon edge.

## What Was Built

### structure-generator.ts — generateSlabs() polygon path

Added `import { extrudePolygon } from "@/lib/gis/earcut-extrude"` and a polygon branch at the top of `generateSlabs()`:

- When `recipe.footprintPolygon` is present (outer ring has ≥ 3 vertices), returns a `THREE.Group` containing one `THREE.Mesh` per floor, each with geometry from `extrudePolygon(footprintPolygon, slab.thickness, floor.y)`.
- The `instanceToFloor` Map is preserved on `group.userData` for `getFloorFromInstanceId()` compatibility.
- The original `THREE.InstancedMesh` rectangular path is fully preserved as the fallback (no changes to that code path).
- Return type widened to `THREE.InstancedMesh | THREE.Group`.

### facade-generator.ts — getPolygonFaces() + routing

Added `getPolygonFaces(outerRing, wallThickness)` function that:

- Iterates consecutive outer ring vertex pairs (n-1 edges, skipping degenerate edges < 0.1 m)
- Computes edge midpoint, length, outward normal, and rotation angle per edge
- Returns a `FaceDesc[]` with `side: "front"` on all entries (prevents 0.6× side-ratio reduction)
- Each polygon edge feeds through the same InstancedMesh instancing pipeline as rectangular faces

Changed the faces selection in `generateFacade()`:
```typescript
const faces = recipe.footprintPolygon && recipe.footprintPolygon[0]?.length >= 3
  ? getPolygonFaces(recipe.footprintPolygon[0], wallThickness)
  : getFaces(footprintWidth, footprintDepth, wallThickness);
```

### procedural-building.ts — getSlabMesh() + getFloorFromInstanceId()

- `getSlabMesh()` return type widened to `THREE.InstancedMesh | THREE.Group | null`
- `getFloorFromInstanceId()` now branches on `instanceof THREE.InstancedMesh` vs `instanceof THREE.Group`, reads the `instanceToFloor` Map from `userData` in both cases
- `generate()` unchanged — it calls `generateSlabs()`, `generateColumns()`, `generateFacade()`, `generateRoof()` in sequence; polygon routing is handled inside each generator
- `dispose()` unchanged — `group.traverse()` already visits both `InstancedMesh` and `Mesh` children

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Polygon slab geometry in structure-generator.ts | 93b07d7 | src/lib/procedural/structure-generator.ts |
| 2 | Polygon-edge facade faces in facade-generator.ts | 93b07d7 | src/lib/procedural/facade-generator.ts |
| 3 | Wire polygon path in procedural-building.ts | 93b07d7 | src/lib/procedural/procedural-building.ts |

## Verification Results

- `pnpm build`: PASSED — zero TypeScript errors, 15 pages generated
- `pnpm test -- --run`: PASSED — 443/443 tests across 34 test files
- `footprintPolygon` routing confirmed present in all three generators
- `earcut-extrude` import confirmed in structure-generator.ts

## Deviations from Plan

None — plan executed exactly as written. The three targeted changes matched the plan specifications exactly. No additional fixes required.

## Known Stubs

None. The polygon path is fully wired end-to-end:
- earcut-extrude.ts (Plan 01) triangulates polygon rings
- footprint/route.ts + building-scene.tsx (Plan 02) project WGS84 rings into recipe
- structure-generator.ts (this plan) extrudes per-floor slab caps from the polygon
- facade-generator.ts (this plan) wraps polygon edges with glass/mullion instances
- ProceduralBuilding (this plan) routes to polygon or rectangular path automatically

The only deferred items are polygon columns and polygon roof — both explicitly scoped out as v4.1 work per ARCHITECTURE.md.

## Self-Check: PASSED

Files exist:
- src/lib/procedural/structure-generator.ts — FOUND
- src/lib/procedural/facade-generator.ts — FOUND
- src/lib/procedural/procedural-building.ts — FOUND

Commit `93b07d7` — verified via git log.

pnpm build: PASSED (zero errors, 15 pages).
pnpm test: PASSED (443/443).
