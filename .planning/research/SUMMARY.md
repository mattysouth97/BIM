# Project Research Summary

**Project:** Korean BIM Energy Management System — v3.0 UX Workflow Overhaul
**Domain:** BIM Authoring Workspace UX — Guided Pipeline Retrofit on Existing 3D Editor
**Researched:** 2026-03-30
**Confidence:** HIGH (architecture grounded in direct codebase audit; stack versions npm-verified)

## Executive Summary

v3.0 is a UX layer retrofit, not a ground-up rebuild. The existing validated stack (Next.js 16, React 19, Three.js 0.183, R3F 9, shadcn/ui, Tailwind v4, Zustand v5) stays intact. The problem is structural: a 3D BIM editor has been built with correct per-feature logic but incorrect workspace metaphor. The current "card-per-building" layout actively prevents the tool from feeling like an authoring environment. v3.0 converts it into a viewport-dominant IDE-style workspace with guided workflow stages, dockable panels, and contextual toolbars — using a small set of additive libraries (react-resizable-panels, stepperize, react-hotkeys-hook, @dnd-kit/core, driver.js) that are all React 19 compatible and architecturally consistent with shadcn/ui.

The recommended approach is to build the workspace shell and workflow state machine first, before touching any visible UI. The reason is non-negotiable: seven existing Zustand stores already show early signs of mode-flag fragmentation. Introducing a `workflow-store` as a finite state machine that owns the single source of workflow stage truth is the prerequisite for all subsequent phases. The architecture pattern is additive — two new stores (workflow-store, workspace-store), one new component directory (workspace/), and a migration of viewer-overlay.tsx's 603-line monolith into stage-keyed toolbar configs. All existing R3F scene components, data hooks, and store logic are untouched.

The primary risk is not technical — it is UX tension between guided sequencing and BIM's inherent non-linearity. Implementing a strict linear stepper will frustrate the GX team power users who skip and revisit stages freely. The correct model is a DAG-based stage system with status indicators, not blockers. The second major risk is the viewer-overlay.tsx migration, which must be executed as a parallel-build-then-delete approach rather than incremental extension, to avoid creating a 1200-line file mid-migration.

---

## Key Findings

### Recommended Stack

The existing stack requires no changes. Six new libraries cover the capability gaps for the UX overhaul. All are React 19 verified as of March 2026. The critical compatibility note is `@xyflow/react` (not the deprecated `reactflow` package) which requires a CSS import order fix in globals.css for Tailwind v4. Animation (`motion` package) and full IDE docking (`dockview`) should be deferred — CSS transitions and react-resizable-panels cover the v3.0 requirements without those dependencies.

**New libraries (Phase 1-3 required):**
- `react-resizable-panels ^4.7.6`: Workspace panel splits — zero deps, bvaughn-maintained, shadcn Resizable primitives already wrap it
- `stepperize`: Guided pipeline stepper — headless, shadcn-native, type-safe step definitions with `useStepper` hook
- `react-hotkeys-hook ^5.2.4`: Keyboard shortcuts — React 19 native, scope-aware via HotkeysProvider, replaces ad-hoc window.addEventListener usage
- `@dnd-kit/core ^6.3.1` + `@dnd-kit/sortable ^8.0.0`: Drag-and-drop for component palette and layer list reordering — community standard, `react-beautiful-dnd` is archived

**New libraries (Phase 4+ optional):**
- `driver.js ^1.4.0`: Onboarding tour — framework-agnostic, MIT, 5KB gzip, React 19 compatible; `react-joyride` is NOT React 19 compatible as of March 2026
- `@xyflow/react ^12.10.2`: Node graph editor for property wiring — defer to v4.0; only add if users need Grasshopper-style parameter wiring (GX team doesn't)
- `motion ^12.38.0` (ex framer-motion): Panel animations — defer; CSS transitions are sufficient for v3.0

**What to never add:**
`react-beautiful-dnd` (archived), `react-joyride` (React 19 broken), `reactflow` (deprecated), `@dnd-kit/react` v0.3.x (unstable rewrite), XState (overkill for 5-stage linear pipeline), any second design system.

---

### Expected Features

The benchmark set (Revit 2026, ArchiCAD, Blender, Spline, ShapeDiver, SketchUp) establishes clear table stakes and differentiators for a domain-specific BIM authoring tool.

**Must have — table stakes (P1, v3.0 launch):**
- Viewport-dominant layout — every modern BIM tool makes the 3D view primary; the current card layout is the wrong metaphor
- Guided authoring stepper (4-5 stages: Select Building → Assemble → Configure → Analyze → Export) — core v3.0 thesis
- Selection-aware property panel — click a wall, see its properties; the single highest-value change from v2.0
- Mode indicator + status bar — persistent "current mode" badge and one-line prompt; prevents almost all "I don't know what to do" confusion
- Floor/component outliner — replaces dropdown floor selector with a discoverable tree hierarchy
- Korean building code auto-inference surfaced as visible overridable suggestions — inference engine exists; surfacing it costs little and builds user trust

**Should have — differentiators (P2, post-validation):**
- Export-readiness checklist — shows which ECO2 fields are complete/missing before export
- Contextual help tooltips tied to authoring stage — domain-specific field explanations for GX team auditors
- One-click floor clone affordance — logic exists; needs UX surfacing
- Component catalog with category filters — wrap existing placement system with discoverable UI

**Defer to v3.x+ (P3, high value / high risk):**
- Inline energy feedback (live kWh readout) — requires calculation engine; risk of misleading users with incorrect numbers before ECO2 validation
- Dual-view 2D/3D live sync — requires shared geometry store refactor; current 2D and 3D pipelines are architecturally separate
- Keyboard shortcut map — add based on observed power-user behavior, not upfront

**Explicit anti-features — do not build:**
- Full Grasshopper-style node graph canvas (GX team users are auditors, not parametric designers; use ShapeDiver's approach: expose parameters as sliders)
- Full Revit-style multi-tab ribbon (cognitive overhead with no benefit for 20 core tools)
- Photorealistic rendering mode (conflicts with PROJECT.md's stated goal of structural clarity)
- Real-time multi-user collaboration (CRDT infrastructure for zero current-user benefit)
- AI geometry generation (ground-truth building data from Korean ledger; AI generation undermines analysis validity)

**Critical hidden value — existing features that need UX surfacing:**
Room detection, structural analysis overlay, 10-layer building systems visualization, snap system, axis constraints, and IFC/glTF upload are all implemented but effectively invisible. v3.0 should surface them, not rebuild them.

---

### Architecture Approach

The architecture is strictly additive at the store and component boundary levels. Two new Zustand stores (`workflow-store` as a 5-stage FSM, `workspace-store` for panel layout persistence) coordinate the new workspace layer without modifying any existing stores. A new `src/components/workspace/` directory hosts the workspace chrome (WorkspaceShell, WorkflowStepper, ContextualToolbarStrip, LeftDock, RightDock, BottomShelf). All R3F scene components are untouched. The only risky migration is extracting panel visibility state from `building-scene.tsx` and decomposing `viewer-overlay.tsx` (603 lines, 20+ store subscriptions) into stage-keyed toolbar config data.

**Major components:**
1. `workflow-store` (NEW) — FSM: `WorkflowStage` enum, `STAGE_ORDER` array, `advance()`/`retreat()` with guards, persisted to localStorage
2. `workspace-store` (NEW) — Panel layout state: dock open/collapsed, sizes, persisted to localStorage
3. `WorkspaceShell` (NEW) — Root layout: ResizablePanelGroup wrapping LeftDock + BuildingScene + RightDock + BottomShelf
4. `WorkflowStepper` (NEW) — Breadcrumb/stage nav, reads workflow-store, shows completion status not blockers
5. `ContextualToolbarStrip` (REPLACES viewer-overlay.tsx) — Reads `TOOLBAR_CONFIGS[stage]` data array, thin renderer
6. `TOOLBAR_CONFIGS` data (NEW, in `src/lib/workflow/toolbar-configs.ts`) — Per-stage toolbar item arrays; eliminates conditional JSX ladder
7. `building-scene.tsx` (MODIFIED) — State extraction: `configPanelOpen`, `layerPanelOpen`, `uploadDialogOpen` move to workspace-store

**Key data flow patterns:**
- `workflowStore.stage` → `TOOLBAR_CONFIGS[stage]` → ContextualToolbarStrip renders (no conditional branches in component)
- `workflowStore.stage` → RightDock conditional render switch (PropertiesPanel in "assemble", ConfigPanel in "configure")
- Panel size persistence: `onLayoutChanged` (not `onLayoutChange`) → workspace-store → localStorage
- Building data: server-fetched via `useBuildingDetail`, prop-drilled into WorkspaceShell → BuildingScene (not stored)

---

### Critical Pitfalls

1. **Uncoordinated multi-store mode explosion** — With 7 existing stores each holding boolean mode flags, adding workflow stages without a single FSM authority creates illegal state combinations. Prevention: `workflow-store` as the sole `WorkflowStage` authority before any UI is built. This is a prerequisite, not a refactor.

2. **viewer-overlay.tsx monolith growth** — The file is already 603 lines with 20+ store subscriptions. Extending it with new contextual toolbars will push it to 1200 lines. Prevention: Build `contextual-toolbar.tsx` in parallel with toolbar items as pure data (`TOOLBAR_CONFIGS`); delete `viewer-overlay.tsx` in a single commit after parity is confirmed.

3. **R3F canvas / HTML panel event boundary conflicts** — Clicking an HTML panel button also fires a 3D ray; dragging a panel resize handle also orbits the camera. Prevention: explicit `pointer-events` CSS management + R3F `eventManager.enabled` toggle when panels are active; `OrbitControls enabled={!isPanelOpen}`.

4. **"Guided but flexible" becoming neither** — A strict linear stepper frustrates power users; a bypass button defeats the purpose. Prevention: model stages as a DAG with status indicators (complete/incomplete/skippable), not blockers. The stepper shows the recommended path, not a locked gate. "Expert mode" is just the stepper collapsed — same tools, no mode split.

5. **Panel resize triggering 3D scene re-renders** — Using `onLayoutChange` (fires every pointer move) to update a Zustand store causes 60 React re-renders/second during panel drag, dropping the R3F frame rate. Prevention: use `onLayoutChanged` (fires on drag end only); keep canvas in a CSS flex container, not subscribed to panel size state.

6. **Keyboard shortcuts conflicting with text inputs** — Global `window.addEventListener('keydown')` for BIM shortcuts fires inside material property text fields. Prevention: centralized `useHotkeys` via `react-hotkeys-hook` with `scopes` isolation; `HotkeysProvider` at workspace root; canvas wrapper with `tabIndex={0}`.

7. **Breaking existing GX team workflows** — v2.0 power users have muscle memory for current control positions. Prevention: conduct a v2.0 control location audit before any controls are moved; run all 7 existing Playwright E2E tests against v3.0 layout before merge; add one-time "where did X go?" tooltips for relocated controls.

---

## Implications for Roadmap

Research strongly suggests a 5-phase build order driven by dependency constraints, not feature priority. The workspace foundation must precede any feature work; the panel system must precede toolbar migration; the stepper must come last because it orchestrates what the other phases produce.

### Phase 1: Workflow State Foundation
**Rationale:** Every subsequent phase reads from `workflow-store`. Building any UI before this store exists creates the mode-explosion pitfall. This is the architectural prerequisite.
**Delivers:** FSM store (workflow-store), panel layout store (workspace-store), stage definitions (stages.ts), toolbar config data (toolbar-configs.ts), keyboard shortcut registry skeleton, v2.0 control location audit document
**Addresses:** Table stakes: mode indicator, keyboard shortcut foundation
**Avoids:** Pitfalls 1 (mode explosion), 2 (overlay monolith), 4 (keyboard shortcut conflicts), 9 (breaking existing workflows — audit happens here)
**Research flag:** Standard patterns — no phase research needed. Zustand FSM is well-documented.

### Phase 2: Workspace Shell Layout
**Rationale:** The viewport-dominant layout is the prerequisite for all other features ("viewport-dominant layout is the first prerequisite" per FEATURES.md dependency graph). All authoring tools, panels, and the stepper require the workspace frame to exist first. This phase also establishes the panel/canvas event boundary isolation.
**Delivers:** WorkspaceShell with ResizablePanelGroup, LeftDock/RightDock/BottomShelf slots (empty), page.tsx updated to use WorkspaceShell, panel/canvas event isolation verified
**Addresses:** Table stakes: viewport-dominant layout, object hierarchy/outliner scaffolding
**Avoids:** Pitfalls 3 (canvas/panel event conflicts), 5 (panel resize frame drops), 6 ("guided but flexible" — DAG stage model baked into WorkspaceShell structure), 7 (toolbar layout shift — establish stable toolbar container height)
**Research flag:** Standard patterns — react-resizable-panels + shadcn Resizable is well-documented. One gap: verify `hidden` prop behavior for conditional panel mounting (added in v1.0; confirm version in package.json before building dock collapse logic).

### Phase 3: Contextual Toolbar Migration
**Rationale:** viewer-overlay.tsx is the most dangerous technical debt item. It must be migrated before any new toolbar content is added, or it grows to 1200 lines. Building contextual-toolbar.tsx as a stage-keyed renderer and deleting viewer-overlay.tsx is a contained, high-risk migration that should be a dedicated phase with explicit verification.
**Delivers:** contextual-toolbar.tsx reading TOOLBAR_CONFIGS[stage], building-scene.tsx state extraction (configPanelOpen/layerPanelOpen/uploadDialogOpen → workspace-store), viewer-overlay.tsx deleted
**Addresses:** Table stakes: keyboard shortcuts (wired), mode indicator (visible in toolbar)
**Avoids:** Pitfall 2 (overlay monolith), Pitfall 4 (keyboard shortcuts — all shortcuts registered via react-hotkeys-hook in this phase)
**Research flag:** Standard patterns. Highest implementation risk in the entire project due to viewer-overlay.tsx scope, but the migration path is clear. Needs thorough regression testing against existing E2E tests.

### Phase 4: Panel Content and Workflow Stepper
**Rationale:** With the workspace shell and toolbar in place, panels can be filled with content and the stepper wired to drive dock content changes. This is where the visible v3.0 experience takes shape. Component palette drag-and-drop integration belongs here.
**Delivers:** WorkflowStepper (5-stage breadcrumb nav), selection-aware PropertiesPanel in RightDock, ConfigPanel/LayerPanel moved to dock slots, ComponentPalette in LeftDock with @dnd-kit drag-and-drop, floor/component outliner, EnergyCards in BottomShelf, stage completion flags
**Addresses:** Table stakes: selection-aware property panel, floor/component outliner, Korean code inference as visible suggestions; P2: one-click floor clone affordance, component catalog with filters
**Avoids:** Pitfall 10 (drag-and-drop misfires — use pointer events exclusively, not HTML5 drag API; `isDraggingComponent` flag in workflowStore suppresses canvas click-to-select during drag)
**Research flag:** Needs research during planning for the DnD canvas/HTML handoff pattern. The pointer-event-only approach is documented in PITFALLS.md but implementation details need validation.

### Phase 5: Polish and Validation
**Rationale:** The guided pipeline requires onboarding, status bar prompts, and export-readiness feedback to close the loop for new GX team users. This phase also runs the full regression suite and adds the one-time "where did X go?" migration hints.
**Delivers:** Status bar prompt line, export-readiness checklist, driver.js onboarding tour (triggered from Zustand `hasSeenTour` flag via useHydration), contextual help tooltips keyed to field names, v2.0 migration hint tooltips for relocated controls, all 7 E2E tests passing against new layout
**Addresses:** P2 features: export-readiness checklist, contextual help tooltips; table stakes: status bar
**Avoids:** Pitfall 9 (breaking existing workflows — E2E verification happens here)
**Research flag:** Standard patterns — driver.js + Zustand flag pattern is documented in STACK.md.

---

### Phase Ordering Rationale

- Phases 1-2 are non-negotiable prerequisites. No feature work should begin without the FSM store and workspace layout.
- Phase 3 (toolbar migration) must happen before Phase 4 (panel content) because viewer-overlay.tsx and contextual-toolbar.tsx cannot coexist long-term. Attempting to add panel content while viewer-overlay.tsx still exists creates two competing toolbars.
- Phase 4 groups the stepper and panel content together because the stepper drives panel content changes — building one without the other produces an incomplete UX that can't be tested end-to-end.
- Phase 5 is intentionally last because onboarding and export-readiness require a stable workspace to anchor against.
- @xyflow/react (node graph), dual-view sync, and inline energy feedback are explicitly not in this roadmap — they are v4.0 work requiring dedicated milestones.

---

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (DnD canvas/HTML handoff):** The pointer-event-only drag approach for component-palette-to-3D-scene is described in PITFALLS.md but is a non-obvious implementation. Research the exact event sequencing before writing the implementation spec.
- **Phase 4 (Undo/redo command pattern):** PITFALLS.md identifies undo scope fragmentation as HIGH recovery cost. A command pattern interface should be defined in Phase 1 (interface only) and implemented in Phase 3-4. The roadmap should explicitly block Phase 4 features behind a command-pattern definition checkpoint.

Phases with well-documented standard patterns (skip research-phase):
- **Phase 1:** Zustand FSM, stage array + advance/retreat functions — well-documented, no external library needed
- **Phase 2:** react-resizable-panels + shadcn Resizable — official docs + bvaughn maintenance, established pattern
- **Phase 3:** Stage-keyed toolbar config data pattern — documented in ARCHITECTURE.md with example code
- **Phase 5:** driver.js + Zustand onboarding flag — documented in STACK.md with integration pattern

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All new library versions npm-verified; React 19 compatibility confirmed per library changelogs; one gap: stepperize version number not explicitly pinned (^2.x; verify on install) |
| Features | MEDIUM | Table stakes benchmarked against Revit/ArchiCAD/Blender official docs; differentiators based on GX team use case inference, not direct user interviews — validate with GX team before Phase 4 |
| Architecture | HIGH | Grounded in direct codebase audit of 7 stores, building-scene.tsx (415 lines), viewer-overlay.tsx (603 lines), page.tsx (116 lines). Component inventory and build order derived from actual file structure. |
| Pitfalls | HIGH (code-grounded) / MEDIUM (web-validated) | Pitfalls 1, 2, 3, 4, 5 are grounded in direct code review of the existing codebase. Pitfalls 6, 7 are pattern-based from BIM UX research. |

**Overall confidence:** HIGH for architecture and stack; MEDIUM for feature prioritization pending GX team validation.

---

### Gaps to Address

- **GX team feature validation:** The P2 feature set (export-readiness checklist, contextual help tooltips, component catalog filters) is inferred from the GX team use case, not confirmed via user interviews. Before committing Phase 4 scope, validate which P2 features GX team considers essential vs. nice-to-have.
- **stepperize version pin:** STACK.md lists `^2.x` without a specific version. Run `pnpm add stepperize` and record the installed version before Phase 1 begins.
- **react-resizable-panels `hidden` prop:** ARCHITECTURE.md flags that the `hidden` prop for conditional panel mounting was added in v1.0. Verify the installed version supports this before building dock collapse logic in Phase 2.
- **Undo/redo command pattern scope:** The command pattern interface needs to be designed in Phase 1 but its full scope (which stores, which actions) requires a dedicated design decision. PITFALLS.md identifies this as HIGH recovery cost if deferred — do not skip it.
- **DAG stage model design:** The stage DAG (prerequisites without strict ordering) needs to be explicitly designed before Phase 2. The specific prerequisite rules (e.g., "can't place a component if no floors exist") should be captured in `stages.ts` as guard functions, not inferred later.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase audit: `src/store/` (7 stores), `src/components/viewer/building-scene.tsx`, `src/components/viewer/viewer-overlay.tsx`, `src/app/building/[id]/page.tsx`, `src/lib/korean-building-codes.ts`
- react-resizable-panels v4.7.6: npmjs.com/package/react-resizable-panels (bvaughn, React core team)
- @xyflow/react v12.10.2 React 19 + Tailwind v4: reactflow.dev/whats-new/2025-10-28
- @dnd-kit/core v6.3.1: dndkit.com (community standard, react-beautiful-dnd archived)
- react-hotkeys-hook v5.2.4: npmjs.com/package/react-hotkeys-hook (Jan 2026)
- driver.js v1.4.0: driverjs.com/docs/installation (framework-agnostic, MIT)
- motion v12.38.0: motion.dev/docs/react (React 19 concurrent mode confirmed)
- dockview v5.1.0: npmjs.com/package/dockview (React >=16.8, zero deps)

### Secondary (MEDIUM confidence)
- Autodesk Revit 2026 UI docs: help.autodesk.com/cloudhelp/2026/ENU/Revit-GetStarted/
- Graphisoft ArchiCAD Navigator Palette: help.graphisoft.com/AC/28/INT/
- Blender Human Interface Guidelines: wiki.blender.org/wiki/Human_Interface_Guidelines/Layouts
- Spline UI documentation: docs.spline.design
- ShapeDiver parametric configurator guide: shapediver.com/blog
- Nielsen Norman Group — Modes in UX: nngroup.com/articles/modes/
- react-joyride React 19 incompatibility: github.com/gilbarbara/react-joyride/issues/1151 (issue thread, not official statement)
- stepperize shadcn integration: stepperize.vercel.app + shadcn.io/template

### Tertiary (LOW confidence — needs validation during implementation)
- State Management Trends in React 2025: makersden.io/blog (Zustand vs XState decision boundary)
- R3F/Three.js OrbitControls stopPropagation: github.com/mrdoob/three.js/issues/21339
- react-resizable-panels `hidden` prop: github.com/bvaughn/react-resizable-panels/issues/29

---
*Research completed: 2026-03-30*
*Ready for roadmap: yes*
