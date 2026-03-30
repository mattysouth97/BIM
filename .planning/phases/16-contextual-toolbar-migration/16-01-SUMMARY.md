---
phase: 16-contextual-toolbar-migration
plan: 01
subsystem: toolbar
tags: [toolbar, workflow, authoring, ui, contextual]
dependency_graph:
  requires: [workflow-store, authoring-store, plan-store, opening-drawer, app-store]
  provides: [TOOLBAR_CONFIGS, ContextualToolbar]
  affects: [workspace-shell, viewer-overlay migration]
tech_stack:
  added: []
  patterns: [data-driven toolbar config, stage-keyed rendering, mode indicator badge]
key_files:
  created:
    - src/lib/workflow/toolbar-configs.ts
    - src/components/workspace/contextual-toolbar.tsx
  modified: []
decisions:
  - Plan-view sub-panels rendered as absolute-positioned overlays below the toolbar strip rather than inline toolbar items — matches original viewer-overlay.tsx positional pattern and keeps toolbar at fixed h-10
  - TOOLBAR_CONFIGS entries for select and export stages are empty arrays — global controls from GlobalToolbarSection cover these stages
  - ToolbarItem.visibleWhen and activeWhen use string path notation (e.g. "authoring.isAuthoring") — evaluated at component render time by the toolbar renderer
metrics:
  duration_seconds: 230
  completed_date: "2026-03-30"
  tasks_completed: 2
  files_changed: 2
---

# Phase 16 Plan 01: Contextual Toolbar — Data Config + Component Summary

Data-driven TOOLBAR_CONFIGS map keyed by WorkflowStage plus ContextualToolbar React component that replaces viewer-overlay.tsx with a fixed-height stage-aware strip.

## What Was Built

### Task 1: toolbar-configs.ts (pure data)

Created `src/lib/workflow/toolbar-configs.ts` as a pure data file with no React imports. Exports:

- `ToolbarItem`, `ToolbarGroup`, `ToolbarItemType` interfaces
- `GLOBAL_ITEMS` group (plan/3D toggle + 5 view preset buttons)
- `TOOLBAR_CONFIGS` keyed by all 5 WorkflowStage values:
  - `select` — empty (global only)
  - `assemble` — edit toggle, transform modes, drawing modes, annotation tools, model upload/toggle
  - `configure` — config panel toggle, layer panel toggle, model upload/toggle
  - `analyze` — layer panel toggle
  - `export` — empty (global only)

### Task 2: contextual-toolbar.tsx (React component)

Created `src/components/workspace/contextual-toolbar.tsx` with:

**Fixed-height toolbar strip (h-10 / 40px):**
- `ModeIndicatorBadge` — always-visible badge showing current tool with color coding:
  - Blue: Draw Wall (PenTool)
  - Green: Place Opening (DoorOpen)
  - Purple: annotation modes (Dimension/Area/Level/Section)
  - Amber: transform modes (Move/Rotate/Scale) when isAuthoring
  - Neutral: Select (default)
- Building name, era, and model source display badges in the left section
- Stage-specific toolbar groups in the center
- `GlobalToolbarSection` always on the right (plan/3D toggle + view presets)

**Assemble stage controls:**
- Edit mode toggle (Pencil/PencilOff)
- Transform mode buttons (Move/Rotate/Scale) — visible when isAuthoring
- Annotation tool buttons (Ruler/Square/Level/Scissors/Trash2) — visible when isAuthoring
- Upload + model source toggle buttons

**Plan-view sub-panels (absolute positioned, appear when viewMode === "plan"):**
- Floor selector with per-floor height input and Copy Floor button (calls `copyFloor(activeFloor, floorCount)` + `setFloorCount(floorCount + 1)` + `setActiveFloor(floorCount)`)
- Grid size toggle (0.1m / 0.5m / 1.0m)
- Snap controls (master toggle + grid/vertex/edge checkboxes)
- Drawing mode toggle (Wall/Opening) — when isAuthoring
- Wall draw status indicator (click start / click second point)
- Axis lock info (Shift: auto, X/Y: lock axis)
- Opening preset selector (DOOR_PRESETS + WINDOW_PRESETS) — when drawingMode === "opening"
- Opening placement status indicator

**Section cut slider overlay** — appears when annotationMode === "section"

**Configure stage:** Config panel toggle + layer panel toggle + model upload/toggle

**Analyze stage:** Layer panel toggle

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `pnpm build` passes with zero type errors in new files
- Pre-existing test file type errors are out-of-scope and unchanged
- TOOLBAR_CONFIGS has entries for all 5 stages
- ContextualToolbar covers every store subscription from viewer-overlay.tsx lines 43-79
- Mode indicator badge always visible (FLOW-02)
- Model source badge shows Architectural Model / Estimated Geometry (viewer-overlay lines 280-287)
- Copy Floor button present in floor selector sub-panel with exact same 3-call sequence

## Known Stubs

None — all controls are wired to real store calls. The toolbar is not yet wired into the page layout (that happens in Plan 02 per the plan objective).

## Self-Check: PASSED

- `src/lib/workflow/toolbar-configs.ts` — FOUND (commit 7aac089)
- `src/components/workspace/contextual-toolbar.tsx` — FOUND (commit dde987b)
- Build passes cleanly
