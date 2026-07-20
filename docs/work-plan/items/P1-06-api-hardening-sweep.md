---
id: P1-06
title: API hardening sweep — traversal, error contracts, proxy factory, batch caps, zod
priority: P1
area: api
status: done
owner: claude-opus-4-8-ultrawork
effort: L
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-01, UC-02, UC-04]
---

# P1-06 — API hardening sweep (post-twin-data)

Six independent but thematically-linked hardening fixes across the Next.js route
handlers. Each sub-item (a)–(f) is separately verifiable; land them in one PR
series, in order.

## 1. Requirement (RE)

- **Problem**:
  - **(a) Path traversal + unbounded subprocess in `/api/cad/convert`.**
    `src/app/api/cad/convert/route.ts:154` — `join(inputDir, file.name || "upload.dwg")`
    trusts the raw multipart filename; `:164` — `join(outputDir, file.name.replace(/\.dwg$/i, ".dxf"))`
    repeats it. A filename like `../../etc/x.dwg` escapes the temp dir (write at
    :159, read target at :182). Also `execFileAsync` is called with no timeout
    (`convertWithOda` :60-67, `convertSimple` :74) — a hung converter holds the
    route open forever.
  - **(b) `/api/vworld/footprint` violates HTTP semantics and swallows failures.**
    Catch blocks return `{ error }` with implicit HTTP 200
    (`src/app/api/vworld/footprint/route.ts:59-64` and `:108-113`); missing
    `VWORLD_API_KEY` returns 500 for a server-config issue (:26-31); bbox params
    are `parseFloat`'d with no NaN validation (:51-56, :92-93) — `?minLng=abc`
    silently produces `BOX(NaN,...)`; campus mode caps `size=20` (:176) with no
    truncation flag so clients can't tell "20 results" from "20 of many";
    upstream failures are indistinguishable from empty results
    (`if (!res.ok) return null` :129, :152, :180; `{ polygon: null, error: null }` :104).
  - **(c) Five bldrgst proxy routes are copy-paste.** `areas`, `basis`,
    `floors`, `jijugu`, `recap` under `src/app/api/bldrgst/*/route.ts` differ
    only in the endpoint key at line 28 (verified by `diff` — single-line
    difference per file). Any contract fix must currently be applied 5×.
    `fetchFromDataGoKr` (`src/lib/api-proxy.ts:7` — path correction: the brief's
    `api-proxy.ts` is `src/lib/api-proxy.ts`, not `src/lib/api/api-proxy.ts`)
    defaults `numOfRows` to "20" (:26) but never clamps a caller-supplied value
    (e.g. `numOfRows=100000` passes through).
  - **(d) Unbounded fan-out in title batch mode.**
    `src/app/api/bldrgst/title/route.ts:32-35` splits a comma-separated
    `bjdongCd` list with no count cap; the loop (:40-57) `await`s each upstream
    call sequentially (each up to 15 s via `src/lib/api-proxy.ts:31`) and breaks
    only when ≥20 items accumulate (:55-56). 50 codes × 15 s timeouts =
    12.5 minutes of sequential waiting, far past any function timeout.
  - **(e) Corrupted BASE_URL + wrong doc in energy consumption route.**
    `src/app/api/energy/consumption/route.ts:9` — the `BASE_URL` string literal
    begins with a literal TAB character (`"\thttps://…BldEngyHubService"`);
    it only works because `new URL()` (:23) strips leading C0/space characters
    per the WHATWG URL spec. The doc comment (:4-5) names a different endpoint
    (`BdEnergyUseService/getBdEnergyUse`) than the code uses (`BldEngyHubService`).
  - **(f) No input validation layer.** `zod` ^4.3.6 is installed
    (`package.json:55`) but imported nowhere in `src/` (verified by grep) —
    every route hand-rolls param parsing.
- **Impact**: (a) arbitrary file write/read within process privileges + DoS via
  hung converter; (b) clients cannot distinguish "no data" from "upstream down",
  and error monitoring sees HTTP 200 for failures; (d) a single query string can
  hold a serverless function hostage for minutes; (c) drift risk — a fix applied
  to 4 of 5 routes is a silent contract fork.
- **Use case**: As the maintainer of this app's API surface, I want uniform
  error contracts (non-200 on failure), validated inputs, bounded fan-out, and
  one proxy factory, so that upstream outages and hostile inputs produce
  correct, observable behavior.

## 2. Specification (SDD)

- **Context pack** (read in this order):
  1. `src/lib/api-proxy.ts` (shared fetcher + `extractItems`/`extractTotalCount`)
  2. `src/lib/constants.ts:4-16` (`DATA_GO_KR_BASE_URL`, `API_ENDPOINTS`, `EndpointKey`)
  3. `src/app/api/cad/convert/route.ts` (full file, 200 lines)
  4. `src/app/api/vworld/footprint/route.ts` (full file, 314 lines)
  5. `src/app/api/bldrgst/{areas,basis,floors,jijugu,recap,title}/route.ts`
  6. `src/app/api/energy/consumption/route.ts` (full file)
  7. `src/app/api/cad/convert/__tests__/route.test.ts` (existing route-test pattern — mirror it)
  8. Clients that consume these contracts before changing shapes: grep
     `api/vworld/footprint`, `api/bldrgst`, `api/energy/consumption` under `src/`.
- **BDD scenarios**:
  1. *(a)* Given a multipart upload named `../../evil.dwg`, when POSTed to
     `/api/cad/convert`, then the route responds 400 and writes nothing outside
     the temp work dir; given a converter that never exits, when conversion is
     attempted, then `execFile` is killed after 60 s and the route responds 502
     with the existing hint payload shape.
  2. *(b)* Given `VWORLD_API_KEY` unset, when GET `/api/vworld/footprint`, then
     the response is 503 (not 500) with `{ polygon: null, error }`; given an
     upstream VWorld failure, then the response is 502 with an error string —
     never HTTP 200 with `error` set; given `?bboxMode=true&minLng=abc`, then
     400 with a param-validation message; given campus mode, then the payload
     carries `truncated: boolean` derived from feature count vs `size=20`.
  3. *(c)* Given the five bldrgst routes, after refactor each `route.ts` is a
     ≤5-line `createDataGoKrProxy("<endpoint>")` instantiation; a
     `numOfRows=99999` request is clamped to the factory maximum and the
     response echoes the clamped value.
  4. *(d)* Given `batchMode=true` with 25 comma-separated `bjdongCd`s, when GET
     title, then at most 10 codes are queried (extra codes reported via a
     truncation indicator), calls run via `Promise.all`, and worst-case latency
     is one upstream timeout (≤15 s), not N×15 s; per-code failures are
     tolerated and surfaced in the response (e.g. `failedCodes: string[]`).
  5. *(e)* Given the consumption route, then `BASE_URL` contains no whitespace
     and the doc comment matches the actual service (`BldEngyHubService`).
  6. *(f)* Given each hardened route, then query params are parsed through a
     zod schema and schema failures return 400 with the issue list (no stack
     traces, no secrets in the body).

## 3. Constraints (CDD)

- **Design constraints**:
  - Error contract (all touched routes): client/param error → 400; missing
    caller credential (`x-api-key` header) → 401 (unchanged); server misconfig
    (missing env key) → 503; upstream failure/timeout → 502. Bodies keep the
    existing `{ error: string, ... }` JSON shape; additive fields
    (`truncated`, `failedCodes`) allowed. Preserve `text/plain` 200 success of
    `/api/cad/convert` (:183-186).
  - (a) Sanitize with `path.basename(file.name)` + an allowlist regex
    (e.g. `/^[\w.-]+\.dwg$/i` on the basename, else 400); add
    `{ timeout: 60_000 }` to both `execFileAsync` calls (cad route :60, :74).
  - (c) Factory signature: `createDataGoKrProxy(endpoint: EndpointKey)` in a
    shared module (e.g. `src/lib/api/data-go-kr-proxy.ts` or co-located
    `src/app/api/bldrgst/_factory.ts`) returning the `GET` handler; single
    zod schema for the shared param set; clamp `numOfRows` to [1, 100].
  - (d) Cap batch codes at 10; `Promise.all` over codes; overall budget must
    stay under the single upstream timeout (15 s) — do NOT add retries.
  - (f) zod v4 (`package.json:55` — `^4.3.6`); schemas live next to the factory
    / route; do not introduce a new validation library.
  - Keep Korean error strings where they exist today; new error strings in
    English are acceptable (existing routes mix both).
- **May touch**:
  - `src/app/api/cad/convert/route.ts`
  - `src/app/api/vworld/footprint/route.ts`
  - `src/app/api/bldrgst/{areas,basis,floors,jijugu,recap,title}/route.ts`
  - `src/app/api/energy/consumption/route.ts`
  - `src/lib/api-proxy.ts` (clamp only — keep exported signatures)
  - New: shared proxy-factory module + zod schemas
  - New tests under each route's `__tests__/`
  - Client call sites ONLY where a response shape change (status codes,
    `truncated`, `failedCodes`) requires a matching consumer update.
- **Must not**:
  - Do not change `API_ENDPOINTS` paths or upstream service URLs
    (`src/lib/constants.ts:7-14`) except removing the tab in (e).
  - Do not alter the success payload keys (`items`, `totalCount`, `pageNo`,
    `numOfRows`) — additive only.
  - Do not refactor unrelated routes (`api/v1/*`, `api/energy/grade`,
    `api/campus`, etc.) beyond what a shape change forces.
  - No logging of `serviceKey` / `x-api-key` values in errors or console.
- **Fitness functions**:
  - `grep -n "file.name" src/app/api/cad/convert/route.ts` → 0 matches outside
    the sanitized variable.
  - Every `catch` in `vworld/footprint/route.ts` passes a non-200 status to
    `NextResponse.json` (grep for `status:` in catch blocks).
  - `wc -l src/app/api/bldrgst/{areas,basis,floors,jijugu,recap}/route.ts` →
    each ≤ 10 lines.
  - `grep -c "fetchFromDataGoKr" src/app/api/bldrgst/title/route.ts` loop
    replaced by `Promise.all` (grep for `Promise.all` → ≥1).
  - `grep -P "\t" src/app/api/energy/consumption/route.ts` → 0 matches.
  - `grep -rn "from \"zod\"" src/app/api src/lib/api* ` → ≥ 1 per hardened route
    family.

## 4. Evaluation (EDD)

- **Tests to write first (TDD)** — follow the existing pattern in
  `src/app/api/cad/convert/__tests__/route.test.ts`:
  - `src/app/api/cad/convert/__tests__/route.test.ts` (extend): traversal
    filename rejected 400; basename allowlist; converter timeout path → 502
    (mock `execFileAsync`); extension/size/magic validations keep passing.
  - `src/app/api/vworld/footprint/__tests__/route.test.ts` (new): missing env
    key → 503; upstream throw → 502; NaN bbox param → 400; campus payload
    includes `truncated`; success contract `{ polygon|footprints, error: null }`
    unchanged.
  - `src/app/api/bldrgst/__tests__/proxy-factory.test.ts` (new): factory
    produces handlers for all five endpoints; 401 without `x-api-key`; 502 on
    upstream error; `numOfRows` clamp; zod 400 on malformed param.
  - `src/app/api/bldrgst/title/__tests__/route.test.ts` (new): >10 codes →
    exactly 10 upstream calls + truncation indicator; parallel dispatch (assert
    via mocked fetcher call timing or shared start); per-code failure tolerated
    with `failedCodes` populated; 20-item cap preserved (:55-59).
  - `src/app/api/energy/consumption/__tests__/route.test.ts` (new): BASE_URL has
    no leading whitespace (import-level assertion); 401/502 contract.
- **Gates**:
  - `pnpm test -- src/app/api`
  - `pnpm test` (full suite green)
  - `pnpm lint`
  - `pnpm build`
- **Security / honesty checklist**:
  - No filesystem write outside `tmpdir()` work dir in cad/convert (test
    proves it).
  - Error bodies contain no env-var values, API keys, or stack traces.
  - Batch mode cannot be used to amplify load beyond 10 upstream calls.
  - `truncated`/`failedCodes` reflect reality — never hard-coded `false`/`[]`.
- **Acceptance criteria**:
  - [x] (a) basename+allowlist on upload filename; 60 s execFile timeout.
  - [x] (b) vworld: 400/502/503 per contract; NaN validation; `truncated` flag;
        no silent null-on-failure.
  - [x] (c) five routes collapsed onto `createDataGoKrProxy`; numOfRows clamp.
  - [x] (d) batch cap 10 codes, `Promise.all`, truncation + failure reporting.
  - [x] (e) tab removed; doc comment corrected.
  - [x] (f) zod schemas validate query params on all touched routes.
  - [x] New tests pass; full suite, lint, build green.
- **Done when**: all six sub-items land with non-200 error contracts, bounded
  fan-out, and one proxy factory — verified by the new route tests and the
  fitness greps above.

### Evaluation notes (2026-07-21, claude-opus-4-8-ultrawork)

- **(a)** `SAFE_DWG_NAME_PATTERN` + `basename` equality check reject traversal/separators
  with 400 *before* any fs work (early, testable without a converter); both `execFileAsync`
  calls carry `{ timeout: 60_000 }`; sanitized `safeName` used for input/output paths.
- **(b)** Missing env key → **503** (was 500); NaN/blank bbox → **400** (zod `finiteCoord`,
  tightened to reject `""` which coerces to 0); upstream failure → **502** (helpers now
  `throw` on `!res.ok` instead of masking as `null`/`[]`); campus payload gains
  `truncated = footprints.length >= 20`. Single-mode "no parcel found" still a legitimate
  200 `{ polygon: null, error: null }`. Clients already handled `!res.ok` → safe.
- **(c)** New `src/app/api/bldrgst/_factory.ts` (`createDataGoKrProxy`, zod param schema,
  `numOfRows` clamp to [1,100]); all 5 routes now **4 lines** each.
- **(d)** Title batch capped at `MAX_BATCH_CODES = 10`, `Promise.all` fan-out (worst case one
  15 s timeout, not N×), `truncated` + `failedCodes[]` reported, 20-item cap preserved.
- **(e)** Leading TAB stripped from `BASE_URL`; doc comment corrected to `BldEngyHubService`;
  route also gained zod param validation + numOfRows clamp.
- **(f)** zod query validation on the bldrgst factory, vworld bbox, and consumption routes;
  cad/convert validates via the multipart-filename allowlist (no query params).
- Test-infra note: route unit tests must construct a real `NextRequest` (plain `Request`
  cast leaves `.nextUrl` undefined); `vi.mock` factory var moved into `vi.hoisted`.
- Gates: `vitest run src/app/api` 75/75 · fitness greps all clean (5×4-line routes,
  Promise.all, 0 tabs, zod ×3 families, no leaked `file.name` path joins) · `pnpm test`
  **1079 passed / 1 skipped** · `pnpm lint` 0 errors · `pnpm build` green.
- **P0-01 sequencing honored** — twin-data security landed first; this sweep reuses the same
  fail-closed / non-200 contract philosophy.
