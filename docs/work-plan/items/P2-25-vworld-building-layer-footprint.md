---
id: P2-25
title: VWorld building-layer footprint (LT_C_SPBD) — true building outline + storey count (height tier VOID, see Correction)
priority: P2
area: geometry
status: in-review
owner: claude-fable-5-session
effort: M
created: 2026-07-23
updated: 2026-09-04
use_cases: [UC-01, UC-05]
---

# P2-25 — Building outline from GIS건물통합정보, not the parcel

The "footprint" the twin extrudes today is the **cadastral parcel**
(`LP_PA_CBND_BUBUN`, 연속지적도 필지) — the lot boundary, not the building.
A building occupying 60% of its lot renders ~1.67× too large in plan, and
every facade/window-ratio estimate inherits that error. VWorld's
GIS건물통합정보 layer (`LT_C_SPBD`) carries the actual **building outline
polygon** plus measured attributes, keyed by the same PNU we already
construct.

> **This item was written believing `LT_C_SPBD` also carried `buld_hg`
> (building height, m) and `und_flo_co` (underground floors). It does not.
> See the Correction below — the outline and storey-count halves are sound
> and shipped; the height half never worked and could not have.**


## Correction (2026-09-04) — the height tier is void

`LT_C_SPBD` **does not carry building height.** It was never going to, and
the tier this item added for it has never fired in production or anywhere
else.

Measured, twice, two ways:

- **Production**, after the `icn1` region fix made VWorld reachable at all:
  34 buildings — 4 direct lookups (서울 중구, 강남, 부산 서면, 광명) plus 30
  neighbours from one `contextMode` query — returned `height: null` in
  **every single case**. `groundFloors` populated 28 of 30.
- **Upstream directly**, four bboxes across Seoul / Gangnam / Busan /
  Gwangmyeong: `LT_C_SPBD` returns exactly ten property keys every time —
  `bd_mgt_sn, bul_eng_nm, buld_nm, buld_nm_dc, buld_no, gro_flo_co, gu,
  rd_nm, sido, sigungu`. No `buld_hg`. No `und_flo_co`.

So `gro_flo_co` is the only one of the three attributes this item named that
exists. **`parseBuildingAttributes` is correct** — it looks for the field and
honestly returns `null` (AFF-6). The field is simply not in the dataset, and
no amount of parser tolerance can conjure it.

What this makes false, and is corrected below:

- **S4** (measured-height fallback) — the scenario is still a true statement
  about `generateBuildingGeometry`, but nothing in production can satisfy its
  precondition. Marked VOID rather than deleted: the code path is correct and
  harmless, and deleting the record would hide why it exists.
- The fallback chain documented at `building-geometry.ts` as
  `ledger heit → VWorld measured → era estimate` describes three tiers of
  which **two** are live. A reader believing otherwise is the honesty defect;
  the comment is corrected to say the middle tier has no supplier today.

**Not claimed:** that VWorld has no height data anywhere. Six plausible
layers were probed — `LT_C_SPBDLIT`, `LT_C_SPBLC`, `LT_L_SPBD`,
`LT_C_BLDINFO`, `LT_C_ADSIDO` (all rejected as invalid `data` values) and
`LT_C_UPISUQ151` (23 keys, none height-ish). That is a negative result about
**those six**, not about the platform. Hunting for a height-bearing layer is
deliberately **not** in scope here; if someone wants it, it is a new item and
it starts from evidence, not from an assumption that one must exist.

**What still stands, unchanged:** the outline half. `LT_C_SPBD` is a real
building-outline source and replacing the cadastral parcel with it was the
point of this item. That shipped and works.


### What the permanent `null` reaches

Traced by a second session and re-verified here, because the surface is wider
than the one comment. `route.ts:639`
(`toPositiveNumber(props.buld_hg ?? props.height)`) is the **sole** producer of
`measuredHeightM` in the tree — grep confirms no second source — so every site
below receives `null` forever.

| Site | Status | Verdict |
|---|---|---|
| `engine/steps/ingest.ts:17` | emits `{kind:"height", source:"vworld-measured"}` behind `isUsablePositive(measuredHeightM)` | **Genuinely unreachable.** An evidence kind the pipeline is prepared to record that no input can justify. |
| `engine/steps/fuse.ts:6` | `HEIGHT_PRIORITY = ["ledger","vworld-measured","manual"]` | Middle entry can never match. Harmless, but it describes a tier that does not exist. |
| `lib/fidelity/input-provenance.ts:74` | grades heights | **NOT unreachable — do not delete.** See correction below. |
| `hooks/use-campus-buildings.ts`, `properties-panel`, `report-stage` | thread `measuredHeightM` as a prop | Always `null`; renders as unavailable, which is correct. |

**Correction to a claim made during triage.** It was reported that the
`'measured'` heights provenance state is unreachable. **It is not.**
`input-provenance.ts:74` reads:

```ts
ledgerHeit > 0 || (measuredHeightM !== null && measuredHeightM > 0) || calibrationApplied
```

`ledgerHeit > 0` is the ordinary case — most registers state a height — so
`heights: "measured"` is reached constantly. Only the **middle disjunct** is
dead, and a dead disjunct in an `||` chain is redundant, not wrong. Deleting
that branch on the strength of the overstatement would have removed nothing
useful; deleting the grading would have broken a live, correct signal.

**Why no test caught any of this:** every test on the path injects the height
itself — `use-campus-buildings-building-layer.test.ts:118` asserts `43.5` from
a fixture, `building-geometry.test.ts:48` passes `{ measuredHeightM: 43.5 }`.
Each is an honest test of its function and blind to whether anything ever
supplies the input. That is the general lesson worth more than this item: a
suite that only ever tests functions against injected inputs cannot tell you a
supplier does not exist.

**Code change deliberately NOT made here.** Removing the `"vworld-measured"`
height evidence kind is defensible — retained-but-unreachable is a pattern this
repo keeps paying for — but it edits the engine's `SourceKind` union and its
fusion priorities, which is a refactor, not a re-scope. It is recorded here as
a decision someone should take deliberately, with tests, and not smuggled into
a documentation correction. `"vworld-measured"` remains correct and reachable
for **footprints** (`ingest.ts:16`), so any removal must be surgical: the
height emission only, never the kind itself.

## 1. Requirement (RE)
- The single-building twin uses the real building outline when VWorld has
  one, falling back to the parcel outline (today's behavior) otherwise, and
  the response names which source was used (honesty / provenance).
- ~~When the ledger height is unavailable (`heit=0`), the twin uses the
  VWorld measured height before resorting to the era estimate.~~ **VOID
  (2026-09-04)** — `LT_C_SPBD` carries no height, so this requirement has no
  data source. The live chain is `ledger heit` → era estimate. The
  `measuredHeightM` parameter is retained as a generic input for a height
  measured from *some* source (an uploaded drawing, a user statement); it is
  not fed by VWorld and must not be described as if it were.

## 2. Specification (SDD) — BDD scenarios

**S1 — building-layer hit.** Given VWorld `LT_C_SPBD` returns ≥1 feature
for the query, when `GET /api/vworld/footprint?pnu=…` (or address/lat-lng
mode), then the response polygon is the building outline, `source:
"building"`, and `attributes` carries `{ height, groundFloors,
undergroundFloors }` parsed from feature properties (each `null` when
absent/non-finite/≤0 — never fabricated). **In practice `height` and
`undergroundFloors` are always `null`: the dataset has no such fields. Only
`groundFloors` is ever populated.**

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

**S4 — measured-height fallback. VOID (2026-09-04).** The behaviour is real
and unit-tested — given `title.heit = 0` and a measured height H > 0 passed
to `generateBuildingGeometry`, `totalHeight = H` — but **no production input
supplies H**, because the only intended supplier (`LT_C_SPBD.buld_hg`) does
not exist. Retained as a scenario for whatever supplies a measured height in
future; it is not evidence that the twin uses VWorld heights, and nothing
should cite it as such.

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
  The tolerance is kept — it costs nothing and is correct for the one field
  that exists — but note it was written against documentation, and the
  documentation was wrong about two of the three.

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
  - [~] ~~Measured height reaches the twin when the ledger is silent~~ —
        **not achievable**; the plumbing is correct and the supplier does not
        exist. The fallback chain IS documented at the call site, and as of
        2026-09-04 that documentation names the middle tier as unsupplied.
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
- **Done when**: ~~a building whose ledger lacks `heit` renders with the
  VWorld outline and measured height~~ → a building renders with the VWorld
  **outline** and the API names its source. A building whose ledger lacks
  `heit` falls to the era estimate, and the code says so.
- **Re-scope notes (2026-09-04)**: evidence gathered by the P2-31 session
  while verifying an unrelated finding. No code behaviour changed — the
  runtime was already honest (`null` in, era estimate out). What changed is
  that the documents stop describing a tier that cannot run.

## Follow-ups (out of scope here)
- **If a real building-height source is wanted**, open a new item and start
  from evidence. Candidates NOT yet probed: 국가공간정보포털 /
  건축물통합정보 services, or the 건축HUB register's own `heit` (already
  the first tier). Do not start from the assumption that a VWorld layer
  carries it.
- Context massing: neighbor buildings from an `LT_C_SPBD` bbox query as
  gray extrusions (shading credibility for GX scenarios). **Unaffected by
  this correction** — `resolveNeighborHeight` degrades
  `height → groundFloors × estimate → default`, and `groundFloors` is real
  (28/30 measured), so neighbour massing was never relying on `buld_hg`.
- Wire `InputProvenance` (P2-12 badge prop) to the new `source` field.
- Campus mode building-layer upgrade (multi-building-per-PNU semantics).
