---
type: research
status: reference
created: 2026-08-31
tags: [mep, architecture, pipeline]
---

# MEP Pipeline — Current → Failure Modes → Target

Companion to [[MEP Design Practice Research]]. Written before the 2026-08-31
graph-engine rework; describes verified current state and the target it was
rebuilt toward.

## Current pipeline (verified 2026-08-31)

```text
BuildingRecipe (no rooms, no zones, no shafts-with-extent)
   │
   ├─ computeCoreLayout(recipe)   ← the ONLY shared spatial truth (2D points)
   │
   ▼
15 × LayerGenerator.generate(recipe, density, …) → THREE.Group
   │   each layer independently: hardcoded fractions of footprint,
   │   magic elevations, decorative splines/boxes, untyped userData tags
   ▼
mep-coordinator.assignToSubGroup (scene-graph parenting only)
   ▼
building-layers.tsx → <primitive> in the R3F canvas
```

## Failure modes (each verified against source)

1. **No intermediate representation.** `LayerGenerator.generate() → THREE.Group`
   fuses topology, geometry, materials and animation. Geometry *is* the model.
2. **No connectivity.** No node/edge/port objects anywhere. A cooling branch
   merely *starts near* the riser (`layer-3-cooling.ts:409`); nothing records
   attachment. Sprinkler heads exist with **no piping at all**
   (`layer-13-safety.ts:212`).
3. **No sizing.** Duct sections (0.3×0.42), pipe radii (0.04/0.05), conduit
   radii ([0.016,0.024,0.032]) are module constants unrelated to any load.
4. **Decorative wobble.** Risers are CatmullRom splines with ±0.05–0.1 m
   control-point noise added *for looks* — the opposite of BIM.
5. **No coordination.** `mep-coordinator.ts` only parents groups. Elevations
   are per-layer magic numbers (duct −0.32, tray −0.35, sprinkler −0.05 …)
   with no arbitration and no clearance model.
6. **No structure awareness** except ventilation's AHU placement; branches and
   trays route through column lines freely.
7. **Duplicated spatial literals.** `PANEL_X = 0.5` in `electrical-routing.ts`
   silently mirrors a literal `0.5` in `layer-7-lighting.ts`.
8. **No provenance / assumption labels** on any MEP quantity, in a codebase
   whose core invariant is provenance.
9. **No QA concepts** — tests assert scene-graph structure, never
   connectivity, slope, sizing or clash-freedom, because none exist to assert.
10. **One nondeterminism**: BAS sensor Poisson placement uses `Math.random()`.

## What must be preserved (working infrastructure)

- The five-layer / seven-sub-group scene contract, layer-store toggles,
  density scaling, retrofit re-tinting, x-ray material language.
- `equipment-assets.ts` GLB cache + `ASSET_NATIVE_DIMS` scaling contract.
- Selection stack: raycast → `sub-mep-*` ancestor walk → `userData.type` →
  `inferEquipmentSpecs` → info panel. (JSON-only selection store.)
- InstancedMesh discipline and disposal patterns.
- `computeCoreLayout` + `plate.ts` — grown into, not replaced.

## Target pipeline

```text
BuildingRecipe ──► buildMepContext(recipe)          src/lib/mep/context.ts
   + optional CAD rooms (classifyPlanPolylines)     ← CAD-driven path
   │  floors · plate rings · corridor spine · service bands · shafts(3D)
   │  wet stacks · plant rooms · column obstacles · terminal zones
   ▼
system planners (per discipline)                    src/lib/mep/systems/*
   HVAC air · hydronic · domestic water · sanitary · fire · electrical
   │  topology: plant → riser → floor main → branch → terminal
   ▼
routing (corridor-graph, orthogonal, banded)        src/lib/mep/route.ts
   ▼
sizing (flow accumulation → catalog snap, labeled)  src/lib/mep/size.ts
   ▼
fitting derivation (elbow/tee/transition/reducer)   src/lib/mep/fittings.ts
   ▼
MepModel  — canonical, serializable, deterministic  src/lib/mep/types.ts
   │
   ├──► validateMepModel: connectivity · slope · clash · score
   │                                               src/lib/mep/validate.ts
   ▼
render instructions (pure transforms, no THREE)     src/lib/mep/geometry.ts
   ▼
existing layer generators consume the shared model  src/lib/layers/*
   (group names, userData vocabulary, GLB heroes preserved)
```

Key properties: metres, XZ plan, Y-up, footprint-local origin (unchanged);
pure + deterministic (no RNG); memoized per recipe so six consuming layers pay
for one plan; every sized quantity labeled
`calculated | estimated | defaulted | imported | user`; every element carries
`systemId`, path-to-source, and its governing rule IDs from
[[MEP Design Practice Research]].
