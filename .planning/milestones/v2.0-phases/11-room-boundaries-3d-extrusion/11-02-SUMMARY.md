---
phase: 11-room-boundaries-3d-extrusion
plan: 02
subsystem: viewer/plan
tags: [room-fills, floor-slabs, plan-view, r3f, drawing-mode]
dependency_graph:
  requires: [11-01]
  provides: [room-fills-component, floor-slabs-component, dynamic-floor-selector, drawing-mode-gate]
  affects: [building-scene, viewer-overlay, wall-drawer]
tech_stack:
  added: []
  patterns:
    - ShapeGeometry from THREE.Shape for room polygon fills
    - THREE.Sprite + CanvasTexture for room labels
    - useMemo-driven reactive room detection from plan-store walls
    - cumulative Y accumulation for multi-floor slab positioning
key_files:
  created:
    - src/components/viewer/room-fills.tsx
    - src/components/viewer/floor-slab.tsx
  modified:
    - src/components/viewer/viewer-overlay.tsx
    - src/components/viewer/wall-drawer.tsx
    - src/components/viewer/building-scene.tsx
decisions:
  - WallDrawer isActive now requires drawingMode === 'wall' preventing accidental wall placement when in opening mode or no mode
  - Room type cycling order: living -> bedroom -> kitchen -> bathroom -> custom -> living (loop)
  - FloorSlabs use cumulative Y (sum of heights below) for correct stacking of variable-height floors
  - RoomFills only renders in plan viewMode; FloorSlabs only renders in 3D viewMode
  - Per-floor height clamped 2.0-6.0m to avoid degenerate floor heights
metrics:
  duration: 158s
  completed_date: "2026-03-28"
  tasks: 2
  files: 5
---

# Phase 11 Plan 02: Room Fills, Floor Slabs, and Drawing Mode Summary

One-liner: Room fills with ShapeGeometry + Sprite labels from detected room polygons, floor slabs at cumulative per-floor heights, dynamic floor selector with copy-floor action, and drawing mode gate on WallDrawer.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Room fills with ShapeGeometry + Sprite labels and room type cycling | 0cf9add | room-fills.tsx |
| 2 | Floor slabs + dynamic floor selector + copy floor + wall drawer gating + mount in building-scene | 5925cc8 | floor-slab.tsx, viewer-overlay.tsx, wall-drawer.tsx, building-scene.tsx |

## What Was Built

### room-fills.tsx (new)
- `RoomFills` R3F component renders colored semi-transparent polygons (20% opacity) for each detected room on the active floor
- Uses `useMemo` to call `buildWallGraph` + `detectRooms` reactively when walls change
- Syncs detected rooms into plan-store via `setRooms`, preserving existing room types by centroid proximity
- Each room renders a `THREE.ShapeGeometry` mesh with `rotation={[-Math.PI/2, 0, 0]}` to lay flat on the XZ plane
- `depthWrite={false}` prevents z-fighting with the plan grid
- Click handler cycles room type (living → bedroom → kitchen → bathroom → custom → living) via `setRoomType`
- Korean/English labels from `useAppStore` language setting
- `THREE.Sprite` labels with `CanvasTexture` showing room name and area at centroid position

### floor-slab.tsx (new)
- `FloorSlabs` R3F component renders thin boxGeometry (0.05m height) slabs per floor in 3D mode
- Computes bounding box from all wall start/end XZ coordinates with 1m padding
- Stacks slabs at cumulative Y positions: `y = sum(floorHeights[0..floor-1])` with `?? 3.0` fallback
- Skips rendering in plan mode (grid handles ground plane)
- `meshStandardMaterial` with `color={0xe0e0e0}`, `roughness={0.8}`, `receiveShadow`

### viewer-overlay.tsx (updated)
- Floor selector now uses `Array.from({ length: floorCount }, (_, i) => i)` — dynamic from store
- Per-floor height number input next to floor selector, clamped [2.0, 6.0]m
- Copy Floor button: calls `copyFloor(activeFloor, floorCount)`, increments `floorCount`, switches to new floor
- Drawing mode toggle: two-button group for "wall" and "opening" modes, each toggling off when re-clicked
- Wall draw status indicator only shows when `drawingMode === "wall"` (was always visible in authoring mode)

### wall-drawer.tsx (updated)
- `isActive` condition changed from `viewMode === "plan" && isAuthoring` to `viewMode === "plan" && isAuthoring && drawingMode === "wall"`
- Added `drawingMode` subscription from plan-store

### building-scene.tsx (updated)
- Imports `RoomFills` from `"./room-fills"` and `FloorSlabs` from `"./floor-slab"`
- Both mounted as sibling R3F components inside the Canvas, adjacent to `<WallDrawer />`

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `pnpm build`: passes (TypeScript clean)
- `pnpm vitest run src/store/__tests__/plan-store.test.ts`: 22/22 tests pass

## Self-Check: PASSED
