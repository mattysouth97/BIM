---
phase: 11-room-boundaries-3d-extrusion
plan: "01"
subsystem: plan-store + room-detection
tags: [room-detection, floor-plan, zustand, vitest, tdd, three-bvh-csg]
dependency_graph:
  requires: []
  provides:
    - src/lib/plan/room-detector.ts
    - src/lib/plan/room-types.ts
    - src/store/plan-store.ts (extended)
  affects:
    - All phase 11 plans (room visualization, floor slabs, door/window placement)
tech_stack:
  added:
    - three-bvh-csg@0.0.18
    - three-mesh-bvh@0.9.9
  patterns:
    - Minimal face extraction via most-clockwise DFS traversal
    - CW winding = interior room faces; CCW = outer boundary (excluded)
    - Endpoint merging O(n^2) within SNAP_EPS=0.05m
    - TDD: RED (failing tests) -> GREEN (implementation) per task
key_files:
  created:
    - src/lib/plan/room-types.ts
    - src/lib/plan/room-detector.ts
    - src/lib/plan/room-detector.test.ts
  modified:
    - src/store/plan-store.ts
    - src/store/__tests__/plan-store.test.ts
    - package.json
    - pnpm-lock.yaml
decisions:
  - CW winding (negative signed shoelace area) identifies interior room faces in XZ plane
  - Most-clockwise DFS traversal produces interior faces as CW, outer boundary as CCW
  - polygonCentroid uses arithmetic mean of vertices (not area-weighted) for simplicity
  - copyFloor uses crypto.randomUUID() for new IDs
metrics:
  duration: 270s
  completed_date: "2026-03-28"
  tasks_completed: 2
  files_changed: 7
---

# Phase 11 Plan 01: Room Detection Foundation Summary

Foundation layer for room boundaries and 3D extrusion: pure TypeScript room detection algorithm, room type constants with Korean labels, and extended plan-store with room/opening/floor management state.

## What Was Built

**`src/lib/plan/room-types.ts`** — ROOM_TYPES constant with 5 room types (living/bedroom/kitchen/bathroom/custom), each with English name, Korean nameKo label, and hex color. RoomType union type exported.

**`src/lib/plan/room-detector.ts`** — Room detection algorithm with 5 pure function exports:
- `buildWallGraph`: Converts WallSegments to planar graph, merging endpoints within SNAP_EPS=0.05m via O(n^2) scan, builds bidirectional adjacency
- `detectRooms`: Minimal face extraction using "most clockwise next edge" DFS. Interior rooms have CW winding (negative signed shoelace area); outer boundary is CCW (excluded)
- `polygonArea`: Absolute shoelace formula area
- `polygonCentroid`: Arithmetic mean of vertices
- `projectOntoWall`: Parametric projection onto wall segment, t clamped to [0,1]

**`src/store/plan-store.ts`** — Extended with:
- New exported interfaces: `Opening`, `Room`
- New state fields: `openings`, `rooms`, `floorHeights`, `floorCount`, `drawingMode`
- 8 new actions: `addOpening`, `removeOpening`, `setRooms`, `setRoomType`, `setFloorHeight`, `setFloorCount`, `copyFloor`, `setDrawingMode`

**Dependencies installed:** `three-bvh-csg@0.0.18`, `three-mesh-bvh@0.9.9` (required for Plan 03 CSG operations)

## Test Results

- `room-detector.test.ts`: 17 tests passing (buildWallGraph, detectRooms, polygonArea, polygonCentroid, projectOntoWall)
- `plan-store.test.ts`: 22 tests passing (8 original + 14 new)
- Total: 39 tests, 0 failures
- `pnpm build`: Compiled successfully, TypeScript clean, no type errors

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 RED  | 73cc93c | test(11-01): add failing tests for room detection algorithm |
| Task 1 GREEN | 38237b3 | feat(11-01): implement room detection algorithm + room types + install dependencies |
| Task 2 | fa49b5e | feat(11-01): extend plan-store with rooms, openings, floor management, drawing mode |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed CCW/CW winding convention for room face detection**
- **Found during:** Task 1 GREEN (test `two adjacent rooms → returns 2 rooms` failed)
- **Issue:** Initial implementation kept CCW faces (positive area) as interior rooms, but the "most clockwise" DFS traversal actually produces interior faces with CW winding (negative signed area) in XZ space
- **Fix:** Swapped the convention: keep faces with `signedArea < 0` (CW = interior rooms), discard `signedArea >= 0` (CCW = outer boundary)
- **Files modified:** `src/lib/plan/room-detector.ts`
- **Commit:** 38237b3

**2. [Rule 1 - Bug] Fixed contradictory test assertion in copyFloor test**
- **Found during:** Task 2 tests run
- **Issue:** Test said `expect(allIds).not.toContain("wall-1")` but the original wall-1 legitimately remains on floor 0 after copy — the test comment itself acknowledged this was wrong
- **Fix:** Removed the incorrect assertion, replaced with `floor1Walls[0].id !== "wall-1"` check
- **Files modified:** `src/store/__tests__/plan-store.test.ts`
- **Commit:** fa49b5e

## Known Stubs

None — all exported functions are fully implemented and tested.

## Self-Check: PASSED

- src/lib/plan/room-types.ts: FOUND
- src/lib/plan/room-detector.ts: FOUND
- src/lib/plan/room-detector.test.ts: FOUND
- src/store/plan-store.ts: FOUND (modified)
- src/store/__tests__/plan-store.test.ts: FOUND (modified)
- Commit 73cc93c: FOUND
- Commit 38237b3: FOUND
- Commit fa49b5e: FOUND
