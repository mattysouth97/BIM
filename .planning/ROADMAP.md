# Roadmap — Korea BIM Energy Management System

## Milestones

- 🚧 **v3.0 UX Workflow Overhaul** — Phases 14-18 (in progress)
- ✅ **v2.0 Advanced BIM Authoring** — Phases 10-13 (shipped 2026-03-28) — [Archive](milestones/v2.0-ROADMAP.md)
- ✅ **v1.0 Procedural BIM Viewer** — Phases 1-9 (shipped 2026-03-26)

## Phases

<details>
<summary>✅ v2.0 Advanced BIM Authoring (Phases 10-13) — SHIPPED 2026-03-28</summary>

- [x] Phase 10: 2D Plan View Engine (1/1 plans) — completed 2026-03-28
- [x] Phase 10.1: QA Testing & BIM Accuracy (3/3 plans) — completed 2026-03-28
- [x] Phase 11: Room Boundaries + 3D Extrusion (3/3 plans) — completed 2026-03-28
- [x] Phase 12: Snap & Alignment System (2/2 plans) — completed 2026-03-28
- [x] Phase 13: Structural Analysis Visualization (2/2 plans) — completed 2026-03-28

</details>

<details>
<summary>✅ v1.0 Procedural BIM Viewer (Phases 1-9) — SHIPPED 2026-03-26</summary>

- [x] Phase 1: Dashboard Layout Redesign
- [x] Phase 2: Structural 3D Components
- [x] Phase 3: Better Textures & Materials
- [x] Phase 4: Procedural Generation Engine
- [x] Phase 5: 10-Layer Building Systems Visualization
- [x] Phase 6: Interactive Configuration Panel
- [x] Phase 7: Energy Calculation & ECO2 Export
- [x] Phase 8: BIM Authoring Tools
- [x] Phase 9: Energy Data Integration

</details>

### 🚧 v3.0 UX Workflow Overhaul (In Progress)

**Milestone Goal:** Redesign the post-selection authoring experience into a guided-but-flexible IDE-style workspace with viewport-dominant layout, contextual toolbars, dockable panels, workflow stepper, undo/redo, and live energy feedback.

- [x] **Phase 14: Workflow State Foundation** — FSM store, workspace store, command interface skeleton (completed 2026-03-29)
- [ ] **Phase 15: Workspace Shell Layout** — Viewport-dominant dock layout with resizable panels
- [ ] **Phase 16: Contextual Toolbar Migration** — Stage-keyed toolbar configs replacing viewer-overlay.tsx
- [ ] **Phase 17: Panel Content + Workflow Stepper** — Filled dock panels, stepper nav, undo/redo, component catalog
- [ ] **Phase 18: Guidance + Energy Feedback** — Status bar, onboarding tour, live energy display

## Phase Details

### Phase 14: Workflow State Foundation
**Goal**: The architectural prerequisites for the entire v3.0 workspace exist as stable, tested stores before any UI work begins
**Depends on**: Phase 13
**Requirements**: (architectural prerequisite — enables all v3.0 requirements)
**Success Criteria** (what must be TRUE):
  1. `workflow-store` exports a `WorkflowStage` enum with 5 stages and `advance()`/`retreat()` functions that refuse illegal transitions
  2. `workspace-store` tracks panel open/collapsed/size state and persists to localStorage across page reloads
  3. A `Command` interface and `CommandHistory` class exist in `src/lib/undo/` with `execute()`, `undo()`, and `redo()` methods (no UI wired yet)
  4. A `stages.ts` file defines the DAG prerequisite guards (e.g., "Assemble requires a building to be selected")
  5. All 7 existing Playwright E2E tests continue to pass against the unchanged UI
**Plans:** 3/3 plans complete
Plans:
- [x] 14-01-PLAN.md — Workflow stage FSM store + DAG guards (stages.ts + workflow-store.ts)
- [x] 14-02-PLAN.md — Workspace panel layout persistence store (workspace-store.ts)
- [x] 14-03-PLAN.md — Command pattern interface + CommandHistory class (src/lib/undo/)

### Phase 15: Workspace Shell Layout
**Goal**: Users see the 3D viewport as the dominant element of the screen with dockable panels around it that can be resized and collapsed
**Depends on**: Phase 14
**Requirements**: LAYOUT-01, LAYOUT-02, LAYOUT-03
**Success Criteria** (what must be TRUE):
  1. The 3D viewer occupies the majority of the screen; no building metadata card obscures or crowds the viewport
  2. User can drag the divider between the left dock and the viewport to resize them; the viewport updates continuously
  3. User can drag the divider between the viewport and the right dock to resize them
  4. User can click a collapse button on the left dock to hide it entirely and reclaim the space for the viewport
  5. User can click a collapse button on the right dock to hide it entirely; clicking again restores it to its previous size
**Plans**: TBD
**UI hint**: yes

### Phase 16: Contextual Toolbar Migration
**Goal**: The toolbar reflects the current workflow stage and viewer-overlay.tsx no longer exists as a monolith
**Depends on**: Phase 15
**Requirements**: CTX-02, CTX-03, FLOW-02
**Success Criteria** (what must be TRUE):
  1. `viewer-overlay.tsx` is deleted from the codebase; all toolbar items have been migrated to `TOOLBAR_CONFIGS` data in `src/lib/workflow/toolbar-configs.ts`
  2. The toolbar visibly changes its available actions when the user moves between workflow stages (e.g., "Analyze" stage shows structural analysis tools, not wall drawing tools)
  3. A persistent mode indicator badge is visible at all times showing the current tool or action (e.g., "Draw Wall", "Select", "Place Door")
  4. All previously working toolbar buttons continue to function correctly after migration
  5. All 7 existing Playwright E2E tests pass against the new toolbar implementation
**Plans**: TBD
**UI hint**: yes

### Phase 17: Panel Content + Workflow Stepper
**Goal**: Users can navigate the authoring pipeline through a visible stepper, interact with contextual property panels, browse the scene hierarchy, drag components from a catalog, and undo/redo their actions
**Depends on**: Phase 16
**Requirements**: FLOW-01, CTX-01, DISC-01, DISC-02, UNDO-01, UNDO-02
**Success Criteria** (what must be TRUE):
  1. A 5-stage stepper (Select Building → Assemble → Configure → Analyze → Export) is visible at the top of the workspace; clicking a stage navigates to it without blocking access to other stages
  2. User clicks a wall, room, or component in the 3D scene and the right dock panel immediately shows that element's editable properties
  3. User can browse a tree outliner in the left dock showing floors, rooms, and placed components; clicking a tree node selects and highlights it in the 3D view
  4. User can drag a door, window, MEP element, or stair from the component catalog in the left dock and drop it into the 3D scene
  5. User presses Ctrl+Z and the last wall draw, component placement, or material edit is undone; pressing Ctrl+Y redoes it
  6. User draws a wall that triggers auto room detection; pressing Ctrl+Z undoes both the wall and the room detection as a single step
**Plans**: TBD
**UI hint**: yes

### Phase 18: Guidance + Energy Feedback
**Goal**: Users always know what to do next via status bar prompts and onboarding, and see live energy impact as they author
**Depends on**: Phase 17
**Requirements**: FLOW-03, DISC-03, ENRG-01, ENRG-02, ENRG-03
**Success Criteria** (what must be TRUE):
  1. A status bar at the bottom of the workspace shows a one-line contextual prompt that changes based on the active tool (e.g., "Click to place — Escape to cancel" when placing a door)
  2. First-time users see a driver.js onboarding tour that highlights the stepper, the viewport, the left dock, and the right dock in sequence; the tour does not replay after it has been completed
  3. A persistent energy status bar shows live kWh/m² that updates within one second of any property change in the configure panel
  4. Property sliders in the configure panel display an inline delta annotation (e.g., "+4.2 kWh/m²") showing the energy impact of the pending change before it is committed
  5. Energy calculations use heating/cooling degree days for the building's actual region (not Seoul HDD defaults); buildings in Busan, Daegu, and Incheon show different baseline kWh/m² values
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 10 | v2.0 | 1/1 | Complete | 2026-03-28 |
| 10.1 | v2.0 | 3/3 | Complete | 2026-03-28 |
| 11 | v2.0 | 3/3 | Complete | 2026-03-28 |
| 12 | v2.0 | 2/2 | Complete | 2026-03-28 |
| 13 | v2.0 | 2/2 | Complete | 2026-03-28 |
| 14. Workflow State Foundation | v3.0 | 3/3 | Complete    | 2026-03-30 |
| 15. Workspace Shell Layout | v3.0 | 0/TBD | Not started | - |
| 16. Contextual Toolbar Migration | v3.0 | 0/TBD | Not started | - |
| 17. Panel Content + Workflow Stepper | v3.0 | 0/TBD | Not started | - |
| 18. Guidance + Energy Feedback | v3.0 | 0/TBD | Not started | - |
