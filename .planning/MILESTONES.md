# Milestones

## v5.0 Energy Systems Observability & Control (Shipped: 2026-04-12)

**Phases completed:** 7 phases (22-28), 16 plans

**Key accomplishments:**

- **MEP sub-layer system:** 4 independently togglable utility sub-layers (electrical/HVAC/lighting/DHW) with persisted visibility state and bilingual labels in expandable layer panel
- **Per-floor energy model:** New calculateSystemBreakdown engine returns per-floor kWh/m² + ASHRAE 90.1 system attribution (HVAC/lighting/DHW/plug) with EnergyDataSource discriminated union
- **Energy breakdown dashboard:** Horizontal recharts BarChart in 5th ConfigPanel "Energy" tab with amber "estimated" badges as TypeScript rendering invariant
- **Energy consumption heatmap:** Per-floor color planes on 3D building keyed to Korean energy grade (1+++ to 7) — separate THREE.Mesh per floor with vertex colors
- **Equipment info panel:** Click any MEP object to inspect inferred specs with Korean efficiency grade (1~5등급) per KS B 6364/KSC IEC 62301; raycaster allocated once via useRef (fixed structural-tooltip per-frame defect)
- **ECO2 sub-system export:** Extended ECO2 export with HVAC type, lighting power density, DHW system fields tagged "estimated-inferred"
- **Distinct procedural MEP equipment:** Visually distinct chiller (cylinder + compressor + pipes), boiler (with flue), AHU (merged duct stubs + TorusGeometry fan ring), DHW tank (with pumps), lighting fixtures (10cm + diffuser face) — InstancedMesh + mergeGeometries keep <10 draw calls per sub-layer
- **Equipment configuration tab:** New Equipment tab with SliderRow controls for procedural parameters across 6 equipment categories — scene updates in real time via reactive Zustand store

**Critical mid-milestone gap fix:** MEP layer generators (CoolingLayer, HeatingLayer, etc.) existed but were never invoked in production. Wired into BuildingLayers via setupMepSubGroups + assignToSubGroup — enabled all Phase 22/26/28 features to actually function.

---

## v4.0 GIS-Composite Realistic Drafts (Shipped: 2026-04-12)

**Phases completed:** 3 phases, 7 plans

**Key accomplishments:**

- Real cadastral footprint extrusion: buildings render with actual VWorld polygon shapes (L-shaped, irregular) instead of rectangular boxes
- proj4 coordinate foundation: site-specific TM projection with <1m accuracy at 2km, solving float32 precision with Korean EPSG:5179
- earcut polygon triangulation: concave and holed polygons triangulate correctly, replacing Three.js ShapeGeometry
- Parallel data fetch: building ledger + VWorld footprint fire simultaneously via useQueries with graceful rectangular fallback
- Facade system on polygon buildings: era-based PBR textures, mullions, panels work on N-sided buildings

---

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
