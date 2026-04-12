# Phase 25: Energy Consumption Heatmap - Research

**Researched:** 2026-04-12
**Domain:** Three.js floor-plane heatmap on the existing `energy-zones` layer group — Korean kWh/m² grade color mapping, disposal, and React hook integration
**Confidence:** HIGH (all integration points verified against actual codebase files)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EA-03 | Energy consumption heatmap color-codes building floors by kWh/m² intensity on the 3D geometry (green-to-red gradient) | Separate THREE.Mesh per floor in the existing `energy-zones` group, fed by `useEnergyBreakdown` (Phase 23 deliverable), colored via `kwhmToColor()` interpolating GRADE_THRESHOLDS from `energy-grade.ts` |

</phase_requirements>

---

## Summary

Phase 25 adds a floor-level color heatmap to the 3D building model by placing transparent `THREE.Mesh` floor planes inside the existing `energy-zones` layer group. Each plane receives a `Float32BufferAttribute` vertex color buffer computed from the floor's kWh/m² value by interpolating across the 10-grade Korean threshold scale already defined in `energy-grade.ts`. The heatmap rebuilds reactively when the `perFloor` array from `useEnergyBreakdown` changes (i.e., on any material slider change). Because the planes live in the `energy-zones` group — not in the structural `structure` group — they remain visible when the structure layer is toggled off. `disposeLayer("energy-zones")` in the existing `LayerManager` handles full cleanup automatically.

**Phase 25 depends on Phase 23 (Per-Floor Energy Model)** delivering `useEnergyBreakdown(pk)` that returns a `perFloor: number[]` array of kWh/m² values. Phase 25 only consumes that array — it does not extend the energy calculation engine itself.

**Primary recommendation:** One `THREE.Mesh` with `THREE.PlaneGeometry` per floor, `MeshBasicMaterial` with `vertexColors: true`, transparent, living in the `energy-zones` group. Build and dispose the entire `"energy-heatmap"` named group on every `perFloor` change. No shader needed; flat vertex colors are sufficient and performant on mobile GPUs.

---

## Project Constraints (from CLAUDE.md)

- Framework: Next.js 16 App Router + React 19 + TypeScript
- 3D renderer: React Three Fiber v9, Three.js r183, `@react-three/drei` v10
- Layer system: 5-layer `LayerManager` — `ALL_LAYER_IDS` must stay at 5 entries
- `LayerManager.disposeLayer(id)` traverses all children recursively — no custom disposal code needed inside heatmap builder
- SAOPass intentionally disabled — must not be re-enabled (halo artifact on polygon geometry)
- Materials: `MeshStandardMaterial` for structural geometry; `MeshBasicMaterial` is acceptable for energy overlay planes (they do not need PBR shading)
- Shadows: VSMShadowMap — heatmap planes should use `castShadow = false`, `receiveShadow = false` (transparent overlays do not cast shadows)
- No HDR background on overlay planes needed

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `three` | 0.183.2 (installed) | PlaneGeometry, BufferAttribute, MeshBasicMaterial, THREE.Color | Already in project; PlaneGeometry vertex colors stable since r100+ |
| `@react-three/fiber` | ^9.5.0 (installed) | `useFrame`, Canvas — no new primitives needed for this phase | Already in project |
| `zustand` | ^5.0.12 (installed) | `useLayerStore` subscription for `visibility["energy-zones"]` | Already in project |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@react-three/drei` | ^10.7.7 (installed) | No new drei primitives needed for this phase | — |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `THREE.PlaneGeometry` + vertex colors per floor | Single InstancedMesh + `setColorAt` | `setColorAt` applies one flat color per instance (no gradient); full buffer re-upload on every energy change. Pitfall 1 in PITFALLS.md explicitly forbids this for heatmap geometry. |
| `MeshBasicMaterial` + vertex colors | Custom `ShaderMaterial` with scalar uniform | Shader gives gradient-within-floor (hot perimeter, cool center). But EA-03 only requires per-floor uniform color — one color per plane. Shader adds complexity for no requirement benefit. Vertex colors on `MeshBasicMaterial` are correct for this phase. |
| Rebuild entire heatmap group on change | Update existing `BufferAttribute` in place | Updating in place requires tracking mesh refs per floor and calling `needsUpdate = true`. Rebuilding is simpler, always correct, and disposal is handled by `LayerManager.disposeLayer`. Performance: rebuilding 20 planes takes < 1ms. |

**Installation:** No new packages needed. All dependencies are already installed.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/layers/
│   └── energy-heatmap-mesh.ts   # NEW — pure Three.js, no React
├── hooks/
│   └── use-energy-breakdown.ts  # Phase 23 deliverable (consumed here, not created)
└── components/viewer/
    └── building-layers.tsx      # ADD useEffect wiring heatmap into energy-zones group
```

### Pattern 1: Separate `THREE.Mesh` per floor in `energy-zones` group

**What:** `buildEnergyHeatmap(floors, perFloorKwh, recipe)` returns a `THREE.Group` named `"energy-heatmap"`. Each floor is a `PlaneGeometry` rotated horizontal with a `Float32BufferAttribute` color buffer computed from kWh/m². The group is added to `layerManager.getGroup("energy-zones")`.

**When to use:** Phase 25 heatmap requirement and any future per-floor spatial overlay.

**Code contract (to implement in `src/lib/layers/energy-heatmap-mesh.ts`):**

```typescript
// Source: ARCHITECTURE.md §2 + energy-grade.ts GRADE_THRESHOLDS
import * as THREE from "three";
import type { FloorSpec } from "@/lib/procedural/types";
import type { BuildingRecipe } from "@/lib/procedural/types";

export function buildEnergyHeatmap(
  floors: FloorSpec[],
  perFloorKwh: number[],   // kWh/m²·yr per floor, index matches floors[] order
  recipe: BuildingRecipe
): THREE.Group {
  const group = new THREE.Group();
  group.name = "energy-heatmap";

  const aboveFloors = floors.filter((f) => f.type === "above");
  aboveFloors.forEach((floor, i) => {
    const kwh = perFloorKwh[i] ?? 0;
    const geo = new THREE.PlaneGeometry(recipe.footprintWidth, recipe.footprintDepth, 2, 2);
    geo.rotateX(-Math.PI / 2);
    const color = kwhmToColor(kwh);
    const colors = new Float32Array(geo.attributes.position.count * 3);
    for (let v = 0; v < geo.attributes.position.count; v++) {
      colors[v * 3]     = color.r;
      colors[v * 3 + 1] = color.g;
      colors[v * 3 + 2] = color.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = floor.y + 0.02;   // 2 cm above slab surface
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData = { type: "energy-heatmap-floor", floorNo: floor.floorNo };
    group.add(mesh);
  });
  return group;
}
```

### Pattern 2: Rebuild-on-change in `building-layers.tsx`

**What:** A `useEffect` inside `BuildingLayers` detects when `floorDemands.perFloor` changes, disposes the old heatmap group, and adds a new one.

**When to use:** Any time the energy data dependency changes (Phase 23 hook result, which itself depends on material-store + recipe-store slices).

```typescript
// Source: ARCHITECTURE.md §2 integration snippet
// Inside BuildingLayers component
const floorDemands = useEnergyBreakdown(buildingPk);  // Phase 23 hook
const recipe = useRecipeStore((s) => s.baseRecipes[buildingPk]);

useEffect(() => {
  const manager = managerRef.current;
  if (!manager || !recipe) return;
  const energyGroup = manager.getGroup("energy-zones");

  // Dispose previous heatmap
  const old = energyGroup.getObjectByName("energy-heatmap");
  if (old) {
    old.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    energyGroup.remove(old);
  }

  if (!floorDemands?.perFloor?.length) return;

  const heatmap = buildEnergyHeatmap(recipe.floors, floorDemands.perFloor, recipe);
  energyGroup.add(heatmap);
}, [floorDemands, recipe]);
```

**Critical note on dependency:** `floorDemands` from `useEnergyBreakdown` is the Phase 23 deliverable. Phase 25 implementation cannot begin until Phase 23 provides a stable `{ perFloor: number[] }` shape. If Phase 23 ships a different shape, update the property access in this `useEffect`.

### Pattern 3: `kwhmToColor()` — grade-anchored color interpolation

**What:** Maps a kWh/m²·yr scalar to a `THREE.Color` using the 10-grade threshold scale from `energy-grade.ts`. Linear interpolation between grade anchor colors.

**Anchor points (derived from `GRADE_THRESHOLDS` in `energy-grade.ts`):**

| kWh/m²·yr | CSS Color | Grade |
|-----------|-----------|-------|
| ≤ 60 | `#3b82f6` (blue) | 1+++ |
| 90 | `#22c55e` (green) | 1++ |
| 120 | `#84cc16` (lime) | 1+ |
| 150 | `#7CFC00` (lawn green) | 1 |
| 190 | `#ADFF2F` (green-yellow) | 2 |
| 230 | `#FFD700` (gold) | 3 |
| 270 | `#FFA500` (orange) | 4 |
| 320 | `#FF6347` (tomato) | 5 |
| 370 | `#FF4500` (orange-red) | 6 |
| ≥ 370 | `#DC143C` (crimson) | 7 |

**Note:** These anchor colors exactly match `GRADE_COLORS` in `energy-grade.ts` — use that record as the source of truth to avoid divergence. The `kwhmToColor()` function should call `getGradeColor(getEnergyGrade(kwh))` for the base color, then optionally interpolate between adjacent grades for smoothness. For Phase 25, a simple lookup-per-floor (no interpolation) is sufficient because each floor gets a single uniform color.

```typescript
// Source: energy-grade.ts GRADE_COLORS + GRADE_THRESHOLDS
import { getEnergyGrade, getGradeColor } from "@/lib/energy/energy-grade";

export function kwhmToColor(kwh: number): THREE.Color {
  const grade = getEnergyGrade(kwh);
  const hex = getGradeColor(grade);
  return new THREE.Color(hex);
}
```

This is the simplest correct implementation — reuse existing functions rather than duplicating the threshold table.

### Anti-Patterns to Avoid

- **`mesh.setColorAt()` on structural InstancedMesh:** Forbidden — see PITFALLS.md Pitfall 1. The heatmap geometry must be entirely separate from the structural `InstancedMesh` in `structure-generator.ts`.
- **Storing the heatmap group in React state:** Three.js objects must never go into React state or Zustand — only into a `useRef` or a Three.js scene graph. `BuildingLayers` already uses `managerRef` correctly.
- **Re-enabling SAOPass:** Heatmap planes are flat polygon geometry — they will trigger the same halo artifact that caused SAOPass to be disabled in v4.0. SAOPass stays disabled.
- **Calling `disposeLayer("energy-zones")` to tear down heatmap:** Use the targeted approach (traverse + remove the named `"energy-heatmap"` child group) instead. Calling `disposeLayer` tears down ALL energy-zones geometry including any other content added in Phase 23 or future phases. The ARCHITECTURE.md snippet (Pattern 2 above) shows the correct targeted disposal.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| kWh/m² → grade lookup | Custom threshold table | `getEnergyGrade()` + `getGradeColor()` from `energy-grade.ts` | Table already exists, tested, matches Korean MOTIE/KEMCO standard |
| Per-floor kWh/m² data | Extension of `calculateAnnualDemand()` inside this phase | `useEnergyBreakdown(pk).perFloor` from Phase 23 | Phase 23 owns the energy calculation layer; Phase 25 is visualization only |
| Custom color lerp | Manual RGB interpolation between arbitrary anchor colors | `THREE.Color.lerp()` if smooth gradient needed | Built-in, handles linear sRGB interpolation correctly |
| Geometry disposal | Manual `geometry.dispose()` recursion | `LayerManager.disposeLayer("energy-zones")` for full teardown; targeted traversal for partial rebuild | `disposeLayer` already handles the recursive pattern (lines 160–183 of layer-manager.ts) |

**Key insight:** Phase 25 is purely a visualization consumer. It does not compute energy, does not extend the grade system, and does not modify any existing layer. The only new code is: (1) `energy-heatmap-mesh.ts` (pure Three.js builder), (2) `kwhmToColor()` (one-liner reusing existing functions), and (3) one `useEffect` in `building-layers.tsx`.

---

## Common Pitfalls

### Pitfall 1: Building the heatmap before Phase 23 ships `useEnergyBreakdown`

**What goes wrong:** Phase 25 requires `useEnergyBreakdown(pk)` returning `{ perFloor: number[] }`. This hook does not exist yet — it is Phase 23's deliverable. If Phase 25 is implemented before Phase 23 completes, the hook import will fail at compile time.

**How to avoid:** Phase 25 must wait on Phase 23. During development, a stub hook returning mock `perFloor` data is acceptable for testing geometry and color mapping independently. The stub must not be committed to main.

**Warning signs:** Import of `useEnergyBreakdown` resolves to a non-existent file.

---

### Pitfall 2: Heatmap planes obscure the building model

**What goes wrong:** `opacity: 0.55` on `MeshBasicMaterial` with `depthWrite: false` means the planes are semi-transparent. However, if `depthWrite` is `true`, the planes occlude geometry behind them (column, slab InstancedMesh) causing visual holes. With `depthWrite: false`, render order matters — three.js may draw the planes before or after opaque geometry, causing z-fighting at edges.

**How to avoid:** Set `depthWrite: false` and `renderOrder = 1` on each heatmap mesh to ensure they always render after opaque geometry. Three.js renders transparent objects after opaque by default when `transparent: true` is set, but explicit `renderOrder` makes this deterministic.

```typescript
mesh.renderOrder = 1;
```

**Warning signs:** Dark banding or "holes" in the structural geometry when the energy-zones layer is visible.

---

### Pitfall 3: `PlaneGeometry` rotated in the wrong axis

**What goes wrong:** `THREE.PlaneGeometry` is created in the XY plane (normal = +Z). A horizontal floor plane needs normal = +Y. The rotation is `geo.rotateX(-Math.PI / 2)`. If the rotation is `rotateY` or the sign is wrong, the planes will stand vertically.

**How to avoid:** Apply `geo.rotateX(-Math.PI / 2)` immediately after creating the geometry. Verify by checking `mesh.position.y` places the plane at the floor's y-level with the plane visible from above.

---

### Pitfall 4: Floor indexing mismatch between `recipe.floors` and `perFloor` array

**What goes wrong:** `recipe.floors` may include both `"above"` and `"below"` floors (basement). The ARCHITECTURE.md pattern filters `aboveFloors = floors.filter(f => f.type === "above")`. If `perFloor` from Phase 23 also includes basement floors, index `i` will be wrong: basement floors in `perFloor[0]` will be painted on the first above-ground floor.

**How to avoid:** Confirm with Phase 23's `useEnergyBreakdown` contract whether `perFloor` includes basement floors or only above-ground floors. The filter in `buildEnergyHeatmap` must match the indexing convention in `useEnergyBreakdown`. Document the contract explicitly: "index 0 = lowest above-ground floor."

**Warning signs:** Floors with known high energy use (top floor, corner exposure) show wrong colors; heatmap appears offset by one or more floors.

---

### Pitfall 5: `useEffect` dep array includes `recipe.floors` (object reference instability)

**What goes wrong:** `recipe` from `useRecipeStore((s) => s.baseRecipes[buildingPk])` is a new object reference on every store update, even when the floor layout hasn't changed. If `recipe` is in the `useEffect` dep array, the heatmap rebuilds on every material slider change even before Phase 23's `perFloor` data changes — causing flickering.

**How to avoid:** The `useEffect` should depend on `[floorDemands, recipe]` as in the ARCHITECTURE.md pattern. `floorDemands` from `useEnergyBreakdown` is already a stable memoized output — it only changes when material or recipe inputs change. This means the heatmap rebuild is correctly triggered at the same rate as the energy recalculation: once per slider commit, not once per render.

Follow `useEnergyMetrics`'s pattern: subscribe to `baseRecipes[pk]` and `overrides[pk]` as separate primitive-stable slices if reference instability proves to be a problem.

---

### Pitfall 6: Layer visibility independence — heatmap must stay visible when structure is hidden

**What goes wrong:** If heatmap meshes are accidentally added to the `"structure"` layer group instead of `"energy-zones"`, toggling the structure layer off hides the heatmap. Success criterion 3 requires the heatmap to remain visible when structure is hidden.

**How to avoid:** Always use `manager.getGroup("energy-zones")` — never `manager.getGroup("structure")`. The `COMPONENT_TO_LAYER` map in `layer-manager.ts` shows `"heat-loss"` and `"energy-zone"` both map to `"energy-zones"`. Set `mesh.userData.type = "energy-heatmap-floor"` to identify the heatmap geometry in traversals.

---

## Code Examples

### `kwhmToColor` using existing grade functions

```typescript
// Source: energy-grade.ts (verified in codebase)
import { getEnergyGrade, getGradeColor } from "@/lib/energy/energy-grade";
import * as THREE from "three";

export function kwhmToColor(kwh: number): THREE.Color {
  return new THREE.Color(getGradeColor(getEnergyGrade(kwh)));
}
```

`GRADE_THRESHOLDS` from `energy-grade.ts` (verified):
- `"1+++"` < 60 kWh/m²
- `"1++"` < 90
- `"1+"` < 120
- `"1"` < 150
- `"2"` < 190
- `"3"` < 230
- `"4"` < 270
- `"5"` < 320
- `"6"` < 370
- `"7"` ≥ 370

---

### Targeted dispose of old heatmap (not full `disposeLayer`)

```typescript
// Source: LayerManager.disposeLayer pattern (layer-manager.ts lines 160–183)
function disposeHeatmapGroup(energyGroup: THREE.Group): void {
  const old = energyGroup.getObjectByName("energy-heatmap");
  if (!old) return;
  old.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  energyGroup.remove(old);
}
```

---

### Three.js r183 vertex colors on PlaneGeometry — verified API

```typescript
// Three.js r183 — PlaneGeometry + BufferAttribute vertex colors (stable API since r100)
const geo = new THREE.PlaneGeometry(width, depth, 2, 2);
geo.rotateX(-Math.PI / 2);  // make horizontal
const colors = new Float32Array(geo.attributes.position.count * 3);
// fill colors[i*3], [i*3+1], [i*3+2] with R, G, B in [0,1]
geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
const mat = new THREE.MeshBasicMaterial({
  vertexColors: true,   // reads from geometry "color" attribute
  transparent: true,
  opacity: 0.55,
  side: THREE.DoubleSide,
  depthWrite: false,
});
```

`vertexColors: true` on `MeshBasicMaterial` reads the `"color"` BufferAttribute. This is the standard Three.js pattern and has not changed in recent major versions. Confidence: HIGH (Three.js r183 installed, API stable).

---

## Shader vs Vertex Color Performance

**Conclusion: Vertex colors on `MeshBasicMaterial` are correct for Phase 25. No shader needed.**

| Approach | Draw Calls | GPU Cost | Supports Per-Floor Gradient | Phase 25 Requirement |
|----------|-----------|----------|----------------------------|----------------------|
| `MeshBasicMaterial` + vertex color, one color per floor | 1 draw call per floor | Minimal — no lighting calculation | No (all vertices same color per floor) | Yes — EA-03 requires per-floor color, not spatial gradient within floor |
| Custom `ShaderMaterial` with scalar uniform | 1 draw call per floor | Low — minimal fragment shader | Yes (can interpolate perimeter vs center) | Overengineered for EA-03 |
| `MeshStandardMaterial` + vertex color | 1 draw call per floor | Medium — PBR lighting on overlay planes | No (same as MeshBasicMaterial) | Unnecessary — energy overlays don't need PBR |
| InstancedMesh + `setColorAt` on structure slab | 1 draw call total | Low, but full buffer re-upload | No (flat color per instance) | Explicitly forbidden — PITFALLS.md Pitfall 1 |

**Mobile GPU consideration (deferred to v5.x per REQUIREMENTS.md):** The deferred `ADV-01` requirement mentions sub-system heatmap filters. If sub-system-specific gradients within a single floor (e.g., "HVAC hot zone at perimeter") become a requirement, a `ShaderMaterial` with per-vertex scalar + `onBeforeCompile` injection would be the upgrade path. For Phase 25, `MeshBasicMaterial` + vertex colors is correct and performant on mobile GPUs because `MeshBasicMaterial` performs no lighting calculations in the fragment shader.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `setColorAt` on structural InstancedMesh | Separate `THREE.Mesh` per floor in energy-zones group | Design decision in PITFALLS.md v5.0 | Heatmap is decoupled from structure; correct disposal; no full-buffer re-upload |
| SAOPass post-processing | SAOPass disabled (comment in building-scene.tsx) | v4.0 (April 2026) | Heatmap overlay must not trigger AO; stays disabled |
| Single building total kWh metric | Per-floor kWh/m² array (Phase 23) | Phase 23 (planned) | Enables floor-level spatial heatmap |

---

## Open Questions

1. **Phase 23 `useEnergyBreakdown` output shape**
   - What we know: ARCHITECTURE.md specifies `perFloor: number[]` — kWh/m² per floor
   - What's unclear: Does `perFloor` include basement (`type === "below"`) floors or only above-ground? Phase 25's `buildEnergyHeatmap` filters to `aboveFloors` — this filter must match Phase 23's indexing convention
   - Recommendation: Define the `SystemBreakdown` interface in Phase 23 with an explicit doc comment: `perFloor: number[] // index 0 = first above-ground floor, excludes basements`

2. **Footprint polygon buildings (Phase 20+)**
   - What we know: `BuildingRecipe` has an optional `footprintPolygon?: [number, number][][]` for GIS-derived buildings (Phases 19–21). `PlaneGeometry` uses `footprintWidth × footprintDepth` bounding box
   - What's unclear: For irregular polygon footprints, a rectangular `PlaneGeometry` will overhang building edges visually
   - Recommendation: For Phase 25, use rectangular `PlaneGeometry` — it is consistent with how `structure-generator.ts` and `facade-generator.ts` currently handle floors. If polygon-accurate heatmap planes become a requirement, use `earcut` triangulation of `footprintPolygon` (already available in the project per Phase 20) as a v5.x enhancement

3. **`buildingPk` availability in `BuildingLayers`**
   - What we know: `BuildingLayers` currently does not receive `buildingPk` as a prop — it manages layer visibility only
   - What's unclear: To call `useEnergyBreakdown(pk)`, `BuildingLayers` needs the pk
   - Recommendation: Pass `buildingPk?: string` as an optional prop to `BuildingLayers`. When `undefined`, the heatmap `useEffect` is skipped. The parent component (`building-scene.tsx` or `ProceduralBuildingModel`) already holds the pk and can pass it down.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 25 is a pure code/Three.js change with no external services, CLIs, or databases. All required packages are already installed at verified versions.

---

## Validation Architecture

`workflow.nyquist_validation` key is absent from `.planning/config.json` — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Not detected — no `vitest.config.*`, `jest.config.*`, or `*.test.*` files found in project |
| Config file | None — Wave 0 gap |
| Quick run command | `pnpm test` (once configured) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EA-03 | `kwhmToColor(60)` returns blue-range color | unit | `pnpm test src/lib/layers/energy-heatmap-mesh.test.ts` | No — Wave 0 |
| EA-03 | `kwhmToColor(370)` returns red-range color | unit | `pnpm test src/lib/layers/energy-heatmap-mesh.test.ts` | No — Wave 0 |
| EA-03 | `buildEnergyHeatmap` returns group with N meshes for N above-ground floors | unit | `pnpm test src/lib/layers/energy-heatmap-mesh.test.ts` | No — Wave 0 |
| EA-03 | Heatmap geometry in `energy-zones` group, not `structure` group | unit | `pnpm test src/lib/layers/energy-heatmap-mesh.test.ts` | No — Wave 0 |
| EA-03 | Heatmap remains visible when structure layer hidden | manual | visual verification in browser | N/A |
| EA-03 | `renderer.info.memory.geometries` stable after 5 toggle cycles | manual | DevTools memory snapshot | N/A |

### Sampling Rate

- **Per task commit:** `pnpm build` (type-check; no test runner yet)
- **Per wave merge:** `pnpm build && pnpm lint`
- **Phase gate:** `pnpm build` green + manual visual verification before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/layers/energy-heatmap-mesh.test.ts` — covers `kwhmToColor` and `buildEnergyHeatmap` (unit, no Three.js renderer needed — test the color buffer values directly)
- [ ] Test runner setup (`vitest` or `jest`) — no test framework detected in project

---

## Sources

### Primary (HIGH confidence)

- Codebase: `src/lib/layers/layer-manager.ts` — `disposeLayer()` traversal pattern (lines 160–183), `getGroup("energy-zones")`, `setMepSubVisible`
- Codebase: `src/lib/energy/energy-grade.ts` — `GRADE_THRESHOLDS`, `GRADE_COLORS`, `getEnergyGrade()`, `getGradeColor()` — verified anchor values
- Codebase: `src/lib/procedural/types.ts` — `FloorSpec` shape: `{ floorNo, label, type: "above"|"below", y, height, isGroundFloor }`
- Codebase: `src/lib/layers/types.ts` — `ALL_LAYER_IDS` confirmed at 5 entries; `"energy-zones"` confirmed as valid `LayerId`
- Codebase: `src/components/viewer/building-layers.tsx` — `managerRef` pattern, `useEffect` for visibility sync, confirmed `energy-zones` group exists
- Codebase: `src/hooks/use-energy-metrics.ts` — cross-store subscription anti-infinite-loop pattern; confirmed `useMemo` with `[baseRecipe, overrides]` deps
- Codebase: `src/store/layer-store.ts` — confirmed `mepSubVisibility` slice already present; `persist` partializes correctly
- `.planning/research/ARCHITECTURE.md §2` — Energy Heatmap design: `buildEnergyHeatmap` signature, `MeshBasicMaterial` with vertex colors, targeted disposal pattern
- `.planning/research/PITFALLS.md Pitfall 1` — Explicit prohibition of `setColorAt` on structural InstancedMesh for heatmap use
- Three.js r183 installed package.json — confirmed version

### Secondary (MEDIUM confidence)

- `.planning/ROADMAP.md Phase 25` — Success criteria confirmed: separate meshes, color range, update on slider, structure-independent visibility
- `.planning/REQUIREMENTS.md EA-03` — "green-to-red gradient" requirement confirmed

### Tertiary (LOW confidence)

- Three.js forum references in PITFALLS.md (unverified directly in this session, but cited from previous PITFALLS research)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified against installed `package.json`
- Architecture: HIGH — all integration points verified in actual source files; ARCHITECTURE.md §2 provides the exact implementation contract
- Color mapping: HIGH — `energy-grade.ts` GRADE_THRESHOLDS and GRADE_COLORS verified in source
- Phase 23 dependency shape: MEDIUM — ARCHITECTURE.md specifies `perFloor: number[]` but hook not yet implemented; actual shape will be confirmed in Phase 23
- Pitfalls: HIGH — all pitfalls grounded in actual codebase patterns

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable Three.js APIs; energy-grade thresholds are law-anchored and change infrequently)
