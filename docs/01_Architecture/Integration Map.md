---
type: architecture
status: implemented
last_verified: 2026-08-27
---

# Integration Map

Only **three** external hostnames appear in `src`: `apis.data.go.kr`,
`api.vworld.kr`, and `www.data.go.kr` (a documentation link). Anthropic is
reached through its SDK rather than a literal URL.

Every integration is proxied through a route handler under `src/app/api/` so no
credential ever reaches the browser.

---

## 1. 건축물대장 — data.go.kr 건축HUB

**Purpose** — the product's front door. Resolve a Korean building into its
official register record: floor areas, storey counts above and below grade,
height, main use, structure, roof type, approval and permit dates, and per-floor
outlines. This is step 1 of the four-step workflow and the seed for the twin.

**Owner** — [_factory.ts](../../src/app/api/bldrgst/_factory.ts) on the server;
[use-composite-building.ts](../../src/hooks/use-composite-building.ts) on the
client.

**Input** — `sigunguCd`, **`bjdongCd`** (required), `platGbCd`, `bun`, `ji`,
optional `mainPurpsCd`, `numOfRows`, `pageNo`. Zod-validated; `numOfRows` clamped
to 100, except `floors` and `areas` which clamp to 500.

**Output** — six endpoints against
`https://apis.data.go.kr/1613000/BldRgstHubService` (**not** `BldRgstService_v2`):

| Route | Upstream operation | 국문 |
|---|---|---|
| `/api/bldrgst/title` | `/getBrTitleInfo` | 표제부 |
| `/api/bldrgst/recap` | `/getBrRecapTitleInfo` | 총괄표제부 |
| `/api/bldrgst/floors` | `/getBrFlrOulnInfo` | 층별개요 |
| `/api/bldrgst/areas` | `/getBrExposPubuseAreaInfo` | 전유공용면적 |
| `/api/bldrgst/basis` | `/getBrBasisOulnInfo` | 기본개요 |
| `/api/bldrgst/jijugu` | `/getBrJijiguInfo` | 지역지구구역 |

### Failure behaviour — read this before touching the fetch layer

- **The endpoints fail independently and intermittently.** The same call 502s and
  then returns data on the immediate retry. Verified live on 대청아파트306동
  (`11680-10300-0-0012-0000`).
- Therefore **no code path may require all four.** `use-ledger-record.ts` returns
  `phase: "ready"` as soon as `title.items[0]` exists — "a blip on a sibling call
  must not discard a title we actually received."
- `useCompositeBuilding` fires all five queries in one `useQueries` call with
  `retry: 2`, `retryDelay = min(400 · 2^attempt, 1500)`. The in-code
  justification: an upstream error comes back fast (unlike a timeout), which
  makes extra attempts cheap, and the short fixed backoff bounds the worst case
  at three 15 s timeouts.
- **Omitting `bjdongCd` returns an empty body, not an error.** An empty result is
  not proof that no buildings exist.
- **`mainPurpsCd` is ignored upstream.** Filter client-side after fetch.
- **Zero means unavailable, not zero.** `platArea=0`, `heit=0`, `bcRat=0` render
  as `-`. Fitness function AFF-6 forbids displaying a fabricated value.
- 전라북도 uses the new `52xxx` codes, not the old `45xxx` — already mapped in
  `src/data/region-codes.json`.

### Configuration — the shared-key rule

[api-shared-key.ts](../../src/lib/api-shared-key.ts) resolves credentials in a
fixed order:

1. the caller's own `x-api-key` header — always accepted, **never** rate-limited
2. otherwise `process.env.DATA_GO_KR_API_KEY`, but only when **both**:
   - the request is same-origin (`Origin` or `Referer` host === `Host`; a request
     with neither, e.g. `curl`, is *not* same-origin), and
   - `takeFallbackToken(ip)` passes — a fixed 60 s window of 30 requests keyed on
     `x-forwarded-for` / `x-real-ip`
3. no key at all → `401 Missing x-api-key header`; budget exhausted → `429`

The limiter is in-memory and per-instance. Its own comment is explicit: "a
best-effort deterrent on serverless, not a hard global cap; a durable limit would
need a shared store (KV/Redis)." Carry that caveat into any capacity discussion.

Client side, [api-client.ts](../../src/lib/api-client.ts) reads the user's key
from `app-store` — and **short-circuits before any fetch when no key is set**,
which is why e2e specs seed a dummy key before `page.route` can intercept.

**Relevant code** — `src/app/api/bldrgst/*`, `src/lib/api-proxy.ts`,
`src/lib/constants.ts` (`API_ENDPOINTS`), `src/hooks/use-building-search.ts`,
`src/components/energy-diagnostics/ledger-lookup.tsx`,
`src/lib/energy-diagnostics/ledger-source.ts`.

**Relevant tests** — `src/app/api/bldrgst/__tests__/`,
`src/lib/__tests__/api-shared-key*`, `e2e/ledger-baseline.spec.ts`,
`e2e/building-flow.spec.ts` (mocked ledger asserting the specific field
"이투이테스트빌딩"), fixtures in `e2e/fixtures/ledger.ts` (public data only, no
real credential).

### Sibling data.go.kr services

Same key path, same resolver:

- `/api/energy/consumption` → `BldEngyHubService` (건물에너지정보)
- `/api/energy/grade` → `BdEnergyRatingService/getBdEnergyRating` (에너지효율등급)
- `/api/weather` → KMA `AsosHourlyInfoService` (org `1360000`)

---

## 2. VWorld — GIS building outlines

**Purpose** — obtain a real building outline (and neighbour massing / campus
context) instead of a rectangle synthesised from 건축면적.

**Owner** — [footprint/route.ts](../../src/app/api/vworld/footprint/route.ts)
(744 lines, the largest route) and
[use-building-footprint.ts](../../src/hooks/use-building-footprint.ts).

**Input** — one of: `pnu` (19-digit), `address`, `lat`+`lng`, or
`sigunguCd`+`bjdongCd`+`bun`[+`ji`,`platGbCd`]. Plus modes: `bboxMode`,
campus (20 parcels / 30 buildings), `contextMode` (30 neighbours, radius clamped
to `[50, 500]` m, default 150). All coordinates zod-validated as finite numbers.

**Output** — polygons from `https://api.vworld.kr/req/data`:

- `LT_C_SPBD` — GIS건물통합정보, the actual building outline plus measured
  attributes. **Preferred.**
- `LP_PA_CBND_BUBUN` — 연속지적도 parcel boundary, the **named** fallback when no
  building feature exists.

Responses carry a `truncated` flag when a bbox mode hits its cap.

**Failure behaviour** — a parcel result is never presented as a building
outline: `footprintSource` is threaded through `WorkspaceShell` into
`PropertiesPanel` and into `buildEngineInput`, which returns `null` for source
`"parcel"` or `null` so "the engine is honestly unavailable rather than
fabricating a footprint" (AFF-6). The demo and drawing fixtures short-circuit
before the fetch entirely.

**Important gap** — the outline is in **lon/lat degrees** and is *not* wired into
the traceable baseline. Handing degrees to a metres builder would produce a
nonsense building. The receiving seam exists
(`{ kind: "vworld_building"; ringM: Polygon2D }` in `ledger-source.ts`, and
`rebuildLedgerBaselineWithFootprint`); a projection step does not. See
[[Data Flow]].

**Configuration** — `VWORLD_API_KEY`, `VWORLD_DOMAIN` (defaults to `"localhost"`
in code). Both set in production.

**Relevant code** — `src/app/api/vworld/footprint/route.ts`,
`src/hooks/{use-building-footprint,use-campus-buildings,use-neighbor-massing}.ts`,
`src/lib/gis-transform.ts`.

**Relevant tests** — `src/app/api/vworld/__tests__/`. No live-call test exists;
the degrees-vs-metres claim is documented in code comments, not measured.

---

## 3. Anthropic — natural-language generation

**Purpose** — interpret a described building into a blueprint the generative
engine can compile. This is a **secondary** door, not the product's spine
([[ADR-001 - Register-First Product Direction]]).

**Owner** — [provider/index.ts](../../src/lib/generative/provider/index.ts) and
`provider/claude-provider.ts`; six routes under `src/app/api/generative/`.

**Input** — a prompt plus an optional existing spec, validated by zod at the
route envelope.

**Output** — the SDK call **forces a tool call** whose `input_schema` is
generated from the same Zod schema that validates the reply
(`toolInputSchema`), so no prose or fenced-JSON parsing is involved.
`generate` and `generate-from-blueprint` stream SSE
(`dynamic = "force-dynamic"`, `maxDuration` 120 / 300).

**Failure behaviour** — a missing key is not an error path. Provider selection
is data: `BIM_REASONING_PROVIDER` forces `claude` | `heuristic`; otherwise Claude
when a key is present and `HeuristicReasoningProvider` (deterministic, offline)
when it is not, "so a missing key degrades to a working building rather than a
dead button". `providerStatus()` exposes `name` / `usingFallback` / `model`
without exposing secrets.

Crucially, `/api/generative/generate-from-blueprint` — the **only** generative
route with a mounted caller — makes **no model call at all**: a blueprint is
already semantic. The schematic and CAD-import diagnosis paths therefore work
with no Anthropic key.

**Reachability** — the other five routes (`generate`, `modify`, `interpret`,
`repair`, `evaluate`) have no client caller in mounted code, because
`/studio` is now pure redirects and `GenerativeStudio` has no mount point. Do not
document them as live features.

**Configuration** — `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`,
`BIM_REASONING_PROVIDER`. `claude-provider.ts` is `import "server-only"`; unit
tests reach it through the `server-only` → `src/test/server-only-stub.ts` alias
in `vitest.config.ts`.

**Relevant tests** — `src/lib/generative/__tests__/` (66 files), including
`claude-provider.live.test.ts`, gated by `describe.skipIf(!LIVE)` on
`RUN_LIVE_API === "1"` — the one wholly-skipped test file in the suite.

---

## 4. Operator surfaces (not user integrations)

Documented here so nobody mistakes them for product features.

- **`/api/twin-data/upload`** — ingest corpora (energy bills, plans, equipment
  schedules). Requires `x-twin-data-key` matching `TWIN_DATA_API_KEY` and
  **fails closed with 401 when the variable is unset**. 64 KiB cap, slug
  validation, containment-checked path join (AFF-7), constant-time compare. The
  `GET` sibling is deliberately unauthenticated. No mounted caller.
- **`/api/v1/eco2-imports`** — dev-only (503 in production), behind
  `CORPUS_API_KEY`, writes `ml/portfolio/corpus/predictions.jsonl`. Its own
  header says the production path awaits blob storage.
- **`/api/v1/predictions/[bjdongCd]`** — the published prediction data product,
  with an in-memory 60 req/min per-IP token bucket. No in-app caller; `/releases`
  documents it as a public endpoint.

## Related

[[System Architecture]] · [[Runtime Architecture]] · [[Data Flow]] ·
[domain-glossary.md](../work-plan/knowledge/domain-glossary.md)
