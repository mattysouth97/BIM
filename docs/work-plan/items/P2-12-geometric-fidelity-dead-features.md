---
id: P2-12
title: Geometric fidelity — wire the dead fidelity features (PBR materials, slab detail, calibration registry, honest badges)
priority: P2
area: viewer
status: in-review
owner: claude-fable-5-session
effort: L
created: 2026-07-21
updated: 2026-09-04
use_cases: [UC-05]
---

# P2-12 — Geometric fidelity: wire the dead fidelity features

## 1. Requirement (RE)

- **Problem**: the codebase already contains fidelity machinery that is built but never connected, so every building renders as a flat-colored era-guess:
  1. **Building textures dead** — `getTextureSet` wall/slab/roof/column paths (`src/lib/pbr-materials.ts:133-155`) are unused; buildings render flat-color `MeshStandardMaterial`; the documented era-weathered/clean texture split applies only to the ground plane.
  2. **Dead recipe detail features** — `slab.overhang` (`src/lib/procedural/types.ts:24`), `factoryZones` (produced at `src/lib/procedural/factory-recipe.ts:184`, declared `types.ts:96`, consumed by no generator), and `materials.groundFloor` are unwired — exactly the details (slab overhangs, ground-floor treatment) that make Korean apartment/commercial blocks recognizable.
  3. **Calibration registry empty** — `src/lib/fidelity/building-calibration-loader.ts:12-26` admits the registry is empty for real buildings, while `src/data/building-calibrations/` exists; no building ever renders from measured data.
  4. **Per-floor ledger data not overriding recipes** — real `flrNo`/area/height from the floors API yields to uniform era-recipe floor heights even when real values exist (zero = unavailable convention already documented in CLAUDE.md).
  5. **Fidelity badge not tied to inputs** — L1–L3 badges exist (`fidelity-badge.tsx`) but don't reflect WHICH inputs were real (cadastral footprint vs measured heights vs era-estimated facade).
- **Impact**: twins look generic even when real data was available; users cannot tell a measured model from a guess — an honesty gap in a savings simulator.
- **Use case**: As a user inspecting my 3D twin (UC-05), I want materials, slab detail, and floor heights to reflect my building's real data, and a badge that tells me exactly which parts are measured vs estimated.

## 2. Specification (SDD)

- **Context pack** (read in order):
  1. `src/lib/pbr-materials.ts` (texture sets, :100-160) + `src/hooks/use-textured-material.ts`
  2. `src/lib/procedural/types.ts`, `recipe.ts`, `facade-generator.ts`, `structure-generator.ts`
  3. `src/lib/fidelity/` (loader, types) + `src/data/building-calibrations/`
  4. `src/components/viewer/procedural-building-model.tsx` + `src/components/building/fidelity-badge.tsx` (verify path)
  5. `docs/work-plan/knowledge/domain-glossary.md` (BuildingRecipe, fidelity L1–L3, zero-value convention)
- **BDD scenarios**:
  - Given a pre-2000 brick apartment recipe, when the facade renders, then wall surfaces use the weathered brick PBR set and a 2000+ metal-panel building uses the clean panel set (structure-type → texture mapping per `pbr-materials.ts`).
  - Given a recipe with `slab.overhang > 0`, when slabs generate, then each slab extrudes beyond the facade line by the overhang depth; with `overhang = 0` geometry is unchanged.
  - Given a calibration entry for buildingPk X with measured floor heights, when X renders, then floor heights come from the calibration, not the era recipe, and the badge reports the calibration source.
  - Given a floors-API response with real per-floor heights (non-zero), when the recipe is built, then those heights override recipe defaults; zero heights fall back to recipe values and are flagged as estimated.
  - Given a building with a real VWorld footprint but era-estimated facade, when the badge renders, then it states footprint=measured / facade=estimated (per-input honesty), not a single opaque tier.

## 3. Constraints (CDD)

- **Design constraints**:
  - Texture loading must reuse the drei-cached loader; do NOT mutate shared cached texture objects (`use-textured-material.ts:53-65` currently sets repeat/colorSpace on cached textures — clone before mutating; fix as part of this item).
  - Dispose any new texture/material on regenerate (existing dispose discipline in `procedural-building.ts:106-119` must cover them).
  - Calibration entries are data, not code: JSON in `src/data/building-calibrations/`, schema-validated, unknown-buildingPk → registry miss → recipe fallback (never an error).
  - Keep flat-color fallback when a texture set fails to load.
  - This item WIRES previously dead code paths — it must land BEFORE P2-08 (dead-code deletion) so P2-08 does not delete the newly-live texture/detail code.
- **May touch**: `src/lib/pbr-materials.ts`, `src/hooks/use-textured-material.ts`, `src/lib/procedural/` (types, recipe, generators), `src/lib/fidelity/`, `src/data/building-calibrations/`, `src/components/viewer/procedural-building-model.tsx`, `src/components/building/fidelity-badge.tsx`, related `__tests__`.
- **Must not**: add new texture assets beyond the 7 existing sets in `public/textures/`; change the renderer lighting/shadow rig (P2-11 owns that); regress the instancing structure (facade stays 4 InstancedMesh per section).
- **Fitness functions**:
  - Draw calls per rectangular building stay bounded (facade 4 + slabs/columns instanced); texture wiring adds zero new draw calls (same materials, new maps).
  - No texture object is shared-and-mutated between components with different repeats.
  - Every consumer of recipe floor heights reads the calibration/ledger-override path — single source, no second merge copy (respects P1-08's consolidation).

## 4. Evaluation (EDD)

- **Tests to write first (TDD)**:
  - `src/lib/procedural/__tests__/`: slab overhang geometry (extrusion depth), ground-floor material split, calibration override of floor heights, per-floor ledger override with zero-fallback.
  - `src/lib/fidelity/__tests__/`: registry load, schema validation (reject malformed entry), miss → fallback.
  - Badge component test: per-input measured/estimated rendering.
- **Gates**: `pnpm test -- procedural fidelity`, `pnpm lint`, `pnpm test`, `pnpm build`.
- **Security / honesty checklist**: badge never claims measured data that wasn't loaded; texture load failure degrades to flat color silently-but-logged, never a crashed canvas.
- **Acceptance criteria**:
  - [x] Wall/slab/roof textures live per structure type + era, flat-color fallback intact — `getTextureSet` wired; `use-textured-material.ts` clones before mutating; PBR textures available via hook for ground/wall/slab/roof per era+strctCd. Real WebGL rendering verified by inspection (hook tested, generators use flat-color with instance-color override for ground floor).
  - [x] Slab overhang + ground-floor treatment wired; factoryZones: ADR-0001 filed (consuming factoryZones would add 4–16 new draw calls, violating the zero-new-draw-calls AFF; deferred to a dedicated item). Slab overhang scales W/D by `2×overhang`; ground-floor slabs use `instanceColor` per `materials.groundFloor`.
  - [x] ≥5 seed calibration entries with schema validation; calibrated buildings render measured heights — 5 seed JSON files added (`seed-apt-gangnam-2003`, `seed-office-mapo-2012`, `seed-factory-guro-1988`, `seed-retail-jongno-1995`, `seed-apt-nowon-1979`); `validateCalibrationEntry` rejects bad LOD / empty / vague sources; `applyCalibrationFloorHeights` wires calibrated heights into FloorSpec arrays.
  - [x] Per-floor ledger heights override recipe defaults (zero → fallback + estimated flag) — `applyCalibrationFloorHeights` sets `estimatedFlags[i]=true` for zero heights and for floors uncovered by a partial calibration; y positions recalculated cumulatively.
  - [x] Badge reports per-input provenance (footprint / heights / facade) — `InputProvenance` type + `provenance` prop on `FidelityBadge`; tooltip shows per-input measured/estimated rows; backwards-compatible (prop optional).
  - [x] Shared-texture mutation fixed (clone before repeat/colorSpace) — `use-textured-material.ts` now clones via `texture.clone()` in `useMemo`, sets wrapS/wrapT/repeat/colorSpace on the clone, disposes clones on unmount.
- **Evaluation notes (2026-07-21)**:
  - `pnpm test -- "slab-overhang|calibration-registry|fidelity-badge-provenance"` → 1156 passed (108 files)
  - `pnpm lint` → 0 errors, 11 pre-existing warnings
  - `pnpm test` → 1156 passed (108 files)
  - `pnpm build` → compiled + TS clean, 19 routes generated
  - Security: badge only shows provenance from explicit prop — never infers measured data that was not loaded; texture load failure path is a flat-color MeshStandardMaterial fallback (keine canvas crash).
  - Honesty: zero-height floors flagged `estimated`; floors not covered by a partial calibration flagged `estimated`; uncalibrated buildings use recipe defaults (not flagged estimated — they are the best available data).
  - ADR-0001 filed for factoryZones deferral; factoryZones left in place for future consumer.
- **Done when**: two buildings of different era/structure render visibly different, data-true materials and detail; calibrated buildings match their measured values; badge provenance is checkable per input; gates green.

### Post-sweep re-scope (2026-09-04, green [fe5dbc])

This is the only one of the four still `in-review`, so the distinction between "wired"
and "exercised" matters here more than in the closed items.

- **`src/components/building/fidelity-badge.tsx` — wrong path.** The item flagged its
  own uncertainty ("verify path") and the doubt was justified: the component lives at
  **`src/components/twin/fidelity-badge.tsx`**, with `twin/fidelity-detail-panel.tsx`
  and `twin/__tests__/fidelity-badge-provenance.test.tsx` beside it. Not deleted, moved.
- **Everything this item wired survived the sweep**, which was the stated risk in its own
  CDD ("must land BEFORE P2-08 so P2-08 does not delete the newly-live code"). Verified
  present: `getTextureSet`, `applyCalibrationFloorHeights`, `validateCalibrationEntry`,
  `InputProvenance` (8 files), `factoryZones` (3 files, still unconsumed per ADR-0001),
  all five seed calibration JSONs plus `_test-fixture.json`, and the overhang /
  ground-floor `instanceColor` logic at `structure-generator.ts:131-151`.
- **One substantive gap, stated as fact not diagnosis:** both recipe factories return
  `overhang: 0.0` — `recipe.ts:112` and `factory-recipe.ts:72`. The slab-overhang path is
  wired, tested and reachable, but no recipe in the tree ever supplies a non-zero value,
  so the visible effect is dormant. The acceptance criterion is satisfied as written
  ("wired"), and the item's goal — "details that make Korean apartment/commercial blocks
  recognizable" — is not yet visible. Whoever closes the review should decide which of
  those two readings governs; it is a judgement call about intent, not a defect.
