# Pitfalls Research

**Domain:** Energy systems observability and equipment control added to an existing Three.js BIM viewer (heatmaps, MEP sub-layers, equipment control, scenario branching) — Korean BIM Energy Management System v5.0
**Researched:** 2026-04-12
**Confidence:** HIGH (code-grounded on existing codebase) / MEDIUM (Three.js forum-validated rendering patterns) / LOW (optimistic-update + building control — no authoritative Korean BIM reference found)

---

## Critical Pitfalls

### Pitfall 1: Heatmap on InstancedMesh Requires ShaderMaterial, Not setColorAt

**What goes wrong:**
The existing `structure-generator.ts` and `facade-generator.ts` use `InstancedMesh` with `MeshStandardMaterial`. When adding energy heatmaps (e.g., heat-loss intensity per floor slab), the instinctive approach is to call `mesh.setColorAt(instanceId, color)` and set `mesh.instanceColor.needsUpdate = true`. This works to tint instances uniformly, but:

1. `setColorAt` sets a single flat color per instance. It cannot express a gradient across the faces of one slab (e.g., hot at the perimeter, cool in the center).
2. `MeshStandardMaterial` with `vertexColors: true` reads the `color` attribute from the base geometry — which is shared across all instances. Per-instance vertex-level variation requires a custom `ShaderMaterial` with an `InstancedBufferAttribute` for the heat scalar.
3. Every call to `instanceColor.needsUpdate = true` re-uploads the entire instance buffer to the GPU, even if only one instance changed. With 7–12 draw calls and 50+ floor slabs per building, this means the whole slab buffer is re-uploaded every time a slider moves in the config panel.

**Why it happens:**
`setColorAt` looks like the right API, and it works for simple tinting. The need for a custom shader only becomes apparent when the design calls for gradient-within-instance or when performance issues emerge from full-buffer re-uploads on every energy recalculation.

**How to avoid:**
Use a dedicated `EnergyHeatmapMesh` component that is a plain `THREE.Mesh` (not InstancedMesh) with `vertexColors: true` and a pre-baked Float32 color buffer computed from the energy scalar. For the `energy-zones` layer, replace or supplement the InstancedMesh slabs with per-floor plane geometry that holds vertex color data. This gives full gradient control per face and avoids polluting the structural `InstancedMesh` with energy-specific state. When the energy values change (slider moved, scenario switched), only re-upload the specific floor's color buffer — not the entire instance array.

If InstancedMesh must be reused (for draw-call budget), use an `InstancedBufferAttribute` for a `heatScalar` float and inject it into a custom `onBeforeCompile` hook on the material rather than replacing the entire material.

**Warning signs:**
- `mesh.instanceColor.needsUpdate = true` called inside a Zustand subscription that fires on every slider change
- Heatmap appears as a flat solid color per slab rather than a spatial gradient
- Frame rate drops when the config panel is open and a slider is being dragged

**Phase to address:**
Phase 22 (Energy Heatmap Layer) — Define the heatmap rendering contract before any energy visualization geometry is added. Never retrofit heatmap onto the structural InstancedMesh.

---

### Pitfall 2: Layer System Explosion — MEP Sub-Layer Proliferation

**What goes wrong:**
The current system has 5 layers (`envelope`, `structure`, `mep`, `energy-zones`, `retrofit-targets`) with a single `THREE.Group` each. v5.0 requires individual toggles for electrical distribution, HVAC ducts/units, lighting zones, stairs/elevators. The naive approach is to add one `LayerId` per sub-system: `mep-electrical`, `mep-hvac-ducts`, `mep-hvac-units`, `mep-lighting`, `mep-transport`. This grows `ALL_LAYER_IDS` from 5 to 9+, and with it:

- The `useLayerStore` `visibility` record doubles in width
- Every component subscribing to `useLayerStore((s) => s.visibility)` now receives a new object reference on any sub-layer toggle, re-rendering all layer subscribers even when only one sub-layer changed
- The `LayerManager` constructor pre-creates one `THREE.Group` per layer ID — adding 4 sub-layers adds 4 always-present groups, each traversed in `updateAnimations()` every frame even when hidden
- The `LayerPanel` UI either becomes a flat list of 9+ toggles (confusing) or requires a two-level parent/child toggle hierarchy that the current data model does not support

**Why it happens:**
The existing flat `LayerId` union type makes it easy to add sub-layers by extending the union. The performance and UX costs of a flat expansion are not immediately visible in development with a single building.

**How to avoid:**
Model MEP sub-systems as a nested structure, not as top-level `LayerId` values. Keep `LayerId` at 5 entries. Add a `MepSubLayer` type and a separate `mepSubVisibility` record in `layer-store.ts`. The `mep` `THREE.Group` becomes a parent with named child groups for each sub-system. Visibility of a MEP sub-group is controlled imperatively on the child group, not through a separate top-level Zustand key. This means:

```typescript
// layer-store.ts addition — no new LayerId entries
mepSubVisibility: Record<MepSubLayerId, boolean>;
toggleMepSub: (id: MepSubLayerId) => void;
```

The `LayerPanel` renders MEP as an expandable section with sub-toggles. `updateAnimations()` traversal stays bounded to 5 top-level groups.

**Warning signs:**
- `ALL_LAYER_IDS` grows beyond 7 entries
- `LayerPanel` shows more than 6–7 flat toggle rows
- `useLayerStore((s) => s.visibility)` subscription fires for ALL subscribers when a sub-layer changes

**Phase to address:**
Phase 22 (MEP Sub-Layer Architecture) — Design the nested sub-layer model before any MEP sub-system geometry is generated. Retrofitting the data model after 4 sub-systems are wired into `ALL_LAYER_IDS` requires touching every consumer.

---

### Pitfall 3: Energy Accuracy Theater — Estimated Data Presented as Measured

**What goes wrong:**
The existing `useEnergyMetrics` hook computes energy demand from `inferMaterialProperties()` (era-based Korean building code inference) and the procedural `BuildingRecipe`. The result is a model-based estimate. The `useActualEnergy` hook fetches real consumption records from the data.go.kr API.

v5.0 adds an energy dashboard with breakdown by system type (HVAC, lighting, plug loads). This breakdown cannot come from actual consumption data — the API returns total kWh per billing period, not sub-metered by system. Developers generate the sub-system breakdown by applying assumed ratios (e.g., HVAC = 55% of total, lighting = 25%). If these percentages are displayed in the same UI panel as actual consumption data without clear labeling, users (energy auditors on the GX team) interpret the sub-system breakdown as metered data. This leads to incorrect retrofit recommendations and erodes trust when the numbers do not match reality.

**Why it happens:**
It is tempting to fill a dashboard with numbers that look authoritative. The ratio-based breakdown is internally consistent and not visually distinguishable from measured data. The missing label is invisible to the developer who generated the rationale.

**How to avoid:**
Apply a strict two-track labeling system enforced at the type level:

```typescript
type EnergyDataSource = "modeled" | "actual" | "estimated-ratio";
interface EnergyBreakdownItem {
  label: string;
  value: number;
  unit: string;
  source: EnergyDataSource;
}
```

Any UI component that renders energy values must accept and display `source`. Use distinct visual treatments: actual data gets a blue badge ("실측 데이터"), modeled values get a grey label "(모델)", ratio-distributed values get an amber label with a tooltip explaining the assumption ("추정 비율 — ASHRAE 90.1 참조"). The `EnergyCards` component already implements a partial version of this pattern — extend it rather than creating a new parallel dashboard that omits provenance.

**Warning signs:**
- Energy breakdown chart values sum to exactly the total consumption without any variance
- A sub-system bar chart uses the same visual style as the "실측 데이터" badge
- No tooltip or footnote explains where system-level percentages come from

**Phase to address:**
Phase 23 (Energy Dashboard) — Define the `EnergyDataSource` type and UI treatment contract before any dashboard component renders a number. Enforce via TypeScript: any component that accepts an energy value must also accept a `source` prop.

---

### Pitfall 4: Optimistic Equipment Control Diverges from Actual Building State

**What goes wrong:**
v5.0 adds basic equipment control: toggle HVAC on/off, adjust setpoints, see energy impact. The React store reflects the user's intended state. There is no real building control API — the "actual" state is simulated. However, the energy model recalculates immediately on toggle, and the 3D visualization updates the heatmap in real time. This creates a false feedback loop: users believe they are seeing actual energy impact, but they are seeing a re-run of the estimation model with one parameter changed.

The specific failure mode: a user turns off the HVAC in the scenario and observes a 30% energy reduction in the heatmap. They report this as a factual finding in a retrofit analysis. The number is the model's response to a changed input parameter, not a validated simulation. If the model's HVAC efficiency assumptions are wrong for this building (common for older Korean buildings where inferred data diverges from reality), the reported saving is misleading.

**Why it happens:**
Interactive sliders with live feedback are a strong UX affordance. The line between "scenario modeling" and "accurate prediction" blurs when the UI provides no indication of which mode is active.

**How to avoid:**
Introduce an explicit "Scenario Mode" / "What-If" affordance that is visually distinct from the default view:

- When the user activates equipment control, enter a named scenario state (e.g., `scenarioActive: true` in `workflow-store`)
- The 3D viewport gains a colored border or banner: "시나리오 모드 — 실제 데이터가 아님"
- Energy metrics shown during scenario mode use the amber "추정" label, not the green "실측" label
- The scenario is discarded on building navigation unless explicitly saved
- The `workflow-store` `CommandHistory` already supports undo — wire equipment control changes through it so they are undoable and clearly distinct from persistent material edits

**Warning signs:**
- Equipment toggle and energy recalculation happen in the same Zustand action with no scenario flag
- The energy grade badge changes color when HVAC is toggled, with no visual distinction from the baseline
- No "exit scenario" or "reset to baseline" affordance exists

**Phase to address:**
Phase 24 (Equipment Control) — The scenario mode concept must be established in the `workflow-store` before any equipment control UI is built. Equipment state must never modify the base `BuildingRecipe` — it operates on a separate scenario overlay.

---

### Pitfall 5: What-If Scenario Branching Mutates the Base Recipe

**What goes wrong:**
The existing `recipe-store` has `baseRecipes[pk]` and `overrides[pk]`. Material edits go into `overrides`. When scenario branching is added (compare baseline vs. HVAC upgrade vs. insulation retrofit), a common mistake is to use the existing `overrides` mechanism for scenario parameters and clear/restore them when switching scenarios. This approach breaks:

1. The user's manual material edits (wall insulation thickness, glazing U-value) are stored in `overrides`. A scenario that clears `overrides` destroys the user's authored work.
2. Two scenarios cannot be compared simultaneously if they share the same `overrides` slot.
3. Undo history (via `CommandHistory`) applies to all overrides uniformly — undoing in Scenario B reverts Scenario A's changes.

**Why it happens:**
`overrides` appears to be the natural extension point for any "non-base" value. The distinction between "user-authored property" and "scenario hypothesis" is not encoded in the type system.

**How to avoid:**
Add a third layer to the recipe stack: `scenarioOverrides[pk][scenarioId]`. The effective recipe for scenario comparison is `merge(baseRecipe, userOverrides, scenarioOverrides[activeScenario])`. The `scenarioOverrides` are never touched by the config panel sliders and are never included in the undo history. The `recipe-store` needs a new `scenarioOverrides` record and `setScenarioOverride` / `clearScenario` actions. Baseline scenario (`scenarioId = "baseline"`) has empty `scenarioOverrides`, so the effective recipe equals `merge(base, userOverrides)` — identical to current behavior.

**Warning signs:**
- Switching scenarios clears the `overrides` record for the building PK
- Undo (Ctrl+Z) reverts a scenario parameter instead of the last user material edit
- Two scenario panels showing the same building show the same energy number regardless of which scenario is "active"

**Phase to address:**
Phase 25 (Scenario Branching) — The three-layer recipe stack must be designed before any scenario UI. The `CommandHistory` in `src/lib/undo/` must be scoped to user-authored actions only; scenario parameter changes are transient, not undoable.

---

### Pitfall 6: SAOPass Already Disabled — Energy Layer Geometry Must Not Re-Enable It

**What goes wrong:**
`building-scene.tsx` line 456 shows: `{/* SAOPostProcessing disabled — causes dark halos on polygon geometry */}`. SAOPass was intentionally disabled after the v4.0 polygon footprint work. Adding energy heatmap geometry (floor-level plane meshes, duct tube geometry, lighting zone volumes) will create the same halo artifact — and may tempt developers to re-enable SAOPass once the geometry "looks plain" without it. Re-enabling SAOPass on a scene with 5–10 new energy overlay geometries and 7+ existing InstancedMesh draw calls will drop frame rate below 30fps on integrated graphics.

**Why it happens:**
Each new milestone adds geometry that looks better with ambient occlusion. The reason SAOPass was disabled is documented only in a comment — it is easy to overlook when implementing a new phase that adds different geometry types.

**How to avoid:**
Do not re-enable SAOPass in v5.0. Document the disable reason in a code comment that names the issue specifically: "Polygon-footprint buildings produce halo artifacts at face boundaries under SAOPass — this is a known issue with non-planar geometry in screen-space AO." If ambient occlusion is desired for energy overlay geometry, add a baked AO texture to specific materials rather than re-enabling the post-processing pass. Consider N8AO (from `@react-three/postprocessing`) as a future replacement — it handles non-planar geometry better and costs 30–50% less than SAOPass at equivalent quality.

**Warning signs:**
- The `SAOPostProcessing` component is uncommented in `building-scene.tsx`
- Dark halos appear around floor edges after adding heatmap plane geometry
- Frame rate drops after adding energy overlay geometry even without SAOPass

**Phase to address:**
Phase 22 (Energy Heatmap Layer) — Add an explicit note to the phase plan: "SAOPass stays disabled. Energy layer geometry must not trigger AO re-evaluation."

---

### Pitfall 7: Zustand Store Count Grows to 8+ — Cross-Store Subscription Cascade

**What goes wrong:**
The current system has 7 Zustand stores: `app-store`, `material-store`, `recipe-store`, `layer-store`, `selection-store`, `workspace-store`, `workflow-store`. v5.0 likely requires energy scenario state, equipment control state, and possibly a dashboard aggregation cache — easily adding 2–3 more stores.

The problem is not store count in isolation — it is cross-store subscriptions. `useEnergyMetrics` already subscribes to `material-store` and `recipe-store` simultaneously. Adding a scenario store means energy metrics must also subscribe to `scenario-store`. Components that subscribe to 3+ stores produce a "subscription cascade": Store A change → `useEnergyMetrics` recomputes → new `EnergyMetrics` object → parent component re-renders → children subscribing to other stores also re-render due to referential instability in the metrics object.

The `useEnergyMetrics` hook already documents this risk: "IMPORTANT: Avoids getEffectiveRecipe in Zustand selector to prevent infinite loops." The same pattern must be applied to any new cross-store derivation.

**Why it happens:**
Each store is independently simple. The complexity emerges from composition. It is not visible in unit tests that mock individual stores.

**How to avoid:**
Before adding a new store for v5.0 energy features, check whether the state belongs in an existing store as a new slice. Candidate placements:
- Equipment control state → `workflow-store` (already has `scenarioActive` concept)
- Scenario overrides → `recipe-store` as `scenarioOverrides[pk][scenarioId]` (new slice, same store)
- Dashboard aggregation cache → TanStack Query cache (it is already the async data layer; do not create a Zustand store for server-derived data)

If a new store is genuinely needed, wrap the derived calculation in a `useMemo` that takes stable primitive inputs (same pattern as `useEnergyMetrics`), never in a Zustand selector that returns a new object every call.

**Warning signs:**
- A new `useEnergyDashboard` hook subscribes to 4+ stores
- `useEnergyMetrics` is called with additional `scenarioId` and `equipmentState` params that are pulled from separate stores inside the hook
- Energy cards flicker or re-animate on every keystroke in an unrelated form field

**Phase to address:**
Phase 23 (Energy Dashboard) — Audit cross-store dependencies before adding new stores. Establish a rule: derived energy calculations live in `useMemo` chains fed by stable Zustand primitive subscriptions, not in new stores.

---

### Pitfall 8: Dashboard Aggregation Runs on Every Render Frame

**What goes wrong:**
The energy dashboard shows consumption by system type, floor-level breakdown, trend charts (year-over-year), and benchmark comparison. All of these are derived from `useEnergyMetrics` output, which is already a `useMemo` chain. Adding chart aggregation (e.g., per-floor heat loss array for a stacked bar chart) directly inside the component means:

1. The aggregation re-runs on every render, including renders caused by hover states, tooltip visibility, or R3F `useFrame` callbacks that cause parent re-renders.
2. The aggregation for a 15-floor building computes 15 heat-loss values, each involving the full `calculateHeatLoss()` path (wall area × U-value × ΔT × correction factors). This is not expensive for a single building but becomes expensive when the dashboard is open and the R3F canvas is running at 60fps with `useFrame`-triggered parent updates.
3. Year-over-year trend data requires aggregating `actualConsumption` records across 3 years. `useActualEnergy` returns this data via TanStack Query, but the normalization step is re-run if the component re-renders due to an unrelated state change.

**Why it happens:**
React developers habitually derive data inline. For simple cases (single value, single formula) this is correct. For dashboard-scale aggregations, it silently moves computation into the hot render path.

**How to avoid:**
- Per-floor energy aggregation: compute once in a `useMemo` that depends only on `metrics` and `recipe`. Verify with React DevTools that this memo fires only when the building changes or a slider is committed, not on every frame.
- Year-over-year trend: `useActualEnergy` already applies `staleTime: 5 * 60 * 1000` — the data is cached. Add a `useMemo` on the normalized output so the trend array is not reconstructed on each render.
- Benchmark comparison: `calculateBenchmark()` involves a database lookup (`benchmark-database.ts`). Wrap it in `useMemo` with `[buildingType, year, region]` deps. Never call it inside `useFrame`.

**Warning signs:**
- React DevTools "highlight updates" shows the energy dashboard flashing on every frame
- `calculateHeatLoss()` appears in the React profiler hot path (not just on building change)
- Dashboard chart re-renders visibly stutter when the user rotates the 3D model

**Phase to address:**
Phase 23 (Energy Dashboard) — Profile with React DevTools before shipping. The acceptance criterion must include: "Dashboard components do not re-render when the camera is rotating in the 3D viewer."

---

### Pitfall 9: Equipment Info Panels Leak Three.js Object References into React State

**What goes wrong:**
Equipment info panels require knowing which equipment object the user clicked (e.g., "HVAC unit on floor 3"). The click handler in the 3D scene has access to `THREE.Object3D` and its `userData`. The naive implementation stores the clicked `THREE.Object3D` reference in React state (via `useState` or a Zustand store). This causes:

1. The Three.js object stays alive in memory as long as React holds the reference, even after the layer is rebuilt or the building changes. If `LayerManager.disposeLayer()` removes the object from the scene graph, the React state still holds a reference to its geometry and material — both remain allocated on the GPU.
2. When the scene rebuilds (building change, recipe update), the stored reference becomes stale. The info panel renders data from a disposed object.
3. React's strict mode double-invokes effects; combined with a Three.js object in state, this can trigger the `dispose()` / `needsUpdate` cycle twice.

**Why it happens:**
The object's `userData` carries all the information the panel needs (equipment type, specs, floor number). Storing the object directly feels natural and avoids copying data.

**How to avoid:**
Extract the data needed by the panel into a plain serializable record at click time, and store only that record in React state:

```typescript
interface SelectedEquipmentInfo {
  equipmentId: string;
  type: string;
  floor: number;
  specs: Record<string, unknown>;
  layerId: LayerId;
}
```

Never store a `THREE.Object3D`, `THREE.Mesh`, or `THREE.Material` in React state or a Zustand store. The `selection-store.ts` already follows this pattern (stores IDs and metadata, not Three.js objects) — extend it with `selectedEquipment: SelectedEquipmentInfo | null`.

**Warning signs:**
- `useSelectionStore` or a component `useState` holds a value typed as `THREE.Object3D` or `THREE.Mesh`
- Equipment info panel shows stale data after changing to a different building
- Browser memory profiler shows `MeshStandardMaterial` or `BufferGeometry` objects with nonzero ref count after `LayerManager.dispose()`

**Phase to address:**
Phase 24 (Equipment Control) — The `SelectedEquipmentInfo` type must be defined before any click handler is implemented. The `selection-store.ts` is the correct home for this state; no new store needed.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using `mesh.setColorAt()` on existing structural InstancedMesh for heatmap | Reuses existing geometry, no new mesh | Cannot express spatial gradient; full buffer re-upload on every energy recalculation; structural and energy concerns entangled | Never for energy heatmap — use a separate heatmap mesh layer |
| Adding each MEP sub-system as a new `LayerId` entry | Simple flat model, mirrors existing 5-layer structure | Store subscriptions fire for all subscribers on any sub-layer toggle; LayerPanel becomes unusable flat list | Never — use nested `MepSubLayer` type with imperative child-group visibility |
| Storing `THREE.Object3D` in selection state | Zero serialization overhead | GPU memory leak when scene rebuilds; stale panel data after building change | Never — extract `userData` into a plain record at click time |
| Reusing `overrides[pk]` for scenario parameters | Single override slot, simple API | Scenario switch destroys user material edits; undo history applies to both user edits and scenario changes | Never — use a separate `scenarioOverrides[pk][scenarioId]` slot |
| Calling `calculateHeatLoss()` inline in dashboard render | Simple code, always up-to-date | Computation runs in React hot path on every frame that causes parent re-render | Acceptable only in a `useMemo` with stable deps — never directly in render body |
| Presenting ratio-estimated sub-system breakdown without labeling | Dashboard looks complete and authoritative | GX team makes incorrect retrofit recommendations; trust is damaged when numbers do not match ECO2 | Never — all estimated values must be labeled with source |
| Re-enabling SAOPass for "better visuals" with energy geometry | Improved depth perception | Dark halos on polygon footprint geometry (known bug, already triggered once in v4.0); frame rate collapse on integrated graphics | Never in v5.0 — defer SAOPass re-evaluation to a dedicated visual quality phase |

---

## Integration Gotchas

Common mistakes when connecting energy systems to the existing Three.js + Zustand stack.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `useEnergyMetrics` + scenario store | Subscribe to scenario store inside `useEnergyMetrics`, creating a new dependency that triggers infinite loop risk | Pass scenario overrides as a plain argument to `useEnergyMetrics`; compute effective recipe in `useMemo` inside the hook (same pattern as current `overrides` handling) |
| LayerManager + MEP sub-groups | Add `MepSubLayerId` to `ALL_LAYER_IDS` in `types.ts` | Keep `ALL_LAYER_IDS` at 5 entries; add child groups to the `mep` group imperatively; control their visibility outside the main layer visibility record |
| Equipment click → React state | Store `event.object` (a `THREE.Object3D`) in `selection-store` | Extract `event.object.userData` into a typed `SelectedEquipmentInfo` record; store the record, dispose the reference |
| Energy heatmap + `disposeLayer("energy-zones")` | Heatmap geometry is a child of the structural `InstancedMesh` group | Heatmap geometry must be a child of the `energy-zones` layer group so `disposeLayer` correctly tears it down independently |
| `useActualEnergy` + dashboard aggregation | Re-normalize `AnnualConsumption[]` inside the render function | Wrap normalization output in `useMemo([data])` so it does not re-run on unrelated state changes |
| Equipment control state + `recipe-store` | Write HVAC setpoint directly to `overrides[pk].hvacSetpoint` | Write to `scenarioOverrides[pk][activeScenarioId]` only; user `overrides` are for material properties, not equipment setpoints |
| Three.js `updateAnimations()` + hidden MEP sub-groups | `updateAnimations()` traverses all children including hidden sub-groups, updating `uTime` uniforms uselessly | Gate the traverse: `if (!group.visible) return` — already done in `layer-manager.ts` line 127; ensure MEP sub-groups inherit the parent group's visibility flag correctly |

---

## Performance Traps

Patterns that work at small scale but degrade under real energy + 3D data.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `instanceColor.needsUpdate = true` inside a Zustand subscription | Frame rate drops when config panel sliders are dragged | Throttle color updates to at most once per animation frame; batch all instance color writes before the needsUpdate flag | Visible at any update frequency when the buffer has 50+ instances |
| Per-frame `calculateHeatLoss()` in dashboard render body | Energy dashboard causes frame rate drop when open | Wrap in `useMemo` with `[metrics, recipe]` deps; verify with React profiler | Any time the R3F canvas triggers a parent re-render (60fps) |
| Heatmap mesh not disposed on layer clear | GPU VRAM grows as user toggles energy zones layer on/off | Call `geometry.dispose()` and `material.dispose()` in `disposeLayer("energy-zones")` before rebuilding | After 5–10 toggle cycles with a complex heatmap mesh |
| Year-over-year chart aggregation inline in component | Trend chart causes flash/re-render whenever any Zustand store changes | Memoize aggregated trend data independently of render cycle | Any time a store unrelated to energy data changes (e.g., layer toggle) |
| Scenario comparison rendering two full building models | Frame rate collapses when split-screen comparison is shown | Share geometry references; render two viewports only for the active floors that differ between scenarios, not two full ProceduralBuilding instances | Immediately on any building with 10+ floors and active PBR materials |
| `ALL_LAYER_IDS.forEach` in `updateAnimations()` with 9+ layers | Marginal frame time increase but compounds with other per-frame work | Keep layer count at 5; use nested sub-groups for MEP sub-systems | Measurable impact at 10+ layers with animated ShaderMaterial uniforms per layer |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Displaying ratio-estimated energy data as if measured | Regulatory risk: GX team reports inaccurate retrofit savings to management or regulators based on model assumptions | Label all estimated values with source type; never omit provenance in exported reports |
| Storing equipment control "commands" as browser-local state without audit trail | Scenario assumptions cannot be reproduced for peer review; audit trail gap for energy certification | Log scenario state changes with timestamps in `CommandHistory`; make scenarios exportable as named JSON configs |
| Accepting raw user-supplied building PK in equipment control API calls without validation | Injection vector if future backend equipment control API is added | Validate `mgmBldrgstPk` format before any API call: `/^\d{19}$/.test(pk)` (established pattern from PITFALLS.md v4.0) |

---

## UX Pitfalls

Common user experience mistakes in the energy observability domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Heatmap color scale not anchored to a consistent baseline | Users compare two buildings on different color scales; a "hot red" on building A means 200 kWh/m², on building B it means 80 kWh/m² | Anchor heatmap to Korean energy grade thresholds (Grade 7 = 320 kWh/m² → red, Grade 1+++ = 60 kWh/m² → blue); display scale legend with kWh/m² values |
| Equipment control toggles with no confirmation for actions that look destructive | GX team member accidentally "turns off" HVAC in a scenario and cannot figure out how to restore baseline | All equipment control changes are in scenario mode; "Reset to baseline" button is always visible when scenario mode is active |
| Energy breakdown percentages without absolute values | User sees "HVAC: 55%" but cannot compare to their utility bills | Show both percentage and absolute kWh/yr; link to actual consumption data when available |
| Layer toggles that hide the building model when "envelope" is turned off | Turning off the envelope layer leaves an empty viewport — users think the app crashed | Ensure the structural mesh remains visible as a wireframe fallback when the envelope layer is hidden; document this in the LayerPanel tooltip |
| Scenario comparison with identical visual treatments | Users cannot tell which panel is baseline and which is scenario | Use distinct background tint (e.g., amber border in scenario mode) and label each panel explicitly: "기준선" vs. "시나리오 A" |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Heatmap:** Often missing gradient-within-floor — verify that a floor with known high perimeter heat loss shows a spatial gradient, not a flat single color matching the average.
- [ ] **Energy data provenance:** Often missing on ratio-estimated values — verify that every number in the energy dashboard has a visible source label (실측/모델/추정).
- [ ] **Scenario mode isolation:** Often missing — verify that committing a scenario change does NOT modify `recipe-store.overrides[pk]`; check store state in Redux DevTools after toggling HVAC.
- [ ] **Equipment click state cleanup:** Often missing — verify that selecting a building, clicking equipment, then navigating to a different building clears the `selectedEquipment` state and does not show stale equipment data.
- [ ] **Layer dispose on building change:** Often missing — verify that `disposeLayer("energy-zones")` is called when a new building is selected; confirm `renderer.info.memory.geometries` does not grow across 5 building selections with heatmap active.
- [ ] **Dashboard memoization:** Often missing — verify with React DevTools that the energy dashboard does not re-render when the camera is rotated in the 3D viewer (no frame-rate coupling between canvas and dashboard).
- [ ] **SAOPass still disabled:** Often missing check — verify `SAOPostProcessing` remains commented out after any phase that adds new 3D geometry.
- [ ] **MEP sub-layer hierarchy:** Often missing — verify that toggling the parent `mep` layer hides ALL MEP sub-groups, and that toggling a sub-group (e.g., HVAC ducts) does not affect other sub-groups.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Heatmap on structural InstancedMesh (setColorAt) | MEDIUM | Create separate `EnergyHeatmapMesh` component per floor; detach heatmap from structural mesh; re-wire color buffer; 1–2 days |
| MEP sub-layers added to `ALL_LAYER_IDS` | MEDIUM | Refactor: move sub-layers to nested `MepSubLayer` type; update `LayerManager`, `LayerPanel`, `layer-store`; 4–8 hours |
| Scenario overrides polluting user `overrides` | HIGH | Separate `scenarioOverrides` slice added to `recipe-store`; migrate existing scenario state; audit `CommandHistory` to exclude scenario changes; 1–2 days |
| THREE.Object3D leaked in selection state | LOW | Replace stored object reference with extracted `userData` record; add cleanup on building navigation; 2–4 hours |
| Dashboard computation in render hot path | LOW | Wrap aggregation in `useMemo` with correct deps; verify with React profiler; 1–4 hours |
| SAOPass re-enabled causing halos | LOW | Comment out `SAOPostProcessing` again; document reason in comment with issue reference; 30 minutes |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Heatmap on InstancedMesh (setColorAt abuse) | Phase 22: Energy Heatmap Layer | Heatmap shows spatial gradient; `renderer.info.render.calls` does not increase when heatmap is enabled |
| MEP sub-layer proliferation in `ALL_LAYER_IDS` | Phase 22: MEP Sub-Layer Architecture | `ALL_LAYER_IDS.length === 5` after all MEP sub-systems are added; sub-layer toggles work via nested groups |
| Energy accuracy theater (estimated shown as measured) | Phase 23: Energy Dashboard | Every rendered energy value has a `source` prop; ratio-estimated values show amber "추정" label |
| Optimistic control diverges from building state | Phase 24: Equipment Control | Scenario mode banner is visible when any equipment is toggled; no equipment change modifies base `overrides` |
| Scenario branching mutates base recipe | Phase 25: Scenario Branching | Ctrl+Z in scenario mode undoes scenario parameter, not user material edit; switching scenarios does not clear config panel values |
| SAOPass re-enabled | Phase 22: Energy Heatmap Layer | SAOPass comment includes explicit "do not re-enable" note; CI lint rule or test asserts SAOPostProcessing is not rendered |
| Zustand cross-store subscription cascade | Phase 23: Energy Dashboard | React DevTools confirms dashboard does not re-render during camera rotation; no new stores added for server-derived data |
| Dashboard aggregation in render hot path | Phase 23: Energy Dashboard | React profiler shows `calculateHeatLoss` not in render path; dashboard memoization test added to Vitest suite |
| THREE.Object3D in React state | Phase 24: Equipment Control | TypeScript type of `selection-store.selectedEquipment` is `SelectedEquipmentInfo` (plain object), not any Three.js type |
| Layer geometry not disposed on building change | Phase 22: Energy Heatmap Layer | `renderer.info.memory.geometries` remains stable across 10 building selections with heatmap active |

---

## Sources

- Codebase: `src/lib/layers/types.ts` — `ALL_LAYER_IDS` has 5 entries; `LayerId` is a union of 5 string literals
- Codebase: `src/lib/layers/layer-manager.ts` — `updateAnimations()` traversal pattern; `disposeLayer()` geometry cleanup
- Codebase: `src/hooks/use-energy-metrics.ts` — cross-store subscription pattern; "Avoids getEffectiveRecipe in Zustand selector to prevent infinite loops" comment
- Codebase: `src/hooks/use-actual-energy.ts` — `staleTime: 5 * 60 * 1000`; returns total kWh (not sub-metered by system)
- Codebase: `src/components/viewer/building-scene.tsx` line 456 — `{/* SAOPostProcessing disabled — causes dark halos on polygon geometry */}`
- Codebase: `src/components/viewer/energy-cards.tsx` — existing `EnergyDataSource` visual treatment pattern (모델/실측 labels)
- Codebase: `src/store/layer-store.ts` — flat `visibility: Record<LayerId, boolean>` — all subscribers receive new object on any toggle
- Codebase: `src/components/viewer/procedural-building-model.tsx` — `layerVisibility` subscription pattern; "MEP / energy-zones / retrofit-targets: no geometry yet — no-op"
- Three.js forum: InstancedMesh per-instance color — https://discourse.threejs.org/t/instancedmesh-how-to-change-the-vertex-color-of-an-instance/63562
- Three.js forum: Color per vertex per instanced mesh — https://discourse.threejs.org/t/color-per-vertex-per-instanced-mesh/46399
- Three.js forum: Heatmap with color/coordinate/intensity — https://discourse.threejs.org/t/threejs-heatmap-with-color-coordinate-intensity/82865
- Three.js docs: InstancedMesh.instanceColor — https://threejs.org/docs/#api/en/objects/InstancedMesh.instanceColor
- React Three Fiber issue #2854: InstancedMesh does not work with per-instance color using setColorAt — https://github.com/pmndrs/react-three-fiber/issues/2854
- Three.js issue #30352: InstancedMesh significantly slower than Mesh with shared attributes — https://github.com/mrdoob/three.js/issues/30352
- .planning/research/PITFALLS.md (v4.0) — SAOPass performance collapse; established patterns for VWorld integration pitfalls

---
*Pitfalls research for: Energy systems observability and control — Korean BIM Energy Management System (v5.0)*
*Researched: 2026-04-12*
