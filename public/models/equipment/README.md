# Blender-authored equipment & structural assets

Authored procedurally in Blender 5.2 LTS via the Blender MCP session
(2026-07-26) and exported as GLB (glTF 2.0, Y-up, metres). Source:
`scripts/blender/equipment_assets.blend` + `scripts/blender/eq_helpers.py`.

Consumed by `src/lib/equipment-assets.ts` (preload cache; deep clones handed
to generators; coarse procedural fallback when unavailable).

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

Notes:
- Instanced consumers require single-mesh/single-material assets (1 draw call).
- Slabs/floors intentionally stay parametric: fixed GLBs cannot adapt to
  arbitrary footprints or cadastral polygons without distorting detail.
