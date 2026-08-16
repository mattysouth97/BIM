---
id: P2-25
title: VWorld building-layer footprint (LT_C_SPBD) — true building outline + measured height fallback
priority: P2
area: geometry
status: in-review
owner: claude-fable-5-session
effort: M
created: 2026-07-23
updated: 2026-07-23
use_cases: [UC-01, UC-05]
---

# P2-25 — Building outline from GIS건물통합정보, not the parcel

The "footprint" the twin extrudes today is the **cadastral parcel**
(`LP_PA_CBND_BUBUN`, 연속지적도 필지) — the lot boundary, not the building.
A building occupying 60% of its lot renders ~1.67× too large in plan, and
every facade/window-ratio estimate inherits that error. VWorld's
GIS건물통합정보 layer (`LT_C_SPBD`) carries the actual **building outline
polygon** plus measured attributes — `buld_hg` (building height, m),
`gro_flo_co` (ground floors), `und_flo_co` (underground floors) — keyed by
the same PNU we already construct. Separately, `building-geometry.ts:98`
falls back to `floors × era-height` whenever the ledger's `heit` is 0
(a very common gap); the VWorld measured height is a strictly better
fallback tier.

## 1. Requirement (RE)
- The single-building twin uses the real building outline when VWorld has
  one, falling back to the parcel outline (today's behavior) otherwise, and
  the response names which source was used (honesty / provenance).
- When the ledger height is unavailable (`heit=0`), the twin uses the
  VWorld measured height before resorting to the era estimate. Fallback
  order is named in code: `ledger heit` → `VWorld buld_hg` → era estimate.

## 2. Specification (SDD) — BDD scenarios

**S1 — building-layer hit.** Given VWorld `LT_C_SPBD` returns ≥1 feature
for the query, when `GET /api/vworld/footprint?pnu=…` (or address/lat-lng
mode), then the response polygon is the building outline, `source:
"building"`, and `attributes` carries `{ height, groundFloors,
undergroundFloors }` parsed from feature properties (each `null` when
absent/non-finite/≤0 — never fabricated).

**S2 — parcel fallback.** Given `LT_C_SPBD` returns no usable feature
(empty, error status, or upstream non-OK), when the same request is made,
then the route falls back to `LP_PA_CBND_BUBUN` exactly as today:
`source: "parcel"`, `attributes: null`, `polygon`/`parcelCount` unchanged
in shape. Only when **both** layers fail upstream is the 502 contract
triggered (P1-06 contract intact).

**S3 — feature selection.** Given multiple building features in one
response: PNU mode picks the largest-outer-ring-area feature; point
(lat/lng) mode picks the feature whose centroid is nearest the query
point (a 50m box can straddle a neighbor's larger building).

**S4 — measured-height fallback.** Given `title.heit = 0` and a measured
height H > 0 passed to `generateBuildingGeometry`, then `totalHeight = H`
and `floorHeight = H / grndFlrCnt`. Given `title.heit > 0`, the ledger
value wins regardless of measured input. Given neither, the era estimate
applies (existing behavior, existing tests stay green).

## 3. Constraints (CDD)
- **May touch**: `src/app/api/vworld/footprint/route.ts` (+ its test),
  `src/lib/building-geometry.ts` (+ its test),
  `src/hooks/use-composite-building.ts`, `src/hooks/use-building-footprint.ts`,
  `src/components/viewer/building-scene.tsx`,
  `docs/work-plan/knowledge/domain-glossary.md`, dashboard README.
- **Must not**: change the campus/bbox mode dataset or response shape
  (`useCampusBuildings` PNU-matching semantics stay parcel-based); remove
  or rename any existing response field (`polygon`, `parcelCount`,
  `error`, `truncated`); echo the API key or env values in any error
  (AFF-2); fabricate attribute values (AFF-6 — absent/invalid → `null`).
- **Fitness**: all existing P1-06 + P2-11 route tests pass unmodified;
  attribute parsing tolerates both documented VWorld field spellings
  (`buld_hg`/`height`, `gro_flo_co`/`grnd_flr`, `und_flo_co`/`ugrnd_flr`).

## 4. Evaluation (EDD)
- **Tests to write first**:
  - route: building-layer success → `source:"building"` + parsed attributes
  - route: building layer empty → parcel fallback, `source:"parcel"`, `attributes:null`
  - route: building layer upstream 500 → parcel fallback still 200
  - route: junk `buld_hg` ("0") → `attributes.height: null`, floors still parsed
  - route: point mode nearest-centroid selection; PNU mode largest-area selection
  - geometry: `heit=0` + measured → measured wins; `heit>0` → ledger wins
- **Gates**: targeted vitest (route + building-geometry), `pnpm test`,
  `pnpm lint`, `pnpm build`.
- **Acceptance criteria**:
  - [x] Single-building footprint prefers the building outline; parcel is
        the named fallback; response says which (`source`)
  - [x] Measured height reaches the twin when the ledger is silent; the
        fallback chain is documented at the call site
  - [x] Campus mode byte-identical; all pre-existing route tests green
  - [x] Glossary gains GIS건물통합정보 / LT_C_SPBD / PNU entries (R1.2)
- **Security checklist**: input validated (PNU from validated ledger params /
  zod bbox unchanged); no key or env value in any response or error (AFF-2:
  building-layer failures return [], parcel errors use generic messages);
  no filesystem access (AFF-7 n/a).
- **Honesty checklist**: attributes absent/zero → `null`, never fabricated
  (AFF-6, unit-tested); both fallbacks named in code and response (`source`
  field; height chain comment at `building-geometry.ts`); no unverifiable
  metric displayed.
- **Evaluation notes (2026-07-23)**: targeted vitest 31/31; full suite
  1343/1343 (includes concurrent P2-24 worktree state); `pnpm lint` 0 errors
  (11 pre-existing react-hooks warnings in untouched files). `pnpm build`
  was RED at evaluation time — `tsc --noEmit` shows every error in
  concurrent in-flight P2-24 files (`params` stage: status-bar.tsx,
  toolbar-configs.ts, workflow-stepper/workflow-store tests,
  accuracy-routing.test.ts); **zero errors in any P2-25 file**. Build gate
  re-run after P2-24 landed (0e5931a): `pnpm build` ✓ Compiled successfully
  (2026-07-23). All gates green.
- **Done when**: a building whose ledger lacks `heit` renders with the
  VWorld outline and measured height, and the API names its source.

## Follow-ups (out of scope here)
- Context massing: neighbor buildings from an `LT_C_SPBD` bbox query as
  gray extrusions (shading credibility for GX scenarios).
- Wire `InputProvenance` (P2-12 badge prop) to the new `source` field.
- Campus mode building-layer upgrade (multi-building-per-PNU semantics).
