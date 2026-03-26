# Roadmap — Korea BIM Energy Management System

## Milestone 1: Structurally Accurate 3D Viewer + Interactive Configuration

### Phase 1: Dashboard Layout Redesign
**Goal:** Transform from page-per-building layout to a dashboard with full-viewport 3D as the primary interface.
**Requirements:** DASH-LAYOUT, DASH-TOOLBAR, DASH-PANEL, DASH-RESPONSIVE
**Plans:** 1 plan

Plans:
- [ ] 01-01-PLAN.md — Dashboard layout with toolbar, full-viewport 3D, collapsible side panel

- Redesign building detail page: 3D viewer takes 70% of viewport
- Collapsible side panel for metadata, material properties, configuration
- Building header condensed to a toolbar bar
- Responsive: panel collapses on mobile

### Phase 2: Structural 3D Components (Walls, Slabs, Columns)
**Goal:** Replace flat planes with dimensioned structural elements — walls with thickness, floor slabs, column grids.
- Wall geometry with actual thickness (assembly layers: concrete + insulation + finish)
- Floor slabs as thick elements (not flat planes)
- Column grid generation from structural code
- Window openings cut into wall geometry
- Door openings on ground floor
- Clear visual distinction between structural elements

### Phase 3: Better Textures + Materials
**Goal:** Download and apply real PBR textures for concrete, brick, metal, glass. Structural clarity over photorealism.
- Download PBR texture sets from Poly Haven / AmbientCG (concrete, brick, metal, wood, glass)
- Apply texture maps: base color, normal, roughness, metalness, AO
- Material variation per era (weathered concrete for old buildings, clean panels for new)
- Better HDR environment for lighting
- Dimensionally clear rendering — every component reads as what it is

### Phase 4: Interactive Configuration Panel
**Goal:** Slide panel with real-time parameter adjustment for building properties.
- Wall assembly editor (add/remove layers, adjust thickness, change materials)
- Window property sliders (U-value, SHGC, WWR per orientation)
- HVAC system selector with efficiency parameters
- Insulation type and thickness controls
- Changes reflect immediately in 3D model (live preview)
- Changes update material property store

### Phase 5: Live Energy Calculation Engine
**Goal:** As users modify building properties, energy metrics update in real-time.
- Heat loss calculator from envelope properties (U-values x areas x dT)
- Heating/cooling load estimation
- Annual energy demand projection
- Energy efficiency grade estimation (1+++ to 7)
- Dashboard cards showing live energy metrics alongside 3D view
- Comparison mode: before/after property changes

### Phase 6: ECO2 Export
**Goal:** Generate ECO2-compatible input files from the configured building model.
- Map material properties to ECO2 input categories
- Export file generator (ECO2 input format)
- Import ECO2 results for visualization
- Energy grade overlay on 3D model

### Phase 7: Energy Data Integration
**Goal:** Connect real energy consumption data from Korean government APIs.
- 건축HUB 건물에너지정보 API (monthly electricity + gas per building)
- 건축물 에너지효율등급 API (certified energy grades)
- KMA weather data API (temperature, solar radiation for degree-day analysis)
- Compare actual vs. modeled energy consumption

---

**Priority order:** Phase 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7
**Current phase:** Phase 1 (planned)
