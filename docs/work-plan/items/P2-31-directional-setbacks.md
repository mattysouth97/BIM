---
id: P2-31
title: Directional setbacks — a step goes on one face, not concentrically around the plate
priority: P2
area: geometry
status: todo
owner: unassigned
effort: M
created: 2026-09-04
updated: 2026-09-04
use_cases: [UC-05, UC-12]
---

# P2-31 — The step goes somewhere, and the somewhere is evidence

`makeLevel` (`reconstruct.ts:761`) turns a smaller registered floor area into a
plate by scaling the footprint **about its centroid**:

```ts
const raw = Math.sqrt(target / footprintArea);
plate = roundRing(scaleAbout(footprint, raw));
```

Every face steps back equally. Real buildings almost never do that. In Korea the
two dominant patterns are both one-sided:

- **정북방향 일조권 사선제한** (건축법 시행령 제86조) pushes the *north* face back
  above a height threshold in 전용/일반주거지역 — the stepped north elevation on
  다세대·다가구 housing exists because of this rule.
- **1층 근생 / 필로티 podium** — the ground floor covers more of the lot than the
  tower above it, stepping back from the street.

A concentric shrink gets the *area* right and the envelope wrong: it splits one
large step across four faces, so each face's wall area, each orientation's solar
gain and every terrace edge lands in the wrong place. After P2-30 those are
numbers the diagnosis reports, not just pixels.

**The register does not state 용도지역 — but VWorld does.** `BrTitleInfo` has no
zoning field, and this item was originally written assuming the code rule could
only be *recognised*, never applied. That assumption was wrong: VWorld's
`LT_C_UQ111` layer returns the district verbatim in `uname`
(verified 2026-09-04: "제3종일반주거지역", "제1종일반주거지역", "일반상업지역"),
keyed by the same bbox/PNU query `/api/vworld/footprint` already makes.

So applicability becomes **evidence**, not a guess: the 일조권 rule applies in
전용주거지역 and 일반주거지역 and does not in 상업지역, and the model can say which
one this building sits in and cite the layer for it. The direction still comes
from geometry — parcel ring, building ring, true north — but the *reason* is now
sourced rather than assumed.

## 1. Requirement (RE)

- A registered floor-area drop becomes a **directed** setback — removed from a
  chosen face — rather than a uniform inset, whenever the direction can be
  derived from evidence.
- The direction is derived geometrically, from the parcel ring, the building
  ring and true north, all of which the reconstruction already has. The 건축법
  rule appears in the assumption ledger as the *explanation*, never as the
  source of a value the register did not state.
- When no direction can be derived, the plate stays concentric and says so.
  Concentric is the honest fallback, not the default.
- Grade does not rise. A directed plate is `D-INFERRED`, exactly as the
  concentric one is today.

## 2. Specification (SDD) — BDD scenarios

**S1 — 주거지역 + north slack ⇒ north step.** Given `LT_C_UQ111` reports a
전용/일반주거지역 for the site, a parcel ring and a building ring where the building
hugs the southern parcel edge and leaves slack to the north, and a level whose
registered area is smaller than the one below, when the plate is built, then the
area is removed from the north face; `plateGrade` is `D-INFERRED`; and the
assumption ledger cites 건축법 시행령 제86조 **and** the zoning layer as its evidence.

**S1b — 상업지역 ⇒ no 일조권 claim.** Given the same geometry but `uname` reporting
a 상업지역, when the plate is built, then the 일조권 rationale is absent from the
ledger; the direction may still be derived from lot slack, recorded as geometry
alone, and the zoning that ruled the rule out is named.

**S2 — podium.** Given level 1's registered area exceeds level 2's and no
directional evidence resolves, when plates are built, then level 1 keeps the
full footprint, level 2+ step back on the face furthest from the parcel
centroid, and the ledger records that the street frontage was not determined.

**S3 — no evidence ⇒ concentric, stated.** Given no parcel ring (GIS returned a
building outline only, or nothing), when a smaller level is built, then the plate
is concentric — byte-identical to today's `scaleAbout` result — and an assumption
entry states that the setback direction is undetermined and that the envelope
per orientation is therefore unreliable.

**S4 — an impossible step is a conflict, not a shape.** Given a registered area
drop so large that removing it from any single face leaves a plate narrower than
`MIN_PLATE_DEPTH` (or self-intersecting), when the plate is built, then no
directed plate is emitted: the level falls back to concentric and a
`ConflictEntry` records the contradiction between the stated area and the
observed outline.

**S5 — area is preserved.** For every scenario above, `areaSqm(plate)` matches
the registered area within the existing `AREA_TOLERANCE_PCT`, and the
`buildAreaValidation` row for that level stays `PASS`. A directed setback changes
*where* area was removed, never *how much*.

## 3. Constraints (CDD)

- **May touch**: `src/lib/cad-reconstruction/reconstruct.ts` (`makeLevel`,
  `resolveLevelSpecs`), `src/lib/cad-reconstruction/geometry.ts` (a directed
  inset alongside `scaleAbout`), `src/lib/cad-reconstruction/types.ts`
  (`ReconLevel.setbackFace`), `src/app/api/vworld/footprint/route.ts` or a
  sibling zoning route for `LT_C_UQ111`, their tests, and
  `docs/02_Features/Evidence-to-CAD Reconstruction.md`.
- **Must not**: grade a directed plate above `D-INFERRED` (a *sourced reason* for
  a setback is not a *measurement* of one); apply the 일조권 rule when the zoning
  layer did not answer — an absent district is unknown, never assumed
  residential; drop or weaken the existing `X-UNRESOLVED` path when
  an above-grade floor demands `raw > 1.05` (`reconstruct.ts:771`); change
  `AREA_TOLERANCE_*`; emit a self-intersecting ring.
- **Fitness**: the directed inset is a pure function of (ring, target area,
  face index) and is area-exact to the same tolerance as `scaleAbout`;
  `reconstruct()` stays deterministic for the same evidence.

## 4. Evaluation (EDD)

- **Tests to write first**:
  - rectangle + north slack + 0.7× area → north edge moves south; south, east,
    west edges unmoved; area within tolerance
  - same building, parcel ring absent → result equals today's `scaleAbout` ring
    exactly (regression lock on the fallback)
  - L-shaped ring, directed inset → no self-intersection, area within tolerance
  - area drop that would leave depth < `MIN_PLATE_DEPTH` → concentric fallback +
    one `ConflictEntry`
  - level 1 > level 2 → podium branch, level 1 plate === footprint
  - every scenario → `buildAreaValidation` row for the level is `PASS`
- **Gates**: `tsc --noEmit`, full vitest, Playwright, eslint.
- **Acceptance criteria**:
  - [ ] A 다세대 with a stepped north elevation reconstructs with the step on
        the north face, and the DXF elevation sheet shows it there
  - [ ] Per-orientation wall area from P2-30 differs between a directed and a
        concentric plate for the same registered areas
  - [ ] No building's area validation regresses from `PASS`
- **Honesty checklist**: the 건축법 citation explains a *recognised pattern*, and
  the assumption ledger says the zoning district was never read; an undetermined
  direction is stated, not defaulted away; a directed plate carries no better
  grade than the concentric one it replaces.
- **Done when**: the setback direction is either derived from evidence and named,
  or declared undetermined — and never silently spread across four faces.

## Follow-ups (out of scope here)
- Record the 건축법 시행령 제86조 setback figures in
  `docs/05_Research/ENERGY_STANDARD_TRACEABILITY.md` before any of them is coded
  — the same ledger discipline every U-value in this repo is held to.
- Street-frontage detection (road-centreline layer) to resolve the podium case.
- Core sized and placed from 전유공용면적 — `area-detail.tsx:31` already renders
  the 전유/공용 split the register states, while `buildCore` (`reconstruct.ts:891`)
  guesses a use-family fraction of the plate instead.
