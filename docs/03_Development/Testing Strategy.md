---
type: reference
status: implemented
last_verified: 2026-08-27
---

# Testing Strategy

How the two suites are wired, what they actually cover, and the environment traps that make an e2e
run pass or fail for reasons unrelated to the code under test.

Related: [[Build and Run]] · [[Testing and QA]] · [[Development Workflow]] · [[Repository Conventions]]

## Measured today (2026-08-27)

| Suite | Result |
|---|---|
| vitest | **3952 passed, 4 skipped, 362 test files** |
| Playwright (chromium) | **35 / 35 passed** |
| `tsc --noEmit` | exit 0 |

The 4 skipped tests are the whole of
`src/lib/generative/__tests__/claude-provider.live.test.ts`, gated by
`describe.skipIf(!LIVE)` on `RUN_LIVE_API === "1"`. 363 files match the include globs; 362 execute.

Coverage was **not** measured today — `vitest run` does not evaluate thresholds. Run
`--coverage` for that.

## Unit layer — vitest

[vitest.config.ts](../../vitest.config.ts): `happy-dom`, include `src/**/*.test.ts(x)`, exclude
`node_modules`, `.next`, `.planning`.

Two aliases matter:

- `@` → `src`
- `server-only` → [src/test/server-only-stub.ts](../../src/test/server-only-stub.ts). `server-only`
  throws by design outside RSC, which would make the Claude provider and the generative API routes
  untestable in Node. The real guard still protects the Next.js build.

Coverage floors are scoped to one path only: `src/lib/**` at **52 lines / 57 functions** — the
measured 2026-07-21 baseline, below the 70% target. Ratcheting them is work item P1-09
(`not-started`). The config comment is explicit: never lower them to make a change pass.

Density by subsystem (test files): generative 66, store 22, layers 19, energy 19,
energy-diagnostics 18 (+10 for its components), cad/doc 15, plan-symbols 14, retrofit 11,
procedural 11, bim 10, hooks 10, workflow 5, report 5. Nearly every API route has a route test.

## E2E layer — Playwright

[playwright.config.ts](../../playwright.config.ts): `testDir ./e2e`, `fullyParallel`, a single
`chromium` project, `reporter: "html"`, `trace: "on-first-retry"`. Under `CI` it switches to
`forbidOnly`, `retries: 2`, `workers: 1` — so a stray `.only` fails the run in CI and silently
narrows it locally.

Two mutually exclusive target modes, and setting **both throws**:

- `E2E_BASE_URL` — an external server (validated http/https, hash and search stripped).
- `E2E_PORT` — a Playwright-managed `npm run dev -- --hostname 127.0.0.1 --port <n>`.
  `reuseExistingServer` is true only when no explicit `E2E_PORT` was given; an explicit port denotes
  a Playwright-owned server that must never adopt an unrelated listener.

### The 127.0.0.1 hydration trap

The managed server binds `127.0.0.1`; developers browse `localhost`. Next dev refuses assets and HMR
for a host form it was not told about, so pages served on the other host **render but never
hydrate** — every interactive assertion fails, with no error that names the cause. The fix lives in
config, not in tests: `allowedDevOrigins: ["localhost", "127.0.0.1"]` in
[next.config.ts](../../next.config.ts). If you ever see a whole suite fail on "element not
interactive" against a reused dev server, check this first.

### Network determinism

[api-client.ts](../../src/lib/api-client.ts) short-circuits before any `fetch` when no API key is
set, so `page.route` would never see the request. E2E specs therefore seed a **dummy** key
(`e2e-dummy-key`) into the persisted store, then mock `/api/bldrgst/{title,recap,floors,areas,basis,jijugu}`
and `/api/vworld/footprint`. No real credential is used anywhere in `e2e/`.

[e2e/helpers/app-state.ts](../../e2e/helpers/app-state.ts) exposes `seedSeenTours(page)`, which
sets the three tour flags via `addInitScript` so product tours cannot intercept controls.

Fixtures: [e2e/fixtures/ledger.ts](../../e2e/fixtures/ledger.ts) (one synthetic 표제부 row, public
data only) and a base64 DWG binary whose [README](../../e2e/fixtures/README.md) pins the upstream
repo, commit, git blob SHA, decoded SHA-256 (re-asserted at load time) and GPL-3.0 provenance.
`BIMFIT_E2E_DWG_FIXTURE` substitutes a different DWG.

### What the 35 tests cover

| Spec | n | Covers |
|---|---|---|
| [building-flow](../../e2e/building-flow.spec.ts) | 10 | landing CTA, `/building/demo` render, energy cards, malformed id → 404 boundary, mocked-ledger run asserting a specific field |
| [energy-diagnostics](../../e2e/energy-diagnostics.spec.ts) | 10 | canonical phase list, legacy-URL redirects, mobile containment, authored geometry → real engine, reviewed DWG/SVG import, Tier-1 acceptance gate, reopen persistence, method-switch reset |
| [first-door](../../e2e/first-door.spec.ts) | 6 | landing opens on the register, sample + drawing paths, language switch, phone viewport has no sideways scroll |
| [ledger-baseline](../../e2e/ledger-baseline.spec.ts) | 6 | register lookup **is** the landing page and exists in exactly one place; sample enters the four-step workflow; baseline runs with zero further input; every registered storey reported; declines an unmodellable building |
| [ledger-refinement](../../e2e/ledger-refinement.spec.ts) | 2 | assumptions are shown and replaceable; a corrected value is recorded as the user's, not as a measurement |
| [plan-view](../../e2e/plan-view.spec.ts) | 1 | source plan ↔ 3D round-trip without losing the viewer or emitting THREE.Clock warnings |

**Gap:** no e2e spec touches step 4. Nothing exercises
[report-stage.tsx](../../src/components/report/report-stage.tsx) or the PDF/CSV/JSON export path.

## Reviewing results

`reporter: "html"` regenerates `playwright-report/` only on a run using the default reporter. The
report currently on disk is dated 2026-08-25 and is **not** the artifact of today's passing run —
do not read it as current. `test-results/` is empty, which is consistent with a clean run (it holds
retained failure traces).

Neither directory is in `.gitignore`, though both are excluded from ESLint and from Vercel upload.

## What CI does and does not run

CI ([.github/workflows/ci.yml](../../.github/workflows/ci.yml)) runs `lint`, `test:coverage`,
`build`, `ci:check`. It does **not** run Playwright and does not run a standalone typecheck. And it
triggers only on `main`, which is not this repo's working branch — see [[Development Workflow]].
E2E is therefore a purely local gate today.

## Conventions for new tests

- Colocate in `__tests__/` beside the module; name `*.test.ts(x)`.
- Per `AI_PROCESS.md` R2.3, an item gets **2–5 BDD scenarios**; more than five means the item is too
  large and should be split.
- Tests are written red before implementation (gate G2), and "fix the test to match the code"
  requires an ADR.
- Every documented trap in [[Repository Conventions]] should keep its regression test: the ACH50 ÷ 20
  conversion, `classifyEraExplicit` on a blank date, a documented zero emitting no fact, and
  ingestion not stamping a synthesised rectangle as `dimensioned_vector_geometry`.
