# Phase 26: Equipment Info Panel - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning
**Mode:** Auto-generated from research (UI phase with clear technical contract)

<domain>
## Phase Boundary

Click any MEP sub-layer object to open an info panel showing inferred equipment specs (type, capacity, efficiency grade, approximate age, estimated annual kWh). Every value clearly labeled "estimated". Raycaster allocated once via useRef (NOT per-frame).

</domain>

<decisions>
## Implementation Decisions

### Raycaster Pattern (Critical)
- **useRef allocation at component top level** — `const raycasterRef = useRef(new THREE.Raycaster())`
- NEVER `new THREE.Raycaster()` inside useFrame (the structural-tooltip.tsx anti-pattern)
- This is the single most important technical constraint

### Interaction Mode
- **Click (pointerup with movement threshold) — NOT hover polling**
- Click handler avoids useFrame throttle loop entirely
- Camera rotation doesn't create tooltip noise

### Data Source
- **Equipment data inferred, not user-entered**
- MEP userData.type already set by layer-3 through layer-7 generators
- Map userData.type strings → equipment categories
- Era-based install year from BuildingRecipe.pmsDay (permit date) or fallback era-midpoint

### Equipment Grade Type (Separate from Building Grade)
- **NEW type: `EquipmentEfficiencyGrade = 1 | 2 | 3 | 4 | 5`** (Korean 1~5등급)
- DO NOT conflate with existing `EnergyGrade = "1+++" | "1++" | ... | "7"` (building certification)
- Lookup table in new `src/lib/energy/equipment-specs.ts`

### State Management
- **Extend existing selection-store.ts** with `selectedEquipment: SelectedEquipmentInfo | null`
- NEVER store THREE.Object3D in React state — extract userData at click time into plain record
- SelectedEquipmentInfo = plain JSON-serializable object

### Filtering
- Raycasting filters to MEP sub-layer objects only (not structural/envelope)
- Uses mepGroup children via GENERATOR_TO_MEP_SUB mapping

### Korean Standards
- HVAC: KS B 6364 (chillers, boilers, AHUs)
- Electrical: KSC IEC 62301
- Sub-category grade boundaries are behind paywall — use era-based inference with confidence label

### Claude's Discretion
- Info panel UI location: floating popup near click vs right-dock panel
  - Recommend: right-dock panel (persistent, consistent with existing properties-panel)
- Exact copy for "estimated" label tone
- Hover highlight before click (optional polish)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/store/selection-store.ts` — extend with selectedEquipment
- `src/components/viewer/structural-tooltip.tsx` — raycasting PATTERN reference (but NOT per-frame alloc)
- `src/components/workspace/properties-panel.tsx` — right-dock panel pattern
- `src/lib/procedural/building-recipe.ts` — BuildingRecipe for equipment inference
- `src/lib/energy/energy-grade.ts` — building-level grade utilities (reference only, different scale)

### Established Patterns
- Click-to-select from 3D scene → right panel displays properties
- userData.type / userData.floorNo on MEP meshes from generators
- Era-based inference (v4.0 material selection used same pattern)

### Integration Points
- `src/lib/energy/equipment-specs.ts` — NEW file (EquipmentSpec type + inference + KS grade table)
- `src/store/selection-store.ts` — extend with selectedEquipment slice + action
- `src/components/viewer/equipment-panel.tsx` — NEW component (or extend properties-panel)
- `src/components/viewer/building-scene.tsx` — click handler with raycasting

</code_context>

<specifics>
## Specific Ideas

- Raycaster defect in structural-tooltip.tsx is confirmed (line 83 per-frame alloc) — do NOT copy that pattern
- All MEP generator outputs already have userData.type — no need to modify generators
- pmsDay (permit date) from ledger sharpens install year beyond era-midpoint

</specifics>

<deferred>
## Deferred Ideas

- Equipment control (toggle on/off, setpoint) — v5.x (CTRL-01, CTRL-02)
- Scenario store (hypothesis vs committed) — v5.x (CTRL-03)
- Hover highlight before click — polish, defer
- KS B 6364 sub-category precise thresholds — requires paywalled standard access

</deferred>
