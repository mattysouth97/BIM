# Feature Research

**Domain:** GIS-Composite 3D Building Draft Generation — Web-based BIM viewer with Korean government spatial data
**Researched:** 2026-04-03
**Confidence:** HIGH (VWorld API endpoints verified against live codebase proxy; Three.js patterns verified against existing procedural building system; MEDIUM for terrain complexity, LOW for VWorld LOD1 height data availability)

---

## Context: What This Research Covers

This is a v4.0 feature research document specifically for the GIS compositing milestone. The existing v3.0 UX overhaul features (guided workflow, docked panels, contextual toolbar) are treated as already built and not re-researched here.

The six new capabilities to evaluate:

1. Real cadastral footprint polygon replacing the rectangular building base
2. Surrounding LOD1 context buildings from VWorld
3. Terrain/elevation integration
4. Satellite/aerial orthophoto ground plane texture
5. Zoning/land-use overlay
6. Parallel data fetch pipeline: address → instant composite render

**Important constraint discovered during research:** VWorld's 3D building model Open API was closed in 2019 due to national security regulations. LOD1 context buildings must be synthesized from VWorld's 2D building data (footprint + height attribute from `getBuildingUse` or cadastral WFS) rather than fetched as pre-built 3D geometry. This fundamentally changes the architecture of feature #2.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any GIS-composite 3D viewer is expected to have. Missing these = the tool feels like a toy or a tech demo, not a professional tool.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Real parcel footprint as building base** | Every GIS tool (Mapbox, CesiumJS, QGIS 3D) uses the actual cadastral polygon, not a box. A rectangular approximation looks amateurish next to any professional reference. The existing `footprint/route.ts` proxy already fetches the polygon — it just is not yet used as the building base mesh. | MEDIUM | VWorld `LP_PA_CBND_BUBUN` dataset is already proxied. Requires replacing `BoxGeometry` in `procedural-building.ts` with `ExtrudeGeometry` from the cadastral polygon. The polygon is already returned as `[x,z]` meter-space coordinates relative to centroid — directly usable with `THREE.Shape`. |
| **Satellite/orthophoto ground plane** | Mapbox, Google Maps 3D, and CesiumJS all show aerial imagery as the ground texture. Users searching a Korean building address expect to recognize the neighborhood context from aerial imagery. A flat gray ground plane reads as "prototype" not "product." | MEDIUM | VWorld WMTS provides aerial/satellite imagery at `https://api.vworld.kr/req/wmts/1.0.0/{key}/Satellite/{z}/{y}/{x}.jpeg`. Tile bounds for a ~500m radius around the building centroid can be stitched into a `PlaneGeometry` with a `THREE.CanvasTexture` or fetched as a single WMS GetMap image for a fixed bbox. Single-image WMS is simpler and avoids tile stitching complexity. |
| **Surrounding context buildings** | Revit's site tools, Mapbox 3D Buildings layer, and SketchUp's geo-location all show neighboring buildings to establish scale and spatial context. Without context, a single building floating on an empty plane gives no sense of urban density or shadowing relationship. | HIGH | VWorld 3D API is closed (as of 2019, confirmed). Alternative: use VWorld `getBuildingUse` NED API with bbox to get neighboring buildings' footprints + height (`buldHg`), then extrude with `ExtrudeGeometry`. Height data confidence: MEDIUM — VWorld's `buldHg` field exists but coverage may vary. Fallback: infer height from `groundFloorCo` (floor count) × 3m. |
| **Coordinate-space accuracy** | Users need to trust that what they see matches the real world. A building that renders 50m from its actual parcel boundary destroys trust. This is the foundational accuracy requirement. | LOW | The existing `extractPolygon()` in `footprint/route.ts` uses equirectangular projection (meters from centroid). This is accurate to ~0.1% error within a 500m radius — sufficient for LOD1 context. Use same projection for all GIS layers to guarantee alignment. |
| **Loading state with progressive reveal** | Google Maps, Mapbox, and CesiumJS all show a progressive load: base map appears first, then buildings, then detail. Users expect visual feedback that data is loading, not a blank screen for 2-3 seconds. | LOW | TanStack Query (already in stack) provides `isLoading`/`isFetching` states. Show a flat satellite texture immediately (fastest data), then fade in building extrusions as geometry resolves. |
| **Camera anchored to building** | The camera must frame the target building after composite generation. In Mapbox and CesiumJS, "fly to" is standard after data loads. | LOW | Compute bounding box of the cadastral footprint polygon → `camera.fitSphere()` or equivalent R3F camera control. The `footprint/route.ts` polygon is already in local meter-space, so bounds are trivially computed. |

### Differentiators (Competitive Advantage)

Features that make this composite viewer specific to the Korean GX energy-audit use case, not just a generic 3D map viewer.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Address → instant composite in under 3 seconds** | Commercial tools (Mapbox, CesiumJS) require manual layer configuration and data setup. This tool should produce a complete composite render automatically from a single address lookup — no user-initiated layer controls. The GX team's workflow is search-first; every extra click is a barrier. | HIGH | Requires parallel data fetch pipeline: `Promise.allSettled([fetchFootprint, fetchSatellite, fetchContextBuildings, fetchZoning])` — all requests fire simultaneously on address resolution. The composite scene is built from whatever resolves first; missing layers degrade gracefully. Critical path: footprint polygon (fastest) → satellite imagery (medium) → context buildings (slowest). |
| **Zoning/land-use overlay toggle** | Korean building energy codes depend on zoning (도시지역, 관리지역, 농림지역). GX energy auditors need to verify that energy compliance rules match the actual zoning classification. No other consumer GIS tool surfaces Korean zoning data in a 3D building context. | MEDIUM | VWorld provides `LT_C_UQ111` (도시지역), `LT_C_UQ112` (관리지역), `LT_C_UQ113` (농림지역), `LT_C_UQ114` (자연환경보전지역) as WFS layers. Render as colored semi-transparent `ShapeGeometry` overlaid on the ground plane. Toggle button in the composite toolbar. |
| **Target building differentiated from context** | Context buildings should clearly read as "background" — they provide spatial awareness but must not compete visually with the target building being analyzed. Professional tools (Revit site context, SketchUp geo-location) use grayscale/muted context and highlighted target. | LOW | Target building: full PBR material pipeline from existing `pbr-materials.ts` + era-based facade. Context buildings: flat `MeshStandardMaterial({ color: '#c8c8c8', roughness: 0.9 })` with low opacity. Zero new code — material differentiation in the scene assembly logic. |
| **Seamless transition from GIS composite to BIM authoring** | The composite view is the entry point, not the final state. After reviewing the GIS context, users should be able to "switch to BIM mode" which transitions the view from context buildings to the detailed internal model. This closes the gap between GIS awareness and energy authoring. | MEDIUM | The `workflowStore.stage` FSM already controls what's shown. Add a `gis-composite` pre-stage before `select`. Transitioning to `select` fades out context geometry and activates the detailed procedural building. The same R3F canvas handles both — context buildings are added/removed from the scene graph, not re-rendered in a separate view. |
| **Building ledger data auto-linked to footprint** | The data.go.kr building ledger (floor count, structure type, permitted year, area) is already fetched. Surfacing these attributes as annotations over the GIS footprint — e.g., a label showing "RC 1994 15F 건물" over the cadastral polygon — provides instant spatial + semantic context without user interaction. | LOW | An R3F `<Html>` label anchored to the footprint centroid. The building ledger data is already in TanStack Query cache from the search step. Zero new data fetching. |
| **Terrain-aware building placement** | Korean topography varies significantly — hillside buildings, riverside lots, sloped sites. Placing buildings on a flat plane misleads energy auditors about shading and wind exposure. Terrain-aware placement shows the building on its actual slope. | HIGH | VWorld provides terrain DEM data. Implementation: fetch DEM elevation value at building centroid, sample ~5×5 grid of elevation points around the site, generate a `PlaneGeometry` with vertex displacement. Complexity is in the coordinate-to-tile-to-elevation lookup. Defer to a secondary feature. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full Mapbox/CesiumJS integration** | Looks like the obvious solution — these are the industry-standard GIS rendering engines. The app "could just embed Mapbox." | Mapbox GL JS and CesiumJS each introduce a 300-500KB dependency, a second WebGL context competing with the existing Three.js canvas, and a completely different camera/coordinate system requiring complex synchronization. The existing Three.js stack can do everything needed for LOD1 context rendering. Two WebGL contexts on a single page is a known source of GPU memory pressure and context-loss bugs. | Fetch data from VWorld (cadastral, satellite WMS, zoning WFS) using the existing proxy pattern, render everything in the existing Three.js/R3F canvas. No second rendering engine. |
| **Full-resolution satellite texture streaming with tile cache** | Tile-based streaming looks better (higher resolution) and is how Mapbox does it. | Stitching multiple WMTS tiles into a seamless Three.js texture requires coordinate transform math, seam handling, and a tile management system. For a ~300m site context view, a single WMS GetMap request at sufficient resolution (1024×1024) is indistinguishable from tile streaming and requires zero tile management. The complexity of tile streaming is not justified for fixed-viewport context rendering. | One WMS GetMap request per composite load, fetched server-side through the existing proxy pattern. Upgrade to tile streaming only if users need to pan/zoom the satellite context (not a current requirement). |
| **Real-time 3D terrain mesh from DEM** | Terrain looks impressive and the VWorld DEM exists. | Terrain geometry requires: DEM tile fetching, RGB-encoded elevation decoding, mesh generation, and correct vertical scale. This is a significant engineering task, is not required for energy compliance analysis, and may actually distort the building's energy context (shadowing from terrain is rarely modeled in Korean ECO2 methodology). | Flat ground plane as default. Show the site elevation in the building info overlay (fetched from a single DEM point, not a mesh). Defer full terrain mesh to a later milestone if shadow analysis is requested. |
| **Context building LOD2/LOD3 textures from VWorld** | High-quality context buildings make the render look more photorealistic and more like Google Earth. | VWorld's 3D data API was permanently closed in 2019. Attempting to reconstruct the scrapped XDO format is unsupported and violates the data access terms. LOD1 box extrusions provide correct spatial context (scale, density, shadow volumes) which is all that's needed for energy analysis. | Gray box LOD1 extrusions for all context buildings. The target building has full PBR materials — that contrast is the correct visual hierarchy. |
| **Interactive map layer controls (show/hide layers at will)** | GIS professionals expect to toggle all layers, adjust transparency, reorder layers like in QGIS. | The GX team are energy auditors, not GIS operators. Full layer controls add UI complexity for features 90% of users never need. Satellite and zoning are the only two toggleable layers needed. | One toggle for satellite texture (on/off), one toggle for zoning overlay (on/off). Both in the contextual toolbar. No layer panel. |
| **Address geocoding fallback to Google Maps / Kakao** | VWorld geocoding sometimes fails for rural addresses or newly registered parcels. Using Kakao Maps API as a fallback seems prudent. | Adding Kakao or Google as a secondary geocoder introduces a dependency with commercial licensing terms. It also creates ambiguity about which geocoder produced the result. | Use the existing VWorld address geocoder. If VWorld geocoding fails, surface an error with the "copy address to search manually" affordance. Do not silently fall back to a different coordinate system. |

---

## Feature Dependencies

```
[Cadastral footprint polygon]
    └──required by──> [Real parcel footprint as building base]
    └──required by──> [Context buildings extrusion] (centroid + bbox derived from footprint)
    └──required by──> [Camera anchor to building] (bounds from polygon)
    └──required by──> [Building ledger label overlay] (centroid from polygon)
    └──already built──> VWorld LP_PA_CBND_BUBUN proxy in footprint/route.ts

[VWorld satellite WMS proxy]
    └──required by──> [Satellite/orthophoto ground plane]
    └──NOT built──> New proxy route needed (parallel to footprint/route.ts)

[VWorld getBuildingUse NED API or cadastral WFS bbox query]
    └──required by──> [Context buildings with height]
    └──NOT built──> New proxy route for bbox-based building lookup

[THREE.ExtrudeGeometry from polygon]
    └──required by──> [Real parcel footprint as building base]
    └──required by──> [Context buildings extrusion]
    └──depends on──>  [THREE.Shape from coordinate array] (standard Three.js API)

[Parallel fetch pipeline]
    └──required by──> [Address → instant composite render]
    └──depends on──>  [TanStack Query] (ALREADY IN STACK)
    └──depends on──>  [All VWorld proxy routes]

[Zoning WFS proxy]
    └──required by──> [Zoning/land-use overlay]
    └──NOT built──> New proxy route for LT_C_UQ111-114

[workflowStore GIS pre-stage]
    └──required by──> [Seamless GIS-to-BIM transition]
    └──depends on──>  [workflowStore FSM] (ALREADY BUILT in v3.0)

[DEM elevation proxy]
    └──required by──> [Terrain-aware building placement]
    └──NOT built──> New proxy route; complexity HIGH — defer
```

### Dependency Notes

- **Footprint polygon is already fetched.** The `footprint/route.ts` proxy is live. What is not built is using the polygon as the `ExtrudeGeometry` base. This is the highest-value, lowest-risk feature.
- **VWorld 3D building API is permanently closed.** Context buildings require construction from 2D data (footprint + height). This changes the architecture from "stream 3D models" to "fetch 2D features + extrude in the browser."
- **Satellite imagery requires a new proxy route** but follows the exact same Next.js route pattern as `footprint/route.ts`. The WMS endpoint is known: `https://api.vworld.kr/req/wms`.
- **Context buildings are the hardest feature.** The bbox-based building query (to find all buildings near a coordinate) requires either VWorld WFS `LP_PA_CBND_BUBUN` with a geometry filter OR the NED `getBuildingUse` API, both of which return per-parcel data that must be iterated. Performance matters: a 300m radius can contain 50-200 buildings.
- **Zoning overlay depends on no other feature** — it is entirely independent of the other layers and can be built in isolation.
- **Terrain is the only feature with no known VWorld API path** — DEM is available but requires tile-coordinate math. Defer.

---

## MVP Definition

### Launch With (v4.0 core)

Minimum viable GIS composite that delivers "instant realistic draft" value to the GX team.

- [ ] **Real cadastral footprint as building base** — This alone eliminates the primary visual failure of v3.0 (rectangular box). The polygon is already fetched; wire it to `ExtrudeGeometry`. Highest value-to-cost ratio of any v4.0 feature.
- [ ] **Satellite/orthophoto ground plane** — Without aerial context, the user cannot confirm the building is the correct one. This is the spatial reference that makes the composite "feel real." A single WMS GetMap call returns a texture usable immediately.
- [ ] **Parallel fetch pipeline** — Auto-fire all VWorld data requests on building selection, compose what resolves. Users should never need to click "load context" — it happens automatically. This requires coordinating TanStack Query calls, not building a new framework.
- [ ] **Context buildings (LOD1 gray box)** — Even crude box extrusions from adjacent footprints establish spatial scale. The GX team needs to verify that the target building is not shadowed by taller neighbors — this requires context geometry, not textures. Implementation is the hardest of the MVP features; use fallback inferred height (floor count × 3m) if `buldHg` is unavailable.
- [ ] **Building ledger label overlay** — The building's address, floor count, structure type, and permitted year as an anchored HTML label. Zero new data fetching; reuses the already-loaded building ledger result.

### Add After Validation (v4.x)

- [ ] **Zoning/land-use overlay toggle** — Add when GX team needs to verify zoning classification against energy compliance rules. Trigger: a user asks "what zoning is this building in?"
- [ ] **GIS-to-BIM transition animation** — Add after composite and BIM modes are both stable. Trigger: user feedback that switching between the two views is jarring.
- [ ] **Context building count/radius control** — Default 200m radius is correct for most urban sites. Trigger: user complaints about too many or too few context buildings.

### Future Consideration (v4.x+)

- [ ] **Terrain-aware building placement** — Defer until shadow analysis is a GX team requirement. HIGH complexity, LOW immediate value for compliance-focused use cases.
- [ ] **Dynamic satellite tile streaming with pan/zoom** — Defer until users need to navigate beyond the ~300m context radius. Single WMS image is sufficient for static composite view.
- [ ] **LOD2 context buildings from third-party data** — If VWorld ever re-opens its 3D API or a Korean LOD2 dataset becomes available (e.g., OpenStreetMap buildings with roof types), upgrade context from LOD1 to LOD2. Not actionable in 2026.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Real cadastral footprint as building base | HIGH | LOW | P1 |
| Satellite/orthophoto ground plane | HIGH | LOW | P1 |
| Parallel fetch pipeline (auto-composite) | HIGH | MEDIUM | P1 |
| Context buildings LOD1 gray box | HIGH | HIGH | P1 |
| Building ledger label overlay | MEDIUM | LOW | P1 |
| Zoning/land-use overlay toggle | MEDIUM | MEDIUM | P2 |
| Target vs. context visual differentiation | MEDIUM | LOW | P2 |
| GIS-to-BIM workflow stage transition | HIGH | MEDIUM | P2 |
| Camera fly-to on composite load | MEDIUM | LOW | P2 |
| Progressive loading / skeleton states | MEDIUM | LOW | P2 |
| Terrain-aware building placement | LOW | HIGH | P3 |
| Satellite tile streaming (pan/zoom) | LOW | HIGH | P3 |
| LOD2 context buildings | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for v4.0 — core "instant composite draft" thesis
- P2: Should have, add when P1 features are validated by GX team
- P3: Future milestone — high complexity or blocked by external data availability

---

## VWorld Data Layer Reference

Confirmed available for this project (user has VWorld account, API key already in codebase):

| Dataset / Endpoint | Purpose | Notes |
|--------------------|---------|-------|
| `LP_PA_CBND_BUBUN` (Data API) | Cadastral footprint polygon | Already proxied in `src/app/api/vworld/footprint/route.ts`. Supports PNU filter and bbox filter. |
| VWorld WMS `Satellite` layer | Aerial orthophoto ground texture | WMTS URL: `https://api.vworld.kr/req/wmts/1.0.0/{key}/Satellite/{z}/{y}/{x}.jpeg`. For static bbox texture, use WMS GetMap instead. |
| VWorld WMS `Base` layer | Street map overlay (optional debug) | Same WMTS pattern with `Base` layer name. |
| `getBuildingUse` NED API | Per-parcel building height (`buldHg`), floor count | `https://api.vworld.kr/ned/data/getBuildingUse?pnu={pnu}`. Returns height and floor count. PNU-based — need to iterate per building in bbox. |
| `LT_C_UQ111` (WFS) | 도시지역 zoning polygon | WFS at `https://api.vworld.kr/req/wfs`. Returns GeoJSON polygons for zoning districts. |
| `LT_C_UQ112` (WFS) | 관리지역 zoning polygon | Same WFS endpoint, different typeName. |
| `LT_C_UQ113` (WFS) | 농림지역 zoning polygon | Same WFS endpoint. |
| `LT_C_UQ114` (WFS) | 자연환경보전지역 zoning polygon | Same WFS endpoint. |

**Confirmed closed / unavailable:**
- VWorld 3D building geometry API (XDO format) — permanently closed July 2019 for national security reasons. LOD1 context buildings must be synthesized from 2D data.

---

## Existing Codebase Integration Points

Dependencies on what is already built in v3.0:

| Feature | Existing Asset | How It's Used |
|---------|---------------|---------------|
| Footprint polygon → building base | `src/app/api/vworld/footprint/route.ts` | Already returns `[x,z]` meter-space polygon array. Wire to `THREE.Shape` → `THREE.ExtrudeGeometry` in `procedural-building.ts` to replace `BoxGeometry` base. |
| Context building extrusion | `src/lib/procedural/structure-generator.ts` (InstancedMesh pattern) | Context buildings are NOT the same procedural system — they are simple gray boxes. Use `THREE.ExtrudeGeometry` + `THREE.MeshStandardMaterial` directly. Do NOT route through `ProceduralBuilding` (that's for the target building only). |
| PBR material differentiation | `src/lib/pbr-materials.ts` | Target building: full PBR pipeline (unchanged). Context buildings: flat gray `MeshStandardMaterial`. This contrast is the correct visual hierarchy without any new code. |
| Parallel fetch coordination | TanStack Query v5 (`useQueries` or `Promise.allSettled`) | Already in the stack. Use `useQueries` to fire all VWorld requests in parallel and merge results. Each GIS layer is a separate query key so they resolve independently and can be individually retried. |
| Data proxy pattern | `src/app/api/bldrgst/` and `src/app/api/vworld/footprint/route.ts` | New VWorld proxy routes follow identical Next.js `Route Handler` pattern. Add `src/app/api/vworld/satellite/route.ts`, `src/app/api/vworld/context-buildings/route.ts`, `src/app/api/vworld/zoning/route.ts`. |
| Building ledger data | `src/lib/api-client.ts` + TanStack Query | Building ledger (floor count, structure type, era) is already in cache when the composite renders. Label overlay reads from this cache with no new fetch. |
| Scene coordinate system | `src/app/api/vworld/footprint/route.ts` `extractPolygon()` | All GIS features must use the same equirectangular projection (meters from building centroid in EPSG:4326). The footprint proxy already establishes this origin. Satellite tile bounds, context building footprints, and zoning polygons all use the same centroid as origin. |
| Workflow stage integration | `src/store/workflow-store.ts` | Add `"gis-composite"` as a pre-stage before `"select"`. The composite view is active in this stage; transitioning to `"select"` fades out context geometry. |

---

## Competitor Feature Analysis

| Feature | Mapbox GL JS 3D | CesiumJS | Google Maps 3D | Our Approach |
|---------|-----------------|----------|----------------|--------------|
| Building footprint accuracy | OpenStreetMap or Mapbox data | OpenStreetMap or 3D Tiles | Google's proprietary dataset | VWorld cadastral `LP_PA_CBND_BUBUN` — official Korean government data, highest accuracy for Korean addresses |
| Context building source | Mapbox 3D Buildings layer (vector tiles) | Cesium OSM Buildings (3D Tiles) | Photogrammetry LOD2 | VWorld 2D building data + client-side extrusion; LOD1 only but Korea-accurate |
| Satellite imagery | Mapbox Satellite tiles | Bing Maps by default | Google Satellite | VWorld Satellite WMTS — Korean government imagery, consistent resolution |
| Terrain | Mapbox Terrain-DEM tiles (automatic) | Cesium World Terrain | Google terrain | Manual DEM fetch (P3 feature) — flat ground for v4.0 |
| Zoning data | Not available in standard layers | Not available in standard layers | Not available | VWorld WFS `LT_C_UQ111-114` — unique differentiator |
| Time to composite | ~1-2s (tile streaming, requires Mapbox account) | ~2-3s (massive library, slower cold start) | N/A (proprietary) | Target <3s — single-image WMS + parallel VWorld API calls via Next.js proxy |
| Integration with BIM authoring | None (map viewer only) | None (geospatial renderer only) | None | Seamless: same Three.js canvas, same workflowStore stage machine, one scene |

---

## Sources

- VWorld LP_PA_CBND_BUBUN cadastral API: `src/app/api/vworld/footprint/route.ts` (live in codebase) — HIGH confidence
- VWorld 3D API closure (2019): [vw-lab.com](https://www.vw-lab.com/53) — MEDIUM confidence (Korean-language blog, single source, but consistent with absence of any 3D API documentation post-2019)
- VWorld WMTS satellite layer URL pattern: [vworld.kr WMTS reference](https://vworld.kr/dev/v4dv_wmtsguide_s001.do), confirmed against known tile URL structure `{key}/Satellite/{z}/{y}/{x}` — MEDIUM confidence (page required login to view full spec)
- VWorld getBuildingUse NED API with `buldHg` field: [qquack.org OpenAPI guide](https://qquack.org/excel/openapi-buildinginfo/) — MEDIUM confidence (third-party docs)
- VWorld WFS zoning layers LT_C_UQ111-114: [PublicDataReader VworldData.md](https://github.com/WooilJeong/PublicDataReader/blob/main/assets/docs/vworld/VworldData.md) — MEDIUM confidence
- VWorld WMS/WFS API reference: [vworld.kr WMS/WFS guide](https://www.vworld.kr/dev/v4dv_wmsguide2_s001.do) — MEDIUM confidence (accessed structure, not full layer list)
- LOD1 generation by extrusion: [3dfier docs](https://tudelft3d.github.io/3dfier/generate_lod1.html), [3D city models Wikipedia](https://en.wikipedia.org/wiki/3D_city_models) — HIGH confidence (established GIS practice)
- Three.js ExtrudeGeometry for polygon extrusion: [three.js docs](https://threejs.org/docs/pages/ExtrudeGeometry.html) — HIGH confidence
- InstancedMesh performance for context buildings: [three.js InstancedMesh docs](https://threejs.org/docs/pages/InstancedMesh.html), existing codebase `structure-generator.ts` — HIGH confidence
- Mapbox 2s load time for 3D buildings: [LogRocket Cesium vs Mapbox](https://blog.logrocket.com/cesium-vs-mapbox-which-mapping-service-is-best/) — LOW confidence (single benchmark, not reproducible in this context)
- three-geo library for satellite terrain: [w3reality/three-geo](https://github.com/w3reality/three-geo) — HIGH confidence (library exists but Mapbox DEM dependency makes it inappropriate for VWorld-only integration)

---
*Feature research for: Korean BIM Energy Management System — v4.0 GIS-Composite Realistic Drafts*
*Researched: 2026-04-03*
