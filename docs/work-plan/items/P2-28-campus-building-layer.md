---
id: P2-28
title: Campus mode building-layer upgrade — real outlines + measured heights for all campus buildings
priority: P2
area: geometry
status: in-review
owner: claude-fable-5-session
effort: M
created: 2026-07-23
updated: 2026-07-23
use_cases: [UC-05, UC-09]
---

# P2-28 — Campus mode building-layer upgrade

Campus mode today fetches cadastral **parcel** polygons (`LP_PA_CBND_BUBUN`, 연속지적도 필지)
for every building in the bbox — the same lot-boundary over-sizing issue P2-25 fixed for the
single-building path. Additionally, the campus height chain bottoms out at the era estimate
because `generateBuildingGeometry` receives no `measuredHeightM` option.

This item gives the campus path the same building-outline + measured-height upgrade P2-25
gave the single-building path, while keeping parcel matching as the named fallback when the
building layer has no feature for a given PNU.

## 1. Requirement (RE)

- Campus mode can optionally query the **building layer** (`LT_C_SPBD`, GIS건물통합정보)
  via `bboxMode=true&layer=building`, returning per-item `{ pnu, polygon, height, groundFloors }`.
  The default (`layer` absent or `layer=parcel`) is **byte-identical** to today.
- The campus hook fetches parcel AND building footprints in **parallel** (`Promise.all`).
  Building fetch failure always degrades to `[]` — never rejects the campus query.
- Per ledger record: prefer the **largest-area** building footprint with that PNU;
  fall back to the parcel footprint (today's behavior). Carry `measuredHeightM` (building
  layer `height`) on `CampusBuilding`.
- `campus-scene.ts` passes `{ measuredHeightM }` into `generateBuildingGeometry` so campus
  heights use the **ledger → measured → era** fallback chain (same as P2-25 single-building).

## 2. Specification (SDD) — BDD scenarios

**S1 — building layer requested.** Given `bboxMode=true&layer=building`, the route queries
`LT_C_SPBD` at `size=30`; the response is `{ footprints: Array<{ pnu, polygon, height, groundFloors }>, truncated, error: null }`. Multiple buildings sharing a PNU are **all** returned — the client picks by area.

**S2 — default (parcel) byte-identical.** Given `bboxMode=true` (no `layer`) or
`layer=parcel`, the route queries `LP_PA_CBND_BUBUN` as before; response shape and dataset
are byte-identical to the pre-P2-28 behavior.

**S3 — hook parallel fetch + preference.** The campus hook issues three concurrent fetches
(ledger batch, parcel bbox, building bbox). For each ledger record, the largest-area building
footprint matching its PNU is chosen; when none exists the parcel footprint is used (existing
behavior). `measuredHeightM` is `null` on the parcel fallback path (AFF-6).

**S4 — degraded building fetch.** When the building fetch fails (network, non-OK HTTP, or
timeout) the campus query completes normally with parcel-only footprints — never rejected.

**S5 — height chain.** Given `measuredHeightM` present on `CampusBuilding`, it reaches
`generateBuildingGeometry` via the `opts.measuredHeightM` parameter, feeding the
ledger → measured → era fallback chain defined in P2-25.

## 3. Constraints (CDD)

- **May touch**: `src/app/api/vworld/footprint/route.ts`,
  `src/hooks/use-campus-buildings.ts`,
  `src/lib/campus/campus-types.ts`,
  `src/lib/campus/campus-scene.ts`,
  `docs/work-plan/knowledge/domain-glossary.md`, dashboard README.
- **Must not**: change the parcel default response shape (`footprints`, `truncated`, `error`
  envelope unchanged); remove or rename any existing response field; echo API key or env
  values in any error (AFF-2); fabricate attribute values (AFF-6 — absent/zero → `null`);
  add `'use client'` to any `src/lib/**` file (AFF-1).
- **Fitness**: all pre-existing P1-06, P2-11, P2-25, P2-26 route tests pass unmodified;
  building fetch failure → campus query still resolves (never rejects); `measuredHeightM`
  absent → campus-scene passes `undefined` (not a fabricated 0).

## 4. Evaluation (EDD)

- **Tests written first (TDD — RED then GREEN)**:
  - `route-bbox-building-layer.test.ts`:
    - Default bboxMode queries `LP_PA_CBND_BUBUN` (dataset URL assertion)
    - `layer=parcel` explicit also queries `LP_PA_CBND_BUBUN`
    - `layer=building` queries `LT_C_SPBD` at `size=30`
    - `layer=building` response carries per-item `height` + `groundFloors`; `buld_hg=0` → `height null` (AFF-6)
    - `layer=building` truncated=true at 30 features; 502 on upstream throw
    - Multiple features per PNU all returned
    - Default envelope shape unchanged
  - `use-campus-buildings-building-layer.test.ts`:
    - Building preferred over parcel for same PNU
    - Largest-area building wins when multiple share PNU
    - Parcel fallback when no building match; `measuredHeightM null`
    - `measuredHeightM null` when height absent (AFF-6)
    - `fetchBBoxBuildingFootprints` returns `[]` on non-OK and on throw (degradation)
  - `campus-scene-measured-height.test.ts`:
    - `generateBuildingGeometry` called with `{ measuredHeightM: 43.5 }` when present
    - `opts.measuredHeightM` is `undefined`/null when absent (never fabricated)
    - Config array length matches layout entry count
- **Gates**:
  - Targeted vitest: 18/18 new tests GREEN
  - Full suite: 1406/1406 (≥1387 baseline preserved)
  - `pnpm lint`: 0 errors (11 pre-existing warnings in untouched files)
  - `pnpm build`: ✓ Compiled successfully
- **Pre-existing tests**: route.test.ts (27 tests) + route-context-mode.test.ts (9 tests) pass unmodified
- **Acceptance criteria**:
  - [x] `bboxMode+layer=building` queries `LT_C_SPBD` with per-item attributes; parcel default byte-identical
  - [x] Campus hook fetches building + parcel in parallel; building preferred; parcel fallback
  - [x] `measuredHeightM` carried on `CampusBuilding`; fed into `generateBuildingGeometry`
  - [x] Building fetch failure degrades to `[]`; campus query never rejects
  - [x] All gates green; all pre-existing tests unmodified and passing
- **Security checklist**: `layer` param consumed server-side but not echoed (only used to
  branch dataset); no API key or env in error (generic "VWorld API error" or `err.message`
  from throw — no upstream body echoed); bbox validated by existing zod schema (AFF-2).
- **Honesty checklist**: `measuredHeightM` absent/zero → `null`, never fabricated (AFF-6);
  parcel fallback sets `measuredHeightM: null` explicitly; campus-scene converts `null` →
  `undefined` (not 0) before passing to geometry (AFF-6 chain preserved).
- **Evaluation notes (2026-07-23)**: TDD: 18 tests RED then GREEN; full suite 1406/1406;
  `pnpm lint` 0 errors; `pnpm build` ✓ compiled successfully. Pre-existing route tests
  27/27 + context-mode tests 9/9 pass unmodified.
- **Done when**: campus buildings render with the building outline (not parcel lot) and the
  measured height fills the ledger gap, matching the single-building path quality.
