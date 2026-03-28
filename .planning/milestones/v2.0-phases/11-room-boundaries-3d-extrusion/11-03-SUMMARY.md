---
phase: 11-room-boundaries-3d-extrusion
plan: 03
subsystem: ui
tags: [three-bvh-csg, react-three-fiber, zustand, plan-view, opening-drawer, CSG]

requires:
  - phase: 11-room-boundaries-3d-extrusion
    provides: "plan-store with Opening interface, walls/openings/drawingMode state, addOpening action; projectOntoWall from room-detector; DOOR_PRESETS/WINDOW_PRESETS from component-types; WallDrawer with Wall3D/Wall2D; three-bvh-csg installed"

provides:
  - "OpeningDrawer R3F component with wall-snap placement (threshold 1.0m) and architectural plan symbols"
  - "useOpeningPreset Zustand store for cross-component preset selection"
  - "DoorSymbol: EllipseCurve arc sweep + door panel + hinge line in plan view"
  - "WindowSymbol: two parallel thin boxes offset by wallThickness*0.3 in plan view"
  - "Wall3D CSG: rectangular holes cut via three-bvh-csg SUBTRACTION per opening"
  - "Opening preset selector in ViewerOverlay (door/window buttons, visible when drawingMode=opening)"
  - "OpeningDrawer mounted in building-scene.tsx"

affects:
  - "building-scene.tsx"
  - "wall-drawer.tsx"
  - "viewer-overlay.tsx"

tech-stack:
  added: []
  patterns:
    - "Module-level csgEvaluator (new Evaluator()) reused across all Wall3D renders for efficiency"
    - "useOpeningPreset as an exported Zustand store for overlay-to-R3F preset communication"
    - "latestSnapRef pattern: ref tracks latest snap state for click handlers; React state drives re-renders"
    - "CSG try/catch fallback: Wall3D falls back to plain boxGeometry if CSG throws"

key-files:
  created:
    - src/components/viewer/opening-drawer.tsx
  modified:
    - src/components/viewer/wall-drawer.tsx
    - src/components/viewer/viewer-overlay.tsx
    - src/components/viewer/building-scene.tsx

key-decisions:
  - "useOpeningPreset module-level Zustand store exported from opening-drawer.tsx for overlay to import"
  - "latestSnapRef pattern avoids stale closure in click handler while React state drives snap preview render"
  - "CSG sill heights: doors at baseY+0 (floor level), windows at baseY+0.9m"
  - "Opening BoxGeometry thickness +0.02 to prevent coplanar face artifacts in CSG"
  - "Snap preview rendered only in plan view and when drawingMode=opening; symbols render in plan view regardless of mode"

requirements-completed: [PLAN-04]

duration: 4min
completed: 2026-03-28
---

# Phase 11 Plan 03: Door/Window Opening Placement Summary

**Wall-snap opening placement tool with architectural plan symbols (door arc, window parallel lines) and three-bvh-csg boolean subtraction for 3D wall holes**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-28T10:42:00Z
- **Completed:** 2026-03-28T10:46:17Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- OpeningDrawer R3F component: raycasts to ground plane, projects onto walls via projectOntoWall, snaps within 1.0m threshold
- Door arc symbol (EllipseCurve, PI/2 sweep, brown) and window parallel double lines (blue, offset by wallThickness*0.3) rendered in plan view
- Wall3D CSG: three-bvh-csg SUBTRACTION cuts rectangular holes for each opening; falls back to plain box if no openings or CSG error
- Opening preset selector in ViewerOverlay shows 6 Korean-standard presets (3 doors + 3 windows), visible only when drawingMode=opening
- OpeningDrawer mounted as sibling R3F component in building-scene.tsx

## Task Commits

1. **Task 1: Opening drawer with wall-snap and architectural symbols** - `83d8aed` (feat)
2. **Task 2: CSG wall openings + preset selector + mount OpeningDrawer** - `ccdc758` (feat)

## Files Created/Modified

- `src/components/viewer/opening-drawer.tsx` - OpeningDrawer with snap logic, useOpeningPreset store, DoorSymbol/WindowSymbol
- `src/components/viewer/wall-drawer.tsx` - Added CSG imports, csgEvaluator, Wall3D now accepts wallOpenings prop
- `src/components/viewer/viewer-overlay.tsx` - Opening preset selector UI, imports useOpeningPreset + DOOR/WINDOW_PRESETS
- `src/components/viewer/building-scene.tsx` - Imports and mounts OpeningDrawer

## Decisions Made

- useOpeningPreset as a module-level exported Zustand store: allows viewer-overlay.tsx (non-R3F) and opening-drawer.tsx (R3F) to share preset selection without prop drilling or context
- latestSnapRef + React state: click handlers read the ref (no stale closure), React state drives the preview re-render on mouse move
- CSG try/catch wrapper: CSG can fail on degenerate geometry; fall back to plain box ensures walls always render
- Opening thickness +0.02: prevents coplanar face artifacts where opening side meets wall face in CSG

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None - all openings are fully wired from plan-store through rendering. Preset data comes from DOOR_PRESETS/WINDOW_PRESETS constants. CSG holes are computed from actual placement data.

## Next Phase Readiness

- PLAN-04 (door/window insertion) complete. Full workflow: select preset -> click near wall in opening mode -> see symbol in 2D + cut hole in 3D
- Ready for structural analysis visualization phase
- WallDrawer and OpeningDrawer are now two peer R3F components sharing the plan-store; clean separation of concerns

---
*Phase: 11-room-boundaries-3d-extrusion*
*Completed: 2026-03-28*
