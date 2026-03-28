# Roadmap — v2.0 Advanced BIM Authoring

## Milestone 2: Advanced BIM Authoring

### Phase 10: 2D Plan View Engine
**Goal:** Create a 2D orthographic plan view with wall drawing tools. Users draw walls by clicking points, creating the foundation for the floor plan editor.
**Requirements:** PLAN-01, PLAN-05
- 2D orthographic camera mode (top-down) with toggle from 3D perspective
- Wall drawing tool: click start point → click end point → wall segment created
- Grid overlay in plan view for visual reference
- Walls render in both 2D (thick lines) and 3D (extruded geometry)
- View mode toggle button in toolbar (3D/Plan)

### Phase 10.1: QA Testing & BIM Accuracy Verification
**Goal:** Establish test infrastructure, add unit/integration/E2E tests for all existing code (Phases 1-10), add error boundaries and input validation, and verify BIM geometry accuracy against Korean building benchmarks.
**Requirements:** None (quality gate — all existing requirements benefit)
- Test infrastructure: Vitest + @testing-library/react + happy-dom + Playwright
- Unit tests: energy calculations (heat-loss, annual-demand, energy-grade, CO2) against benchmark values
- Unit tests: procedural generators (recipe.ts, facade-generator, structure-generator) — correct dimensions per era/structure
- Unit tests: korean-building-codes.ts — wall layer thicknesses, U-value calculations
- Unit tests: Zustand stores (recipe-store, material-store, plan-store, authoring-store, layer-store, component-store)
- Integration tests: API proxy routes, config panel → store → energy recalculation chain
- E2E tests (Playwright): search → 3D view → toggle layers → plan view → draw wall → export ECO2
- Error boundaries: React ErrorBoundary around Canvas, ConfigPanel, EnergyCards
- Input validation: config slider min/max enforcement, wall drawing dimensional limits
- BIM accuracy: compare procedural output against known Korean apartment typologies
- Energy accuracy: verify calculations against published Korean building energy benchmarks
- All future phases MUST include tests as part of plan execution

### Phase 11: Room Boundaries + 3D Extrusion
**Goal:** Detect enclosed spaces from drawn walls, label them as rooms, and auto-extrude 2D plans to 3D building geometry.
**Requirements:** PLAN-02, PLAN-03, PLAN-04
**Plans:** 3/3 plans complete
Plans:
- [x] 11-01-PLAN.md — Store extension + room detection algorithm + unit tests
- [x] 11-02-PLAN.md — Room fills visualization + floor slabs + multi-floor management
- [x] 11-03-PLAN.md — Door/window placement with CSG wall openings
- Room detection algorithm: find enclosed polygons from wall graph
- Room labels with area calculation (m²)
- Auto-extrusion: 2D walls → 3D walls with configurable floor height
- Door/window placement tool in plan view (snap to wall segments)
- Multi-floor support: duplicate plan to create stacked floors

### Phase 12: Snap & Alignment System
**Goal:** Precision editing tools for BIM authoring — grid snapping, vertex/edge snapping, axis constraints, and alignment guides.
**Requirements:** SNAP-01, SNAP-02, SNAP-03, SNAP-04
**Plans:** 2 plans
Plans:
- [ ] 12-01-PLAN.md — Snap engine + grid/vertex/edge snapping + wall-drawer integration
- [ ] 12-02-PLAN.md — Axis constraints + alignment guides + snap toolbar UI
- Configurable grid snapping (0.1m, 0.5m, 1m presets)
- Edge/vertex proximity snapping with configurable tolerance
- Axis constraint toggle (X-only, Y-only, Z-only, free)
- Alignment guide lines when elements are collinear
- Snap indicator visual feedback (highlighted snap point)
- Works in both 2D plan view and 3D perspective

### Phase 13: Structural Analysis Visualization
**Goal:** Visual structural analysis overlay showing load paths, stress levels, and member sizing. Engineering feedback layer for the GX team.
**Requirements:** STRUCT-01, STRUCT-02, STRUCT-03, STRUCT-04
- Load path arrows: animated arrows from roof → columns → foundation
- Stress color coding: green (safe) → yellow (moderate) → red (over-stressed) per member
- Simplified load calculation: dead load + live load per floor, column tributary area
- Member sizing guide: recommended column/beam dimensions based on span and load
- Toggle overlay independent of other layers (new layer 15 in the layer system)
- Korean structural code references for sizing tables

---

**Priority order:** Phase 10 → 10.1 → 11 → 12 → 13
**Current phase:** Phase 12 (planned)

## Progress

| Phase | Status | Plans | Date |
|-------|--------|-------|------|
| 10 | Complete | 1/1 | 2026-03-28 |
| 10.1 | 3/3 | Complete    | 2026-03-28 |
| 11 | 3/3 | Complete    | 2026-03-28 |
| 12 | Planned | 2 plans | — |
| 13 | Not started | 0 | — |
