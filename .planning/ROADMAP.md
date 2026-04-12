# Roadmap — Korea BIM Energy Management System

## Milestones

- 🚧 **v5.0 Energy Systems Observability & Control** — Phases 22-27 (in progress)
- ✅ **v4.0 GIS-Composite Realistic Drafts** — Phases 19-21 (shipped 2026-04-12) — [Archive](milestones/v4.0-ROADMAP.md)
- ✅ **v3.0 UX Workflow Overhaul** — Phases 14-18 (shipped 2026-03-31)
- ✅ **v2.0 Advanced BIM Authoring** — Phases 10-13 (shipped 2026-03-28) — [Archive](milestones/v2.0-ROADMAP.md)
- ✅ **v1.0 Procedural BIM Viewer** — Phases 1-9 (shipped 2026-03-26)

## Phases

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

### 🚧 v5.0 Energy Systems Observability & Control (Phases 22-28)

**Milestone Goal:** Expand the MEP layer into individually addressable utility sub-systems, expose energy distribution visually on the 3D model, and surface inferred equipment specifications — giving GX energy auditors per-system observability without requiring IoT or sub-metered data.

- [x] **Phase 22: MEP Sub-Layer Foundation** - Split the single MEP group into 4 independently togglable utility sub-layers (completed 2026-04-11)
- [x] **Phase 23: Per-Floor Energy Model** - Extend the energy calculation engine to produce per-floor kWh/m² and system-level attribution (completed 2026-04-12)
- [ ] **Phase 24: Energy Breakdown Dashboard** - Chart showing HVAC/lighting/DHW/plug attribution with amber estimated labels
- [x] **Phase 25: Energy Consumption Heatmap** - Color-coded floor planes on the 3D building keyed to Korean energy grade thresholds (completed 2026-04-12)
- [x] **Phase 26: Equipment Info Panel** - Click-to-inspect MEP objects showing inferred specs and Korean efficiency grades (completed 2026-04-12)
- [x] **Phase 27: ECO2 Sub-System Export** - Extend ECO2 export with sub-system data fields (HVAC type, lighting density, DHW system) (completed 2026-04-12)
- [ ] **Phase 28: Procedural 3D Models for MEP Equipment** - Distinct 3D geometry for all 기계설비 with configurable procedural parameters

## Phase Details

### Phase 22: MEP Sub-Layer Foundation
**Goal**: Users can independently show and hide each of the 4 MEP utility sub-systems (electrical, HVAC, lighting, DHW) without affecting the other sub-systems or any other layer
**Depends on**: Phase 21 (Composite Pipeline)
**Requirements**: MEP-01, MEP-02
**Success Criteria** (what must be TRUE):
  1. User sees 4 expandable sub-toggle rows under MEP in the layer panel (electrical, HVAC, lighting, DHW)
  2. Toggling any one sub-layer hides only that utility system's 3D objects while all other geometry stays visible
  3. The main MEP toggle still shows/hides all 4 sub-layers together as before
  4. Toggling sub-layers does not trigger a full-scene re-render (ALL_LAYER_IDS remains at 5 entries)
**Plans**: 3 plans
Plans:
- [x] 22-01-PLAN.md — Type system + store (MepSubLayerId, MEP_SUB_CONFIGS, layer-store persist + mepSubVisibility slice)
- [x] 22-02-PLAN.md — Scene graph wiring (mep-coordinator sub-groups, LayerManager.setMepSubVisible, BuildingLayers useEffect)
- [x] 22-03-PLAN.md — Layer panel UI (expandable chevron + 4 indented sub-toggle rows with colors and bilingual labels)
**UI hint**: yes

### Phase 23: Per-Floor Energy Model
**Goal**: The energy calculation engine produces per-floor kWh/m² estimates and system-level attribution percentages that downstream dashboard and heatmap phases can consume
**Depends on**: Phase 22
**Requirements**: EA-01
**Success Criteria** (what must be TRUE):
  1. useEnergyBreakdown(pk) returns a SystemBreakdown object with a perFloor array (one kWh/m² value per floor)
  2. SystemBreakdown includes HVAC, lighting, DHW, and plug-load attribution percentages that sum to 100%
  3. Every non-actual value in SystemBreakdown carries dataSource: "estimated-ratio" enforced at the TypeScript type level
  4. The hook result is stable across camera movement (no recalculation during useFrame/render)
**Plans**: 2 plans
Plans:
- [x] 23-01-PLAN.md — Core engine: calculateSystemBreakdown + EnergyDataSource type + SYSTEM_RATIOS (prefix match) + Vitest coverage
- [x] 23-02-PLAN.md — useEnergyBreakdown hook (two nested useMemo, Pitfall 1 stability guard) + renderHook tests

### Phase 24: Energy Breakdown Dashboard
**Goal**: Users can see how building energy consumption is distributed across HVAC, lighting, DHW, and plug loads in a chart that updates when material properties change
**Depends on**: Phase 23
**Requirements**: EA-02
**Success Criteria** (what must be TRUE):
  1. A bar or donut chart in the config panel displays HVAC/lighting/DHW/plug attribution with percentage labels
  2. Every estimated-ratio value in the chart carries a visible amber "estimated" label — no unlabeled estimates
  3. The chart updates reactively when the user adjusts any material property slider
  4. The chart does not re-render during camera rotation (verified via React DevTools profiler)
**Plans**: 2 plans
Plans:
- [x] 24-01-PLAN.md — Install recharts + shadcn chart, build EnergyBreakdownChart, wire as 5th ConfigPanel tab
- [ ] 24-02-PLAN.md — React.memo hardening + human-verify checkpoint (SC1/SC2/SC3/SC4 incl. profiler)
**UI hint**: yes

### Phase 25: Energy Consumption Heatmap
**Goal**: The 3D building shows floor planes color-coded by kWh/m² intensity so users can immediately identify high-consumption floors spatially
**Depends on**: Phase 23
**Requirements**: EA-03
**Success Criteria** (what must be TRUE):
  1. Each floor in the 3D viewport renders an independent color plane ranging from blue (Korean Grade 1+++) through green/yellow to red (Grade 7) based on its kWh/m² value
  2. Heatmap colors update when any material property slider changes
  3. The heatmap remains visible when the structure layer is hidden
  4. Heatmap geometry lives on separate THREE.Mesh floor planes, not on the structural InstancedMesh
**Plans**: 1 plan
Plans:
- [x] 25-01-PLAN.md — energy-heatmap-builder.ts (Vitest-driven) + BuildingLayers buildingPk prop + useEffect rebuild + visual checkpoint
**UI hint**: yes

### Phase 26: Equipment Info Panel
**Goal**: Users can click on any MEP sub-layer object to inspect inferred equipment specifications including type, efficiency grade, approximate age, and estimated annual consumption — all clearly labeled as estimated
**Depends on**: Phase 22
**Requirements**: EQ-01, EQ-02, STD-01
**Success Criteria** (what must be TRUE):
  1. Clicking any visible MEP mesh opens an info card showing inferred equipment type, capacity, approximate install year derived from the building permit date, and estimated kWh/yr
  2. Every value in the info card carries a visible "estimated" label — no value appears as measured data
  3. The info card displays a Korean energy efficiency grade (1~5등급) sourced from KS B 6364 (HVAC) or KSC IEC 62301 (electrical) as appropriate
  4. The raycaster used for hit detection is allocated once via useRef, not per-frame
**Plans**: 2 plans
Plans:
- [x] 26-01-PLAN.md — equipment-specs.ts module (EquipmentSpec, EquipmentEfficiencyGrade 1~5등급, era-based inference, KS B 6364 / KSC IEC 62301 grade tables) + selection-store SelectedEquipmentInfo extension
- [x] 26-02-PLAN.md — EquipmentClickHandler (useRef Raycaster + pointerup + MEP sub-group filter) + EquipmentInfoPanel in right dock (amber 추정 labels) + human verification checkpoint
**UI hint**: yes

### Phase 27: ECO2 Sub-System Export
**Goal**: The ECO2 export file includes sub-system data fields (HVAC system type, lighting power density, DHW system type) extending the existing envelope-only export so GX auditors can feed system data directly into ECO2
**Depends on**: Phase 26
**Requirements**: STD-02
**Success Criteria** (what must be TRUE):
  1. Downloading the ECO2 export produces a file that includes HVAC type, lighting power density (W/m²), and DHW system type fields alongside the existing envelope data
  2. All sub-system export fields are clearly labeled as estimated/inferred in the export metadata
  3. The existing envelope-only ECO2 export for buildings without sub-system data is unchanged and still valid
**Plans**: 1 plan
Plans:
- [x] 27-01-PLAN.md — ECO2SubSystems type + buildSubSystems helper + ECO2ExtraOptions extension + Vitest SC1/SC2/SC3 coverage + energy-cards.tsx wiring

### Phase 28: Procedural 3D Models for MEP Equipment
**Goal**: Users see distinct, recognizable 3D models for each piece of mechanical equipment (기계설비) — HVAC units (AHU, chillers, boilers, VRF heads, fan coils), electrical panels, lighting fixtures, DHW tanks/pumps — with configurable procedural parameters (size, count, spacing, detail level) that update the scene in real time
**Depends on**: Phase 26 (equipment-specs.ts userData.type mapping)
**Requirements**: EQUIP-01 (new — see REQUIREMENTS.md)
**Success Criteria** (what must be TRUE):
  1. Each MEP sub-type renders a visually distinct procedural 3D model (AHU ≠ chiller ≠ fan coil ≠ boiler ≠ lighting fixture ≠ electrical panel ≠ DHW tank)
  2. Users can adjust procedural parameters (size, count, spacing, LOD) per equipment type in the config panel and see the scene update in real time
  3. Equipment models remain recognizable at typical camera distances without requiring photorealistic detail (structural clarity principle)
  4. All equipment models use InstancedMesh where appropriate to maintain <10 draw calls per sub-layer
  5. Existing Phase 22 sub-layer toggling + Phase 26 click selection continue to work with the new models
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 19. Coordinate System Foundation | v4.0 | 2/2 | Complete | 2026-04-11 |
| 20. Footprint Extrusion | v4.0 | 3/3 | Complete | 2026-04-11 |
| 21. Composite Pipeline | v4.0 | 2/2 | Complete | 2026-04-12 |
| 22. MEP Sub-Layer Foundation | v5.0 | 3/3 | Complete   | 2026-04-11 |
| 23. Per-Floor Energy Model | v5.0 | 2/2 | Complete   | 2026-04-12 |
| 24. Energy Breakdown Dashboard | v5.0 | 1/2 | In Progress|  |
| 25. Energy Consumption Heatmap | v5.0 | 1/1 | Complete   | 2026-04-12 |
| 26. Equipment Info Panel | v5.0 | 2/2 | Complete   | 2026-04-12 |
| 27. ECO2 Sub-System Export | v5.0 | 1/1 | Complete   | 2026-04-12 |
| 28. Procedural 3D Models for MEP Equipment | v5.0 | 0/? | Not started | - |
