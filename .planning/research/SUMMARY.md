# Project Research Summary

**Project:** Korean BIM Energy Management System — v4.0 GIS-Composite Realistic Drafts
**Domain:** GIS compositing on existing Three.js BIM viewer — Korean spatial data (VWorld + 건축물대장)
**Researched:** 2026-04-12
**Confidence:** HIGH (stack versions npm-verified; architecture grounded in direct codebase audit)

## Executive Summary

v4.0 composites Korean government building data with VWorld GIS layers to generate realistic building drafts instantly. The existing procedural building system (facades, slabs, columns via InstancedMesh, 7 draw calls) stays intact. The key change is replacing the rectangular base geometry with real cadastral footprint polygons and adding surrounding context — satellite ground plane, LOD1 context buildings, and zoning overlays.

Only **2 new npm packages** are needed: `proj4@^2.20.8` (coordinate transforms) and `earcut@^3.0.2` (polygon triangulation). Total new dependency surface is ~150KB. No CesiumJS, no Mapbox, no second WebGL context — everything renders in the existing Three.js/R3F canvas.

The most consequential discovery: **VWorld's 3D building API is permanently closed** (July 2019, national security). Context buildings must be synthesized in the browser from 2D cadastral footprints + `buldHg` height attribute from VWorld's NED API. This changes the architecture from "stream 3D data" to "extrude 2D polygons."

A **coordinate system foundation** (`gis-transform.ts` with proj4js) must be built first — all GIS layers depend on it. The existing equirectangular approximation in `route.ts` accumulates 8m error at 2km radius, which is invisible for single buildings but causes visible misalignment when compositing multiple layers.

---

## Key Findings

### Recommended Stack

| Library | Version | Purpose | Size |
|---------|---------|---------|------|
| `proj4` | `^2.20.8` | WGS84 ↔ local ENU coordinate projection | ~80KB |
| `earcut` | `^3.0.2` | Concave polygon triangulation with holes | 3KB gzip |

**What NOT to add:** CesiumJS, Mapbox GL, deck.gl, Turf.js (overkill), any second WebGL context, any tile rendering library. VWorld WMTS/WMS returns standard JPEG — `THREE.TextureLoader` handles it.

---

### Feature Landscape

**Table Stakes (must ship):**
- Real cadastral footprint as building base shape (ExtrudeGeometry from polygon)
- Satellite/aerial ground plane texture (VWorld WMS single-image)
- Context buildings as LOD1 gray masses (synthesized from 2D footprints)

**Differentiators (unique to this tool):**
- Korean zoning overlay (LT_C_UQ111-114) — no competing tool surfaces this in 3D
- Instant composite from address input (parallel fetch pipeline)

**Anti-features (do not build):**
- Dual-engine rendering (CesiumJS/Mapbox alongside Three.js)
- Client-side tile caching/stitching
- Full terrain mesh from DEM (defer to future milestone)

---

### Architecture

**New files (5):**
- `src/lib/gis-transform.ts` — proj4 wrapper, local origin, coordinate assertions
- `src/lib/earcut-extrude.ts` — earcut triangulation + BufferGeometry cap builder
- `src/components/viewer/satellite-ground.tsx` — R3F ground plane with WMS texture
- `src/components/viewer/context-buildings.tsx` — R3F InstancedMesh LOD1 boxes
- `src/hooks/use-gis-composite.ts` — useQueries parallel fetch orchestrator

**Modified files (3):**
- `src/lib/procedural/procedural-building.ts` — use earcut caps instead of ShapeGeometry
- `src/components/viewer/building-scene.tsx` — add GIS composite layer components
- `src/app/api/vworld/footprint/route.ts` — env var for API key, parameterize domain

**New API proxy routes (3):**
- `src/app/api/vworld/satellite/route.ts` — WMS GetMap proxy
- `src/app/api/vworld/context-buildings/route.ts` — WFS bbox cadastral query
- `src/app/api/vworld/zoning/route.ts` — WFS zoning district query

---

### Build Order (strict dependency chain)

1. **Coordinate System Foundation** — `gis-transform.ts` with proj4, local origin convention, assertions. All subsequent phases depend on this.
2. **Footprint Extrusion** — `earcut-extrude.ts`, replace ShapeGeometry in procedural-building.ts. Proves the rendering pipeline before adding data complexity.
3. **Satellite Ground Plane** — New proxy route + ground plane component. Establishes the "instant composite" loading pattern.
4. **Context Buildings** — Hardest feature. Single InstancedMesh for LOD1 boxes. SAOPass tuning (kernelRadius 50→25 when count>50). Performance gate before shipping.
5. **Zoning Overlay** — Independent of other layers. WFS GeoJSON → translucent mesh. Lowest risk.

---

### Critical Pitfalls

| Pitfall | Severity | Phase | Mitigation |
|---------|----------|-------|------------|
| Float32 precision with Korean EPSG:5179 (~1M magnitude) | CRITICAL | 1 | Local origin subtraction in gis-transform.ts |
| ShapeGeometry fails on concave cadastral polygons | CRITICAL | 2 | earcut replaces Three.js triangulator unconditionally |
| Equirectangular approximation 8m error at 2km | HIGH | 1 | proj4js site-specific TM projection |
| SAOPass FPS collapse with 100+ context buildings | HIGH | 4 | Reduce kernelRadius, half-resolution mode |
| Hardcoded VWorld API key in route.ts | HIGH | 1 | Move to environment variable |
| VWorld 3D building API permanently closed | INFO | — | Synthesize from 2D footprints + height |

---

### Open Questions

- VWorld `buldHg` height field coverage in practice — fallback to `flrCnt × 3m` may be the common path
- VWorld WMS GetMap rate limiting behavior — may need tile queue even for single-image approach
- VWorld WFS `size` parameter limit for context building bbox queries — current proxy returns `size=1`

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Both packages npm-verified; proj4 ships own TS types; earcut 3.x API identical to 2.x |
| Features | HIGH | VWorld API closure confirmed; feature set grounded in available API endpoints |
| Architecture | HIGH | Grounded in direct codebase audit of procedural pipeline, existing footprint route, layer system |
| Pitfalls | HIGH | Float32, earcut, coordinate pitfalls code-grounded; SAOPass threshold estimated |

---

*Synthesized from: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md*
*Research date: 2026-04-12*
*Ready for requirements: yes*
