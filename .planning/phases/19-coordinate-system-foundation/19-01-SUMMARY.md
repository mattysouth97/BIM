---
phase: 19-coordinate-system-foundation
plan: "01"
subsystem: gis
tags: [proj4, coordinate-transform, tdd, vitest, gis]
dependency_graph:
  requires: []
  provides:
    - src/lib/gis/gis-transform.ts
  affects:
    - src/app/api/vworld/footprint/route.ts
tech_stack:
  added:
    - proj4@2.20.8
  patterns:
    - site-specific Transverse Mercator (tmerc) centered on scene origin
    - EPSG:4326 → custom TM projection via proj4 converter
    - typed domain errors (GisCoordinateError extends Error)
key_files:
  created:
    - src/lib/gis/gis-transform.ts
    - src/lib/gis/gis-transform.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml
decisions:
  - "Used site-specific Transverse Mercator (not EPSG:5179) centered on building centroid — keeps Three.js coords under 100m with zero manual subtraction"
  - "unproject() does not assert KOREA_BOUNDS on output — small local offsets from a valid origin are always in-bounds; asserting would break Test 5"
  - "GisCoordinateError constructor takes (lng, lat) matching the argument order of project(lng, lat) for consistency"
metrics:
  duration: "2 minutes"
  completed: "2026-04-12"
  tasks_completed: 3
  files_created: 2
  files_modified: 2
---

# Phase 19 Plan 01: GIS Coordinate Transform Module Summary

**One-liner:** proj4 site-specific Transverse Mercator projection centered on building centroid, with Korean peninsula bounds assertion and <1m round-trip accuracy at 2km radius.

## What Was Built

`src/lib/gis/gis-transform.ts` is the coordinate system foundation for all GIS phases (20, 21). It exports:

- `createSceneProjection(originLng, originLat)` — returns a `SceneProjection` with `project()`, `unproject()`, and `origin`
- `GisCoordinateError` — typed error thrown when WGS84 coordinates are outside the Korean peninsula bounding box
- `KOREA_BOUNDS` — readonly const `{ minLat: 33, maxLat: 43, minLng: 124, maxLng: 132 }`
- `SceneProjection` — TypeScript interface for the returned projection object

The projection uses a site-specific Transverse Mercator (`+proj=tmerc`) centered on the scene origin with `x_0=0 y_0=0`, so the origin projects to `(0, 0)` and all local coordinates are in meters relative to it — directly usable as Three.js `x` and `z` values without additional arithmetic.

## Test Results

7 tests pass across 3 describe blocks:

| Test | Description | Result |
|------|-------------|--------|
| 1 | Origin projects to [~0, ~0] | PASS |
| 2 | 2km NE round-trip error < 1m | PASS |
| 3 | Out-of-bounds lng (100) throws GisCoordinateError | PASS |
| 4 | Out-of-bounds lat (20) throws GisCoordinateError | PASS |
| 5 | unproject(50, 50) returns coords inside KOREA_BOUNDS | PASS |
| 6 | GisCoordinateError has correct name and message | PASS |
| 7 | createSceneProjection throws on out-of-bounds origin | PASS |

Total suite: 432 tests pass (33 test files).

## Commits

| Hash | Message |
|------|---------|
| `d9222ef` | feat(19-01): proj4 site-specific TM projection + vitest round-trip accuracy tests |

## Deviations from Plan

None — plan executed exactly as written. The implementation matches the pseudocode in `<implementation>` verbatim. TDD RED→GREEN→(no refactor needed) cycle completed in sequence.

## Known Stubs

None. This is a pure utility module with no UI rendering or data stubs.

## Self-Check: PASSED

- `src/lib/gis/gis-transform.ts` — exists
- `src/lib/gis/gis-transform.test.ts` — exists
- `package.json` — proj4@2.20.8 in dependencies
- Commit `d9222ef` — verified in git log
- `pnpm test` — 432/432 pass
- `pnpm build` — exits 0, no TypeScript errors
