# BIM/Digital Twin Roadmap — Revit-Benchmarked Uplift (v6.0 → v9.0)

## Context

The Korea BIM Energy Management System shipped v5.0 (Energy Systems Observability & Control) on 2026-04-12 with strong differentiators in procedural building generation, Korean regulatory compliance, GIS composite footprints, and MEP equipment modeling. However, benchmarking against Autodesk Revit reveals the app is effectively an **energy-focused digital twin**, not a BIM authoring tool — it lacks the semantic data model (Family/Type/Instance), views/sheets pipeline, schedules, phasing, constraints, and collaboration that define industry-standard BIM.

**User direction confirmed:**
- Ambitious 3-year roadmap (5 milestones)
- Expand user base to include architects (not just GX auditors)
- v6.0 prioritizes **visible features** (annotations, schedules, auto-views) over invisible substrate work
- Procedural/energy heritage is important but flexible — small drift acceptable during refactor

This plan accepts the ordering tension: visible features ship first (v6.0), deep semantic substrate lands second (v7.0) and absorbs whatever short-term hacks v6.0 introduces. That's a deliberate trade — perceived progress beats architectural purity when shipping to real users.

## Guiding Principles

1. **Visible progress every milestone.** No "substrate-only" quarter. Every milestone ships user-facing value.
2. **Web-native, not Revit-clone.** No Electron pivot. Leverage IndexedDB, Web Workers, WASM, OPFS. Where Revit wins (point clouds, Dynamo, partner ecosystem) — we accept and focus on web-native wins (zero-install multiplayer, GIS composite, Korean code native, cloud compute).
3. **Families feed energy, always.** Every new element type must bind to `src/lib/energy/*` calculators. If a family has no thermal property, defer it.
4. **Reuse existing seams.** Annotation stubs, `layer-manager`/`mep-coordinator` sub-groups, `equipment-store` per-PK pattern, `recipe-store` base+overrides merge, `revit-property-map.ts`, and the un-merged undo worktree at `.claude/worktrees/agent-a494a07c/src/lib/undo/` are all proven — extend, don't reinvent.
5. **Korean regulatory gravity.** ECO2, 건축물대장, 녹색건축, KBC, KS standards are first-class throughout.

## Top-Level Milestone Sequence

| Ver | Name | Horizon | Vision |
|---|---|---|---|
| v6.0 | **Audit Deliverables** | Q2–Q3 Y1 | Wire annotations + auto-views + schedules + sheet export. Make the tool audit-grade visible. |
| v7.0 | **Semantic Substrate** | Q4 Y1–Q1 Y2 | Family/Type/Instance data model + undo + parameter registry. Refactor v6.0 on top. |
| v8.0 | **Parametric + Collab** | Q2–Q3 Y2 | WASM constraint solver + family editor + Yjs multiplayer + design options. |
| v8.5 | **Visualization + Conceptual** | Q4 Y2 | Sun studies, path tracing, conceptual mass modeling, DWG/DXF bridge. |
| v9.0 | **Parity + Korean Differentiation** | Y3 | MEP networks, structural analytical, AI copilot, district GIS composite, long-tail families. |

---

## Milestone v6.0 — Audit Deliverables (5 phases)

**Goal:** Ship visible BIM features that make the tool feel professional for GX auditors, before touching the semantic data model.

### Phase 29 — Undo/Redo Resurrection
- **Goal:** Ship Ctrl+Z / Ctrl+Shift+Z across all authoring actions.
- **Approach:** Port the complete undo system from `.claude/worktrees/agent-a494a07c/src/lib/undo/` (command-history.ts, types.ts, commands/, __tests__/) into main. Wire to `recipe-store`, `equipment-store`, `material-store`, layer visibility, annotation creation.
- **Success criteria:** 50-step history; 100-constraint regression test; coalescing of same-target slider edits within 500ms; keyboard shortcut hook respects input focus.
- **Files:** port `src/lib/undo/*` from worktree; add `src/lib/undo/command-bus.ts`; modify authoring stores.

### Phase 30 — Element IDs (Minimal)
- **Goal:** Every addressable element carries a stable `ElementId` so downstream phases can reference them.
- **Approach:** Lightweight — UUIDv7 generator + `userData.elementId` stamped on Three.js objects + a simple `WeakMap`-backed registry. No family/type hierarchy yet (deferred to v7.0). Just enough for annotations + schedules + views to reference elements.
- **Success criteria:** Every wall/slab/column/window/door/MEP instance has `elementId`; registry round-trips through serialization; no perf regression on InstancedMesh draw calls.
- **Files:** add `src/lib/bim/element-id.ts`, `src/lib/bim/element-registry.ts`; modify procedural generators in `src/lib/layers/layer-{1,3,4,5,6,7}-*.ts` and `src/lib/procedural/*`.

### Phase 31 — Annotation Lifecycle
- **Goal:** Wire the existing stubs (`dimension-line.ts`, `area-label.ts`, `level-marker.ts`, `section-cut.ts`) to a store-backed lifecycle with undo and persistence.
- **Approach:** New `src/store/annotation-store.ts` with `AnnotationInstance { id, kind, anchorElementId, params }`. Stubs become pure rendering functions. New `AnnotationLayer` scene component subscribed to the store. Anchors reference `ElementId` so annotations update when the anchored element moves.
- **Success criteria:** User places a dimension between two walls; wall moves, dimension updates; Ctrl+Z removes annotation; annotations persist across page reloads.
- **Files:** add `src/store/annotation-store.ts`, `src/components/viewer/annotation-layer.tsx`; modify the 4 annotation stubs; add annotation commands to undo bus.

### Phase 32 — Auto-Generated Views (Plan/Elevation/Section)
- **Goal:** User switches between plan, 4 elevations, and ad-hoc sections auto-generated from the single 3D model.
- **Approach:** `src/lib/bim/views/view-engine.ts` produces camera + clipping-plane config from building levels + building bbox + `section-cut.ts` planes. Plan = orthographic top + clip at level elevation. Elevation = orthographic side. Section = clip plane from user-placed marker. View switcher UI in top bar. Reuse existing `scene-controls.tsx` presets as the starting point.
- **Success criteria:** User clicks "Plan L1" tab — camera snaps to top ortho + clips at L1 elevation; user places section marker in plan — clicking it spawns a Section view; view state round-trips through serialization.
- **Files:** add `src/lib/bim/views/{view-definition,view-engine,view-store}.ts`, `src/components/viewer/view-switcher.tsx`; modify `src/components/viewer/building-scene.tsx` and `scene-controls.tsx`.

### Phase 33 — Schedules & CSV Export
- **Goal:** Live, filterable tabular reports of elements — Wall schedule, Window/Door schedule, MEP Equipment schedule, Room schedule.
- **Approach:** New `src/lib/bim/schedules/schedule-engine.ts` produces `ScheduleResult` from `ScheduleDefinition { category, columns, filters, sortBy }` over the element registry. Rendered via TanStack Table in a new `SchedulePanel` dock. CSV export reuses `src/lib/export/csv-export.ts`. Energy calculators in `heat-loss.ts` / `annual-demand.ts` read from schedule-derived aggregates (removes hardcoded geometry aggregates).
- **Success criteria:** 4 schedule templates ship; sort/filter works; edit a wall thickness → schedule updates within one frame; CSV download matches visible rows.
- **Files:** add `src/lib/bim/schedules/*`, `src/components/schedules/schedule-table.tsx`, `src/components/schedules/schedule-panel.tsx`; modify `src/lib/energy/{heat-loss,annual-demand}.ts`.

### Phase 34 — Sheet Composition + PDF Export
- **Goal:** Compose views + schedules + Korean title block into A1/A3 sheets printable as PDF.
- **Approach:** New `src/components/sheets/sheet-editor.tsx` 2D canvas with drag-to-place viewports. Each viewport offscreen-renders its source view via R3F render-target. PDF via the existing `@react-pdf/renderer` (`src/lib/report/pdf-renderer.tsx`). Korean GX audit title block template.
- **Success criteria:** User composes 3 views + 1 schedule onto A1 sheet; exports PDF at 1:100 scale; file under 5MB for 3-floor building.
- **Files:** add `src/lib/bim/sheets/*`, `src/components/sheets/*`; extend `src/lib/report/pdf-renderer.tsx`.

**v6.0 unlocks:** audit-grade sheet sets, IFC export (v8+), revision tracking (v8+), phase comparison views (v7+).
**v6.0 defers:** semantic family/type hierarchy, constraint solver, collaboration, phasing, structural analytical model.

---

## Milestone v7.0 — Semantic Substrate (6 phases)

**Goal:** Replace the minimal ElementId + ad-hoc params with a proper Family/Type/Instance data model. Absorb v6.0's short-term hacks. Add architect-grade workflow foundations.

### Phase 35 — Family / Type / Instance Data Model
- **Goal:** `Family → Type → Instance` hierarchy replaces `MepEquipmentParams` JSON-blob pattern. Seed families: Wall, Window, Door, Slab, Column, Roof, Chiller, AHU, Boiler, Pump, LightFixture.
- **Approach:** New `src/lib/bim/families/` defines `FamilyDefinition`, `TypeDefinition` (shared params via structural sharing), `InstanceDefinition` (placement + per-instance overrides). New `family-store.ts` + `instance-store.ts`. Non-destructive migration `migrateV6Elements(pk)` — v6.0 elements without types become "auto-generated" type instances.
- **Success criteria:** v5.0+v6.0 models load unchanged; type swap propagates to all instances; per-instance parameter override works; zero energy drift on regression corpus (40 buildings) after migration.

### Phase 36 — Parameter Registry + Calculated Parameters
- **Goal:** Typed parameter schemas with units (SI + Korean 평/㎡), calculated parameters as pure functions.
- **Approach:** `src/lib/bim/parameters/parameter-registry.ts` with type-safe schema definitions. Energy calcs become `CalculatedParameter` registrations — `uValue` derived from `layerStack`, `annualDemand` derived from recipe + climate, etc. This is what lets schedules and IFC export share one source of truth.
- **Success criteria:** ECO2 export reads from parameter registry (not hardcoded fields); unit conversions round-trip with zero drift; parameter definitions type-check at compile time via template literal types.

### Phase 37 — Levels & Grids as First-Class
- **Goal:** Promote implicit floor indices + `columnSpacing` to typed `Level` + `Grid` entities.
- **Approach:** `src/lib/bim/levels/` and `src/lib/bim/grids/`. Migration reads existing `BuildingGeometry.floors[].elevation` + recipe's `column.spacing`. `level-marker.ts` auto-regenerates from Level instances. Moving a Level propagates to anchored walls/equipment. Grid intersections become snap targets.
- **Success criteria:** Level reparenting propagates; grid bubbles render; existing compositions still look identical.

### Phase 38 — Auto-Updating Tags (Architect-Facing)
- **Goal:** Tags read live from instance parameters (`Wall: 200mm`, `Chiller: AHU-01 / COP 3.2`, `Window: U=1.2 W/m²K`).
- **Approach:** `src/lib/bim/tags/tag-template.ts` token-based templates. `tag-renderer.ts` extends `area-label.ts` canvas-sprite pattern. Subscribes to instance-store; parameter edit re-renders within one frame. View-scoped visibility. 5 built-in templates.
- **Success criteria:** Place tag in Plan L1 → appears only in that view; edit U-value → tag text updates; tag anchored to deleted element self-removes.

### Phase 39 — Dimension & Annotation Authoring UI
- **Goal:** Interactive dimension placement with snap-to-element, area measurement tool, section markers spawn views on click.
- **Approach:** New `src/components/workspace/annotation-toolbar.tsx`. Dimension tool snaps endpoints to wall corners + grid intersections (reuses existing snap infrastructure). Annotations go through undo command bus.
- **Success criteria:** Dimension from wall corner to grid line snaps on click; undo removes last dimension; section marker in plan opens new section view.

### Phase 40 — Energy Re-binding to Parameter Registry
- **Goal:** Rewire all `src/lib/energy/*` calculators to read from parameter registry rather than ad-hoc geometry fields.
- **Approach:** Gradual migration — `heat-loss.ts`, `annual-demand.ts`, `calibration.ts` read U-values, areas, volumes, HVAC types from `ParameterRegistry.get(instanceId, paramId)`. Compatibility shims where needed.
- **Success criteria:** Annual demand delta vs v6.0 < 0.5% on regression corpus (user accepted "small drift" — this is the budget); ECO2 export bit-identical; fidelity assessor still converges.

**v7.0 unlocks:** schedules derive from parameters, IFC export (v8), design options (v8), constraint solver anchors on parameters.

---

## Milestone v8.0 — Parametric + Collaboration (7 phases)

**Goal:** Architect-grade parametric authoring (constraint solver + family editor) + multi-user editing via Yjs + design options + phasing + IFC round-trip.

### Phase 41 — 2D Constraint Solver (WASM)
- **Goal:** Sketch-level geometric constraint solver — coincident/parallel/perpendicular/distance/angle/equal.
- **Approach:** Vendor planegcs WASM port or hand-rolled projected Gauss-Seidel. 500-constraint sketch solves < 16ms. Over/under-constrained feedback. Integrated into annotation/dimension tools.
- **Success criteria:** Constrain a rectangle sketch; edit one dimension → rectangle auto-adjusts; deterministic.

### Phase 42 — Family Editor (In-App)
- **Goal:** User authors new family types from sketches + extrude/sweep/revolve via `three-bvh-csg`.
- **Approach:** In-app family editor panel. Sketch → solid ops via existing CSG deps. Type parameters drive geometry. Saved to `family-store`.
- **Success criteria:** Author custom window family from scratch; instance uses new family; parameters flex geometry.

### Phase 43 — IFC4 Round-Trip Export
- **Goal:** Export semantic instance model to IFC4; preserve property sets from Phase 36 parameter registry.
- **Approach:** `src/lib/ifc/ifc-writer.ts` using existing `web-ifc` WASM in Worker. Shared property dictionary via `revit-property-map.ts`. `IfcPropertySet` naming matches Korean GBI conventions.
- **Success criteria:** Export → re-import preserves geometry within 1% tolerance + U-values exact; round-trip through buildingSMART IFC validator; < 60s export for 100k instances.

### Phase 44 — Phasing (Existing/Demo/New)
- **Goal:** Every instance tagged with phase; filter views/schedules/energy by phase.
- **Approach:** `ElementRecord` gains `phaseCreated` + `phaseDemolished` fields. Phase filter applied as visibility predicate in view-engine + schedule-engine. Energy sim runs per phase producing baseline-vs-retrofit deltas.
- **Success criteria:** Phase selector in view-switcher filters correctly; compliance report auto-renders side-by-side phase comparison.

### Phase 45 — Design Options
- **Goal:** Named branches with copy-on-write instance overrides. 3 alternatives on one project.
- **Approach:** Option set = subset of instance-store with override map. Per-option schedules and views.
- **Success criteria:** User clones option A to B, edits a wall, option A unchanged; energy comparison across options in one schedule.

### Phase 46 — Yjs Collaboration Foundation
- **Goal:** Yjs over WebSocket; multiple editors in one project; presence/awareness; offline + reconcile.
- **Approach:** Yjs Y.Doc per project. Element subtrees as Y.Maps. Constraint graph as Y.Array. y-websocket or Liveblocks (evaluate both). Constraint application is server-mediated in v8 to avoid divergence (CRDT only for parameters + annotations).
- **Success criteria:** 5 concurrent editors; presence cursors; offline edit merges on reconnect; no silent divergence (periodic consistency hash).

### Phase 47 — Worksets + Element Ownership
- **Goal:** Per-discipline worksets with soft element ownership.
- **Approach:** Yjs sub-documents per workset with per-subdoc ACLs. "Sync" = presence + awareness, not central model round-trip.
- **Success criteria:** MEP engineer edits MEP workset; architect edits envelope workset; no conflicts.

---

## Milestone v8.5 — Visualization + Conceptual (5 phases)

**Goal:** Upstream form-finding (mass modeling) + downstream polish (photoreal rendering, sun/daylight, 2D CAD bridge).

### Phase 48 — Conceptual Mass Modeling
- Freeform mass via `three-bvh-csg` + SubD. Convert mass faces to wall/roof families. Sketch mass → energy model computes shell loads.

### Phase 49 — Sun & Shadow Studies
- Time-of-year sun path animations. Shadow accumulation heatmap. PV-potential map extending `src/lib/retrofit/solar-potential`. Annual shadow heatmap for a campus < 10s.

### Phase 50 — PBR Rendering Upgrade
- three-gpu-pathtracer for client-side path tracing on stills. Keep rasterizer for interactive. 1080p path-traced still < 60s.

### Phase 51 — Lighting Analysis
- Daylight factor + LEED-equivalent via Radiance-like simulation on GPU or cloud worker. Ties into `green-certification`.

### Phase 52 — DWG/DXF Bridge
- LibreDWG WASM for DWG read. Pure-JS DXF write from view pipeline. Import a Korean architectural DXF; export plan views as DXF at correct scale.

---

## Milestone v9.0 — Parity + Korean Differentiation (8 phases)

**Goal:** Close the long tail of Revit parity AND double down on what web-native + Korean-native unlocks.

### Phase 53 — Stairs, Railings, Ramps (parametric with KBC code constraints)
### Phase 54 — Rebar & Detailing (KS D 3504 bar bending schedules)
### Phase 55 — Curtain Walls & Panel Systems
### Phase 56 — Rooms/Spaces with Korean 전용면적/공용면적 rules
### Phase 57 — MEP Connected Networks + Flow Calculations
- Pipe/duct/cable tray as connected networks with ports. Auto-route. Pressure drop solver. Pump sizing feeds ECO2 HVAC loads.
### Phase 58 — Structural Analytical Model
- Analytical beams/columns parallel to physical. Export to OpenSees/MIDAS/ETABS text. KBC tags carried.
### Phase 59 — Revit RVT Read (Server-Side)
- Server microservice using IfcOpenShell or commercial RVT→IFC. Client imports resulting IFC transparently.
### Phase 60 — AI Authoring Copilot + Korean Code Intelligence Pack
- LLM-assisted family authoring, schedule creation, code-check narration. Native 건축법/녹색건축/에너지효율등급/화재 code rules with in-model violation annotations and proposed fixes.

---

## Critical Files to Modify / Reuse

**Port from worktree:**
- `.claude/worktrees/agent-a494a07c/src/lib/undo/command-history.ts` → `src/lib/undo/command-history.ts`
- `.claude/worktrees/agent-a494a07c/src/lib/undo/types.ts` → `src/lib/undo/types.ts`
- `.claude/worktrees/agent-a494a07c/src/lib/undo/commands/` → `src/lib/undo/commands/`
- `.claude/worktrees/agent-a494a07c/src/lib/undo/__tests__/` → `src/lib/undo/__tests__/`

**Wire existing stubs:**
- `src/lib/annotations/dimension-line.ts`
- `src/lib/annotations/area-label.ts`
- `src/lib/annotations/level-marker.ts`
- `src/lib/annotations/section-cut.ts`

**Extend existing patterns:**
- `src/store/recipe-store.ts` (base+overrides merge → instance-store template)
- `src/store/equipment-store.ts` (per-PK keyed params → phase-aware instance queries)
- `src/lib/layers/layer-manager.ts` + `src/lib/layers/mep-coordinator.ts` (sub-group pattern → view-scoped visibility graph)
- `src/lib/ifc/revit-property-map.ts` (extend for shared read+write dictionary)
- `src/lib/report/pdf-renderer.tsx` (extend for sheet + audit report export)
- `src/components/viewer/scene-controls.tsx` (existing view presets → v6.0 view engine starting point)

**New top-level directories:**
- `src/lib/bim/` (all semantic model code lands here)
- `src/lib/bim/families/`, `src/lib/bim/parameters/`, `src/lib/bim/levels/`, `src/lib/bim/grids/`, `src/lib/bim/views/`, `src/lib/bim/schedules/`, `src/lib/bim/sheets/`, `src/lib/bim/tags/`, `src/lib/bim/phasing/`, `src/lib/bim/revisions/`

## Risks & Pre-Mortem

1. **v7.0 substrate migration causes energy drift >0.5%.** Mitigation: golden-master corpus of 40 real buildings with expected annual demand outputs built BEFORE Phase 35; CI gate blocks merges with >0.5% drift (user's stated budget).
2. **Constraint solver (Phase 41) never stabilizes → v8.0 slips 2 quarters.** Mitigation: vendor planegcs WASM port instead of hand-rolling; have a "snap-without-solve" fallback that degrades gracefully.
3. **Yjs CRDT on constraint graph causes silent divergence.** Mitigation: constraint application is server-mediated in v8; CRDT only for element parameters + annotations; periodic consistency hash check.
4. **v6.0 visible-features-first creates rework when v7.0 substrate lands.** Accepted trade — user approved visible progress over architectural purity. Non-destructive migration strategy required for every v6.0 store touched.
5. **RVT read in v9.0 blocked by ODA licensing.** Mitigation: server-side IFC conversion only, never native RVT on client. If IfcOpenShell quality is insufficient, commercial converter fallback budgeted.

## Verification Strategy

**Every milestone CI gate:**
- `pnpm build` passes (0 TypeScript errors)
- `pnpm test` all green
- `pnpm lint` clean
- Energy regression corpus runs: annual demand delta < 0.5% per building vs golden master
- Performance budgets enforced: 10k-instance frame ≥ 60fps, view gen < 200ms, schedule re-query < 50ms

**Per-phase verification:**
- Existing GSD phase workflow: CONTEXT → RESEARCH → PLAN → EXECUTE → VERIFICATION.md with success criteria pass/fail
- Playwright e2e for each authoring UX (family creation, view generation, sheet export)
- Property-based tests (fast-check) on constraint solver: random valid sketches, assert stability + convergence

**Milestone-level verification:**
- Audit-grade report generation for 3 real Korean buildings per milestone
- IFC round-trip fuzz test (v8+): generate random element graphs, export, re-import, diff; target zero data loss on supported categories
- Multi-user soak test (v8+): 10-user 8-hour session with scripted edits; assert no divergence + bounded memory

**End-to-end acceptance per milestone:**
- v6.0: User generates plan + elevation + schedule + PDF sheet for a real Seoul building; audit deliverable matches manual-format expectations
- v7.0: User swaps wall type → all instances update → schedule auto-refreshes → energy recalculates → no regression
- v8.0: 3 architects collaborate in one session; constraint-driven dimension edits propagate; IFC export round-trips through buildingSMART validator
- v8.5: User authors conceptual mass → extracts families → energy model computes; path-traced still under 60s
- v9.0: Import Revit RVT (via server) → author rebar → generate Korean-code-native compliance report with AI narration

---

*Plan generated 2026-04-12. User-approved direction: ambitious 5-milestone roadmap, architect expansion, visible features first (v6.0), flexible energy heritage.*
