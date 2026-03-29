# Architecture Research

**Domain:** BIM Energy Management — UX Workflow Overhaul (v3.0)
**Researched:** 2026-03-30
**Confidence:** HIGH (based on direct codebase audit + verified library research)

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Next.js App Router Shell                          │
│  app/building/[id]/page.tsx  (BuildingToolbar + DashboardPanel)      │
├─────────────────────────────────────────────────────────────────────┤
│                    Workspace Layout Layer (NEW)                      │
│  ┌───────────────┐  ┌──────────────────────┐  ┌─────────────────┐   │
│  │ WorkspaceShell│  │ContextualToolbarStrip│  │ WorkflowStepper │   │
│  │ (panel splits)│  │  (stage-aware)       │  │  (pipeline nav) │   │
│  └───────┬───────┘  └──────────┬───────────┘  └────────┬────────┘   │
│          │                     │                        │            │
├──────────┼─────────────────────┼────────────────────────┼────────────┤
│          │           Viewport + Authoring Layer          │            │
│  ┌───────▼────────────────────────────────────────────┐ │            │
│  │  BuildingScene (R3F Canvas)                        │ │            │
│  │  ├── SceneSetup / SAOPostProcessing                │ │            │
│  │  ├── ProceduralBuildingModel / BuildingLayers       │ │            │
│  │  ├── PlanView / WallDrawer / RoomFills              │ │            │
│  │  └── Authoring: ElementSelector / TransformGizmo   │ │            │
│  └─────────────────────────────────────────────────────┘ │            │
├─────────────────────────────────────────────────────────┼────────────┤
│                    Panel Slot System (NEW)               │            │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────┐   │            │
│  │  LeftDock    │ │  RightDock   │ │  BottomSheet   │   │            │
│  │  (Layers,    │ │  (Config,    │ │  (EnergyCards, │   │            │
│  │  Components) │ │  Properties) │ │  StatusBar)    │   │            │
│  └──────────────┘ └──────────────┘ └────────────────┘   │            │
├─────────────────────────────────────────────────────────────────────┤
│                    Zustand Store Layer                               │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ ┌────────────┐  │
│  │ workflow-    │ │ authoring-   │ │  plan-store │ │workspace-  │  │
│  │ store (NEW)  │ │ store        │ │             │ │store (NEW) │  │
│  └──────────────┘ └──────────────┘ └─────────────┘ └────────────┘  │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ ┌────────────┐  │
│  │material-store│ │ recipe-store │ │component-   │ │ layer-store│  │
│  │              │ │              │ │ store       │ │            │  │
│  └──────────────┘ └──────────────┘ └─────────────┘ └────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `WorkspaceShell` | Manages resizable panel splits, slot registration, workspace save/restore | NEW |
| `WorkflowStepper` | Renders the 5-stage pipeline breadcrumb/nav, validates stage completion, handles transitions | NEW |
| `ContextualToolbarStrip` | Replaces current `viewer-overlay.tsx` top-right icon row; renders tool groups based on `workflowStore.stage` | REPLACES viewer-overlay.tsx |
| `workflow-store` | FSM: current stage, completion flags, transition guards, persist to localStorage | NEW |
| `workspace-store` | Panel layout state, dock positions, collapsed states, persist to localStorage | NEW |
| `BuildingScene` | R3F Canvas owner; receives props from WorkspaceShell rather than managing its own panel state | MODIFIED (state extraction) |
| `ConfigPanel` | Material/envelope/HVAC config; becomes a routable dock slot, not an overlay | MODIFIED (slot-aware) |
| `LayerPanel` | Building system layers; becomes a dock slot | MODIFIED (slot-aware) |
| `PropertiesPanel` | Selected element properties; moves to right dock | MODIFIED (slot-aware) |
| `ComponentPalette` | BIM component library; moves to left dock | MODIFIED (slot-aware) |
| `EnergyCards` | Live energy metrics; moves to bottom shelf | MODIFIED (slot-aware) |
| `NodeGraphPanel` | Optional: visual property graph (ReactFlow); placed in right dock when stage = "configure" | NEW (optional) |

---

## Recommended Project Structure

```
src/
├── app/
│   └── building/[id]/
│       └── page.tsx               # Thin shell — passes data to WorkspaceShell
├── components/
│   ├── workspace/                 # NEW: workspace layer
│   │   ├── workspace-shell.tsx    # Root layout: top toolbar + main splits + docks
│   │   ├── workflow-stepper.tsx   # Pipeline breadcrumb (5 stages)
│   │   ├── contextual-toolbar.tsx # Stage-aware toolbar (replaces viewer-overlay)
│   │   ├── left-dock.tsx          # Collapsible left panel (layers, palette)
│   │   ├── right-dock.tsx         # Collapsible right panel (config, properties)
│   │   ├── bottom-shelf.tsx       # Status bar + energy cards
│   │   └── dock-slot.tsx          # Generic slot wrapper (title, collapse, resize)
│   ├── viewer/                    # EXISTING: R3F components — no structural change
│   │   ├── building-scene.tsx     # MODIFIED: remove internal panel open state
│   │   ├── viewer-overlay.tsx     # DEPRECATED: absorb into contextual-toolbar.tsx
│   │   └── ...
│   ├── building/                  # EXISTING: data display cards
│   └── ui/                        # EXISTING: shadcn primitives
├── store/
│   ├── workflow-store.ts          # NEW: FSM stage machine
│   ├── workspace-store.ts         # NEW: panel layout persistence
│   ├── authoring-store.ts         # EXISTING: no change
│   ├── plan-store.ts              # EXISTING: no change
│   ├── material-store.ts          # EXISTING: no change
│   ├── recipe-store.ts            # EXISTING: no change
│   ├── component-store.ts         # EXISTING: no change
│   └── layer-store.ts             # EXISTING: no change
└── lib/
    └── workflow/
        ├── stages.ts              # NEW: stage definitions, valid transitions, guards
        └── toolbar-configs.ts     # NEW: per-stage toolbar item arrays
```

### Structure Rationale

- **`workspace/`:** New directory separates "workspace chrome" from "3D viewport" and "data cards". All panel management lives here, not in building-scene.tsx.
- **`workflow/`:** Stage definitions as pure data. Toolbar configs keyed by stage. Zero coupling to React — testable in isolation.
- **`store/workflow-store.ts`:** Centralizes pipeline state. Single source of truth for "what authoring stage is active" — toolbar, stepper, and panels all read from it.
- **`store/workspace-store.ts`:** Separate from workflow-store because panel layout is a UX preference (persisted), not a workflow guard (not persisted between buildings).

---

## Architectural Patterns

### Pattern 1: Zustand-as-FSM (Workflow State Machine)

**What:** Implement the 5-stage authoring pipeline as a Zustand store with explicit allowed-transition logic. No XState dependency — the codebase already uses Zustand heavily and the state graph is shallow.

**When to use:** When you have fewer than ~10 states and transitions are mostly linear. Introducing XState for a 5-stage linear pipeline adds ~50KB gzip and a new mental model with minimal benefit.

**Trade-offs:** Less formal than XState (no visual state chart), but zero new dependencies and consistent with existing stores. Sufficient for this use case.

**Example:**
```typescript
// src/store/workflow-store.ts
export type WorkflowStage =
  | "select"       // Building chosen, data loading
  | "assemble"     // Wall drawing, floor layout
  | "configure"    // Material props, envelope, HVAC
  | "analyze"      // Structural overlay, energy cards
  | "export";      // ECO2 export, report

export type StageCompletion = Record<WorkflowStage, boolean>;

interface WorkflowState {
  stage: WorkflowStage;
  completion: StageCompletion;
  setStage: (next: WorkflowStage) => void;
  canAdvance: () => boolean;
  advance: () => void;
  retreat: () => void;
}

const STAGE_ORDER: WorkflowStage[] = [
  "select", "assemble", "configure", "analyze", "export"
];

const ADVANCE_GUARDS: Partial<Record<WorkflowStage, (s: WorkflowState) => boolean>> = {
  select:    () => true,    // always can leave select (building loaded by page)
  assemble:  () => true,    // flexible: users can skip drawing
  configure: () => true,
  analyze:   () => true,
};

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      stage: "select",
      completion: { select: false, assemble: false, configure: false, analyze: false, export: false },

      setStage: (next) => set({ stage: next }),

      canAdvance: () => {
        const { stage } = get();
        const guard = ADVANCE_GUARDS[stage];
        return guard ? guard(get()) : false;
      },

      advance: () => {
        const { stage } = get();
        const idx = STAGE_ORDER.indexOf(stage);
        if (idx < STAGE_ORDER.length - 1) set({ stage: STAGE_ORDER[idx + 1] });
      },

      retreat: () => {
        const { stage } = get();
        const idx = STAGE_ORDER.indexOf(stage);
        if (idx > 0) set({ stage: STAGE_ORDER[idx - 1] });
      },
    }),
    {
      name: "bim-workflow-state",
      partialize: (s) => ({ stage: s.stage, completion: s.completion }),
    }
  )
);
```

### Pattern 2: Stage-Keyed Toolbar Configuration

**What:** Define toolbar item groups as pure data arrays keyed by `WorkflowStage`. `ContextualToolbarStrip` reads the current stage from `workflowStore` and renders the matching group. No conditional JSX branches in the toolbar component itself.

**When to use:** When toolbar content changes substantially between stages (≥3 different item sets). Avoids growing `viewer-overlay.tsx`'s 600-line conditional ladder further.

**Trade-offs:** Toolbar items must be serializable descriptors (id, icon, label, action). Complex items that need render hooks need a registry pattern rather than plain data.

**Example:**
```typescript
// src/lib/workflow/toolbar-configs.ts
export interface ToolbarItem {
  id: string;
  icon: LucideIcon;
  labelKo: string;
  labelEn: string;
  action: string;          // dispatched to a command registry
  activeWhen?: string;     // store selector path for active state
  group: "left" | "right" | "view";
}

export const TOOLBAR_CONFIGS: Record<WorkflowStage, ToolbarItem[]> = {
  select:    [...viewPresetItems],
  assemble:  [...viewPresetItems, ...drawingModeItems, ...snapItems],
  configure: [...viewPresetItems, ...annotationItems],
  analyze:   [...viewPresetItems, ...structuralLayerItems],
  export:    [...viewPresetItems, ...exportItems],
};
```

### Pattern 3: Dock Slot System (No External Library)

**What:** Build a minimal panel dock system using `react-resizable-panels` (already available via shadcn's ResizablePanelGroup). Panels register themselves as slots; `WorkspaceShell` decides physical placement. Panel state (open/collapsed/size) lives in `workspace-store`.

**When to use:** When you need 2–3 dockable side panels with collapse, without requiring full IDE-style floating/drag-and-drop docking. The BIM tool needs left + right + bottom panels, all fixed position — not arbitrary floating.

**Trade-offs:** Simpler than Dockview or FlexLayout. Loses arbitrary reordering. Acceptable because the target users (GX team) want consistent panel positions, not custom workspace tiling.

**Example:**
```typescript
// src/components/workspace/workspace-shell.tsx
// Uses ResizablePanelGroup from shadcn (wraps react-resizable-panels)
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

export function WorkspaceShell({ buildingPk, title, floors }: WorkspaceShellProps) {
  const leftOpen = useWorkspaceStore((s) => s.leftDockOpen);
  const rightOpen = useWorkspaceStore((s) => s.rightDockOpen);

  return (
    <div className="flex flex-col h-dvh">
      <WorkflowStepper />
      <ContextualToolbarStrip buildingPk={buildingPk} />
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        {leftOpen && (
          <>
            <ResizablePanel defaultSize={18} minSize={12} maxSize={28}>
              <LeftDock buildingPk={buildingPk} />
            </ResizablePanel>
            <ResizableHandle />
          </>
        )}
        <ResizablePanel className="relative">
          <BuildingScene title={title} floors={floors} />
        </ResizablePanel>
        {rightOpen && (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize={22} minSize={16} maxSize={35}>
              <RightDock buildingPk={buildingPk} />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
      <BottomShelf buildingPk={buildingPk} />
    </div>
  );
}
```

### Pattern 4: Stage-Conditional Panel Content (Right Dock)

**What:** The right dock renders different content based on `workflowStore.stage`. In "assemble" → `PropertiesPanel`. In "configure" → `ConfigPanel` (tabbed). In "analyze" → read-only energy summary. No routing or remounting — use conditional rendering inside the dock.

**When to use:** When panel content transitions are driven by workflow stage, not by user navigation. Avoids URL-based routing for panel slots (adding complexity with no benefit for a single-building workspace).

**Trade-offs:** Shared panel slot means unmounting/remounting on stage change. Mitigate with `key` prop to preserve scroll position within stage, and `display:none` trick for panels that should survive stage switch (e.g., layers panel is always visible regardless of stage).

---

## Data Flow

### Workflow Transition Flow

```
User clicks "Next Stage" in WorkflowStepper
    ↓
workflowStore.advance()
    ↓
stage: "assemble" → "configure"
    ↓
ContextualToolbarStrip re-reads TOOLBAR_CONFIGS["configure"]
    ↓
RightDock reads stage → renders ConfigPanel (replacing PropertiesPanel)
    ↓
WorkflowStepper highlights step 3, dims step 2
```

### Panel State Flow

```
User collapses right dock
    ↓
RightDock calls workspaceStore.setRightDockOpen(false)
    ↓
WorkspaceShell removes ResizablePanel for right dock
    ↓
BuildingScene panel gets full width (ResizablePanelGroup reflows)
    ↓
workspaceStore persists to localStorage (persist middleware)
    ↓
Next session: right dock starts collapsed
```

### Recipe / Material Live Update Flow (existing, unchanged)

```
User edits wall U-value in ConfigPanel
    ↓
recipeStore.setOverride(pk, "facade.uValue", 1.2)
    ↓
BuildingScene re-reads recipeOverrides → recomputes recipe via useMemo
    ↓
ProceduralBuildingModel receives new recipe prop → R3F re-renders
    ↓
EnergyCards re-computes from updated material properties
```

### Key Data Flows

1. **Workflow stage → toolbar:** `workflowStore.stage` → `TOOLBAR_CONFIGS[stage]` → `ContextualToolbarStrip` renders filtered items
2. **Workflow stage → right dock content:** `workflowStore.stage` → `RightDock` conditional render switch
3. **Building data → scene:** `page.tsx` fetches via `useBuildingDetail`, passes `title` + `floors` down to `WorkspaceShell` → `BuildingScene` (no store for this — prop drilling is correct for server-fetched data)
4. **Panel size → persistence:** `workspace-store` persists `leftDockSize`, `rightDockSize`, `bottomShelfOpen` via Zustand `persist` middleware to `localStorage`

---

## New Components Inventory

### New (must build from scratch)

| Component / File | Replaces / Adds | Priority |
|------------------|-----------------|----------|
| `src/store/workflow-store.ts` | New store | P0 — everything depends on this |
| `src/store/workspace-store.ts` | New store | P0 — panels depend on this |
| `src/lib/workflow/stages.ts` | New: stage definitions, order, guards | P0 |
| `src/lib/workflow/toolbar-configs.ts` | New: per-stage toolbar item arrays | P1 |
| `src/components/workspace/workspace-shell.tsx` | New: root layout | P0 |
| `src/components/workspace/workflow-stepper.tsx` | New: pipeline nav | P1 |
| `src/components/workspace/contextual-toolbar.tsx` | Replaces `viewer-overlay.tsx` | P1 |
| `src/components/workspace/left-dock.tsx` | New: left panel host | P1 |
| `src/components/workspace/right-dock.tsx` | New: right panel host | P1 |
| `src/components/workspace/bottom-shelf.tsx` | New: status/energy host | P2 |
| `src/components/workspace/dock-slot.tsx` | New: generic slot wrapper | P1 |

### Modified (refactor required)

| Component | Change Required | Risk |
|-----------|-----------------|------|
| `src/app/building/[id]/page.tsx` | Replace direct `BuildingScene` render with `WorkspaceShell`; pass toolbar/panel state down | LOW — thin file (116 lines) |
| `src/components/viewer/building-scene.tsx` | Remove internal `configPanelOpen`, `layerPanelOpen`, `uploadDialogOpen` local state; receive panel-open flags from `workspace-store` or props from WorkspaceShell | MEDIUM — 415 lines, multiple state extractions |
| `src/components/viewer/viewer-overlay.tsx` | Extract toolbar items to `toolbar-configs.ts`, delete file after `contextual-toolbar.tsx` absorbs functionality | HIGH — 600 lines, must migrate carefully |
| `src/components/viewer/config-panel.tsx` | Remove `visible` prop pattern; render unconditionally inside RightDock slot | LOW — slot handles visibility |
| `src/components/viewer/layer-panel.tsx` | Same as config-panel: remove visibility prop | LOW |
| `src/components/viewer/properties-panel.tsx` | Move into RightDock slot | LOW |
| `src/components/viewer/component-palette.tsx` | Move into LeftDock slot | LOW |
| `src/components/viewer/energy-cards.tsx` | Move into BottomShelf | LOW |

### Untouched (no changes needed)

- All R3F scene components: `ProceduralBuildingModel`, `BuildingLayers`, `PlanView`, `WallDrawer`, `RoomFills`, `FloorSlabs`, `OpeningDrawer`, `AnnotationTools`, `StructuralTooltip`, `ElementSelector`, `TransformGizmo`
- All existing Zustand stores: `authoring-store`, `plan-store`, `material-store`, `recipe-store`, `component-store`, `layer-store`
- All data hooks, API proxies, lib utilities

---

## Build Order (dependency-first)

### Phase 1 — Foundation (no UI, no integration)
**Build first because everything else reads these.**

1. `src/lib/workflow/stages.ts` — Stage enum, order array, guard functions
2. `src/store/workflow-store.ts` — FSM store (reads stages.ts)
3. `src/store/workspace-store.ts` — Panel layout store (independent)
4. `src/lib/workflow/toolbar-configs.ts` — Per-stage toolbar descriptors (reads stages.ts)

### Phase 2 — Workspace Shell
**Structural layout, no content yet. Validates ResizablePanel integration.**

5. `src/components/workspace/dock-slot.tsx` — Generic slot (title bar, collapse button, resize)
6. `src/components/workspace/workspace-shell.tsx` — Root layout with ResizablePanelGroup
7. Update `src/app/building/[id]/page.tsx` — Use WorkspaceShell instead of raw BuildingScene

At end of Phase 2: page renders, 3D viewport is full-width (docks empty), no regression.

### Phase 3 — Contextual Toolbar
**Migrates viewer-overlay.tsx to the new stage-aware system.**

8. `src/components/workspace/contextual-toolbar.tsx` — Reads workflow-store.stage + toolbar-configs
9. Extract state from `building-scene.tsx`: remove `configPanelOpen`/`layerPanelOpen`/`uploadDialogOpen` local state; route these through workspace-store
10. Remove `viewer-overlay.tsx` after toolbar parity confirmed

At end of Phase 3: toolbar works, stage switching changes toolbar groups, no panel content yet.

### Phase 4 — Panel Slots
**Move existing panels into dock slots.**

11. `src/components/workspace/left-dock.tsx` — Hosts LayerPanel + ComponentPalette
12. `src/components/workspace/right-dock.tsx` — Hosts ConfigPanel / PropertiesPanel (stage-conditional)
13. `src/components/workspace/bottom-shelf.tsx` — Hosts EnergyCards + status bar
14. Modify panel components: remove `visible` prop, render unconditionally inside slots

At end of Phase 4: full workspace with docks. Panels collapsible. Layout persists.

### Phase 5 — Workflow Stepper
**Add guided pipeline navigation on top of functional workspace.**

15. `src/components/workspace/workflow-stepper.tsx` — Breadcrumb/step nav, reads workflow-store
16. Wire stage transitions to panel content switches (right dock re-renders per stage)
17. Completion flags: mark stages complete when user takes key actions (e.g., "configure" = complete when at least one override set in recipe-store)

### Phase 6 — Node Graph (optional, deferred)
**Only if configuring building properties as a visual graph is prioritized.**

18. Install `@xyflow/react` (ReactFlow v12)
19. `src/components/workspace/node-graph-panel.tsx` — Property nodes for facade/envelope/HVAC
20. Wire node outputs to `recipeStore.setOverride()` — same as existing ConfigPanel sliders

---

## Integration Points

### Existing Stores — No Breaking Changes

The workflow-store and workspace-store are additive. All existing stores (`authoring-store`, `plan-store`, etc.) are unchanged. The BuildingScene R3F component is modified to *read* panel state from workspace-store rather than holding it in local `useState`, but the R3F scene tree is unaffected.

### viewer-overlay.tsx Migration

This is the highest-risk migration. The 600-line file contains:
- Top-right icon row (toolbar buttons): migrate to `contextual-toolbar.tsx`
- Top-left badges (building name, era): migrate to `workspace-shell.tsx` top bar
- Bottom-left floor info card: migrate to `bottom-shelf.tsx`
- Right-side plan view controls: migrate to `left-dock.tsx` under plan mode
- Section cut slider: migrate to contextual-toolbar as a conditional sub-row

Recommended approach: build `contextual-toolbar.tsx` in parallel, verify parity via side-by-side render test, then delete `viewer-overlay.tsx` in a single commit.

### ResizablePanelGroup Constraint

`react-resizable-panels` (used by shadcn's Resizable primitives) requires the panel group to be a CSS flex/grid container with defined height. The existing `h-dvh` layout in `building/[id]/page.tsx` satisfies this. However, conditional panel mounting (show/hide left dock) must use `display:none` via the `hidden` prop on `ResizablePanel`, not conditional rendering, or the panel group will re-measure and animate a jump. Check shadcn Resizable docs before implementation.

**Confidence:** MEDIUM — react-resizable-panels v0.0.x had an API change in v1.0 (the `hidden` prop was added in v1.0). Verify version in `package.json` before building dock collapse logic.

### Building Scene State Extraction

`building-scene.tsx` owns three pieces of state that must move out:

| Local state | Moves to |
|-------------|----------|
| `configPanelOpen` | `workspace-store.rightDockOpen` |
| `layerPanelOpen` | `workspace-store.leftDockOpen` |
| `uploadDialogOpen` | `workspace-store.uploadDialogOpen` |

The remaining local state (`selectedFloor`, `modelSource`, `uploadedModel`) stays local to `BuildingScene` — it is viewport-specific, not workspace layout.

### Authoring Store + Workflow Store Relationship

`authoring-store.isAuthoring` (boolean toggle) maps to the "assemble" workflow stage. These two should remain separate stores (different concerns: `isAuthoring` is a fine-grained 3D viewport mode; `workflowStore.stage` is the coarse pipeline position). The contextual-toolbar reads both: it shows authoring tools when `stage === "assemble" && isAuthoring`.

---

## Anti-Patterns

### Anti-Pattern 1: Embedding Workflow State in BuildingScene

**What people do:** Put `currentStage` state inside `BuildingScene` alongside the R3F Canvas, since "that's where the toolbar is."

**Why it's wrong:** `BuildingScene` is deeply nested in R3F context. Lifting workflow state up to an R3F component prevents other non-3D panels (right dock, stepper) from reading it without prop-drilling through the Canvas boundary.

**Do this instead:** `workflow-store` is a Zustand store — any component at any depth in the tree reads it directly. WorkspaceShell (parent of BuildingScene) and ContextualToolbar (sibling) both read it with no prop drilling.

### Anti-Pattern 2: Per-Panel Visibility Props

**What people do:** Pass `visible={configPanelOpen}` to panels and return `null` when invisible (current pattern in `config-panel.tsx` and `layer-panel.tsx`).

**Why it's wrong:** Panel components should not know about their own visibility. The slot (dock) controls visibility. Panels rendering `null` lose their internal scroll position and form state on every open/close cycle, causing jarring UX.

**Do this instead:** Panels render unconditionally. The dock slot component wraps them with `display:none` via CSS (or `hidden` attribute) when collapsed. The panel's internal state (active tab, scroll position) survives.

### Anti-Pattern 3: Copying viewer-overlay.tsx Conditionals Into Contextual Toolbar

**What people do:** Copy the existing chain of `{isAuthoring && (...)}` and `{viewMode === "plan" && (...)}` conditionals verbatim into the new toolbar component.

**Why it's wrong:** The current `viewer-overlay.tsx` is a 600-line accumulation of ad-hoc conditions. Copying it perpetuates the same structure with a new filename. The toolbar becomes unmaintainable as more stages are added.

**Do this instead:** Use the `TOOLBAR_CONFIGS` pattern (Pattern 2 above). Each stage declaratively defines its item list. The toolbar component is a thin renderer, not a decision tree.

### Anti-Pattern 4: XState for a 5-Stage Linear Pipeline

**What people do:** Install XState v5 (new major API) to get a "proper" state machine for the workflow.

**Why it's wrong:** XState v5 introduces the actor model (new concept for the team), adds ~25KB gzip, requires wrapping components with `useMachine`, and provides formal visualization that is only valuable when state graphs are complex (≥15 states, parallel regions, history states). A 5-stage linear pipeline with simple guards is fully handled by Zustand with an array-based transition function.

**Do this instead:** `STAGE_ORDER` array + `advance()`/`retreat()` functions in `workflow-store.ts`. Testable with Vitest, zero new dependencies.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| v3.0 scope (current) | WorkspaceShell + 3 dock slots + workflow-store. No ReactFlow node graph. |
| v4.0 (node graph) | Add `@xyflow/react` as opt-in panel in RightDock when stage = "configure". Node graph outputs write to recipeStore — same API as sliders. |
| Multi-building workspace | Add building tabs in WorkspaceShell header. `workspace-store` keyed by `buildingPk`. `workflow-store` keyed by `buildingPk`. |

### Scaling Priorities

1. **First bottleneck:** `building-scene.tsx` state extraction (configPanelOpen, layerPanelOpen). If rushed, creates circular prop-drilling. Fix early in Phase 3.
2. **Second bottleneck:** `viewer-overlay.tsx` deletion. Keeping both in parallel temporarily is fine; keeping both permanently creates two competing toolbars. Set a hard deadline to delete the old file.

---

## Sources

- Direct codebase audit: `src/store/` (7 stores), `src/components/viewer/building-scene.tsx`, `src/components/viewer/viewer-overlay.tsx`, `src/app/building/[id]/page.tsx`
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) — shadcn Resizable primitives (already in project via shadcn)
- [Dockview](https://dockview.dev/) — evaluated for dock system; rejected (overkill for 3-panel layout, ~100KB)
- [XState v5](https://stately.ai/docs/xstate) — evaluated for FSM; rejected for this scope (see Anti-Pattern 4)
- [@xyflow/react (ReactFlow)](https://reactflow.dev) — deferred to Phase 6 / v4.0
- [State Management Trends in React 2025](https://makersden.io/blog/react-state-management-in-2025) — confirms Zustand vs XState decision boundary
- v2.0 Milestone Audit: `.planning/milestones/v2.0-MILESTONE-AUDIT.md` — tech debt items directly informing migration priorities

---

*Architecture research for: Korean BIM Energy Management System — v3.0 UX Workflow Overhaul*
*Researched: 2026-03-30*
