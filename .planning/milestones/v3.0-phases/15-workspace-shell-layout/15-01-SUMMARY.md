---
phase: 15-workspace-shell-layout
plan: "01"
subsystem: ui
tags: [react-resizable-panels, workspace, layout, zustand, shadcn]

# Dependency graph
requires:
  - phase: 14-workflow-state-foundation
    provides: workspace-store with size constants (LEFT/RIGHT_DOCK_MIN/MAX/DEFAULT) and toggle actions

provides:
  - ResizablePanelGroup/Panel/Handle shadcn primitives wrapping react-resizable-panels v4
  - WorkspaceShell 3-panel resizable layout (left dock, center viewport, right dock)
  - DockCollapseButton chevron toggle for dock edges
  - Bottom shelf placeholder div

affects: [16-viewer-integration, 17-panel-content, 18-status-bar]

# Tech tracking
tech-stack:
  added: [react-resizable-panels@4.8.0]
  patterns:
    - "Dock collapse via className=hidden (not conditional JSX) to avoid panel unmount/remount"
    - "onLayoutChanged (not onLayout) for size persistence — fires once after drag completes"
    - "Individual Zustand selectors per field to minimize re-renders"
    - "useHydration() guard before reading persisted store"

key-files:
  created:
    - src/components/ui/resizable.tsx
    - src/components/workspace/workspace-shell.tsx
    - src/components/workspace/dock-collapse-button.tsx
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "react-resizable-panels v4 uses Group/Panel/Separator (not PanelGroup/Panel/PanelResizeHandle) — resizable.tsx adapted for v4 API"
  - "onLayoutChanged receives Layout object keyed by panel id (not array) — panels need stable id props"
  - "Dock collapse uses className=hidden per plan truths — panels stay mounted to preserve size"

patterns-established:
  - "Pattern: ResizablePanel with id prop for layout persistence via onLayoutChanged"
  - "Pattern: Collapse = display none via className, not conditional JSX — avoids PanelGroup remeasure"

requirements-completed: [LAYOUT-01, LAYOUT-02, LAYOUT-03]

# Metrics
duration: 15min
completed: 2026-03-30
---

# Phase 15 Plan 01: Workspace Shell Layout Summary

**Horizontal 3-panel resizable workspace shell using react-resizable-panels v4, with always-mounted dock panels (collapse via className=hidden), onLayoutChanged size persistence, and DockCollapseButton chevron toggles**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-30T00:00:00Z
- **Completed:** 2026-03-30T00:15:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Installed react-resizable-panels@4.8.0 and created shadcn Resizable primitives adapting v4 Group/Panel/Separator API
- WorkspaceShell renders a 3-panel horizontal layout (left dock, center viewport, right dock) reading workspace-store
- Dock panels always mounted — collapse toggles `className="hidden"` (not conditional JSX) preserving panel sizes on re-expand
- DockCollapseButton shows correct chevron direction based on side and collapsed state
- Bottom shelf placeholder collapsible div below the panel group
- `pnpm build` passes with no type errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Install react-resizable-panels and create shadcn Resizable primitives** - `7eb19cf` (feat)
2. **Task 2: Create DockCollapseButton and WorkspaceShell components** - `39acde3` (feat)

## Files Created/Modified
- `src/components/ui/resizable.tsx` - shadcn Resizable primitives wrapping react-resizable-panels v4 (Group/Panel/Separator)
- `src/components/workspace/workspace-shell.tsx` - Root workspace layout with 3-panel resizable structure, collapse logic, size persistence
- `src/components/workspace/dock-collapse-button.tsx` - Chevron button for dock collapse/expand with correct directional logic
- `package.json` - Added react-resizable-panels@4.8.0
- `pnpm-lock.yaml` - Updated lockfile

## Decisions Made
- **react-resizable-panels v4 API adaptation:** v4 exports `Group`, `Panel`, `Separator` (not `PanelGroup`/`PanelResizeHandle`). The resizable.tsx wrapper was written directly against v4 exports. GroupProps uses `orientation` (not `direction`) and `onLayoutChanged` receives `Layout` object (map of panel id → percentage, not an array).
- **Stable panel IDs for onLayoutChanged:** Because v4's `onLayoutChanged` gives a `{ [panelId]: percentage }` map, panels need stable `id` props (`left-dock`, `center-viewport`, `right-dock`) to extract correct sizes in the callback.
- **Hydration skeleton:** WorkspaceShell renders a minimal skeleton div before hydration to avoid SSR/client mismatch with persisted store values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated resizable.tsx for react-resizable-panels v4 API**
- **Found during:** Task 1 (creating resizable primitives)
- **Issue:** Plan template used `ResizablePrimitive.PanelGroup` and `ResizablePrimitive.PanelResizeHandle` which don't exist in v4. v4 exports `Group`, `Panel`, `Separator` with different prop names (`orientation` not `direction`, data attributes use `data-[orientation=...]` not `data-[panel-group-direction=...]`).
- **Fix:** Wrote resizable.tsx directly against v4 named exports and correct prop names. No `hidden` prop exists on Panel — plan's `display:none` via `className="hidden"` approach was used.
- **Files modified:** src/components/ui/resizable.tsx
- **Verification:** Build passes, TypeScript finds no type errors
- **Committed in:** 39acde3 (Task 2 commit, updated resizable.tsx)

---

**Total deviations:** 1 auto-fixed (API version adaptation)
**Impact on plan:** Fix was necessary — v4 has breaking API changes from v1/v2. Core behavior (collapse via hidden, onLayoutChanged, always-mounted panels) is preserved exactly as planned.

## Issues Encountered
- react-resizable-panels v4 `onLayoutChanged` callback signature changed from `(sizes: number[])` to `(layout: Layout)` where `Layout = { [panelId]: number }`. Required adding stable `id` props to panels so the callback can look up left/right sizes by ID.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- WorkspaceShell is ready to be placed in the app layout in Phase 16
- Left/right dock content placeholders ("Left dock (Phase 17)", "Right dock (Phase 17)") ready for Phase 17 panel content
- Bottom shelf placeholder ("Status bar (Phase 18)") ready for Phase 18
- No blockers

---
*Phase: 15-workspace-shell-layout*
*Completed: 2026-03-30*
