# Stack Research

**Domain:** GIS compositing added to existing Three.js BIM viewer — coordinate transforms, polygon triangulation, satellite tile loading, context building synthesis (Korean spatial data)
**Researched:** 2026-04-12
**Confidence:** HIGH (versions verified against npm registry; integration points verified against existing codebase)

---

## Context: What This Research Covers

The existing validated stack (Next.js 16.2, React 19.2, Three.js 0.183, R3F 9, @react-three/drei 10, Zustand 5, TanStack Query 5, shadcn/ui, Tailwind v4) is NOT re-researched. This document covers only the NEW libraries required for v4.0 GIS-Composite Realistic Drafts.

The four new capability gaps to fill:

1. **Coordinate system transforms** — Korean EPSG:5179 / WGS84 → local Three.js ENU coordinates (proj4js, mandatory beyond 300m scene radius)
2. **Polygon triangulation** — Cadastral footprint extrusion with concave polygons and interior holes (earcut, mandatory replacement for Three.js ShapeGeometry)
3. **Satellite tile loading** — VWorld WMS GetMap single-image ground texture (no new library; Three.js TextureLoader + fetch + AbortController)
4. **Context building synthesis** — LOD1 gray boxes from VWorld 2D footprint + height (earcut reused; no additional library)

---

## Recommended Stack: New Additions Only

### New Libraries to Install

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `proj4` | `^2.20.8` | WGS84 ↔ local ENU coordinate projection for GIS-to-Three.js transforms | The only JS library implementing full EPSG CRS definitions with proper ellipsoidal math. Mandatory for scenes >300m radius — the existing equirectangular approximation in `extractPolygon()` accumulates 8m error at 2km. Ships its own TypeScript definitions (`dist/index.d.ts`). MIT license. No peer dependencies. |
| `earcut` | `^3.0.2` | Polygon triangulation for cadastral footprint extrusion | Handles concave polygons and interior holes correctly. Three.js `ShapeGeometry` / `ExtrudeGeometry` use a simpler triangulator that fails on L-shaped parcels and holes (Three.js issues #11957, #3386). 3KB gzipped. ISC license. Used by Mapbox GL JS internally. `earcut.flatten()` converts GeoJSON coordinates directly to the flat-array format earcut requires. |

**Total new dependency surface: 2 packages, ~150KB combined unpacked.**

### No New Library Needed For

| Capability | Why No New Library |
|------------|--------------------|
| Satellite ground texture | VWorld WMS GetMap returns a single JPEG for a bbox. `THREE.TextureLoader` already in Three.js 0.183 handles this. Fetch through existing Next.js proxy pattern. Use `AbortController` for cancellation on building change. |
| Context building LOD1 boxes | `earcut` (already added above) triangulates context footprints. `THREE.InstancedMesh` already in the stack (`structure-generator.ts` uses it). No additional library. |
| Zoning overlay polygons | Same `earcut` pipeline as footprint. Render as semi-transparent `THREE.MeshStandardMaterial` plane. No additional library. |
| Parallel fetch pipeline | TanStack Query v5 `useQueries` already in stack. Fire all VWorld proxy requests in parallel; compose scene from whatever resolves first. |
| Tile seam handling | Canvas 2D API (browser-native). Stitch tiles into a single `OffscreenCanvas` if needed; upload as `THREE.CanvasTexture`. Zero additional dependencies. |
| Camera fly-to on load | `@react-three/drei` `CameraControls` or `OrbitControls` already in stack. Compute footprint bounding box, call `fitToSphere()` or equivalent. |

---

## Integration Points with Existing Stack

### proj4 → gis-transform.ts (new module)

Centralize ALL coordinate transforms in a single `src/lib/gis-transform.ts`. Never convert coordinates ad-hoc in components or route handlers.

```typescript
import proj4 from "proj4";

// Define a site-specific Transverse Mercator centered on the scene origin.
// Called once per building selection with the footprint centroid as origin.
export function createSceneProjection(originLng: number, originLat: number) {
  const tmDef = `+proj=tmerc +lat_0=${originLat} +lon_0=${originLng} +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs`;
  const toLocal = proj4("EPSG:4326", tmDef);
  return {
    // Returns [eastMeters, northMeters] relative to origin. Use as Three.js [x, z].
    project: (lng: number, lat: number): [number, number] => {
      const [x, y] = toLocal.forward([lng, lat]);
      return [x, y];
    },
    unproject: (x: number, z: number): [number, number] => {
      return toLocal.inverse([x, z]) as [number, number];
    },
  };
}
```

**Why site-specific TM instead of EPSG:5179:** A site-TM centered on the building centroid gives sub-centimeter accuracy within a 5km radius. EPSG:5179 requires subtracting coordinates in the range (950000, 1950000) before passing to Three.js float32 — the scene-origin subtraction becomes error-prone. Site-TM eliminates large-coordinate values entirely; output is already relative to origin.

**Replace `extractPolygon()` in `footprint/route.ts`:** The existing equirectangular approximation is correct for single-parcel use. Return raw `[lng, lat]` from the API route (not converted to meters) and move the projection step to `gis-transform.ts` on the client side. This decouples the server route from any projection choice and avoids changing the route for all callers.

### earcut → footprint extrusion pipeline

```typescript
import earcut from "earcut";
import * as THREE from "three";

export function extrudeFootprint(
  rings: number[][][],  // GeoJSON coordinates: [outerRing, ...holes]
  heightMeters: number,
  project: (lng: number, lat: number) => [number, number]
): THREE.BufferGeometry {
  // Project all rings from WGS84 to local ENU
  const projected = rings.map(ring =>
    ring.map(([lng, lat]) => project(lng, lat))
  );

  // Flatten for earcut
  const { vertices, holes, dimensions } = earcut.flatten(
    projected.map(ring => ring.map(([x, z]) => [x, 0, z])) // 3D, use xz plane
  );

  // Cap triangulation (top and bottom faces)
  const indices = earcut(vertices, holes, dimensions);

  // ... build BufferGeometry with position, index, side quads
  // See ARCHITECTURE.md for full extrusion implementation pattern
}
```

**earcut 3.x vs 2.x:** The public API (`earcut(vertices, holes, dimensions)` and `earcut.flatten()`) is unchanged between 2.x and 3.x. Version 3.0.0 added TypeScript types bundled in the package. No migration required.

### THREE.TextureLoader → satellite ground plane

No new library. Pattern:

```typescript
// In a useEffect with AbortController
const controller = new AbortController();
const url = `/api/vworld/satellite?minLng=${...}&minLat=${...}&maxLng=${...}&maxLat=${...}`;
fetch(url, { signal: controller.signal })
  .then(r => r.blob())
  .then(blob => {
    const objectUrl = URL.createObjectURL(blob);
    const texture = new THREE.TextureLoader().load(objectUrl, () => {
      URL.revokeObjectURL(objectUrl);
    });
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter; // Prevents mipmap seams at tile edges
    setGroundTexture(texture);
  });
return () => controller.abort();
```

The satellite proxy route (`src/app/api/vworld/satellite/route.ts`) follows the same Next.js Route Handler pattern as the existing `footprint/route.ts`.

---

## Installation

```bash
# Only two new runtime dependencies for the entire v4.0 GIS milestone
pnpm add proj4 earcut
```

No new devDependencies needed. `proj4` bundles `dist/index.d.ts`. `earcut` 3.x bundles its own types. No separate `@types/*` packages required.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `proj4` site-specific TM | EPSG:5179 via proj4 | EPSG:5179 produces Easting/Northing in the range (950000, 1950000) — must subtract scene origin manually to avoid Three.js float32 precision loss. Site-TM outputs coordinates already relative to origin, eliminating this step. |
| `proj4` site-specific TM | Equirectangular approximation (existing) | Existing code is correct for single parcel (<300m radius). Breaks at scene scale — 8m error at 2km is visible misalignment between context buildings and satellite imagery. Acceptable only if scene radius is hard-limited to 300m. |
| `earcut` direct triangulation | `THREE.ShapeGeometry` + `THREE.ExtrudeGeometry` | Three.js's built-in triangulator fails on concave polygons with holes (issues #11957, #3386). Korean cadastral parcels with road easements (interior rings) and L-shaped lots (concave outer ring) are common — this is not an edge case. |
| `earcut` | `poly2tri` | `poly2tri` is more accurate for highly degenerate inputs but 5× larger and requires Steiner points for some pathological inputs. Korean cadastral data is survey-grade — earcut handles it reliably. `poly2tri` is overkill. |
| Single WMS GetMap image | WMTS tile streaming | WMTS tile streaming requires a tile management system (coordinate-to-tile math, seam handling, LRU cache, concurrent request queue). A 1024×1024 WMS GetMap for a ~500m bbox is indistinguishable at the zoom levels used and requires zero tile management. Upgrade to tile streaming only if users need to pan/zoom the satellite layer beyond the composite view. |
| Built-in `THREE.InstancedMesh` | Per-mesh context buildings | One Mesh per context building produces 50–200 draw calls for a 300m radius scene. `InstancedMesh` collapses all LOD1 box context buildings to 1–2 draw calls. Already used in `structure-generator.ts`. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `CesiumJS` | Second WebGL context competing with existing Three.js canvas; 500KB+ bundle; separate camera/coordinate system requires complex sync. The existing R3F canvas handles everything needed. | Existing Three.js + R3F canvas |
| `mapbox-gl` | Same second-WebGL-context problem; commercial pricing for production use; Mapbox coordinate system incompatible with Korean EPSG:5179 out-of-box. | Existing Three.js + VWorld proxy routes |
| `leaflet` / `openlayers` | 2D map libraries that require a DOM element separate from the Three.js canvas. Adding a 2D map beneath a 3D canvas solves a different problem — the goal is compositing GIS data INTO the existing 3D scene, not adding a 2D map alongside it. | Fetch GIS data from VWorld, render in R3F canvas |
| `turf` | Feature-rich GIS operations library (unions, intersections, buffers). Zero of these operations are needed for v4.0 — only coordinate projection (proj4) and triangulation (earcut) are required. `turf` adds 100KB+ for unused capabilities. | `proj4` + `earcut` directly |
| `@types/proj4` (npm) | `proj4@2.20.8` ships `dist/index.d.ts` with complete TypeScript definitions. The separate `@types/proj4` package (2.19.0) is maintained independently and may lag the bundled types. Use bundled types. | Bundled `proj4/dist/index.d.ts` (automatic) |
| `three-geo` | Depends on Mapbox DEM tiles (`mapbox://mapbox.terrain-rgb`), requiring a Mapbox API key. VWorld provides Korean terrain data through its own DEM endpoints. | VWorld DEM endpoint (if terrain needed in v4.x) |
| `geojson-vt` | Vector tile slicing library for serving GeoJSON as tiles. The VWorld API already returns pre-tiled data; client-side tiling is not needed. | Direct VWorld GeoJSON API responses |
| Separate worker thread for proj4 | Proj4 transform of 200 polygon vertices takes <1ms synchronously. No worker needed unless processing >10,000 vertices in a single call, which is not a v4.0 scenario. | Synchronous `proj4` call in `gis-transform.ts` |

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| `proj4` | `^2.20.8` | Next.js 16 (ESM + CJS), React 19, Three.js 0.183 | No peer dependencies. Ships `dist/index.d.ts`. Use `import proj4 from "proj4"` — the default export is the transform factory. |
| `earcut` | `^3.0.2` | Three.js 0.183, React 19 | No peer dependencies. Ships bundled TypeScript types in 3.x. `earcut.flatten()` and `earcut(vertices, holes, dimensions)` API unchanged from 2.x. |

---

## New Proxy Routes Needed (No New Libraries — Same Pattern as Existing)

These are Next.js Route Handlers following the exact `footprint/route.ts` pattern. No new libraries.

| Route | VWorld Endpoint | Purpose |
|-------|-----------------|---------|
| `src/app/api/vworld/satellite/route.ts` | `https://api.vworld.kr/req/wms` (GetMap, `Satellite` layer) | Returns JPEG blob for bbox; used as `THREE.Texture` on ground plane |
| `src/app/api/vworld/context-buildings/route.ts` | `LP_PA_CBND_BUBUN` bbox query + `getBuildingUse` NED for heights | Returns array of `{polygon: number[][][], heightM: number}` for LOD1 extrusion |
| `src/app/api/vworld/zoning/route.ts` | WFS `LT_C_UQ111`–`LT_C_UQ114` | Returns GeoJSON polygons for zoning overlay |

All three routes follow the `VWORLD_API_KEY` + `VWORLD_DOMAIN` env var pattern established in PITFALLS.md (Pitfall 8). The hardcoded `domain: "localhost"` in the existing `footprint/route.ts` must be parameterized at the same time these new routes are added.

---

## Sources

- `earcut` npm registry: version 3.0.2, ISC license — HIGH confidence (verified `npm show earcut`)
- `proj4` npm registry: version 2.20.8, MIT license, bundles `dist/index.d.ts` — HIGH confidence (verified `npm show proj4 --json`)
- `@types/proj4` npm registry: version 2.19.0 — confirmed separate package exists but NOT needed since proj4 bundles its own types (HIGH confidence)
- Three.js issue #11957: Hole outside Shape — https://github.com/mrdoob/three.js/issues/11957 (HIGH confidence — cited in PITFALLS.md)
- Three.js issue #3386: Holes in contours — https://github.com/mrdoob/three.js/issues/3386 (HIGH confidence — cited in PITFALLS.md)
- mapbox/earcut README: API signature, `earcut.flatten()` usage — HIGH confidence (WebFetch verified)
- Existing codebase: `src/app/api/vworld/footprint/route.ts` — equirectangular approximation confirmed at lines 244–256 (HIGH confidence — Read tool)
- Existing `package.json`: Three.js 0.183, R3F 9, TanStack Query 5, Zustand 5 confirmed (HIGH confidence — Read tool)

---
*Stack research for: Korean BIM EMS v4.0 — GIS-Composite Realistic Drafts (new capabilities only)*
*Researched: 2026-04-12*
