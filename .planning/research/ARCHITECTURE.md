# Architecture Research

**Domain:** GIS compositing added to an existing Three.js/R3F BIM viewer — Korean spatial data (v4.0)
**Researched:** 2026-04-12
**Confidence:** HIGH (grounded in direct codebase audit of existing files)

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          React UI Layer                                  │
│  BuildingScene.tsx — R3F Canvas host + GIS composite orchestrator        │
├───────────────────────────┬─────────────────────────────────────────────┤
│    GIS Data Hooks (NEW)    │         Existing BIM Hooks                  │
│  useGisComposite()         │  useBuildingFootprint()  [EXISTS]           │
│  (useQueries parallel)     │  useRecipeStore          [EXISTS]           │
│                            │  useMaterialStore        [EXISTS]           │
│                            │  useWorkspaceStore       [EXISTS]           │
├───────────────────────────┴─────────────────────────────────────────────┤
│                     R3F Scene Graph (single Canvas)                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐   │
│  │  SatelliteGround  │  │ ContextBuildings  │  │  ProceduralBldgModel │   │
│  │  PlaneGeometry    │  │  InstancedMesh    │  │  (EXISTS, unchanged) │   │
│  │  + WMS texture    │  │  LOD1 gray boxes  │  │                      │   │
│  │  (NEW)            │  │  (NEW)            │  │                      │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘   │
│  ┌──────────────────┐  ┌──────────────────┐                              │
│  │  ZoningOverlay    │  │  GroundPlane      │                             │
│  │  ShapeGeometry    │  │  (EXISTS,         │                             │
│  │  semi-transparent │  │  BIM mode only)   │                             │
│  │  (NEW)            │  │                  │                             │
│  └──────────────────┘  └──────────────────┘                              │
├─────────────────────────────────────────────────────────────────────────┤
│                     Coordinate Foundation (NEW)                           │
│              src/lib/gis/gis-transform.ts                                │
│   proj4js site-specific TM — all GIS layers share one local origin       │
├────────────────────┬────────────────────────────────────────────────────┤
│  Next.js API Routes│                                                     │
│  /api/vworld/      │  footprint/route.ts      [EXISTS — modified]        │
│                    │  satellite/route.ts       [NEW]                     │
│                    │  context-buildings/route.ts [NEW]                   │
│                    │  zoning/route.ts           [NEW]                    │
└────────────────────┴────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component / Module | Responsibility | Status |
|--------------------|---------------|--------|
| `src/lib/gis/gis-transform.ts` | All WGS84 → local ENU coordinate math. Stores scene origin. Exposes `setSceneOrigin()`, `toLocal(lng, lat)`, `polygonToLocal()`. Single source of truth for coordinate projection — centralizes the bug surface for axis-order and float32 issues. | NEW |
| `src/lib/gis/earcut-extrude.ts` | GeoJSON Polygon/MultiPolygon → `THREE.BufferGeometry` via earcut. Handles outer rings + interior holes. Replaces Three.js `ShapeGeometry`/`ExtrudeGeometry` for any cadastral data. | NEW |
| `src/app/api/vworld/satellite/route.ts` | Server-side WMS GetMap proxy. Fetches a single JPEG from VWorld covering the scene bbox. Returns image bytes. Same Next.js Route Handler pattern as existing `footprint/route.ts`. | NEW |
| `src/app/api/vworld/context-buildings/route.ts` | Server-side proxy for cadastral bbox query (`LP_PA_CBND_BUBUN` with `geomFilter`). Returns `[{pnu, polygon, buldHg, flrCnt}]`. Derives height from `buldHg` with fallback `flrCnt × 3m`. | NEW |
| `src/app/api/vworld/zoning/route.ts` | Server-side WFS proxy for VWorld zoning layers (`LT_C_UQ111`–`LT_C_UQ114`). Returns GeoJSON FeatureCollection of zoning polygons for a bbox. | NEW |
| `src/components/viewer/satellite-ground.tsx` | R3F component. `PlaneGeometry` sized to WMS bbox, textured with the satellite JPEG via `THREE.CanvasTexture`. Sets `material.aoMapIntensity = 0` and assigns ground to layer 1 to prevent SAOPass self-occlusion on horizontal surfaces. Replaces `GroundPlane` when `stage === 'gis-composite'`. | NEW |
| `src/components/viewer/context-buildings.tsx` | R3F component. Single `InstancedMesh` of gray LOD1 box extrusions. All context buildings share one geometry and one draw call. `castShadow = false`, `receiveShadow = false`. | NEW |
| `src/components/viewer/zoning-overlay.tsx` | R3F component. Semi-transparent `ShapeGeometry` mesh per zoning classification. Toggle visibility via layer panel. | NEW |
| `src/hooks/use-gis-composite.ts` | `useQueries` orchestrator. Fires satellite, context-buildings, and zoning requests in parallel on building selection. Returns `{satellite, contextBuildings, zoning, isLoading}`. Each layer resolves and renders independently — a failed fetch does not block other layers. | NEW |
| `src/lib/procedural/procedural-building.ts` | EXISTS. Core generation logic unchanged. When `recipe.footprintPolygon` is present, cap faces (top/bottom) use `earcut-extrude.ts` instead of `THREE.ShapeGeometry`. Facade/slab/column InstancedMesh generators use `footprintWidth`/`footprintDepth` and are unaffected. | MODIFIED (cap extrusion path only) |
| `src/components/viewer/building-scene.tsx` | EXISTS. Add GIS composite rendering branch. When `workflowStore.stage === 'gis-composite'`, render `SatelliteGround + ContextBuildings + ZoningOverlay`. Scale back SAOPass `saoKernelRadius` (50 → 25) when context buildings are active; halve SAOPass resolution when count > 50. | MODIFIED |
| `src/app/api/vworld/footprint/route.ts` | EXISTS. Two surgical changes: (1) replace hardcoded `domain: "localhost"` with `process.env.VWORLD_DOMAIN ?? "localhost"`; (2) extend `extractPolygon()` to handle `Polygon` interior holes and `MultiPolygon` geometry types. Existing callers unaffected. | MODIFIED |
| `src/store/workflow-store.ts` | EXISTS. Add `'gis-composite'` to the `WorkflowStage` type union as a pre-stage before `'select'`. Wire transition: `'gis-composite'` → `'select'` on "BIM Mode" click. GIS scene components are unmounted on this transition. | MODIFIED |

---

## Recommended Project Structure

New files only — existing folders unchanged.

```
src/
├── app/api/vworld/
│   ├── footprint/route.ts          # EXISTS — parameterize domain env var, fix polygon holes
│   ├── satellite/route.ts          # NEW — VWorld WMS GetMap proxy
│   ├── context-buildings/route.ts  # NEW — cadastral bbox + height proxy
│   └── zoning/route.ts             # NEW — WFS LT_C_UQ111-114 proxy
│
├── lib/gis/                        # NEW folder — coordinate system + geometry utilities
│   ├── gis-transform.ts            # proj4js ENU projection, local origin subtraction
│   └── earcut-extrude.ts           # GeoJSON Polygon → THREE.BufferGeometry via earcut
│
├── lib/procedural/                 # EXISTS — minimal changes
│   ├── types.ts                    # footprintPolygon already present; add groundElevation?: number
│   ├── procedural-building.ts      # cap extrusion → earcut-extrude when polygon present
│   └── ...                         # facade/structure generators: no changes
│
├── components/viewer/
│   ├── satellite-ground.tsx        # NEW — PlaneGeometry + WMS texture
│   ├── context-buildings.tsx       # NEW — InstancedMesh LOD1 context
│   ├── zoning-overlay.tsx          # NEW — semi-transparent zoning polygons
│   ├── building-scene.tsx          # MODIFIED — GIS stage branch + SAOPass scaling
│   └── ground-plane.tsx            # EXISTS — unchanged, used in BIM mode only
│
└── hooks/
    └── use-gis-composite.ts        # NEW — useQueries parallel fetch orchestrator
```

### Structure Rationale

- **`src/lib/gis/`** is isolated from `src/lib/procedural/`. Coordinate math is a cross-cutting concern shared by all GIS layers; keeping it out of the building generation pipeline prevents `procedural-building.ts` from depending on projection code.
- **New API routes mirror `footprint/route.ts` exactly** — same Next.js Route Handler pattern, same `VWORLD_API_KEY` env var, same CORS handling. No new proxy patterns introduced.
- **New R3F components are sibling scene children**, not modifications to `ProceduralBuildingModel` or `BuildingLayers`. GIS layers compose with the existing scene tree; they do not wrap or replace it.

---

## Architectural Patterns

### Pattern 1: Local-Origin ENU Coordinate System (Phase 1 — Must Come First)

**What:** One scene origin (the queried building centroid in WGS84) is set when a building is selected. All GIS coordinates from all layers are converted to local East-North-Up meters relative to this origin using a site-specific Transverse Mercator projection via `proj4js`. The result is float32-safe values in the range ±5000m. The origin is stored in `gis-transform.ts` as module state for the current session.

**Why this is Phase 1:** Every subsequent GIS layer depends on correct coordinate conversion. A bug here misaligns all layers. Retrofitting after Phases 2–5 requires touching every geometry builder. The equirectangular approximation in the existing `extractPolygon()` accumulates ~8m error at 2km — acceptable for single parcel use, but not for multi-layer compositing. `gis-transform.ts` must be the single source of truth before any GIS component is built.

**Example:**
```typescript
// src/lib/gis/gis-transform.ts
import proj4 from "proj4";

let _proj: proj4.Converter | null = null;

export function setSceneOrigin(lng: number, lat: number): void {
  // Site-specific TM centered on building — eliminates equirectangular error
  const def = `+proj=tmerc +lat_0=${lat} +lon_0=${lng} +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs`;
  _proj = proj4("EPSG:4326", def);
}

export function toLocal(lng: number, lat: number): [number, number] {
  if (!_proj) throw new Error("setSceneOrigin must be called before toLocal");
  const [e, n] = _proj.forward([lng, lat]);
  // Debug guard: values > 10000m from origin indicate likely axis-order bug
  if (process.env.NODE_ENV !== "production") {
    if (Math.abs(e) > 10000 || Math.abs(n) > 10000)
      console.warn(`toLocal: suspicious magnitude [${e}, ${n}] — check axis order`);
  }
  return [e, n]; // Three.js convention: [x, z]
}

export function polygonToLocal(ring: number[][]): [number, number][] {
  return ring.map(([lng, lat]) => toLocal(lng, lat));
}
```

### Pattern 2: Earcut Extrusion for Cadastral Polygons

**What:** Any cadastral polygon (outer ring + optional holes) is triangulated with `earcut` (~3KB) and assembled into a `THREE.BufferGeometry` manually. `THREE.ShapeGeometry` and `THREE.ExtrudeGeometry` are not used for cadastral data.

**When to use:** Primary building footprint cap faces; context building footprints if earcut-per-building is chosen over the simpler centroid-box approach. Zoning shapes use `THREE.ShapeGeometry` (simpler administrative boundaries, rarely have holes).

**Why mandatory:** Korean cadastral records commonly have concave vertices (L-shaped lots), interior holes (road easements recorded as inner rings), and near-collinear digitization artifacts. Three.js's built-in triangulator produces incorrect geometry for these cases — it logs `"Probably Hole outside Shape!"` and renders missing triangles silently.

**Example:**
```typescript
// src/lib/gis/earcut-extrude.ts
import earcut from "earcut";
import * as THREE from "three";

export function extrudePolygon(
  outerRing: [number, number][],   // local ENU [x, z] coords
  holes: [number, number][][],     // inner rings in same space
  height: number
): THREE.BufferGeometry {
  // Build flat arrays for earcut: vertices as [x, z] pairs
  const allRings = [outerRing, ...holes];
  const flatVerts: number[] = [];
  const holeIndices: number[] = [];
  let offset = 0;
  for (let i = 0; i < allRings.length; i++) {
    if (i > 0) holeIndices.push(offset);
    for (const [x, z] of allRings[i]) { flatVerts.push(x, z); offset++; }
  }
  const triangles = earcut(flatVerts, holeIndices, 2);
  // Build top cap, bottom cap, and side quads from triangles + ring edges
  // ... returns BufferGeometry with position + normal + index attributes
}
```

### Pattern 3: InstancedMesh for Context Buildings (Single Draw Call)

**What:** All LOD1 context buildings share one `InstancedMesh` with a unit `BoxGeometry`. Per-instance `Matrix4` encodes position (footprint centroid) and scale (width × height × depth). Material is flat gray `MeshStandardMaterial`. No shadows on any instance.

**Why:** 100–200 context buildings as individual `Mesh` objects = 100–200 draw calls. That alone would roughly triple scene complexity and collapse SAOPass frame rate on Intel integrated graphics (the GX team's most common hardware). InstancedMesh keeps it at one draw call regardless of count.

**Key implementation detail:** `mesh.instanceMatrix.needsUpdate = true` must be called after all `setMatrixAt()` calls — this is the same invariant as the existing `structure-generator.ts`.

**Example:**
```typescript
// src/components/viewer/context-buildings.tsx
const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#c8c8c8", roughness: 0.9 }), []);
const meshRef = useRef<THREE.InstancedMesh>(null);

useEffect(() => {
  if (!meshRef.current) return;
  contextBuildings.forEach((b, i) => {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(b.cx, b.height / 2, b.cz),
      new THREE.Quaternion(),
      new THREE.Vector3(b.width, b.height, b.depth)
    );
    meshRef.current!.setMatrixAt(i, m);
  });
  meshRef.current.instanceMatrix.needsUpdate = true;
}, [contextBuildings]);

return <instancedMesh ref={meshRef} args={[geo, mat, contextBuildings.length]}
  castShadow={false} receiveShadow={false} />;
```

### Pattern 4: Parallel Fetch with useQueries

**What:** `useGisComposite` fires all VWorld data requests simultaneously using TanStack Query's `useQueries`. Each layer is an independent query with its own key, loading state, and error. Layers render as they resolve. A failed satellite fetch does not block context buildings.

**Why:** Sequential fetching would take 3× longer (each VWorld call is 300–800ms). A single `Promise.all` would fail entirely if any layer fails. `useQueries` gives independent retry, caching (30min staleTime), and progressive rendering per layer — matching the existing `useBuildingFootprint` pattern.

```typescript
// src/hooks/use-gis-composite.ts
export function useGisComposite(origin: { lng: number; lat: number } | null) {
  const results = useQueries({
    queries: origin ? [
      { queryKey: ["gis-satellite", origin], queryFn: () => fetchSatellite(origin), staleTime: 30 * 60 * 1000 },
      { queryKey: ["gis-context", origin],   queryFn: () => fetchContextBuildings(origin), staleTime: 30 * 60 * 1000 },
      { queryKey: ["gis-zoning", origin],    queryFn: () => fetchZoning(origin), staleTime: 30 * 60 * 1000 },
    ] : [],
  });
  return {
    satellite:        results[0],
    contextBuildings: results[1],
    zoning:           results[2],
    isLoading:        results.some(r => r.isLoading),
  };
}
```

---

## Data Flow

### GIS Composite Activation Flow

```
User selects building (address resolved in BldRgstHubService search)
    ↓
useBuildingFootprint(address) resolves [EXISTS — already cached]
    ↓
footprint centroid extracted → gis-transform.setSceneOrigin(lng, lat)  [NEW]
    ↓
useGisComposite(origin) fires  [NEW]
    ↓ (three queries in parallel, independent)
    ├─ fetchSatellite   → /api/vworld/satellite   → VWorld WMS GetMap
    ├─ fetchContextBldgs → /api/vworld/context-buildings → VWorld Data API (bbox)
    └─ fetchZoning      → /api/vworld/zoning       → VWorld WFS
    ↓ (each resolves independently; scene populated progressively)
    ├─ SatelliteGround mounts:  PlaneGeometry + CanvasTexture (JPEG bytes)
    ├─ ContextBuildings mounts: InstancedMesh (polygon centroids + heights → toLocal())
    └─ ZoningOverlay mounts:    ShapeGeometry (zoning polygons → polygonToLocal())
    ↓
workflowStore.stage === 'gis-composite': all three GIS layers visible
    ↓
User clicks "BIM Mode" button
    ↓
workflowStore.stage → 'select': GIS components unmount, ProceduralBuildingModel activates
```

### Coordinate Transform Chain

```
VWorld API response (always requested as crs=EPSG:4326 → GeoJSON [lng, lat])
    ↓
gis-transform.toLocal(lng, lat) [proj4js site-specific TM]
    ↓
[x, z] in local ENU meters — float32-safe (magnitude < ±5000m for any urban scene)
    ↓
earcut-extrude.ts or direct Vector3 assignment
    ↓
THREE.BufferGeometry / InstancedMesh transform
    ↓
Three.js scene graph
```

### Building Footprint → Extrusion (Existing Pipeline Change)

Current state in `building-scene.tsx`:
1. `useBuildingFootprint(address)` fetches polygon (equirectangular [x,z] from centroid) — continues working
2. `geometry.footprintPolygon` is set on `FloorGeometry`; `footprintWidth`/`footprintDepth` are derived from it
3. `toRecipe(geometry)` propagates `footprintPolygon` into `BuildingRecipe` — the field already exists in `types.ts`
4. `ProceduralBuilding.generate()` currently uses `footprintWidth`/`footprintDepth` for all geometry

**Required change:** In `procedural-building.ts`, when `recipe.footprintPolygon` is present, use `earcut-extrude.ts` for the top/bottom cap faces. The facade-generator and structure-generator continue to use `footprintWidth`/`footprintDepth` for InstancedMesh — those are unchanged.

**Scope:** This change touches only the cap generation path inside `ProceduralBuilding.generate()`. The existing rectangular fallback stays for when `footprintPolygon` is absent (campus mode, or when VWorld lookup failed).

---

## New vs Modified Files: Complete Reference

### New Files

| File | Purpose | Phase |
|------|---------|-------|
| `src/lib/gis/gis-transform.ts` | proj4js ENU projection, scene origin management, `toLocal()`, `polygonToLocal()`, debug assertions | 1 — must exist before all others |
| `src/lib/gis/earcut-extrude.ts` | GeoJSON Polygon/MultiPolygon → `THREE.BufferGeometry` via earcut, handles outer rings + holes | 2 |
| `src/app/api/vworld/satellite/route.ts` | WMS GetMap proxy — returns satellite JPEG bytes for a bbox | 3 |
| `src/app/api/vworld/context-buildings/route.ts` | Cadastral bbox query with `size=100` + height attribute extraction | 4 |
| `src/app/api/vworld/zoning/route.ts` | WFS `LT_C_UQ111`–`LT_C_UQ114` proxy — returns GeoJSON zoning polygons | 5 |
| `src/hooks/use-gis-composite.ts` | `useQueries` parallel fetch orchestrator; add queries incrementally as routes are built | 3 (grow across phases) |
| `src/components/viewer/satellite-ground.tsx` | R3F PlaneGeometry + WMS texture; SAOPass layer exclusion | 3 |
| `src/components/viewer/context-buildings.tsx` | R3F InstancedMesh LOD1 gray boxes | 4 |
| `src/components/viewer/zoning-overlay.tsx` | R3F semi-transparent zoning polygon meshes | 5 |

### Modified Files

| File | What Changes | Risk |
|------|-------------|------|
| `src/app/api/vworld/footprint/route.ts` | (1) `domain` from `VWORLD_DOMAIN` env var (currently hardcoded `"localhost"`); (2) `extractPolygon()` extended to handle `Polygon` interior holes (`coordinates[1..]`) and `MultiPolygon` first-part extraction | LOW — additive; existing callers unaffected |
| `src/lib/procedural/types.ts` | Add `groundElevation?: number` to `BuildingRecipe` (for future terrain phase). No breaking change — optional field. | LOW |
| `src/lib/procedural/procedural-building.ts` | When `recipe.footprintPolygon` is present, use `earcut-extrude.ts` for top/bottom cap faces. Facade/slab/column generators: no change. Rectangular fallback stays for missing-polygon case. | MEDIUM — touches cap generation; polygon path must be tested against concave parcels |
| `src/components/viewer/building-scene.tsx` | (1) Call `setSceneOrigin()` when footprint centroid resolves; (2) mount GIS layer components when `stage === 'gis-composite'`; (3) reduce `saoKernelRadius` 50 → 25 when GIS layers active; (4) halve SAOPass resolution when context building count > 50 | MEDIUM — touches SAOPass config and scene composition |
| `src/store/workflow-store.ts` | Add `'gis-composite'` to `WorkflowStage` union. Prepend to `STAGE_ORDER` before `'select'`. Wire transition back to `'select'` on "BIM Mode" action. | LOW — additive to existing FSM |

### Untouched Files

These files require no changes for v4.0 GIS compositing:

- `src/lib/procedural/facade-generator.ts` — InstancedMesh facade uses `footprintWidth`/`footprintDepth`, not the polygon
- `src/lib/procedural/structure-generator.ts` — Same; slab/column InstancedMesh unchanged
- `src/lib/procedural/recipe.ts` — Recipe factory; no GIS concerns
- `src/lib/pbr-materials.ts` — PBR material configs; context buildings use flat gray, not PBR
- `src/components/viewer/ground-plane.tsx` — Remains active in BIM mode (`stage !== 'gis-composite'`); not shown in GIS composite mode
- All Zustand stores except `workflow-store.ts`
- All existing `src/app/api/bldrgst/` routes — building ledger data source unchanged

---

## Build Order

The coordinate system is a hard dependency of every other GIS feature. Build order must respect this:

### Phase 1: Coordinate System Foundation

**Produces:** `src/lib/gis/gis-transform.ts`

Build first, before any API route or R3F component. Includes `setSceneOrigin()`, `toLocal()`, `polygonToLocal()`, and debug-mode magnitude assertions. Pure utility module — no React, no Three.js, testable with Vitest using known Seoul coordinates.

**Verification gate:** Unit test confirms that a WGS84 point 500m east of the origin converts to approximately `[500, 0]` with less than 0.5m error. A coordinate with raw EPSG:5179 magnitude (~950000) triggers the debug warning (confirming the guard works).

**Also in Phase 1:** Extend `extractPolygon()` in `footprint/route.ts` to handle `Polygon` holes and `MultiPolygon`. Parameterize `domain` from `VWORLD_DOMAIN` env var. These are low-risk fixes that unblock all downstream phases.

### Phase 2: Footprint Extrusion with Earcut

**Produces:** `src/lib/gis/earcut-extrude.ts`, modified `procedural-building.ts`

Depends on Phase 1 for coordinate input. Replaces the building cap extrusion path with earcut. `BuildingRecipe.footprintPolygon` already exists as an optional field — this phase wires it to real geometry.

**Implementation note:** For Phase 2, the footprint polygon from `useBuildingFootprint()` arrives in equirectangular [x,z] meters (centroid-relative). This is sub-centimeter accurate for a single parcel (diameter < 200m) and does not require `gis-transform.ts`. Upgrade to `gis-transform.ts` projection in Phase 3 when satellite alignment requires the shared origin.

**Verification gate:** An L-shaped cadastral parcel (concave polygon) extrudes without missing faces. A parcel with an interior ring (road easement) shows the hole in the extruded mesh. Test PNU: use a parcel in Jongno-gu or Jung-gu (dense urban; common road easements).

### Phase 3: Satellite Ground Plane

**Produces:** `src/app/api/vworld/satellite/route.ts`, `src/components/viewer/satellite-ground.tsx`, `src/hooks/use-gis-composite.ts` (satellite query only)

Depends on Phase 1 (`setSceneOrigin` establishes the bbox for the WMS request). The satellite proxy fetches one WMS `GetMap` JPEG for a 600m × 600m area around the building centroid. `SatelliteGround` renders a `PlaneGeometry` scaled to the bbox with the image as a `THREE.CanvasTexture`.

**SAOPass detail:** Set `material.aoMapIntensity = 0` on the satellite ground material. The horizontal surface has nearly-zero normals relative to the SAOPass kernel — it will self-occlude (render dark) unless excluded. Assign the ground to `layers.set(1)` and configure SAOPass to exclude layer 1 from its depth pass.

**Verification gate:** Satellite image appears as the ground texture. No dark vignette on the satellite surface from SAOPass. Satellite bbox aligns visually with the building footprint polygon.

### Phase 4: Context Buildings (LOD1)

**Produces:** `src/app/api/vworld/context-buildings/route.ts`, `src/components/viewer/context-buildings.tsx`, updated `use-gis-composite.ts`

Hardest phase. The context-buildings proxy queries `LP_PA_CBND_BUBUN` with a 200m bbox, extracts per-feature centroid + `buldHg` (with `flrCnt × 3m` fallback), and returns a list. The R3F component assembles a single `InstancedMesh` from this list using `gis-transform.toLocal()` for each centroid.

**Simplification option:** Instead of earcut per context-building footprint, use each building's bbox centroid and `(maxX-minX) × (maxZ-minZ)` dimensions to scale the unit box. This is faster to build and visually acceptable for LOD1 context. Reserve earcut for the primary building (Phase 2) only.

**SAOPass action required here:** In `building-scene.tsx`, track context building count. When count > 50: set `saoKernelRadius = 25`. When count > 100: call `saoPass.setSize(size.width / 2, size.height / 2)`. Add a "Performance Mode" toggle to the layer panel that disables SAOPass entirely when GIS composite is active.

**Verification gate:** 100 context buildings render at ≥ 30fps on Intel integrated graphics. `renderer.info.render.calls` ≤ 10 with 150 context buildings present. Context buildings align with satellite imagery within 2m visual error at 300m from scene center.

### Phase 5: Zoning Overlay + Workflow Stage Transition

**Produces:** `src/app/api/vworld/zoning/route.ts`, `src/components/viewer/zoning-overlay.tsx`, updated `use-gis-composite.ts`, modified `workflow-store.ts`

Lowest-risk phase. Zoning overlay is independent of all other GIS layers. Add the `'gis-composite'` stage to `workflow-store.ts` here — wire the stage so that: entering `'gis-composite'` activates GIS layers, transitioning to `'select'` unmounts them and activates `ProceduralBuildingModel`.

**Verification gate:** Zoning polygons appear as colored semi-transparent overlays aligned with satellite ground. Toggle button in layer panel hides/shows them without scene freeze. Stage transition from `'gis-composite'` to `'select'` removes all GIS geometry cleanly.

---

## Anti-Patterns

### Anti-Pattern 1: Routing Context Buildings Through ProceduralBuilding

**What people do:** Use `ProceduralBuilding` class (or its `BuildingRecipe` pipeline) to generate context buildings, because that's the existing pattern for the target building.

**Why it's wrong:** `ProceduralBuilding` generates InstancedMesh facades with era-based PBR materials, curtain wall configs, mixed-use sections, structural columns, and roof geometry — 7 draw calls per building. Applied to 100–200 context buildings, that is 700–1400 draw calls plus recipe construction overhead per building. Frame rate collapses and the visual result is incorrect (context buildings should be visually subordinate gray boxes).

**Do this instead:** Context buildings are a single `InstancedMesh` of a unit box, scaled per building. One draw call total. `ProceduralBuilding` is exclusively for the target building.

### Anti-Pattern 2: Sequential GIS Data Fetching

**What people do:** Await footprint → then fetch satellite → then fetch context buildings → then fetch zoning. Natural when incrementally adding features.

**Why it's wrong:** Each VWorld call takes 300–800ms. Sequential fetching: 1.2–3.2s of serial wait before any GIS layer renders. Users see a blank screen for longer than the composite takes to fully load.

**Do this instead:** `useQueries` fires all requests simultaneously. Set scene origin immediately when footprint centroid resolves. Render each layer as its query resolves. The scene populates progressively.

### Anti-Pattern 3: Passing Raw Korean Projected Coordinates to Three.js

**What people do:** Some VWorld WFS responses use EPSG:5179 (Northing/Easting magnitude ~10^6). Developers pass these directly to `mesh.position.set(950000, 0, 1950000)`.

**Why it's wrong:** Three.js GPU buffers use float32. At 10^6 magnitude, float32 precision degrades to ±0.1m. Vertex jitter is visible on building edges, SAOPass halos flicker on corners, and shadow map aliasing appears.

**Do this instead:** Always subtract scene origin via `gis-transform.toLocal()` before any Three.js position assignment. Enforce with the debug-mode magnitude assertion in `gis-transform.ts`.

### Anti-Pattern 4: Embedding a Second WebGL Context (Mapbox / CesiumJS)

**What people do:** Reach for Mapbox GL JS or CesiumJS to handle GIS natively, since they are the standard tools.

**Why it's wrong:** Two WebGL contexts on one page compete for GPU memory. Context loss occurs on lower-end hardware. Camera synchronization between Mapbox mercator and Three.js ENU requires coordinate system math. Each library adds 300–500KB bundle size.

**Do this instead:** Fetch VWorld data through Next.js proxy routes. Render in the existing Three.js/R3F canvas. No second rendering engine.

### Anti-Pattern 5: Using THREE.ShapeGeometry for Cadastral Data

**What people do:** Convert the polygon to a `THREE.Shape` and pass to `THREE.ShapeGeometry` or `THREE.ExtrudeGeometry` — the documented Three.js approach for polygon extrusion.

**Why it's wrong:** Three.js's built-in triangulator handles only simple convex-ish polygons reliably. Korean cadastral records contain concave vertices (L-shaped lots), interior holes (road easements), and near-collinear digitization artifacts. The result is missing faces, inverted triangles, or the `"Probably Hole outside Shape!"` warning with silent rendering errors.

**Do this instead:** Use `earcut` for all cadastral triangulation. It handles concave polygons and holes correctly for real-world geographic data.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| VWorld Data API (`/req/data`) | Next.js Route Handler proxy. Client never calls VWorld directly. `VWORLD_API_KEY` env var. `VWORLD_DOMAIN` env var. | Always request `crs=EPSG:4326`. Never return raw EPSG:5179 coordinates to the client. |
| VWorld WMS (`/req/wms`) | Next.js Route Handler proxy. Single `GetMap` request returning JPEG bytes. | One image per building selection. Not tile streaming. |
| VWorld WFS (`/req/wfs`) | Next.js Route Handler proxy. Returns GeoJSON FeatureCollection. | `outputFormat=application/json`. Zoning layers `LT_C_UQ111`–`LT_C_UQ114`. |
| data.go.kr BldRgstHubService | EXISTS — unchanged. Building ledger remains the recipe source. | `floorAboveCnt` provides context-building height fallback when `buldHg` is absent. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `gis-transform.ts` ↔ all GIS components | Direct import. Module-level origin state set once per building selection. | All subsequent coordinate calls are stateless functions. No React context needed. |
| `earcut-extrude.ts` ↔ `procedural-building.ts` | Direct import. `extrudePolygon(outerRing, holes, height)` returns `BufferGeometry`. | Only called for cap faces. Facade/structure generators are not affected. |
| `use-gis-composite.ts` ↔ GIS R3F components | React props. Hook returns resolved data; components accept data as props. | Components do not hold their own query state — cleaner for testing. |
| `workflowStore.stage` ↔ `building-scene.tsx` | Zustand subscription. Scene reads `stage` to determine which layers to mount. | GIS layers unmount on `'select'` transition — clean disposal of InstancedMesh and textures. |
| `SatelliteGround` ↔ `SAOPass` | Three.js render layers. Ground plane on `layers.set(1)`. SAOPass excludes layer 1 from depth. | Prevents SAOPass self-occlusion darkening the horizontal satellite surface (known Three.js SSAO artifact). |
| `ContextBuildings` (count) ↔ `SAOPostProcessing` | React state / prop in `building-scene.tsx`. Context building count controls `saoKernelRadius` and SAOPass resolution. | SAOPass is configured at scene level in `SAOPostProcessing` component — must read count via shared state or ref. |

---

## Scaling Considerations

| Concern | Single building | 10 sequential selections | Campus mode (50+ buildings) |
|---------|----------------|--------------------------|------------------------------|
| GIS fetch load | 3 parallel VWorld calls, ~1–2s | TanStack Query caches by `origin` key — re-selecting same building is instant | GIS composite queries per-building; share same satellite bbox if buildings are close |
| Draw calls | +3 draw calls total (satellite, context InstancedMesh, zoning) | Same 3 draw calls regardless of context building count | InstancedMesh scales to 500 instances before LOD is needed |
| SAOPass | Reduce `saoKernelRadius` when > 50 context buildings. Half-res when > 100. | Per-building performance mode toggle in layer panel | For campus + GIS simultaneously: disable SAOPass, consider N8AO (lighter alternative, 30–50% cheaper on complex scenes) |
| GPU texture memory | 1 satellite JPEG ~200–400KB GPU. | TanStack Query `staleTime=30min` caches data; Three.js texture needs explicit `texture.dispose()` on building change | LRU eviction: dispose satellite texture when building selection changes. Monitor `renderer.info.memory.textures`. |

---

## Sources

- Codebase: `src/app/api/vworld/footprint/route.ts` — `extractPolygon()` equirectangular pattern, hardcoded `domain: "localhost"`, VWorld Data API structure — HIGH confidence
- Codebase: `src/lib/procedural/types.ts` — `BuildingRecipe.footprintPolygon?: [number, number][]` already present — HIGH confidence
- Codebase: `src/components/viewer/building-scene.tsx` — SAOPass `saoKernelRadius: 50`, scene structure, campus/single-building branching, `useBuildingFootprint` usage — HIGH confidence
- Codebase: `src/hooks/use-building-footprint.ts` — `useQuery` pattern, `staleTime` 30min — HIGH confidence
- PITFALLS.md: Equirectangular error (Pitfall 1), Float32 precision (Pitfall 2), EPSG axis order (Pitfall 3), ShapeGeometry failure (Pitfall 4), SAOPass collapse (Pitfall 7) — HIGH confidence (research-validated)
- FEATURES.md: VWorld 3D API permanently closed, `useQueries` parallel fetch pattern, InstancedMesh for LOD1, feature dependency graph — HIGH confidence
- Three.js InstancedMesh docs: https://threejs.org/docs/pages/InstancedMesh.html — HIGH confidence
- Three.js issues #11957, #3386: ShapeGeometry triangulation failures — HIGH confidence
- mapbox/earcut: https://github.com/mapbox/earcut — HIGH confidence
- proj4js: https://github.com/proj4js/proj4js — HIGH confidence (site-specific TM approach)

---

*Architecture research for: GIS-Composite Realistic Drafts — Korean BIM Energy Management System v4.0*
*Researched: 2026-04-12*
