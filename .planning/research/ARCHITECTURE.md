# Architecture Research

**Domain:** Energy Systems Observability & Control — v5.0 integration with existing Three.js BIM viewer
**Researched:** 2026-04-12
**Confidence:** HIGH (all integration points verified against actual codebase files)

---

## Context

This document covers ONLY the new architecture needed for v5.0. The existing architecture (5-layer
system, BuildingLayers, LayerManager, useEnergyMetrics, material-store override pattern,
structural-tooltip raycasting) is documented as integration context, not re-researched.

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  UI Layer (React components)                                                      │
│                                                                                   │
│  ┌──────────────────┐  ┌────────────────────┐  ┌───────────────────────────┐    │
│  │  LayerPanel       │  │  EnergyBreakdown   │  │  EquipmentControlPanel    │    │
│  │  (extended with   │  │  Chart (NEW)       │  │  (NEW — in config tab)    │    │
│  │  MEP sub-toggles) │  │                    │  │                           │    │
│  └────────┬──────────┘  └────────┬───────────┘  └─────────────┬─────────────┘    │
│           │                      │                             │                  │
├───────────┼──────────────────────┼─────────────────────────────┼──────────────────┤
│  Hook Layer                      │                             │                  │
│                                  │                             │                  │
│  ┌───────────────────────────────▼─────────────────────────────▼──────────────┐  │
│  │  useEnergyMetrics (existing)  ←── useMemo[baseRecipe + overrides]          │  │
│  │  useEnergyBreakdown (NEW)     ←── extends calculateAnnualDemand()          │  │
│  │  useScenarioEnergy (NEW)      ←── merges equipmentOverrides into calc pipe │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────────────┤
│  Store Layer                                                                      │
│                                                                                   │
│  ┌──────────────────┐  ┌──────────────────────┐  ┌──────────────────────────┐   │
│  │  layer-store      │  │  recipe-store         │  │  workflow-store           │   │
│  │  (existing)       │  │  (existing)           │  │  (existing)              │   │
│  │  + mepSubVis      │  │  + scenarioOverrides  │  │  + scenarioActive        │   │
│  │    Record<MepSub  │  │    (NEW slice)        │  │  + activeScenarioId      │   │
│  │    LayerId, bool> │  │                       │  │  + equipmentOverrides    │   │
│  │  + toggleMepSub   │  │                       │  │  (NEW slice)             │   │
│  └────────┬──────────┘  └──────────┬────────────┘  └──────────┬───────────────┘   │
├───────────┼─────────────────────────┼────────────────────────────┼──────────────────┤
│  Three.js / Engine Layer            │                            │                  │
│                                     │                            │                  │
│  ┌──────────────────────────────────▼────────────────────────────▼────────────┐    │
│  │  LayerManager (existing)                                                    │    │
│  │  - getGroup("mep") → has 4 named child THREE.Groups after v5.0             │    │
│  │    ├── "sub-mep-electrical"  ← layer-1-shell + electrical parts             │    │
│  │    ├── "sub-mep-hvac"        ← layer-3-cooling + layer-4 + layer-5         │    │
│  │    ├── "sub-mep-lighting"    ← layer-7-lighting                             │    │
│  │    └── "sub-mep-dhw"         ← layer-6-dhw                                 │    │
│  │  - setMepSubVisible(id, visible) (NEW method)                               │    │
│  │                                                                              │    │
│  │  EnergyHeatmapMesh (NEW — pure Three.js)                                    │    │
│  │  - One THREE.Mesh per floor inside existing "energy-zones" group            │    │
│  │  - vertexColors: true, Float32BufferAttribute color buffer                  │    │
│  │  - Receives perFloor kWh/m² array; rebuilds on change                      │    │
│  │                                                                              │    │
│  │  EquipmentTooltip (NEW — R3F)                                                │    │
│  │  - Extends structural-tooltip.tsx raycasting pattern                        │    │
│  │  - Traverses mep sub-groups; reads userData.type + userData.floorNo        │    │
│  │  - Raycaster allocated via useRef (fixes known structural-tooltip perf bug) │    │
│  └──────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  Energy Engine (src/lib/energy/)                                                     │
│  calculateAnnualDemand()   ← extended with optional perFloor + equipmentOverrides   │
│  calculateSystemBreakdown() (NEW) → SystemBreakdown: hvac/lighting/dhw/plug        │
│  inferEquipmentSpecs()      (NEW) → EquipmentSpec[] from BuildingRecipe             │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Integration Points with Existing Layer System

### 1. MEP Sub-Layer Split: Minimal Surgical Change

The `LayerId` union stays at 5 entries. `ALL_LAYER_IDS` stays at 5 entries. The `LayerManager`
`groups` Map stays at 5 entries. The MEP sub-layer system is a **parallel structure on top** — not
a replacement.

**What changes in `src/lib/layers/types.ts` (additive only):**

```typescript
export type MepSubLayerId =
  | "mep-electrical"
  | "mep-hvac"
  | "mep-lighting"
  | "mep-dhw";

export const MEP_SUB_IDS: MepSubLayerId[] = [
  "mep-electrical", "mep-hvac", "mep-lighting", "mep-dhw",
];

export const MEP_SUB_CONFIGS: Record<MepSubLayerId, { name: string; nameKo: string; color: string }> = {
  "mep-electrical": { name: "Electrical",    nameKo: "전기",      color: "#f59e0b" },
  "mep-hvac":       { name: "HVAC",          nameKo: "냉난방환기", color: "#3b82f6" },
  "mep-lighting":   { name: "Lighting",      nameKo: "조명",      color: "#fbbf24" },
  "mep-dhw":        { name: "DHW/Plumbing",  nameKo: "급탕/배관", color: "#22c55e" },
};
```

**What changes in `src/store/layer-store.ts` (additive slice):**

```typescript
// Add to LayerState interface:
mepSubVisibility: Record<MepSubLayerId, boolean>;
toggleMepSub: (id: MepSubLayerId) => void;
setMepSubVisible: (id: MepSubLayerId, visible: boolean) => void;

// Add to initial state:
mepSubVisibility: Object.fromEntries(MEP_SUB_IDS.map(id => [id, true])) as Record<MepSubLayerId, boolean>,
```

**What changes in `src/lib/layers/layer-manager.ts` (one new method):**

```typescript
// Add to LayerManager class — does NOT touch existing setVisible() or groups Map:
setMepSubVisible(subId: MepSubLayerId, visible: boolean): void {
  const mepGroup = this.groups.get("mep");
  if (!mepGroup) return;
  const child = mepGroup.getObjectByName(`sub-${subId}`);
  if (child) child.visible = visible;
}
```

**What changes in `src/components/viewer/building-layers.tsx` (one new useEffect):**

```typescript
// Existing visibility loop (ALL_LAYER_IDS) is UNCHANGED.
// Add a second useEffect for mepSubVisibility:
const mepSubVisibility = useLayerStore((s) => s.mepSubVisibility);
useEffect(() => {
  const manager = managerRef.current;
  if (!manager) return;
  for (const subId of MEP_SUB_IDS) {
    manager.setMepSubVisible(subId, mepSubVisibility[subId]);
  }
}, [mepSubVisibility]);
```

**New file: `src/lib/layers/mep-coordinator.ts`**

Orchestrates sub-group assignment. Called during MEP layer generation (replacing direct add to mep
group). Assigns generator output into named child groups:

```
mep (THREE.Group, name: "layer-mep")
├── sub-mep-electrical  ← layer-1-shell generator output
├── sub-mep-hvac        ← layer-3-cooling + layer-4-heating + layer-5-ventilation
├── sub-mep-lighting    ← layer-7-lighting
└── sub-mep-dhw         ← layer-6-dhw
(layers 8–14 added directly to mep group — future "advanced systems" section)
```

`disposeLayer("mep")` in LayerManager already traverses all children recursively — sub-groups are
disposed correctly without any change to the existing dispose logic.

---

### 2. Energy Heatmap: New Geometry in Existing `energy-zones` Group

The `energy-zones` THREE.Group exists in LayerManager and is visibility-toggled by the existing
`visibility["energy-zones"]` flag. The heatmap geometry lives entirely inside this group.

**New file: `src/lib/layers/energy-heatmap-mesh.ts`**

```typescript
// Creates one THREE.Mesh per floor inside the energy-zones group.
// Pure Three.js — no React.

export function buildEnergyHeatmap(
  floors: FloorSpec[],
  perFloorKwh: number[],   // kWh/m² per floor, index matches floors array order
  recipe: BuildingRecipe
): THREE.Group {
  const group = new THREE.Group();
  group.name = "energy-heatmap";

  const aboveFloors = floors.filter(f => f.type === "above");
  aboveFloors.forEach((floor, i) => {
    const kwh = perFloorKwh[i] ?? 0;
    const geo = new THREE.PlaneGeometry(recipe.footprintWidth, recipe.footprintDepth, 2, 2);
    geo.rotateX(-Math.PI / 2);  // horizontal plane
    // Build vertex color buffer from kWh/m² scalar
    const colors = new Float32Array(geo.attributes.position.count * 3);
    const c = kwhmToColor(kwh);
    for (let v = 0; v < geo.attributes.position.count; v++) {
      colors[v * 3]     = c.r;
      colors[v * 3 + 1] = c.g;
      colors[v * 3 + 2] = c.b;
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
    mesh.position.y = floor.y + 0.02;  // just above slab surface
    mesh.userData = { type: "energy-heatmap-floor", floorNo: floor.floorNo };
    group.add(mesh);
  });
  return group;
}
```

**Color mapping (no external library):**

`kwhmToColor()` linearly interpolates between 7 grade anchor points aligned with existing
`getGradeColor()` in `energy-grade.ts`:

| kWh/m² | Color | Korean Grade |
|--------|-------|-------------|
| 60     | `#3b82f6` (blue) | 1+++ |
| 90     | `#22c55e` (green) | 1++ |
| 120    | `#84cc16` | 1+ |
| 160    | `#eab308` (yellow) | 1 |
| 200    | `#f97316` (orange) | 2 |
| 260    | `#ef4444` (red) | 3+ |
| 320+   | `#dc2626` (dark red) | 7 |

**Integration in `building-layers.tsx`:**

```typescript
const floorDemands = useEnergyBreakdown(buildingPk);  // NEW hook

useEffect(() => {
  if (!floorDemands || !managerRef.current || !recipe) return;
  const energyGroup = managerRef.current.getGroup("energy-zones");
  // Remove previous heatmap (dispose geometry/material):
  const old = energyGroup.getObjectByName("energy-heatmap");
  if (old) {
    old.traverse(o => {
      if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    });
    energyGroup.remove(old);
  }
  const heatmap = buildEnergyHeatmap(recipe.floors, floorDemands.perFloor, recipe);
  energyGroup.add(heatmap);
}, [floorDemands, recipe]);
```

`disposeLayer("energy-zones")` in LayerManager already handles full traversal cleanup — no
additional dispose logic needed.

---

### 3. Equipment Info Panel: Extend `structural-tooltip.tsx` Pattern

`StructuralTooltip` implements the complete raycasting pattern:
- `useEffect` on `gl.domElement` for pointermove → normalized mouse coords in `useRef`
- `useFrame` throttled every 3rd frame
- `raycaster.intersectObject(mesh, false)` → `hit.instanceId`
- `mesh.userData` for labels
- `<Html position={hit.point}>` popup

**New component: `src/components/viewer/equipment-tooltip.tsx`**

Key differences from `StructuralTooltip`:

1. Traverses mep group's named sub-groups (`sub-mep-*`) rather than a single named group
2. Reads `userData.type` + `userData.floorNo` from the hit object (already set by all layer
   generators — e.g. `{ type: "cooling-branch", floorNo: 3 }`)
3. Looks up `EquipmentSpec` via `inferEquipmentSpecs(buildingPk, componentType, floorNo)` — a pure
   function, no async
4. Renders a richer card (type, efficiency grade, approx install year, estimated kWh/yr) instead of
   a single label string
5. Skips raycasting against sub-groups whose `mepSubVisibility[id]` is false

**Critical fix — allocate Raycaster via `useRef`, not inside `useFrame`:**

The existing `StructuralTooltip` allocates `new THREE.Raycaster()` inside `useFrame` (known tech
debt, noted in PROJECT.md). All new raycasting components must allocate once:

```typescript
// WRONG (StructuralTooltip's known defect — do not copy):
useFrame(() => {
  const raycaster = new THREE.Raycaster(); // heap allocation every frame
});

// CORRECT for EquipmentTooltip:
const raycasterRef = useRef(new THREE.Raycaster());
useFrame(() => {
  raycasterRef.current.setFromCamera(mouse.current, camera);
  const hits = raycasterRef.current.intersectObjects(targets, true);
});
```

---

### 4. Energy Breakdown Dashboard: New Chart Component

**New file: `src/components/viewer/energy-breakdown-chart.tsx`**

Uses shadcn `<ChartContainer>` wrapping Recharts `<BarChart>`. Install: `pnpm add recharts@^3.8.1`
and `npx shadcn@latest add chart`.

Data source: `useEnergyBreakdown(buildingPk)` → `SystemBreakdown`.

Positioned below existing `EnergyCards` or in a new "breakdown" tab in the config panel.
`EnergyCards` itself is not modified.

---

### 5. Equipment Control: New Slices in Existing Stores

Equipment control state goes into `workflow-store.ts` (same lifecycle as workflow stages — transient,
not persisted). Scenario overrides go into `recipe-store.ts` (same data shape as existing
`overrides[pk]`).

**New slice in `src/store/workflow-store.ts`:**

```typescript
// Scenario mode
scenarioActive: boolean;
activeScenarioId: string | null;
equipmentOverrides: Record<string, EquipmentControlState>;  // key: equipmentId
enterScenarioMode: (scenarioId: string) => void;
exitScenarioMode: () => void;
setEquipmentOverride: (equipmentId: string, state: EquipmentControlState) => void;
clearEquipmentOverrides: () => void;

// IMPORTANT: partialize must exclude equipmentOverrides (transient state):
partialize: (state) => ({
  stage: state.stage,
  completion: state.completion,
  // scenarioActive, equipmentOverrides intentionally excluded
})
```

**New slice in `src/store/recipe-store.ts`:**

```typescript
// Scenario recipe overrides — isolated from committed overrides[pk]
scenarioOverrides: Record<string, Record<string, RecipeOverrides>>;
// key: buildingPk → scenarioId → RecipeOverrides
setScenarioOverride: (pk: string, scenarioId: string, path: string, value: unknown) => void;
clearScenario: (pk: string, scenarioId: string) => void;
```

`scenarioOverrides` is NEVER merged back into `overrides[pk]`. Undo/redo history never touches
scenario state.

---

## New Components

| Component | File | Category | Primary Dependency |
|-----------|------|----------|--------------------|
| `EnergyBreakdownChart` | `src/components/viewer/energy-breakdown-chart.tsx` | React UI | `useEnergyBreakdown`, shadcn chart + recharts |
| `EquipmentTooltip` | `src/components/viewer/equipment-tooltip.tsx` | R3F | `useLayerStore(mepSubVis)`, `inferEquipmentSpecs` |
| `MepSubLayerToggles` | inside `src/components/viewer/layer-panel.tsx` | React UI | `useLayerStore(mepSubVis)` |
| `ScenarioModeBanner` | `src/components/viewer/scenario-mode-banner.tsx` | React UI | `useWorkflowStore(scenarioActive)` |
| `EquipmentControlPanel` | `src/components/workspace/equipment-control-panel.tsx` | React UI | `useWorkflowStore`, `useScenarioEnergy` |

---

## New vs Modified Files

### Modified (surgical additions — no rewrites)

| File | Change | Risk |
|------|--------|------|
| `src/lib/layers/types.ts` | Add `MepSubLayerId` union, `MEP_SUB_IDS`, `MEP_SUB_CONFIGS` | LOW — additive, no existing consumer breaks |
| `src/lib/layers/layer-manager.ts` | Add `setMepSubVisible()` method | LOW — new method, existing API unchanged |
| `src/store/layer-store.ts` | Add `mepSubVisibility` + toggle actions | LOW — additive slice, existing selectors unaffected |
| `src/store/workflow-store.ts` | Add scenario + equipment override slice; update `partialize` to exclude transient state | LOW — additive; `partialize` update is mandatory to prevent stale scenario across reloads |
| `src/store/recipe-store.ts` | Add `scenarioOverrides` slice | LOW — isolated from existing `overrides` record |
| `src/components/viewer/building-layers.tsx` | Add `useEffect` for `mepSubVisibility` sync; add heatmap rebuild `useEffect` | LOW — existing loop unchanged |
| `src/components/viewer/layer-panel.tsx` | Add expandable MEP sub-rows section | LOW — purely additive UI |
| `src/lib/energy/annual-demand.ts` | Add optional `options?: { returnPerFloor?, equipmentOverrides? }` parameter | MEDIUM — function signature extends; all existing callers pass no options, return type unchanged |

### New Files

| File | Purpose |
|------|---------|
| `src/lib/layers/mep-coordinator.ts` | Assigns MEP generator output to named `sub-mep-*` child groups inside the mep THREE.Group |
| `src/lib/layers/energy-heatmap-mesh.ts` | Pure Three.js: floor-plane meshes with vertex color buffer from kWh/m² scalar |
| `src/lib/energy/system-breakdown.ts` | `calculateSystemBreakdown()` — extends demand calc with HVAC/lighting/DHW/plug attribution using ASHRAE building-type ratios |
| `src/lib/energy/equipment-specs.ts` | `inferEquipmentSpecs()` — derives `EquipmentSpec[]` from `BuildingRecipe` + ledger data (no user input required) |
| `src/hooks/use-energy-breakdown.ts` | React hook: `useMemo` over `calculateSystemBreakdown()`; returns `SystemBreakdown` with `perFloor` array |
| `src/hooks/use-scenario-energy.ts` | Reactive hook: merges `effectiveRecipe` + `equipmentOverrides` → scenario energy delta vs baseline |
| `src/components/viewer/energy-breakdown-chart.tsx` | shadcn `<ChartContainer>` + Recharts `<BarChart>` for HVAC/lighting/DHW/plug breakdown |
| `src/components/viewer/equipment-tooltip.tsx` | R3F raycasting tooltip for MEP mesh objects — extends structural-tooltip pattern with Raycaster `useRef` fix |
| `src/components/viewer/scenario-mode-banner.tsx` | Amber overlay banner: "시나리오 모드 — 실제 데이터가 아님" shown when `scenarioActive = true` |
| `src/components/workspace/equipment-control-panel.tsx` | On/off toggles + HVAC setpoint sliders for selected equipment in scenario mode |

---

## New Data Models

### `EquipmentSpec` (`src/lib/energy/equipment-specs.ts`)

```typescript
export type EnergyDataSource = "modeled" | "actual" | "estimated-ratio";

export interface EquipmentSpec {
  equipmentId: string;               // e.g. "hvac-floor-3"
  subLayer: MepSubLayerId;           // which sub-system owns this equipment
  componentType: string;             // userData.type from Three.js object (e.g. "cooling-branch")
  floorNo: number | null;            // null = building-wide equipment
  displayName: string;               // Korean label: "냉방기 (3층)"
  capacityKw: number | null;         // inferred from floor area + building use type
  efficiencyGrade: EnergyGrade | null; // Korean 1+++~7 using existing energy-grade.ts
  estimatedAnnualKwh: number | null; // from SystemBreakdown.hvac / floor count
  installYear: number | null;        // inferred from building permit year (approvalDate in ledger)
  dataSource: EnergyDataSource;      // always "estimated-ratio" for inferred data
}
```

### `SystemBreakdown` (`src/lib/energy/system-breakdown.ts`)

```typescript
export interface SystemBreakdown {
  hvac: number;       // kWh/yr — heating + cooling (from existing AnnualDemand)
  lighting: number;   // kWh/yr — ASHRAE ratio estimate by building use type
  dhw: number;        // kWh/yr — domestic hot water, ASHRAE ratio estimate
  plugLoads: number;  // kWh/yr — equipment + appliances, ASHRAE ratio estimate
  total: number;      // sum of all systems
  perFloor: number[]; // kWh/m² per floor (index = above-floors array order)
  dataSource: EnergyDataSource; // "estimated-ratio" for lighting/dhw/plug; "modeled" for hvac
}
```

ASHRAE 90.1 system attribution ratios by Korean building use type:

| Use Type (mainPurpsCd) | HVAC | Lighting | DHW | Plug |
|------------------------|------|----------|-----|------|
| 업무시설 (office)       | 40%  | 35%      | 7%  | 18%  |
| 공동주택 (residential)  | 50%  | 7%       | 25% | 18%  |
| 판매시설 (retail)       | 45%  | 40%      | 3%  | 12%  |
| Default                 | 42%  | 28%      | 12% | 18%  |

All non-HVAC values carry `dataSource: "estimated-ratio"` and are labeled accordingly in all UI.

### `EquipmentControlState` (in `workflow-store.ts`)

```typescript
interface EquipmentControlState {
  enabled: boolean;          // on/off toggle
  setpointDelta?: number;    // HVAC only — °C offset from base setpoint (e.g. +2, -3)
}
```

---

## `calculateAnnualDemand` Extension (Backward-Compatible)

Existing signature (unchanged for all current callers):
```typescript
calculateAnnualDemand(
  heatLoss: HeatLossResult,
  materials: MaterialProperties,
  recipe: BuildingRecipe,
  climate: ClimateData
): AnnualDemand
```

Extended signature (new params are optional — existing callers unaffected):
```typescript
calculateAnnualDemand(
  heatLoss: HeatLossResult,
  materials: MaterialProperties,
  recipe: BuildingRecipe,
  climate: ClimateData,
  options?: {
    returnPerFloor?: boolean;
    equipmentOverrides?: Record<string, EquipmentControlState>;
  }
): AnnualDemand & { perFloor?: number[] }
```

When `equipmentOverrides["mep-hvac"]?.enabled === false`: `coolingCOP` and `heatingEfficiency`
reduced to 0.01 (near-zero) so demand spikes to show "what if HVAC is off" impact.

When `setpointDelta` is set: `designDeltaT` is adjusted proportionally before degree-day
multiplication.

---

## Data Flow

### Flow 1: MEP Sub-Layer Toggle

```
User clicks lighting sub-toggle in LayerPanel
    |
    v
useLayerStore.toggleMepSub("mep-lighting")
    |
    v  (Zustand subscription fires in BuildingLayers)
useEffect([mepSubVisibility])
    |
    v
managerRef.current.setMepSubVisible("mep-lighting", false)
    |
    v
LayerManager.getGroup("mep").getObjectByName("sub-mep-lighting").visible = false
    |
    v
Three.js renderer skips the child group — immediate, no React re-render in R3F
```

### Flow 2: Per-Floor Heatmap Rebuild

```
Material slider changes (wall U-value, HVAC efficiency, etc.)
    |
    v
useEnergyBreakdown(pk) [useMemo] recomputes
    |
    v  (calls calculateAnnualDemand with returnPerFloor:true, then ASHRAE ratios)
SystemBreakdown.perFloor: number[] — new array reference
    |
    v  (useEffect deps: [floorDemands, recipe] fires in BuildingLayers)
Old "energy-heatmap" group disposed from energy-zones group
New EnergyHeatmapMesh built: PlaneGeometry per floor, vertex colors from kwhmToColor()
Added to LayerManager.getGroup("energy-zones")
    |
    v
Three.js renders updated vertex-colored floor planes — reflects new material values
```

### Flow 3: Equipment Info on Hover

```
User moves mouse over cooling pipe in 3D viewport
    |
    v
EquipmentTooltip.useFrame (throttled every 3rd frame)
    |
    v
raycasterRef.current.setFromCamera(mouse.current, camera)
raycaster.intersectObjects([...visible mep sub-group children], true)
    |
    v  (hit found)
componentType = hit.object.userData.type    // "cooling-branch"
floorNo      = hit.object.userData.floorNo  // 3
    |
    v
inferEquipmentSpecs(buildingPk, componentType, floorNo) → EquipmentSpec
    |
    v
setHovered({ position: hit.point, spec })
    |
    v
<Html position={hovered.position}><EquipmentInfoCard spec={spec} /></Html>
```

### Flow 4: Equipment Control → Energy Impact

```
User toggles HVAC off in EquipmentControlPanel (scenario mode)
    |
    v
useWorkflowStore.setEquipmentOverride("mep-hvac", { enabled: false })
    |
    v  (useScenarioEnergy subscribes to equipmentOverrides)
scenarioInputs = { ...baseInputs, coolingCOP: 0.01, heatingEfficiency: 0.01 }
    |
    v
calculateAnnualDemand(heatLoss, scenarioMaterials, recipe, climate, { equipmentOverrides })
    |
    v
scenarioDemand.demandPerSqm >> baseline (HVAC is the largest load component)
    |
    v
StatusBar + EnergyCards re-render with scenario values
ScenarioModeBanner appears: "시나리오 모드 — 실제 데이터가 아님"
Delta vs baseline shown in amber in energy cards
```

---

## Architectural Patterns

### Pattern 1: Additive Store Slices — Do Not Add New Store Files

**What:** New state goes into existing stores as new fields, not new store files.

**Why:** `use-energy-metrics.ts` explicitly documents: "Avoids `getEffectiveRecipe` in Zustand
selector to prevent infinite loops. Instead subscribes to `baseRecipes[pk]` and `overrides[pk]`
separately." Every new store creates a new subscription chain. Adding more stores risks
infinite render loops from object reference churn across stores.

**Rule:** `mepSubVisibility` → `layer-store`. `equipmentOverrides` → `workflow-store`.
`scenarioOverrides` → `recipe-store`. Zero new store files.

### Pattern 2: Per-Frame Raycasting with useRef-Allocated Raycaster

**What:** Allocate `THREE.Raycaster` once via `useRef`, call `setFromCamera` inside `useFrame`.

**Why:** `structural-tooltip.tsx` allocates `new THREE.Raycaster()` inside `useFrame` per frame —
this is a documented performance concern in PROJECT.md. All new raycasting components fix this.

### Pattern 3: Separate Geometry for Energy Visualization

**What:** Energy heatmap uses its own `THREE.Mesh` objects in the `energy-zones` group, never
sharing geometry with structural or envelope layers.

**Why:** Structural slabs use InstancedMesh. `setColorAt` on that InstancedMesh cannot express a
spatial gradient across a face, requires full buffer re-upload on every energy recalc, and
entangles structural visual state with energy data state. Separate floor-plane meshes with vertex
colors in `energy-zones` are independent — the heatmap persists even when the structure layer is
hidden.

### Pattern 4: Scenario State Isolated from Committed State

**What:** `equipmentOverrides` and `scenarioOverrides` are never merged into `overrides[pk]`
(material edits). They are never persisted. Undo/redo never applies to them.

**Why:** `recipe-store.overrides[pk]` feeds both 3D model geometry and ECO2 export. Contaminating
it with scenario hypotheses would corrupt both. Transient scenario state must not survive page
reload — the amber banner is the only visual signal that values are non-actual; without it,
persisted scenario values would silently mislead users.

### Pattern 5: Energy Calculations in useMemo, Never in Render or useFrame

**What:** All calls to `calculateAnnualDemand()`, `calculateSystemBreakdown()` happen inside
`useMemo` with explicit deps arrays, never in render functions or `useFrame`.

**Why:** These are synchronous CPU functions (50–200ms). `use-energy-metrics.ts` demonstrates the
correct pattern. Calling them in `useFrame` drops scene fps to <5. Calling in render body causes
redundant recalculation on unrelated re-renders.

---

## Recommended Build Order

Respects the dependency graph. Each phase has clear exit criteria and can be validated
independently before the next phase starts.

### Phase 1: MEP Sub-Layer Foundation (architectural prerequisite)

Files touched: `types.ts`, `layer-store.ts`, `layer-manager.ts`, `building-layers.tsx`,
`layer-panel.tsx` (sub-toggle UI), `mep-coordinator.ts` (new)

Exit criteria: Each sub-toggle independently shows/hides the correct 3D geometry. Existing 5-layer
visibility toggles still work unchanged.

No energy calculations touched in this phase.

### Phase 2: Per-Floor Energy Model + System Breakdown (engine, no UI)

Files touched: `annual-demand.ts` (optional extension), `system-breakdown.ts` (new),
`use-energy-breakdown.ts` (new)

Exit criteria: `useEnergyBreakdown(pk)` returns `SystemBreakdown` with `perFloor` array and
HVAC/lighting/DHW/plug split. All non-HVAC values carry `dataSource: "estimated-ratio"`.

### Phase 3: Energy Breakdown Dashboard

Files touched: `energy-breakdown-chart.tsx` (new), integration into config panel tabs.
Requires `pnpm add recharts@^3.8.1` and `npx shadcn@latest add chart`.

Exit criteria: Bar chart renders HVAC/lighting/DHW/plug breakdown. Updates when material sliders
change (via `useEnergyBreakdown` subscription). `estimated-ratio` label visible in tooltip.

Depends on: Phase 2.

### Phase 4: Energy Consumption Heatmap

Files touched: `energy-heatmap-mesh.ts` (new), `building-layers.tsx` (heatmap rebuild
`useEffect`).

Exit criteria: `energy-zones` layer shows color-gradient floor planes. Colors update reactively
when material sliders change. `disposeLayer("energy-zones")` + manual heatmap child disposal runs
correctly before rebuild.

Depends on: Phase 2 (`perFloor` array from `useEnergyBreakdown`).

### Phase 5: Equipment Info Panel

Files touched: `equipment-specs.ts` (new), `equipment-tooltip.tsx` (new R3F component).

Exit criteria: Hovering a cooling pipe or lighting fixture shows an info card with inferred specs.
`dataSource: "estimated-ratio"` label visible on all estimated values. Raycaster uses `useRef`
allocation pattern.

Depends on: Phase 1 (MEP sub-groups must have `userData.type` + `userData.floorNo` on objects —
already set by existing layer generators, e.g. `{ type: "cooling-branch", floorNo: 3 }`).

### Phase 6: Equipment Control + Scenario Store (capstone)

Files touched: `workflow-store.ts` (scenario slice + `partialize` update), `recipe-store.ts`
(scenarioOverrides slice), `use-scenario-energy.ts` (new), `equipment-control-panel.tsx` (new),
`scenario-mode-banner.tsx` (new).

Exit criteria: Toggling HVAC off in scenario mode visibly raises kWh/m² in status bar and energy
cards. Amber banner displays. Exiting scenario mode restores baseline. Equipment state NOT in
persisted state after reload.

Depends on: Phase 2 (`calculateAnnualDemand` options extension for `equipmentOverrides`),
Phase 5 (EquipmentSpec provides `equipmentId` for control targets).

---

## Existing Shell Integration Map

```
workspace-shell.tsx (existing — no changes needed)
|
+-- building-scene.tsx (existing R3F Canvas)
|   +-- BuildingLayers (existing) ← MODIFIED: +mepSubVis sync, +heatmap rebuild
|   +-- EquipmentTooltip (NEW R3F) ← inserted alongside BuildingLayers
|   +-- ScenarioModeBanner (NEW) ← Html overlay inside Canvas or absolute positioned
|
+-- layer-panel.tsx (existing sidebar) ← MODIFIED: MEP expandable sub-rows
+-- energy-cards.tsx (existing bottom-left) ← UNCHANGED
+-- energy-breakdown-chart.tsx (NEW) ← below energy-cards or in new config tab
|
+-- config-tabs/ (existing right panel)
    +-- building-tab.tsx (existing — unchanged)
    +-- layers-tab.tsx (existing) ← MODIFIED: renders MepSubLayerToggles
    +-- equipment-tab.tsx (NEW) ← houses EquipmentControlPanel (Phase 6)
```

---

## Anti-Patterns

### Anti-Pattern 1: Adding New Zustand Stores for Energy Observability State

**What people do:** Create `useEquipmentStore`, `useScenarioStore`, `useHeatmapStore` as new files.

**Why it's wrong:** `use-energy-metrics.ts` documents the infinite loop risk explicitly. Each new
store subscription that feeds into energy calculations risks object reference churn across render
cycles. The codebase already has 7 stores; adding more for tightly coupled state increases that risk.

**Do this instead:** `mepSubVisibility` → `layer-store`. `equipmentOverrides` → `workflow-store`.
`scenarioOverrides` → `recipe-store`. Zero new store files for v5.0.

### Anti-Pattern 2: Coloring Structural InstancedMesh for Heatmap

**What people do:** Call `slabMesh.setColorAt(floorIndex, kwhmColor)` on the structural slab
InstancedMesh to show energy intensity per floor.

**Why it's wrong:** Cannot express a continuous gradient across a face. Requires full
`instanceColor` buffer re-upload on every energy recalculation. Hides when the structure layer is
toggled off — but the heatmap should be independently controllable via the `energy-zones` layer.

**Do this instead:** Separate `THREE.Mesh` floor planes with `vertexColors: true` in the
`energy-zones` group. Independent visibility, independent disposal, independent color buffer.

### Anti-Pattern 3: Calling Energy Calculations in useFrame or Render Body

**What people do:** Call `calculateAnnualDemand()` in `useFrame` to keep heatmap "live," or call
it in a component render function for "simplicity."

**Why it's wrong:** 50–200ms synchronous CPU call in `useFrame` = <5 fps. In render body =
recalculates on every unrelated re-render. Both are observable frame-rate regressions.

**Do this instead:** `useEnergyBreakdown` hook using `useMemo` with explicit deps. Heatmap rebuilds
only when `floorDemands` reference changes, which happens only when the underlying material/recipe
deps change.

### Anti-Pattern 4: Persisting Scenario / Equipment State

**What people do:** Include `equipmentOverrides` or `scenarioActive` in Zustand `persist`
`partialize`.

**Why it's wrong:** The amber `ScenarioModeBanner` is the only signal that displayed values are
hypothetical. If scenario state persists across reload, users see modified energy projections
without the banner context — the data appears to be the actual building state.

**Do this instead:** Explicitly exclude from `partialize`. Scenario state is transient. On reload,
users start from the committed baseline.

### Anti-Pattern 5: Copying the Raycaster-per-Frame Pattern from StructuralTooltip

**What people do:** Copy `structural-tooltip.tsx` verbatim, including `new THREE.Raycaster()` inside
`useFrame`.

**Why it's wrong:** Per-frame heap allocation. Documented performance concern in PROJECT.md.

**Do this instead:** `const raycasterRef = useRef(new THREE.Raycaster())`. Call
`raycasterRef.current.setFromCamera(...)` inside `useFrame`. This is the fix, not the pattern.

---

## Sources

- `src/lib/layers/types.ts` — `LayerId` union (5 entries confirmed), `ALL_LAYER_IDS`, `LAYER_CONFIGS` — HIGH confidence (Read)
- `src/lib/layers/layer-manager.ts` — `LayerManager` class, `COMPONENT_TO_LAYER` mapping, `setVisible()`, `disposeLayer()` — HIGH confidence (Read)
- `src/store/layer-store.ts` — `LayerState` shape, `Record<LayerId, boolean>` visibility — HIGH confidence (Read)
- `src/store/workflow-store.ts` — 3-stage workflow (`search|twin|report`), `persist` shape with `partialize` — HIGH confidence (Read)
- `src/store/recipe-store.ts` — `overrides` record, `setOverride()` dot-path pattern, isolated from `getEffectiveRecipe` — HIGH confidence (Read)
- `src/store/material-store.ts` — `overrideProperty()` pattern, `selectedElement` shape — HIGH confidence (Read)
- `src/hooks/use-energy-metrics.ts` — subscription topology, infinite-loop prevention comment, `useMemo` pattern for effectiveRecipe — HIGH confidence (Read)
- `src/lib/energy/annual-demand.ts` — function signature, degree-day model, `coolingCOP`/`heatingEfficiency` paths — HIGH confidence (Read)
- `src/components/viewer/structural-tooltip.tsx` — raycasting pattern (pointermove handler, useFrame throttle, Html popup, per-frame Raycaster allocation noted as defect) — HIGH confidence (Read)
- `src/components/viewer/energy-cards.tsx` — `useEnergyMetrics` consumption, `<Skeleton>` pattern, ECO2 integration — HIGH confidence (Read)
- `src/lib/layers/layer-3-cooling.ts` — generator pattern: `userData.type`, `userData.floorNo`, ShaderMaterial `uTime`, dispose pattern — HIGH confidence (Read)
- `src/lib/layers/layer-7-lighting.ts` — InstancedMesh pattern, `userData.type`, named component types — HIGH confidence (Read)
- `src/components/viewer/building-layers.tsx` — `useRef<LayerManager>`, dual useEffect pattern, `useFrame` for animations — HIGH confidence (Read)
- PROJECT.md — `StructuralTooltip` Raycaster-per-frame known tech debt — HIGH confidence (Read)

---

*Architecture research for: Korean BIM EMS v5.0 — Energy Systems Observability & Control*
*Researched: 2026-04-12*
