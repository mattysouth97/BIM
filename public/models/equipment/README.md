# Blender-authored equipment & structural assets

Authored procedurally in Blender 5.2 LTS via the Blender MCP session
(2026-07-26) and exported as GLB (glTF 2.0, Y-up, metres). Source:
`scripts/blender/equipment_assets.blend` + `scripts/blender/eq_helpers.py`.

Consumed by `src/lib/equipment-assets.ts` (preload cache; deep clones handed
to generators; coarse procedural fallback when unavailable).

The kit is 45 assets total (see `EQUIPMENT_ASSET_IDS` in
`src/lib/equipment-assets.ts`): the original MEP/renewables/structural kit
below, plus four later packs — Safety, Transport, Telecom & Media, and
Waste + envelope-retrofit variants.

## MEP equipment (HAND OFF.MD "realistic equipment forms")

| Asset | File | Native dims (W×H×D m) | Origin | Consumer |
|---|---|---|---|---|
| Air-cooled chiller | chiller.glb | 2.4×1.5×1.8 | base centre | layer-3-cooling `cooling-plant` |
| Cooling tower (FRP) | cooling-tower.glb | 1.5×1.66×1.5 | base centre | layer-3-cooling `cooling-tower` |
| Boiler + flue | boiler.glb | 1.0×1.8(+flue)×1.0 | base centre | layer-4-heating `heating-boiler` |
| VRF outdoor unit | vrf-outdoor.glb | 0.8×0.6×0.35 | centre, single mesh | layer-4 `heating-vrf-head` (instanced) |
| 4-way fan coil | fan-coil.glb | 0.9×0.1×0.5 | centre, single mesh | layer-4 `heating-fan-coil` (instanced) |
| DHW storage tank | dhw-tank.glb | 1.2×1.8×1.2 | base centre | layer-6-dhw `dhw-storage-tank` / recirc |
| DHW pump set | dhw-pump.glb | 0.78×0.56×0.32 | base centre | layer-6-dhw `dhw-pump` |
| AHU | ahu.glb | 1.2×0.8×0.8 | centre, single mesh | layer-5 `vent-ahu` (instanced) |
| Light fixture (troffer) | light-fixture.glb | 0.6×0.1×0.3 | centre, single mesh | layer-7 `lighting-fixture` (instanced) |
| 배전반 distribution panel | electrical-panel.glb | 0.5×0.8×0.18 | centre, single mesh | layer-7 `lighting-panel` (instanced) |

## Renewables / microgrid

| Asset | File | Native dims | Consumer |
|---|---|---|---|
| PV module | solar-panel.glb | 1.6×0.05×1.0 | layer-14 `microgrid-pv-panel` (instanced) |
| PV rack/frame | solar-rack.glb | 1.64×0.16×1.04 | layer-14 `microgrid-pv-frame` (instanced) |
| BESS cabinet | battery-rack.glb | 0.9×0.7×0.6 | layer-14 `microgrid-bess` (glow shader kept) |
| PCS inverter (DC→AC) | inverter.glb | 0.8×1.7×0.5, base origin | layer-14 `microgrid-inverter` (asset-only) |
| Geothermal GSHP + boreholes | gshp.glb | 2.0×1.15×1.2, base origin | layer-4 `heating-gshp` (asset-only) |

## Structural kit

| Asset | File | Space | Consumer |
|---|---|---|---|
| Column module | column.glb | unit-normalized (BoxGeometry(1,1,1) drop-in) | structure-generator columns |
| Beam profile | beam.glb | unit-normalized, length along X | structure-generator `generateBeams` |
| Mullion profile | mullion.glb | unit-normalized, length along Y | facade-generator h/v mullions |
| Spandrel panel | facade-panel.glb | unit-normalized | facade-generator solid panels |
| Cable-tray module | cable-tray.glb | fixed 1 m section (tiled, never stretched) | electrical-routing (wires) |
| Roof furniture set | roof-furniture.glb | fixed ~4.9×2.4×3.4, base origin | structure-generator `generateRoofFurniture` |

## Safety / fire protection kit

| Asset | File | Native dims (W×H×D m) | Origin | Consumer |
|---|---|---|---|---|
| Sprinkler head | sprinkler-head.glb | 0.06×0.10×0.06 | centre | layer-13-safety `safety-sprinkler` (ceiling grid, instanced) |
| Smoke detector | smoke-detector.glb | 0.13×0.045×0.13 | centre | layer-13-safety `safety-smoke-detector` (ceiling grid, instanced) |
| Exit sign | exit-sign.glb | 0.36×0.20×0.06 | centre | layer-13-safety `safety-exit-sign` (instanced) |
| Fire extinguisher | fire-extinguisher.glb | 0.22×0.60×0.18 | centre | layer-13-safety `safety-extinguisher` (instanced) |
| Hydrant cabinet | hydrant-cabinet.glb | 0.70×1.30×0.22 | centre | layer-13-safety `safety-hydrant` (instanced) |

All five are detailed-asset-only (no coarse procedural fallback) — with an
empty cache they simply don't appear. Native dims authored Blender Z-up;
values above are the three.js axes (w=X, h=Y-up, d=Z) after the
Blender→three.js swap.

## Transport / elevator kit

| Asset | File | Native dims (W×H×D m) | Origin | Consumer |
|---|---|---|---|---|
| Elevator cab | elevator-cab.glb | 1.4×2.2×1.5 | centre | layer-12-transport `transport-cab` (geometry-only swap; material/position/step-animation shader unchanged) |
| Elevator counterweight | elevator-counterweight.glb | 0.3×1.3×0.45 | centre | layer-12-transport `transport-counterweight` (geometry-only swap) |
| Hoist machine | hoist-machine.glb | 1.2×1.0×0.8 | base | layer-12-transport `transport-hoist-machine` (asset-only, one per shaft, base seated on roof top) |
| Landing door | landing-door.glb | 1.1×2.1×0.12 | centre | layer-12-transport `transport-landing-door` (asset-only, one combined InstancedMesh across every shaft × above-floor) |

Cab and counterweight have a coarse `BoxGeometry` fallback; landing door and
hoist machine are detailed-asset-only.

## Telecom & Media kit

| Asset | File | Native dims (W×H×D m) | Origin | Consumer |
|---|---|---|---|---|
| Comm rack (server cabinet) | comm-rack.glb | 0.6×2.0×0.8 | centre | layer-11-telecom `telecom-server-rack` (instanced) |
| WiFi AP | wifi-ap.glb | 0.18×0.045×0.18 | centre | layer-11-telecom `telecom-wap` (ceiling grid, instanced) |
| CCTV camera | cctv-camera.glb | 0.14×0.16×0.14 | centre | layer-11-telecom `telecom-cctv` (4 core-corner positions/floor, instanced, detailed-asset-only) |
| Antenna mast | antenna-mast.glb | 1.0×2.6×1.0 | base | layer-11-telecom `telecom-antenna` (asset-only, rooftop, only on footprints ≥8 m) |
| Gas valve station | gas-valve-station.glb | 0.2×0.15×0.12 | centre | layer-8-media `media-valve` (instanced, riser tops) |

Comm rack, WiFi AP, and gas valve station have coarse `BoxGeometry`/
`CylinderGeometry` fallbacks; CCTV camera and antenna mast are
detailed-asset-only.

## Waste & envelope-retrofit variants kit

| Asset | File | Native dims (W×H×D m) | Origin | Consumer |
|---|---|---|---|---|
| Wheelie bin | wheelie-bin.glb | 0.58×1.07×0.74 nominal (wider/deeper from the lid lip + wheels — measured bounds 0.61×1.05×0.80; slightly shorter than nominal) | base | layer-9-waste `waste-bin-trash` / `waste-bin-recycle` |

| Asset | File | Space | Consumer |
|---|---|---|---|
| Waste chute module | waste-chute-module.glb | unit-normalized shell, axis along Y (flange collars reach ±0.54); replaces a centre-origin `CylinderGeometry(r, r, 1, 8)` | layer-9-waste `waste-chute-segment` (instanced) |
| Mullion, high-efficiency (HE) | mullion-he.glb | unit-normalized; length along Y; the exterior cap fin is authored toward local **-Z**, so the consumer's `rotateY(π)` turns it to face **+Z** (outward) — same convention as the baseline `mullion`; horizontal bars additionally `rotateZ(-π/2)` after the Y-flip | facade-generator `windowUpgrade` scenario — replaces `mullion` for h + v mullions |
| Facade panel, insulated | facade-panel-insulated.glb | unit-normalized; raised/EIFS-clad face toward local **+Z** (same convention as the baseline `facade-panel`) | facade-generator `wallInsulation` scenario — replaces `facade-panel` for solid panels, which also deepen by +0.08 m |

Wheelie bin is base-origin (consumers replacing a centre-origin primitive
must translate the clone down by half its height — see
`layer-9-waste.ts` `makeBinGeometry()`). The three drop-in variants below it
are unit-normalized and MUST share their baseline counterpart's exact axis
convention, since generators apply the same rotate/scale calls to either one
depending on the active retrofit scenario — this was reverse-engineered from
the existing binaries during integration because it wasn't written down
until now.

## New site kit (2026-08-14)

These ids are **new** — they do not replace any existing GLB.

| Asset | File | Native dims (W×H×D m) | Origin | Consumer |
|---|---|---|---|---|
| Junction box | junction-box.glb | 0.20×0.14×0.14 | centre | electrical-routing `electrical-junction-box` (instanced; BoxGeometry fallback) |
| EV charger | ev-charger.glb | 0.36×1.44×0.28 | base | layer-14-microgrid `microgrid-ev-charger` (grade, +X site edge) |
| Exhaust fan | exhaust-fan.glb | 0.84×0.60×0.84 | base | layer-5-ventilation `vent-exhaust-fan` (2 rooftop, detailed-only) |
| Fire pump | fire-pump.glb | 1.55×0.78×0.62 | base | layer-13-safety `safety-fire-pump` (ground plant, detailed-only) |
| Emergency generator | emergency-generator.glb | 2.15×1.14×0.95 | base | layer-14-microgrid `microgrid-generator` (roof plant band, detailed-only) |

Notes:
- Instanced consumers require single-mesh/single-material assets (1 draw call).
- Slabs/floors intentionally stay parametric: fixed GLBs cannot adapt to
  arbitrary footprints or cadastral polygons without distorting detail.
