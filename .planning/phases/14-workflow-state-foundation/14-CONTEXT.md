# Phase 14: Workflow State Foundation - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

The architectural prerequisites for the entire v3.0 workspace exist as stable, tested stores before any UI work begins. This includes the workflow FSM store, workspace panel state store, command pattern interface for undo/redo, and DAG stage prerequisite guards.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key constraints from research:
- workflow-store uses Zustand with WorkflowStage enum and STAGE_ORDER array — no XState
- workspace-store tracks panel open/collapsed/size state with localStorage persistence
- Command interface follows Three.js editor pattern: execute(), undo(), update() methods
- CommandHistory class with compound command support (beginCompound/commitCompound)
- stages.ts defines DAG prerequisite guards as pure functions
- All 7 existing Playwright E2E tests must continue to pass

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture
- `.planning/research/ARCHITECTURE.md` — Component inventory, build order, data flow patterns
- `.planning/research/UNDO_REDO.md` — Command pattern interface design, cross-store undo architecture

### Stack
- `.planning/research/STACK.md` — Library versions and compatibility notes

### Pitfalls
- `.planning/research/PITFALLS.md` — Mode explosion, store coordination, keyboard shortcut conflicts

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/store/authoring-store.ts` — Has command pattern skeleton with editHistory, needs upgrade to executable Command stack
- `src/store/plan-store.ts` — Wall/room/opening state, snap settings, axis constraints
- `src/store/material-store.ts` — Material property overrides
- `src/store/recipe-store.ts` — Building recipe overrides
- `src/store/component-store.ts` — Placed component instances
- `src/store/layer-store.ts` — 15-layer visibility
- `src/store/app-store.ts` — API key, language (persisted)

### Established Patterns
- Zustand stores with persist middleware for durable state (app-store)
- Non-persisted Zustand for session state (authoring-store, component-store)
- useHydration() hook for SSR hydration mismatch prevention

### Integration Points
- New stores are additive — no existing stores are modified
- workflow-store will be read by future ContextualToolbarStrip and WorkflowStepper
- workspace-store will be read by future WorkspaceShell for panel layout
- Command interface will be wired to Ctrl+Z/Y in Phase 17

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>

---

*Phase: 14-workflow-state-foundation*
*Context gathered: 2026-03-30*
