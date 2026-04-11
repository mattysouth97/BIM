# Phase 16: Contextual Toolbar Migration - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

The toolbar reflects the current workflow stage and viewer-overlay.tsx no longer exists as a monolith. This is the highest-risk migration in v3.0 — replacing 603 lines of organic toolbar code with a data-driven stage-keyed system.

</domain>

<decisions>
## Implementation Decisions

### Toolbar Organization
- **D-01:** Data-driven TOOLBAR_CONFIGS map: each WorkflowStage key → array of toolbar item descriptors (icon, label, action, visibility conditions)
- **D-02:** Horizontal strip at the top of the viewport panel (inside WorkspaceShell center panel, above the Canvas)
- **D-03:** Mode indicator as compact badge in the toolbar strip showing current tool name + icon with distinct background color
- **D-04:** Global toolbar section that persists across all stages (view mode toggle, zoom controls) — separate from stage-specific items

### Migration Strategy
- **D-05:** Build contextual-toolbar.tsx in parallel with viewer-overlay.tsx, verify parity, then delete viewer-overlay.tsx in a single commit
- **D-06:** Extract panel state (configPanelOpen, layerPanelOpen, uploadDialogOpen) from building-scene.tsx local state to workspace-store
- **D-07:** Toolbar items trigger actions via direct store calls (e.g., usePlanStore.getState().setDrawingMode('wall')) — no event bus
- **D-08:** Snap controls, floor selector, opening preset selector mapped to "assemble" stage — they're authoring tools

### Claude's Discretion
- Exact toolbar item grouping per stage
- Icon choices for mode indicator
- Toolbar strip height and styling
- How to handle toolbar items that don't cleanly map to a single stage

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture
- `.planning/research/ARCHITECTURE.md` — TOOLBAR_CONFIGS data pattern, contextual-toolbar.tsx design
- `.planning/research/PITFALLS.md` — viewer-overlay.tsx monolith growth risk, mode explosion prevention

### Current Implementation (MUST READ before migration)
- `src/components/viewer/viewer-overlay.tsx` — The 603-line monolith being replaced
- `src/components/viewer/building-scene.tsx` — Contains panel state to extract

### Phase 14 Outputs
- `src/store/workflow-store.ts` — WorkflowStage FSM (drives toolbar stage switching)
- `src/store/workspace-store.ts` — Panel layout state (receives extracted panel state)
- `src/lib/workflow/stages.ts` — Stage definitions and labels

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/store/workflow-store.ts` — WorkflowStage enum and stage switching
- `src/lib/workflow/stages.ts` — STAGE_ORDER, STAGE_LABELS, STAGE_GUARDS
- `src/components/workspace/workspace-shell.tsx` — WorkspaceShell layout (Phase 15)
- `src/store/workspace-store.ts` — Panel open/collapsed state

### Established Patterns
- Zustand stores with `getState()` for action callbacks
- shadcn/ui Button, Select, Badge components
- lucide-react icons throughout the UI

### Integration Points
- viewer-overlay.tsx currently renders inside building-scene.tsx Canvas container
- building-scene.tsx has local useState for configPanelOpen, layerPanelOpen, uploadDialogOpen
- Toolbar reads from plan-store (drawingMode, snapEnabled, etc.), authoring-store (isAuthoring), layer-store (visibility)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The parallel-build-then-delete migration is the critical pattern.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 16-contextual-toolbar-migration*
*Context gathered: 2026-03-30*
