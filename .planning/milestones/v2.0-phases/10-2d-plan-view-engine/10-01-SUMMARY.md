---
phase: 10-2d-plan-view-engine
plan: 01
subsystem: viewer
tags: [three.js, r3f, orthographic-camera, plan-view, wall-drawing, zustand]

requires:
  - phase: 08-bim-authoring-tools
    provides: authoring store, edit mode toggle, scene controls
provides:
  - Zustand plan-store with wall segments, view mode, drawing state
  - Orthographic plan view camera with scroll zoom
  - Grid overlay with configurable spacing
  - Two-point wall drawing tool with ground plane raycasting
  - Walls rendered in 2D (flat boxes) and 3D (extruded BoxGeometry)
  - Plan View toggle button and floor/grid controls in toolbar
affects: [10-02, viewer, building-scene]

tech-stack:
  added: []
  patterns: [orthographic camera swap via useThree().set, ground plane raycasting for drawing tools, primitive wrapper for Three.js Line to avoid SVG type collision]

key-files:
  created:
    - src/store/plan-store.ts
    - src/components/viewer/plan-view.tsx
    - src/components/viewer/plan-grid.tsx
    - src/components/viewer/wall-drawer.tsx
  modified:
    - src/components/viewer/building-scene.tsx
    - src/components/viewer/viewer-overlay.tsx
    - src/components/viewer/scene-controls.tsx

key-decisions:
  - "Use separate Zustand store (plan-store) rather than extending authoring-store for clean separation of plan view concerns"
  - "OrthographicCamera created imperatively and swapped via useThree().set() for reliable camera switching"
  - "Walls stored as start/end XZ coordinates with thickness/height, rendered differently per view mode"
  - "Wrapped THREE.Line in primitive component to avoid R3F JSX <line> type collision with SVG"

patterns-established:
  - "Camera swap pattern: save perspective camera ref, set ortho via useThree, restore on mode change"
  - "Ground plane raycasting: THREE.Plane(0,1,0) + ray.intersectPlane for 2D click coordinates"

requirements-completed: [PLAN-01, PLAN-05]

duration: 5min
completed: 2026-03-28
---

# Phase 10 Plan 01: Plan View Camera + Wall Drawing Tool Summary

**Orthographic plan view with grid overlay, two-point wall drawing tool, and 2D/3D wall rendering via Zustand plan-store**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-28T00:03:06Z
- **Completed:** 2026-03-28T00:08:25Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Zustand plan-store managing walls, viewMode, drawingWall state, activeFloor, and gridSize
- OrthographicCamera top-down view with scroll zoom and perspective camera restore
- Grid overlay (50m, configurable 0.1/0.5/1.0m spacing) with fine + major lines
- Click-to-draw wall tool: first click sets start, second click creates wall segment
- Walls render as flat colored boxes in plan view, extruded 3D boxes with shadows in 3D view
- Toolbar integration: plan view toggle, floor selector (1F-5F), grid size picker, wall draw indicator
- OrbitControls rotation and zoom disabled in plan view

## Task Commits

Each task was committed atomically:

1. **Task 1: Plan store and plan view camera** - `f63d46c` (feat)
2. **Task 2: Grid overlay and wall drawing tool** - `916ca96` (feat)
3. **Task 3: Integrate into building-scene and toolbar** - `d513df4` (feat)

## Files Created/Modified
- `src/store/plan-store.ts` - Zustand store for walls, viewMode, drawingWall, activeFloor, gridSize
- `src/components/viewer/plan-view.tsx` - Orthographic camera switching and scroll zoom
- `src/components/viewer/plan-grid.tsx` - GridHelper with fine + major grid lines
- `src/components/viewer/wall-drawer.tsx` - Two-point wall drawing with raycasting, preview line, 2D/3D wall rendering
- `src/components/viewer/building-scene.tsx` - Added PlanView, PlanGrid, WallDrawer to Canvas
- `src/components/viewer/viewer-overlay.tsx` - Plan view toggle, floor selector, grid size, draw indicator
- `src/components/viewer/scene-controls.tsx` - Disable rotation/zoom in plan mode

## Decisions Made
- Used separate Zustand store (plan-store) rather than extending authoring-store for clean separation
- OrthographicCamera created imperatively and swapped via useThree().set() -- R3F does not natively support dual cameras
- Wrapped THREE.Line in primitive component to avoid R3F JSX type collision with SVG `<line>`
- Wall drawing active only when both plan view AND authoring mode are enabled (safety gate)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed R3F camera type mismatch**
- **Found during:** Task 1 (Plan view camera)
- **Issue:** `useThree().set({ camera })` rejects `THREE.Camera` type, expects PerspectiveCamera union
- **Fix:** Used `as any` type assertion (consistent with CLAUDE.md known issue for drei types)
- **Files modified:** src/components/viewer/plan-view.tsx
- **Verification:** pnpm build passes
- **Committed in:** f63d46c

**2. [Rule 1 - Bug] Fixed JSX `<line>` SVG type collision**
- **Found during:** Task 2 (Wall drawer)
- **Issue:** R3F `<line>` resolves to SVG `<line>` in TypeScript, ref type mismatch
- **Fix:** Created PreviewLine component using `<primitive object={...}>` pattern
- **Files modified:** src/components/viewer/wall-drawer.tsx
- **Verification:** pnpm build passes
- **Committed in:** 916ca96

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both type-system fixes required for build to pass. No scope change.

## Issues Encountered
None beyond the type fixes documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan view camera and wall drawing foundation complete
- Ready for snap-to-grid, wall measurement labels, room detection in next plan
- Walls persist in Zustand store across view mode switches

---
*Phase: 10-2d-plan-view-engine*
*Completed: 2026-03-28*
