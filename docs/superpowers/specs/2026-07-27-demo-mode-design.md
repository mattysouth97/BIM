# Demo Mode (데모모드) — Design

Date: 2026-07-27
Status: Implemented in branch `claude/demo-mode-no-api-key-84ec4b`

## Problem

A visitor without a data.go.kr API key — and any deployment where the embedded
shared server key (`DATA_GO_KR_API_KEY`) is missing or rate-limited — cannot
experience the app at all. We want a zero-dependency demo path: one click loads
a default building in the full detail view (3D viewer + ledger panels) from
bundled sample data, with no API key and no network calls.

## Approach

Client-side fixture interception at the `apiFetch` layer, keyed by a reserved
demo building ID. All six ledger endpoint functions funnel through `apiFetch`,
so intercepting there makes every existing consumer (`useCompositeBuilding`,
`useBuildingSearch`, `useFloorData`, `useBuildingDetail`) work unchanged.

- `/building/demo` — reserved slug. `decodeBuildingId("demo")` returns sentinel
  params `{ sigunguCd: "00000", bjdongCd: "00000", platGbCd: "0", bun: "0000",
  ji: "0000" }`. No real 시군구 uses code 00000, so the sentinel cannot collide
  with a real building.
- `apiFetch` checks `isDemoParams(params)` first and resolves the bundled
  `ApiListResponse` fixture for the requested endpoint path — no `fetch`, no
  key, works offline.
- `useBuildingFootprint` returns a bundled WGS84 L-shaped polygon when asked
  for the demo building's address, skipping the VWorld proxy call.
- Home page: the existing "no API key" amber banner gains a
  "데모 건물 보기 / View demo building" button linking to `/building/demo`.
- `BuildingToolbar` shows a small "데모" badge when
  `title.mgmBldrgstPk === DEMO_BUILDING_PK` so sample data is clearly labeled.

### Alternatives considered

1. **Global demo-mode toggle** intercepting search + all endpoints app-wide.
   More state, more fixtures, and the request only calls for viewing a default
   building — rejected (YAGNI).
2. **Server-side fixtures** (`?demo=1` on the proxy routes). Touches six routes,
   adds round-trips, and loses the offline benefit — rejected.

## Demo building — "데모 오피스 타워"

One representative default type: a 2008-approved RC 업무시설 (office), chosen
because the procedural curtain-wall facade, clean-texture era (2000+), and the
GX retrofit/CAPEX features all showcase best on a commercial mid-rise.

- 10 above-ground floors + 2 basements (주차장/기계실), 높이 41.5 m
- L-shaped footprint ≈ 36 m × 28 m with a 16 m × 12 m notch → 건축면적 816 m²
- 대지면적 1,650 m² → 건폐율 49.45 %, 지상연면적 8,124 m² → 용적률 492.4 %
  (consistent with 일반상업지역 zoning fixture)
- Fixture values are generated programmatically in
  `src/lib/demo/demo-building.ts` so floor sums, counts, and ratios stay
  internally consistent by construction.
- Footprint is a closed WGS84 ring near 서울 강남구 테헤란로, in the
  `number[][][]` rings-of-`[lng, lat]` format `BuildingScene` projects.

Downstream features that fetch per-building extras (energy actuals, twin data)
degrade exactly as they do for real buildings with no records — no special
handling needed.

## Files

- `src/lib/constants.ts` — `DEMO_BUILDING_ID`, `DEMO_BUILDING_PK`,
  `DEMO_BUILDING_PARAMS`, `isDemoParams()`, demo branch in `decodeBuildingId`
- `src/lib/demo/demo-building.ts` — typed fixtures, `getDemoResponse(path)`,
  `DEMO_ADDRESS`, `DEMO_FOOTPRINT`
- `src/lib/api-client.ts` — demo short-circuit at the top of `apiFetch`
- `src/hooks/use-building-footprint.ts` — demo footprint short-circuit
- `src/app/page.tsx` — demo button in the no-key banner
- `src/components/building/building-toolbar.tsx` — 데모 badge
- `src/lib/demo/__tests__/demo-building.test.ts` — fixture consistency +
  interception tests

## Testing

- Unit (vitest): `decodeBuildingId("demo")` mapping; `isDemoParams` accepts the
  sentinel and rejects real districts; every bldrgst endpoint returns items for
  demo params with **zero** `fetch` calls; fixture consistency (floor record
  count = 지상+지하 층수, per-floor sums match 연면적, footprint ring closed &
  ≥ 4 points); demo works with an empty API key store.
- `pnpm build` + `pnpm lint` for type/lint gates.
- Browser: open `/building/demo` with no key set; confirm viewer + panels render
  and the network tab shows no `/api/bldrgst/*` requests.
