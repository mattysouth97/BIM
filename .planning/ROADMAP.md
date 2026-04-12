# Roadmap — Korea BIM Energy Management System

## Milestones

- 🚧 **v6.0 Audit Deliverables** — Phases 29-34 (in progress)
- ✅ **v5.0 Energy Systems Observability & Control** — Phases 22-28 (shipped 2026-04-12) — [Archive](milestones/v5.0-ROADMAP.md)
- ✅ **v4.0 GIS-Composite Realistic Drafts** — Phases 19-21 (shipped 2026-04-12) — [Archive](milestones/v4.0-ROADMAP.md)
- ✅ **v3.0 UX Workflow Overhaul** — Phases 14-18 (shipped 2026-03-31)
- ✅ **v2.0 Advanced BIM Authoring** — Phases 10-13 (shipped 2026-03-28) — [Archive](milestones/v2.0-ROADMAP.md)
- ✅ **v1.0 Procedural BIM Viewer** — Phases 1-9 (shipped 2026-03-26)

**Future roadmap:** v7.0 Semantic Substrate → v8.0 Parametric + Collab → v8.5 Visualization → v9.0 Parity + Korean Differentiation. See `.planning/v6-to-v9-ROADMAP-BENCHMARK.md` for full 3-year plan.

### 🚧 v6.0 Audit Deliverables (Phases 29-34)

**Milestone Goal:** Ship visible BIM features that make the tool feel professional — wire annotations + auto-views + schedules + PDF sheets + undo + element IDs. Part 1 of the Revit-benchmarked uplift.

- [ ] **Phase 29: Undo/Redo Resurrection** — Port unmerged undo command-history from worktree; wire Ctrl+Z across all authoring actions
- [ ] **Phase 30: Element IDs (Minimal)** — UUIDv7 + WeakMap registry + userData.elementId on all authored geometry
- [ ] **Phase 31: Annotation Lifecycle** — Store-backed lifecycle for existing 4 annotation stubs with undo + ElementId anchoring
- [ ] **Phase 32: Auto-Generated Views** — Plan/elevation/section views from single 3D model via view-engine + clipping planes
- [ ] **Phase 33: Schedules & CSV Export** — Live filterable tables for Wall/Window/Door/MEP/Room categories; energy calcs read from schedule aggregates
- [ ] **Phase 34: Sheet Composition + PDF Export** — A1/A3 sheets with viewports + title block + @react-pdf/renderer export

### Phase 29: Undo/Redo Resurrection
**Goal**: User can press Ctrl+Z / Ctrl+Shift+Z to undo and redo authoring actions across walls, equipment params, annotations, and layer visibility, with 50 steps of history and same-target edit coalescing
**Depends on**: Phase 28 (v5.0 shipped)
**Requirements**: UNDO-01
**Success Criteria** (what must be TRUE):
  1. Ctrl+Z undoes last authoring action; Ctrl+Shift+Z / Ctrl+Y redoes
  2. 50-step history retained; oldest commands dropped on overflow
  3. Same-target slider edits within 500ms coalesce into one undo step
  4. Keyboard shortcuts respect input focus (no undo while typing in a text input)
  5. All four authoring stores (recipe-store, equipment-store, material-store, layer-store) route mutations through command bus
**Plans**: TBD

### Phase 30: Element IDs (Minimal)
**Goal**: Every authoring-relevant element in the 3D scene carries a stable ElementId used by annotations, schedules, and views to reference it
**Depends on**: Phase 29
**Requirements**: BIM-01
**Success Criteria** (what must be TRUE):
  1. UUIDv7 generator at `src/lib/bim/element-id.ts` returning typed branded strings
  2. Every wall, slab, column, window, door, and MEP instance has `userData.elementId` stamped by its generator
  3. `src/lib/bim/element-registry.ts` offers `get(elementId)` / `getByKind(kind)` / `getByBuildingPk(pk)` lookups backed by WeakMap
  4. ElementIds persist across page reload via serialization
  5. No performance regression on InstancedMesh draw calls (<10 per MEP sub-layer target held)
**Plans**: TBD

### Phase 31: Annotation Lifecycle
**Goal**: User places and edits annotations (dimensions, area labels, level markers, section planes) with undo support; annotations auto-update when anchored elements change
**Depends on**: Phase 30
**Requirements**: ANN-01, ANN-02
**Success Criteria** (what must be TRUE):
  1. `src/store/annotation-store.ts` holds AnnotationInstance records with ElementId anchors; persists via Zustand persist
  2. Existing stubs (dimension-line.ts, area-label.ts, level-marker.ts, section-cut.ts) become pure rendering functions consumed by new AnnotationLayer scene component
  3. New annotation-toolbar with dimension / area / section / level tools routed through undo command bus
  4. Moving/editing an anchored element updates the annotation within one render frame
  5. Deleting an anchored element removes orphan annotations automatically
**Plans**: TBD
**UI hint**: yes

### Phase 32: Auto-Generated Views
**Goal**: User navigates between auto-generated plan, elevation, and section views derived from the single 3D model via a view-switcher UI
**Depends on**: Phase 30
**Requirements**: VIEW-01, VIEW-02
**Success Criteria** (what must be TRUE):
  1. `src/lib/bim/views/view-engine.ts` produces camera + clipping-plane config from per-level elevation + building bounding box
  2. Plan view = orthographic top + clip at level elevation; Elevation = orthographic side; Section = user-placed clip plane
  3. View switcher UI shows one plan-tab per level + 4 elevation tabs + any created section tabs
  4. Section marker placed in a plan view opens a new Section view on click
  5. View state (active view, camera, clipping) round-trips through serialization
**Plans**: TBD
**UI hint**: yes

### Phase 33: Schedules & CSV Export
**Goal**: User views live filterable schedule tables (Wall, Window/Door, MEP, Room) derived from the element registry; edits to element properties update schedules within one frame
**Depends on**: Phase 30
**Requirements**: SCH-01, SCH-02
**Success Criteria** (what must be TRUE):
  1. `src/lib/bim/schedules/schedule-engine.ts` produces ScheduleResult from ScheduleDefinition over element-registry + store state
  2. Four seed schedule templates ship: Wall, Window/Door, MEP Equipment, Room
  3. TanStack Table renders schedules with per-column sort + filter controls in a new SchedulePanel dock
  4. Property edit (wall thickness, U-value, equipment capacity) updates schedule within one render frame
  5. CSV export matches visible filtered rows via `src/lib/export/csv-export.ts`
**Plans**: TBD
**UI hint**: yes

### Phase 34: Sheet Composition + PDF Export
**Goal**: User composes multi-page A1/A3 sheets with views + schedules + Korean GX title block, exportable as a printable PDF
**Depends on**: Phase 32, Phase 33
**Requirements**: SHT-01, SHT-02
**Success Criteria** (what must be TRUE):
  1. `src/components/sheets/sheet-editor.tsx` lets user drag view + schedule viewports onto A1/A3 canvas
  2. Korean GX-format title block template included as a reusable component
  3. Each sheet viewport renders at correct scale (1:50 / 1:100) via offscreen R3F render-target or SVG line extraction
  4. PDF export (`@react-pdf/renderer` via existing `src/lib/report/pdf-renderer.tsx`) produces printable multi-page A1/A3
  5. File size under 5MB for 3-floor building with 2 sheets
**Plans**: TBD
**UI hint**: yes

## Phases

<details>
<summary>✅ v5.0 Energy Systems Observability & Control (Phases 22-28) — SHIPPED 2026-04-12</summary>

- [x] Phase 22: MEP Sub-Layer Foundation (3/3 plans) — completed 2026-04-12
- [x] Phase 23: Per-Floor Energy Model (2/2 plans) — completed 2026-04-12
- [x] Phase 24: Energy Breakdown Dashboard (2/2 plans) — completed 2026-04-12
- [x] Phase 25: Energy Consumption Heatmap (1/1 plan) — completed 2026-04-12
- [x] Phase 26: Equipment Info Panel (2/2 plans) — completed 2026-04-12
- [x] Phase 27: ECO2 Sub-System Export (1/1 plan) — completed 2026-04-12
- [x] Phase 28: Procedural MEP Equipment Models (5/5 plans + gap-wiring) — completed 2026-04-12

</details>

<details>
<summary>✅ v4.0 GIS-Composite Realistic Drafts (Phases 19-21) — SHIPPED 2026-04-12</summary>

- [x] Phase 19: Coordinate System Foundation (2/2 plans) — completed 2026-04-11
- [x] Phase 20: Footprint Extrusion (3/3 plans) — completed 2026-04-11
- [x] Phase 21: Composite Pipeline (2/2 plans) — completed 2026-04-12

</details>

<details>
<summary>✅ v3.0 UX Workflow Overhaul (Phases 14-18) — SHIPPED 2026-03-31</summary>

- [x] Phase 14: Workflow State Foundation (3/3 plans) — completed 2026-03-29
- [x] Phase 15: Workspace Shell Layout (2/2 plans) — completed 2026-03-30
- [x] Phase 16: Contextual Toolbar Migration (3/3 plans) — completed 2026-03-30
- [x] Phase 17: Panel Content + Workflow Stepper (5/5 plans) — completed 2026-03-30
- [x] Phase 18: Guidance + Energy Feedback (3/3 plans) — completed 2026-03-31

</details>

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
