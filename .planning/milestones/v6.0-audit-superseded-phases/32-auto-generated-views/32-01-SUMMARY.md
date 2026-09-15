---
phase: 32
plan: "01"
subsystem: bim-views
tags: [views, camera, clipping-planes, zustand, three.js, pure-functions]
dependency_graph:
  requires: [building-geometry.ts, FloorGeometry, THREE.Box3, zustand]
  provides: [view-definition types, view-engine pure functions, view-store]
  affects: [future view-switcher UI, scene-controls integration, building-scene.tsx]
tech_stack:
  added: []
  patterns: [discriminated union for ViewKind, serialisable camera state, Zustand persist partialize]
key_files:
  created:
    - src/lib/bim/views/view-definition.ts
    - src/lib/bim/views/view-engine.ts
    - src/lib/bim/views/view-store.ts
    - src/lib/bim/views/__tests__/view-engine.test.ts
  modified: []
decisions:
  - Clipping planes stored as serialisable descriptors (normal + constant) not THREE.Plane objects — enables persist without circular refs
  - CameraState discriminated on kind (ortho/persp) to keep ortho and perspective cameras type-safe
  - computeDefaultViewsForBuilding returns N plan views + 4 elevation views; section views are user-created only
  - applyViewToCamera mutates camera directly (no React state) to stay compatible with R3F useFrame pattern
  - view-store partialises only views + activeViewId (actions are not serialised)
metrics:
  duration: "~15 min"
  completed: "2026-04-12"
  tasks_completed: 4
  files_created: 4
  tests_passing: 25
---

# Phase 32 Plan 01: View Engine Pure Module + View Store Summary

**One-liner:** Serialisable plan/elevation/section view definitions with ortho-camera + dual clipping-plane generation from FloorGeometry + THREE.Box3, backed by a Zustand persist store.

## What Was Built

### `src/lib/bim/views/view-definition.ts`

Type layer only — no runtime logic:

- `ViewKind = "plan" | "elevation" | "section" | "3d"`
- `OrthoCameraState` / `PerspCameraState` — fully serialisable (tuple positions, no THREE objects)
- `ClippingPlaneDescriptor` — `{ normal: [x,y,z], constant }` mirrors THREE.Plane but JSON-safe
- `PlanView`, `ElevationView`, `SectionView`, `PerspectiveView` — each extends `ViewBase` with kind-specific fields
- `ViewDefinition` — discriminated union of all four
- `toThreePlane()` helper to reconstruct a THREE.Plane at render time

### `src/lib/bim/views/view-engine.ts`

Pure functions, no React:

- `createPlanView(level)` — orthographic top camera 100 m above level; lower clip plane at `elevation` (normal +Y, constant `-elevation`); upper clip at `elevation + height` (normal -Y)
- `createElevationView(side, bbox)` — orthographic side camera positioned at cardinal standoff; zoom fits building size + 15% padding; named South/North/West/East
- `createSectionView(plane, bbox)` — camera on normal-side at standoff; single clip plane serialised as descriptor
- `applyViewToCamera(view, camera, orbitControls?)` — mutates THREE.Camera position/projection + OrbitControls target; safe to call from useFrame/useEffect
- `computeDefaultViewsForBuilding(floors, bbox)` — returns `[...planViews, ...elevationViews]` sorted ground-up; generates N+4 entries for N floors

### `src/lib/bim/views/view-store.ts`

Zustand store with `persist` middleware:

- State: `views: ViewDefinition[]`, `activeViewId: string | null`
- `addView` — idempotent (skips duplicate ids)
- `removeView` — clears activeViewId if removed view was active
- `setActiveView(id | null)` — null = free-camera mode
- `initializeDefaultViews(floors, bbox)` — replaces auto-generated views (`plan-*`, `elev-*`), preserves user-created views (section cuts etc.); validates activeViewId still exists
- Persisted under key `bim-view-store`; partialises `views` + `activeViewId` only

### `src/lib/bim/views/__tests__/view-engine.test.ts`

25 tests across 4 describe blocks:

| Describe | Tests |
|---|---|
| createPlanView | 6 — kind, camera direction, lower clip constant, upper clip constant, levelElevation/Height, near < far |
| createElevationView | 7 — kind, front/back/left/right positions, target Y, near < far, zoom ≥ half height |
| createSectionView | 4 — kind, cut plane descriptor, clippingPlanes length, camera on normal side |
| computeDefaultViewsForBuilding | 8 — N+4 count (5/1/10 floor cases), all plan kinds, 4 elevation sides, sorted ground-up, lower bound matches elevation |

All 25 pass. Zero type errors in new files (pre-existing test type errors in unrelated files are out of scope).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this is a pure engine module with no UI rendering paths.

## Threat Flags

None — no new network endpoints, auth paths, file access, or schema changes.

## Self-Check

Created files:
- `src/lib/bim/views/view-definition.ts` — FOUND
- `src/lib/bim/views/view-engine.ts` — FOUND
- `src/lib/bim/views/view-store.ts` — FOUND
- `src/lib/bim/views/__tests__/view-engine.test.ts` — FOUND

Tests: 25 passed (1 test file)
Type errors in new files: 0

## Self-Check: PASSED
