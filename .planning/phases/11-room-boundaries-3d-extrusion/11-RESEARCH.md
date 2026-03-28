# Phase 11: Room Boundaries + 3D Extrusion - Research

**Researched:** 2026-03-28
**Domain:** Computational geometry (planar graph cycle detection), Three.js ShapeGeometry, CSG boolean operations, multi-floor plan management
**Confidence:** HIGH (codebase verified + THREE.js docs), MEDIUM (algorithm implementation details)

## Summary

Phase 11 builds on the existing wall drawing system (Phase 10) to add three major capabilities: room detection with visual fill, door/window placement with wall-snap logic and opening subtraction, and multi-floor management. The existing `plan-store`, `wall-drawer`, and annotation patterns (THREE.Sprite + CanvasTexture) provide direct reuse opportunities. The core technical novelty is a planar graph cycle detection algorithm to find enclosed rooms from connected wall segments.

The room detection algorithm must be implemented from scratch (as pure TypeScript) — it is too project-specific for a library. The algorithm is well-understood: build an adjacency graph from wall endpoints (snapping close endpoints together), then run a DFS-based minimal cycle extraction. THREE.ShapeGeometry renders the resulting polygon as a colored semi-transparent floor fill. Door/window openings in 3D walls use `three-bvh-csg` for boolean subtraction (new dependency, ~75KB).

**Primary recommendation:** Implement room detection as `src/lib/plan/room-detector.ts` (pure TS, testable), use THREE.ShapeGeometry for room fills, and `three-bvh-csg` for wall openings. Multi-floor support is a store extension with a "copy floor" action.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Room Detection:** Graph-based cycle detection — build wall graph from endpoints, find minimal cycles using DFS to detect enclosed rooms
- **Room Labels:** THREE.Sprite + CanvasTexture (consistent with existing annotation pattern); placed at polygon centroid; show room name + area (m²)
- **Room Fill:** Semi-transparent colored fill per room type (living/kitchen/bedroom/custom), 20% opacity so grid shows through
- **Door/Window Snap:** Components snap to wall segment — click near wall, component snaps to nearest point on wall centerline; position stored as parametric offset (0-1 along wall length)
- **Wall Openings:** Boolean subtraction on wall mesh creates rectangular openings in 3D wall geometry
- **Door/Window Presets:** Korean standard size presets reusing existing ComponentPreset pattern
- **Architectural Symbols:** Door = arc sweep line, window = parallel double lines in plan view
- **Multi-Floor:** "Copy floor" button duplicates all walls + openings from active floor to target floor
- **Extrusion:** Auto-extrusion is automatic — walls already render as Wall3D when switching to 3D mode
- **Floor Slabs:** Added as horizontal planes at each floor level
- **Per-Floor Height:** Extend plan-store with floor height settings
- **Floor Selector:** Reuse existing floor selector in viewer-overlay toolbar, extend to dynamic count

### Claude's Discretion
- Wall graph data structure implementation details
- Room type assignment UI (dropdown, click-to-cycle, etc.)
- Floor slab material and thickness defaults
- Exact Korean standard door/window dimensions (already have KS presets in component-types.ts)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAN-02 | User can create room boundaries from enclosed wall segments | Graph cycle detection algorithm + THREE.ShapeGeometry room fill |
| PLAN-03 | Drawn 2D plan extrudes to 3D geometry automatically | Wall3D already extruded; floor slabs + per-floor height config extends this |
| PLAN-04 | User can place doors and windows on walls in plan view | Wall-snap algorithm + parametric offset + architectural symbols + three-bvh-csg openings |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Next.js 16 App Router + React 19 + TypeScript — no default exports pattern
- R3F v9 + drei v10 — Three.js 0.183.x
- Zustand v5 stores: non-persisted for session state, separate stores per domain
- THREE.Sprite + CanvasTexture for text labels (NOT CSS2DRenderer — established pattern)
- Ground plane raycasting: THREE.Plane(0,1,0) + ray.intersectPlane for XZ coordinates
- `primitive` wrapper pattern for Three.js objects avoiding JSX type collisions (e.g., THREE.Line)
- InstancedMesh: `setMatrixAt` must be followed by `instanceMatrix.needsUpdate = true`
- SAOPass not in @react-three/postprocessing — import from `three/examples/jsm/postprocessing/SAOPass.js`
- `useTexturedMaterial` must always return roughness value
- `pnpm build` to check for type errors before declaring work complete

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| three | ^0.183.2 | 3D scene, ShapeGeometry, Sprite | Project standard |
| @react-three/fiber | ^9.5.0 | R3F Canvas, useFrame, useThree | Project standard |
| @react-three/drei | ^10.7.7 | Html, OrbitControls | Project standard |
| zustand | ^5.0.12 | plan-store extension | Project standard |
| vitest | ^4.1.2 | Unit tests for room detector | Project standard |

### New Dependencies Required
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| three-bvh-csg | ^0.0.18 | Boolean subtraction for wall openings | Only maintained CSG lib for Three.js r160+; 100x faster than BSP alternatives |
| three-mesh-bvh | ^0.9.9 | Peer dep for three-bvh-csg | Required by three-bvh-csg |

**Installation:**
```bash
pnpm add three-bvh-csg three-mesh-bvh
```

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| three-bvh-csg | Custom UV-mapped hole cutout | Custom approach avoids dep but requires manual UV repair + is brittle for non-axis-aligned walls |
| three-bvh-csg | @react-three/csg | Wrapper is convenient but adds overhead; raw three-bvh-csg matches project's existing pure Three.js generator pattern |
| Custom room detector | planar-face-discovery npm | Library is CC-BY-4.0 licensed and only 109KB, but the custom implementation is ~50 lines of pure TS, fully testable, no license concerns |

**Version verification (confirmed against npm registry, 2026-03-28):**
- three-bvh-csg: 0.0.18 (latest)
- three-mesh-bvh: 0.9.9 (latest)
- planar-face-discovery: 2.0.7 (latest, NOT used — custom implementation preferred)

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/plan/
│   ├── room-detector.ts       # Pure TS: wall graph + cycle detection + centroid
│   └── room-detector.test.ts  # Vitest unit tests
├── store/
│   └── plan-store.ts          # Extended: rooms[], floorHeights{}, openings[]
├── components/viewer/
│   ├── room-fills.tsx          # R3F: ShapeGeometry colored fills + Sprite labels
│   ├── opening-drawer.tsx      # R3F: door/window snap + placement mode
│   └── floor-slab.tsx          # R3F: horizontal slab planes per floor level
```

### Pattern 1: Room Detection Algorithm (Pure TypeScript)

**What:** Build adjacency graph from wall endpoints, group nearby endpoints via epsilon snapping, then extract minimal face cycles using DFS with "most clockwise next edge" selection.

**When to use:** Called reactively when walls array changes (useMemo in the room-fills component).

**Key insight:** The critical trick for finding minimal (room-sized) cycles rather than the outer boundary is the "rightmost turn" selection at each vertex — always pick the next edge that is most clockwise relative to the incoming direction.

```typescript
// Source: Geometric Tools "Constructing a Cycle Basis for a Planar Graph" (2016)
// src/lib/plan/room-detector.ts

export interface WallGraph {
  vertices: Map<string, [number, number]>;  // key -> XZ
  adjacency: Map<string, string[]>;          // vertex key -> neighbor keys
}

/** Snap epsilon: endpoints within 0.05m are merged to the same vertex */
const SNAP_EPS = 0.05;

export function buildWallGraph(walls: WallSegment[]): WallGraph {
  // 1. Collect all endpoints
  // 2. Merge endpoints within SNAP_EPS using a simple O(n^2) scan
  //    (wall counts in plan view are small, <200 typically)
  // 3. Build adjacency: for each wall, link its two vertex keys bidirectionally
}

export function detectRooms(graph: WallGraph): Array<{
  polygon: [number, number][];   // ordered XZ vertices
  area: number;                  // m² (shoelace formula)
  centroid: [number, number];    // XZ
}> {
  // DFS minimal face extraction:
  // For each directed edge (u→v), find the face to the left by
  // repeatedly selecting the "most clockwise" next edge from v,
  // excluding the reverse edge (v→u).
  // Stop when cycle closes back to u.
  // Filter out the outer infinite face (largest area or clockwise winding).
}
```

**Shoelace formula for area:**
```typescript
function polygonArea(pts: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return Math.abs(sum) / 2;
}
```

**Outer face detection:** The minimal cycle algorithm produces one "outer" face encompassing all walls. Filter it out by checking winding order: inner rooms have counter-clockwise winding (positive area via signed shoelace), the outer face has clockwise winding (negative signed area). OR simply discard the face with the largest area if there are connectivity questions.

### Pattern 2: Room Fill (THREE.ShapeGeometry)

**What:** For each detected room polygon, create a `THREE.Shape` from the XZ vertices, then `THREE.ShapeGeometry`, placed at y=0.01 (just above grid) with `MeshBasicMaterial` at 20% opacity.

```typescript
// Source: threejs.org/docs/#api/en/geometries/ShapeGeometry
function createRoomFill(polygon: [number, number][], color: number): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(polygon[0][0], polygon[0][1]);  // XZ → XY in shape space
  for (let i = 1; i < polygon.length; i++) {
    shape.lineTo(polygon[i][0], polygon[i][1]);
  }
  shape.closePath();

  const geom = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.20,
    side: THREE.DoubleSide,
    depthWrite: false,  // CRITICAL: prevents z-fighting with grid
  });
  const mesh = new THREE.Mesh(geom, mat);
  // ShapeGeometry is in XY plane → rotate to XZ (the ground plane)
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.01;
  return mesh;
}
```

**Critical:** ShapeGeometry generates vertices in the XY plane. To place the fill on the ground (XZ plane), rotate `mesh.rotation.x = -Math.PI / 2`. Set `depthWrite: false` to prevent z-fighting with the plan grid.

### Pattern 3: Room Label Sprite (Existing CanvasTexture pattern)

Extend the existing `createAreaLabel` pattern from `src/lib/annotations/area-label.ts`. The room label sprite shows room name + area (m²) and is positioned at the polygon centroid at `y = 0.1`.

```typescript
// Centroid calculation (arithmetic mean of polygon vertices)
function polygonCentroid(pts: [number, number][]): [number, number] {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [cx, cz];
}
```

The label sprite should use `depthTest: false` (already the pattern in area-label.ts) so it renders on top of walls.

### Pattern 4: Room Type Colors

```typescript
// src/lib/plan/room-types.ts
export const ROOM_TYPES = {
  living:   { name: "Living",   nameKo: "거실",  color: 0x4caf50 },
  bedroom:  { name: "Bedroom",  nameKo: "침실",  color: 0x2196f3 },
  kitchen:  { name: "Kitchen",  nameKo: "주방",  color: 0xff9800 },
  bathroom: { name: "Bathroom", nameKo: "욕실",  color: 0x9c27b0 },
  custom:   { name: "Custom",   nameKo: "기타",  color: 0x607d8b },
} as const;
export type RoomType = keyof typeof ROOM_TYPES;
```

### Pattern 5: Door/Window Snap to Wall

**What:** When opening-placement mode is active, mouse movement finds the nearest wall segment and snaps the component to the closest point on that wall's centerline. Stored as parametric offset (0-1).

```typescript
// Parametric projection of point P onto segment AB
function projectOntoWall(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number
): { t: number; wx: number; wz: number; dist: number } {
  const dx = bx - ax, dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 0.0001) return { t: 0, wx: ax, wz: az, dist: Infinity };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  const wx = ax + t * dx;
  const wz = az + t * dz;
  const dist = Math.sqrt((px - wx) ** 2 + (pz - wz) ** 2);
  return { t, wx, wz, dist };
}
```

Snap threshold: 1.0m. The nearest wall within snap distance becomes the target. Store as `{ wallId: string, t: number }` in the `Opening` record.

### Pattern 6: Architectural Plan Symbols

**Door symbol** (arc sweep line): Draw the door panel as a line from the hinge point at angle 0, plus an arc from 0° to 90° showing the swing path.
```typescript
// Use THREE.CatmullRomCurve3 sampled at 16 points for the arc
// Or THREE.EllipseCurve for precise arc geometry
```

**Window symbol** (parallel double lines): Two thin boxes side-by-side in the wall thickness direction, colored differently from wall fill.

Both rendered as R3F components using the `primitive` wrapper pattern (same as PreviewLine in wall-drawer.tsx) to avoid JSX type collision.

### Pattern 7: Boolean Subtraction for Wall Openings (three-bvh-csg)

**What:** When switching to 3D mode, walls with openings have the opening box subtracted from the wall box using CSG.

```typescript
// Source: github.com/gkjohnson/three-bvh-csg README
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

function createWallWithOpening(
  wallGeom: THREE.BoxGeometry,
  wallMat: THREE.Material,
  openingBox: THREE.BoxGeometry,
  openingTransform: THREE.Matrix4
): THREE.Mesh {
  const wallBrush = new Brush(wallGeom, wallMat);
  wallBrush.updateMatrixWorld();

  const openingBrush = new Brush(openingBox);
  openingBrush.matrix.copy(openingTransform);
  openingBrush.updateMatrixWorld();

  const evaluator = new Evaluator();
  const result = evaluator.evaluate(wallBrush, openingBrush, SUBTRACTION);
  return result;
}
```

**Critical requirements:**
1. Both brushes must be water-tight (two-manifold) — THREE.BoxGeometry is already water-tight
2. Call `updateMatrixWorld()` on each brush before evaluating
3. The evaluator is stateless — create once and reuse for performance
4. CSG is expensive: only recompute when walls or openings change (useMemo with deps)

**Performance note:** For plan view (2D), skip CSG entirely — use architectural symbols only. CSG runs only for 3D view rendering.

### Pattern 8: Plan-Store Extension

```typescript
// Extended plan-store types
export interface Opening {
  id: string;
  wallId: string;
  t: number;           // 0-1 parametric offset along wall
  presetId: string;    // ComponentPreset id (door-900, window-1200, etc.)
  floor: number;
}

export interface Room {
  id: string;
  polygon: [number, number][];
  area: number;
  centroid: [number, number];
  type: RoomType;
  floor: number;
}

// Extended PlanState additions:
// - openings: Opening[]
// - rooms: Room[]              // computed, stored for type overrides
// - floorHeights: Record<number, number>  // floor index -> height (default 3.0)
// - floorCount: number         // dynamic, drives floor selector
// - addOpening: (o: Opening) => void
// - removeOpening: (id: string) => void
// - setRooms: (rooms: Room[]) => void
// - setFloorHeight: (floor: number, height: number) => void
// - copyFloor: (from: number, to: number) => void
// - setFloorCount: (n: number) => void
```

### Pattern 9: Floor Slabs

Horizontal `PlaneGeometry` (or thin `BoxGeometry` with depth 0.05m) placed at `y = floor * floorHeight` for each floor. Material: `MeshStandardMaterial` with `color={0xe0e0e0}`, `roughness={0.8}`. Receives shadows.

```typescript
// src/components/viewer/floor-slab.tsx
function FloorSlab({ floor, width, depth, height }: FloorSlabProps) {
  const y = floor * height;  // bottom of this floor = top of floor below
  return (
    <mesh position={[0, y, 0]} receiveShadow>
      <boxGeometry args={[width, 0.05, depth]} />
      <meshStandardMaterial color={0xe0e0e0} roughness={0.8} />
    </mesh>
  );
}
```

For plan view: show only the slab for the active floor. For 3D view: show all slabs.

### Pattern 10: Copy Floor Action

```typescript
copyFloor: (from, to) =>
  set((state) => {
    const wallsToCopy = state.walls
      .filter((w) => w.floor === from)
      .map((w) => ({ ...w, id: crypto.randomUUID(), floor: to }));
    const openingsToCopy = state.openings
      .filter((o) => o.floor === from)
      .map((o) => ({ ...o, id: crypto.randomUUID(), floor: to }));
    return {
      walls: [...state.walls, ...wallsToCopy],
      openings: [...state.openings, ...openingsToCopy],
    };
  }),
```

### Anti-Patterns to Avoid

- **Recomputing CSG on every render:** CSG is O(n log n) per wall. Gate recomputation behind `useMemo` with `[walls, openings, viewMode]` deps. Only run CSG in 3D mode.
- **CSS2DRenderer for labels:** The project uses THREE.Sprite + CanvasTexture exclusively. CSS2DRenderer causes layout issues with the existing R3F canvas setup.
- **Touching authoring-store for room/opening state:** Decisions establish a separate `plan-store` for all plan-view concerns. Do not mix into authoring-store.
- **ShapeGeometry without rotation:** ShapeGeometry is in XY plane; failure to apply `rotation.x = -Math.PI / 2` puts the fill vertical instead of flat on the ground.
- **Winding order for outer face detection:** Always check the sign of the shoelace area; do not rely on array ordering assumptions.
- **Dynamic floor selector hardcoded to [0,1,2,3,4]:** The existing viewer-overlay has a hardcoded `[0, 1, 2, 3, 4]` array. Phase 11 must replace this with dynamic `floorCount` from plan-store.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Boolean wall openings | Custom UV-hole cutout shader | three-bvh-csg | Non-axis-aligned walls make manual UV manipulation error-prone; CSG handles any orientation |
| Arc geometry for door sweep | Manual arc vertex generation | THREE.EllipseCurve + BufferGeometry | EllipseCurve samples arbitrary arc segments cleanly with correct parameterization |
| Polygon area | Custom formula | Shoelace formula (4 lines) | Standard, handles concave polygons, well-tested |

**Key insight:** The room detection algorithm is genuinely project-specific — no existing library matches the wall-segment-endpoint graph model exactly, and the implementation is short (~80 lines). Build it.

## Common Pitfalls

### Pitfall 1: Disconnected Walls Not Forming Rooms
**What goes wrong:** Walls with a small gap between endpoints (e.g., 0.03m) are treated as separate vertices — cycle detector finds no enclosed face.
**Why it happens:** Floating-point start/end coordinates from click-to-place have small errors.
**How to avoid:** Apply `SNAP_EPS = 0.05m` snapping when building the wall graph. Endpoints within 0.05m are merged to the same graph vertex.
**Warning signs:** Room detection returns 0 rooms despite visually-closed layout.

### Pitfall 2: Outer Face Included as a "Room"
**What goes wrong:** The cycle detector returns a large polygon encompassing all walls as the outermost face.
**Why it happens:** The planar face extraction algorithm finds ALL faces including the unbounded outer face.
**How to avoid:** After collecting all cycles, discard the cycle whose signed shoelace area is negative (clockwise winding = outer face). Fallback: discard the cycle with the largest area if ambiguous.
**Warning signs:** One "room" fill covers the entire plan area.

### Pitfall 3: CSG Produces Invalid Geometry
**What goes wrong:** three-bvh-csg returns an empty or degenerate mesh.
**Why it happens:** Opening brush extends outside the wall mesh bounds, or brushes share coplanar faces.
**How to avoid:** Clamp the opening box dimensions so it never exceeds wall dimensions. Offset the opening brush slightly (0.01m) into the wall to prevent coplanar start/end faces.
**Warning signs:** Wall disappears after opening subtraction; console CSG warnings.

### Pitfall 4: Room Fill Z-Fighting with Grid
**What goes wrong:** Room fill flickers against the plan grid lines.
**Why it happens:** Both are at y≈0.
**How to avoid:** Set room fill `position.y = 0.01` (above grid at y=0), and set `depthWrite: false` on fill material.

### Pitfall 5: Opening Placement Mode Conflicts with Wall Drawing
**What goes wrong:** Clicks in opening-placement mode accidentally start new wall segments.
**Why it happens:** Both modes listen to canvas click events simultaneously.
**How to avoid:** Extend the `drawingMode` in plan-store to a discriminated union: `"wall" | "opening" | null`. WallDrawer only handles clicks when `drawingMode === "wall"`, OpeningDrawer only when `drawingMode === "opening"`.

### Pitfall 6: Floor Selector Hardcoded
**What goes wrong:** The existing overlay hardcodes `[0, 1, 2, 3, 4]` for floor buttons.
**Why it happens:** Phase 10 only needed a static list.
**How to avoid:** Replace the hardcoded array with `Array.from({ length: floorCount }, (_, i) => i)` derived from `plan-store.floorCount`. The "Copy Floor" button increments `floorCount` as needed.

### Pitfall 7: Sprite Labels Not Visible in 2D Mode
**What goes wrong:** Room labels appear behind other geometry or too small.
**Why it happens:** Orthographic camera with sprites requires `sizeAttenuation: false` if labels should stay fixed-pixel, OR careful world-scale sizing.
**How to avoid:** Use `sizeAttenuation: true` (existing pattern) but size the sprite in world units appropriate for the plan scale (~0.8m height). The orthographic camera still shows correct relative sizes.

## Code Examples

Verified patterns from existing codebase:

### Existing CanvasTexture Sprite Pattern (area-label.ts)
```typescript
// src/lib/annotations/area-label.ts — confirmed working pattern
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d")!;
ctx.font = `bold ${fontSize}px sans-serif`;
// ... draw text ...
const tex = new THREE.CanvasTexture(canvas);
tex.needsUpdate = true;
const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true });
const sprite = new THREE.Sprite(mat);
sprite.scale.set(height * aspect, height, 1);
```

### Existing Wall Geometry Pattern (wall-drawer.tsx)
```typescript
// Wall3D — confirmed 3D extrusion pattern
const baseY = wall.floor * wall.height;
<mesh position={[cx, baseY + wall.height / 2, cz]} rotation={[0, -angle, 0]}>
  <boxGeometry args={[length, wall.height, wall.thickness]} />
  <meshStandardMaterial color={WALL_COLOR_3D} roughness={0.7} />
</mesh>
```

### three-bvh-csg Subtraction API (v0.0.18)
```typescript
// Source: github.com/gkjohnson/three-bvh-csg
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

const evaluator = new Evaluator(); // reuse across walls

const wallBrush = new Brush(wallBoxGeometry, wallMaterial);
wallBrush.position.set(cx, baseY + height/2, cz);
wallBrush.rotation.set(0, -angle, 0);
wallBrush.updateMatrixWorld();

const openingBrush = new Brush(openingBoxGeometry);
openingBrush.position.set(openingWorldX, openingWorldY, openingWorldZ);
openingBrush.rotation.set(0, -angle, 0);
openingBrush.updateMatrixWorld();

const result = evaluator.evaluate(wallBrush, openingBrush, SUBTRACTION);
// result is a THREE.Mesh with the opening cut out
```

### ShapeGeometry for Room Fill
```typescript
// Source: threejs.org/docs/#api/en/geometries/ShapeGeometry
const shape = new THREE.Shape();
shape.moveTo(polygon[0][0], polygon[0][1]);
polygon.slice(1).forEach(([x, z]) => shape.lineTo(x, z));
shape.closePath();

const geom = new THREE.ShapeGeometry(shape);
const mat = new THREE.MeshBasicMaterial({
  color: roomColor,
  transparent: true,
  opacity: 0.20,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const mesh = new THREE.Mesh(geom, mat);
mesh.rotation.x = -Math.PI / 2;  // XY → XZ ground plane
mesh.position.y = 0.01;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ThreeCSG (BSP) | three-bvh-csg | ~2022 | 100x faster for complex meshes |
| CSS2DRenderer labels | THREE.Sprite + CanvasTexture | Phase 8 (this project) | No DOM overhead, works in WebGL |
| Hardcoded floor count | Dynamic floorCount in store | Phase 11 (this work) | Enables arbitrary floors |

**Deprecated/outdated:**
- `ThreeCSG`/`three-csg-ts`: Deprecated in favor of three-bvh-csg — BSP approach is slow and poorly maintained
- `CSS2DRenderer` for plan labels: Not used in this project — Sprite pattern established in Phase 8

## Open Questions

1. **Room type assignment UI interaction**
   - What we know: Decisions specify room type per room with color coding
   - What's unclear: Whether room type is assigned via click-to-cycle on the fill, a properties panel, or dropdown overlay
   - Recommendation: Click-to-cycle is lowest-friction for plan drawing workflow; cycle through ROOM_TYPES on click when opening-placement mode is not active

2. **Opening width clamping in CSG**
   - What we know: three-bvh-csg requires opening to fit within wall bounds
   - What's unclear: Whether presets wider than the wall segment should be rejected or clamped
   - Recommendation: Reject — show a "too wide" tooltip (reuse the existing min-wall-length tooltip pattern from WallDrawer)

3. **Room detection trigger**
   - What we know: Rooms change when walls change
   - What's unclear: Whether to run detection on every `addWall`/`removeWall` or only when explicitly triggered
   - Recommendation: Run reactively via `useMemo` in `room-fills.tsx` — detection is O(n^2) for small n (<200 walls), fast enough for real-time updates

## Environment Availability

All dependencies are Node.js package installs — no external services required.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| three | Room fill, sprites | ✓ | 0.183.2 | — |
| three-bvh-csg | Wall opening subtraction | ✗ (not installed) | 0.0.18 on npm | Skip openings in 3D (show symbol only) |
| three-mesh-bvh | Peer dep of three-bvh-csg | ✗ (not installed) | 0.9.9 on npm | — |
| vitest | Unit tests | ✓ | 4.1.2 | — |
| pnpm | Package install | ✓ | (project uses pnpm) | — |

**Missing dependencies with no fallback:**
- `three-bvh-csg` + `three-mesh-bvh` — must be installed before Wave 1 that implements 3D openings. Install command: `pnpm add three-bvh-csg three-mesh-bvh`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 + happy-dom |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `pnpm vitest run src/lib/plan` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAN-02 | `buildWallGraph` merges nearby endpoints | unit | `pnpm vitest run src/lib/plan/room-detector.test.ts` | ❌ Wave 0 |
| PLAN-02 | `detectRooms` finds enclosed rectangle from 4 walls | unit | `pnpm vitest run src/lib/plan/room-detector.test.ts` | ❌ Wave 0 |
| PLAN-02 | `detectRooms` returns 0 rooms for open wall set | unit | `pnpm vitest run src/lib/plan/room-detector.test.ts` | ❌ Wave 0 |
| PLAN-02 | `polygonArea` shoelace formula matches known rectangle | unit | `pnpm vitest run src/lib/plan/room-detector.test.ts` | ❌ Wave 0 |
| PLAN-02 | Room type stored in plan-store rooms array | unit | `pnpm vitest run src/store/__tests__/plan-store.test.ts` | ✅ (extend) |
| PLAN-03 | `copyFloor` duplicates walls to target floor | unit | `pnpm vitest run src/store/__tests__/plan-store.test.ts` | ✅ (extend) |
| PLAN-03 | `setFloorHeight` updates per-floor height in store | unit | `pnpm vitest run src/store/__tests__/plan-store.test.ts` | ✅ (extend) |
| PLAN-04 | `projectOntoWall` returns correct parametric t | unit | `pnpm vitest run src/lib/plan/room-detector.test.ts` | ❌ Wave 0 |
| PLAN-04 | Opening stored with wallId + t in plan-store | unit | `pnpm vitest run src/store/__tests__/plan-store.test.ts` | ✅ (extend) |

### Sampling Rate
- **Per task commit:** `pnpm vitest run src/lib/plan src/store/__tests__/plan-store.test.ts`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green + `pnpm build` (type check) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/plan/room-detector.ts` — main algorithm module (covers PLAN-02, PLAN-04)
- [ ] `src/lib/plan/room-detector.test.ts` — unit tests for graph + cycle detection
- [ ] `src/lib/plan/room-types.ts` — ROOM_TYPES constant + RoomType union
- [ ] Install: `pnpm add three-bvh-csg three-mesh-bvh`

## Sources

### Primary (HIGH confidence)
- Codebase: `src/store/plan-store.ts` — confirmed WallSegment type, store structure
- Codebase: `src/components/viewer/wall-drawer.tsx` — confirmed Wall2D/Wall3D geometry, ground-plane raycasting
- Codebase: `src/lib/annotations/area-label.ts` + `dimension-line.ts` — confirmed Sprite + CanvasTexture pattern
- Codebase: `src/lib/components/component-types.ts` — confirmed ComponentPreset pattern, existing door/window presets
- Codebase: `src/components/viewer/viewer-overlay.tsx` — confirmed hardcoded floor selector [0..4]
- Codebase: `src/store/authoring-store.ts` — confirmed isAuthoring gate, undo/redo pattern
- npm registry: `three-bvh-csg@0.0.18` — verified 2026-03-28
- npm registry: `three-mesh-bvh@0.9.9` — verified 2026-03-28
- npm registry: `planar-face-discovery@2.0.7` — evaluated and rejected (custom implementation preferred)
- threejs.org/docs: ShapeGeometry API — XY plane, rotation required for ground placement

### Secondary (MEDIUM confidence)
- GeometricTools "Constructing a Cycle Basis for a Planar Graph" (PDF) — minimal cycle basis algorithm basis; implementation details inferred from academic description
- github.com/gkjohnson/three-bvh-csg — API verified via README fetch; `Brush`, `Evaluator`, `SUBTRACTION` exports confirmed
- THREE.js forum: three-bvh-csg discussion threads confirming active maintenance and water-tight requirement

### Tertiary (LOW confidence)
- Korean door/window standard sizes (KS F 3109): already captured in `component-types.ts` presets (door-900, door-1000, door-1200, window-1200/1800/2400) — no additional research needed; presets are already in codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against installed packages and npm registry
- Architecture (room detector algorithm): MEDIUM — algorithm is well-established in academic literature; TypeScript implementation details are discretionary
- Architecture (Three.js patterns): HIGH — verified against existing codebase patterns and THREE.js docs
- three-bvh-csg integration: MEDIUM — API confirmed from README; edge cases (coplanar faces, non-manifold inputs) need careful implementation
- Pitfalls: HIGH — derived from verified codebase patterns and known Three.js constraints

**Research date:** 2026-03-28
**Valid until:** 2026-06-01 (stable dependencies; room detection algorithm is timeless)
