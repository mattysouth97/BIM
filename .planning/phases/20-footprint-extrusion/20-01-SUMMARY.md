---
phase: 20-footprint-extrusion
plan: "01"
subsystem: gis
tags: [earcut, triangulation, geometry, tdd, three.js]
dependency_graph:
  requires: []
  provides: [extrudePolygon]
  affects: [procedural-building.ts, structure-generator.ts]
tech_stack:
  added: [earcut@3.0.2]
  patterns: [earcut.flatten named-export, signed-area winding normalisation, BufferGeometry index buffer]
key_files:
  created:
    - src/lib/gis/earcut-extrude.ts
    - src/lib/gis/earcut-extrude.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml
decisions:
  - earcut 3.x exports flatten as a named export (not earcut.flatten) — use `import earcut, { flatten as earcutFlatten } from "earcut"`
  - earcut returns CW winding in XZ plane (viewed from +Y), giving downward normals — bottom cap uses raw indices, top cap reverses them
  - Separate vertex ranges for bottom cap / top cap / side quads to allow clean index buffer construction
metrics:
  duration: "~15 minutes"
  completed: "2026-04-12"
  tasks: 1
  files: 4
---

# Phase 20 Plan 01: earcut-extrude pure utility Summary

**One-liner:** `extrudePolygon()` pure function converting GeoJSON polygon rings (XZ meter-space) to a Three.js BufferGeometry via earcut triangulation, with correct cap winding for up/down normals and side quads for each outer edge.

## What Was Built

`src/lib/gis/earcut-extrude.ts` provides a single named export:

```typescript
export function extrudePolygon(
  rings: [number, number][][],  // [outerRing, ...holes] — each point [x, z] local meters
  heightMeters: number,
  baseY: number = 0,
): THREE.BufferGeometry
```

The function:
1. Normalises ring winding (signed area check ensures CCW outer, CW holes)
2. Calls `earcutFlatten()` then `earcut()` for cap triangulation
3. Constructs a flat position buffer: bottom cap vertices → top cap vertices → side quad vertices
4. Builds an index buffer: bottom cap (raw earcut = CW in XZ = downward normal) + top cap (reversed = upward normal) + side quads (2 triangles per outer edge)
5. Calls `geo.computeVertexNormals()` for smooth side face lighting

## Tests

All 11 vitest tests pass across 4 suites:
- Test 1: convex quad (rectangle) — index non-null, no NaN
- Test 2: L-shaped concave polygon — index non-zero, bottom cap -Y normal
- Test 3: polygon with interior hole — fewer triangles than solid, non-zero index
- Test 4: winding order — top cap at heightMeters, bottom cap at baseY, baseY offset

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] earcut 3.x flatten is a named export, not a method**
- **Found during:** GREEN phase first test run
- **Issue:** Plan referenced `earcut.flatten(...)` but earcut 3.x exports `flatten` as a named export: `import earcut, { flatten as earcutFlatten } from "earcut"`. Calling `earcut.flatten` throws `TypeError: default.flatten is not a function`.
- **Fix:** Changed import to `import earcut, { flatten as earcutFlatten } from "earcut"` and updated call site to `earcutFlatten(...)`.
- **Files modified:** `src/lib/gis/earcut-extrude.ts`
- **Commit:** 5bba38e

**2. [Rule 1 - Bug] Bottom cap winding was inverted**
- **Found during:** GREEN phase — Test 2 bottom cap normal check failed (got +12, expected < 0)
- **Issue:** Plan stated "reverse earcut winding for bottom cap" but earcut already returns CW winding in the XZ plane (viewed from +Y axis), which naturally produces a downward-facing normal. Reversing it produced an upward normal on the bottom cap.
- **Fix:** Bottom cap uses raw earcut indices; top cap reverses them. Verified via Node.js cross-product diagnostic.
- **Files modified:** `src/lib/gis/earcut-extrude.ts`
- **Commit:** 5bba38e

## Known Stubs

None — extrudePolygon is fully implemented and wired to the test suite.

## Self-Check: PASSED

- `src/lib/gis/earcut-extrude.ts` — exists
- `src/lib/gis/earcut-extrude.test.ts` — exists
- Commit `3e4d735` (RED: failing tests) — present
- Commit `5bba38e` (GREEN: implementation) — present
- `pnpm build` — exit code 0, no TypeScript errors
- `pnpm vitest run src/lib/gis/earcut-extrude.test.ts` — 11/11 passed
