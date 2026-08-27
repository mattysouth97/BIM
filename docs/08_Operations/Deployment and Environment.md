---
type: operations
status: implemented
last_verified: 2026-08-27
---

# Deployment and Environment

How BIMFIT ships, and what every environment variable does — including what happens when it is
absent. **No secret values appear on this page, and none should ever be added.**

Related: [[Development Workflow]] · [[Build and Run]] · [[Integration Rules]] · [[Testing and QA]]

## Production

| | |
|---|---|
| Host | **Vercel** |
| Project | `bim` |
| Org / team | `matts-projects-d0677dc4` |
| Production URL | <https://bim-self.vercel.app> |
| Deploy | manual CLI — `vercel --prod --yes` |
| Config | none — there is **no `vercel.json`**; all build behaviour comes from [next.config.ts](../../next.config.ts) |

Project identity is stored in `.vercel/project.json` (orgId / projectId / projectName).

> Any document claiming production is OpenAI Sites at `greenretrofit-bim-nam.gnakkk.chatgpt.site`,
> or calling Vercel "legacy", is stale. `.planning/DEPLOY.md` and `model_refine_handoff.md` both say
> that and both are wrong as of 2026-08-27.

## Deploy procedure

```bash
# 1. Local gate (CI does not run on master — see [[Development Workflow]])
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run --coverage
node node_modules/@playwright/test/cli.js test

# 2. THE TRAP — the HEAD commit author must be an address on the Vercel account
git log -1 --format='%ae'          # must print namseunghun97@gmail.com
git config user.email namseunghun97@gmail.com   # if it does not

# 3. Ship
vercel --prod --yes
```

### Trap 1 — deploy state BLOCKED

A deploy whose HEAD commit author email is not on the Vercel account returns state **BLOCKED**. This
is *not* a build failure: there is no build log to read and nothing in the code is wrong. The author
email must be `namseunghun97@gmail.com`. Check it **before** deploying, not after.

### Trap 2 — the CLI aborts the upload

[.vercelignore](../../.vercelignore) must exclude the QA and test artefact trees or the upload grows
past the point where the CLI aborts. `qa-evidence/` alone is 81 MB; with the exclusions in place the
upload is ~672 KB (from ~45 MB). The file's own comment records this. Currently excluded:
`node_modules`, `.next`, `.open-next`, `dist`, `coverage`, `.sites-worker-bundle`, `.omc`,
`.playwright-mcp`, `.git`, `ml`, `scripts/blender/__pycache__`, **`qa-evidence`**, **`test-results`**,
**`playwright-report`**, `.agents`, root `/*.png` and `/*.url`, `tsconfig.tsbuildinfo`.

If a tool starts writing to a new artifact directory, add it here in the same change.

### Trap 3 — WASM that works locally and 404s on Vercel

`/api/cad/convert` loads a ~10 MB LibreDWG `.wasm` by path, which Node File Tracing cannot follow.
Two `next.config.ts` settings exist solely for this: `serverExternalPackages` and
`outputFileTracingIncludes`. Removing either breaks DWG conversion **only in production**.

## Environment variables

Names and purpose only. Values live in the Vercel project settings and in a local `.env.local` that
is never committed.

| Name | Purpose | Absent behaviour |
|---|---|---|
| `DATA_GO_KR_API_KEY` | Shared server key for 건축물대장 / 건물에너지 / 에너지효율등급 / KMA weather | Routes return **401** unless the caller sends their own `x-api-key`. Set in production; register search works there. |
| `VWORLD_API_KEY` | GIS building outlines (`LT_C_SPBD`) and parcel fallback | `/api/vworld/footprint` cannot serve an outline; the twin falls back to a footprint derived from 건축면적 under a named assumption. Set in production. |
| `VWORLD_DOMAIN` | Domain registered with VWorld for that key | Defaults to `"localhost"` in code; a production domain mismatch means VWorld rejects the request. Set in production. |
| `ANTHROPIC_API_KEY` | Natural-language generative routes (`/api/generative/*`) | Provider degrades to the deterministic `HeuristicReasoningProvider` — a working building, not a dead button. The mounted schematic path makes no reasoning call at all and is unaffected. |
| `CLAUDE_MODEL` | Model override for the Claude provider | Falls back to the default surfaced by `providerStatus()`. |
| `BIM_REASONING_PROVIDER` | Force `claude` or `heuristic` | Auto-selects: Claude when a key is present, heuristic otherwise. |
| `TWIN_DATA_API_KEY` | Guards `POST /api/twin-data/upload` (`x-twin-data-key`, constant-time compare) | **Fails closed** — the route 401s. The GET sibling is deliberately unauthenticated. |
| `CORPUS_API_KEY` | Guards `POST /api/v1/eco2-imports` (dev-only corpus ingestion) | Fails closed. The route is 503 in production regardless, gated on `NODE_ENV` + `VERCEL`. |
| `DWG_CONVERTER_PATH` | Optional operator-installed DWG→DXF binary (server tier 1) | Skipped; the route falls through to LibreDWG WASM in-process, which is the tier that works on Vercel. |
| `DWG_CONVERTER_MODE` | Invocation style for that binary | Defaults to `"oda"`. |
| `NODE_ENV`, `VERCEL` | Environment detection; together they lock `/api/v1/eco2-imports` to local development | — |

Test/CI-only, never set in production: `CI` (Playwright retries/workers/forbidOnly),
`E2E_BASE_URL` / `E2E_PORT` (target selection — setting **both throws**), `RUN_LIVE_API` (unskips the
live Claude provider test), `BIMFIT_E2E_DWG_FIXTURE` (substitute DWG fixture).

On this machine `.env.local` defines only `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` and
`BIM_REASONING_PROVIDER`. That is why local 건축물대장 search returns 401 while production works —
a local 401 is **not** a production defect.

## Runtime characteristics on Vercel

- **Rate limiting is per-instance and in-memory.** The shared-key limiter in
  [api-shared-key.ts](../../src/lib/api-shared-key.ts) (30 requests / 60 s per IP, same-origin only)
  and the 60 req/min token bucket on `/api/v1/predictions` are best-effort deterrents, not hard
  global caps. A durable limit needs a shared store (KV/Redis).
- **The filesystem is ephemeral.** `/api/twin-data/*` and `/api/v1/eco2-imports` write to disk; those
  writes do not survive. Both are operator surfaces with no in-app caller.
- **`/releases` is server-only and reads `public/releases/` at request time**
  (`export const dynamic = "force-dynamic"`), so a new release appears without a rebuild. Its purity
  is enforced by the `explorer-purity` guard in `pnpm ci:check`.
- **Streaming routes:** `/api/generative/generate` and `/generate-from-blueprint` are SSE with
  `maxDuration` 120 / 300 and `force-dynamic`.
- **Upstream calls are slow and flaky.** data.go.kr endpoints 502 intermittently and are retried
  twice with a short bounded backoff — worst case three 15 s timeouts. See [[Integration Rules]].

## Alternate targets present in the repo (unexercised)

- **Cloudflare Workers via OpenNext** — [open-next.config.ts](../../open-next.config.ts) (a bare
  `defineCloudflareConfig()`) and [wrangler.jsonc](../../wrangler.jsonc) (worker `greenretrofit-bim`,
  a pre-rename identity; `nodejs_compat` + `global_fetch_strictly_public`; `ASSETS` over
  `.open-next/assets`).
- **An OpenAI "Sites" bundle** — `pnpm build:sites` runs the OpenNext CLI, then
  `wrangler deploy --dry-run`, stages `dist/server` + `dist/assets`, and copies
  `.openai/hosting.json` (project id only).

Neither appears in CI or in any release procedure, and there is no evidence in the repo that either
has been deployed. Historical rationale not established. Do not treat them as live failover paths.

## Secrets hygiene

- Never print or commit a value. Route errors must not echo `process.env` (fitness function AFF-2).
- The user's own data.go.kr key is stored in browser `localStorage` via Zustand persist
  (`korea-building-info-storage`) — that is the caller's own credential, and it is never sent
  anywhere but our own proxy.
- `.planning/codebase/CONCERNS.md` still prints a literal VWorld key in plaintext in a tracked file.
  The code no longer contains it (the route reads `process.env`), but that value should be redacted,
  and rotated if it was ever real.
