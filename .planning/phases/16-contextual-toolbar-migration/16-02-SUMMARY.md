---
phase: 16-contextual-toolbar-migration
plan: "02"
subsystem: viewer/toolbar
tags: [toolbar, migration, workspace-store, viewer-overlay, cleanup]
dependency_graph:
  requires: ["16-01"]
  provides: [contextual-toolbar-wired, viewer-overlay-deleted, panel-state-in-store]
  affects: [building-scene, workspace-store]
tech_stack:
  added: []
  patterns: [zustand-state-extraction, flex-column-layout, absolute-overlay]
key_files:
  created: []
  modified:
    - src/store/workspace-store.ts
    - src/components/viewer/building-scene.tsx
  deleted:
    - src/components/viewer/viewer-overlay.tsx
decisions:
  - "Panel state (configPanelOpen/layerPanelOpen/uploadDialogOpen) extracted to workspace-store, not persisted"
  - "BuildingScene uses flex-col layout: ContextualToolbar (h-auto) + viewport div (flex-1 min-h-0)"
  - "Floor info card and instructions text moved to absolute overlays inside viewport div"
metrics:
  duration_minutes: 8
  completed: "2026-03-30"
  tasks_completed: 4
  files_changed: 3
---

# Phase 16 Plan 02: Viewer-Overlay Deletion and Toolbar Integration Summary

Panel state extracted to workspace-store, ContextualToolbar wired into BuildingScene with flex-col layout replacing the 603-line ViewerOverlay monolith.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract panel state to workspace-store | 7f67ed4 | src/store/workspace-store.ts |
| 2 | Wire ContextualToolbar into building-scene | 8c8c714 | src/components/viewer/building-scene.tsx |
| 3 | Delete viewer-overlay.tsx | 20c6578 | src/components/viewer/viewer-overlay.tsx (deleted) |
| 4 | Verify toolbar migration parity | auto-approved | — |

## What Was Built

### Task 1: workspace-store panel state
Added `configPanelOpen`, `layerPanelOpen`, `uploadDialogOpen` state fields plus toggle and set actions to `workspace-store.ts`. Panel state defaults to `false` and is NOT in `partialize` — it resets on page load by design.

### Task 2: building-scene.tsx migration
- Removed `ViewerOverlay` import and JSX block
- Replaced three `useState` calls with `useWorkspaceStore` selector reads
- Added `useAppStore`, `usePlanStore`, `formatArea` imports for the floor info card and instructions text
- Wrapped return in `flex flex-col` outer div: `ContextualToolbar` as a strip above, inner `flex-1 min-h-0` div containing the Canvas
- Floor info card (bottom-left absolute) and instructions text (bottom-right absolute) moved from ViewerOverlay into the viewport div

### Task 3: viewer-overlay.tsx deleted
File deleted (603 lines). No remaining imports in `src/`. `pnpm build` passes cleanly.

### Task 4: Auto-approved checkpoint
Build passes, all controls preserved from viewer-overlay.tsx. Stage-keyed toolbar active through ContextualToolbar.

## Deviations from Plan

None — plan executed exactly as written.

## Requirements Satisfied

- CTX-02: Toolbar changes items per workflow stage (via ContextualToolbar stage-keyed configs)
- CTX-03: viewer-overlay.tsx decomposed and deleted
- FLOW-02: Mode indicator badge always visible in toolbar

## Known Stubs

None — all functionality from viewer-overlay.tsx is covered by ContextualToolbar.

## Self-Check

- [x] `src/store/workspace-store.ts` exists and has panel state — FOUND
- [x] `src/components/viewer/building-scene.tsx` exists with ContextualToolbar — FOUND
- [x] `src/components/viewer/viewer-overlay.tsx` deleted — CONFIRMED MISSING
- [x] Commits 7f67ed4, 8c8c714, 20c6578 exist
- [x] `pnpm build` passes

## Self-Check: PASSED
