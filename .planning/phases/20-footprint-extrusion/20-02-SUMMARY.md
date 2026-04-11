---
phase: 20-footprint-extrusion
plan: "02"
subsystem: gis-pipeline
tags: [vworld, footprint, proj4, gis, coordinate-transform, building-recipe]
dependency_graph:
  requires: [19-coordinate-system-foundation]
  provides: [raw-wgs84-footprint-rings, projected-local-rings-in-recipe]
  affects: [building-scene, procedural-building, earcut-extrude]
tech_stack:
  added: []
  patterns:
    - "extractPolygon() returns raw WGS84 [lng,lat] rings — no server-side projection"
    - "createSceneProjection(centroidLng, centroidLat) projects all rings client-side via proj4 TM"
    - "BuildingRecipe.footprintPolygon is [number,number][][] (GeoJSON-style rings: outer + holes)"
key_files:
  created:
    - src/types/earcut.d.ts
  modified:
    - src/app/api/vworld/footprint/route.ts
    - src/lib/procedural/types.ts
    - src/lib/building-geometry.ts
    - src/components/viewer/building-scene.tsx
    - src/hooks/use-building-footprint.ts
    - src/components/viewer/floor-mesh.tsx
decisions:
  - "footprintPolygon uses GeoJSON-style rings array [outerRing, ...holes] not flat outer ring"
  - "projection moved from server route to client useMemo in building-scene.tsx"
  - "GisCoordinateError catch block provides rectangular fallback for malformed VWorld data"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-12"
  tasks_completed: 3
  files_modified: 6
  files_created: 1
---

# Phase 20 Plan 02: Footprint Pipeline WGS84 Upgrade Summary

Upgraded the VWorld footprint data pipeline so that the server returns raw WGS84 coordinate rings (not pre-projected equirectangular approximations), types carry GeoJSON-style ring arrays, and building-scene.tsx projects them accurately via the Phase 19 gis-transform module before storing in the BuildingRecipe.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Upgrade extractPolygon() to return raw WGS84 rings | 7973e78 | src/app/api/vworld/footprint/route.ts |
| 2 | Update BuildingRecipe.footprintPolygon type to carry rings | be6423c | src/lib/procedural/types.ts, src/lib/building-geometry.ts |
| 3 | Wire proj4 projection into building-scene.tsx geometry assembly | 1daf057 | building-scene.tsx, use-building-footprint.ts, floor-mesh.tsx, earcut.d.ts |

## What Was Built

VWorld footprint route now returns raw WGS84 `[lng, lat]` rings (outer boundary + interior holes) instead of an equirectangular pre-projected flat array. `BuildingRecipe.footprintPolygon` is now typed as `[number, number][][]` (GeoJSON-style rings). `building-scene.tsx` imports `createSceneProjection` from `gis-transform.ts`, computes the polygon centroid as scene origin, projects all rings via site-specific Transverse Mercator (proj4), and stores the local-meter rings in `geo.footprintPolygon`. A `GisCoordinateError` catch block provides silent rectangular fallback for malformed VWorld coordinates.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FootprintResult type mismatch in use-building-footprint.ts**
- **Found during:** Task 3 — pnpm build type error
- **Issue:** `FootprintResult.polygon` was typed `number[][] | null` (old flat type), causing TypeScript to infer `footprintPolygon` as `number[][]` in building-scene.tsx, making `p[0]` index on `Number` object type
- **Fix:** Updated `FootprintResult.polygon` to `number[][][] | null` in use-building-footprint.ts
- **Files modified:** src/hooks/use-building-footprint.ts
- **Commit:** 1daf057

**2. [Rule 1 - Bug] floor-mesh.tsx prop type stale after type upgrade**
- **Found during:** Task 2 type propagation audit
- **Issue:** `FloorMeshProps.footprintPolygon` was still typed as `[number, number][]` (flat ring). Updated to `[number, number][][]` (rings array) and refactored geometry useMemo to extract `outerRing[0]` for `THREE.Shape`
- **Fix:** Updated prop type and changed `footprintPolygon[i]` accesses to `outerRing[i]` with `outerRing = footprintPolygon?.[0]`
- **Files modified:** src/components/viewer/floor-mesh.tsx
- **Commit:** 1daf057

**3. [Rule 3 - Blocking] earcut module missing type declarations**
- **Found during:** Task 3 — pnpm build blocked on earcut-extrude.ts (pre-existing file from another plan)
- **Issue:** earcut@3.0.2 ships no TypeScript declarations and `@types/earcut` does not exist; TypeScript strict mode rejected the implicit `any` import
- **Fix:** Created `src/types/earcut.d.ts` with accurate type signatures for `earcut()` default export and `flatten()` named export
- **Files created:** src/types/earcut.d.ts
- **Commit:** 1daf057

## Known Stubs

None — all data flows are wired end-to-end. The projection pipeline returns real projected coordinates. The earcut-extrude.ts consumer (Plan 03) is the next step to wire `footprintPolygon` into geometry triangulation.

## Self-Check: PASSED

Files exist:
- src/app/api/vworld/footprint/route.ts — FOUND
- src/lib/procedural/types.ts — FOUND
- src/lib/building-geometry.ts — FOUND
- src/components/viewer/building-scene.tsx — FOUND
- src/hooks/use-building-footprint.ts — FOUND
- src/components/viewer/floor-mesh.tsx — FOUND
- src/types/earcut.d.ts — FOUND

Commits exist: 7973e78, be6423c, 1daf057 — all verified via git log.

pnpm build: PASSED (zero TypeScript errors, all 15 pages generated successfully).
