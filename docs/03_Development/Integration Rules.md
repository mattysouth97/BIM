---
type: reference
status: implemented
last_verified: 2026-08-27
---

# Integration Rules

Rules for touching the external integrations without breaking them in ways that only show up in
production. Only **three external hostnames** appear anywhere in `src`: `apis.data.go.kr`,
`api.vworld.kr`, and `www.data.go.kr` (a documentation link). Anthropic is reached through the SDK.

Related: [[Deployment and Environment]] · [[Repository Conventions]] · [[Testing Strategy]]

## Universal rules

1. **Never call an external host from the browser.** Every integration goes through a route under
   [src/app/api/](../../src/app/api/) so the credential stays server-side.
2. **Validate input with zod at the route boundary, and never echo a secret or a `process.env`
   value in an error response** (fitness function AFF-2).
3. **Unavailable is a state, not a zero** (AFF-6). If an upstream call fails or returns nothing,
   render the reason. Do not substitute a plausible number.
4. Any server-side filesystem join must be containment-checked (AFF-7) — see
   [src/lib/twin-data/guards.ts](../../src/lib/twin-data/guards.ts) for the reference implementation.

## 건축물대장 (data.go.kr BldRgstHubService)

Base URL is `https://apis.data.go.kr/1613000/BldRgstHubService` — **not** `BldRgstService_v2`.

Six proxy routes exist. Five are one-line instantiations of
[createDataGoKrProxy](../../src/app/api/bldrgst/_factory.ts) (`recap`, `floors`, `areas`, `basis`,
`jijugu`); [title/route.ts](../../src/app/api/bldrgst/title/route.ts) is bespoke because it adds a
batch mode over a comma list of 법정동 codes (`MAX_BATCH_CODES = 10`, `MAX_BATCH_ITEMS = 20`,
introduced to stop unbounded sequential 15 s calls).

Rules:

- **`bjdongCd` is REQUIRED.** Omitting it returns an empty body, not an error — which reads as
  "no buildings" and is not.
- **`mainPurpsCd` is ignored upstream.** Filter client-side after the fetch.
- **Zero means unavailable.** `platArea=0`, `heit=0`, `bcRat=0` display as `-`.
- **전라북도 uses the new `52xxx` codes**, not the old `45xxx` — already mapped in
  [region-codes.json](../../src/data/region-codes.json).
- Row caps: the factory clamps `numOfRows` to 100, **except** `floors` and `areas`, capped at 500 —
  a tall building registers several use rows per storey and a 100-row cap silently truncates its
  층별개요. Do not "simplify" that back to a single constant.

### The four endpoints fail independently and intermittently

Verified live on 대청아파트306동 (`11680-10300-0-0012-0000`): the same call 502s and then returns
data immediately after. Consequences that are already encoded and must stay encoded:

- [use-composite-building.ts](../../src/hooks/use-composite-building.ts) fires all queries in one
  `useQueries` call with `retry: 2` and `retryDelay = min(400 * 2^attempt, 1500)` — a single retry is
  not enough, and the short fixed backoff bounds the worst case at three 15 s timeouts.
- **Never require all four.** A 표제부 that arrived is enough:
  [use-ledger-record.ts](../../src/components/energy-diagnostics/use-ledger-record.ts) returns
  `ready` as soon as `composite.title.items[0]` exists — "a blip on a sibling call must not discard a
  title we actually received."

### Key resolution and the shared-key rate limit

[api-shared-key.ts](../../src/lib/api-shared-key.ts) — every data.go.kr route resolves credentials
through `resolveDataGoKrKey(request)`:

1. The caller's own `x-api-key` header always wins and is **never** rate-limited (their quota).
2. Otherwise the shared server key `DATA_GO_KR_API_KEY`, but only when the request is **same-origin**
   (Origin or Referer host === Host; a request with neither — curl — is *not* same-origin) **and** a
   per-IP token is available: a fixed 60 s window of 30 requests.
3. Neither → 401. Token exhausted → 429 telling the caller to supply their own key.

The limiter is in-memory and per-instance: a best-effort deterrent on serverless, **not** a hard
global cap. A durable limit needs a shared store (KV/Redis). Keep that caveat in any doc you write
about it.

Other data.go.kr services use the same resolver: `/api/energy/consumption`
(BldEngyHubService 건물에너지정보), `/api/energy/grade` (BdEnergyRatingService 에너지효율등급) and
`/api/weather` (KMA `AsosHourlyInfoService`, agency 1360000).

## VWorld (building outlines)

[/api/vworld/footprint](../../src/app/api/vworld/footprint/route.ts) — 744 lines, the largest route.
Datasets: `LT_C_SPBD` (GIS건물통합정보, preferred) with `LP_PA_CBND_BUBUN` (연속지적도 parcel) as a
named fallback. Modes: bbox, campus (20 parcels / 30 buildings), context (30 neighbours, radius
clamped to [50, 500] m, default 150), with an explicit `truncated` flag.

> **The outline is in lon/lat degrees.** It is deliberately *not* wired into the traceable baseline —
> handing degrees to a builder that expects metres produces a nonsense building. See the doc comment
> in [use-ledger-record.ts](../../src/components/energy-diagnostics/use-ledger-record.ts).

The receiving seam already exists: [ledger-source.ts](../../src/lib/energy-diagnostics/ledger-source.ts)
accepts `{ kind: "vworld_building"; ringM: Polygon2D }` and stamps `cadLayer "VWORLD_LT_C_SPBD"`, and
`rebuildLedgerBaselineWithFootprint()` is exported and ready. **Wiring it means projecting to metres
first** — anything else is a correctness bug, not an improvement. Until then the baseline uses a
rectangle synthesised from 건축면적 under a named assumption id.

`VWORLD_DOMAIN` defaults to `"localhost"` in code; the production domain must be registered with
VWorld or requests are rejected.

## Anthropic (generative routes)

Provider selection is in
[src/lib/generative/provider/index.ts](../../src/lib/generative/provider/index.ts):
`BIM_REASONING_PROVIDER` forces `claude` or `heuristic`; otherwise Claude when a key is present and
the deterministic offline `HeuristicReasoningProvider` when not. The stated principle —
**"a missing key degrades to a working building rather than a dead button"** — is a product
invariant, not a fallback of convenience. Preserve it.

`claude-provider.ts` is `import "server-only"` and **forces a tool call** whose `input_schema` is
generated from the same Zod schema that validates the reply (`toolInputSchema`), so there is no
prose or fenced-JSON parsing anywhere. Do not add a text-parsing path. `providerStatus()` exposes
name / usingFallback / model and no secrets.

Six POST routes exist under `/api/generative/*`. Only `generate-from-blueprint` has a mounted
caller (the schematic editor), and it makes **no reasoning call at all** — a blueprint is already
semantic. `generate`, `modify`, `interpret`, `repair`, `evaluate` are retained but have no reachable
UI, because `/studio` is now a pure redirect and `GenerativeStudio` has no mount point.

## DWG → DXF conversion

Client tiers first: libdxfrw WASM (~1.4 MB) → LibreDWG WASM (~10 MB, lazy, reads AC1032/2018+) →
POST [/api/cad/convert](../../src/app/api/cad/convert/route.ts). All tiers funnel through
`parseDxfText` so ranking and unit handling are identical. Server-side the route tries an
operator-configured binary at `DWG_CONVERTER_PATH` (`DWG_CONVERTER_MODE` defaults to `"oda"`), then
LibreDWG WASM in-process — the tier that actually works on Vercel. Failure responses report the
detected DWG version and what each tier did; a total failure tells the user to export `.dxf`.

Two `next.config.ts` settings exist solely to keep this working on Vercel
(`serverExternalPackages`, `outputFileTracingIncludes`) — see [[Build and Run]].

Coordinate conventions ([src/lib/cad/README.md](../../src/lib/cad/README.md)): the footprint path
re-centres to world XZ at origin; everything under `cad/doc/` is **metres, native DXF XY, radians
CCW** and is only re-centred by `doc/to-footprint.ts`. Do not mix them.

## Operator-only write endpoints — fail closed

- [/api/twin-data/upload](../../src/app/api/twin-data/upload/route.ts) requires `x-twin-data-key`
  matching `TWIN_DATA_API_KEY` and **401s when that variable is unset**. 64 KiB body cap, slug
  validation, containment-checked path resolution, constant-time key compare. The GET sibling is
  deliberately unauthenticated. On Vercel these write to an ephemeral filesystem.
- [/api/v1/eco2-imports](../../src/app/api/v1/eco2-imports/route.ts) is dev-only (503 in production,
  gated on `NODE_ENV` + `VERCEL`) behind `CORPUS_API_KEY`.
- [/api/v1/predictions/[bjdongCd]](../../src/app/api/v1/predictions/) is the public read surface for
  the release data product, with an in-memory 60 req/min per-IP token bucket.

None of these has an in-app caller. They are operator surfaces; do not present them as features.

## Adding a new integration

1. Server route under `src/app/api/`, zod-validated, credential from `process.env` only.
2. Resolve the key through a shared resolver if it is a data.go.kr service.
3. Add a route test under `__tests__/` covering the missing-key path and the upstream-failure path.
4. Register the variable NAME and its absent-behaviour in [[Deployment and Environment]].
5. If the response can partially fail, decide up front which fields are load-bearing — and make the
   consumer tolerate the rest, as `use-ledger-record` does.
