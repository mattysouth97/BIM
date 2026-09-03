---
id: P2-30
title: Per-storey envelope — the stack stops being one extruded prism
priority: P2
area: geometry
status: in-review
owner: claude-opus-5-session
effort: L
created: 2026-09-04
updated: 2026-09-04
use_cases: [UC-05, UC-12]
---

# P2-30 — Per-storey plates, per-storey envelope

`envelope-quantities.ts:60` prices the envelope from **one** plate:

```
wallLengthM      = perimeter(footprintPolygon[0])
grossWallAreaSqm = wallLengthM × totalHeight
roofAreaSqm      = planAreaSqm
volumeM3         = planAreaSqm × totalHeight
```

The traceable engine has the same shape of error from the other direction:
`ledger-baseline-model.ts:801` loops storeys but reuses a single `boundary`
for all of them.

For a building that steps — which 층별개요 already states, floor by floor —
this is wrong twice, in opposite directions:

- **Wall is overestimated**: the widest perimeter is charged for the full height.
- **Roof is underestimated**: only one plate is counted, so every setback
  terrace — a horizontal surface with a roof U-value, not a wall one — is missing.

The two errors do not cancel predictably, which is why this is the item that
decides whether a per-storey plan can move kWh at all (`CURRENT.md` Known
Issue #3). P2-29 must land first: without it there are no per-level plates to sum.

## 1. Requirement (RE)

- `FloorSpec` can carry its own plate. Absent one, it falls back to
  `recipe.footprintPolygon` and every existing building renders unchanged.
- `envelopeQuantities` sums the stack rather than extruding its base:
  - `grossWallAreaSqm = Σᵢ perimeter(plateᵢ) × heightᵢ`
  - `roofAreaSqm = area(plate_top) + Σᵢ max(0, area(plateᵢ) − area(plateᵢ₊₁))`
  - `groundAreaSqm = area(plate of the lowest conditioned storey)`
  - `volumeM³ = Σᵢ area(plateᵢ) × heightᵢ`
- The traceable engine reads `levels[i].plate` per storey instead of one
  boundary, so its surfaces and the twin's geometry are the same building.
- Basements stay out of scope: they are recorded, not extruded, and ground
  contact keeps today's treatment.

## 2. Specification (SDD) — BDD scenarios

**S1 — a prism is unchanged.** Given every level shares one plate (or no level
carries a plate), when `envelopeQuantities` runs, then every field equals
today's value to within floating-point tolerance, and existing energy tests pass
unmodified.

**S2 — a step is priced.** Given a 5-storey building whose levels 4–5 have a
plate of 60% the base area, when `envelopeQuantities` runs, then
`grossWallAreaSqm` is strictly less than `perimeter(base) × totalHeight`, and
`roofAreaSqm` equals `area(plate₅) + (area(plate₃) − area(plate₄))` — the terrace
at the step is counted as roof, once.

**S3 — the render matches the numbers.** Given the same building, when
`ProceduralBuilding.generate()` runs, then facade faces, slabs and columns for
levels 4–5 are built on the smaller plate; the roof caps the top plate and the
terrace at level 3 receives a roof surface. `getFloorFromInstanceId` still
resolves every storey (P0-04 pick path intact).

**S4 — the engine agrees with the twin.** Given a stepped ledger building, when
the traceable diagnosis runs, then the sum of its `exterior_wall` surface areas
equals `envelopeQuantities(recipe).grossWallAreaSqm` within 1%, and each
surface's storey plate is the level's plate — not the base boundary.

**S5 — a degenerate plate is refused, not drawn.** Given a level whose plate is
`X-UNRESOLVED` or encloses no area, when the recipe is built, then that level
falls back to the base plate and the substitution is a named assumption; no
zero-area storey ever reaches `envelopeQuantities`.

## 3. Constraints (CDD)

- **May touch**: `src/lib/procedural/types.ts` (`FloorSpec.plate`),
  `src/lib/procedural/facade-generator.ts` (`:357` — resolve faces per floor,
  not once), `src/lib/procedural/structure-generator.ts` (`:51`, `:239`, `:316`),
  `src/lib/energy/envelope-quantities.ts`,
  `src/lib/energy-diagnostics/ledger-baseline-model.ts` (`:799`–`:850`),
  `src/lib/cad-reconstruction/ledger-bridge.ts` (from P2-29), their tests.
- **Must not**: change `EnvelopeQuantities`'s existing field names or units
  (`annual-demand.ts`, `heat-loss.ts`, `system-breakdown.ts`, `eco2-export.ts`,
  `retrofit-bridge.ts`, `seed-from-design.ts` all read it); extrude basements;
  alter `intensityFloorAreaSqm`'s precedence (official `totArea` still wins,
  AFF-6); relabel an inferred plate as measured geometry.
- **Fitness**: draw calls stay bounded — one instanced batch per *distinct*
  plate, not per storey, so a prism keeps its 7-call budget and an N-step
  building costs N batches; `envelopeQuantities` stays a pure function of the
  recipe (AFF-1).

## 4. Evaluation (EDD)

- **Tests to write first**:
  - uniform stack → every quantity identical to the pre-change value
  - 5 storeys, top two at 60% area → wall < base perimeter × height; roof =
    top plate + one terrace; volume = Σ area×height
  - two consecutive equal plates → terrace term contributes 0 (no phantom roof)
  - a level plate *larger* than the one below (basement case) → no negative
    terrace term
  - engine vs twin: Σ exterior_wall areas ≈ `grossWallAreaSqm` within 1%
  - `X-UNRESOLVED` plate → falls back to base plate, assumption recorded
  - `getFloorFromInstanceId` resolves a storey on a stepped building
- **Gates**: `tsc --noEmit`, full vitest, Playwright, eslint (per AGENTS.md
  direct-binary invocations).
- **Acceptance criteria**:
  - [x] A setback in 층별개요 changes the reported envelope, in the direction the
        physics says, with no other input changed — pinned in
        `envelope-quantities.test.ts` (twin) and
        `ledger-footprint-refinement.test.ts` (engine)
  - [x] Twin and diagnosis report the same gross wall area for the same building
        — `ledger-geometry-agreement.test.ts`, asserted within 1%
  - [x] Every existing energy regression test passes unmodified
- **Honesty checklist**: a plate the reconstruction could not resolve is
  substituted visibly, never silently (AFF-6); no per-storey number is presented
  as measured when its plate is `D-INFERRED`.
- **Evaluation notes (2026-09-04)**: `tsc --noEmit` clean; `eslint src` 0 errors,
  9 warnings (unchanged). Vitest **4174 passed**, 4 skipped, 377 files (from
  4149). One failure, `lean-composition.test.ts > resolves the studio
  component`, times out at ~5.01 s under full-suite load and passes in
  isolation; reproduced identically at 5.016 s with every P2-30 change stashed,
  so it is a pre-existing load-dependent flake, not a regression.
- **Implementation notes**: `FloorSpec.plate` is optional, so a level without
  one falls back to the building footprint and a prism is byte-identical to the
  pre-P2-30 numbers (locked by the S1 test). Slabs bucket by *distinct plate*,
  not per storey, so the draw-call budget holds; a pick's `instanceId` is scoped
  to the batch it hit, which is why `resolvePickedFloor` now reads the hit
  mesh's own `instanceToFloor` before the building-wide lookup. Terrace geometry
  carries the plate it sits on while its **area** is the exposed difference —
  the canonical model has no polygon-difference representation, and the physics
  reads the area.
- **Done when**: the stepped-stack scenario in S2 is the *default* rendering of
  a Korean building whose 층별개요 states different areas per floor.

## Follow-ups (out of scope here)
- P2-31 — where the setback goes (this item only prices whatever shape it gets).
- Basement envelope: ground-contact U-values and earth-coupling per level.
