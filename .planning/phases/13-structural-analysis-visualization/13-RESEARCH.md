# Phase 13: Structural Analysis Visualization - Research

**Researched:** 2026-03-28
**Domain:** Three.js layer generation, structural engineering visualization, KBC 2016 load tables
**Confidence:** HIGH

## Summary

Phase 13 adds a visual structural analysis overlay (Layer 15) to the existing 14-layer building systems framework. The implementation follows the well-established `LayerGenerator` pattern already used for Layers 1–14: a pure Three.js class that returns a `THREE.Group`, registered in `LayerManager`, toggled via `layer-store`, and animated via `useFrame` in `BuildingLayers`. No new architectural patterns are needed.

The unique aspects of this phase relative to earlier layers are: (1) stress color coding applied directly to `MeshStandardMaterial.color` rather than shader uniforms, (2) animated load path arrows built from `ConeGeometry + CylinderGeometry` with opacity pulsing via a `ShaderMaterial` or `useFrame` uniform update, (3) a `drei Html` tooltip component requiring an R3F wrapper component (not pure Three.js), and (4) load calculations derived from `BuildingRecipe` fields using KBC 2016 constants stored in a new `src/lib/structural-codes.ts`.

The tooltip requirement is the most architecturally important decision: since `LayerGenerator.generate()` returns a pure `THREE.Group` with no React context, the hover tooltip must live in an R3F component wrapper (similar to `element-selector.tsx` pattern using `THREE.Raycaster`). The structural layer generator itself stays pure Three.js; a separate `StructuralTooltip` R3F component handles hover detection and renders the `Html` tooltip.

**Primary recommendation:** Follow the Layer 14 (MicrogridLayer) pattern exactly — pure Three.js generator + `ShaderMaterial` with `uTime` for animation. Add a companion R3F component `StructuralTooltip` for hover/tooltip using the `useThree().raycaster` pattern from `annotation-tools.tsx`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Load Calculation Model**
- Driven by existing BuildingRecipe data (floor count, footprint, floor height, material properties)
- Korean standard dead loads by floor type: Residential 5.0 kN/m², Office 6.0 kN/m², mapped from structure code
- Live loads per KBC 2016: Residential 2.0 kN/m², Office 2.5 kN/m², Retail 4.0 kN/m², Roof 1.0 kN/m²
- Column tributary area: simple grid division (total floor area / column count)

**Visualization Style**
- Load path arrows: animated Three.js arrows (ConeGeometry + CylinderGeometry), size proportional to load magnitude
- Arrow animation: slow pulse (2s cycle), opacity 0.3→1.0 via useFrame, conveying downward flow
- Stress color gradient: Green (#22c55e) < 60% capacity, Yellow (#eab308) 60-85%, Red (#ef4444) > 85%
- Stress colors applied to column/beam meshes via MeshStandardMaterial color property
- Member sizing display: drei Html tooltip on hover showing recommended dimensions (e.g. "400x400mm column")

**Layer Integration**
- Layer 15 in the existing layer system (extends from current 14 max)
- Toggle independent of other layers — any combination supported
- Korean structural code references: KBC 2016 + Korean Concrete Design Code for column sizing tables
- Sizing data stored as constants in src/lib/structural-codes.ts
- 3D perspective only — no plan view variant

### Claude's Discretion
- Arrow geometry proportional sizing formula
- Exact column capacity calculation method
- Tooltip positioning and styling details
- Layer 15 color and label in LayerPanel

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STRUCT-01 | Display load path arrows from roof through columns to foundation | ConeGeometry + CylinderGeometry arrows per column grid position, animated with ShaderMaterial uTime opacity pulse |
| STRUCT-02 | Color-code structural members by stress level (green→yellow→red) | MeshStandardMaterial.color set per-instance based on load ratio; InstancedMesh requires per-instance color via setColorAt() |
| STRUCT-03 | Show structural member sizing recommendations based on span and load | drei Html tooltip with THREE.Raycaster hover detection in R3F wrapper component; KBC 2016 tables in structural-codes.ts |
| STRUCT-04 | Toggle structural analysis overlay on/off independently | Layer 15 extension to LayerId type + layer-store + LayerManager + LayerPanel |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| three | ^0.183.2 | ConeGeometry, CylinderGeometry, InstancedMesh, MeshStandardMaterial | Already in project; all geometry primitives available |
| @react-three/fiber | ^9.5.0 | useFrame (animation), useThree (raycaster) | Already used for all layer animation |
| @react-three/drei | ^10.7.7 | Html (tooltip overlay) | Already used in wall-drawer.tsx for measurement tooltips |
| zustand | ^5.0.12 | layer-store extension to LayerId 15 | Established store pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^4.1.2 | Unit tests for structural-codes.ts calculation functions | Tests for load calc and column sizing logic |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| MeshStandardMaterial per-instance color (setColorAt) | ShaderMaterial with stress uniform | setColorAt is simpler and correct for static stress display; ShaderMaterial needed only if stress animates |
| drei Html tooltip | CSS2DObject / THREE.Sprite | Html already in project (wall-drawer.tsx), easiest integration with Tailwind styling |
| Separate R3F tooltip component | Embedding R3F hooks in generator | LayerGenerator must be pure Three.js (established pattern); hooks forbidden outside React components |

**Installation:** No new packages required. All dependencies already present.

---

## Architecture Patterns

### Recommended Project Structure

```
src/lib/
├── layers/
│   ├── types.ts              -- extend LayerId to 1|2|...|15, add layer 15 config
│   ├── layer-manager.ts      -- register StructuralAnalysisLayer for id 15
│   └── layer-15-structural.ts   -- NEW: pure Three.js LayerGenerator
├── structural-codes.ts          -- NEW: KBC 2016 dead/live loads, column sizing tables
store/
└── layer-store.ts            -- extend defaultVisibility/generated/density to include 15
src/components/viewer/
├── building-layers.tsx       -- extend ALL_LAYER_IDS loop (auto-handled if types.ts updated)
├── layer-panel.tsx           -- renders from LAYER_CONFIGS automatically (auto-handled)
└── structural-tooltip.tsx    -- NEW: R3F component for hover + Html tooltip
```

### Pattern 1: LayerGenerator Implementation (established)
**What:** Pure Three.js class implementing `LayerGenerator` interface, returns `THREE.Group`
**When to use:** All layer 15 geometry — arrows, colored columns, foundation markers
**Example:**
```typescript
// Pattern from layer-14-microgrid.ts
export class StructuralAnalysisLayer implements LayerGenerator {
  private group: THREE.Group | null = null;

  generate(recipe: BuildingRecipe, density = 1.0): THREE.Group {
    this.dispose();
    const group = new THREE.Group();
    group.name = "layer-15-structural";
    // ... build geometry
    this.group = group;
    return group;
  }

  dispose(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    this.group = null;
  }
}
```

### Pattern 2: InstancedMesh Per-Instance Color (STRUCT-02)
**What:** `InstancedMesh.setColorAt(index, color)` applies per-instance color; requires `instanceColor.needsUpdate = true`
**When to use:** Stress color coding on column instances — each column gets green/yellow/red based on load ratio
**Critical note:** InstancedMesh requires `instanceColor.needsUpdate = true` after `setColorAt`, same as `instanceMatrix.needsUpdate = true` for transforms.

```typescript
// Source: Three.js InstancedMesh documentation
const im = new THREE.InstancedMesh(geo, mat, count);
const color = new THREE.Color();

for (let i = 0; i < count; i++) {
  const ratio = columnLoads[i] / columnCapacity[i];
  if (ratio < 0.6) color.set(0x22c55e);       // green — safe
  else if (ratio < 0.85) color.set(0xeab308); // yellow — moderate
  else color.set(0xef4444);                    // red — over-stressed

  im.setColorAt(i, color);
}
im.instanceColor!.needsUpdate = true;
```

### Pattern 3: Animated Arrow (STRUCT-01)
**What:** CylinderGeometry (shaft) + ConeGeometry (head), combined in a THREE.Group per arrow, animated via ShaderMaterial uTime for opacity pulse
**When to use:** Load path arrows, one arrow per column position per floor
**Sizing formula (Claude's discretion):** Arrow height proportional to floor load magnitude; scale range 0.3–1.5 units mapped from min–max load

```typescript
// Arrow geometry: shaft (cylinder) + head (cone)
const shaftGeo = new THREE.CylinderGeometry(0.05, 0.05, height * 0.7, 6);
const headGeo = new THREE.CylinderGeometry(0, 0.12, height * 0.3, 8);

// Pulse animation via ShaderMaterial uTime
const arrowMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xffffff) } },
  vertexShader: `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uColor;
    void main() {
      float pulse = 0.3 + 0.7 * (0.5 + 0.5 * sin(uTime * 3.14159)); // 2s cycle = PI per second
      gl_FragColor = vec4(uColor, pulse);
    }
  `,
  transparent: true,
  depthWrite: false,
});
```

Note: The `updateAnimations()` in `LayerManager` already traverses all groups and updates `mat.uniforms.uTime.value` for any `ShaderMaterial` with `uTime`. Layer 15 arrows get animation for free if they use this pattern.

### Pattern 4: Hover Tooltip (STRUCT-03)
**What:** Separate R3F component `StructuralTooltip` using `useThree().raycaster` for hit detection, `drei Html` for overlay rendering
**When to use:** Hover over structural member meshes to show sizing recommendation
**Architecture reasoning:** `LayerGenerator` is pure Three.js (no React hooks). Tooltip requires `useThree()` (R3F hook) and `Html` (R3F component). These must live in a separate R3F component mounted in `building-scene.tsx` — same pattern as `annotation-tools.tsx` which also does raycaster hit detection against scene objects.

```typescript
// src/components/viewer/structural-tooltip.tsx
"use client";
import { useState, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useLayerStore } from "@/store/layer-store";

export function StructuralTooltip() {
  const isVisible = useLayerStore((s) => s.visibility[15]);
  const { scene, camera, gl } = useThree();
  const [hovered, setHovered] = useState<{
    position: THREE.Vector3;
    label: string;
  } | null>(null);
  const mouse = useRef(new THREE.Vector2());

  // pointer move updates mouse
  // useFrame: raycaster.setFromCamera(mouse, camera), intersect layer-15 group
  // on hit: setHovered({ position, label from userData.sizingLabel })
  // on miss: setHovered(null)

  if (!isVisible || !hovered) return null;

  return (
    <Html position={hovered.position} center style={{ pointerEvents: "none" }}>
      <div className="rounded px-2 py-1 text-xs bg-zinc-900 text-white shadow-lg whitespace-nowrap">
        {hovered.label}
      </div>
    </Html>
  );
}
```

Each column mesh in the structural generator sets `userData.sizingLabel = "400×400mm RC column"` (or equivalent) so the tooltip component can read it without needing to re-run load calculations.

### Pattern 5: LayerId Extension
**What:** Extend `LayerId` union type from `1|2|...|14` to include `15`
**When to use:** Required in 4 files: `types.ts` (LayerId, ALL_LAYER_IDS, LAYER_CONFIGS), `layer-store.ts` (defaultVisibility/generated/density), `layer-manager.ts` (register StructuralAnalysisLayer), and `layer-panel.tsx` renders automatically from LAYER_CONFIGS.

**Critical:** `layer-store.ts` hard-codes default records `{ 1: true, 2: false, ... 14: false }`. Adding 15 to the `LayerId` type without adding it to all three default record literals will cause TypeScript type errors.

### Anti-Patterns to Avoid
- **Calling React hooks in LayerGenerator:** `generate()` is called outside React render context. Never use `useState`, `useRef`, or `useFrame` inside a generator.
- **Forgetting `instanceColor.needsUpdate = true`:** Without this, per-instance colors won't render. Same requirement as `instanceMatrix.needsUpdate = true`.
- **InstancedMesh with count=0:** `Math.max(1, count)` guard is required (see existing `generateColumns()` pattern).
- **Arrow ShaderMaterial without `depthWrite: false`:** Transparent objects with depthWrite=true cause Z-fighting with other scene elements.
- **Mounting StructuralTooltip outside Canvas:** `useThree()` and `Html` only work inside the R3F Canvas. Must be mounted inside `<Canvas>` in building-scene.tsx.
- **3D-only layer rendered in plan view:** CONTEXT.md explicitly specifies "3D perspective only — no plan view variant." The layer generator should check if this matters or the toggle should be disabled in plan mode.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Animation timing | Manual `Date.now()` timing | `ShaderMaterial` with `uTime` uniform updated by `LayerManager.updateAnimations()` | Already wired up; free animation for any layer-15 ShaderMaterial |
| Opacity pulse | requestAnimationFrame loop | `ShaderMaterial.uniforms.uTime` + GLSL `sin()` | Consistent with all animated layers in project |
| Per-instance colors | Custom vertex color attributes | `InstancedMesh.setColorAt()` + `instanceColor.needsUpdate` | Native Three.js API; already used in project |
| Tooltip DOM element | `document.createElement` + scene overlay | `drei Html` component | Already used in wall-drawer.tsx; proper R3F lifecycle |
| Hover detection | DOM mouseover events | `THREE.Raycaster` + `useThree()` | Scene-space hit detection; pattern already in annotation-tools.tsx |
| Load tables | Runtime computation from first principles | Constants in `structural-codes.ts` | Correctness guaranteed; unit testable; KBC 2016 values are fixed |

**Key insight:** The animation infrastructure is completely free — `LayerManager.updateAnimations()` traverses all groups every frame and pushes elapsed time to any `ShaderMaterial.uniforms.uTime`. Layer 15 just needs to use ShaderMaterial.

---

## Common Pitfalls

### Pitfall 1: InstancedMesh Color Initialization
**What goes wrong:** `setColorAt()` has no effect; all columns appear white/gray.
**Why it happens:** `instanceColor` buffer is not initialized until the first `setColorAt()` call. Calling `instanceColor.needsUpdate = true` before any `setColorAt()` causes a null reference error.
**How to avoid:** Always call `setColorAt()` for every instance before setting `needsUpdate = true`. Never skip instances.
**Warning signs:** TypeScript error `Cannot read property 'needsUpdate' of null` or uniform gray columns despite load calculations.

### Pitfall 2: Column Count Mismatch
**What goes wrong:** Arrow count or colored column count doesn't match the actual columns in the main building model.
**Why it happens:** `StructuralAnalysisLayer` recalculates column positions independently from `generateColumns()` in `structure-generator.ts`. Both use the same formula (column grid from recipe.column.spacing + recipe.column.inset), but if there's a drift the arrows won't align with columns.
**How to avoid:** Extract the column position calculation into a shared helper function (e.g., `getColumnPositions(recipe)`) exported from `structure-generator.ts` or a new `structural-codes.ts`, imported by both.
**Warning signs:** Arrows appear offset from visible columns; stress colors on "ghost" positions.

### Pitfall 3: Tooltip Not Appearing in Plan View
**What goes wrong:** `StructuralTooltip` mounted unconditionally shows tooltip labels even when plan view is active (where layer 15 is invisible).
**Why it happens:** Layer visibility check in `StructuralTooltip` only checks `useLayerStore` visibility, not `usePlanStore` view mode.
**How to avoid:** In `StructuralTooltip`, also check `usePlanStore(s => s.viewMode !== 'plan')` before enabling raycaster.
**Warning signs:** Tooltip shows "400×400mm column" label floating in 2D plan mode.

### Pitfall 4: LayerId Type Not Updated in All Locations
**What goes wrong:** TypeScript compiles but store returns `undefined` for layer 15 at runtime.
**Why it happens:** `layer-store.ts` has three hard-coded record literals (`defaultVisibility`, `defaultGenerated`, `defaultDensity`) that only cover 1–14. TypeScript `Record<LayerId, boolean>` becomes an error if LayerId includes 15 but the literal doesn't.
**How to avoid:** Update all three default record literals in layer-store.ts and ALL_LAYER_IDS array in types.ts simultaneously.
**Warning signs:** `visibility[15]` returns `undefined`; TypeScript error "Property '15' is missing in type".

### Pitfall 5: ShaderMaterial Arrow Missing `transparent: true`
**What goes wrong:** Arrow opacity pulse has no visible effect; arrows appear fully opaque or invisible.
**Why it happens:** Three.js ignores alpha in `gl_FragColor` unless `material.transparent = true`.
**How to avoid:** Always set `transparent: true` and `depthWrite: false` on arrow ShaderMaterial.
**Warning signs:** Arrows always fully opaque regardless of `uTime`.

### Pitfall 6: Html Tooltip Renders Behind 3D Scene
**What goes wrong:** Tooltip div appears but is occluded by the canvas element.
**Why it happens:** `drei Html` renders into a portal div appended to the DOM. If z-index is not managed, canvas `pointer-events` can block it.
**How to avoid:** Pass `style={{ pointerEvents: "none", zIndex: 100 }}` to `Html` wrapper div. Use `occlude={false}` if tooltip should always show regardless of geometry occlusion.
**Warning signs:** Tooltip appears in DOM (inspect element) but not visible on screen.

---

## Code Examples

Verified patterns from project codebase:

### Column Position Helper (prevents Pitfall 2)
```typescript
// src/lib/structural-codes.ts — extract shared function
export function getColumnPositions(recipe: BuildingRecipe): { x: number; z: number }[] {
  const { footprintWidth, footprintDepth, column } = recipe;
  const margin = column.inset;
  const innerW = footprintWidth - margin * 2;
  const innerD = footprintDepth - margin * 2;
  const positions: { x: number; z: number }[] = [];

  if (innerW >= column.spacing && innerD >= column.spacing) {
    const colsX = Math.max(2, Math.round(innerW / column.spacing) + 1);
    const colsZ = Math.max(2, Math.round(innerD / column.spacing) + 1);
    const spacingX = colsX > 1 ? innerW / (colsX - 1) : 0;
    const spacingZ = colsZ > 1 ? innerD / (colsZ - 1) : 0;

    for (let ix = 0; ix < colsX; ix++) {
      for (let iz = 0; iz < colsZ; iz++) {
        positions.push({
          x: colsX > 1 ? -innerW / 2 + ix * spacingX : 0,
          z: colsZ > 1 ? -innerD / 2 + iz * spacingZ : 0,
        });
      }
    }
  }
  return positions;
}
```

### Load Calculation (STRUCT-01, STRUCT-02)
```typescript
// src/lib/structural-codes.ts
export const KBC_2016_DEAD_LOADS: Record<string, number> = {
  "01000": 5.0, // Residential (kN/m²)
  "02000": 5.0, // Apartment
  "14000": 6.0, // Office
  "10000": 6.0, // Retail
  "default": 5.0,
};

export const KBC_2016_LIVE_LOADS: Record<string, number> = {
  "01000": 2.0, // Residential
  "02000": 2.0, // Apartment
  "14000": 2.5, // Office
  "10000": 4.0, // Retail
  "roof": 1.0,
  "default": 2.0,
};

export function calcColumnLoad(
  recipe: BuildingRecipe,
  columnCount: number
): number[] {
  // Returns per-column cumulative load (kN) from roof down to each floor
  const floorArea = recipe.footprintWidth * recipe.footprintDepth;
  const tributaryArea = floorArea / Math.max(1, columnCount);
  const deadLoad = KBC_2016_DEAD_LOADS[recipe.mainPurpsCd] ?? KBC_2016_DEAD_LOADS.default;
  const liveLoad = KBC_2016_LIVE_LOADS[recipe.mainPurpsCd] ?? KBC_2016_LIVE_LOADS.default;
  const floorLoad = (deadLoad + liveLoad) * tributaryArea; // kN per floor per column

  const aboveFloors = recipe.floors.filter(f => f.type === "above");
  // Cumulative load increases from roof to ground
  return aboveFloors.map((_, idx) => floorLoad * (aboveFloors.length - idx));
}
```

### Column Capacity (Claude's discretion — concrete column)
```typescript
// Simplified: f'c = 25 MPa (KBC standard), axial capacity P = 0.8 * f'c * Ag
// Ag = section area (mm²). Column size from recipe.column.size (meters)
export function calcColumnCapacity(recipe: BuildingRecipe): number {
  const sizeMm = recipe.column.size * 1000; // meters → mm
  const Ag = sizeMm * sizeMm; // mm²
  const fc = 25; // MPa (KBC 2016 standard concrete)
  // KBC 2016: Pu = 0.65 * 0.80 * (0.85 * fc * Ag) in N → kN
  return 0.65 * 0.80 * 0.85 * fc * Ag / 1000; // kN
}
```

### InstancedMesh with Per-Instance Color
```typescript
// Stress color application pattern
const im = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
const stressColor = new THREE.Color();

for (let i = 0; i < count; i++) {
  const ratio = columnLoads[i] / columnCapacity;
  if (ratio < 0.6) stressColor.set(0x22c55e);
  else if (ratio < 0.85) stressColor.set(0xeab308);
  else stressColor.set(0xef4444);
  im.setColorAt(i, stressColor);
  // setMatrixAt call here too
}
im.instanceMatrix.needsUpdate = true;
im.instanceColor!.needsUpdate = true; // REQUIRED after setColorAt
```

### Html Tooltip in R3F (from wall-drawer.tsx pattern)
```typescript
// Existing working pattern in project:
<Html position={tooltipPos} center style={{ pointerEvents: "none" }}>
  <div className="rounded px-2 py-0.5 text-xs font-mono shadow-md whitespace-nowrap bg-zinc-800 text-white">
    400×400mm column | Load: 280 kN | 72% capacity
  </div>
</Html>
```

### Column Sizing Lookup Table (STRUCT-03)
```typescript
// KBC 2016 + Korean Concrete Design Code simplified sizing guide
// span = column spacing (m), totalLoad = cumulative kN
export const KBC_COLUMN_SIZING: { maxLoad: number; minSpan: number; dimension: number }[] = [
  { maxLoad: 200,  minSpan: 0,   dimension: 300 }, // 300×300mm up to 200 kN
  { maxLoad: 500,  minSpan: 0,   dimension: 400 }, // 400×400mm up to 500 kN
  { maxLoad: 1000, minSpan: 0,   dimension: 500 }, // 500×500mm up to 1000 kN
  { maxLoad: 2000, minSpan: 0,   dimension: 600 }, // 600×600mm up to 2000 kN
  { maxLoad: Infinity, minSpan: 0, dimension: 700 }, // 700×700mm for heavy loads
];

export function getRecommendedColumnSize(loadKN: number): string {
  const entry = KBC_COLUMN_SIZING.find(e => loadKN <= e.maxLoad) ?? KBC_COLUMN_SIZING.at(-1)!;
  return `${entry.dimension}×${entry.dimension}mm RC column`;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CSS2DRenderer for labels | drei Html (portal-based) | drei v8+ | Html handles z-index and lifecycle automatically within R3F Canvas |
| Per-vertex color attribute | InstancedMesh.setColorAt() | Three.js r128+ | Native API, no custom BufferAttribute needed |
| Separate THREE.ArrowHelper | Manual ConeGeometry + CylinderGeometry | Established | ArrowHelper is non-instanced; manual allows InstancedMesh for performance |

**Deprecated/outdated:**
- `THREE.ArrowHelper`: Not suitable for instanced rendering. Manual ConeGeometry + CylinderGeometry in a Group is the correct approach for animated arrows in this project.
- `CSS2DRenderer`: Not used anywhere in the project. drei Html is the standard.

---

## Open Questions

1. **Plan view suppression**
   - What we know: CONTEXT.md says "3D perspective only — no plan view variant"
   - What's unclear: Should the layer 15 toggle button be disabled/hidden in plan view, or should the layer simply not render anything?
   - Recommendation: Check `usePlanStore.viewMode` in `StructuralTooltip` and optionally add a guard in the generator. Simplest: layer generates but tooltip disabled in plan mode. Visual: arrows are 3D objects that appear as dots in plan view — acceptable for an engineering layer.

2. **Arrow InstancedMesh vs individual Meshes**
   - What we know: A 10-floor building with 3×4 column grid = 120 arrow sets (240 meshes). Each arrow has shaft + cone.
   - What's unclear: Whether to use InstancedMesh for shafts and cones separately, or individual Mesh per arrow.
   - Recommendation: For a building with up to 30 columns × 20 floors = 600 arrows max, individual Meshes grouped per-floor are simpler and performant enough. InstancedMesh adds complexity for per-instance sizing (requires setMatrixAt per instance) — viable but not required at this scale. Use individual Meshes, grouped into a `THREE.Group` per floor, lazy-generated.

3. **userData.sizingLabel string format**
   - What we know: Tooltip shows "400x400mm column" per CONTEXT.md
   - What's unclear: Whether to show load stats in tooltip (e.g., "280 kN / 72% capacity") or just sizing
   - Recommendation: Include both for GX team engineering value: `"400×400mm column | 280 kN | 72% cap."` This is Claude's discretion per CONTEXT.md.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 13 is purely code changes with no external dependencies beyond the existing project stack. All required libraries (Three.js, R3F, drei, Zustand) are already installed and verified.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.2 |
| Config file | vitest.config.ts (root) |
| Quick run command | `pnpm vitest run src/lib/structural-codes` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STRUCT-01 | Load path arrows generated for each column position per floor | unit | `pnpm vitest run src/lib/layers/__tests__/layer-15-structural.test.ts` | ❌ Wave 0 |
| STRUCT-02 | Stress colors: green <60%, yellow 60–85%, red >85% | unit | `pnpm vitest run src/lib/__tests__/structural-codes.test.ts` | ❌ Wave 0 |
| STRUCT-03 | Column sizing lookup returns correct KBC 2016 dimensions | unit | `pnpm vitest run src/lib/__tests__/structural-codes.test.ts` | ❌ Wave 0 |
| STRUCT-04 | Layer 15 visible in layer-store after toggle | unit | `pnpm vitest run src/store/__tests__/layer-store.test.ts` | ✅ (extends existing) |

### Sampling Rate
- **Per task commit:** `pnpm vitest run src/lib/__tests__/structural-codes.test.ts`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/__tests__/structural-codes.test.ts` — covers STRUCT-02 + STRUCT-03 (calcColumnLoad, calcColumnCapacity, getRecommendedColumnSize, stress threshold logic)
- [ ] `src/lib/layers/__tests__/layer-15-structural.test.ts` — covers STRUCT-01 (generator returns Group with correct child count for a known recipe)
- [ ] `src/store/__tests__/layer-store.test.ts` — needs update: extend "all 14 layers" assertion to 15, verify layer 15 defaults

---

## Project Constraints (from CLAUDE.md)

All actionable directives that affect Phase 13:

- **Next.js 16 App Router + React 19**: "use client" directive required on all store/hook files. Read `node_modules/next/dist/docs/` before writing Next.js-specific code.
- **Three.js viewer**: Import SAOPass from `three/examples/jsm/postprocessing/SAOPass.js` (not @react-three/postprocessing).
- **InstancedMesh**: `setMatrixAt` must be followed by `instanceMatrix.needsUpdate = true`. Same for `setColorAt` → `instanceColor.needsUpdate = true`.
- **MeshStandardMaterial**: Use for all components (not MeshPhysicalMaterial or MeshBasicMaterial).
- **drei OrbitControls**: Use `any` ref type (three-stdlib type conflict).
- **Zustand + SSR**: Use `useHydration()` hook before reading store in render.
- **pnpm build**: Run after implementation to verify no TypeScript errors (critical for LayerId union type extension).
- **No custom solutions**: Don't build hover detection from scratch — use `THREE.Raycaster` from `useThree()` (same pattern as annotation-tools.tsx and element-selector.tsx).

---

## Sources

### Primary (HIGH confidence)
- Project codebase direct inspection — `src/lib/layers/layer-14-microgrid.ts`, `src/lib/layers/types.ts`, `src/lib/layers/layer-manager.ts`, `src/store/layer-store.ts`, `src/components/viewer/building-layers.tsx`
- `src/components/viewer/wall-drawer.tsx` — `drei Html` usage pattern (verified working)
- `src/components/viewer/annotation-tools.tsx` — `THREE.Raycaster` + `useThree()` pattern (verified working)
- `src/lib/procedural/structure-generator.ts` — exact column position algorithm (source of truth for arrow alignment)
- `node_modules/@react-three/drei/web/Html.d.ts` — `Html` component props interface (verified)
- `src/store/__tests__/layer-store.test.ts` — test pattern for layer store extension

### Secondary (MEDIUM confidence)
- KBC 2016 load values (Residential 5.0/2.0, Office 6.0/2.5 kN/m²) — consistent with CONTEXT.md locked decisions and Korean structural engineering practice

### Tertiary (LOW confidence — flag for validation)
- Simplified column capacity formula: `Pu = 0.65 × 0.80 × (0.85 × f'c × Ag)` — standard RC column formula, but actual KBC Korean Concrete Design Code table values should be verified if precise engineering accuracy is required. For the GX team's visualization purposes (not structural certification), this approximation is acceptable.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in node_modules, versions from package.json
- Architecture patterns: HIGH — derived directly from 14 existing layers in codebase
- Layer integration: HIGH — exact LayerId extension pattern is identical for any new layer
- Pitfalls: HIGH — derived from actual code review (InstancedMesh gotchas, tooltip mounting, plan view guard)
- KBC 2016 load values: MEDIUM — values match CONTEXT.md locked decisions; canonical source is the actual KBC 2016 document (not independently verified here)
- Column capacity formula: LOW — simplified engineering approximation acceptable for visualization

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable stack; Three.js/drei patch updates don't affect layer patterns)
