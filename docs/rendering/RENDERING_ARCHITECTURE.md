---
type: architecture
status: implemented
last_verified: 2026-09-02
---

# Rendering architecture

The twin viewport is still React Three Fiber + three.js WebGL. This document
describes the **real-time architectural renderer layered on top of BIM**, not a
second engine.

## Pipeline

```text
BIM DATA (ledger / recipe / IFC)
   │
   ▼
SCENE GRAPH  (ProceduralBuilding, layers, overlays)
   │
   ├─ BIM mode ────────── MeshStandardMaterial, studio HDR, CAD grid
   │
   └─ Realistic / Hyperreal
         BIM material id
            → visual spec (library)
            → world-space PBR shader
            → Preetham sky + sun + GTAO + SMAA
            → architectural ground / interior volume
```

Engineering numbers (wall thickness, U-values, areas) are not rewritten. Visual
bevel, weathering and interior cavities are tagged `userData.visualEnhancement`.

## Original architecture (baseline)

| Concern | Implementation |
|---|---|
| Engine | three r182, R3F v9, WebGL |
| Geometry | InstancedMesh facade / slabs / columns |
| Materials | Untextured `MeshStandardMaterial` from `pbr-materials.ts` |
| Textures | Seven JPG sets used **only** on the ground plane |
| Lighting | Hemisphere 0.6 + directional 2.0, VSM 2048 |
| IBL | `/hdr/studio.hdr` (indoor studio) |
| Background | Solid `#f5f5f5` |
| Post | OutlinePass ×2 + OutputPass (SAO scaffold unused) |
| AA | Canvas `antialias` + composer MSAA 4 |
| Tone map | R3F default ACES, exposure 1 |

## New architecture

| Concern | Implementation |
|---|---|
| Semantic layer | `src/lib/rendering/material-ontology.ts` + `bim-material-mapping.ts` |
| PBR catalog | `material-library.ts` (calibrated albedo/roughness/scale) |
| Shaders | `onBeforeCompile` world-space triplanar, stochastic UV, weathering |
| Lighting | Preetham `Sky`, solar position (Seoul default), outdoor PMREM |
| Ground | Grass field, asphalt parcel, sidewalk, plinth, optional trees |
| Interior | Inset occlusion volume behind glazing |
| Post | GTAO + SMAA in realistic/hyperreal; outlines kept for selection |
| Modes | `bim` / `realistic` / `hyperreal` via `useRenderStore` |
| Quality | performance → presentation budgets in `quality-tiers.ts` |

## Scene ownership

`BuildingScene` is the only product viewport. Generative / lean canvases keep
their own lights. Do not mount a second front-door renderer.

## Authoritative vs visual

| Layer | Source of truth |
|---|---|
| Geometry dimensions | Recipe / ledger / BIM snapshot |
| Thermal materials | `src/lib/energy-standards` |
| Visual appearance | `src/lib/rendering` |
| Selection / isolation | Existing stores; materials remain `MeshStandardMaterial` subclasses |

## Related

[[MATERIAL_SYSTEM]] · [[BIM_MATERIAL_MAPPING]] · [[LIGHTING_SYSTEM]] · [[PERFORMANCE_BUDGET]] · [[VISUAL_QA]]
