---
type: reference
status: implemented
last_verified: 2026-09-02
---

# Material system

BIM states *what a surface is*. The renderer decides *how it looks*.

## Flow

```text
structure code + use + era + surface role
        ↓
resolveVisualMaterialId()
        ↓
VisualMaterialSpec (albedo, roughness, metalness, IOR, metres/tile)
        ↓
createArchitecturalMaterial()
        ↓
BIM mode: MeshStandardMaterial (historical colours)
Realistic: MeshStandardMaterial / MeshPhysicalMaterial + world-space shader
```

## Spec fields

| Field | Meaning |
|---|---|
| `albedo` | sRGB, clamped to dielectric 4–94 % or metal ≥56 % |
| `roughness` / `metalness` | PBR, not a gloss slider |
| `metersPerTile` | Real-world size of one albedo tile (brick ≈ 1.68 × 1.07 m) |
| `textureSet` | Optional JPG set under `/textures/` |
| `stochastic` | `offset` (masonry) or `rotate` (concrete/asphalt) |
| `weathering` | Rain streaks, ground dirt, oxidation, fade — orientation-aware |

## Shader (realistic / hyperreal)

Injected via `onBeforeCompile` so InstancedMesh keeps working:

- World-space triplanar sampling (fixes stretched UVs on scaled unit boxes)
- Stochastic UV offset / rotation to break tiling
- Macro / meso / micro colour variation from a per-building seed
- Ground dirt, vertical rain streaks, wetness (rain preset)
- Cheap screen-space edge bevel (does **not** change BIM dimensions)

## Glass

Legacy CAD `#88BBDD` is remapped only in realistic modes. Glass is
`MeshPhysicalMaterial` (still a `MeshStandardMaterial`, so retrofit tints and
isolation ghosting keep working) with IOR 1.52, no transmission (too expensive
on instanced windows), and `depthWrite: false` so the interior volume reads.

## Interior volume

One inset mesh per building, `userData.visualEnhancement = true`, raycast
disabled. It is not BIM interior geometry. Real `InteriorLayer` still wins when
the user turns 내부 요소 on.

## Related

[[PBR_STANDARDS]] · [[BIM_MATERIAL_MAPPING]] · [[RENDERING_ARCHITECTURE]]
