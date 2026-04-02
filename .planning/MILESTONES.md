# Milestones

## v3.0 UX Workflow Overhaul (Shipped: 2026-04-03)

**Phases completed:** 5 phases, 16 plans

**Key accomplishments:**

- Workflow state foundation: workflow-store (DAG stepper), workspace-store (panel layout), command history (undo/redo) as new Zustand stores
- Workspace shell: resizable three-panel layout with collapsible left/right docks via react-resizable-panels
- Contextual toolbar migration: stage-aware toolbar configs, viewer-overlay.tsx monolith decomposed
- Panel content: SceneOutliner, ComponentCatalog, PropertiesPanel, WorkflowStepper with drag-and-drop
- Guidance + energy feedback: status bar prompts, onboarding tour (driver.js), inline energy delta annotations

---

## v2.0 Advanced BIM Authoring (Shipped: 2026-03-28)

**Phases completed:** 5 phases, 11 plans, 16 tasks

**Key accomplishments:**

- Orthographic plan view with grid overlay, two-point wall drawing tool, and 2D/3D wall rendering via Zustand plan-store
- Vitest + Playwright setup with 79 unit tests covering energy calculations (Korean benchmarks), procedural recipe generation (6 eras), and 3 Zustand stores
- React error boundaries around R3F Canvas/panels plus Korean building code validation on all config sliders and wall drawer length enforcement
- Playwright E2E tests for building flows plus Korean typology and energy grade benchmarks validating BIM accuracy across 3 building types and 3 energy tiers
- `src/lib/plan/room-types.ts`
- Wall-snap opening placement tool with architectural plan symbols (door arc, window parallel lines) and three-bvh-csg boolean subtraction for 3D wall holes
- One-liner:
- snap-engine.ts additions:
- RED:
- One-liner:

---
