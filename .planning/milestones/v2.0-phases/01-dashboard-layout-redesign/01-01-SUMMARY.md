---
phase: 01-dashboard-layout-redesign
plan: 01
subsystem: building-detail-page
tags: [layout, dashboard, 3d-viewer, side-panel, toolbar]
dependency_graph:
  requires: []
  provides: [dashboard-layout, side-panel-state, building-toolbar, dashboard-panel]
  affects: [building-detail-page, building-scene, app-store]
tech_stack:
  added: []
  patterns: [full-viewport-layout, collapsible-panel, sheet-mobile-pattern, zustand-persist]
key_files:
  created:
    - src/components/building/building-toolbar.tsx
    - src/components/building/dashboard-panel.tsx
  modified:
    - src/store/app-store.ts
    - src/app/building/[id]/page.tsx
    - src/components/viewer/building-scene.tsx
decisions:
  - CSS-based responsive panel (hidden/block classes) over JS media queries to avoid hydration mismatch
  - Panel renders both Sheet (mobile) and inline div (desktop), toggled via Tailwind lg breakpoint classes
  - useHydration gate on panel toggle button and panel render to prevent SSR mismatch with persisted state
metrics:
  duration: 160s
  completed: 2026-03-26T12:53:50Z
  tasks_completed: 2
  tasks_total: 2
  files_changed: 5
---

# Phase 01 Plan 01: Dashboard Layout Redesign Summary

Full-viewport BIM dashboard layout replacing scrolling page: 3D viewer fills 70%+ viewport with condensed h-12 toolbar and collapsible 400px side panel containing overview stats and tabbed floors/areas/BIM content.

## What Was Built

### Task 1: Toolbar, Panel Components, and Store State (272b032)

**Zustand Store (`src/store/app-store.ts`):**
- Added `sidePanelOpen: boolean` state with `setSidePanelOpen` and `toggleSidePanel` actions
- Initialized to `true` (panel open by default)
- Added to `partialize` for cross-session persistence

**BuildingToolbar (`src/components/building/building-toolbar.tsx`):**
- Thin h-12 horizontal bar replacing the full BuildingHeader and top navigation bar
- Left side: back arrow link to `/` (icon-only on mobile, text on sm+), building name (truncated), main purpose badge
- Right side: ExportDropdown, language toggle (Globe icon), panel toggle (PanelRightOpen/Close icons)
- Uses `useHydration()` to gate panel toggle button rendering (prevents SSR mismatch)

**DashboardPanel (`src/components/building/dashboard-panel.tsx`):**
- Collapsible right-side panel (400px on desktop)
- Compact overview stats: 2-column `dl` definition list inside a Card (9 stats from BuildingOverview)
- Internal tabs: Floors, Areas, BIM (using existing FloorBreakdown, AreaDetail, BimSummaryCard)
- Desktop (lg+): inline sidebar div with close button
- Mobile (<lg): Sheet slide-over from right using shadcn Sheet component
- Both versions rendered, visibility toggled via Tailwind `hidden lg:block` / `lg:hidden`

### Task 2: Dashboard Layout Rewiring (4332d9e)

**Building Detail Page (`src/app/building/[id]/page.tsx`):**
- Replaced `container mx-auto max-w-6xl` scrolling layout with `flex flex-col h-dvh` full-viewport dashboard
- Structure: `BuildingToolbar` (h-12) -> flex row with `main` (flex-1, 3D) + `DashboardPanel` (400px)
- Removed imports: BuildingHeader, BuildingOverview, BuildingTabs
- Added imports: BuildingToolbar, DashboardPanel
- Lazy-loaded BuildingScene rendered directly in main area (not inside tabs)
- Error state: overlay banner (absolute positioned, z-10) on top of 3D area
- Loading state: centered Loader2 spinner in viewer area
- Empty state: centered text message

**BuildingScene (`src/components/viewer/building-scene.tsx`):**
- Changed root div from `h-[500px] rounded-lg border` to `h-full w-full` to fill parent container
- Removed card-like styling (rounded corners, border) since it is now the main canvas

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all data sources are wired to existing hooks and components.

## Verification Results

- `pnpm build` passes with no type errors (both tasks verified)
- TypeScript compilation: clean
- Static page generation: 11/11 pages generated successfully
- No unused imports or dead code warnings

## Self-Check: PASSED

- All 5 files exist on disk
- Commit 272b032 found (Task 1)
- Commit 4332d9e found (Task 2)
