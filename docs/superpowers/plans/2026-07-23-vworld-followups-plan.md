# VWorld Follow-ups — Context Massing, Provenance Wiring, Campus Building Layer

Executes the three follow-ups filed in `docs/work-plan/items/P2-25-vworld-building-layer-footprint.md`.
Branch: `feat/digital-twin-pivot` (repo convention: items commit directly to this branch).

## Global Constraints (binding for every task)

- **TDD mandatory** (repo process `docs/work-plan/AI_PROCESS.md`): write the named failing
  tests first, confirm they fail for the right reason, then implement.
- **AFF-1**: no `'use client'` directive in `src/lib/**` pure modules.
- **AFF-2**: every new/changed route validates input (zod or explicit guard); no API key,
  env value, or secret in any response body or error message. Upstream failure → 502,
  missing `VWORLD_API_KEY` → 503, bad params → 400 — never HTTP 200 with `error` set.
- **AFF-6**: unavailable data is explicit (`null` / named fallback constant), never
  fabricated. Every fallback is named in code.
- **Do not rename or remove** any existing field of `/api/vworld/footprint` responses
  (`polygon`, `parcelCount`, `source`, `attributes`, `footprints`, `truncated`, `error`).
- Default (no new param) behavior of every existing route mode must be byte-identical —
  all pre-existing tests in `src/app/api/vworld/footprint/__tests__/route.test.ts` pass
  unmodified.
- All upstream fetches use `AbortSignal.timeout(...)` (10–15s, match existing).
- Each task creates its work-plan item file (template: copy structure of
  `docs/work-plan/items/P2-25-vworld-building-layer-footprint.md`, frontmatter
  `status: in-review`, `owner: claude-fable-5-session`, `updated: 2026-07-23`), adds a row
  + changelog line to `docs/work-plan/README.md`, and adds any new domain term to
  `docs/work-plan/knowledge/domain-glossary.md`.
- Gates per task: targeted vitest, full `pnpm vitest run` (baseline 1343 + P2-24's tests),
  `pnpm lint` (0 errors), `pnpm build` green. Commit with a `P2-2N:` prefixed message.
- Useful existing pieces: `extractFeatureCandidates` / `parseBuildingAttributes` /
  `pickLargest` in `src/app/api/vworld/footprint/route.ts`; `createSceneProjection` in
  `src/lib/gis-transform.ts`; height chain `opts.measuredHeightM` in
  `src/lib/building-geometry.ts`.

## Task 1: Neighbor context massing (work item P2-26)

**Goal**: render surrounding buildings as gray extrusions around the single-building twin
so shading/solar context is visible (GX credibility).

**Server** — extend `GET /api/vworld/footprint` with a context mode:
- Params: `contextMode=true`, `lat`, `lng` (finite, zod-validated), optional `radius`
  meters (finite, clamped to [50, 500], default 150).
- Query `LT_C_SPBD` with `geomFilter=BOX(...)` around the point (convert radius meters →
  degrees: lat `radius/111320`, lng `radius/(111320*cos(lat))`), `size=30`.
- Response 200: `{ neighbors: Array<{ pnu: string; polygon: number[][][]; height: number | null; groundFloors: number | null }>, truncated: boolean, error: null }`
  where `truncated = neighbors.length >= 30`. Reuse `extractFeatureCandidates` +
  `parseBuildingAttributes`; `pnu` from feature `properties.pnu ?? ""`. Polygon rings are
  raw WGS84 `[lng, lat]` (projection stays client-side).
- Errors: 400 invalid params, 503 no key, 502 upstream failure (contextMode has NO parcel
  fallback — neighbors are best-effort context, an empty array is acceptable, but an
  upstream non-OK/throw is a 502 per AFF-2).

**Client** —
- Pure module `src/lib/context-massing.ts` (no `'use client'`):
  - `resolveNeighborHeight(height, groundFloors)`: measured height → else
    `groundFloors * ESTIMATED_FLOOR_HEIGHT_M` (3.3) → else `DEFAULT_NEIGHBOR_HEIGHT_M`
    (6). Export the named constants.
  - `toLocalNeighbors(neighbors, centerLng, centerLat, subjectOuterRing)`: project each
    neighbor's outer ring to local `[x, z]` meters via `createSceneProjection(centerLng,
    centerLat)`; EXCLUDE any neighbor whose outer-ring centroid lies inside
    `subjectOuterRing` (WGS84 point-in-polygon helper, ray-cast, unit-tested) — that is
    the subject building itself. Returns `Array<{ points: [number, number][]; height: number }>`.
- Component `src/components/viewer/context-massing.tsx`: fetch via a new
  `useNeighborMassing(centerLngLat | null)` hook (react-query, 30 min staleTime,
  `enabled` only with a center; center = WGS84 centroid of the subject's
  `footprintData.polygon` outer ring, computed by the caller); render one `<mesh>` per
  neighbor with `ExtrudeGeometry` from a `THREE.Shape` of the points (depth = height,
  rotated flat), material `MeshStandardMaterial({ color: '#cfcfcf', roughness: 0.95 })`,
  `castShadow` + `receiveShadow`, all under one `<group name="context-massing">`.
- Mount in `src/components/viewer/building-scene.tsx` single-building path only (not
  campus), only when `footprintData?.polygon` exists. Check
  `src/components/workspace/scene-outliner.tsx` / layer visibility store for an existing
  natural toggle; if one exists wire it, otherwise render unconditionally.

**Tests to write first**: route contextMode — 400 on NaN lat, 503 no key, 502 upstream
throw, 200 parses neighbors + truncated flag, attributes null-not-fabricated;
`context-massing.ts` — height chain (measured / floors / default), point-in-polygon
exclusion, projection output shape. Component render is NOT tested (R3F).

## Task 2: Wire footprint/height provenance into the fidelity badge (work item P2-27)

**Goal**: the `InputProvenance` prop added in P2-12 (`src/components/twin/fidelity-badge.tsx`)
is rendered nowhere with real data. Derive it from actual sources and pass it at the
badge's existing call sites.

- Pure fn `deriveInputProvenance(inputs)` in `src/lib/fidelity/input-provenance.ts`:
  - inputs: `{ footprintSource: 'cad' | 'ifc' | 'building' | 'parcel' | null; ledgerHeit: number; measuredHeightM: number | null; calibrationApplied: boolean }`
  - `footprint`: `'measured'` when footprintSource is `'cad' | 'ifc' | 'building'`
    (actual building outline); `'estimated'` for `'parcel'` (lot boundary ≠ building) and
    `null` (era box).
  - `heights`: `'measured'` when `ledgerHeit > 0` OR `measuredHeightM > 0` OR
    `calibrationApplied`; else `'estimated'`.
  - `facade`: `'measured'` only when `calibrationApplied` (P2-12 calibration semantics —
    verify against `src/lib/fidelity/fidelity-assessor.ts` and adjust input shape if the
    assessor already exposes a facade signal; keep the fn pure either way).
- Find every `<FidelityBadge` call site (grep; expected in twin overlay / summary card),
  thread the real inputs: CAD/IFC ingest from the existing accuracy-path/ingest result
  (`src/lib/cad/ingest-result.ts` `resolveAccuracyPath`), VWorld source + height from
  `footprintData` (`source`, `attributes.height`), ledger `heit`, calibration from the
  P2-12 loader. Where a call site lacks access to `footprintData`, thread the prop down —
  do not fetch again.
- **Tests to write first**: `deriveInputProvenance` truth table (≥6 cases incl. parcel →
  footprint estimated, vworld-height-only → heights measured); one RTL test that the
  badge at a real call site shows "measured" for footprint when source is building.

## Task 3: Campus mode building-layer upgrade (work item P2-28)

**Goal**: campus buildings get real outlines and measured heights, keeping parcel-based
matching as fallback.

- Server: `bboxMode=true` gains optional `layer=building` param. Default (`layer` absent
  or `parcel`) is byte-identical to today (parcel query). With `layer=building`: query
  `LT_C_SPBD` with the same bbox, `size=30`; response
  `{ footprints: Array<{ pnu: string; polygon: number[][][]; height: number | null; groundFloors: number | null }>, truncated, error: null }`
  — same envelope as parcel mode plus per-item attributes. Multiple buildings may share a
  PNU — return all; client picks.
- Client `src/hooks/use-campus-buildings.ts`: fetch parcel AND building bbox lists in
  parallel (`Promise.all`, building fetch failure degrades to `[]`, never rejects the
  campus query). Per ledger record (existing `buildingPnu` match): prefer the
  largest-area building footprint with that PNU; fall back to the parcel footprint
  (today's behavior). Carry `measuredHeightM` (building `height`) on `CampusBuilding`
  (extend `src/lib/campus/campus-types.ts` additively).
- `src/lib/campus/campus-scene.ts`: pass `{ measuredHeightM }` into
  `generateBuildingGeometry` so campus heights use the ledger → measured → era chain.
- **Tests to write first**: route `layer=building` returns attributes and default stays
  parcel (URL dataset assertion); campus hook match logic — building preferred over
  parcel, largest-per-PNU, parcel fallback when no building, degraded building fetch;
  campus-scene passes measured height through (unit test on the geometry call or
  resulting totalHeight).
