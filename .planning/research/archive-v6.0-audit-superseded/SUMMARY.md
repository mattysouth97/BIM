# Project Research Summary

**Project:** Korean BIM Energy Management System -- v5.0 Energy Systems Observability and Control
**Domain:** Energy observability layer added to an existing Next.js + Three.js + React Three Fiber BIM viewer
**Researched:** 2026-04-12
**Confidence:** HIGH (all integration points verified against actual codebase files)

---

## Executive Summary

v5.0 is an additive energy observability milestone on top of a mature, production BIM viewer.
The existing codebase already has a 5-layer system, a working energy calculation engine
(calculateAnnualDemand, energy-grade.ts, useEnergyMetrics), material property overrides, and
actual consumption data from the data.go.kr API. The missing pieces are: individual MEP sub-layer
toggles (the single MEP group hides all utility systems), a visual energy heatmap on 3D building
geometry, an equipment data model with hover info panels, a system-level breakdown dashboard
(HVAC vs lighting vs DHW vs plug loads), and a scenario/what-if analysis mode. Research confirms
all six new capabilities can be built with exactly one new runtime library (recharts 3.8.1 via
shadcn chart) and additive slices in three existing Zustand stores -- no new store files, no new
service layers, no architectural overhaul.

The recommended approach is surgical: keep the existing LayerId union at 5 entries and model MEP
sub-systems as nested child groups inside the existing mep THREE.Group, driven by a new parallel
mepSubVisibility record in layer-store. The energy heatmap lives exclusively in the existing
energy-zones group as independent THREE.Mesh floor planes with vertex color buffers -- never on
the structural InstancedMesh. Equipment control and scenario state are transient (not persisted),
isolated from the committed material-property overrides that feed ECO2 export. The six new
capabilities form a linear dependency chain that maps directly to six implementation phases.

The dominant risk for this milestone is correctness theater: the sub-system breakdown (HVAC %,
lighting %, DHW %) is necessarily model-estimated using ASHRAE 90.1 building-type ratios because
the API returns only building-level totals -- not sub-metered data. If these ratio-derived numbers
appear in the same UI as actual consumption data without unambiguous labeling, GX energy auditors
will make incorrect retrofit recommendations. The mitigation is an EnergyDataSource type enforced
at the TypeScript level throughout every hook, component, and export that touches energy values.
Every estimated value must carry a visible amber label; only blue label values derive from the actual API.

---

## Key Findings

### Recommended Stack

The existing stack (Next.js 16.2, React 19.2, Three.js 0.183, R3F 9, @react-three/drei 10,
Zustand 5, TanStack Query 5, shadcn/ui, Tailwind v4, postprocessing 6.39) is unchanged. v5.0
requires exactly one new runtime dependency.

**New library:**
- recharts ^3.8.1: Dashboard charting (bar, donut, area) -- shadcn/ui official chart primitive
  wraps Recharts; React 19 compat confirmed (recharts#4558); shadcn v3 compat confirmed
  (#7669/PR #8486). Install: pnpm add recharts@^3.8.1 + npx shadcn@latest add chart.

**No new library needed for:**
- 3D energy heatmap -- standard THREE.Mesh with vertexColors: true and Float32BufferAttribute
- Heatmap color gradient -- 7-anchor linear interpolation between Korean grade thresholds
- Equipment data model -- plain TypeScript interfaces in src/lib/energy/equipment-specs.ts
- Scenario/equipment state -- Zustand slices added to workflow-store and recipe-store
- MEP sub-layer visibility -- MepSubLayerId type + mepSubVisibility record in layer-store
- Per-floor energy math -- optional extension to calculateAnnualDemand() with returnPerFloor

**Hard avoids:** d3/visx/nivo (rendering model conflicts), heatmap.js (2D canvas only),
mqtt.js/IoT libraries (GX team has no sensor access), zustand/middleware/immer (mixes with
existing spread-merge pattern), new Zustand store files (cross-store subscription cascade risk).

### Expected Features

**Must have -- v5.0 core (P1):**
- MEP sub-layer toggles (electrical, HVAC, lighting, DHW) -- 15 generator files already exist,
  gap is the store/type layer only
- Energy consumption heatmap (per-floor) -- floor planes color-coded by kWh/m2 using existing
  energy-zones group; Korean grade color scale (Grade 1+++ blue to Grade 7 red)
- Energy breakdown dashboard (HVAC/lighting/DHW/plug) -- ASHRAE 90.1 ratios by Korean building
  use type; amber labels on all estimated values
- Equipment info panel (hover to inferred specs) -- raycasting on MEP sub-group meshes; data
  inferred from building ledger; reuses structural-tooltip.tsx pattern with raycaster fix

**Should have -- v5.x after validation (P2):**
- Equipment on/off toggle + HVAC setpoint with live energy impact
- What-if scenario comparison view (scenario vs baseline delta)
- Sub-system heatmap filter (HVAC layer vs lighting layer per floor)
- Korean building code grade attribution per equipment (grade 1 through 7)

**Defer -- v5.x+ or blocked (P3):**
- ECO2 export with sub-system breakdown -- blocked on KS F 1900 schema verification
- All 15 MEP sub-layer toggles individually (telecom/waste/microgrid are low audit priority)
- Per-equipment setpoint scheduler (requires 8760-hour simulation engine)
- Portfolio comparison (separate product surface -- defer to Digital Twin platform milestone)

**Anti-features (do not build):** Real-time IoT sensor feed, photorealistic equipment 3D models,
per-equipment metered consumption from utility bills.

### Architecture Approach

v5.0 is six additive phases on the existing architecture. The MEP sub-layer split keeps
ALL_LAYER_IDS at 5 by adding a nested MepSubLayer type and a parallel mepSubVisibility record.
Energy heatmap geometry lives in dedicated energy-zones child THREE.Mesh objects, never on the
structural InstancedMesh. Scenario/equipment state is explicitly transient (excluded from Zustand
persist partialize). All energy calculations run in useMemo chains, never in useFrame or render bodies.

**Major new components:**
1. mep-coordinator.ts -- assigns existing layer-generator output to named sub-mep-* child groups
2. energy-heatmap-mesh.ts -- pure Three.js floor planes with vertex color buffer (kwhmToColor)
3. system-breakdown.ts -- calculateSystemBreakdown() with ASHRAE 90.1 ratios by Korean use type
4. equipment-specs.ts -- inferEquipmentSpecs() derives EquipmentSpec[] from BuildingRecipe
5. use-energy-breakdown.ts + use-scenario-energy.ts -- reactive hooks with useMemo chains
6. EnergyBreakdownChart, EquipmentTooltip, ScenarioModeBanner, EquipmentControlPanel -- UI

**Three store additions (zero new store files):**
- layer-store: mepSubVisibility: Record<MepSubLayerId, boolean> + toggleMepSub()
- workflow-store: scenarioActive, activeScenarioId, equipmentOverrides (NOT persisted)
- recipe-store: scenarioOverrides[pk][scenarioId] isolated from committed overrides[pk]

**Key new types:**
- EnergyDataSource = "modeled" | "actual" | "estimated-ratio" -- enforced on every energy value
- SystemBreakdown -- hvac/lighting/dhw/plugLoads/total/perFloor with per-field dataSource
- EquipmentSpec -- inferred specs; always dataSource: "estimated-ratio"
- EquipmentControlState -- { enabled: boolean; setpointDelta?: number } in workflow-store

### Critical Pitfalls

1. **Heatmap on structural InstancedMesh (setColorAt)** -- Cannot express spatial gradient per
   face; full buffer re-upload on every energy recalc; entangles energy state with structural
   geometry. Use separate THREE.Mesh floor planes with vertex colors in energy-zones exclusively.

2. **MEP sub-layer proliferation in ALL_LAYER_IDS** -- Adding each sub-system as a new LayerId
   entry triggers global re-renders on any sub-toggle. Keep ALL_LAYER_IDS.length === 5; use
   nested MepSubLayerId type with imperative child-group visibility on the mep THREE.Group.

3. **Energy accuracy theater** -- Ratio-estimated sub-system breakdown is visually
   indistinguishable from measured data. EnergyDataSource type enforced in TypeScript; amber
   estimated-ratio label on every non-actual value; no component renders without a source prop.

4. **Scenario state contaminating committed overrides** -- Using overrides[pk] for scenario
   parameters destroys user material edits and corrupts ECO2 export. Three-layer recipe stack:
   base -> overrides[pk] (user edits) -> scenarioOverrides[pk][scenarioId] (hypotheses only).

5. **Zustand cross-store subscription cascade** -- useEnergyMetrics explicitly documents infinite
   loop risk. Adding new stores compounds this. Zero new store files for v5.0.

6. **Dashboard aggregation in render hot path** -- calculateHeatLoss() at 60fps when camera
   rotates. Wrap all aggregation in useMemo([metrics, recipe]). Acceptance criterion: dashboard
   does not re-render during camera rotation (verified via React DevTools).

7. **Raycaster allocated per-frame** -- structural-tooltip.tsx known defect: new THREE.Raycaster()
   inside useFrame. All new raycasting components must allocate via useRef once.

---

## Implications for Roadmap

Research produces a clear 6-phase structure. Each phase has a single architectural concern, zero
circular dependencies, and independently verifiable exit criteria.

### Phase 1: MEP Sub-Layer Foundation

**Rationale:** Every other v5.0 feature requires MEP sub-layer objects to exist as distinct,
addressable child groups. Architectural prerequisite with no UI dependencies blocking it.

**Delivers:** Independent show/hide of electrical, HVAC, lighting, DHW geometry. LayerPanel
shows MEP as expandable section with 4 sub-toggles. ALL_LAYER_IDS stays at 5.

**Addresses:** MEP sub-layer toggles (P1 table stakes)

**Avoids:** Pitfall 2 (layer explosion) -- MepSubLayerId is a parallel type, not LayerId extension.

**Files:** types.ts (additive), layer-store.ts (additive), layer-manager.ts (one new method),
building-layers.tsx (one new useEffect), layer-panel.tsx (expandable rows), mep-coordinator.ts (new)

**Research flag:** None -- well-documented additive pattern, all integration points verified.

---

### Phase 2: Per-Floor Energy Model + System Breakdown (engine, no UI)

**Rationale:** Both the heatmap (needs perFloor array) and the breakdown dashboard (needs system
split) share the same underlying calculation. Engine work done once unblocks both visual phases.
EnergyDataSource type established here propagates into all subsequent UI phases.

**Delivers:** useEnergyBreakdown(pk) returning SystemBreakdown with perFloor: number[] and
HVAC/lighting/DHW/plug attribution. All non-HVAC values carry dataSource: "estimated-ratio".

**Addresses:** Foundation for breakdown dashboard (P1) and heatmap (P1)

**Avoids:** Pitfall 3 (accuracy theater) -- EnergyDataSource type enforcement established here.

**Files:** annual-demand.ts (optional extension), system-breakdown.ts (new),
use-energy-breakdown.ts (new), equipment-specs.ts (new -- EquipmentSpec type for Phase 5)

**Research flag:** None -- extends existing degree-day model; ASHRAE ratios are standard.

---

### Phase 3: Energy Breakdown Dashboard

**Rationale:** First visible deliverable. Validates system attribution approach with GX team
before control features are built. What percentage is HVAC is the most immediate actionable v5.0 output.

**Delivers:** Bar/donut chart showing HVAC/lighting/DHW/plug breakdown with amber estimated-ratio
labels. Year-over-year trend area chart using existing useActualEnergy data. Updates reactively
when material sliders change.

**Addresses:** Energy breakdown dashboard (P1)

**Uses:** recharts ^3.8.1 + shadcn ChartContainer -- the only new runtime dependency in the entire milestone.

**Avoids:** Pitfall 8 (hot path aggregation) -- all aggregation in useMemo; React DevTools verification required.

**Files:** energy-breakdown-chart.tsx (new), integration into config panel tabs

**Research flag:** None -- shadcn chart pattern well-documented; compat verified against npm.

---

### Phase 4: Energy Consumption Heatmap

**Rationale:** Second visible deliverable. Uses perFloor array from Phase 2 to color-code floor
planes. The energy-zones group and geometry disposal patterns are already established.

**Delivers:** Color-gradient floor planes in 3D viewport anchored to Korean energy grade
thresholds (Grade 1+++ blue to Grade 7 red). Colors update when any material slider changes.
Heatmap persists independently when the structure layer is hidden.

**Addresses:** Energy consumption heatmap (P1 table stakes)

**Avoids:** Pitfall 1 (heatmap on InstancedMesh) -- dedicated THREE.Mesh floor planes with vertex
colors in energy-zones. SAOPass remains disabled (Pitfall 6 in PITFALLS.md).

**Files:** energy-heatmap-mesh.ts (new), building-layers.tsx (heatmap rebuild useEffect)

**Research flag:** None -- vertex color buffer is standard Three.js 0.183 geometry API.

---

### Phase 5: Equipment Info Panel

**Rationale:** Validates equipment data model before adding control in Phase 6. Read-only hover
info confirms raycasting on MEP sub-group meshes works with Phase 1 visibility system. Mirrors
existing pattern: read (structural tooltip) before write (material overrides).

**Delivers:** Hover over any MEP mesh shows info card: inferred equipment type, Korean efficiency
grade (1 through 7), estimated install year from building permit, approximate kWh/yr. All values
labeled as estimated. Raycaster allocated via useRef (fixes structural-tooltip.tsx defect).

**Addresses:** Equipment info panel (P1 table stakes); establishes SelectedEquipmentInfo type as
the Phase 6 control target.

**Avoids:** Pitfall 7 (Raycaster per-frame); Pitfall 9 (THREE.Object3D in React state -- only
plain SelectedEquipmentInfo record stored in selection-store).

**Files:** equipment-tooltip.tsx (new R3F component)

**Research flag:** None -- extends verified structural-tooltip.tsx pattern with documented fixes.

---

### Phase 6: Equipment Control + Scenario Mode (capstone)

**Rationale:** Builds on validated equipment data model from Phase 5. Adds mutation (on/off
toggle, HVAC setpoint) in a safely isolated scenario context. Scenario store design (three-layer
recipe stack) is architecturally the most sensitive piece and correctly comes last.

**Delivers:** EquipmentControlPanel with on/off toggles and HVAC setpoint sliders. Toggling HVAC
off raises kWh/m2 in status bar and energy cards. Amber ScenarioModeBanner visible during any
scenario deviation. Exit scenario restores baseline; no scenario state persists across reload.

**Addresses:** Equipment control + live energy impact (P2); what-if scenario foundation

**Avoids:** Pitfall 4 (optimistic control = accuracy theater) -- amber banner required; Pitfall 5
(scenario mutates base recipe) -- scenarioOverrides[pk][scenarioId] isolated; equipment overrides
excluded from Zustand persist partialize.

**Files:** workflow-store.ts (scenario slice + partialize update), recipe-store.ts
(scenarioOverrides slice), use-scenario-energy.ts (new), equipment-control-panel.tsx (new),
scenario-mode-banner.tsx (new)

**Research flag:** Needs phase research if extending to multi-scenario split-screen compare view.
Single scenario toggle mode as described is well-documented.

---

### Phase Ordering Rationale

- Phases 1 and 2 are pure infrastructure (no UI deliverables) and must come first -- every
  subsequent phase depends on one or both. Keeping them separate avoids entangling type system
  changes with UI changes.
- Phases 3 and 4 are parallel-capable after Phase 2 but ordered sequentially: the breakdown
  chart validates system attribution rationale with the GX team before heatmap numbers render
  spatially. GX validation catch happens sooner.
- Phase 5 (info panel, read-only) precedes Phase 6 (control, write) to validate the equipment
  data model at lower risk before adding mutation.
- Phase 6 is the capstone: integrates all prior phases and carries the highest architectural
  risk (scenario isolation). Deferred last to minimize blast radius if scenario design needs revision.

### Research Flags

**Needs research before planning/implementation:**
- ECO2 sub-system export (P3): Korean ECO2 input format for system data fields (KS F 1900) has
  not been verified. Do not extend eco2-export.ts until schema is confirmed. Requires a
  dedicated research pass before any P3 planning.
- Multi-scenario split-screen compare view (Phase 6 extension): Two-scenario split-screen has
  performance implications (two full ProceduralBuilding renders) needing explicit investigation.

**Standard patterns -- skip research:**
- Phase 1: Additive Zustand slice pattern fully established in existing codebase.
- Phase 2: calculateAnnualDemand codebase well-understood; ASHRAE ratios are standard.
- Phase 3: shadcn chart + Recharts compat verified; install path documented in STACK.md.
- Phase 4: Three.js vertex color buffer is standard geometry API in version 0.183.
- Phase 5: Extends structural-tooltip.tsx with fixes documented in ARCHITECTURE.md.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | One new library (recharts 3.8.1); React 19 + shadcn compat verified via GitHub issues. All other capabilities confirmed against existing codebase files. |
| Features | HIGH (core) / MEDIUM (BEMS norms) | P1 features grounded in existing codebase and GX team use cases. BEMS comparisons from marketing pages, not technical specs. |
| Architecture | HIGH | All integration points (store shapes, layer types, raycasting pattern, energy hook topology) verified via direct codebase file reads. |
| Pitfalls | HIGH (code-grounded) / LOW (building control) | 9 pitfalls from codebase patterns, Three.js forum issues, and prior milestone docs. No authoritative Korean BIM equipment control reference found. |

**Overall confidence: HIGH**

### Gaps to Address

- ECO2 system data schema (KS F 1900): Korean ECO2 format for systemData fields (HVAC type,
  lighting density, DHW type) has not been verified. Flag P3 feature for a dedicated research
  pass. Do not begin ECO2 sub-system extension work until confirmed.

- ASHRAE 90.1 ratio validation with GX team: System attribution percentages (HVAC 40-50%,
  lighting 7-40%, DHW 3-25% by use type) are reasonable defaults but Korean commercial buildings
  may exhibit different load profiles. Validate against buildings where GX team has sub-metering
  data before field audits. Amber estimated-ratio label is the interim mitigation.

- Multi-scenario compare performance: PITFALLS.md warns against naive dual-ProceduralBuilding
  instance approach for split-screen comparison. Needs explicit investigation before building.

---

## Sources

### Primary (HIGH confidence)

- Existing codebase (direct file reads): src/lib/layers/types.ts, layer-manager.ts,
  src/store/layer-store.ts, workflow-store.ts, recipe-store.ts, material-store.ts,
  src/hooks/use-energy-metrics.ts, use-actual-energy.ts, src/lib/energy/annual-demand.ts,
  energy-grade.ts, src/components/viewer/structural-tooltip.tsx, energy-cards.tsx,
  building-layers.tsx, src/lib/layers/layer-3-cooling.ts, layer-7-lighting.ts
- recharts npm registry -- version 3.8.1, current April 2026
- recharts/recharts#4558 -- React 19 compatibility confirmed
- shadcn-ui/ui#7669 / PR #8486 -- Recharts v3 compat in shadcn chart confirmed
- building-scene.tsx line 456 -- SAOPass disable comment confirmed

### Secondary (MEDIUM confidence)

- Three.js forum: InstancedMesh per-instance color patterns and known gradient limitations
- React Three Fiber issue #2854: InstancedMesh per-instance color
- Three.js issue #30352: InstancedMesh vs Mesh shared attributes
- BEMS industry overviews: Facilio, EnergyCAP, Wattsense, CIM.io (marketing pages)
- ASHRAE 90.1 system attribution ratios by building type (standard reference)

### Tertiary (LOW confidence)

- Korean ECO2 input format for system data (KS F 1900) -- not verified; flagged as gap above
- GX team-specific energy audit workflow details beyond what is documented in PROJECT.md

---

*Research completed: 2026-04-12*
*Ready for roadmap: yes*
