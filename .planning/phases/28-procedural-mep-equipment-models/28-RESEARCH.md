# Phase 28: Procedural 3D Models for MEP Equipment — Research

**Researched:** 2026-04-12
**Domain:** Three.js procedural geometry, MEP equipment visualization, InstancedMesh patterns
**Confidence:** HIGH (all findings verified against actual codebase files)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EQUIP-01 | Each piece of MEP equipment (기계설비) renders as a distinct, recognizable procedural 3D model with configurable parameters (size, count, spacing, LOD) that update in real time | Layer generators layer-3 through layer-7 all need equipment body upgrades; InstancedMesh pattern established in layer-5 and layer-7; config store pattern established in material-store + systems-tab |

</phase_requirements>

---

## Summary

Phase 28 adds visually distinct procedural 3D models for each MEP equipment sub-type. The existing layer generators already produce placeholder geometry for equipment (AHU boxes in layer-5, boiler box in layer-4, tank cylinders in layer-6, fixture boxes in layer-7, panel boxes in layer-7) but these are simple, undifferentiated boxes and cylinders with no silhouette variety. The goal is to replace those placeholder geometries with multi-primitive assemblies that are instantly recognizable by shape — an AHU looks like an AHU, a chiller looks like a chiller — without adding photorealistic detail.

The existing infrastructure is strong: InstancedMesh is already used in layer-5 (AHU boxes), layer-7 (fixtures, sensors, panels), and layer-1 (columns). The `userData.type` tagging convention is consistent across all generators and already drives Phase 26 click selection. The `LayerGenerator` interface (`generate(recipe, density)`) is the correct extension point — no architectural changes are needed at the LayerManager level.

The biggest upgrade need is in layer-3-cooling (chiller plant is a plain box) and layer-4-heating (boiler is a plain box), which represent the most visually distinct equipment in the MEP world. Layer-5-ventilation AHU boxes are already instanced but need duct stubs and fan housings to be recognizable. Layer-6-dhw tank cylinders are already good silhouettes; they need pipe stubs added. Layer-7-lighting fixtures are flat boxes that need panel faces. The new work is entirely within the layer generator files — no changes to LayerManager, mep-coordinator, building-layers, or the store are needed.

**Primary recommendation:** Add a dedicated `mep-equipment-params` config slice to an equipment-store (or extend recipe-store overrides), then upgrade each affected generator to read those params and build multi-primitive InstancedMesh assemblies. Keep total draw calls under 10 per sub-layer by instancing all same-geometry equipment across floors as a single InstancedMesh.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| three | ^0.183.2 | All geometry, InstancedMesh, BufferGeometry | Already in use; no alternative |
| @react-three/fiber | ^9.5.0 | R3F canvas — BuildingLayers is a `<primitive>` wrapper | Already in use |
| zustand | ^5.0.12 | Equipment params config store | Already used for material-store, recipe-store, layer-store |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| three (CylinderGeometry) | — | Chiller, DHW tank, pump housing, boiler body | Vertical axis equipment with cylindrical silhouette |
| three (BoxGeometry) | — | AHU body, electrical panel, fan coil cassette, VRF head | Rectangular box equipment |
| three (TorusGeometry) | — | Circular fan face on AHU, cooling tower fan ring | Fan grille silhouette element |
| three (ConeGeometry) | — | Boiler flue stack tip, pump volute | Tapered termination details |
| three (InstancedMesh) | — | Multiple identical equipment units across floors | Single draw call for N instances |
| three (MergeGeometries from BufferGeometryUtils) | — | Combining primitives into one geometry per equipment assembly | Reduces draw calls when instancing composite shapes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Multi-primitive InstancedMesh | Separate Mesh per sub-component | Separate meshes give independent click selection but cost 3–5x draw calls; not worth it for sub-components |
| MergeGeometries | Group of Meshes | Group approach is simpler to write but violates the <10 draw calls constraint for instanced equipment arrays |
| New equipment-store slice | Extending RecipeOverrides | RecipeOverrides is in procedural/types.ts (building geometry); equipment is a separate concern — cleaner to keep separate |

**Installation:** No new packages needed — all geometry types are in the existing `three` import.

---

## Architecture Patterns

### Recommended Project Structure
```
src/lib/layers/
├── layer-3-cooling.ts        # Upgrade: chiller + cooling tower equipment models
├── layer-4-heating.ts        # Upgrade: boiler + VRF head + fan coil models
├── layer-5-ventilation.ts    # Upgrade: AHU body with duct stubs + fan face
├── layer-6-dhw.ts            # Upgrade: tank with pipe stubs + pump housing
├── layer-7-lighting.ts       # Upgrade: fixture panel face + electrical cabinet
├── mep-equipment-params.ts   # NEW: EquipmentParams type + defaults per sub-type
└── mep-coordinator.ts        # UNCHANGED

src/store/
└── equipment-store.ts        # NEW: Zustand store for per-equipment procedural params

src/components/viewer/config-tabs/
└── equipment-tab.tsx         # NEW: SliderRow controls per equipment type
```

### Pattern 1: Multi-Primitive Merged Geometry for InstancedMesh

**What:** Combine 2–4 BoxGeometry/CylinderGeometry primitives with `BufferGeometryUtils.mergeGeometries()` into one merged geometry, then wrap in a single InstancedMesh. Each floor's equipment becomes one instance.

**When to use:** Equipment bodies composed of a main unit + subordinate features (AHU box + duct stub + fan housing; boiler cylinder + flue stack + pipe stub). Instancing the merged geometry gives 1 draw call for all N floors' worth of that equipment type.

**Example — AHU merged geometry:**
```typescript
// Source: verified against three.js 0.183 BufferGeometryUtils API in codebase
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function buildAhuGeometry(params: AhuParams): THREE.BufferGeometry {
  // Main body
  const body = new THREE.BoxGeometry(params.width, params.height, params.depth);
  // Duct stub on one face — offset to align with body edge
  const ductStub = new THREE.BoxGeometry(
    params.ductW, params.ductH, params.ductDepth
  );
  ductStub.translate(0, 0, params.depth / 2 + params.ductDepth / 2);
  // Fan housing circle on front face
  const fanRing = new THREE.TorusGeometry(
    params.fanRadius, params.fanTubeR, 8, 16
  );
  fanRing.rotateX(Math.PI / 2);
  fanRing.translate(0, 0, -params.depth / 2);

  return mergeGeometries([body, ductStub, fanRing]);
}

// One InstancedMesh for all AHU instances (one per floor)
const ahuIM = new THREE.InstancedMesh(
  buildAhuGeometry(params),
  ahuMat,
  aboveFloors.length
);
ahuIM.userData = { type: "vent-ahu" };  // preserves Phase 26 click selection
```

### Pattern 2: Equipment Params as Plain Config Object Passed to Generator

**What:** Each generator's `generate()` method accepts an optional `EquipmentParams` argument (or reads from a module-level config). The params are pure data — no React, no store reads inside the generator.

**When to use:** All upgraded generators. The store (or config panel) produces the params object, passes it to the generator at rebuild time. This keeps generators as pure Three.js functions, consistent with existing pattern.

**Example — generator signature extension:**
```typescript
// Consistent with existing LayerGenerator interface — density param already present
export interface VentilationEquipmentParams {
  ahuWidth: number;      // default 1.2
  ahuHeight: number;     // default 0.8
  ahuDepth: number;      // default 0.8
  showDuctStubs: boolean; // default true
  showFanFace: boolean;   // default true
  count: number;         // AHUs per floor (default 1 at core)
  spacing: number;       // spacing when count > 1
}

// Generator receives params as third argument (density stays as second for back-compat)
generate(recipe: BuildingRecipe, density?: number, equipParams?: VentilationEquipmentParams): THREE.Group
```

### Pattern 3: userData.type Preservation for Phase 26 Click Selection

**What:** Every mesh in the upgraded generators MUST preserve its existing `userData.type` string (e.g., `"vent-ahu"`, `"heating-boiler"`, `"dhw-storage-tank"`) so that Phase 26 `inferEquipmentSpecs()` dispatch continues working.

**When to use:** Always — this is a hard constraint from Phase 26 dependency.

The `inferEquipmentSpecs()` prefix dispatch table in `equipment-specs.ts` maps:
- `cooling-*` → HVAC cooling spec
- `heating-*` → HVAC heating spec  
- `vent-*` → ventilation spec
- `dhw-*` → DHW spec
- `lighting-*` → lighting spec
- `shell-*` → electrical panel spec

New sub-type userData strings must use these same prefixes. Any new equipment type added (e.g., `"cooling-tower"`, `"heating-vrf-head"`) will match the existing prefix dispatch.

### Anti-Patterns to Avoid

- **Creating a separate Mesh per sub-component per floor:** Generates O(floors × components) draw calls. Use mergeGeometries + InstancedMesh instead.
- **Calling `mergeGeometries` inside `generate()` every animation frame:** Merge once during generation, not on every rebuild. Geometry is immutable in Three.js after creation.
- **Using random positions inside generators:** layer-5 airflow trails use `Math.random()` for trail control points. This is acceptable for non-instanced visual noise, but equipment positions should be deterministic (derived from recipe dimensions) so rebuilds are stable.
- **Calling store reads inside Pure Three.js generator classes:** Generators are pure Three.js with no React. Equipment params must be passed in, not read from Zustand inside the class.
- **Forgetting `instanceMatrix.needsUpdate = true`:** Known CLAUDE.md gotcha. Every `setMatrixAt` call must be followed by this flag.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Merging multiple primitives into one geometry | Custom vertex buffer stitching | `BufferGeometryUtils.mergeGeometries()` | Handles index buffers, attributes, groups correctly |
| Transforming sub-component geometry before merge | Manual position math | `geometry.translate()` / `geometry.rotateX()` | Built-in BufferGeometry methods, no matrix math needed |
| Raycaster hit detection on instanced equipment | Custom intersection loop | Existing Phase 26 EquipmentClickHandler | Already allocated via useRef; handles MEP sub-group traversal |
| Config panel sliders | Custom input components | Existing `<SliderRow>` component | Already used in systems-tab, building-tab; consistent UX |

**Key insight:** BufferGeometryUtils.mergeGeometries is the essential primitive for this phase — it is what allows a visually rich equipment assembly (3–4 primitives) to be rendered as a single InstancedMesh draw call.

---

## Current State of Each Layer Generator

This is the most critical section. It maps what each generator currently produces and what upgrade work is needed.

### Layer 3: Cooling (`layer-3-cooling.ts`) — MAJOR UPGRADE NEEDED
**Current geometry:**
- Chiller plant: single `BoxGeometry(plantW, 1.5, plantD)` at roof — just a box
- Piping: TubeGeometry risers + branch splines (adequate, keep as-is)
- Particles: ShaderMaterial flow particles (adequate, keep as-is)

**Current userData.type strings:** `cooling-plant`, `cooling-riser`, `cooling-return-riser`, `cooling-branch`, `cooling-flow-particles`

**What's needed:** The chiller plant box at roof needs to become a recognizable chiller unit. A real chiller has: rectangular body + condenser section (taller fins/grille face) + two circular pipe stubs (supply/return). Could also add a cooling tower variant (cylinder with fan on top). The plant box being at roof level is correct for air-cooled chillers.

**Upgrade complexity:** MEDIUM — the plant mesh is a single `new THREE.Mesh(plantGeo, plantMat)`. Replace with merged geometry assembly. No instancing needed (one chiller per building); floor-level fan coils (from cooling branches) could be instanced.

### Layer 4: Heating (`layer-4-heating.ts`) — MAJOR UPGRADE NEEDED
**Current geometry:**
- Boiler: single `BoxGeometry(footprintWidth * 0.18, 1.2, footprintDepth * 0.12)` at basement — just a box
- Piping: TubeGeometry risers + serpentine floor pipes (adequate, keep as-is)
- Radiant zones: ShaderMaterial heat planes (adequate, keep as-is)

**Current userData.type strings:** `heating-boiler`, `heating-riser`, `heating-return-riser`, `heating-floor-pipe`, `heating-radiant-zone`

**What's needed:** The boiler box needs to become recognizable as a boiler: vertical cylinder body + flue stack on top (smaller cylinder/cone) + two pipe stubs at base. For VRF systems (common in Korean buildings): wall-mounted rectangular outdoor unit with louvered face — instanced per floor near perimeter. Fan coil units (FCU) — small ceiling cassettes — could be instanced per floor.

**Upgrade complexity:** HIGH — need to add VRF outdoor unit as a new equipment type, plus upgrade the boiler body. VRF heads need a new InstancedMesh placed at perimeter positions.

### Layer 5: Ventilation (`layer-5-ventilation.ts`) — MODERATE UPGRADE NEEDED
**Current geometry:**
- AHU boxes: `BoxGeometry(1.2, 0.8, 0.8)` — already InstancedMesh across floors. One per floor at core.
- Duct segments: 4 directional `BoxGeometry` pieces from AHU outward per floor — individual Meshes
- Airflow trails: Line + ShaderMaterial (adequate, keep as-is)

**Current userData.type strings:** `vent-ahu`, `vent-airflow`, `vent-duct`

**What's needed:** AHU body needs duct stubs visible protruding from faces (currently the duct segments are separate Meshes positioned near the AHU — they look disconnected). A fan housing face (TorusGeometry circle) on the supply face makes it instantly recognizable as an AHU. The duct segment Meshes can be merged into the AHU geometry and instanced together.

**Upgrade complexity:** LOW-MEDIUM — AHU already instanced. Rebuild geometry with mergeGeometries to include duct stubs and fan face. The per-floor individual duct Meshes (4 per floor = 4 × floors draw calls) should be merged or replaced by the enhanced AHU InstancedMesh.

### Layer 6: DHW (`layer-6-dhw.ts`) — LOW UPGRADE NEEDED
**Current geometry:**
- Storage tank: `CylinderGeometry(0.6, 0.6, 1.8, 16)` — already a cylinder (good silhouette)
- Secondary recirculation tank: smaller cylinder (good)
- Pipe stubs: none visible on the tank body
- Horizontal branches: TubeGeometry to wet zones (adequate, keep as-is)
- Fixture spheres: `SphereGeometry(0.08)` at zone terminations (adequate, keep as-is)

**Current userData.type strings:** `dhw-storage-tank`, `dhw-recirc-tank`, `dhw-branch`, `dhw-return`, `dhw-fixture`, `dhw-tank-connect`

**What's needed:** The storage tank cylinder is already a good silhouette. Add a pump housing nearby (small cylinder on its side with an inlet/outlet) and pipe stubs at top/bottom of tank. The tank alone is recognizable — this is the lowest-effort generator.

**Upgrade complexity:** LOW — add merged pipe stub geometry to the tank body. Add a pump housing (separate Mesh next to tank). Optional: add insulation jacket visual cue (slightly larger cylinder as wireframe or transparent outer shell).

### Layer 7: Lighting (`layer-7-lighting.ts`) — MODERATE UPGRADE NEEDED
**Current geometry:**
- Fixture tiles: `BoxGeometry(0.6, 0.02, 0.3)` — extremely flat boxes, 1 InstancedMesh for all floors. Good instancing pattern.
- Daylight sensors: `SphereGeometry(0.06)` — 1 InstancedMesh for all floor perimeter sensors. Fine as-is.
- Electrical panels: `BoxGeometry(0.4, 0.6, 0.15)` — small box per floor, instanced. Needs door face detail.

**Current userData.type strings:** `lighting-fixture`, `lighting-sensor`, `lighting-panel`

**What's needed:**
- Fixture: the 0.02m (2cm) height flat box is barely visible at typical camera distances. Needs to be taller (0.08–0.12m) with a light diffuser face. Use mergeGeometries: thin body + slightly wider diffuser panel on bottom face.
- Electrical panel: add a door outline (thin extruded rectangle on front face) and breaker grid lines to make it recognizable as a panel vs. a generic box.
- Both are already InstancedMesh — geometry upgrade only, no structural change needed.

**Upgrade complexity:** LOW — geometry swap only, InstancedMesh scaffolding already correct.

---

## Equipment Sub-Type → Visual Model Mapping

| Equipment Type | userData.type prefix | Visual Primitives | Key Silhouette Feature |
|---------------|---------------------|-------------------|------------------------|
| Chiller unit | `cooling-plant` | Box body + 2 cylinder pipe stubs + rectangular condenser face | Two large pipe stubs at base |
| Cooling tower | `cooling-tower` (new) | Cylinder body + TorusGeometry fan ring on top | Fan ring on top of wide cylinder |
| Boiler | `heating-boiler` | CylinderGeometry body + CylinderGeometry flue stack + 2 pipe stubs | Vertical cylinder with flue stack on top |
| VRF outdoor unit | `heating-vrf-head` (new) | Box with louvered face (thin extrusion strips) + pipe stubs | Horizontal louvre slats on front face |
| Fan coil unit (FCU) | `heating-fan-coil` (new) | Thin rectangular ceiling cassette (wider than AHU) with return grille | Very flat horizontal cassette |
| AHU | `vent-ahu` | Box body + duct stub on one face + TorusGeometry fan ring | Fan ring + duct stub |
| Exhaust fan | `vent-exhaust` (new, optional) | Small cylinder at wall/roof | Small wall-mounted disk |
| DHW storage tank | `dhw-storage-tank` | CylinderGeometry + pipe stubs at top/bottom | Tall vertical cylinder with pipe connections |
| DHW pump | `dhw-pump` (new) | Horizontal small cylinder (pump body) + Box (motor housing) | Horizontal cylinder with box end cap |
| Lighting fixture | `lighting-fixture` | Thin box (housing) + slightly wider flat panel (diffuser) | Flat ceiling panel with visible diffuser |
| Electrical panel | `lighting-panel` | Box (cabinet) + thin extruded rectangle (door) + grid lines | Rectangular door outline on cabinet face |

---

## Procedural Parameter Strategy

### Per-Equipment Type Config (recommended)

Each equipment sub-type gets its own params block rather than sharing a generic per-layer density scalar. This allows "I want larger chillers" without affecting pipe branch density.

```typescript
// src/lib/layers/mep-equipment-params.ts
export interface ChillerParams {
  bodyWidth: number;     // default: footprintWidth * 0.2
  bodyDepth: number;     // default: footprintDepth * 0.15
  bodyHeight: number;    // default: 1.5
  showCoolingTower: boolean; // default: false (era < 1990 = no cooling tower)
  pipeStubRadius: number;    // default: 0.12
}

export interface BoilerParams {
  radius: number;        // default: 0.5
  height: number;        // default: 1.8
  flueRadius: number;    // default: 0.12
  flueHeight: number;    // default: 0.8
  vrfHeads: boolean;     // default: true for 2010+ buildings
  vrfHeadsPerFloor: number; // default: 2
}

export interface AhuParams {
  width: number;         // default: 1.2
  height: number;        // default: 0.8
  depth: number;         // default: 0.8
  showDuctStubs: boolean; // default: true
  showFanFace: boolean;  // default: true
  unitsPerFloor: number; // default: 1
}

export interface DhwParams {
  tankRadius: number;    // default: 0.6
  tankHeight: number;    // default: 1.8
  showPump: boolean;     // default: true
  showInsulationJacket: boolean; // default: false (visual noise)
}

export interface LightingFixtureParams {
  width: number;         // default: 0.6
  depth: number;         // default: 0.3
  height: number;        // default: 0.10 (was 0.02 — too flat)
  showDiffuserFace: boolean; // default: true
}

export interface ElectricalPanelParams {
  width: number;         // default: 0.5
  height: number;        // default: 0.8
  depth: number;         // default: 0.18
  showDoorOutline: boolean; // default: true
  showBreakerGrid: boolean; // default: true
}

export interface MepEquipmentParams {
  chiller: ChillerParams;
  boiler: BoilerParams;
  ahu: AhuParams;
  dhw: DhwParams;
  lightingFixture: LightingFixtureParams;
  electricalPanel: ElectricalPanelParams;
}

export const DEFAULT_MEP_EQUIPMENT_PARAMS: MepEquipmentParams = { ... };
```

### Config Panel — New "Equipment" Tab

Add a new tab in the config panel (alongside existing building, envelope, layers, systems tabs). The tab uses existing `<SliderRow>` for numeric params and checkboxes for boolean flags. The tab should be per-building (keyed by buildingPk) and stored in the new equipment-store.

---

## LOD Strategy

The "structural clarity principle" from PROJECT.md — clear silhouettes, not photorealism — maps directly to a two-level LOD approach:

| Distance from camera | Detail level | Geometry |
|---------------------|--------------|----------|
| < 20m (close-up inspection) | Full | Merged geometry: body + duct stubs + fan face + pipe stubs |
| 20–80m (typical audit view) | Medium | Body + largest silhouette feature only (fan ring OR duct stub, not both) |
| > 80m (building overview) | Low | Body only (single BoxGeometry or CylinderGeometry) |

**Implementation approach:** Do NOT implement Three.js LOD objects in this phase — they add complexity and the scene is not geometry-bottlenecked. Instead:
- Build the "full" merged geometry for all equipment
- Trust camera distance and transparency rendering to communicate depth
- Revisit LOD if performance issues emerge

The structural clarity principle means: prioritize silhouette distinctiveness at 20–50m over geometric detail. A TorusGeometry fan ring at 0.3m radius is clearly visible at 30m. Breaker grid lines at 2mm thickness are not — skip those.

---

## InstancedMesh Usage Patterns

### Existing InstancedMesh usage in MEP layers (verified):

| Layer | InstancedMesh | Count strategy | userData.type |
|-------|--------------|----------------|---------------|
| layer-1-shell | columns | colPositions.length | `shell-column` |
| layer-5-ventilation | AHU boxes | `aboveFloors.length` | `vent-ahu` |
| layer-7-lighting | fixture tiles | `fixturesPerFloor × floors` (ALL floors in ONE IM) | `lighting-fixture` |
| layer-7-lighting | sensors | `floors × 4 sides × sensorsPerSide` | `lighting-sensor` |
| layer-7-lighting | panels | `aboveFloors.length` | `lighting-panel` |

### Draw call budget analysis per sub-layer:

**mep-hvac (layers 3+4+5 merged into sub-group):**
Current: ~15+ draw calls (multiple individual Mesh per generator).
Target with upgrades:
- 1 IM for chiller (1 unit)
- 1 IM for cooling tower (0–1 units)
- 1 IM for boiler (1 unit)
- 1 IM for VRF heads (N floors)
- 1 IM for fan coils (N floors)
- 1 IM for AHU (N floors)
- 2–3 Meshes for pipe splines/risers (shared material)
= 7–9 draw calls. Within budget.

**mep-lighting (layer 7):**
Current: 3 InstancedMesh already (fixtures + sensors + panels).
Upgraded: same 3 IM with better geometry = 3 draw calls. Under budget.

**mep-dhw (layer 6):**
Current: ~10 individual Meshes (tank + tank2 + 2 risers + per-floor branches + fixtures).
Target: 1 IM for tanks (2 instances) + 1 IM for pumps + 2 CylinderGeometry risers + branch splines (can share material) = 4–5 draw calls. Under budget.

**mep-electrical (layer 1 shell):**
No equipment models in layer-1-shell (it's structural skeleton). The `lighting-panel` boxes in layer-7 serve as the electrical panel representation. No change needed for electrical sub-layer geometry.

---

## Integration with Existing Systems

### Phase 22 Sub-Layer Toggling
No changes to mep-coordinator.ts or LayerManager. Equipment models live inside the same generator groups that are already routed to sub-groups. Adding new userData.type strings within the same generator (e.g., `"cooling-tower"` inside layer-3-cooling) automatically falls into `sub-mep-hvac`.

### Phase 26 Click Selection
The Phase 26 `EquipmentClickHandler` raycasts against MEP sub-group meshes and reads `userData.type`. New equipment types added with new userData.type strings (e.g., `"heating-vrf-head"`) will be picked up by the raycaster. The `inferEquipmentSpecs()` dispatch uses prefix matching — `"heating-vrf-head"` prefix `"heating"` already maps to the heating spec case. No changes to equipment-specs.ts needed unless a new spec category is wanted for VRF heads specifically.

### Material Store Integration
The existing `material-store` manages thermal/HVAC/glazing properties for energy calculations (wall U-value, HVAC COP, etc.). Equipment models do NOT need material overrides via material-store — their visual appearance is fixed by the emissive color and metalness in MeshStandardMaterial per layer. A separate `equipment-store` managing only procedural geometry params is the right separation of concerns.

**Pattern for equipment-store:**
```typescript
// src/store/equipment-store.ts — mirrors material-store pattern
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MepEquipmentParams } from "@/lib/layers/mep-equipment-params";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "@/lib/layers/mep-equipment-params";

interface EquipmentState {
  // Per-building equipment params, keyed by mgmBldrgstPk
  params: Record<string, MepEquipmentParams>;
  setParams: (pk: string, params: MepEquipmentParams) => void;
  overrideParam: (pk: string, path: string, value: unknown) => void;
  getParams: (pk: string) => MepEquipmentParams;
}
```

---

## Common Pitfalls

### Pitfall 1: Forgetting `instanceMatrix.needsUpdate = true`
**What goes wrong:** InstancedMesh positions remain at origin even though `setMatrixAt` was called.
**Why it happens:** Three.js does not auto-flush instance matrices.
**How to avoid:** Always follow each block of `setMatrixAt` calls with `instanceMatrix.needsUpdate = true`. This is documented in CLAUDE.md as a known gotcha.
**Warning signs:** All instances appear at world origin (0, 0, 0).

### Pitfall 2: mergeGeometries loses userData.type
**What goes wrong:** After merging primitives, there is no geometry-level userData — userData lives on the Mesh, not the geometry. The InstancedMesh's `userData.type` is what Phase 26 reads.
**Why it happens:** Developer may try to set userData on geometry instead of on the InstancedMesh.
**How to avoid:** Set `instancedMesh.userData = { type: "vent-ahu" }` on the InstancedMesh after creation — the merged geometry does not carry userData.

### Pitfall 3: mergeGeometries requires matching attributes
**What goes wrong:** `BufferGeometryUtils.mergeGeometries()` throws if input geometries have different attributes (e.g., one has UVs, another does not).
**Why it happens:** TorusGeometry has UVs, a custom points-only geometry does not.
**How to avoid:** Only merge standard Three.js primitives (BoxGeometry, CylinderGeometry, ConeGeometry, TorusGeometry) — these all have the same attributes. Delete custom attribute geometries before merging if needed.

### Pitfall 4: Sub-component `translate()` calls mutate shared geometry
**What goes wrong:** If a BoxGeometry is created once and reused across multiple `translate()` calls, each translate accumulates.
**Why it happens:** `geometry.translate()` mutates the geometry in place.
**How to avoid:** Create a new geometry instance for each sub-component, or use `geometry.clone()` before translating.

### Pitfall 5: Per-floor individual Mesh (not InstancedMesh) for equipment
**What goes wrong:** Creating a new `new THREE.Mesh(geo, mat)` per floor for equipment (like the current individual duct segments in layer-5) results in O(floors) draw calls.
**Why it happens:** Easier to write than InstancedMesh; developer follows the pattern from the simpler branch/pipe code.
**How to avoid:** For any geometry that repeats per floor (or per zone), always use InstancedMesh. The AHU-per-floor pattern in layer-5 is the correct model.

### Pitfall 6: Random positions in instanced equipment
**What goes wrong:** Using `Math.random()` for VRF head positions results in different positions every time the generator runs, breaking stable click selection (Phase 26 hit detection reports different equipment each rebuild).
**Why it happens:** layer-5 already uses Math.random() for airflow trails (acceptable for visual noise), so it is tempting to follow that pattern for equipment positions.
**How to avoid:** Derive all equipment positions deterministically from `recipe.footprintWidth`, `recipe.footprintDepth`, `floor.y`, `floor.height`. Use fixed offsets or grid positions, not random.

---

## Code Examples

### InstancedMesh with merged geometry — canonical pattern (verified against codebase)
```typescript
// Source: Synthesized from layer-5 (IM for AHU) + layer-7 (IM for fixtures/sensors/panels)
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function buildEquipmentIM(
  recipe: BuildingRecipe,
  buildGeo: (params: AhuParams) => THREE.BufferGeometry,
  params: AhuParams,
  mat: THREE.Material,
  userDataType: string
): THREE.InstancedMesh {
  const aboveFloors = recipe.floors.filter(f => f.type === "above");
  const geo = buildGeo(params);
  const im = new THREE.InstancedMesh(geo, mat, aboveFloors.length);
  im.userData = { type: userDataType };

  const mat4 = new THREE.Matrix4();
  for (let i = 0; i < aboveFloors.length; i++) {
    const floor = aboveFloors[i];
    const ceilingY = floor.y + floor.height - params.height / 2 - 0.1;
    mat4.makeTranslation(0, ceilingY, 0);
    im.setMatrixAt(i, mat4);
  }
  im.instanceMatrix.needsUpdate = true;
  return im;
}
```

### Merged geometry for chiller unit
```typescript
// Source: Three.js BufferGeometryUtils (in three/examples/jsm — already used in project)
function buildChillerGeometry(p: ChillerParams): THREE.BufferGeometry {
  // Main rectangular body
  const body = new THREE.BoxGeometry(p.bodyWidth, p.bodyHeight, p.bodyDepth);

  // Condenser grille face (thinner box on one face)
  const grille = new THREE.BoxGeometry(p.bodyWidth * 0.9, p.bodyHeight * 0.9, 0.08);
  grille.translate(0, 0, p.bodyDepth / 2 + 0.04);

  // Supply pipe stub
  const pipeA = new THREE.CylinderGeometry(p.pipeStubRadius, p.pipeStubRadius, 0.4, 8);
  pipeA.rotateZ(Math.PI / 2);
  pipeA.translate(p.bodyWidth / 2 + 0.2, -p.bodyHeight * 0.3, 0);

  // Return pipe stub
  const pipeB = new THREE.CylinderGeometry(p.pipeStubRadius * 0.8, p.pipeStubRadius * 0.8, 0.4, 8);
  pipeB.rotateZ(Math.PI / 2);
  pipeB.translate(p.bodyWidth / 2 + 0.2, p.bodyHeight * 0.3, 0);

  return mergeGeometries([body, grille, pipeA, pipeB]);
}
```

### Generator signature extension (backward-compatible)
```typescript
// Preserves existing density param (second arg) for back-compat with LayerGenerator interface
// Third arg is optional equipment params — falls back to defaults if absent
generate(
  recipe: BuildingRecipe,
  density: number = 1.0,
  equipParams: Partial<AhuParams> = {}
): THREE.Group {
  const params: AhuParams = { ...DEFAULT_AHU_PARAMS, ...equipParams };
  // ... rest of generator
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single BoxGeometry per equipment unit | mergeGeometries for multi-primitive assembly | Three.js r125+ | Enables InstancedMesh for composite shapes |
| THREE.LOD object for distance-based detail | Manual LOD via parameter LOD level | — | LOD objects add complexity; parameter-driven LOD is simpler for this use case |
| Per-Mesh draw call per equipment unit | InstancedMesh for all floors' identical equipment | Already in layer-5/7 | Reduces draw calls from O(floors) to O(1) per equipment type |

**Deprecated/outdated:**
- `three-stdlib` `MergeGeometries`: The stdlib wrapper is superseded by `three/examples/jsm/utils/BufferGeometryUtils.js` direct import. The project already uses three-stdlib for other utilities but the examples/jsm path is preferred for BufferGeometryUtils (verified: `mergeGeometries` is in `three/examples/jsm/utils/BufferGeometryUtils.js` in three 0.183).

---

## Open Questions

1. **VRF head placement position**
   - What we know: VRF outdoor units are wall-mounted, typically on the roof or building perimeter
   - What's unclear: Should VRF heads be placed at roof level (like the chiller) or per-floor on exterior walls? For Korean apartment buildings, VRF condensers are typically on balconies or rooftop. For offices, they are typically rooftop.
   - Recommendation: Default to roof-level cluster; provide `vrfLocation: "roof" | "perimeter"` param.

2. **Fan coil unit (FCU) vs VRF indoor head distinction**
   - What we know: FCU and VRF indoor heads are visually similar (thin ceiling cassettes). Equipment-specs.ts does not currently distinguish them.
   - What's unclear: Should they share the same geometry or be distinct models?
   - Recommendation: Share geometry for now (same thin cassette shape); distinguish by color (FCU = blue, VRF indoor = cyan). Both map to `heating-fan-coil` userData.type.

3. **Count of equipment units per building vs per floor**
   - What we know: Chillers and boilers are one or two per building (basement/roof). AHUs are one per floor at core. Fan coils are many per floor.
   - What's unclear: For large buildings (>10 floors), should the chiller plant scale to multiple units?
   - Recommendation: Use `Math.ceil(aboveFloors.length / 5)` as chiller count (one chiller per 5 floors, typical rule of thumb). Expose as `chillerCount: number` param.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is code-only changes to existing TypeScript layer generator files. No external tools, services, databases, or CLI utilities beyond the existing project stack are required. All Three.js geometry APIs are already in the installed `three` package.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (from package.json devDependencies, used in Phases 23/25) |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `pnpm vitest run src/lib/layers/` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EQUIP-01 | `buildChillerGeometry()` returns geometry with > 1 sub-component primitive contribution (vertex count > plain BoxGeometry) | unit | `pnpm vitest run src/lib/layers/layer-3-cooling.test.ts` | ❌ Wave 0 |
| EQUIP-01 | `buildBoilerGeometry()` returns CylinderGeometry-based body (check position attribute length) | unit | `pnpm vitest run src/lib/layers/layer-4-heating.test.ts` | ❌ Wave 0 |
| EQUIP-01 | `VentilationLayer.generate()` produces InstancedMesh with `userData.type === "vent-ahu"` | unit | `pnpm vitest run src/lib/layers/layer-5-ventilation.test.ts` | ❌ Wave 0 |
| EQUIP-01 | `LightingLayer.generate()` InstancedMesh fixture height > 0.05 (no longer the invisible 0.02m box) | unit | `pnpm vitest run src/lib/layers/layer-7-lighting.test.ts` | ❌ Wave 0 |
| EQUIP-01 | `inferEquipmentSpecs({ type: "heating-vrf-head" }, recipe)` returns a spec (prefix "heating" dispatches correctly) | unit | existing `equipment-specs.test.ts` or new | ❌ Wave 0 |
| EQUIP-01 | All equipment InstancedMesh `instanceMatrix.needsUpdate === true` after generate() | unit | covered in per-layer tests | ❌ Wave 0 |
| EQUIP-01 (SC4) | Draw call count per sub-layer ≤ 10 — verified by counting children in generated group | unit | count group.children traversal | ❌ Wave 0 |
| EQUIP-01 (SC5) | Phase 22 sub-group toggling — `mep-coordinator.assignToSubGroup` still routes upgraded generators correctly | integration | existing layer test or manual verify | ❌ Wave 0 |

**Note on SC3 (recognizable at camera distance):** This is a visual criterion that cannot be automatically tested. It requires a human checkpoint in the implementation plan (take a screenshot at 30m camera distance, verify AHU ≠ boiler ≠ chiller silhouette).

### Sampling Rate
- **Per task commit:** `pnpm vitest run src/lib/layers/`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/layers/layer-3-cooling.test.ts` — covers chiller geometry, EQUIP-01
- [ ] `src/lib/layers/layer-4-heating.test.ts` — covers boiler/VRF geometry, EQUIP-01
- [ ] `src/lib/layers/layer-5-ventilation.test.ts` — covers AHU merged geometry, EQUIP-01
- [ ] `src/lib/layers/layer-7-lighting.test.ts` — covers fixture height, panel geometry, EQUIP-01
- [ ] `src/lib/layers/mep-equipment-params.test.ts` — covers DEFAULT_MEP_EQUIPMENT_PARAMS defaults
- [ ] `src/store/equipment-store.test.ts` — covers store init + overrideParam

---

## Sources

### Primary (HIGH confidence)
- Direct codebase read: `src/lib/layers/layer-3-cooling.ts` — verified chiller geometry is a single BoxGeometry
- Direct codebase read: `src/lib/layers/layer-4-heating.ts` — verified boiler geometry is a single BoxGeometry
- Direct codebase read: `src/lib/layers/layer-5-ventilation.ts` — verified AHU is InstancedMesh BoxGeometry, duct segments are individual Meshes
- Direct codebase read: `src/lib/layers/layer-6-dhw.ts` — verified tank is CylinderGeometry (good silhouette baseline)
- Direct codebase read: `src/lib/layers/layer-7-lighting.ts` — verified fixture is 0.02m flat box InstancedMesh, panels are InstancedMesh
- Direct codebase read: `src/lib/layers/types.ts` — verified GENERATOR_TO_MEP_SUB routing table
- Direct codebase read: `src/lib/energy/equipment-specs.ts` — verified prefix-based dispatch for inferEquipmentSpecs
- Direct codebase read: `src/store/material-store.ts` — verified overrideProperty pattern for new equipment-store
- Direct codebase read: `src/components/viewer/config-tabs/systems-tab.tsx` — verified SliderRow is the correct config panel primitive

### Secondary (MEDIUM confidence)
- Three.js 0.183 `BufferGeometryUtils.mergeGeometries` — import path `three/examples/jsm/utils/BufferGeometryUtils.js` verified from project's existing three version
- Three.js geometry sub-types (BoxGeometry, CylinderGeometry, ConeGeometry, TorusGeometry) — standard primitives, stable since r100

### Tertiary (LOW confidence)
- MEP equipment visual silhouette conventions (chiller = box with pipe stubs, boiler = cylinder with flue, AHU = box with duct stub + fan face) — based on mechanical engineering conventions from training data; not verified against a specific Korean MEP design standard. LOW risk: the structural clarity principle means any distinctly-shaped primitive assembly is sufficient — photographic accuracy is not required.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified from package.json and existing codebase usage
- Architecture: HIGH — all integration points verified against actual layer generator source
- Pitfalls: HIGH for pitfalls 1–5 (verified against actual code patterns in codebase); MEDIUM for pitfall 6 (Math.random warning applies to layer-5 trail code, equipment position usage extrapolated)
- Equipment silhouette descriptions: MEDIUM — conventional MEP equipment shapes, not verified against Korean-specific standards

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable three.js APIs, 30-day validity)
