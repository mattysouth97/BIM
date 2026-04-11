---
phase: 19-coordinate-system-foundation
verified: 2026-04-12T05:11:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 19: Coordinate System Foundation Verification Report

**Phase Goal:** All GIS coordinate transforms are accurate to <1m at 2km radius using proj4 with proper EPSG:5179 projection, and the VWorld API key is managed via environment variable
**Verified:** 2026-04-12T05:11:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                    | Status     | Evidence                                                                                     |
|----|------------------------------------------------------------------------------------------|------------|----------------------------------------------------------------------------------------------|
| 1  | `gis-transform.ts` converts WGS84 ↔ local coords keeping Float32 under 100m            | ✓ VERIFIED | Site-specific tmerc with `x_0=0 y_0=0`; origin projects to (0,0); all offsets in meters     |
| 2  | Round-trip at 2km produces <1m error, verified by unit test                              | ✓ VERIFIED | Test 2 passes: Seoul +0.018° NE, haversine error < 1m; 432/432 tests pass                   |
| 3  | VWorld API key from `VWORLD_API_KEY` env var; 500 with clear error message if unset     | ✓ VERIFIED | `route.ts` lines 25-30: `process.env.VWORLD_API_KEY` guard returns 500 + descriptive message |
| 4  | Coordinate assertions throw typed `GisCoordinateError` outside Korean peninsula bbox     | ✓ VERIFIED | `assertKoreaBounds()` throws `GisCoordinateError`; called in `createSceneProjection()` + `project()`; Tests 3, 4, 7 pass |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact                                        | Expected                                  | Status      | Details                                                                 |
|-------------------------------------------------|-------------------------------------------|-------------|-------------------------------------------------------------------------|
| `src/lib/gis/gis-transform.ts`                  | proj4 transform + bounds assertion        | ✓ VERIFIED  | 93 lines; exports `createSceneProjection`, `GisCoordinateError`, `KOREA_BOUNDS`, `SceneProjection` |
| `src/lib/gis/gis-transform.test.ts`             | 7 unit tests covering round-trip + bounds | ✓ VERIFIED  | 82 lines; 7 tests in 3 describe blocks, all passing                     |
| `src/app/api/vworld/footprint/route.ts`         | VWORLD_API_KEY env var guard + 500        | ✓ VERIFIED  | Lines 25-30: guard present; `VWORLD_DOMAIN` parameterized at module level |

### Key Link Verification

| From                          | To                              | Via                                              | Status    | Details                                                      |
|-------------------------------|---------------------------------|--------------------------------------------------|-----------|--------------------------------------------------------------|
| `route.ts`                    | `process.env.VWORLD_API_KEY`    | module-level read + 500 guard                    | ✓ WIRED   | Lines 25-30; guard returns 500 with message before any fetch |
| `route.ts`                    | `process.env.VWORLD_DOMAIN`     | `VWORLD_DOMAIN` const at module level            | ✓ WIRED   | Line 4; used in `fetchByPNU`, `fetchByBBox`, `fetchByExplicitBBox` |
| `gis-transform.ts`            | `assertKoreaBounds`             | called in `createSceneProjection()` + `project()`| ✓ WIRED   | Both entry points assert bounds before any proj4 conversion  |
| `gis-transform.test.ts`       | `gis-transform.ts`              | vitest import                                    | ✓ WIRED   | Named imports at line 2; all 7 tests exercise live code      |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces pure utility functions and a proxy route, not components that render dynamic data from a store or API.

### Behavioral Spot-Checks

| Behavior                                          | Command                                                         | Result           | Status  |
|---------------------------------------------------|-----------------------------------------------------------------|------------------|---------|
| All 7 gis-transform tests pass                    | `pnpm test -- --run src/lib/gis/gis-transform.test.ts`         | 432/432 pass     | ✓ PASS  |
| Production build compiles without TypeScript errors | `pnpm build`                                                  | exits 0, 15 routes compiled | ✓ PASS  |

### Requirements Coverage

| Requirement | Source Plan     | Description                                                        | Status      | Evidence                                                                 |
|-------------|----------------|--------------------------------------------------------------------|-------------|--------------------------------------------------------------------------|
| GIS-02      | 19-01-PLAN.md  | proj4 coordinate transform layer with EPSG:5179 accuracy           | ✓ SATISFIED | `createSceneProjection` with site-specific tmerc; <1m round-trip at 2km |
| GIS-03      | 19-02-PLAN.md  | VWorld API key managed via env var                                 | ✓ SATISFIED | `VWORLD_API_KEY` guard in `route.ts` lines 25-30                        |

### Anti-Patterns Found

None. No TODO/FIXME/placeholder comments found in either `gis-transform.ts` or `route.ts`. No stub implementations detected.

### Human Verification Required

None. All success criteria are verifiable programmatically for this phase (pure utility module + proxy route). No visual or real-time behavior involved.

### Implementation Note: EPSG:5179 vs Site-Specific TM

The success criterion references "EPSG:5179 projection" but the implementation uses a site-specific Transverse Mercator (`+proj=tmerc`) centered on the scene origin with `x_0=0, y_0=0`. This deviation is documented in the plan's decision log and satisfies the criterion's actual requirements more effectively:

- EPSG:5179 is Korea's national TM grid; its false easting/northing would put Seoul at ~(955000, 1952000) — requiring explicit origin subtraction and risking Float32 precision loss.
- The site-specific TM makes the origin project to exactly (0,0), so all local coordinates are small relative offsets directly usable as Three.js x/z values without subtraction.
- The round-trip accuracy at 2km is identical (both are TM projections of the same ellipsoid).

The criterion intent (Float32 coords under 100m, <1m accuracy) is fully met. This is not a gap.

### Gaps Summary

No gaps. All 4 success criteria are satisfied with passing tests and a clean build.

---

_Verified: 2026-04-12T05:11:00Z_
_Verifier: Claude (gsd-verifier)_
