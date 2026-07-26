# Blender Asset Expansion — Safety, Transport, Telecom/Media, Waste + Envelope Retrofit

## Goal

Extend the Blender-authored GLB asset kit (27 assets exist in `public/models/equipment/`)
to the five remaining layer systems, and complete the green-retrofit story with
envelope scenario variants. Modeling tasks author assets in Blender (via the Blender
MCP); integration tasks wire them into the layer generators, the viewer, and tests.

## Context

- Branch: `claude/blender-asset-creation-b29df2` (worktree `C:\Users\Nam\BIM\.claude\worktrees\blender-asset-creation-b29df2`). Commit directly on this branch.
- Asset cache: `src/lib/equipment-assets.ts` — preloads GLBs, hands out deep clones
  (`getEquipmentObjectClone`) or merged single geometries (`getEquipmentGeometryClone`),
  plus `getEquipmentMaterialClone`, `tagEquipmentObject`, and test hooks
  `__injectEquipmentAssetForTest` / `__resetEquipmentAssetsForTest`.
- Blender 5.2 LTS is connected via MCP tools (`mcp__Blender__execute_blender_code` etc.).
  A helper library lives in the Blender session as text datablock `eq_helpers.py`
  (also snapshotted at `scripts/blender/eq_helpers.py`). Execute
  `exec(bpy.data.texts["eq_helpers.py"].as_string())` at the top of every code call, then
  use: `reset_collection`, `M` (material), `box`, `cyl`, `tor`, `sph`, `louvres`,
  `radial_fan`, `fan_guard`, `flange`, `pipe_run`, `finalize_merge`, `tri_count`,
  `export_glb`, `preview`.
- Layer generators are pure-Three.js classes in `src/lib/layers/` with synchronous
  `generate(recipe, density?, ...)`. `src/components/viewer/building-layers.tsx`
  instantiates them per regeneration and routes output via `assignToSubGroup`
  (`src/lib/layers/mep-coordinator.ts`) using `GENERATOR_TO_MEP_SUB` in
  `src/lib/layers/types.ts`.
- Selection/hover only raycast the four `sub-mep-*` groups — a generator whose group
  name is UNMAPPED in `GENERATOR_TO_MEP_SUB` is invisible to click/hover handlers.
- Equipment spec cards: `inferEquipmentSpecs` in `src/lib/energy/equipment-specs.ts`
  dispatches on `userData.type.split("-")[0]`.
- Retrofit scenario: `src/lib/layers/equipment-scenario.ts`
  (`EquipmentScenario`, `deriveEquipmentScenario`, `SHOWCASE_EQUIPMENT_SCENARIO`);
  measure ids come from `src/lib/retrofit/*.ts`; knapsack-selected ids are published to
  `useScenarioStore().selectedMeasureIds` by `src/components/twin/twin-stage-overlay.tsx`.
- Reference tests: `src/lib/layers/__tests__/detailed-assets.test.ts` (inject fake
  assets, assert swaps/gating/placement) and `layer-5-ventilation.test.ts`.
- QA page `/dev/assets` (`src/app/dev/assets/page.tsx`) renders the whole kit without
  an API key; add newly wired layers there too.

## Global Constraints

1. GLB files go to `public/models/equipment/<id>.glb`. Every new id must be added to
   `EquipmentAssetId`, `EQUIPMENT_ASSET_IDS`, and `ASSET_NATIVE_DIMS` in
   `src/lib/equipment-assets.ts` (native dims in three.js axes: w=X, h=Y-up, d=Z).
2. Assets consumed by `InstancedMesh` MUST be exported as a single mesh with a single
   material: build with `finalize_merge(col, single_mat=<mat>)`.
3. Interior equipment keeps the layer's existing (emissive, x-ray readable) material —
   geometry-only swap via `getEquipmentGeometryClone`. Realistic GLB materials are only
   for exterior/rooftop/plant-room objects consumed via `getEquipmentObjectClone`.
4. Every selectable object must carry `userData.type` on EVERY descendant mesh — use
   `tagEquipmentObject(obj, { type }, { castShadow: true, receiveShadow: true })` for
   Group clones; set `im.userData = { type }` for InstancedMesh.
5. Coarse fallback: with an empty asset cache (SSR/tests), each generator's output must
   be unchanged from its pre-task behavior. All pre-existing tests must keep passing.
6. `generate()` stays synchronous. No async/await in generators.
7. Never hand shared geometry/material references to consumers — the cache's clone
   methods already guarantee this; do not bypass them.
8. Blender authoring rules: metres, Z-up (glTF export converts to Y-up); bake
   transforms with `o.data.transform(...)` (helpers do this — NEVER
   `bpy.ops.object.transform_apply`); verify each asset with `preview()` and read the
   rendered PNG before exporting; keep instanced assets ≤ 2,000 tris (tiny ceiling
   devices ≤ 400 tris), singletons ≤ 6,000 tris.
9. Origins: floor/roof-standing singletons = base centre (z=0 at bottom in Blender);
   instanced drop-ins that replace a centre-origin `BoxGeometry`/`CylinderGeometry`
   = geometric centre matching the primitive they replace.
10. Tests: vitest, node environment. Inject fakes with `__injectEquipmentAssetForTest`,
    reset with `__resetEquipmentAssetsForTest()` in `afterEach`.
11. Gate before committing: `pnpm test` fully green, `pnpm build` clean, and
    `pnpm exec eslint <changed files>` with 0 errors and no NEW warnings.
12. Commit on the current branch; end the commit message with
    `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
13. New spec categories in `equipment-specs.ts` must use `buildSpec` and an existing
    `EquipmentStandardRef` value (`"KS B 6364"` or `"KSC IEC 62301"`) — the union is
    closed; do not widen it.

---

## Task 1: Model the Safety & Fire-Protection asset pack (Blender only)

Author and export 5 GLBs. No app code changes in this task (registry entries happen in
Task 2). Verify each with a `preview()` render before export; report tri counts + kB.

| id | What | Native dims (Blender X×Y×Z m) | Origin | Export |
|---|---|---|---|---|
| `sprinkler-head` | Pendent sprinkler: ceiling stub pipe, frame arms, deflector disc | 0.06×0.06×0.10 | centre | single mesh, single brass-ish material, ≤ 300 tris |
| `smoke-detector` | Flat round detector: base ring with vent slots, low dome, tiny LED nub | Ø0.13×0.045 | centre | single mesh/mat, ≤ 300 tris |
| `exit-sign` | Wall/ceiling exit sign: slim box, recessed luminous face (green), top mount stubs | 0.36×0.06×0.20 | centre | single mesh/mat, ≤ 250 tris |
| `fire-extinguisher` | Extinguisher on wall bracket: red cylinder, valve/handle, short hose, bracket plate | 0.22×0.18×0.60 | centre | single mesh/mat, ≤ 800 tris |
| `hydrant-cabinet` | 옥내소화전 wall cabinet: box, door seam, round hose window, small alarm bell on top | 0.70×0.22×1.30 | centre | single mesh/mat, ≤ 700 tris |

All five will be consumed by `InstancedMesh` → Constraint 2 applies to every one.
Commit the 5 GLBs (plus nothing else).

## Task 2: Integrate the Safety pack into layer-13 and wire the layer in

- Register the 5 ids per Constraint 1.
- `src/lib/layers/layer-13-safety.ts`: keep everything it renders today, and ADD
  (detailed-asset-only, i.e. render only when the asset is available — no coarse
  fallback needed for NEW element kinds):
  - `safety-sprinkler` IM: per above-floor ceiling grid (reuse the lighting-layer grid
    approach at half density, y = floor.y + floor.height − 0.15), geometry from
    `sprinkler-head`, material: existing emissive red-ish safety palette
    (`MeshStandardMaterial`, color 0xef4444-family, small emissive).
  - `safety-smoke-detector` IM: offset grid (¼ density of sprinklers), same ceiling y.
  - `safety-exit-sign` IM: 2 per floor at the stair/core positions the layer already
    computes, y = floor.y + 2.2.
  - `safety-extinguisher` IM: 2 per floor near core (x=±1.2, z=0.6), y = floor.y + 0.6.
  - `safety-hydrant` IM: 1 per floor at (1.8, floor.y + 0.75, 0.4).
- `src/lib/layers/types.ts`: map `"layer-13-safety"` → `"mep-electrical"` in
  `GENERATOR_TO_MEP_SUB` (makes it selectable/hoverable).
- `building-layers.tsx`: instantiate `SafetyLayer` like the other layers (same effect,
  same deps). Add the layer to `/dev/assets`.
- `equipment-specs.ts`: add a `"safety"` prefix case via `buildSpec` — 소방설비 /
  Fire Protection, capacity "—", tiny annualKwh (alarm/monitoring load
  `floorArea × floorCount × 0.3 W/m²` × 8760h), grade from `ELECTRICAL_ERA_GRADE`.
- Tests (new file or extend `detailed-assets.test.ts` pattern): with fakes injected,
  each of the 5 IMs exists with expected counts for the standard 12×10×3-floor fixture;
  without fakes, none of the new IMs exist and the layer's pre-existing output is
  unchanged; dispose() doesn't throw.

## Task 3: Model the Transport (elevator) asset pack (Blender only)

| id | What | Native dims | Origin | Export |
|---|---|---|---|---|
| `elevator-cab` | Cab: panelled walls, front door slit, ceiling light recess, handrail band, floor plate | 1.4×1.5×2.2 (X×Y×Z) | centre | single mesh/mat, ≤ 1,800 tris |
| `elevator-counterweight` | Guided frame with 6 stacked plates | 0.3×0.45×1.3 | centre | single mesh/mat, ≤ 400 tris |
| `hoist-machine` | Gearless traction machine: bedplate, motor cylinder, sheave wheel with rope groove hint, brake disc | 1.2×0.8×1.0 | base centre | multi-material OK, ≤ 3,000 tris |
| `landing-door` | Landing door set: frame + two sliding panels with centre seam + narrow header indicator | 1.1×0.12×2.1 | centre | single mesh/mat, ≤ 500 tris |

Commit the 4 GLBs.

## Task 4: Integrate the Transport pack into layer-12 and wire the layer in

- Register ids per Constraint 1.
- `src/lib/layers/layer-12-transport.ts`:
  - Swap `transport-cab` geometry: `getEquipmentGeometryClone("elevator-cab")` scaled by
    (cabWidth/1.4, cabHeight/2.2, cabDepth/1.5) — keep the existing cab material and the
    step animation exactly as-is (geometry-only swap; fallback = existing BoxGeometry).
  - Swap `transport-counterweight` geometry similarly (scale to its existing box dims).
  - ADD `transport-landing-door` IM (detailed-asset-only): one per above floor per
    shaft, at the shaft front face, y = floor.y + 1.05; keep 1 draw call.
  - ADD `transport-hoist-machine` (detailed-asset-only): `getEquipmentObjectClone` at
    each shaft's top (y = totalHeight + flat roof thickness when `roof.type==="flat"`,
    else totalHeight), tagged via `tagEquipmentObject`.
- `types.ts`: map `"layer-12-transport"` → `"mep-electrical"`.
- `building-layers.tsx` + `/dev/assets`: instantiate `TransportLayer`.
- `equipment-specs.ts`: add `"transport"` case — 승강기 / Elevator, capacity
  `${floorCount} floors served`, annualKwh ≈ `floorCount × 1200`, grade from
  `ELECTRICAL_ERA_GRADE`.
- Tests: cab geometry swap (vert count), landing-door IM count = shafts × aboveFloors,
  hoist machine present only with asset + seated at totalHeight + flatThickness for the
  flat-roof fixture, fallback unchanged, dispose clean.

## Task 5: Model the Telecom & Media asset pack (Blender only)

| id | What | Native dims | Origin | Export |
|---|---|---|---|---|
| `comm-rack` | 19" comms rack: frame, stacked patch panels/switches relief, side vents | 0.6×0.8×2.0 | centre | single mesh/mat, ≤ 1,200 tris |
| `wifi-ap` | Ceiling WiFi AP: rounded square puck, status LED nub, subtle logo recess | 0.18×0.18×0.045 | centre | single mesh/mat, ≤ 300 tris |
| `cctv-camera` | Dome camera on short ceiling mount: mount plate, stem, dome with lens window hint | 0.14×0.14×0.16 | centre | single mesh/mat, ≤ 400 tris |
| `antenna-mast` | Rooftop comms mast: pole ~2.6 m, 2 panel antennas, small dish, guy-anchor base plate | 1.0×1.0×2.6 | base centre | multi-material OK, ≤ 1,800 tris |
| `gas-valve-station` | Med-gas zone valve box: recessed box, 2 small valves with round gauges, front window | 0.2×0.12×0.15 | centre | single mesh/mat, ≤ 500 tris |

Commit the 5 GLBs.

## Task 6: Integrate Telecom & Media packs; wire layers 11 and 8 in

- Register ids per Constraint 1.
- `layer-11-telecom.ts`: geometry-only swaps (keep existing materials):
  `telecom-server-rack` ← `comm-rack` (scale to 0.6×2.0×0.8 box dims),
  `telecom-wap` ← `wifi-ap`. ADD detailed-asset-only:
  `telecom-cctv` IM — 4 per above floor at the ceiling near the 4 core-corner
  positions (±1.5, floor.y + floor.height − 0.25, ±1.2);
  `telecom-antenna` — one `getEquipmentObjectClone("antenna-mast")` on the roof
  (x = footprintWidth·0.25, y = totalHeight + flat thickness, z = footprintDepth·0.25,
  only when min(footprint) ≥ 8), tagged.
- `layer-8-media.ts`: geometry-only swap `media-valve` ← `gas-valve-station`
  (scale to the existing 0.2×0.15×0.2 box dims; keep material).
- `types.ts`: map `"layer-11-telecom"` → `"mep-electrical"`, `"layer-8-media"` →
  `"mep-hvac"`.
- `building-layers.tsx` + `/dev/assets`: instantiate `TelecomLayer` and `MediaLayer`
  (check the actual exported class names in those files).
- `equipment-specs.ts`: add `"telecom"` case — 통신설비 / ICT Infrastructure,
  annualKwh ≈ rackCount-independent estimate `floorArea × floorCount × 2 W/m²` × 8760h,
  grade from `ELECTRICAL_ERA_GRADE`; `"media"` falls through to default (fine).
- Tests: swaps by vert count; cctv count = 4 × aboveFloors; antenna gated by asset +
  footprint; media valve swap; fallbacks unchanged; dispose clean.

## Task 7: Model Waste pack + Envelope retrofit variants (Blender only)

| id | What | Native dims | Origin | Export |
|---|---|---|---|---|
| `wheelie-bin` | 240 L wheelie bin: tapered body with rib relief, hinged lid, 2 wheels, handle bar | 0.58×0.74×1.07 | base centre | single mesh/mat, ≤ 900 tris |
| `waste-chute-module` | Chute section: cylinder shell with flange collars at both ends + inspection hatch bump | unit-normalized Ø1×H1 (fits a unit cylinder swap; constant profile) | centre | single mesh/mat, ≤ 600 tris |
| `mullion-he` | High-efficiency window mullion profile: deeper body, twin thermal-break fins outward | unit-normalized like existing `mullion` (length along Blender Z, exterior fin toward −Y) | centre | single mesh/mat, ≤ 100 tris |
| `facade-panel-insulated` | EIFS insulated spandrel: thicker raised face with wide chamfer + reveal joints | unit-normalized like existing `facade-panel` (raised face toward Blender −Y) | centre | single mesh/mat, ≤ 250 tris |

IMPORTANT for the two facade assets: copy the axis conventions from how the existing
`mullion` / `facade-panel` were authored (see `scripts/blender/eq_helpers.py` header and
`public/models/equipment/README.md`) — the integration rotates mullion clones
`rotateY(π)` (+ `rotateZ(−π/2)` for horizontal bars), so author with the SAME
orientation as the existing assets. Commit the 4 GLBs.

## Task 8: Integrate Waste pack + Envelope scenario variants

- Register ids per Constraint 1.
- `layer-9-waste.ts`: swap `waste-chute-segment` IM geometry ← `waste-chute-module`
  (unit-normalized; existing per-instance scaling unchanged); replace the three
  `waste-bin-*` box Meshes with `wheelie-bin` geometry clones + per-bin
  `MeshStandardMaterial` keeping each bin's existing color (general/food/recycle);
  fallbacks unchanged. Wire `WasteLayer` into `building-layers.tsx` + `/dev/assets`
  (mapping already exists: `"layer-9-waste"` → `"mep-dhw"`).
- Envelope scenario (`equipment-scenario.ts`):
  - Extend `EquipmentScenario` with `windowUpgrade: boolean` and
    `wallInsulation: boolean`; derive from ids starting `envelope-window-replacement`
    and `envelope-wall-insulation`; showcase default: both `false` (baseline envelope).
  - Update `equipmentScenarioKey` accordingly.
- `facade-generator.ts`: accept optional `scenario` param. When `windowUpgrade`, use
  `mullion-he` instead of `mullion` for both v/h mullions (same rotations); when
  `wallInsulation`, use `facade-panel-insulated` instead of `facade-panel` AND deepen
  solid-panel instance Z-scale to `wallThickness + 0.08`.
- `procedural-building.ts`: `ProceduralBuilding` constructor takes an optional
  scenario (default `SHOWCASE_EQUIPMENT_SCENARIO`) and passes it to `generateFacade`.
- `procedural-building-model.tsx`: read `selectedMeasureIds` from
  `useScenarioStore`, memoize `deriveEquipmentScenario`, pass into `ProceduralBuilding`,
  and include the scenario in the generate-effect deps (same pattern as
  `building-layers.tsx`).
- Tests: chute/bin swaps; scenario derivation for the two new flags (null → both false;
  envelope ids → true); facade with `windowUpgrade` uses the he-mullion geometry
  (vert-count difference with distinct fakes injected for `mullion` vs `mullion-he`);
  `wallInsulation` panel swap; baseline scenario output unchanged.

---

## Final gate (controller)

Whole-branch review (superpowers:requesting-code-review), fix wave if needed, then
full `pnpm test` + `pnpm build`, browser check of `/dev/assets`, commit, push, and
production deploy via `pnpm dlx vercel deploy --prod --yes`.
