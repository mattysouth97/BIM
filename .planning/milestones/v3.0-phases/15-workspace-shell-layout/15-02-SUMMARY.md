---
phase: 15-workspace-shell-layout
plan: "02"
subsystem: ui
tags: [workspace, layout, resizable-panels, three-js, r3f]

# Dependency graph
requires:
  - phase: 15-workspace-shell-layout
    plan: "01"
    provides: WorkspaceShell component with resizable left/right docks and bottom shelf
provides:
  - Building detail page using WorkspaceShell viewport-dominant layout
  - DashboardPanel removed from page (migrates to Phase 17 dock slots)
affects: [phase-16-viewer-cleanup, phase-17-dock-content]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - WorkspaceShell as page wrapper — pass viewport content as children, toolbar rendered above

key-files:
  created: []
  modified:
    - src/app/building/[id]/page.tsx

key-decisions:
  - "DashboardPanel removed from page.tsx entirely — its data props (recap, areas) also removed since no consumer remains until Phase 17"
  - "Error overlay and 3D viewer passed as WorkspaceShell children — center panel already has relative positioning"
  - "BuildingToolbar stays outside WorkspaceShell as h-12 compact top bar per D-04"

patterns-established:
  - "WorkspaceShell page pattern: <div h-dvh flex flex-col> → <Toolbar h-12> → <WorkspaceShell flex-1 children/>"

requirements-completed: [LAYOUT-01, LAYOUT-02, LAYOUT-03]

# Metrics
duration: 5min
completed: 2026-03-30
---

# Phase 15 Plan 02: Workspace Shell Layout — Wire-up Summary

**Building detail page rewired to viewport-dominant WorkspaceShell layout with resizable/collapsible left and right docks replacing DashboardPanel side-by-side**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-30T03:10:00Z
- **Completed:** 2026-03-30T03:15:00Z
- **Tasks:** 1 auto + 1 auto-approved checkpoint
- **Files modified:** 1

## Accomplishments
- Replaced side-by-side DashboardPanel layout with WorkspaceShell viewport-dominant layout
- BuildingScene now renders as children of WorkspaceShell center panel
- BuildingToolbar remains as compact h-12 bar above workspace
- Error overlay and viewer skeleton still work inside new layout
- Build passes with no type errors

## Task Commits

1. **Task 1: Rewire page.tsx to use WorkspaceShell and strip DashboardPanel** - `b3e0557` (feat)
2. **Task 2: Visual verification** - auto-approved (checkpoint:human-verify, autonomous mode active)

## Files Created/Modified
- `src/app/building/[id]/page.tsx` - Replaced DashboardPanel + flex layout with WorkspaceShell, removed recap/areas unused data refs

## Decisions Made
- DashboardPanel removed fully — recap and areas data fetching also removed since no consumer exists until Phase 17
- Error overlay uses `absolute top-0 inset-x-0 z-10` inside WorkspaceShell children (center panel has `relative` class)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
- Left dock shows "Left dock (Phase 17)" placeholder text — intentional, content migrates in Phase 17
- Right dock shows "Right dock (Phase 17)" placeholder text — intentional, content migrates in Phase 17
- Bottom shelf shows "Status bar (Phase 18)" placeholder — intentional, content in Phase 18

## Next Phase Readiness
- Phase 15 complete: WorkspaceShell wired into building detail page
- Phase 16: viewer-overlay.tsx cleanup/migration (highest-risk item — run full E2E before deleting)
- Phase 17: Dock content migration (DashboardPanel content → left/right dock slots)

---
*Phase: 15-workspace-shell-layout*
*Completed: 2026-03-30*
