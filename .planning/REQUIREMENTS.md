# Requirements: Korea BIM Energy Management System

**Defined:** 2026-04-12
**Core Value:** Instantly generate realistic building drafts by compositing Korean government data with GIS layers

## v4.0 Requirements

Requirements for GIS-Composite Realistic Drafts milestone.

### GIS Foundation

- [x] **GIS-01**: User's building renders with real cadastral footprint polygon shape instead of rectangular box
- [x] **GIS-02**: Coordinate transforms accurately convert WGS84/EPSG:5179 to local Three.js coordinates with <1m error at 2km radius
- [ ] **GIS-03**: VWorld API key is configured via environment variable, not hardcoded

### Footprint Extrusion

- [x] **FP-01**: User can see their selected building extruded from the actual cadastral polygon with correct floor heights
- [ ] **FP-02**: Concave and L-shaped cadastral polygons render correctly (earcut triangulation)
- [ ] **FP-03**: Existing procedural facade/material system works on polygon-based buildings (not just rectangular)

### Composite Pipeline

- [ ] **CP-01**: Building selection triggers parallel fetch of building ledger data and VWorld footprint polygon
- [ ] **CP-02**: 3D composite renders within 3 seconds of building selection (excluding network latency)

## v4.1 Requirements

Deferred to next minor release. Tracked but not in current roadmap.

### Context Layers

- **CTX-01**: Satellite/aerial ground plane texture from VWorld WMS
- **CTX-02**: Surrounding LOD1 context buildings rendered as gray masses
- **CTX-03**: Korean zoning overlay (LT_C_UQ111-114) as translucent colored mesh

## Out of Scope

| Feature | Reason |
|---------|--------|
| CesiumJS/Mapbox dual-engine rendering | Two WebGL contexts = GPU memory competition, massive complexity for zero benefit |
| Full terrain mesh from DEM | High complexity, defer to v5.0+ |
| Client-side tile caching/stitching | VWorld WMS single-image approach avoids this entirely |
| Real-time 3D building streaming from VWorld | API permanently closed (July 2019, national security) |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| GIS-01 | Phase 20 | Complete |
| GIS-02 | Phase 19 | Complete |
| GIS-03 | Phase 19 | Pending |
| FP-01 | Phase 20 | Complete |
| FP-02 | Phase 20 | Pending |
| FP-03 | Phase 20 | Pending |
| CP-01 | Phase 21 | Pending |
| CP-02 | Phase 21 | Pending |

**Coverage:**
- v4.0 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 after v4.0 roadmap creation*
