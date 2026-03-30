# Phase 17: Panel Content + Workflow Stepper - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can navigate the authoring pipeline through a visible stepper, interact with contextual property panels, browse the scene hierarchy, drag components from a catalog, and undo/redo their actions. This is the largest feature phase in v3.0.

</domain>

<decisions>
## Implementation Decisions

### Workflow Stepper
- **D-01:** Horizontal breadcrumb bar at the very top of WorkspaceShell (above the toolbar) — always visible
- **D-02:** Checkmark icon + green accent for completed stages, current stage highlighted with primary color, future stages dimmed
- **D-03:** All stages always clickable — DAG model, not linear blocker
- **D-04:** stepperize (headless) + custom shadcn-styled breadcrumb — per STACK.md research

### Properties Panel + Selection
- **D-05:** Global selection store (new Zustand store) holding selected element type + ID; right dock reads and renders appropriate property editor
- **D-06:** Wall properties: thickness, material, height, thermal conductivity (editable inline)
- **D-07:** Component properties: preset name, dimensions, position, rotation (editable where applicable)
- **D-08:** Bidirectional outliner — clicking tree selects in 3D (camera focus), clicking 3D highlights in tree

### Undo/Redo Wiring
- **D-09:** v3.0 scope: wall add/remove, component place/remove, material property edits
- **D-10:** Compound undo: beginCompound() before wall add, room detection runs, commitCompound() — single Ctrl+Z
- **D-11:** Ctrl+Z/Y via react-hotkeys-hook at WorkspaceShell level with canvas scope

### Claude's Discretion
- Outliner tree component implementation details
- Component catalog drag-and-drop UX specifics
- Property editor field layout and styling
- Selection highlight color and animation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture
- `.planning/research/ARCHITECTURE.md` — Panel content design, selection state flow
- `.planning/research/UNDO_REDO.md` — Command pattern, CompoundCommand, cross-store undo
- `.planning/research/STACK.md` — stepperize, @dnd-kit/core, react-hotkeys-hook versions

### Phase 14 Outputs (Foundation)
- `src/store/workflow-store.ts` — WorkflowStage FSM (stepper reads this)
- `src/store/workspace-store.ts` — Panel layout + panel open state
- `src/lib/undo/types.ts` — Command interface, CompoundCommand
- `src/lib/undo/command-history.ts` — CommandHistory class

### Phase 15-16 Outputs (Workspace + Toolbar)
- `src/components/workspace/workspace-shell.tsx` — Dock layout (panels render here)
- `src/components/workspace/contextual-toolbar.tsx` — Stage-keyed toolbar
- `src/lib/workflow/toolbar-configs.ts` — TOOLBAR_CONFIGS data

### Existing Stores
- `src/store/plan-store.ts` — Walls, rooms, openings, floors (undo targets)
- `src/store/component-store.ts` — Placed components (undo targets)
- `src/store/material-store.ts` — Material overrides (undo targets)
- `src/store/authoring-store.ts` — Has editHistory skeleton to upgrade

### Component System
- `src/components/viewer/placed-components.tsx` — Component placement rendering
- `src/lib/component-presets.ts` — Preset definitions for doors/windows/MEP/stairs (if exists)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- CommandHistory class (Phase 14) — ready for wiring
- WorkflowStepper will read workflow-store stage
- workspace-store already has dock panel state
- Component presets exist with category filtering

### Established Patterns
- Zustand stores with getState() for callbacks
- shadcn/ui components for all UI
- R3F raycasting for 3D selection (StructuralTooltip pattern)

### Integration Points
- WorkspaceShell left/right dock slots need panel content
- Stepper renders above toolbar in WorkspaceShell
- Selection store bridges 3D scene ↔ right dock properties panel
- @dnd-kit connects catalog panel to 3D scene placement

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 17-panel-content-workflow-stepper*
*Context gathered: 2026-03-30*
