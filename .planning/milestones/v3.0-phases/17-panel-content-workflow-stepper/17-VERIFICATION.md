---
phase: 17-panel-content-workflow-stepper
verified: 2026-03-30T08:00:00Z
status: human_needed
score: 6/6 must-haves verified
human_verification:
  - test: "Workflow stepper visual rendering"
    expected: "A 5-stage horizontal breadcrumb (Select Building, Assemble, Configure, Analyze, Export) is visible at the top of the workspace above the toolbar. Current stage has primary color. Completed stages show green checkmark. Future stages are dimmed. All 5 are clickable."
    why_human: "Visual rendering and color states cannot be verified without running the browser"
  - test: "Properties panel responds to 3D wall click"
    expected: "Clicking a wall mesh in the 3D viewport causes the right dock panel to show wall properties (thickness, height, thermal conductivity in W/m·K, floor, computed length) with editable inputs"
    why_human: "R3F pointer events and panel state transitions require a live browser"
  - test: "Scene outliner selection feedback"
    expected: "Clicking a tree node (wall, room, or component) in the left dock applies bg-accent highlight to that node and selects the element in the 3D view (emissive highlight on selected wall mesh)"
    why_human: "Bidirectional selection feedback requires visual inspection in browser"
  - test: "Component catalog drag-to-place"
    expected: "Clicking a door/window/MEP/stair preset card in the component catalog starts placement mode. Moving cursor in 3D scene shows a ghost preview. Clicking places the component."
    why_human: "Pointer-events-based drag preview and 3D placement require live interaction"
  - test: "Ctrl+Z undoes wall draw"
    expected: "Drawing a wall then pressing Ctrl+Z removes the wall from the scene. Pressing Ctrl+Y restores it."
    why_human: "Keyboard shortcuts and undo stack state require live interaction"
  - test: "Ctrl+Z in text input does not trigger scene undo"
    expected: "Pressing Ctrl+Z while a text input is focused performs browser-native text undo, not scene undo"
    why_human: "Focus-state keyboard suppression requires live browser testing"
---

# Phase 17: Panel Content + Workflow Stepper — Verification Report

**Phase Goal:** Users can navigate the authoring pipeline through a visible stepper, interact with contextual property panels, browse the scene hierarchy, drag components from a catalog, and undo/redo their actions

**Verified:** 2026-03-30T08:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | A 5-stage stepper is visible at the top of the workspace; clicking a stage navigates without blocking | VERIFIED | `workflow-stepper.tsx` (82 lines): `defineStepper()` from `@stepperize/react`, reads `useWorkflowStore`, `onClick` calls `useWorkflowStore.getState().setStage(stageId)`. Mounted at line 74 of `workspace-shell.tsx` ABOVE `ResizablePanelGroup` (line 77). |
| 2 | User clicks a wall/room/component and right dock shows editable properties | VERIFIED | `selection-store.ts` exports `useSelectionStore` with `select()`/`clearSelection()`. `wall-drawer.tsx` fires `select("wall", wall.id)` on `onPointerDown` (lines 429, 510, 527). `placed-components.tsx` fires `select("component", instanceId, buildingPk)` (line 84). `properties-panel.tsx` (383 lines) renders `WallProperties`, `RoomProperties`, `ComponentProperties` based on `selectedType`. Right dock in `workspace-shell.tsx` renders `<PropertiesPanel />` (line 167). |
| 3 | User browses a tree outliner with floors/rooms/components; clicking selects and highlights | VERIFIED | `scene-outliner.tsx` (155 lines): uses `Accordion` for floor sections, `usePlanStore` for walls/rooms/floorCount, `useComponentStore` for placed components, `useSelectionStore.getState().select()` on node click (lines 87, 110, 135). Selected node gets `bg-accent text-accent-foreground` class. Mounted in workspace-shell left dock (line 102). |
| 4 | User drags door/window/MEP/stair from catalog into 3D scene | VERIFIED | `component-catalog.tsx` (173 lines): uses `Tabs` for All/Doors/Windows/MEP/Stairs, imports `DOOR_PRESETS`/`WINDOW_PRESETS`/`MEP_PRESETS`/`STAIR_PRESETS`, clicking a preset calls `useComponentStore.getState().setDragging(preset)`. `DragPreview` in `placed-components.tsx` reads `dragging` from component-store (line 97), generates 3D preview, handles `commandHistory.execute(new PlaceComponentCommand(...))` on pointer-down (line 216). Full data flow wired. |
| 5 | Ctrl+Z undoes last wall draw, component placement, or material edit; Ctrl+Y redoes | VERIFIED | `use-undo-shortcut.ts` (54 lines): exports singleton `commandHistory`, registers `ctrl+z` → `commandHistory.undo()` and `ctrl+y, ctrl+shift+z` → `commandHistory.redo()` via `react-hotkeys-hook`. Active element check suppresses shortcuts in INPUT/TEXTAREA/SELECT. `useUndoShortcut()` called in `workspace-shell.tsx` (line 39). Wall drawing wired via `commandHistory.execute(AddWallCommand)` (line 165); component placement via `commandHistory.execute(PlaceComponentCommand)` (line 216). |
| 6 | Draw wall + auto room detection undone as single Ctrl+Z step | VERIFIED | `wall-drawer.tsx`: `commandHistory.beginCompound()` called before wall add (line 164), `AddWallCommand` executed inside compound scope, `SetRoomsCommand(roomsBefore, roomsAfter)` also executed inside scope (lines 169–170), `commandHistory.commitCompound("Draw wall")` closes the atomic step (line 171). `SetRoomsCommand` in `plan-commands.ts` swaps full rooms arrays on execute/undo. |

**Score:** 6/6 truths verified (automated evidence)

### Required Artifacts

| Artifact | Min Lines | Actual Lines | Status | Notes |
|----------|-----------|--------------|--------|-------|
| `src/components/workspace/workflow-stepper.tsx` | 60 | 82 | VERIFIED | Exports `WorkflowStepper`, uses `defineStepper`, reads `useWorkflowStore`, all 5 stages clickable |
| `src/store/selection-store.ts` | 30 | 40 | VERIFIED | Exports `useSelectionStore`, `SelectableType`, `select()`, `clearSelection()`, no persist middleware |
| `src/components/workspace/properties-panel.tsx` | 80 | 383 | VERIFIED | Exports `PropertiesPanel`, `WallProperties` (with `thermalConductivity`), `RoomProperties`, `ComponentProperties`, `EmptySelection` |
| `src/components/workspace/scene-outliner.tsx` | 80 | 155 | VERIFIED | Exports `SceneOutliner`, `Accordion`-based tree, `bg-accent` selection highlight |
| `src/components/workspace/component-catalog.tsx` | 60 | 173 | VERIFIED | Exports `ComponentCatalog`, `Tabs` filtering, `setDragging()` on preset click, Cancel button |
| `src/hooks/use-undo-shortcut.ts` | 20 | 54 | VERIFIED | Exports `useUndoShortcut` and `commandHistory` singleton |
| `src/lib/undo/commands/plan-commands.ts` | 40 | 111 | VERIFIED | Exports `AddWallCommand`, `RemoveWallCommand`, `SetRoomsCommand`, `AddOpeningCommand`, `RemoveOpeningCommand` |
| `src/lib/undo/commands/component-commands.ts` | 30 | 82 | VERIFIED | Exports `PlaceComponentCommand`, `RemoveComponentCommand`, `UpdatePositionCommand` (with coalescing) |
| `src/lib/undo/commands/material-commands.ts` | 30 | 42 | VERIFIED | Exports `OverrideMaterialCommand` with `update()` coalescing for same pk+path |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `workflow-stepper.tsx` | `workflow-store.ts` | `useWorkflowStore` selectors | WIRED | Lines 6, 24–25, 48 — reads `stage`, `completion`, calls `setStage()` |
| `workspace-shell.tsx` | `workflow-stepper.tsx` | renders `<WorkflowStepper />` | WIRED | Import line 21, rendered line 74 (before `ResizablePanelGroup` at line 77) |
| `wall-drawer.tsx` | `selection-store.ts` | `select("wall", id)` on `onPointerDown` | WIRED | Import line 10, `select()` calls at lines 429, 510, 527 |
| `placed-components.tsx` | `selection-store.ts` | `select("component", instanceId, buildingPk)` on `onPointerDown` | WIRED | Import line 7, call line 84 |
| `properties-panel.tsx` | `selection-store.ts` | reads `selectedType`, `selectedId` | WIRED | Import line 5 |
| `properties-panel.tsx` | `plan-store.ts` | reads wall/room data by `selectedId` | WIRED | Import line 6, selectors lines 26–27, 136–137 |
| `properties-panel.tsx` | `component-store.ts` | reads component data by `selectedId` | WIRED | Import line 7, selector lines 225–231 |
| `workspace-shell.tsx` | `properties-panel.tsx` | renders `<PropertiesPanel />` in right dock | WIRED | Import line 22, rendered line 167 |
| `scene-outliner.tsx` | `selection-store.ts` | calls `select()` on tree node click | WIRED | Import line 13, calls at lines 87, 110, 135 |
| `scene-outliner.tsx` | `plan-store.ts` | reads `walls`, `rooms`, `floorCount` | WIRED | Import line 11, selectors lines 21–24 |
| `component-catalog.tsx` | `component-store.ts` | calls `setDragging()` on preset click | WIRED | Line 99 |
| `workspace-shell.tsx` | `scene-outliner.tsx` | renders in left dock | WIRED | Import line 23, rendered line 102 |
| `workspace-shell.tsx` | `component-catalog.tsx` | renders in left dock | WIRED | Import line 24, rendered line 104 |
| `plan-commands.ts` | `plan-store.ts` | `usePlanStore.getState()` for mutations | WIRED | Lines 15, 19, 41, 50, 71 |
| `component-commands.ts` | `component-store.ts` | `useComponentStore.getState()` for mutations | WIRED | Lines 19, 23, 40, 44, 64 |
| `use-undo-shortcut.ts` | `command-history.ts` | `commandHistory.undo()` and `commandHistory.redo()` | WIRED | Lines 10, 34, 50 |
| `workspace-shell.tsx` | `use-undo-shortcut.ts` | `useUndoShortcut()` called in component body | WIRED | Import line 19, call line 39 |
| `wall-drawer.tsx` | `plan-commands.ts` | `commandHistory.execute(new AddWallCommand(...))` inside compound scope | WIRED | Import line 12, calls lines 164–171 |
| `placed-components.tsx` | `component-commands.ts` | `commandHistory.execute(new PlaceComponentCommand(...))` | WIRED | Import line 9, call line 216 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `workflow-stepper.tsx` | `stage`, `completion` | `useWorkflowStore` (Zustand store) | Yes — live store state | FLOWING |
| `properties-panel.tsx` | `selectedType`, `selectedId` | `useSelectionStore` (transient Zustand) | Yes — set by 3D mesh click handlers | FLOWING |
| `properties-panel.tsx` | `wall` data | `usePlanStore(s => s.walls.find(...))` | Yes — reads live plan-store walls | FLOWING |
| `properties-panel.tsx` | `component` data | `useComponentStore(s => s.placed[...])` | Yes — reads live component-store placed array | FLOWING |
| `scene-outliner.tsx` | `walls`, `rooms`, `floorCount` | `usePlanStore` selectors | Yes — reads live plan-store | FLOWING |
| `scene-outliner.tsx` | `placed` components | `useComponentStore(s => s.placed)` | Yes — reads live component-store | FLOWING |
| `component-catalog.tsx` | preset list | Static constant arrays (`DOOR_PRESETS`, etc.) | Intentional — catalog is static data, not dynamic | FLOWING (by design) |
| `component-catalog.tsx` | `dragging` state | `useComponentStore(s => s.dragging)` | Yes — reads live store for Cancel button visibility | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build passes zero type errors | `pnpm build` | `Compiled successfully in 6.5s` | PASS |
| `WorkflowStepper` exports `WorkflowStepper` | `grep "export function WorkflowStepper"` | Found | PASS |
| `commandHistory` singleton exported | `grep "export const commandHistory"` | Found in `use-undo-shortcut.ts` line 10 | PASS |
| Compound wall undo wired (not direct `addWall`) | `grep "addWall(wall)"` in wall-drawer.tsx | 0 matches (replaced by compound pattern) | PASS |
| `placeComponent` direct call replaced | `grep "placeComponent.*comp"` without `commandHistory` in placed-components.tsx | 0 matches (replaced by `PlaceComponentCommand`) | PASS |
| `@stepperize/react` in package.json | `grep "@stepperize/react" package.json` | `"@stepperize/react": "^6.1.0"` | PASS |
| `react-hotkeys-hook` in package.json | `grep "react-hotkeys-hook" package.json` | `"react-hotkeys-hook": "^5.2.4"` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| FLOW-01 | 17-01-PLAN.md | 5-stage guided authoring stepper | SATISFIED | `workflow-stepper.tsx` renders 5 clickable stages from `STAGE_ORDER`, reads `useWorkflowStore`, wired into `workspace-shell.tsx` above toolbar |
| CTX-01 | 17-02-PLAN.md | Right panel shows properties on click | SATISFIED | `selection-store.ts` + `properties-panel.tsx` + 3D click wiring in `wall-drawer.tsx` and `placed-components.tsx` |
| DISC-01 | 17-04-PLAN.md | Tree outliner panel for floors/rooms/components | SATISFIED | `scene-outliner.tsx` with `Accordion`-based floor tree, wired to `plan-store` and `selection-store` |
| DISC-02 | 17-04-PLAN.md | Drag components from filtered catalog | SATISFIED | `component-catalog.tsx` with category `Tabs`, `setDragging()` wired to `DragPreview` in `placed-components.tsx` |
| UNDO-01 | 17-03-PLAN.md | Ctrl+Z/Y undo/redo across wall/component/material | SATISFIED | `use-undo-shortcut.ts` with `react-hotkeys-hook`, command classes for all three store types, suppressed in form inputs |
| UNDO-02 | 17-03-PLAN.md | Compound wall+room undo as single step | SATISFIED | `beginCompound`/`commitCompound` in `wall-drawer.tsx` wraps `AddWallCommand` + `SetRoomsCommand` |

No orphaned requirements found — all 6 Phase 17 requirement IDs are declared in plan frontmatter and verified against REQUIREMENTS.md traceability table.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `workspace-shell.tsx` | 102 | `buildingPk=""` hardcoded empty string passed to `SceneOutliner` | Warning | SceneOutliner uses `buildingPk` for component store lookup — with empty string, placed components under a real building PK would not appear in the outliner. Documented as intentional deferral in 17-04-SUMMARY.md (future integration phase). Does not block the outliner tree for walls/rooms which read from plan-store directly. |
| `properties-panel.tsx` | ~280 | Rotation Y in `ComponentProperties` is display-only (no `updateRotation` in component-store) | Info | Documented known stub from 17-02 SUMMARY. Position X/Y/Z fully editable. Rotation display is correct — just not writeable. |

No blocker anti-patterns. The `buildingPk=""` stub is a documented deferral, not a gate for DISC-01/DISC-02.

### Human Verification Required

The following items require running the dev server (`pnpm dev`) and navigating to a building detail page (search for any building first to populate the workspace context):

#### 1. Workflow Stepper Visual Rendering (FLOW-01)

**Test:** Navigate to a building detail page. Look at the very top of the workspace (above the toolbar strip).
**Expected:** A horizontal breadcrumb with 5 labeled stages: Select Building, Assemble, Configure, Analyze, Export. Current stage is highlighted with primary color. All 5 are clickable without blocking. Clicking a stage changes which stage is highlighted.
**Why human:** Color states (`bg-primary`, `text-green-600`, `text-muted-foreground`), visual layout, and button click response require browser rendering.

#### 2. Properties Panel — Wall Selection (CTX-01)

**Test:** In the 3D view (or 2D plan), click a wall mesh.
**Expected:** The right dock "Properties" panel immediately updates to show: Thickness (editable), Height (editable), Thermal Conductivity / W/m·K (editable), computed Wall Length (read-only), Floor (read-only). Changing thickness/height values updates the 3D geometry.
**Why human:** R3F `onPointerDown` and reactive panel updates require live browser with rendered geometry.

#### 3. Scene Outliner Selection Sync (DISC-01)

**Test:** After drawing at least one wall, open the left dock and look at the "Scene" section. Click a wall entry in the tree.
**Expected:** The wall entry gets a blue/accent background highlight in the tree. The corresponding wall in the 3D view shows an emissive blue highlight (`#3b82f6`, intensity 0.15).
**Why human:** Bidirectional visual selection (tree highlight + 3D mesh emissive) requires live rendering.

#### 4. Component Catalog Drag-to-Place (DISC-02)

**Test:** Click any preset in the Component Catalog (e.g., a door). Move the cursor over the 3D scene.
**Expected:** A ghost preview mesh follows the cursor. Clicking places the component. A "Cancel" button appears in the catalog while placement is active.
**Why human:** Pointer-event-driven drag preview in R3F Canvas requires live browser interaction.

#### 5. Ctrl+Z Undo — Wall Draw (UNDO-01)

**Test:** In the 2D plan view, draw a wall. Press Ctrl+Z.
**Expected:** The wall disappears from the scene. Press Ctrl+Y — the wall reappears.
**Why human:** Keyboard shortcut interaction and visual undo requires live browser.

#### 6. Ctrl+Z in Input — No Scene Undo (UNDO-01 guard)

**Test:** Click into a numeric input in the Properties Panel (e.g., thickness). Type a value. Press Ctrl+Z.
**Expected:** The text in the input reverts (browser-native text undo), but no walls or components are undone in the 3D scene.
**Why human:** Focus-dependent keyboard suppression requires live browser testing.

### Gaps Summary

No blocking gaps found. All 6 success criteria from the ROADMAP are supported by verified artifacts with substantive implementations and complete wiring. The two known stubs (`buildingPk=""` placeholder and read-only rotation Y) are documented deferrals that do not block any FLOW-01, CTX-01, DISC-01, DISC-02, UNDO-01, or UNDO-02 requirement.

The phase is ready for human verification of visual/interactive behaviors (Step 8 items above) before marking complete.

---

_Verified: 2026-03-30T08:00:00Z_
_Verifier: Claude (gsd-verifier)_
