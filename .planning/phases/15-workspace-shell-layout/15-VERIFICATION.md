---
phase: 15-workspace-shell-layout
verified: 2026-03-30T04:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 15: Workspace Shell Layout — Verification Report

**Phase Goal:** Users see the 3D viewport as the dominant element of the screen with dockable panels around it that can be resized and collapsed
**Verified:** 2026-03-30T04:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Plan 01)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | WorkspaceShell renders a horizontal ResizablePanelGroup with left dock, center viewport, and right dock panels | VERIFIED | `workspace-shell.tsx` line 67-155: `<ResizablePanelGroup orientation="horizontal">` with three `ResizablePanel` children (ids: `left-dock`, `center-viewport`, `right-dock`) |
| 2 | Left dock panel respects min/max/default size constants from workspace-store | VERIFIED | `workspace-shell.tsx` lines 75-77: `defaultSize={LEFT_DOCK_DEFAULT}` `minSize={LEFT_DOCK_MIN}` `maxSize={LEFT_DOCK_MAX}` imported from `@/store/workspace-store` |
| 3 | Right dock panel respects min/max/default size constants from workspace-store | VERIFIED | `workspace-shell.tsx` lines 135-137: `defaultSize={RIGHT_DOCK_DEFAULT}` `minSize={RIGHT_DOCK_MIN}` `maxSize={RIGHT_DOCK_MAX}` imported from `@/store/workspace-store` |
| 4 | Collapse buttons toggle dock visibility via workspace-store actions | VERIFIED | `workspace-shell.tsx` lines 85-89 and 143-147: `DockCollapseButton` onClick wired to `toggleLeftDock` / `toggleRightDock` from store. Re-expand buttons at lines 104-122 also wire collapse toggles for the hidden-dock case |
| 5 | Bottom shelf placeholder slot exists as a collapsible div below the panel group | VERIFIED | `workspace-shell.tsx` lines 158-164: `{bottomShelfOpen && <div className="h-10 ...">Status bar (Phase 18)</div>}` below the ResizablePanelGroup |
| 6 | Dock collapse uses className=hidden on ResizablePanel, not conditional JSX — panels are never unmounted/remounted on toggle | VERIFIED | `workspace-shell.tsx` lines 78, 98, 130, 139: `className={leftDockOpen ? undefined : "hidden"}` and `className={rightDockOpen ? undefined : "hidden"}` — panels always present in JSX tree |

### Observable Truths (Plan 02)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 7 | The building detail page renders WorkspaceShell wrapping the 3D viewport | VERIFIED | `page.tsx` line 7: `import { WorkspaceShell }`, lines 70-99: `<WorkspaceShell>` wraps all viewport content including BuildingScene |
| 8 | The 3D viewer occupies the dominant center panel, no building metadata card crowds the viewport | VERIFIED | `page.tsx` has no `DashboardPanel` import or usage; `BuildingScene` renders inside WorkspaceShell center panel |
| 9 | R3F Canvas fills its container | VERIFIED | `building-scene.tsx` line 268: `<div className="relative h-full w-full overflow-hidden">` — Canvas fills container |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/ui/resizable.tsx` | shadcn Resizable primitives wrapping react-resizable-panels | VERIFIED | 53 lines. Exports `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`. Imports from `react-resizable-panels` v4 (`Group`, `Panel`, `Separator`). Has `"use client"` directive. |
| `src/components/workspace/workspace-shell.tsx` | Root workspace layout component | VERIFIED | 167 lines (exceeds min_lines: 60). Exports `WorkspaceShell`. Substantive implementation. |
| `src/components/workspace/dock-collapse-button.tsx` | Chevron collapse/expand button for dock edges | VERIFIED | 36 lines. Exports `DockCollapseButton`. Uses `ChevronLeft`/`ChevronRight` from lucide-react. Full implementation. |
| `src/app/building/[id]/page.tsx` | Building detail page using WorkspaceShell | VERIFIED | Imports and renders `<WorkspaceShell>` wrapping BuildingScene. No `DashboardPanel`. |
| `src/components/viewer/building-scene.tsx` | R3F Canvas fills container | VERIFIED | Container div uses `h-full w-full` — no panel state management inside |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `workspace-shell.tsx` | `workspace-store.ts` | `useWorkspaceStore` selectors | VERIFIED | Lines 34-40: 7 individual selectors (`leftDockOpen`, `rightDockOpen`, `bottomShelfOpen`, `toggleLeftDock`, `toggleRightDock`, `setLeftDockSize`, `setRightDockSize`) |
| `workspace-shell.tsx` | `resizable.tsx` | `ResizablePanelGroup` import | VERIFIED | Lines 5-8: `import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"` |
| `page.tsx` | `workspace-shell.tsx` | import and render | VERIFIED | Line 7: `import { WorkspaceShell } from "@/components/workspace/workspace-shell"`. Line 70: `<WorkspaceShell>` rendered |
| `page.tsx` | `building-scene.tsx` | BuildingScene rendered as WorkspaceShell children | VERIFIED | Lines 88-91: `<Suspense fallback={...}><BuildingScene title={titleData} floors={floorsData} /></Suspense>` inside WorkspaceShell |

---

### Data-Flow Trace (Level 4)

Not applicable for this phase. The workspace shell is a structural layout component — it does not render dynamic data from an API or store beyond boolean open/closed state (which is store-driven and wired). BuildingScene data flow is verified in the viewer phases.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| react-resizable-panels installed | `node -e "require('react-resizable-panels')" && echo "OK"` | OK | PASS |
| Package declared in dependencies | `grep "react-resizable-panels" package.json` | `"react-resizable-panels": "^4.8.0"` | PASS |
| Production build succeeds (no type errors) | `pnpm build` | Exit 0, all 14 routes generated | PASS |
| onLayoutChanged used (not onLayout) | `grep "onLayoutChanged" workspace-shell.tsx` | Line 70: `onLayoutChanged={handleLayoutChanged}` | PASS |
| Panels use className=hidden (not conditional JSX) | `grep "className.*hidden" workspace-shell.tsx` | Lines 78, 98, 130, 139 confirmed | PASS |
| DashboardPanel absent from page.tsx | `grep "DashboardPanel" page.tsx` | No output | PASS |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LAYOUT-01 | 15-01, 15-02 | User sees a viewport-dominant layout with the 3D view as the primary element and panels docked around it | SATISFIED | `page.tsx` renders `WorkspaceShell` with `BuildingScene` as center panel children. Left/right docks are peripheral. `building-scene.tsx` uses `h-full w-full` to fill its panel. |
| LAYOUT-02 | 15-01, 15-02 | User can resize left, right, and bottom dock panels by dragging | SATISFIED (automated portion) | `ResizableHandle withHandle` dividers rendered between left/center (line 96) and center/right (line 127). `onLayoutChanged` persists sizes to store (lines 43-53). Bottom shelf resize not applicable — it is a fixed-height placeholder. Human visual confirmation required for drag interaction. |
| LAYOUT-03 | 15-01, 15-02 | User can collapse/expand dock panels to maximize viewport space | SATISFIED (automated portion) | `DockCollapseButton` wired to `toggleLeftDock`/`toggleRightDock`. Panels collapse via `className="hidden"` (not unmounted). Re-expand buttons appear on viewport edges when dock collapsed (lines 103-122). State persists via Zustand `persist` middleware to `bim-workspace-layout` localStorage key. Human visual confirmation required for interaction feel. |

**Orphaned requirements:** None. REQUIREMENTS.md maps exactly LAYOUT-01, LAYOUT-02, LAYOUT-03 to Phase 15. Both plans claim the same three IDs. Full coverage.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `workspace-shell.tsx` | 83, 149, 161 | Placeholder text ("Left dock (Phase 17)", "Right dock (Phase 17)", "Status bar (Phase 18)") | INFO | Intentional stubs documented in 15-02-SUMMARY.md "Known Stubs". Content migrates in Phases 17 and 18. Does not affect layout shell functionality. |

No blockers or warnings found.

---

### Human Verification Required

The following behaviors cannot be verified programmatically — they require running the dev server and visual inspection:

#### 1. Resizable Dividers Work

**Test:** Run `pnpm dev`, navigate to a building detail page, drag the divider between the left dock and center viewport left and right.
**Expected:** The 3D viewport width updates continuously as the divider moves. Release triggers size persistence.
**Why human:** Drag interaction and visual continuity cannot be checked via static analysis.

#### 2. Dock Collapse / Expand Cycle

**Test:** Click the chevron button on the right edge of the left dock. Then click the re-expand chevron that appears on the left edge of the viewport.
**Expected:** Left dock hides (viewport expands to fill space). Re-expand restores dock to prior width. No layout jump or flash.
**Why human:** CSS `className="hidden"` correctness for react-resizable-panels v4 Panel component requires runtime confirmation — the `hidden` Tailwind class applies `display: none`, but react-resizable-panels v4 may handle hidden panels differently than v1/v2.

#### 3. OrbitControls Isolation

**Test:** Click and drag inside a dock panel (e.g., left dock area). Then click and drag inside the 3D viewport.
**Expected:** Dock click does not move the 3D camera. Viewport drag rotates the scene normally.
**Why human:** Pointer event isolation depends on React Three Fiber canvas event handling and cannot be verified statically.

#### 4. Layout State Persistence

**Test:** Collapse the right dock, refresh the page (F5).
**Expected:** Right dock remains collapsed after reload (persisted via Zustand `persist` to localStorage key `bim-workspace-layout`).
**Why human:** localStorage read requires browser runtime.

---

### Gaps Summary

No gaps. All automated checks pass. The phase goal — viewport-dominant layout with resizable and collapsible docks — is structurally complete and wired. The implementation correctly adapts to react-resizable-panels v4 API (Group/Panel/Separator, `orientation` prop, Layout object keyed by panel id). Four human verification items are listed above to confirm interaction behavior at runtime.

---

_Verified: 2026-03-30T04:00:00Z_
_Verifier: Claude (gsd-verifier)_
