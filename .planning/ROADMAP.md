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

### Phase 11: Room Boundaries + 3D Extrusion
**Goal:** Detect enclosed spaces from drawn walls, label them as rooms, and auto-extrude 2D plans to 3D building geometry.
**Requirements:** PLAN-02, PLAN-03, PLAN-04
- Room detection algorithm: find enclosed polygons from wall graph
- Room labels with area calculation (m²)
- Auto-extrusion: 2D walls → 3D walls with configurable floor height
- Door/window placement tool in plan view (snap to wall segments)
- Multi-floor support: duplicate plan to create stacked floors

### Phase 12: Snap & Alignment System
**Goal:** Precision editing tools for BIM authoring — grid snapping, vertex/edge snapping, axis constraints, and alignment guides.
**Requirements:** SNAP-01, SNAP-02, SNAP-03, SNAP-04
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

**Priority order:** Phase 10 → 11 → 12 → 13
**Current phase:** Phase 10 (not started)

## Progress

| Phase | Status | Plans | Date |
|-------|--------|-------|------|
| 10 | Not started | 0 | — |
| 11 | Not started | 0 | — |
| 12 | Not started | 0 | — |
| 13 | Not started | 0 | — |
