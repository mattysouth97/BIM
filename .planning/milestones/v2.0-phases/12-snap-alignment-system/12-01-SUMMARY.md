---
phase: 12-snap-alignment-system
plan: "01"
subsystem: snap-engine
tags: [snap, wall-drawing, precision, bim-authoring]
dependency_graph:
  requires: []
  provides: [snap-engine, plan-store-snap-state, snap-indicator, wall-drawer-snap, opening-drawer-snap]
  affects: [wall-drawer, opening-drawer, plan-store]
tech_stack:
  added: []
  patterns: [pure-functions-snap, zustand-snap-state, r3f-visual-indicator]
key_files:
  created:
    - src/lib/plan/snap-engine.ts
    - src/components/viewer/snap-indicator.tsx
  modified:
    - src/store/plan-store.ts
    - src/components/viewer/wall-drawer.tsx
    - src/components/viewer/opening-drawer.tsx
decisions:
  - snap-engine-dependency-free: snap-engine.ts inlines projectOntoSegment rather than importing from room-detector.ts, keeping the module isolated and unit-testable without store or Three.js dependencies
  - opening-snap-t-grid: opening-drawer uses wall-proximity (projectOntoWall) as primary snap then snaps parametric t to grid increments along wall length, rather than replacing the wall-snap logic
  - indicator-primitive-lines: SnapIndicator uses THREE.Line primitives via <primitive> rather than R3F JSX <line> to avoid SVG type collision
metrics:
  duration: 222s
  completed_date: "2026-03-28"
  tasks_completed: 2
  files_changed: 5
---

# Phase 12 Plan 01: Snap Engine + Wall Drawing Integration Summary

**One-liner:** Pure grid/vertex/edge snap engine with vertex>edge>grid priority, integrated into wall-drawer and opening-drawer with blue dot + dashed crosshair visual indicator.

## Tasks Completed

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Snap engine + plan-store extension | 32d3bdc | snap-engine.ts, plan-store.ts, snap-indicator.tsx |
| 2 | Integrate snap into wall-drawer + opening-drawer | fbaf4d4 | wall-drawer.tsx, opening-drawer.tsx |

## What Was Built

### Snap Engine (`src/lib/plan/snap-engine.ts`)
Pure functions with no external dependencies:
- `snapToGrid(x, z, gridSize)` — rounds to nearest grid multiple
- `snapToVertex(x, z, walls, tolerance)` — finds closest wall endpoint within tolerance
- `snapToEdge(x, z, walls, tolerance)` — finds closest mid-edge projection within tolerance (excludes endpoints)
- `computeSnap(x, z, walls, config)` — orchestrates priority: vertex > edge > grid > none
- Exports: `SnapType`, `SnapResult`, `SnapConfig`, `SnapWall`

### Plan Store Extensions (`src/store/plan-store.ts`)
Added to `PlanState`:
- `snapEnabled` (default: true) — master snap toggle
- `gridSnapEnabled` (default: true)
- `vertexSnapEnabled` (default: true)
- `edgeSnapEnabled` (default: true)
- `proximityTolerance` (default: 0.3m)
- Setters: `setSnapEnabled`, `setGridSnapEnabled`, `setVertexSnapEnabled`, `setEdgeSnapEnabled`, `setProximityTolerance`

### Snap Indicator (`src/components/viewer/snap-indicator.tsx`)
R3F component rendering at the active snap point:
- `THREE.RingGeometry` (r=0.08m) colored by snap type: vertex=#2196f3 (blue), edge=#4caf50 (green), grid=#9e9e9e (grey)
- Two `THREE.LineDashedMaterial` crosshair lines ±100m on X and Z axes (dashSize=0.2, gapSize=0.1, opacity=0.4)
- Uses `useMemo` for all geometry/material/line objects
- Renders nothing when `snapResult` is null or type is "none"

### Wall Drawer Integration (`src/components/viewer/wall-drawer.tsx`)
- Reads `snapEnabled`, `gridSnapEnabled`, `vertexSnapEnabled`, `edgeSnapEnabled`, `proximityTolerance` from plan-store
- Builds `SnapConfig` via `useMemo`
- `handleMouseMove`: applies `computeSnap` → sets `currentSnap` state → moves cursor to snapped position
- `handleClick` (first click / start): applies `computeSnap` to start point before calling `startDrawing`
- `handleClick` (second click / end): applies `computeSnap` to end point before creating `WallSegment`
- Renders `<SnapIndicator snapResult={currentSnap} />` inside the group when `isActive`

### Opening Drawer Integration (`src/components/viewer/opening-drawer.tsx`)
- `handleMouseMove`: reads snap config from `usePlanStore.getState()`, disables vertex/edge snap, computes `tStep = gridSize / wallLength`, snaps `proj.t` to nearest grid step, recomputes world position from snapped t

## Decisions Made

1. **snap-engine dependency-free**: Inlined `projectOntoSegment` in snap-engine.ts rather than importing from room-detector.ts. Keeps the module isolated for unit testing and avoids indirect store dependencies.

2. **opening snap uses t-grid**: Opening placement keeps wall-proximity logic as primary snap mechanism, applying grid snap only to the parametric t position. This ensures openings always stick to walls while aligning to grid increments.

3. **SnapIndicator uses primitive lines**: `THREE.Line` objects wrapped in `<primitive>` to avoid JSX `<line>` collision with SVG types (existing pattern from wall-drawer.tsx's PreviewLine).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all snap functionality is wired to live plan-store state and cursor position.

## Self-Check: PASSED
