# Revit Architecture authoring families

High-fidelity GLB kit for the BIM authoring tools. Built in Blender 5.2
via the Blender MCP addon (`127.0.0.1:9876`) from the Universidad Europea
Revit Basic Course (García / Martínez, 2014).

Rebuild: `scripts/blender/build_authoring_assets.py` (all packs) or
`scripts/blender/rebuild_all.py`.

## Contract with the feature session

`src/lib/bim/asset-slots.ts` slot defaults are published under
`/bim-assets/*.glb` and registered by `publishAuthoringAssets()`.

This folder is the **full type library** (102 families: 46 course kit + 56 starter expansion). Use it when the
authoring UI needs a specific type (Brick on CMU, casement window, 8-riser
run, toilet, …), not just the slot default.

| Slot (`asset-slots.ts`) | Default file | Library type |
|---|---|---|
| `family.wall.basic` | `/bim-assets/wall-basic.glb` | `wall-basic-generic-200` |
| `family.wall.curtain` | `/bim-assets/wall-curtain.glb` | `curtain-wall-storefront` |
| `family.floor.basic` | `/bim-assets/floor-basic.glb` | `floor-generic-150` |
| `family.roof.basic` | `/bim-assets/roof-basic.glb` | `roof-basic-flat` |
| `family.column.rectangular` | `/bim-assets/column-rectangular.glb` | `column-struct-rect-450x600` |
| `family.window.fixed` | `/bim-assets/window-fixed.glb` | `window-fixed-1200x1500` |
| `family.door.single-flush` | `/bim-assets/door-single-flush.glb` | `door-single-flush-910` |
| `family.lighting.fixture` | `/bim-assets/light-fixture.glb` | `light-troffer-600` |
| `family.mep.*` / electrical | `/bim-assets/{chiller,boiler,ahu,dhw,electrical-panel}.glb` | prior equipment kit |

## Units and axes

- Authored in Blender **Z-up, metres**. Exported `export_yup=True`.
- In three.js: **+Y up**, width = X, height = Y, depth = Z.
- Mesh origin **is** the Revit insertion point (transforms are baked).

### Insertion origins

| Kind | Origin | Scale |
|---|---|---|
| Walls / curtain wall | start, centerline, base. Length +X, height +Y, thickness ±Z | scale X = length, Y = story height |
| Doors | opening centre, floor. Width ±X, height +Y | do not scale (real size) |
| Windows | opening centre. Width ±X, height ±Y | do not scale |
| Columns | base centre. Height along +Y = **1 m** | scale Y = story height |
| Floors | 1×1 m module, top face at origin, body −Y | scale X/Z to sketch |
| Roofs (flat) | 1×1 m, bottom at origin, body +Y | scale X/Z to footprint |
| Ceilings | 1×1 m, work plane at origin, body −Y | scale X/Z |
| Stairs | first riser nosing, run +Z, up +Y | instance, do not stretch treads |
| Railings | start at origin, length +X | scale X = length |
| Lights | ceiling plane, hang −Y | instance |
| Furniture / plumbing / planting | base centre, facing −Z | instance |

Doors expose a `LeafPivot` / `SashPivot` node for swing.

## Course coverage

Walls (Basic / Curtain / Stacked + construction layers), doors, windows,
architectural + structural columns (round 450/600, rect 450×600 / 600×750),
floors, roofs (footprint + pitched), ceilings, stairs by component, railings,
ramp, ceiling-hosted lights, furniture, plumbing fixtures, planting (RPC-style).

See `catalog.json` for per-family metadata (category / family / type, host,
origin, course citation).
