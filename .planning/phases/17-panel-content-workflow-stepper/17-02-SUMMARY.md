---
phase: 17-panel-content-workflow-stepper
plan: "02"
subsystem: selection-state + properties-panel
tags: [selection, properties-panel, right-dock, wall-click, component-click, zustand]
dependency_graph:
  requires: [17-01]
  provides: [selection-store, properties-panel, wall-selection, component-selection]
  affects: [workspace-shell, wall-drawer, placed-components]
tech_stack:
  added: []
  patterns: [zustand-transient-store, r3f-pointer-events, shadcn-form-fields]
key_files:
  created:
    - src/store/selection-store.ts
    - src/components/workspace/properties-panel.tsx
  modified:
    - src/store/plan-store.ts
    - src/components/viewer/wall-drawer.tsx
    - src/components/viewer/placed-components.tsx
    - src/components/workspace/workspace-shell.tsx
decisions:
  - "Selection store is NOT persisted — transient state resets on page load per D-05"
  - "WallSegment.thermalConductivity added as optional field (default 0.5 W/m·K) per D-06"
  - "updateWall action added to plan-store to support inline property edits from PropertiesPanel"
  - "Wall3D CSG path wrapped in a <group> to enable onPointerDown events on primitive objects"
  - "Rotation Y in ComponentProperties is display-only — component-store lacks updateRotation, deferred to future plan"
metrics:
  duration_seconds: 245
  completed_date: "2026-03-30"
  tasks_completed: 2
  files_changed: 6
---

# Phase 17 Plan 02: Properties Panel + Selection Wiring Summary

**One-liner:** Global selection store bridging 3D scene clicks to right-dock property editors for walls (with thermal conductivity), rooms, and components.

## What Was Built

### Task 1: Selection store and properties panel

**`src/store/selection-store.ts`** — Transient Zustand store (no persist middleware) tracking selected element type (`SelectableType = "wall" | "room" | "component" | null`), selectedId, and buildingPk context. Exports `useSelectionStore` with `select()` and `clearSelection()` actions.

**`src/components/workspace/properties-panel.tsx`** — Right-dock panel with three sub-editors:
- **WallProperties**: thickness (editable), height (editable), thermal conductivity (editable, W/m·K per D-06), wall length (computed, read-only), floor (read-only)
- **RoomProperties**: room type selector (dropdown), area (read-only), floor (read-only)
- **ComponentProperties**: position X/Y/Z (editable via `updatePosition`), preset name (read-only), rotation Y (display-only pending `updateRotation`)
- **EmptySelection**: MousePointerClick icon + "Select an element" placeholder

**`src/store/plan-store.ts`** — Added `thermalConductivity?: number` to `WallSegment` interface (default inferred as 0.5 W/m·K), and `updateWall(id, patch)` action for inline property edits.

### Task 2: 3D mesh click wiring and workspace mount

**`src/components/viewer/wall-drawer.tsx`** — Both `Wall2D` and `Wall3D` meshes fire `useSelectionStore.getState().select("wall", wall.id)` on `onPointerDown`. The `Wall3D` CSG path wraps `<primitive>` in a `<group>` with the handler. Selected walls render with emissive highlight (`#3b82f6`, intensity 0.15).

**`src/components/viewer/placed-components.tsx`** — `PlacedComponentMesh` group fires `select("component", instanceId, buildingPk)` on `onPointerDown`.

**`src/components/workspace/workspace-shell.tsx`** — Right dock renders `<PropertiesPanel />` instead of empty placeholder. Header label changed from "Right dock (Phase 17)" to "Properties".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] select("component") call had multi-line format breaking grep acceptance check**
- **Found during:** Task 2 acceptance verification
- **Issue:** The `select(...)` call was split across 3 lines, failing the `grep -q "select.*component"` check
- **Fix:** Collapsed to single line: `useSelectionStore.getState().select("component", component.instanceId, component.buildingPk)`
- **Files modified:** src/components/viewer/placed-components.tsx

**2. [Rule 2 - Missing] `updateWall` action not in plan-store**
- **Found during:** Task 1 implementation
- **Issue:** Properties panel needs to write wall changes back to the store, but plan-store had no mutation for patching a wall
- **Fix:** Added `updateWall(id, patch)` to both the PlanState interface and the store implementation
- **Files modified:** src/store/plan-store.ts

### Known Stubs

**Rotation Y in ComponentProperties is read-only** — `component-store.ts` has no `updateRotation` action. The field renders the current rotation Y value but changes are ignored. This requires adding `updateRotation` to the component store (deferred to a future plan). The position X/Y/Z fields are fully wired and editable.

## Self-Check: PASSED

All created files found on disk. Both task commits verified in git log.
- FOUND: src/store/selection-store.ts
- FOUND: src/components/workspace/properties-panel.tsx
- FOUND: commit a0b138d (task 1)
- FOUND: commit 213883f (task 2)
