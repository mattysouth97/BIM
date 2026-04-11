# Pitfalls Research

**Domain:** GIS compositing added to an existing Three.js BIM viewer (footprint extrusion, terrain, ortho tiles, coordinate transforms, context buildings) — Korean spatial data
**Researched:** 2026-04-03
**Confidence:** HIGH (code-grounded on existing codebase) / MEDIUM (web-validated Three.js GIS patterns) / LOW (VWorld-specific undocumented limits)

---

## Critical Pitfalls

### Pitfall 1: Equirectangular Approximation Breaks at District Scale

**What goes wrong:**
The existing `extractPolygon()` in `src/app/api/vworld/footprint/route.ts` converts WGS84 `[lng, lat]` to local meters using an equirectangular approximation (`metersPerDegreeLng = 111320 * cos(lat)`). For a single cadastral parcel (< 200m across) this is accurate to sub-centimeter. But when loading surrounding context buildings, terrain tiles, or ortho tiles over a 500m–2km radius, the approximation accumulates error. At 1km from the centroid in Seoul (lat ~37.5°), the longitudinal error is ~2m per 1km; at 2km it is ~8m, enough to visually misalign context buildings from their ortho tile position. The user sees buildings floating 5–10m from their satellite image footprints.

**Why it happens:**
Equirectangular works fine for a single parcel but does not account for meridian convergence (longitude degrees shrink near poles) or ellipsoidal curvature over larger distances. Developers extend a parcel-level approach to scene-level use without revalidating accuracy at the new radius.

**How to avoid:**
Use a proper local-tangent-plane (LTP) projection for all GIS-to-3D transforms. For the Korean peninsula (EPSG:5179, GRS80 ellipsoid), the correct approach is:
1. Pick a scene origin (the queried building centroid) in WGS84.
2. Convert all GIS coordinates to ECEF (Earth-Centered Earth-Fixed) using the GRS80 ellipsoid.
3. Apply the ECEF-to-LTP rotation matrix centered on the origin.
4. Use the resulting local East-North-Up (ENU) coordinates directly as Three.js `x, y, z`.

Alternatively, use `proj4js` with a site-specific TM (Transverse Mercator) projection centered on the building: define a custom CRS with `+lat_0=<centroid_lat> +lon_0=<centroid_lng> +proj=tmerc +units=m` and convert all GeoJSON through it. This eliminates the cos(lat) approximation error entirely.

The simpler equirectangular approach is acceptable only if the scene radius stays under 300m — document this limit explicitly.

**Warning signs:**
- Context buildings visually offset from ortho tile imagery by more than 2m
- Cadastral polygon vertices misalign with visible parcel boundaries on the satellite layer
- Buildings on the east/west edge of the scene are more misaligned than those near center

**Phase to address:**
Phase 1 (Coordinate System Foundation) — Establish the projection strategy before any GIS geometry is added to the scene. Retrofitting is expensive because every GIS-to-3D transform must be updated.

---

### Pitfall 2: Three.js Float32 Precision Jitter from Korean Projected Coordinates

**What goes wrong:**
EPSG:5179 (KGD2002 Unified CS) coordinates for Seoul are in the range `(950000, 1950000)` meters (Easting, Northing). If these are passed directly to Three.js `mesh.position.set(950000, 0, 1950000)`, the GPU operates in float32, which has ~7 significant digits of precision. At coordinate magnitude ~10^6, position precision degrades to ~0.1m. The scene will show visible vertex jitter on building edges, shadow artifacts, and SAOPass occlusion halos that flicker because depth buffer resolution is consumed by the large coordinate magnitude.

**Why it happens:**
Developers familiar with GIS tools (which work in float64) assume Three.js handles large coordinates. WebGL shaders and vertex buffers use float32. The problem is invisible in isolation (a single building looks fine) but appears when comparing relative positions of two objects at 950000m vs 951000m — both get rounded to the nearest 0.1m.

**How to avoid:**
Always subtract a scene origin from all GIS coordinates before sending to Three.js. The origin should be the centroid of the queried building. All scene objects are positioned in local ENU coordinates (meters relative to origin). The origin's WGS84 position is stored separately for any coordinate round-trips. Never put raw projected coordinates (EPSG:5174/5179 Easting/Northing) into Three.js position values. Keep coordinates in the range ±5000m from origin — at that magnitude, float32 gives 0.001m precision, which is sufficient for BIM.

**Warning signs:**
- Terrain mesh edges show visible zigzag pattern or step artifacts
- SAOPass produces halos that flicker on building corners at scene edges
- `mesh.position.x` values exceed 10,000 in the Three.js inspector

**Phase to address:**
Phase 1 (Coordinate System Foundation) — The local-origin convention must be defined as an invariant before any GIS geometry is added. All subsequent phases must adhere to it.

---

### Pitfall 3: EPSG:5179 vs EPSG:4326 Axis Order Inversion with proj4js

**What goes wrong:**
Korean projected systems (EPSG:5174, EPSG:5179) use Northing-Easting axis order in the official EPSG registry. The VWorld API returns coordinates in `[longitude, latitude]` order (GeoJSON convention, which is `[x, y]`). When converting between these CRS using `proj4js`, axis order inversion is a silent bug: the library returns `[Easting, Northing]` for EPSG:5179 but the data may have been provided in `[Northing, Easting]` from some VWorld endpoints. The resulting swap of ~950km (Northing) into the Easting slot places the building 1000km from its correct position, often in the ocean.

**Why it happens:**
proj4js uses `[x, y]` regardless of whether the authority definition specifies Northing-Easting. VWorld's Data API (`/req/data`) returns GeoJSON where coordinates are always `[longitude, latitude]` = `[x, y]` per RFC7946. But VWorld's older WFS endpoint returns GML where axis order follows the EPSG definition, which for EPSG:5179 is `[Northing, Easting]`. If code handles one endpoint and is reused for another, the swap goes undetected until a coordinate is visually inspected.

**How to avoid:**
- For VWorld's JSON Data API (`/req/data` with `crs=EPSG:4326`): always request `crs=EPSG:4326` and parse coordinates as `[longitude, latitude]`. Never change this — always work in WGS84 through the VWorld API layer.
- If EPSG:5179 or EPSG:5174 coordinates appear (e.g., from a WFS response), explicitly swap to `[Easting, Northing]` before passing to proj4js. Add an assertion: `if (easting < 100000 || easting > 1500000) throw new Error('Axis order suspect: Easting out of Korean range')`.
- The existing `fetchByPNU` and `fetchByBBox` already request `crs=EPSG:4326` — maintain this invariant for all new VWorld calls.

**Warning signs:**
- Converted coordinates place buildings in the Yellow Sea or East Sea
- `proj4('EPSG:5179', 'EPSG:4326', [coord])` returns longitude values outside 124–132°E

**Phase to address:**
Phase 1 (Coordinate System Foundation) — Centralize all CRS conversion in a single `gis-transform.ts` module with assertions, instead of ad-hoc conversion in each component.

---

### Pitfall 4: Three.js `ShapeGeometry` Fails on Complex Cadastral Polygons

**What goes wrong:**
Korean cadastral parcels frequently have: (a) concave vertices from L-shaped or irregular lots, (b) interior holes where roads or easements cut through, (c) near-collinear vertices from digitization artifacts, and occasionally (d) self-touching rings where two parcel boundaries share a point. Three.js `ShapeGeometry` and `ExtrudeGeometry` use a simple ear-clipping triangulator internally. It produces incorrect triangulations for concave polygons with holes and throws a console warning `"Probably Hole outside Shape!"` for polygons where the hole vertices are collinear with the outer ring. The extruded building footprint then shows missing faces, inverted triangles, or black holes.

**Why it happens:**
Three.js's built-in triangulator handles only simple polygons reliably. The Three.js issue tracker documents this as a known limitation (issue #11957, issue #3386). Cadastral data is not clean geometric data — it is surveyed administrative data with artifacts that violate the simple-polygon assumption.

**How to avoid:**
Use `earcut` (npm: `earcut`, ~3KB) as a replacement triangulator. Earcut handles concave polygons, holes, and self-touching vertices correctly for practical geographic data. The workflow:
1. Receive GeoJSON `Polygon` or `MultiPolygon` from VWorld.
2. Flatten using `earcut.flatten(geojsonCoords)` to get `vertices[]`, `holes[]`, `dimensions`.
3. Run `earcut(vertices, holes, dimensions)` to get a triangle index array.
4. Build a `THREE.BufferGeometry` manually: set `position` attribute from the vertices, set `index` from earcut output.
5. Extrude using a custom approach: create top and bottom faces from earcut output, then generate side quads from consecutive edge pairs.

Pre-process the polygon to remove duplicate/near-collinear vertices before passing to earcut: vertices within 0.05m of each other should be merged.

**Warning signs:**
- Console logs `"Probably Hole outside Shape!"` during building footprint creation
- Extruded building has visual holes (missing triangles) in the floor or roof caps
- `ExtrudeGeometry` produces a flat result for an L-shaped parcel

**Phase to address:**
Phase 2 (Footprint Extrusion) — Earcut must be the default triangulator from day one. Do not attempt to fix Three.js `ShapeGeometry` output — replace it.

---

### Pitfall 5: Terrain Mesh and Building Foundation Misalignment

**What goes wrong:**
DEM (Digital Elevation Model) data gives the terrain height at each sample point. When a building footprint is extruded and placed on terrain, the extrusion starts at `y = 0` (local flat ground) while the DEM mesh has a non-zero height at that location. The building appears to float above the terrain or sink into it. This is especially visible for sloped sites — a 10-storey building on a 3m grade change will have its first floor either 3m in the air or buried 3m underground depending on which reference the extrusion uses.

**Why it happens:**
The procedural building system currently assumes a flat ground plane (existing `GroundPlane` component, `y = -0.02`). The system was never designed to account for terrain variation. When terrain is added, developers add the terrain mesh but forget to update the building's base Y position to match the terrain height at the footprint centroid.

**How to avoid:**
- Sample the DEM at the building footprint centroid to get the base elevation `h_base`.
- Set the extruded footprint mesh `position.y = h_base`.
- For the procedural building itself, pass `groundElevation: h_base` into the recipe and shift all floor `y` values up by `h_base`.
- If the terrain has significant slope across the footprint (more than 1m variation between footprint corners), use the minimum corner elevation as `h_base` and model a foundation plinth to cover the gap. Do not use the centroid average for sloped sites.

**Warning signs:**
- Building hovers above the terrain mesh in the rendered scene
- The ground plane `y = -0.02` is visible between the building base and the terrain surface
- Building floor 0 is partially clipped into the terrain mesh

**Phase to address:**
Phase 3 (Terrain Integration) — Define the `groundElevation` contract as part of the terrain phase, not as an afterthought in the building rendering phase.

---

### Pitfall 6: VWorld WMTS Tile Loading Blocking the React Render Loop

**What goes wrong:**
Ortho satellite tiles (VWorld WMTS) are loaded as `HTMLImageElement` or fetched as blobs, then assigned to `THREE.Texture`. If this is done synchronously inside a React component or a `useEffect` without proper async management, large tile loads (256x256 PNG ×16 tiles for a 500m scene context) block the JS event loop during decode. The 3D scene freezes for 200–800ms when a new building is selected. Alternatively, if all 16 tiles are requested simultaneously without queuing, VWorld's server returns HTTP 429 (rate limit exceeded) for burst requests above 5–10 concurrent calls.

**Why it happens:**
Tile loading appears straightforward (`new THREE.TextureLoader().load(url)`). The default `TextureLoader` fires all requests simultaneously. There is no built-in queue, no rate-limit backoff, and no tile priority system.

**How to avoid:**
- Use a tile request queue that limits concurrency to 4 simultaneous requests (matches browser's HTTP/1.1 per-origin limit and VWorld's practical burst tolerance).
- Use `THREE.Cache.enabled = true` to cache decoded textures across building selections.
- Implement a tile eviction strategy: track which tiles are more than 1km from the current building centroid and call `texture.dispose()` on them.
- For the initial implementation, load tiles as `<img>` elements (browser cache applies automatically) rather than fetched blobs. This gives free HTTP caching with `cache-control` headers.
- Never load ortho tiles synchronously; always load in a `useEffect` with an `AbortController` that cancels pending loads when the component unmounts or the building changes.

**Warning signs:**
- 3D scene freezes for > 200ms when a new building is selected
- Browser network tab shows 16+ simultaneous requests to `api.vworld.kr`
- VWorld returns `429 Too Many Requests` intermittently

**Phase to address:**
Phase 4 (Ortho Tile Integration) — Build the tile queue as a utility before any tiles are loaded. The queue is a prerequisite, not an optimization.

---

### Pitfall 7: SAOPass Performance Collapse with Added GIS Geometry

**What goes wrong:**
The existing scene has ~7 draw calls (procedural building InstancedMesh). Adding GIS layers introduces: a terrain mesh with 64×64 vertices, 16+ ortho tile planes, 50–200 context building boxes, and a ground ortho plane. SAOPass is a screen-space effect whose cost scales with scene depth complexity (number of overlapping depth samples). Adding 200+ context buildings roughly triples SAOPass sample count, dropping from the current ~60fps to 20–35fps on integrated graphics, which is the GX team's most common hardware.

**Why it happens:**
SAOPass's kernel radius and sample count are configured for a simple 7-draw-call scene. Nobody recalibrates when the scene becomes more complex. The post-processing pipeline runs at full resolution by default.

**How to avoid:**
- Reduce SAOPass kernel radius when GIS layers are active: change `saoKernelRadius` from `50` to `25` when context buildings are present.
- Run SAOPass at half resolution: add `saoPass.setSize(size.width / 2, size.height / 2)` when context building count > 50.
- Context buildings should use `castShadow = false` and `receiveShadow = false` — they are backdrop elements, not accurate shadows.
- Consider replacing SAOPass with N8AO (a lighter SSAO implementation) once GIS layers are added: N8AO provides comparable quality at 30–50% the cost of SAOPass on complex scenes.
- Expose a "performance mode" toggle that disables post-processing entirely when GIS context is active on low-end hardware.

**Warning signs:**
- Frame rate drops below 30fps after adding context buildings
- Scene performance degrades proportionally to context building count
- `renderer.info.render.calls` exceeds 100 in the browser inspector

**Phase to address:**
Phase 5 (Context Buildings) — Benchmark SAOPass performance against context building count before shipping. Establish a maximum count threshold (recommend 150 boxes) beyond which LOD or culling reduces geometry.

---

### Pitfall 8: VWorld API Domain Restriction Breaks Production

**What goes wrong:**
VWorld API keys are registered against specific domains. The existing code in `route.ts` passes `domain: "localhost"` in the request. This works in development but returns `401 Unauthorized` or an empty response in production because `localhost` does not match the production domain. Since the API call is server-side (Next.js API route), the domain must match the server's outbound identity as registered in the VWorld developer portal, not the user's browser domain.

**Why it happens:**
The `domain` parameter is easy to overlook during development because `localhost` always works for the developer. The distinction between client-side CORS domain and server-side API key domain registration is non-obvious.

**How to avoid:**
- Register the production domain in the VWorld developer portal before deployment.
- Parameterize the domain: `const domain = process.env.VWORLD_DOMAIN ?? "localhost"` and set `VWORLD_DOMAIN` in production environment variables.
- Test the full fetch pipeline against the production domain before any GIS milestone is considered complete — not just on localhost.
- Note: the hardcoded API key `98E6A75B-9FA2-3B97-A78F-A80434D6BF59` in `route.ts` is a shared/demo key. Before production deployment, issue a project-specific key from the VWorld developer portal and move it to an environment variable.

**Warning signs:**
- GIS features work on `localhost` but fail silently (return empty polygons) in staging or production
- VWorld returns `SERVICE_ERROR` status rather than `OK` in production but not in development

**Phase to address:**
Phase 2 (Footprint Extrusion) — Fix the domain parameterization at the same time the VWorld integration is extended. Production credentials are a prerequisite for any demo.

---

### Pitfall 9: MultiPolygon and Holes Silently Ignored from VWorld GeoJSON

**What goes wrong:**
The existing `extractPolygon()` takes only `geometry.coordinates[0][0]` — the outer ring of the first polygon in a MultiPolygon. For most simple rectangular parcels this is correct. But some Korean cadastral records return `MultiPolygon` (a parcel split by a road) or `Polygon` with interior rings (a parcel with a public right-of-way cut out). The current code silently discards all additional polygons and all holes. The rendered footprint then covers areas it should not (the road cutout is filled in) or misses secondary parcel sections entirely.

**Why it happens:**
The initial implementation handled the common case (single rectangular parcel, outer ring only). The edge cases were not tested against real data containing holes or multi-part parcels.

**How to avoid:**
- Parse the GeoJSON geometry type explicitly: handle both `Polygon` and `MultiPolygon`.
- For `Polygon`: extract the outer ring (`coordinates[0]`) and all hole rings (`coordinates[1..]`).
- For `MultiPolygon`: process each polygon separately; the first polygon is the "primary" footprint, secondary polygons are ancillary parts.
- Pass hole rings to the earcut triangulator as holes (the `holes` array argument).
- Test against PNU codes known to have holes: parcels adjacent to public roads in dense urban areas (Seoul Jongno, Jung-gu) commonly have right-of-way easements recorded as interior rings.

**Warning signs:**
- Rendered footprint polygon covers a visible road or alleyway
- `geometry.coordinates.length > 1` for a `Polygon` type in VWorld response

**Phase to address:**
Phase 2 (Footprint Extrusion) — Write a test with a known complex PNU that returns a polygon with holes before implementing the extrusion pipeline.

---

### Pitfall 10: Ortho Tile Seam Lines and UV Bleeding

**What goes wrong:**
When assembling multiple WMTS tiles into a ground plane, each tile is a separate `PlaneGeometry` with its own texture. At the tile boundaries, a 1–2 pixel seam line appears because: (a) texture filtering samples the edge pixel of adjacent tiles, which have different content; (b) floating-point UV coordinates at tile edges are not exactly 0.0 or 1.0 due to precision, causing sub-pixel bleeding. The assembled ortho ground looks like a grid of tiles rather than a seamless satellite image.

**Why it happens:**
UV coordinates for tiles are typically computed as `0.0` to `1.0` within each tile geometry. At zoom level 18 (standard for building-scale work), one tile covers ~76m in Seoul. Assembling 4×4 tiles covers ~300m. At this scale, a 2-pixel seam every 76m is clearly visible.

**How to avoid:**
- Inset the UV coordinates slightly: instead of `[0, 1]`, use `[0.5/256, 255.5/256]` (half-texel inset per side). This prevents the edge texel of one tile sampling into adjacent tile space.
- Set `texture.minFilter = THREE.LinearFilter` (not `LinearMipmapLinearFilter`) to prevent mipmap level switching at tile boundaries.
- Use `texture.generateMipmaps = false` for tile textures — mipmaps at tile edges always produce seams.
- Alternatively, stitch tiles into a single canvas texture using `CanvasRenderingContext2D.drawImage()` before uploading to Three.js. One 1024×1024 canvas texture covering a 4×4 tile grid has no seam lines and uses fewer draw calls than 16 separate plane geometries.

**Warning signs:**
- Visible grid lines on the satellite image ground plane at tile boundaries
- Lines become more visible when the camera is at a low angle (glancing view)

**Phase to address:**
Phase 4 (Ortho Tile Integration) — UV inset or canvas-stitching must be part of the initial tile rendering implementation, not a later visual polish step.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reusing `extractPolygon()` equirectangular approximation for large scene radius | No new math, reuses existing code | Coordinate misalignment grows with scene radius; context buildings float off satellite imagery | Only if scene radius stays < 300m; document this limit |
| Hard-coding `domain: "localhost"` in VWorld requests | Works immediately in dev | Silent 401 failure in production; GIS features appear broken after deployment | Never — parameterize from environment variable immediately |
| Using `THREE.ShapeGeometry` for footprint extrusion | Zero new dependencies | Triangulation failures on concave/hole cadastral polygons; invisible bugs on complex parcels | Never for cadastral data — use earcut unconditionally |
| Loading all WMTS tiles simultaneously without a queue | Simpler fetch code | VWorld rate-limit errors (429); scene freeze during decode; tile memory not managed | Never — implement a 4-concurrent queue before any tile loading |
| Context buildings as separate Mesh objects (one per building) | Simplest rendering code | 200+ draw calls destroys SAOPass and frame rate | Acceptable for < 20 context buildings; use InstancedMesh beyond 20 |
| Placing building at `y = 0` regardless of terrain | Matches existing GroundPlane assumption | Building floats above or sinks into terrain on any non-flat site | Only in placeholder phases before terrain integration exists |
| Running SAOPass at full resolution with GIS layers | Visual quality maintained | Frame rate collapse on integrated graphics; 35fps with 100+ context buildings | Only acceptable if GIS layers are togglable and SAO is disabled when they are active |

---

## Integration Gotchas

Common mistakes when connecting GIS layers to the existing system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| VWorld Data API | Request non-`4326` CRS (e.g., `EPSG:5179`) and pass coordinates directly to Three.js | Always request `crs=EPSG:4326`; convert to local ENU coordinates in `gis-transform.ts` |
| VWorld Data API | Accessing `geometry.coordinates[0][0]` for both `Polygon` and `MultiPolygon` types | Check `geometry.type`; handle `Polygon` and `MultiPolygon` paths separately; extract holes from inner rings |
| VWorld WMTS tiles | Requesting tiles with the domain registered key on `localhost` | Register a separate production domain key; use `VWORLD_DOMAIN` env variable in the Next.js proxy route |
| Three.js + cadastral polygons | `new THREE.ShapeGeometry(shape)` for cadastral data | Use `earcut` for triangulation; pre-process to remove duplicate vertices |
| Terrain DEM + procedural building | Building stays at `y = 0` after terrain is added | Sample DEM at footprint centroid; pass `groundElevation` to `BuildingRecipe`; shift all `FloorSpec.y` values |
| InstancedMesh (existing) + terrain mesh | SAOPass degrades silently as scene complexity grows | Profile SAOPass cost with target context building count before shipping; add performance mode toggle |
| SAOPass + tile planes | Ortho tile plane geometry receives incorrect AO (occludes itself because it is horizontal) | Set `material.aoMapIntensity = 0` on tile planes, or exclude tile plane layer from SAOPass depth test via render layers |
| Three.js float32 + Korean projected coordinates | Position values > 100,000 passed directly to mesh | Enforce local-origin convention; assert coordinate magnitude < 10,000 in debug builds |

---

## Performance Traps

Patterns that work at small scale but degrade under real GIS data.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| One `Mesh` per context building | Frame rate collapses as context buildings are added | Use `InstancedMesh` for LOD1 boxes; all context buildings share one geometry and one draw call | > 20 context buildings |
| All WMTS tiles loaded simultaneously | VWorld 429 errors; scene freeze on building change | 4-concurrent tile request queue with abort-on-change | > 4 concurrent tile requests to VWorld |
| Tile textures never disposed | GPU memory grows unbounded across building selections | LRU cache with max 32 tile textures; call `texture.dispose()` on eviction | After ~5 building selections with 16 tiles each (~100MB GPU texture memory) |
| SAOPass at full resolution with terrain + context buildings | < 30fps on integrated graphics | Halve SAOPass resolution when GIS layers active; or disable SAOPass in "context view" mode | > 50 context buildings in scene |
| Loading full DEM raster for large area | Memory spike (a 1km² DEM at 1m resolution = 1M floats = 4MB) | Sample DEM at building footprint vertices only; fetch a small bounding box tile (64×64 samples max) | Any DEM load larger than 256×256 samples |
| Earcut processing large polygons each frame | CPU spike if polygon changes each frame | Process polygon once on building selection; cache `BufferGeometry`; only re-process when polygon changes | Polygons with > 500 vertices processed per render |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Hardcoded VWorld API key in `route.ts` | Key is visible in version control; anyone with repo access can exhaust quota | Move to `process.env.VWORLD_API_KEY`; rotate the current hardcoded key |
| VWorld key in client-side code | Key exposed in browser; can be scraped and abused | Keep all VWorld calls in Next.js API routes (already done); never import the key in any `src/` client file |
| Passing raw user-supplied PNU to VWorld without validation | PNU injection into VWorld `attrFilter` query string | Validate PNU format (19 digits, numeric) before use: `/^\d{19}$/.test(pnu)` |
| No size limit on VWorld GeoJSON responses | A malformed or unexpected API response with large coordinates array could cause unbounded polygon processing | Cap polygon vertex count at 2000 in `extractPolygon()`; discard if exceeded |

---

## UX Pitfalls

Common user experience mistakes in the GIS compositing domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing satellite tiles before the building renders | User sees a satellite image with no building; looks like a bug | Load building geometry first; fade in satellite tiles after the building is visible |
| Mismatched zoom level between ortho tiles and building scale | Ortho tiles are blurry/pixelated for small buildings; tiles at wrong zoom show wrong scale | Use zoom level 18 (1m/px) for buildings < 10,000m² footprint; zoom 17 for larger sites |
| Context buildings with same color as the queried building | User cannot tell which building is the one they searched for | Use a distinct accent color (or slight glow outline via `outlinePass`) for the primary queried building |
| Terrain scale distortion | Terrain looks unrealistically mountainous if the vertical exaggeration is wrong | Do not apply vertical exaggeration to DEM; use 1:1 scale; Korean urban terrain rarely exceeds 30m variation at building scale |
| GIS layers always on, with no toggle | Satellite imagery competes with PBR materials of the building model | Provide a "Satellite view / BIM view" toggle; the existing layer panel (`layer-panel.tsx`) is the right home for this control |
| Loading spinner blocks the entire viewer | User cannot rotate or inspect the building model while GIS data loads | Load GIS layers progressively without blocking the existing 3D scene; show a subtle progress indicator on the layer panel |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Coordinate transform:** Often missing for context buildings — verify that context buildings from VWorld align with ortho tile imagery at 500m from scene center, not just the primary building.
- [ ] **Polygon holes:** Often missing — verify that the footprint extrusion for a parcel with an interior hole (road easement) shows a hole in the extruded mesh, not a filled solid.
- [ ] **Production domain:** Often missing — verify that VWorld API calls succeed from the production hostname (not just `localhost`) before any GIS milestone is considered done.
- [ ] **Float32 precision:** Often missing — verify that building positions show no vertex jitter by placing scene objects 2000m apart from origin and checking for visual artifacts.
- [ ] **Tile disposal:** Often missing — verify that selecting 10 different buildings in sequence does not grow GPU texture memory (monitor `renderer.info.memory.textures`).
- [ ] **SAOPass performance:** Often missing — verify that adding 100 context buildings does not drop frame rate below 30fps on the GX team's hardware (typically Intel integrated graphics).
- [ ] **VWorld API key in env:** Often missing — verify `process.env.VWORLD_API_KEY` is the source of the key in `route.ts`, not a hardcoded string.
- [ ] **Terrain base elevation:** Often missing — verify that the building base sits flush with the terrain surface at the footprint centroid, not at the default `y = -0.02` ground plane.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Equirectangular error at scene scale | MEDIUM | Add `proj4js` with a site-specific TM CRS; update `gis-transform.ts`; re-test all GIS layers; 1–2 days |
| Float32 jitter | MEDIUM | Subtract scene origin from all position values; affects terrain, tiles, and context buildings; 1 day to update all geometry builders |
| Axis order inversion (EPSG:5179) | LOW | Add axis-swap assertion in `gis-transform.ts`; fix the transform; 2–4 hours |
| ShapeGeometry triangulation failure | LOW | Swap to `earcut` triangulator; replace the extrusion pipeline; 4–8 hours |
| VWorld 429 rate limit errors | LOW | Add a 4-concurrent tile queue utility; 4–8 hours |
| Production domain 401 | LOW | Register production domain in VWorld portal; add env var; 1–2 hours |
| SAOPass performance collapse | MEDIUM | Reduce SAOPass resolution; add performance mode toggle; recalibrate `saoKernelRadius`; 4–8 hours |
| GPU texture memory leak | LOW | Add LRU eviction with `texture.dispose()`; 2–4 hours |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Equirectangular approximation at scale | Phase 1: Coordinate System Foundation | Context buildings align with ortho tiles at 500m from scene center (< 1m visual error) |
| Float32 precision jitter | Phase 1: Coordinate System Foundation | No vertex jitter visible with objects at ±2000m from origin |
| EPSG:5179 axis order inversion | Phase 1: Coordinate System Foundation | Assertion fires in test if coordinate is outside Korean bounds after conversion |
| ShapeGeometry triangulation failures | Phase 2: Footprint Extrusion | L-shaped and hole-bearing cadastral polygons extrude without missing faces |
| MultiPolygon and holes silently ignored | Phase 2: Footprint Extrusion | Test with known hole-bearing PNU; rendered footprint has correct interior hole |
| VWorld production domain | Phase 2: Footprint Extrusion | VWorld API calls succeed from staging hostname |
| VWorld hardcoded API key | Phase 2: Footprint Extrusion | `process.env.VWORLD_API_KEY` used; no key string in any `.ts` source file |
| Terrain and building misalignment | Phase 3: Terrain Integration | Building base is flush with terrain at footprint centroid; no floating or sunken building |
| Tile loading blocking render loop | Phase 4: Ortho Tile Integration | 16-tile load does not freeze scene; no 429 errors from VWorld |
| Tile seam lines and UV bleeding | Phase 4: Ortho Tile Integration | Assembled tile ground plane shows no visible grid seams at any camera angle |
| Tile GPU memory leak | Phase 4: Ortho Tile Integration | 10 sequential building selections do not grow `renderer.info.memory.textures` beyond 40 |
| SAOPass performance collapse | Phase 5: Context Buildings | 100 context building scene runs at ≥ 30fps on Intel integrated graphics |
| Context InstancedMesh draw call explosion | Phase 5: Context Buildings | Scene with 150 context buildings has ≤ 10 draw calls |

---

## Sources

- Three.js forum: Non-simple/self-intersecting polygon troubles — https://discourse.threejs.org/t/non-simple-self-intersecting-polygon-troubles/8951
- Three.js issue #11957: Hole outside Shape error in ExtrudeGeometry — https://github.com/mrdoob/three.js/issues/11957
- Three.js issue #3386: Holes in contours cause triangulation failure — https://github.com/mrdoob/three.js/issues/3386
- Three.js forum: Large coordinates float32 jitter — https://discourse.threejs.org/t/large-coordinates/50621
- Three.js forum: Floating point precision — https://discourse.threejs.org/t/how-does-threejs-deal-with-precision-errors/26344
- Three.js forum: SAOPass FPS drop — https://discourse.threejs.org/t/saopass-fps-drop-other-questions/28109
- Three.js issue #19566: InstancedMesh + SSAO issues — https://github.com/mrdoob/three.js/issues/19566
- mapbox/earcut: Polygon triangulation for WebGL — https://github.com/mapbox/earcut
- EPSG:5179 KGD2002 / Unified CS definition — https://epsg.io/5179
- proj4js axis order behavior — https://github.com/proj4js/proj4js
- VWorld API sample repository — https://github.com/V-world/V-world_API_sample
- VWorld Spatial Information Platform (MDPI 2019) — https://www.mdpi.com/2079-9292/8/12/1411
- Codebase review: `src/app/api/vworld/footprint/route.ts` (equirectangular approximation, hardcoded domain and key)
- Codebase review: `src/lib/procedural/types.ts` (`BuildingRecipe` has no `groundElevation` field — gap identified)
- Codebase review: `src/components/viewer/ground-plane.tsx` (flat `y = -0.02` assumption)
- Codebase review: `src/components/viewer/building-scene.tsx` (SAOPass configured for 7 draw calls; no GIS layer awareness)

---
*Pitfalls research for: GIS compositing — Korean BIM Energy Management System (v4.0)*
*Researched: 2026-04-03*
