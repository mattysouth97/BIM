# Phase 26: Equipment Info Panel — Research

**Researched:** 2026-04-12
**Domain:** Three.js raycasting against MEP sub-layer objects, equipment spec inference from BuildingRecipe, Korean efficiency grade display
**Confidence:** HIGH (all integration points verified against actual codebase)

---

## Summary

Phase 26 adds a click-to-inspect info card for MEP sub-layer objects. When the user clicks any visible MEP mesh, a floating card appears showing inferred equipment type, capacity, install year derived from the building permit date, efficiency grade, and estimated kWh/yr — every value labelled "추정 (estimated)".

The implementation extends the existing `structural-tooltip.tsx` raycasting pattern but fixes its known defect: `new THREE.Raycaster()` is currently allocated inside `useFrame` on every frame. Phase 26 MUST use `useRef(new THREE.Raycaster())` allocated once. The tooltip traverses the 4 named MEP sub-groups created by Phase 22 (`sub-mep-electrical`, `sub-mep-hvac`, `sub-mep-lighting`, `sub-mep-dhw`) rather than a single named group. Equipment specs are inferred from `BuildingRecipe.era`, `BuildingRecipe.mainPurpsCd`, and `BuildingRecipe.floors` — no manual entry, no async fetch.

**Primary recommendation:** Build `EquipmentTooltip` as a new R3F component mirroring `structural-tooltip.tsx` structure, with a `useRef`-allocated Raycaster, `intersectObjects` against visible MEP sub-group children, and a serialisable `SelectedEquipmentInfo` record stored in the existing `selection-store`. Never store a `THREE.Object3D` reference in React state.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for Phase 26. Constraints are derived from ROADMAP.md success criteria and PITFALLS.md locked patterns.

### Locked Decisions
- Raycaster allocated once via `useRef`, not per-frame (ROADMAP.md success criterion 4)
- Every value in the info card carries a visible "estimated" label — no value may appear as measured data (ROADMAP.md success criterion 2)
- Korean energy efficiency grade 1~5등급 per KS B 6364 (HVAC) or KSC IEC 62301 (electrical) (ROADMAP.md success criterion 3)
- Never store `THREE.Object3D` in React state — extract `userData` into a plain serialisable record at click time (PITFALLS.md Pitfall 9)
- `ALL_LAYER_IDS` stays at 5 entries — MEP sub-groups are nested children, not new top-level layer IDs (PITFALLS.md Pitfall 2)

### Claude's Discretion
- UI pattern: floating popup vs right-dock panel vs hover tooltip (ROADMAP.md says "UI hint: yes" but no fixed layout)
- Component file location within `src/components/viewer/`
- Whether to use `useFrame` polling or pointer-click event for detection (click is simpler for an info card vs hover tooltip)
- EquipmentSpec sub-type discrimination strategy (by `userData.type` prefix string)

### Deferred Ideas (OUT OF SCOPE)
- Equipment control / setpoint editing (Phase 24 territory)
- Scenario mode branching (Phase 25)
- ECO2 sub-system export (Phase 27)
- Real IoT / sub-metered data integration
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EQ-01 | Clicking any visible MEP mesh opens info card with inferred type, capacity, install year, kWh/yr | `userData.type` + `userData.floorNo` already set on every MEP mesh (verified in layers 3–7). `inferEquipmentSpecs()` pure function derives all fields from `BuildingRecipe`. |
| EQ-02 | Every value carries visible "estimated" label — no value appears as measured data | `EnergyDataSource` type pattern already established in `energy-cards.tsx`. Amber label with tooltip. Enforced at TypeScript type level via `dataSource: "estimated-ratio"` on `EquipmentSpec`. |
| STD-01 | Info card displays Korean energy efficiency grade (1~5등급) per KS B 6364 or KSC IEC 62301 | `getEnergyGrade()` and `GRADE_THRESHOLDS` in `energy-grade.ts` cover building-level grades. Equipment-level grades require a separate lookup table (see Architecture Patterns §Equipment Grade Inference). |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| three | (project existing) | Raycaster, intersectObjects, Object3D traversal | Project-wide Three.js — no new dependency |
| @react-three/fiber | (project existing) | `useFrame`, `useThree`, `useRef` for R3F components | Project-wide R3F — no new dependency |
| @react-three/drei | (project existing) | `<Html>` for floating DOM overlay in 3D space | Already used in `structural-tooltip.tsx` |
| zustand | (project existing) | `selection-store` for serialisable selected equipment state | Established pattern — extend existing store |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tailwindcss | (project existing) | Info card styling (amber badge for estimated, grade color pill) | All UI in project uses Tailwind |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `<Html>` popup | Right-dock panel in config tab | Dock panel never occludes the clicked object; popup is spatially anchored. For an info card (read-only), popup is cleaner. Dock is better for editable controls (Phase 24). |
| `useFrame` polling | `onClick` on R3F mesh | `onClick` on R3F mesh works only for meshes with R3F JSX wrappers; MEP sub-group geometry is generated imperatively via Three.js generators, not JSX. Must use canvas-level pointer events + manual raycasting. |

**Installation:** No new packages required. All dependencies are project-existing.

---

## Architecture Patterns

### Recommended File Layout for Phase 26
```
src/
├── lib/
│   └── energy/
│       └── equipment-specs.ts       # EquipmentSpec type + inferEquipmentSpecs() pure function
├── components/
│   └── viewer/
│       └── equipment-tooltip.tsx    # R3F component: raycaster + <Html> card
└── store/
    └── selection-store.ts           # Extended: add selectedEquipment: SelectedEquipmentInfo | null
```

### Pattern 1: Raycaster Allocated Once via useRef (MANDATORY)

The existing `structural-tooltip.tsx` allocates `new THREE.Raycaster()` INSIDE `useFrame` — this is a known defect (heap allocation every frame at 60fps). Phase 26 MUST NOT replicate this.

**WRONG (do not copy from structural-tooltip.tsx line 83):**
```typescript
useFrame(() => {
  const raycaster = new THREE.Raycaster(); // new object every frame — tech debt
  raycaster.setFromCamera(mouse.current, camera);
});
```

**CORRECT for EquipmentTooltip:**
```typescript
// Source: .planning/research/ARCHITECTURE.md §Equipment Info Panel
const raycasterRef = useRef(new THREE.Raycaster());

useFrame(() => {
  frameCount.current = (frameCount.current + 1) % 3;
  if (frameCount.current !== 0) return;

  raycasterRef.current.setFromCamera(mouse.current, camera);
  const hits = raycasterRef.current.intersectObjects(mepTargets, true);
});
```

### Pattern 2: Click-Based Detection (not hover polling)

For an info card (persistent, not hover tooltip), use a `pointerdown` listener rather than `useFrame` polling. This avoids running raycasting every 3 frames when the user is just rotating the camera.

```typescript
// Source: verified against canvas event model in structural-tooltip.tsx
useEffect(() => {
  const canvas = gl.domElement;

  const onClick = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    mouse.current.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycasterRef.current.setFromCamera(mouse.current, camera);

    // Collect visible MEP sub-group children
    const targets: THREE.Object3D[] = [];
    MEP_SUB_IDS.forEach((subId) => {
      if (!mepSubVisibility[subId]) return;
      const subGroup = scene.getObjectByName(`sub-${subId}`);
      if (subGroup) subGroup.traverse(o => { if ((o as THREE.Mesh).isMesh) targets.push(o); });
    });

    const hits = raycasterRef.current.intersectObjects(targets, false);
    if (hits.length > 0) {
      const obj = hits[0].object;
      const info = extractEquipmentInfo(obj, buildingPk, recipe);
      if (info) useSelectionStore.getState().select("component", info.equipmentId, buildingPk);
      // Store serialisable info — NOT the THREE.Object3D
    } else {
      useSelectionStore.getState().clearSelection();
    }
  };

  canvas.addEventListener("pointerdown", onClick);
  return () => canvas.removeEventListener("pointerdown", onClick);
}, [gl.domElement, camera, scene, mepSubVisibility, buildingPk, recipe]);
```

### Pattern 3: SelectedEquipmentInfo — Serialisable Record (MANDATORY)

Never store a `THREE.Object3D` reference in React state or a Zustand store.

```typescript
// Source: .planning/research/PITFALLS.md Pitfall 9
// Extend src/store/selection-store.ts:

export interface SelectedEquipmentInfo {
  equipmentId: string;          // e.g. "mep-hvac-floor-3-cooling-branch"
  subLayerId: MepSubLayerId;    // which MEP sub-layer was hit
  componentType: string;        // userData.type from the hit mesh, e.g. "cooling-branch"
  floorNo: number | null;       // userData.floorNo if present
  specs: EquipmentSpec;         // inferred at click time — plain serialisable object
}

// In SelectionState interface (additive — no existing fields removed):
selectedEquipment: SelectedEquipmentInfo | null;
selectEquipment: (info: SelectedEquipmentInfo) => void;
clearEquipment: () => void;
```

### Pattern 4: EquipmentSpec Type Design

All fields carry a `dataSource` discriminant enforced at the TypeScript level so no UI component can accidentally render a value without its provenance.

```typescript
// src/lib/energy/equipment-specs.ts
export type EquipmentDataSource = "estimated-from-era" | "estimated-from-recipe";

export interface EquipmentSpec {
  /** Korean equipment category label */
  categoryKo: string;
  /** English category label */
  categoryEn: string;
  /** Capacity with unit, e.g. "12 kW" or "500 W/fixture" */
  capacity: string;
  /** Approximate install year derived from building permit date */
  installYear: number;
  /** Estimated annual consumption for this system/floor */
  annualKwh: number;
  /** Equipment-level efficiency grade (1~5 scale for KS B 6364 / KSC IEC 62301) */
  efficiencyGrade: EquipmentEfficiencyGrade;
  /** Korean grade label, e.g. "1등급 (우수)" */
  efficiencyGradeLabel: string;
  /** Color hex for the grade badge */
  gradeColor: string;
  dataSource: EquipmentDataSource;
}

/** KS B 6364 / KSC IEC 62301 equipment efficiency grades (1 = best, 5 = worst) */
export type EquipmentEfficiencyGrade = 1 | 2 | 3 | 4 | 5;
```

### Pattern 5: Equipment Spec Inference from BuildingRecipe

`inferEquipmentSpecs()` is a pure synchronous function — no async, no store reads, no hooks. All inputs come from the `BuildingRecipe` already available in the scene.

**Inference strategy by `userData.type` prefix:**

| userData.type prefix | MEP Sub-Layer | Korean Standard | Inference Rule |
|---------------------|---------------|-----------------|----------------|
| `cooling-*` | mep-hvac | KS B 6364 (HVAC) | COP inferred from era: pre-2000 → grade 4-5, 2000-2009 → grade 3, 2010+ → grade 2, 2020+ → grade 1 |
| `heating-*` | mep-hvac | KS B 6364 (HVAC) | Efficiency inferred from era: pre-1990 → grade 5, 1990-1999 → grade 4, 2000+ → grade 3, 2010+ → grade 2 |
| `vent-*` | mep-hvac | KS B 6364 | SFP (specific fan power) inferred from era |
| `lighting-*` | mep-lighting | KSC IEC 62301 | Lamp type inferred from era: pre-1990 → fluorescent/grade 4, 1990-2009 → T8/grade 3, 2010+ → LED/grade 1-2 |
| `dhw-*` | mep-dhw | KS B 6364 | Storage type inferred from era; efficiency from use code (residential vs commercial) |
| `shell-*` (electrical) | mep-electrical | KSC IEC 62301 | Panel load inferred from floor area and use code |
| `microgrid-*` | mep-electrical | KSC IEC 62301 | PV/BESS — grade 1 always |

**Install year derivation:**
```typescript
// installYear is derived from BuildingRecipe.era (no permit date field in BuildingRecipe).
// Use era midpoint as conservative estimate.
const ERA_INSTALL_YEAR: Record<BuildingEra, number> = {
  "pre-1970":  1965,
  "1970-1989": 1979,
  "1990-1999": 1994,
  "2000-2009": 2004,
  "2010-2019": 2014,
  "2020+":     2022,
};
```

**Annual kWh estimate:**
- For HVAC: proportion of `calculateAnnualDemand()` output (heating/cooling fraction per floor)
- For lighting: `W/m² × floor area × operating hours` (use-type based operating hours from ASHRAE 90.1 defaults)
- For DHW: fraction of total based on use code and floor area
- For electrical/plug: residual after HVAC + lighting + DHW

### Pattern 6: Korean Equipment Grade Inference Rules

The building-level `EnergyGrade` (1+++ to 7) in `energy-grade.ts` is a different scale from equipment-level grades (1–5). Phase 26 needs a separate lookup:

**KS B 6364 HVAC grades (inferred from era, not measurement):**
```typescript
const HVAC_ERA_GRADE: Record<BuildingEra, EquipmentEfficiencyGrade> = {
  "pre-1970":  5,  // pre-standard equipment
  "1970-1989": 5,
  "1990-1999": 4,
  "2000-2009": 3,
  "2010-2019": 2,
  "2020+":     1,
};
```

**KSC IEC 62301 electrical appliance grades (inferred from era):**
```typescript
const ELECTRICAL_ERA_GRADE: Record<BuildingEra, EquipmentEfficiencyGrade> = {
  "pre-1970":  5,
  "1970-1989": 5,
  "1990-1999": 4,
  "2000-2009": 3,
  "2010-2019": 2,
  "2020+":     1,
};
```

**Grade display labels (Korean):**
```typescript
const EQUIPMENT_GRADE_LABELS: Record<EquipmentEfficiencyGrade, string> = {
  1: "1등급 (우수)",
  2: "2등급 (양호)",
  3: "3등급 (보통)",
  4: "4등급 (미흡)",
  5: "5등급 (불량)",
};
```

Note: KS B 6364 and KSC IEC 62301 both use 1~5 grade scales for equipment efficiency. The building-level 1+++~7 scale in `energy-grade.ts` is a separate certification system and must NOT be confused with equipment grades.

### Pattern 7: Info Card UI — Floating Html Popup

Based on the existing `<Html>` popup in `structural-tooltip.tsx` and the ARCHITECTURE.md note that this phase needs a "richer card". Recommended approach: floating popup anchored to the hit point, with an amber "추정" badge on every value field.

```typescript
// Source: structural-tooltip.tsx Html pattern
<Html position={hitPoint} center style={{ pointerEvents: "none" }}>
  <div className="rounded-lg border border-zinc-700 bg-zinc-900/95 p-3 text-xs shadow-xl w-52">
    {/* Header */}
    <div className="flex items-center justify-between mb-2">
      <span className="font-semibold text-white">{spec.categoryKo}</span>
      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold"
            style={{ background: spec.gradeColor, color: "#fff" }}>
        {spec.efficiencyGradeLabel}
      </span>
    </div>
    {/* Each row: label + value + amber estimated badge */}
    <SpecRow label="용량" value={spec.capacity} />
    <SpecRow label="설치연도" value={`약 ${spec.installYear}년`} />
    <SpecRow label="연간 소비" value={`${spec.annualKwh.toLocaleString()} kWh/년`} />
    {/* Amber estimated disclaimer */}
    <div className="mt-2 text-[10px] text-amber-400">
      ⚠ 추정값 — 실측 데이터 아님
    </div>
  </div>
</Html>
```

A dismiss button or clicking elsewhere clears `selection-store.selectedEquipment`.

### Pattern 8: MEP Sub-Group Traversal (depends on Phase 22)

Phase 26 **depends on Phase 22** having created the named sub-groups inside the `mep` THREE.Group. The traversal uses `scene.getObjectByName("sub-mep-hvac")` etc. If Phase 22 is not complete, `getObjectByName` returns undefined and raycasting produces no hits — correct graceful degradation.

```typescript
// Collect raycast targets from visible MEP sub-groups only
const targets: THREE.Mesh[] = [];
for (const subId of MEP_SUB_IDS) {
  if (!mepSubVisibility[subId]) continue; // skip hidden sub-layers
  const subGroup = scene.getObjectByName(`sub-${subId}`);
  if (!subGroup) continue;
  subGroup.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) targets.push(obj as THREE.Mesh);
  });
}
```

### Anti-Patterns to Avoid

- **Allocating Raycaster in useFrame:** `new THREE.Raycaster()` inside `useFrame` allocates ~3KB on the heap 60 times/second. Always use `useRef(new THREE.Raycaster())`.
- **Storing THREE.Object3D in React state:** GPU memory leak when scene rebuilds. Extract `userData` at click time, store only the plain record.
- **Adding MEP equipment types to ALL_LAYER_IDS:** Sub-layers are nested children of `mep` group, not top-level layers. `ALL_LAYER_IDS` must remain at 5 entries.
- **Using building-level EnergyGrade (1+++ to 7) for equipment display:** Equipment grade is a 1~5 scale (KS B 6364). Displaying "1+++" for a chiller is incorrect.
- **Presenting inferred grade as certified:** All grades must carry the amber "추정" label. KS B 6364 / KSC IEC 62301 certification requires actual measurement.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 3D hit detection | Custom BVH traversal or manual geometry intersection | `THREE.Raycaster.intersectObjects()` | Three.js raycaster handles InstancedMesh, BVH, recursion — edge cases in custom code are extensive |
| Floating DOM overlay in 3D canvas | Absolute-positioned React portal with manual coordinate projection | `@react-three/drei <Html>` | Handles camera projection, occlusion, z-index, and canvas resize automatically |
| Korean grade color palette | Custom hex table | `getGradeColor()` from `energy-grade.ts` (building grade) + `EQUIPMENT_GRADE_COLORS` table for 1–5 scale | Color consistency across all energy visualizations |
| Building era → install year mapping | Inline ternary chains | `ERA_INSTALL_YEAR` lookup table in `equipment-specs.ts` | Single source of truth; era boundaries already defined in `recipe.ts` |

**Key insight:** The raycasting infrastructure (Raycaster, canvas event handling, Html overlay) is already proven in `structural-tooltip.tsx`. Phase 26 only needs to extend the target set and enrich the displayed data.

---

## Common Pitfalls

### Pitfall 1: Per-Frame Raycaster Allocation (CRITICAL — in existing code)
**What goes wrong:** `structural-tooltip.tsx` line 83 allocates `new THREE.Raycaster()` inside `useFrame`. Copying this file creates the same defect.
**Why it happens:** The existing file is the natural template. The allocation is one line that looks harmless.
**How to avoid:** Declare `const raycasterRef = useRef(new THREE.Raycaster())` at component top level. Call `raycasterRef.current.setFromCamera(...)` inside the event handler.
**Warning signs:** React DevTools Memory profiler shows `Raycaster` objects accumulating; GC pressure spikes during camera rotation.

### Pitfall 2: THREE.Object3D Reference in Selection State
**What goes wrong:** Click handler stores `hits[0].object` (a `THREE.Mesh`) in Zustand. When `LayerManager.disposeLayer("mep")` runs on building change, the Three.js object is disposed but the React/Zustand reference keeps it alive in GPU memory.
**Why it happens:** `hits[0].object.userData` has all the needed info. Storing the object directly feels natural.
**How to avoid:** At click time, read `obj.userData.type`, `obj.userData.floorNo`, compute `EquipmentSpec` via `inferEquipmentSpecs()`, and store only the resulting `SelectedEquipmentInfo` plain object.
**Warning signs:** Equipment card shows stale data after navigating to a different building; `renderer.info.memory.geometries` grows across building switches.

### Pitfall 3: Confusing Building Grade Scale with Equipment Grade Scale
**What goes wrong:** `energy-grade.ts` exports `EnergyGrade` ("1+++" to "7"). Phase 26 needs equipment grades (1–5 per KS B 6364). Using `getEnergyGrade()` for equipment produces nonsense values (a 1995 boiler showing "3등급" on the building certification scale).
**Why it happens:** `energy-grade.ts` is the obvious grade reference in the codebase.
**How to avoid:** Create a separate `EQUIPMENT_GRADE_LABELS` and `EquipmentEfficiencyGrade` type (1 | 2 | 3 | 4 | 5) in `equipment-specs.ts`. Never import `EnergyGrade` into equipment spec inference.

### Pitfall 4: Raycasting Against All Scene Objects Instead of MEP Sub-Groups Only
**What goes wrong:** `raycaster.intersectObjects(scene.children, true)` hits structural columns, envelope glass, and heatmap planes — not just MEP objects. The first hit may be a slab or wall with no `userData.type` in the MEP domain.
**Why it happens:** `scene.children` is the simplest target list.
**How to avoid:** Collect targets by traversing only the `sub-mep-*` named groups. Filter by `(obj as THREE.Mesh).isMesh` to exclude Groups and Lights.

### Pitfall 5: Click Handler Fires During Camera Orbit
**What goes wrong:** `pointerdown` fires at the start of an OrbitControls drag. The user tries to rotate the camera but instead selects MEP equipment.
**Why it happens:** `pointerdown` does not distinguish a click from the start of a drag.
**How to avoid:** Use `pointerup` with a movement threshold (< 5px delta between `pointerdown` and `pointerup` position). Alternatively, listen to `click` events — OrbitControls suppresses `click` when a drag occurs (verified in Three.js OrbitControls source).

### Pitfall 6: Phase 22 Sub-Groups Not Yet Created
**What goes wrong:** `scene.getObjectByName("sub-mep-hvac")` returns undefined if Phase 22 is not implemented. Raycasting produces no hits. The info card never appears.
**Why it happens:** Phase 26 depends on Phase 22. Running Phase 26 first silently fails.
**How to avoid:** Guard with an early return when no sub-groups are found; log a warning in development: `console.warn("[EquipmentTooltip] No MEP sub-groups found — Phase 22 required")`.

---

## Code Examples

Verified patterns from codebase:

### Existing userData.type Values in MEP Domain
```typescript
// Source: verified via Grep across src/lib/layers/layer-3-cooling.ts through layer-7-lighting.ts

// HVAC sub-layer (cooling):
"cooling-plant" | "cooling-riser" | "cooling-return-riser" | "cooling-branch" | "cooling-flow-particles"

// HVAC sub-layer (heating):
"heating-boiler" | "heating-riser" | "heating-return-riser" | "heating-floor-pipe" | "heating-radiant-zone"

// HVAC sub-layer (ventilation):
"vent-ahu" | "vent-airflow" | "vent-duct"

// Lighting sub-layer:
"lighting-fixture" | "lighting-sensor" | "lighting-panel"

// DHW sub-layer:
"dhw-storage-tank" | "dhw-recirc-tank" | "dhw-riser" | "dhw-branch" | "dhw-return" | "dhw-fixture"

// Electrical sub-layer (from layer-1-shell):
"shell-slab" | "shell-column" | "shell-core-wall" | "shell-envelope"
// Note: layer-1-shell is designated mep-electrical per mep-coordinator mapping
```

### floorNo Availability in MEP userData
```typescript
// Source: verified in layer-3-cooling.ts, layer-4-heating.ts, layer-6-dhw.ts
// These types carry floorNo:
{ type: "cooling-branch",      floorNo: floor.floorNo }
{ type: "heating-floor-pipe",  floorNo: floor.floorNo }
{ type: "heating-radiant-zone",floorNo: floor.floorNo }
{ type: "vent-airflow",        floorNo: floor.floorNo }
{ type: "vent-duct",           floorNo: floor.floorNo }
{ type: "dhw-branch",          floorNo: floor.floorNo, zone: zone.name }
{ type: "dhw-return",          floorNo: floor.floorNo, zone: zone.name }
{ type: "dhw-fixture",         floorNo: floor.floorNo, zone: zone.name }

// These types do NOT carry floorNo (building-level equipment):
{ type: "cooling-plant" }
{ type: "heating-boiler" }
{ type: "vent-ahu" }
{ type: "dhw-storage-tank" }
{ type: "lighting-panel" }
```

### BuildingRecipe Fields Used for Equipment Inference
```typescript
// Source: src/lib/procedural/types.ts — verified
recipe.era          // BuildingEra — drives installYear + efficiencyGrade
recipe.mainPurpsCd  // string — drives load density and DHW type
recipe.floors       // FloorSpec[] — count drives capacity estimates
recipe.footprintWidth * recipe.footprintDepth  // floor area for W/m² loads
```

### Existing Grade Infrastructure
```typescript
// Source: src/lib/energy/energy-grade.ts — verified
// These are BUILDING-LEVEL grades (1+++ to 7). Do NOT use for equipment.
getEnergyGrade(demandPerSqm: number): EnergyGrade
GRADE_THRESHOLDS: Record<EnergyGrade, number>  // kWh/m²/yr
getGradeColor(grade: EnergyGrade): string       // hex colors

// Source: src/lib/compliance/efficiency-rating.ts — verified
// Also building-level. Separate thresholds for residential vs non-residential.
calculateEfficiencyRating(...)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hover tooltip (structural-tooltip pattern) | Click-to-inspect info card | Phase 26 design | Click is appropriate for persistent info cards; hover is appropriate for ephemeral labels |
| Single MEP group | 4 named sub-groups (Phase 22) | Phase 22 | Enables filtering raycasting to specific sub-systems |
| Per-frame Raycaster allocation | `useRef` allocated once | Phase 26 (fixes structural-tooltip tech debt) | Eliminates GC pressure from frame-rate heap allocations |

---

## Open Questions

1. **KS B 6364 sub-categories: chiller vs boiler vs AHU**
   - What we know: KS B 6364 covers HVAC equipment efficiency broadly. The standard has sub-categories per equipment type.
   - What's unclear: Whether the 1–5 grade scale applies uniformly to chillers, boilers, and AHUs, or whether sub-categories have different scales.
   - Recommendation: Use a unified 1–5 scale with era-based inference for all HVAC sub-types. Label cards with "KS B 6364 기준 추정" to be explicit about the inference basis. Actual KS B 6364 text is behind a paywall (KATS); this research cannot verify sub-category scales without access.
   - Confidence: LOW on sub-category granularity; HIGH that a 1–5 scale is the right display format.

2. **Permit date vs era for installYear**
   - What we know: `BuildingRecipe` has an `era: BuildingEra` field (a bucketed range like "2000-2009"), not a precise permit year.
   - What's unclear: Whether the ledger API returns a permit date (`pmsDay`) that could sharpen the estimate.
   - Recommendation: Use `ERA_INSTALL_YEAR` midpoint for now. If `pmsDay` is available in the building data passed to the recipe factory, pass it through as `permitYear?: number` on `BuildingRecipe` and use it in `inferEquipmentSpecs()`.
   - Confidence: HIGH on era-midpoint fallback; MEDIUM on whether `pmsDay` is available.

3. **Click vs hover UX for the info card**
   - What we know: `structural-tooltip.tsx` uses hover + `useFrame` polling. The ROADMAP says "UI hint: yes" for Phase 26 but does not specify.
   - What's unclear: Whether the GX team prefers hover (immediate) or click (intentional, persistent).
   - Recommendation: Implement click (pointerup with movement threshold). Hover creates visual noise when rotating the camera over MEP geometry. An info card with multiple fields benefits from persistence (user can read it). Click also avoids the `useFrame` throttle overhead.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — Phase 26 is code-only, all libraries are project-existing)

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (detected: `src/lib/layers/__tests__/` pattern, layer-15-structural.test.ts verified) |
| Config file | Check for `vitest.config.ts` in project root |
| Quick run command | `pnpm vitest run src/lib/energy/equipment-specs.test.ts` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EQ-01 | `inferEquipmentSpecs()` returns correct type, capacity, installYear, annualKwh for each userData.type prefix | unit | `pnpm vitest run src/lib/energy/equipment-specs.test.ts` | ❌ Wave 0 |
| EQ-02 | All `EquipmentSpec` fields have `dataSource: "estimated-from-era"` — no field omits provenance | unit | `pnpm vitest run src/lib/energy/equipment-specs.test.ts` | ❌ Wave 0 |
| STD-01 | `EQUIPMENT_GRADE_LABELS` covers all 5 grades; era → grade mapping is monotonically correct (newer era = better grade) | unit | `pnpm vitest run src/lib/energy/equipment-specs.test.ts` | ❌ Wave 0 |
| EQ-01 | `SelectedEquipmentInfo` is a plain serialisable object (no THREE.js properties) | unit | `pnpm vitest run src/store/selection-store.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run src/lib/energy/equipment-specs.test.ts`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/energy/equipment-specs.test.ts` — covers EQ-01, EQ-02, STD-01 (type inference, grade mapping, dataSource presence)
- [ ] `src/store/selection-store.test.ts` — verifies `selectedEquipment` is typed as `SelectedEquipmentInfo`, not `THREE.Object3D`

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 26 |
|-----------|-------------------|
| Next.js 16 App Router + React 19 + TypeScript | All new files must be TypeScript; use `"use client"` for R3F components |
| `src/components/viewer/` for Three.js viewer components | `equipment-tooltip.tsx` goes here |
| Three.js `three-stdlib` types conflict with drei v10 OrbitControls — use `any` ref type | If `OrbitControls` ref is needed in `equipment-tooltip.tsx`, use `any` |
| InstancedMesh `setMatrixAt` must be followed by `instanceMatrix.needsUpdate = true` | Not directly relevant — Phase 26 reads, does not write to InstancedMesh |
| `useHydration()` hook before reading store in SSR context | `equipment-tooltip.tsx` is an R3F component (client-only, inside Canvas) — no SSR concern |
| SAOPass disabled — must not re-enable | Phase 26 adds no post-processing; confirm `building-scene.tsx` SAOPass comment remains |
| `pnpm build` to check type errors | Run before marking any plan complete |

---

## Sources

### Primary (HIGH confidence)
- `src/components/viewer/structural-tooltip.tsx` — verified raycasting pattern (and per-frame allocation defect at line 83)
- `src/lib/procedural/types.ts` — `BuildingRecipe`, `FloorSpec`, `BuildingEra` type definitions
- `src/lib/energy/energy-grade.ts` — `EnergyGrade` (1+++ to 7), `getEnergyGrade()`, `GRADE_THRESHOLDS`, `getGradeColor()`
- `src/lib/compliance/efficiency-rating.ts` — `EfficiencyGrade`, `RESIDENTIAL_THRESHOLDS`, `NON_RESIDENTIAL_THRESHOLDS`
- `src/store/selection-store.ts` — current `SelectedEquipmentInfo` extension point
- `src/lib/layers/layer-3-cooling.ts` through `layer-7-lighting.ts` — all `userData.type` values and `floorNo` availability (verified via Grep)
- `.planning/research/ARCHITECTURE.md` §3 Equipment Info Panel — integration blueprint, Raycaster useRef pattern, `EquipmentTooltip` design
- `.planning/research/PITFALLS.md` Pitfall 9 — THREE.Object3D in React state; Pitfall 2 — MEP sub-layer proliferation
- `.planning/ROADMAP.md` Phase 26 — success criteria, requirements EQ-01, EQ-02, STD-01

### Secondary (MEDIUM confidence)
- Korean Building Energy Efficiency Rating standard (MOTIE/KEMCO) — grade thresholds confirmed via `efficiency-rating.ts` comments and existing codebase documentation
- KS B 6364 (HVAC equipment efficiency) — 1~5 grade scale referenced in ROADMAP.md; sub-category specifics not verified (standard behind KATS paywall)
- KSC IEC 62301 (electrical appliance standby power) — referenced in ROADMAP.md; 1~5 grade scale assumed consistent with KS B 6364 format

### Tertiary (LOW confidence)
- KS B 6364 sub-category grade boundaries (chiller vs boiler vs AHU) — not independently verified; era-based inference is a proxy

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are project-existing, no new dependencies
- Architecture: HIGH — all integration points (userData types, BuildingRecipe fields, selection-store, structural-tooltip pattern) verified in actual codebase
- Equipment grade rules (era → grade mapping): MEDIUM — era-based inference is reasonable engineering judgment; actual KS B 6364 equipment-level thresholds require standard access
- KS B 6364 sub-category granularity: LOW — not independently verified

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable domain — all dependencies are project-internal)
