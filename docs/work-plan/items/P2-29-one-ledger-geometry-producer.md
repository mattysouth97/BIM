---
id: P2-29
title: One ledger geometry producer — reconstruct() becomes the twin's and the engine's shared source
priority: P2
area: geometry
status: in-review
owner: claude-opus-5-session
effort: L
created: 2026-09-04
updated: 2026-09-04
use_cases: [UC-03, UC-05, UC-12]
---

# P2-29 — One producer of ledger geometry, not three

Three modules independently turn a 건축물대장 into a building shape, and they
disagree:

| Producer | Consumer | Footprint rule | Per-storey |
|---|---|---|---|
| `src/lib/building-geometry.ts` | 3D twin | GIS ring **bbox** (`building-scene.tsx:376`), else `estimateFootprint` 1.5:1 rectangle (`building-geometry.ts:63`) | No |
| `src/lib/energy-diagnostics/ledger-baseline-model.ts` | traceable energy | 1.5:1 rectangle from `archArea` (`:1233`) | Loops storeys (`:801`) but reuses one `boundary` |
| `src/lib/cad-reconstruction/reconstruct.ts` | DXF + reports | GIS ring (`:250`), else `solvePlateForArea(archArea)` (`:287`) | **Yes** — `makeLevel` (`:750`) scales each plate to its 층별 area |

Only the third reads 층별개요, and its output is discarded: `upload-stage.tsx:427`
takes `footprint.ring` and drops `levels`, `walls`, `openings`, `core`, `grid`,
`sections`. The twin then re-extrudes that one ring by total height.

This item makes `reconstruct()` the single producer. It does **not** change any
inference rule — the plates stay concentric (P2-31) and the envelope stays
one-prism (P2-30). It only removes two of the three rectangle inventions and
makes the third reachable.

## 1. Requirement (RE)

- Every ledger building gets a `ReconstructionModel` — not only those whose user
  visits 도면 업로드 and writes a sentence. With no claims and no GIS, the model
  still resolves from `archArea` + 층별개요 and is graded accordingly.
- The 3D twin's recipe and the traceable engine's boundary are both **derived
  from that model**, so the twin and the diagnosis can no longer describe
  different buildings.
- Grading survives the move. An automatic reconstruction is still not CAD
  evidence (ADR-003): `hasCadFootprint` stays `false`, `reconstructedFootprint`
  becomes `true`, and the twin's stated fidelity does not rise.

## 2. Specification (SDD) — BDD scenarios

**S1 — automatic R00 on ledger selection.** Given a building selected from the
register and no user claims, when the twin loads, then `reconstruct()` has run
with `claims: []` and produced a model whose `footprint.grade` is `B-OBSERVED`
when VWorld returned a building outline, `D-INFERRED` when only `archArea` was
available, and whose `blockers` is non-empty when neither was.

**S2 — the twin renders from the model.** Given a model with a resolved
footprint, when the recipe is built, then `recipe.footprintPolygon` is
`model.footprint.ring` converted to local metres — **not** the GIS ring's bbox —
and `recipe.floors` is derived from `model.levels` (count, elevation,
floor-to-floor). Given `blockers` is non-empty, the twin falls back to today's
`building-geometry.ts` path and the fidelity badge says so.

**S3 — the engine reads the same boundary.** Given the same model, when
`ledgerSourceInput` builds its extracted boundary, then the boundary polygon is
`model.footprint.ring` and its provenance cites the same source ids the model
cites. The 1.5:1 rectangle at `ledger-baseline-model.ts:1233` is reached only
when the model has no footprint, and says so in the same words.

**S4 — provenance does not inflate.** Given an automatic reconstruction (no
uploaded drawing), when provenance is patched, then `hasCadFootprint === false`,
`hasCadPlan === false`, `reconstructedFootprint === true`, and
`useTwinFidelity` reports the same tier it reports today for a VWorld-only
building. Given a real DXF upload afterwards, the CAD footprint replaces the
reconstruction and `hasCadFootprint` becomes `true`.

**S5 — the four endpoints still fail independently.** Given 층별개요 returns
nothing but 표제부 succeeds, when the model is built, then levels are synthesised
from `grndFlrCnt`/`ugrndFlrCnt` (`resolveLevelSpecs` `:719`, `synthetic: true`)
and the building still renders. No path requires all four endpoints.

## 3. Constraints (CDD)

- **May touch**: `src/lib/cad-reconstruction/index.ts` (a claims-free entry),
  `src/lib/energy-diagnostics/ledger-source.ts`,
  `src/lib/building-geometry.ts`, `src/components/viewer/building-scene.tsx`,
  `src/hooks/use-effective-recipe.ts`, `src/store/twin-provenance-store.ts`,
  `src/components/upload/upload-stage.tsx`, a new
  `src/lib/cad-reconstruction/ledger-bridge.ts`, their tests, dashboard README,
  `docs/04_Agent-Handoffs/CURRENT.md`.
- **Must not**: change `reconstruct()`'s inference rules (that is P2-31);
  set `hasCadFootprint` from a reconstruction (ADR-003); introduce a helper that
  attaches register refs to a defaulted value (`createEnergyFact` invariant);
  read `classifyEra` on the traceable path — `classifyEraExplicit` only; treat a
  documented zero (`archArea=0`, `heit=0`, `platArea=0`) as a value (AFF-6);
  require all four register endpoints.
- **Fitness**: `reconstruct()` stays pure apart from injected `now`, so the same
  register yields the same building; `src/lib/**` gains no `'use client'`
  (AFF-1); the reconstruction runs off the request path already fetched for the
  twin — no new register call per render.

## 4. Evaluation (EDD)

- **Tests to write first**:
  - `reconstruct({claims: [], gis: null})` on a title with `archArea > 0` →
    `footprint.grade === "D-INFERRED"`, no blockers
  - same with `archArea = 0` and no GIS → `blockers.length > 0`, and the twin
    falls back rather than rendering a placeholder square
  - recipe from model: `footprintPolygon` equals the model ring (not its bbox);
    a non-convex L-shaped ring survives the conversion with its area intact
  - `ledgerSourceInput` boundary polygon === model footprint ring; fact sources
    match the model's source ids
  - provenance: automatic run → `{hasCadFootprint:false, reconstructedFootprint:true}`;
    DXF upload afterwards → `{hasCadFootprint:true, reconstructedFootprint:false}`
  - 층별개요 empty + `grndFlrCnt=5` → 5 synthetic levels, building renders
- **Gates**: `node node_modules/typescript/bin/tsc --noEmit`,
  `node node_modules/vitest/vitest.mjs run`,
  `node node_modules/@playwright/test/cli.js test`,
  `node node_modules/eslint/bin/eslint.js src`.
- **Acceptance criteria**:
  - [x] `estimateFootprint` no longer governs the building outline — the twin's
        `footprintPolygon`/`Width`/`Depth` come from the model whenever it
        resolves one. **Partial:** it still sets each `FloorGeometry.width` /
        `.depth`, which are dead while a polygon exists; P2-30 replaces those
        with per-level plates and retires it.
  - [x] `ledger-baseline-model.ts`'s 1.5:1 rectangle is reached only when the
        model reports no footprint (`ledger-source.ts` `reconstructed` branch)
  - [x] Twin and diagnosis quote the same outline for the same building —
        pinned by `ledger-geometry-agreement.test.ts`, which also asserts the
        two disagreed before
  - [x] No fidelity badge rises because of an automatic reconstruction —
        `provenancePatchForModel` never returns `hasCadFootprint`, and
        `assessFidelity`'s `hasFootprint` was already true for any recipe
- **Honesty checklist**: a reconstruction is never CAD evidence (ADR-003);
  documented zeros emit no fact (AFF-6); `blockers` surface as an explicit
  unavailable state, never a placeholder square offered as geometry.
- **Evaluation notes (2026-09-04)**: `tsc --noEmit` clean; `eslint src` 0 errors,
  9 warnings (the pre-existing count — a 10th introduced by an unmemoised
  `?? []` in `use-ledger-record.ts` was a real re-render bug and was fixed, not
  suppressed). Vitest **4149 passed**, 4 skipped, 377 files (from 4118/375);
  no pre-existing test changed. Playwright **41 passed, 2 failed**, against a
  documented baseline of 39/4. The two are `plan-view.spec.ts:45` and
  `energy-diagnostics.spec.ts:586`; an A/B on those two spec files alone gave
  **4 failed / 7 passed before** the change and **3 failed / 8 passed after**,
  with a different subset failing each run — the cross-test state leak
  `CURRENT.md` already records, not a regression. `plan-view.spec.ts:45` fails
  identically with the change stashed.
- **Runtime check**: `/diagnostics/new?method=ledger&building=demo` builds its
  workspace through the new `reconstructed` boundary and keeps `building=` in
  the autosaved URL. The twin's canvas stays at R3F's 300×150 default on
  `/building/demo` — verified identical with the change stashed, so it is the
  same pre-existing layout defect `plan-view.spec.ts:45` catches. Note the demo
  building carries a canned `recipeOverride`, so `/building/demo` deliberately
  bypasses this path; only a real ledger id exercises the twin side end to end.
- **Done when**: a building with a resolvable footprint reaches neither
  `estimateFootprint` nor `derivedFootprintRing`, and the twin and the
  diagnosis quote the same outline for it.

## Sign-off withheld (2026-09-04)

Not done. The item's claim is ONE producer of ledger geometry; a fourth
derivation was found downstream and still stands.

`deriveRoomElements` (`src/lib/bim/derive/twin-elements.ts:285`) computes
`footprintArea(recipe)` ONCE, outside the per-floor map, and gives every storey
that same area. Measured by green on 서울청운초등학교 (pk `1002122071`):
7 rooms x 2,749.71 m² = 19,247.6 m² against a **stated** 연면적 of 12,957.58 —
+48.5%, and the energy page then divides by it (51.2 vs 76.1 kWh/m²·yr).

The reconstruction is NOT the source of that error and needs no change: with no
층별개요 it divides the stated 연면적 across the storeys and returns 12,957.1 m²
against the stated 12,957.58. Only the room derivation extrudes the footprint.

Signing this done would assert a single producer that measurably is not one.

## Follow-ups (out of scope here)
- P2-30 — per-storey envelope quantities (this item leaves the prism intact).
- P2-31 — directional setbacks (this item leaves `scaleAbout` concentric).
- Core sized from 전유공용면적 rather than a use-family fraction of the plate.
