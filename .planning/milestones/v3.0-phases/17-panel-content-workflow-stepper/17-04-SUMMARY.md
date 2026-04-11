---
phase: 17-panel-content-workflow-stepper
plan: "04"
subsystem: workspace-ui
tags: [scene-outliner, component-catalog, left-dock, selection-store, component-store]
dependency_graph:
  requires: ["17-02"]
  provides: ["scene-outliner", "component-catalog", "left-dock-content"]
  affects: ["workspace-shell", "selection-store", "component-store"]
tech_stack:
  added: []
  patterns: ["accordion-tree", "tabs-filtering", "zustand-getState-pattern"]
key_files:
  created:
    - src/components/workspace/scene-outliner.tsx
    - src/components/workspace/component-catalog.tsx
  modified:
    - src/components/workspace/workspace-shell.tsx
decisions:
  - "SceneOutliner shows placed components under Floor 1 only (floorIndex===0) since PlacedComponent has no floor property — avoids duplication across floors"
  - "ArrowUpFromLine used for stairs icon — lucide-react in this version lacks a dedicated Stairs icon"
  - "buildingPk='' placeholder in WorkspaceShell — wired to actual building PK in future integration phase"
metrics:
  duration_seconds: 129
  completed_date: "2026-03-30"
  tasks_completed: 2
  files_changed: 3
---

# Phase 17 Plan 04: Scene Outliner + Component Catalog Summary

**One-liner:** SceneOutliner tree (floors/walls/rooms/components) and ComponentCatalog (tabbed presets with drag-to-place) wired into the workspace left dock.

## What Was Built

### SceneOutliner (`src/components/workspace/scene-outliner.tsx`)

Tree hierarchy of the BIM scene, grouped by floor. Uses shadcn `Accordion` for collapsible floor sections. Each leaf node is a clickable button that calls `useSelectionStore.getState().select(type, id, buildingPk)`. The currently selected node is highlighted with `bg-accent`. Shows item counts in section headers (e.g., "Walls (5)", "Rooms (3)"). Uses Lucide icons: `Layers` for floors, `Square` for walls, `Home` for rooms, `Package` for components. Empty state shows "No elements yet" when store is empty.

### ComponentCatalog (`src/components/workspace/component-catalog.tsx`)

Filterable catalog of component presets grouped by category. Tabs: All / Doors / Windows / MEP / Stairs — each showing preset count. Preset cards display category icon, Korean name, English name, and dimensions (W×H×D in mm). Clicking a preset calls `useComponentStore.getState().setDragging(preset)` to start the drag placement flow. When dragging is active, a placement indicator appears with a Cancel button that calls `setDragging(null)`. The existing `DragPreview` in `placed-components.tsx` handles the 3D preview.

### WorkspaceShell (`src/components/workspace/workspace-shell.tsx`)

Left dock now renders: `SceneOutliner` (top) → `Separator` → `ComponentCatalog` (bottom). Header label updated from "Left dock (Phase 17)" to "Scene".

## Key Links Implemented

| From | To | Via |
|------|-----|-----|
| SceneOutliner | selection-store | `useSelectionStore.getState().select()` on node click |
| SceneOutliner | plan-store | `usePlanStore` for walls/rooms/floorCount/openings |
| SceneOutliner | component-store | `useComponentStore` for placed components |
| ComponentCatalog | component-store | `useComponentStore.getState().setDragging()` on preset click |
| workspace-shell | scene-outliner | Renders `<SceneOutliner buildingPk="" />` |
| workspace-shell | component-catalog | Renders `<ComponentCatalog />` |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written with two minor adaptations documented as decisions.

**Adaptation 1: Stairs icon**
- Lucide-react in this project does not export a `Stairs` icon. Used `ArrowUpFromLine` as a functional substitute.
- Not a deviation from plan intent — plan said "Stairs from lucide-react" but the icon is unavailable.

**Adaptation 2: PlacedComponent floor grouping**
- `PlacedComponent` has no floor property (by design), so showing all placed components under Floor 1 (index 0) only. This avoids duplication. Documented as a key decision.

## Verification

- `pnpm build` passes with no type errors
- All 8 acceptance criteria pass (grep checks confirmed)
- SceneOutliner: exports `SceneOutliner`, uses `useSelectionStore`, `usePlanStore`, `useComponentStore`, `Accordion`, calls `select()`, applies `bg-accent`
- ComponentCatalog: exports `ComponentCatalog`, uses `setDragging`, imports `DOOR_PRESETS`/`WINDOW_PRESETS`, uses `Tabs`
- workspace-shell: imports both `SceneOutliner` and `ComponentCatalog` from their respective files

## Commits

- `37f2523` — feat(17-04): create SceneOutliner tree view component
- `e7a283f` — feat(17-04): create ComponentCatalog and wire panels into left dock

## Self-Check: PASSED

All created files exist and all commits are verified.
