# Phase 15: Workspace Shell Layout - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Users see the 3D viewport as the dominant element of the screen with dockable panels around it that can be resized and collapsed. This phase creates the workspace shell only — panel content is filled in Phase 17.

</domain>

<decisions>
## Implementation Decisions

### Layout Structure
- **D-01:** Center viewport with left/right docks flanking and optional bottom shelf — follows Blender/Revit/Spline IDE pattern
- **D-02:** Left dock starts as empty placeholder (content filled in Phase 17 with outliner + catalog)
- **D-03:** Right dock starts as empty placeholder (content filled in Phase 17 with properties panel)
- **D-04:** Move building header info to a compact bar above viewport; remove card-based layout entirely from building detail page

### Panel Interaction
- **D-05:** Collapse buttons use chevron icon (« / ») on the dock edge — standard IDE pattern
- **D-06:** Bottom shelf exists in Phase 15 as collapsible slot for future energy status bar (Phase 18)
- **D-07:** Panel/canvas event isolation via pointer-events CSS — panels get `pointer-events: auto`, canvas area gets events normally; OrbitControls unaffected when clicking panels
- **D-08:** viewer-overlay.tsx remains as-is in Phase 15 — renders inside viewport center panel. Migration to stage-keyed toolbar happens in Phase 16

### Claude's Discretion
- Exact panel default sizes (use workspace-store defaults: left=18%, right=22%)
- ResizablePanelGroup orientation and nesting
- Responsive breakpoints (if any)
- Bottom shelf default height

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture
- `.planning/research/ARCHITECTURE.md` — WorkspaceShell component design, dock structure, build order
- `.planning/research/PITFALLS.md` — Panel resize frame drops (use onLayoutChanged not onLayoutChange), canvas event isolation

### Stack
- `.planning/research/STACK.md` — react-resizable-panels v4.7.6, shadcn Resizable primitives

### Stores (from Phase 14)
- `src/store/workspace-store.ts` — Panel open/collapsed/size state with persist
- `src/store/workflow-store.ts` — WorkflowStage FSM (read-only in this phase)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/store/workspace-store.ts` — Created in Phase 14, tracks leftDockOpen/rightDockOpen/bottomShelfOpen/sizes with localStorage persist
- `src/components/ui/` — shadcn components including potential Resizable primitives
- `src/components/viewer/building-scene.tsx` — Current R3F Canvas mount point (415 lines)
- `src/app/building/[id]/page.tsx` — Current building detail page layout

### Established Patterns
- Zustand stores with `useHydration()` for SSR
- R3F Canvas with ViewerErrorBoundary wrapper
- shadcn/ui for all UI components

### Integration Points
- page.tsx currently renders BuildingScene directly — needs WorkspaceShell wrapper
- building-scene.tsx contains local state (configPanelOpen, layerPanelOpen, uploadDialogOpen) that should move to workspace-store
- viewer-overlay.tsx renders inside the Canvas viewport and stays in place for Phase 15

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The workspace should feel like a professional IDE/BIM tool (VS Code, Blender, Revit layout).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 15-workspace-shell-layout*
*Context gathered: 2026-03-30*
