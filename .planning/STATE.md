---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: UX Workflow Overhaul
status: executing
stopped_at: Completed 18-01-PLAN.md
last_updated: "2026-03-30T07:52:46.445Z"
last_activity: 2026-03-30
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 16
  completed_plans: 14
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-30)

**Core value:** Structurally accurate 3D building visualization with intuitive guided authoring for energy simulation
**Current focus:** Phase 18 — Guidance + Energy Feedback

## Current Position

Phase: 18 (Guidance + Energy Feedback) — EXECUTING
Plan: 2 of 3
Status: Ready to execute
Last activity: 2026-03-30

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v3.0)
- Average duration: — (no data yet)
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:** No data yet

*Updated after each plan completion*
| Phase 14-workflow-state-foundation P02 | 136 | 1 tasks | 2 files |
| Phase 14-workflow-state-foundation P01 | 15 | 1 tasks | 4 files |
| Phase 14-workflow-state-foundation P03 | 2 | 1 tasks | 3 files |
| Phase 15-workspace-shell-layout P01 | 15 | 2 tasks | 5 files |
| Phase 15-workspace-shell-layout P02 | 5 | 1 tasks | 1 files |
| Phase 16-contextual-toolbar-migration P01 | 230 | 2 tasks | 2 files |
| Phase 16-contextual-toolbar-migration P02 | 8 | 4 tasks | 3 files |
| Phase 16-contextual-toolbar-migration P03 | 20 | 2 tasks | 2 files |
| Phase 17-panel-content-workflow-stepper P01 | 8 | 2 tasks | 3 files |
| Phase 17-panel-content-workflow-stepper P02 | 245 | 2 tasks | 6 files |
| Phase 17-panel-content-workflow-stepper P03 | 12 | 2 tasks | 8 files |
| Phase 17-panel-content-workflow-stepper P04 | 129 | 2 tasks | 3 files |
| Phase 17-panel-content-workflow-stepper P05 | 5 | 2 tasks | 0 files |
| Phase 18-guidance-energy-feedback P01 | 8 | 2 tasks | 4 files |

## Accumulated Context

### Decisions

- v3.0 start: Additive architecture only — workflow-store + workspace-store as new stores, no existing stores modified
- v3.0 start: viewer-overlay.tsx (603 lines) to be deleted in Phase 16, not incrementally extended
- v3.0 start: Stepper uses DAG stage model with status indicators, not blockers — expert mode = stepper collapsed
- v3.0 start: Command pattern interface defined in Phase 14, implemented in Phase 17
- v3.0 start: react-resizable-panels, stepperize, react-hotkeys-hook, @dnd-kit/core, driver.js are the new library set
- [Phase 14-workflow-state-foundation]: workspace-store: exported size constants (LEFT/RIGHT_DOCK_MIN/MAX/DEFAULT) for Phase 15 consumption without drift
- [Phase 14-workflow-state-foundation]: workspace-store: partialize excludes action functions — only 5 layout fields persist to localStorage
- [Phase 14-workflow-state-foundation]: STAGE_GUARDS['export'] is undefined (terminal), canAdvance() returns false when guard is undefined
- [Phase 14-workflow-state-foundation]: Command.update() is optional — commands that don't support coalescing simply omit it
- [Phase 14-workflow-state-foundation]: Compound commands execute sub-commands during batching (not deferred) — commitCompound wraps already-executed commands
- [Phase 14-workflow-state-foundation]: Nested beginCompound() throws an error (no nesting allowed) — simpler than TransactionGroup nesting
- [Phase 15-workspace-shell-layout]: react-resizable-panels v4 uses Group/Panel/Separator (not PanelGroup/PanelResizeHandle) — resizable.tsx adapted for v4 API with stable panel IDs for onLayoutChanged
- [Phase 15-workspace-shell-layout]: Dock collapse uses className=hidden (not conditional JSX) — panels stay mounted to preserve size on re-expand
- [Phase 15-workspace-shell-layout]: DashboardPanel removed from page.tsx — recap/areas data fetching also removed, content migrates to Phase 17 dock slots
- [Phase 15-workspace-shell-layout]: WorkspaceShell page pattern: toolbar h-12 outside, WorkspaceShell wraps viewport content as children
- [Phase 16-contextual-toolbar-migration]: Plan-view sub-panels use absolute positioning below toolbar strip (h-10) rather than inline toolbar items — preserves fixed height and matches viewer-overlay.tsx positional patterns
- [Phase 16-contextual-toolbar-migration]: TOOLBAR_CONFIGS select and export stages are empty arrays — GlobalToolbarSection covers all stages without duplication
- [Phase 16-contextual-toolbar-migration]: Panel state extracted to workspace-store, not persisted — resets on page load by design
- [Phase 16-contextual-toolbar-migration]: BuildingScene uses flex-col layout: ContextualToolbar strip above, viewport div fills remaining space
- [Phase 16-contextual-toolbar-migration]: TOOLBAR_CONFIGS[stage] is the live rendering driver for toolbar strip buttons — data-driven contract established
- [Phase 16-contextual-toolbar-migration]: Store dispatch uses getState() pattern per D-07 — no store imports in toolbar-configs.ts
- [Phase 17-panel-content-workflow-stepper]: stepperize package is scoped as @stepperize/react (v6.1.0) — plan references bare name stepperize which is not on npm
- [Phase 17-panel-content-workflow-stepper]: WorkflowStepper uses defineStepper() for type-safe step defs but drives visual state from useWorkflowStore — stepperize navigation state intentionally unused (DAG model)
- [Phase 17-panel-content-workflow-stepper]: Selection store is NOT persisted — transient, resets on page load
- [Phase 17-panel-content-workflow-stepper]: WallSegment.thermalConductivity added as optional field with default 0.5 W/m·K per D-06
- [Phase 17-panel-content-workflow-stepper]: commandHistory singleton exported from use-undo-shortcut.ts — single global undo stack shared by all authoring tools
- [Phase 17-panel-content-workflow-stepper]: beginCompound/execute/commitCompound pattern used for wall+room atomic undo (not CompoundCommand constructor)
- [Phase 17-panel-content-workflow-stepper]: SceneOutliner shows placed components under Floor 1 only (no floor property on PlacedComponent) — avoids duplication across floors
- [Phase 17-panel-content-workflow-stepper]: buildingPk='' placeholder in WorkspaceShell left dock — wired to actual PK in future integration phase
- [Phase 17-panel-content-workflow-stepper]: Build passes with zero type errors — all Phase 17 components compile correctly and all import wiring verified
- [Phase 18-guidance-energy-feedback]: REGIONAL_CLIMATE table uses 2-digit sido prefix as key — matches GROUND_TEMPERATURES pattern in korean-building-codes.ts
- [Phase 18-guidance-energy-feedback]: StatusBar uses buildingPk='' placeholder in WorkspaceShell — same pattern as SceneOutliner, wired in integration phase

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 14: Verify react-resizable-panels version supports `hidden` prop before Phase 15 dock collapse implementation
- Phase 14: Pin stepperize version on first install (STACK.md lists ^2.x without exact version)
- Phase 16: viewer-overlay.tsx migration is highest-risk item — run full E2E suite before deleting file

## Session Continuity

Last session: 2026-03-30T07:52:46.439Z
Stopped at: Completed 18-01-PLAN.md
Resume file: None
