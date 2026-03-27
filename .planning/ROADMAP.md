# Roadmap — Korea BIM Energy Management System

## Milestone 1: Procedural BIM Viewer with Multi-Layer Building Systems

### Phase 1: Dashboard Layout Redesign ✓
**Goal:** Transform from page-per-building layout to a dashboard with full-viewport 3D as the primary interface.
**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md — Dashboard layout with toolbar, full-viewport 3D, collapsible side panel

### Phase 2: Structural 3D Components (Walls, Slabs, Columns) ✓
**Goal:** Replace flat planes with dimensioned structural elements — walls with thickness, floor slabs, column grids.
**Plans:** 1 plan

Plans:
- [x] 02-01-PLAN.md — Structural walls, slabs, columns with BIM renderer settings

### Phase 3: Better Textures + Materials ✓
**Goal:** Download and apply real PBR textures for concrete, brick, metal, glass. Structural clarity over photorealism.
**Plans:** 2 plans

Plans:
- [x] 03-01-PLAN.md — Download PBR texture sets and build texture loading system
- [x] 03-02-PLAN.md — Apply textured materials to all viewer components

### Phase 4: Procedural Generation Engine
**Goal:** Replace hardcoded geometry functions with a composable procedural generation pipeline. Each building becomes a parameter-driven recipe, not a fixed function call.
**Plans:** 3 plans

Plans:
- [x] 04-01-PLAN.md — BuildingRecipe type system, era presets, and toRecipe() converter
- [x] 04-02-PLAN.md — ProceduralBuilding class with InstancedMesh facade, slabs, columns, roof
- [x] 04-03-PLAN.md — React wrapper integration, floor selection, scene wiring

### Phase 5: 10-Layer Building Systems Visualization
**Goal:** Implement the 10-layer building systems framework. Each layer is independently toggleable and uses distinct visual language.
**Plans:** 3/3 plans complete

Plans:
- [x] 05-01-PLAN.md -- Layer type system, Zustand store, generators 1-4, LayerManager
- [x] 05-02-PLAN.md -- Layer generators 5-10
- [x] 05-03-PLAN.md -- Layer toggle UI and scene integration
- Layer 1: Architecture & Structure — semi-transparent wireframes, muted gray (existing geometry, adapted)
- Layer 2: Standard MEP — solid pipes/boxes, red/blue thermal, yellow/orange power
- Layer 3: BAS, IoT & Controls — floating green nodes, pulsing orbs, dashed connection lines
- Layer 4: Transport & Logistics — animated light blocks in shafts, light trails
- Layer 5: Life Safety & Security — volumetric red/orange force fields, radar rings
- Layer 6: Specialized Media — neon purple/white/green tubes, distinct from standard plumbing
- Layer 7: Microgrid & Energy — glowing battery cubes, bi-directional animated arrows
- Layer 8: Telecom & IT — cyan/magenta matrices, high-speed fiber pulses
- Layer 9: Waste & Resource Recovery — dark green/brown segmented lines, dissolving particles
- Layer 10: Dynamic Envelope — surface polygons shifting color, physically rotating elements
- Layer toggle UI in toolbar with color-coded icons
- Each layer procedurally generated from building parameters (floor count, area, use type)

### Phase 6: Interactive Configuration Panel ✓
**Goal:** Parameter adjustment panel that drives the procedural generator in real-time.
**Plans:** 3/3 plans complete

Plans:
- [x] 06-01-PLAN.md -- Recipe override store + ConfigPanel shell with 4 tabs
- [x] 06-02-PLAN.md -- BuildingTab and EnvelopeTab with slider controls
- [x] 06-03-PLAN.md -- Systems tab, Layers tab, live 3D feedback

- Wall assembly: U-value slider + insulation layer presets
- Window: U-value + SHGC + WWR sliders per orientation
- HVAC system type dropdown + efficiency slider
- Layer-specific parameter controls (MEP pipe routing density, sensor placement frequency)
- Changes feed back into procedural generator → live 3D update
- Reset to Code Defaults per section

### Phase 7: BIM Authoring Tools
**Goal:** Transform viewer into an interactive BIM authoring environment with element-level editing, component library, and measurement tools — moving toward Revit-like functionality.
- Element-level editing: click wall/slab/column → transform gizmo (translate/rotate/scale) + parametric properties panel
- Component library: doors, windows (snap to walls), MEP fixtures (ties to 14-layer system), stairs & ramps
- Measurement & annotation: dimension lines, area labels, section cuts, level markers
- Three.js TransformControls for gizmo interaction
- Drag-and-drop from component palette onto 3D scene
- Undo/redo system for authoring operations

### Phase 8: Energy Calculation + ECO2 Export
**Goal:** Live energy metrics from building parameters, plus ECO2-compatible file export.
- Heat loss calculator from envelope properties (U-values × areas × ΔT)
- Annual energy demand projection (degree-day method)
- Energy efficiency grade estimation (1+++ to 7)
- CO2 emissions estimate (Korean grid emission factor)
- Floating energy metric cards on 3D view
- ECO2 input file generator from material properties
- Import ECO2 results for energy grade overlay

### Phase 9: Energy Data Integration
**Goal:** Connect real energy consumption data from Korean government APIs.
- 건축HUB 건물에너지정보 API (monthly electricity + gas per building)
- 건축물 에너지효율등급 API (certified energy grades)
- KMA weather data API (temperature, solar radiation for degree-day analysis)
- Compare actual vs. modeled energy consumption
- Overlay real vs. predicted data on the 3D model

---

**Priority order:** Phase 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
**Current phase:** Phase 6 (complete)
