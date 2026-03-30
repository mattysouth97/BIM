---
phase: 16-contextual-toolbar-migration
plan: "03"
subsystem: workspace-toolbar
tags: [toolbar, data-driven, refactor, gap-closure]
dependency_graph:
  requires: ["16-01", "16-02"]
  provides: ["CTX-02", "CTX-03"]
  affects: ["src/components/workspace/contextual-toolbar.tsx", "src/lib/workflow/toolbar-configs.ts"]
tech_stack:
  added: []
  patterns: ["data-driven rendering via TOOLBAR_CONFIGS[stage]", "store.getState() dispatch pattern"]
key_files:
  created: []
  modified:
    - src/lib/workflow/toolbar-configs.ts
    - src/components/workspace/contextual-toolbar.tsx
decisions:
  - "TOOLBAR_CONFIGS[stage] is the live rendering driver for toolbar strip buttons — data-driven contract established"
  - "Store dispatch uses getState() pattern per D-07 — no store imports in toolbar-configs.ts"
  - "Plan-view overlay panels kept as custom JSX in main ContextualToolbar (stage===assemble guard)"
  - "PROP_ACTION_ITEMS set identifies items needing prop-based handlers (upload, model-toggle)"
metrics:
  duration_minutes: 20
  tasks_completed: 2
  files_modified: 2
  completed_date: "2026-03-30"
---

# Phase 16 Plan 03: Toolbar TOOLBAR_CONFIGS Wiring Summary

Wire TOOLBAR_CONFIGS[stage] into contextual-toolbar.tsx so the data-driven contract is live — adding a ToolbarItem to toolbar-configs.ts makes it appear in the toolbar without editing contextual-toolbar.tsx.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add TOOLBAR_ACTIONS dispatch registry to toolbar-configs.ts | 8e625dc | src/lib/workflow/toolbar-configs.ts |
| 2 | Replace inline stage conditionals with TOOLBAR_CONFIGS[stage] renderer | 303e8aa | src/components/workspace/contextual-toolbar.tsx |

## What Was Built

**Task 1 — TOOLBAR_ACTIONS registry:**
- Added `ToolbarActionDescriptor` interface: maps store + method + args + toggleOff
- Added `TOOLBAR_ACTIONS` record: 13 entries mapping all toolbar item IDs to store action descriptors
- Added `PROP_ACTION_ITEMS` set: 4 items using prop-based handlers (upload, model-toggle)
- Pure data module preserved — no React imports added

**Task 2 — Data-driven renderer:**
- Added `resolveCondition()` helper evaluating `activeWhen`/`visibleWhen` expression strings against live store state + props
- Added `dispatchAction()` using `store.getState()` pattern — no store hooks in event handlers
- Added `ToolbarItemRenderer` — single item renderer with visibility, active state, special cases
- Added `ToolbarGroupRenderer` — renders group items via ToolbarItemRenderer
- Added `StageToolbar` — reads `TOOLBAR_CONFIGS[stage]` and renders all groups for the current stage
- Deleted `AssembleToolbar`, `ConfigureToolbar`, `AnalyzeToolbar` sub-components
- Kept `ModeIndicatorBadge` and `GlobalToolbarSection` unchanged
- Moved plan-view overlay panels to main `ContextualToolbar` render (guarded by `stage === "assemble"`)
- Removed `void TOOLBAR_CONFIGS` and `void GLOBAL_ITEMS` suppression hacks

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript cast `as Record<string, unknown>` rejected on union store type**
- **Found during:** Task 2 build
- **Issue:** `storeRef.getState()` returns union `PlanState | AuthoringState | WorkspaceState` which TypeScript rejects direct cast to `Record<string, unknown>`
- **Fix:** Changed to double-cast `as unknown as Record<string, unknown>` (standard TypeScript pattern)
- **Files modified:** src/components/workspace/contextual-toolbar.tsx
- **Commit:** 303e8aa (included in task commit)

## Known Stubs

None — all toolbar items are wired to real store actions. No placeholder data.

## Verification

- `grep "TOOLBAR_CONFIGS\["` in contextual-toolbar.tsx returns line 310 (key link live)
- `grep "void TOOLBAR_CONFIGS\|void GLOBAL_ITEMS"` returns 0 matches (hacks removed)
- `grep "TOOLBAR_ACTIONS"` in contextual-toolbar.tsx returns matches (dispatch wired)
- `grep "AssembleToolbar\|ConfigureToolbar\|AnalyzeToolbar"` returns 0 matches (deleted)
- `pnpm build` passes cleanly

## Self-Check: PASSED

Files exist:
- src/lib/workflow/toolbar-configs.ts — FOUND
- src/components/workspace/contextual-toolbar.tsx — FOUND

Commits exist:
- 8e625dc — FOUND
- 303e8aa — FOUND
