---
type: reference
status: implemented
last_verified: 2026-08-27
---

# Build and Run

Everything on this page is taken from [package.json](../../package.json),
[vitest.config.ts](../../vitest.config.ts), [playwright.config.ts](../../playwright.config.ts)
and [next.config.ts](../../next.config.ts), or was executed on this machine on 2026-08-27.

Related: [[Development Workflow]] · [[Testing Strategy]] · [[Repository Conventions]] · [[Deployment and Environment]]

## Read this before writing Next.js code

[AGENTS.md](../../AGENTS.md) (imported by [CLAUDE.md](../../CLAUDE.md) as `@AGENTS.md`) is the
repo's strongest process rule and no tool enforces it:

> This is NOT the Next.js you know. APIs, conventions and file structure may all differ from your
> training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code.

The pinned version is `next 16.2.10` with `react 19.2.4`.

## The scripts that exist

There are exactly eleven, and there is **no `typecheck` script**.

| Script | Command | Notes |
|---|---|---|
| `dev` | `next dev` | port 3000 |
| `build` | `next build` | this is also the typecheck gate in CI |
| `start` | `next start` | production server over `.next` |
| `lint` | `eslint` | bare — ESLint 9 flat config lints the cwd |
| `test` | `vitest run` | does **not** evaluate coverage thresholds |
| `test:watch` | `vitest` | |
| `test:coverage` | `vitest run --coverage` | enforces the `src/lib/**` floors (52 lines / 57 functions) |
| `test:e2e` | `playwright test` | |
| `ci:check` | `node scripts/ci-check-plan.mjs` | three release-data guards, see [[Development Workflow]] |
| `export:feature-schema` | `node scripts/export-feature-schema.mjs` | prediction-release schema exporter |
| `build:sites` | `node scripts/build-sites.mjs` | OpenNext/Cloudflare bundle — **not** the production path |

Typecheck is invoked directly: `tsc --noEmit`. It exits 0 as of 2026-08-27.

## Local runner reality on this machine (verified 2026-08-27)

Bare `pnpm` **fails** here, and `pnpm exec` attempts to purge `node_modules`. Today's validation run
therefore invoked the binaries directly. Use these forms; they are equivalent to the scripts above.

```bash
node node_modules/vitest/vitest.mjs run              # = pnpm test
node node_modules/vitest/vitest.mjs run --coverage   # = pnpm test:coverage
node node_modules/typescript/bin/tsc --noEmit        # typecheck (no script exists)
node node_modules/@playwright/test/cli.js test       # = pnpm test:e2e
node node_modules/next/dist/bin/next dev             # = pnpm dev
node node_modules/eslint/bin/eslint.js .             # = pnpm lint
```

`corepack pnpm <script>` is the working pnpm route when a real pnpm invocation is needed
(for example `corepack pnpm install --frozen-lockfile`). Do not copy the
`node "$APPDATA/npm/node_modules/pnpm/bin/pnpm.cjs"` form from
[docs/work-plan/EXECUTION_PROMPTS.md](../work-plan/EXECUTION_PROMPTS.md) — it is stale and
does not work here.

A fresh clone depends on the native postinstall allowlist in
[pnpm-workspace.yaml](../../pnpm-workspace.yaml) (`esbuild`, `sharp`, `unrs-resolver`, `workerd`).

## What runs with no API keys

`/building/demo` and `/diagnostics/new?method=sample` are served from bundled fixtures
([src/lib/demo/](../../src/lib/demo/)); the six `/api/bldrgst/*` calls and the VWorld footprint are
short-circuited before any fetch. The drawing path also works keyless — the schematic route
`/api/generative/generate-from-blueprint` makes no reasoning call, and a missing `ANTHROPIC_API_KEY`
degrades the generative provider to a deterministic heuristic rather than failing
([src/lib/generative/provider/index.ts](../../src/lib/generative/provider/index.ts)).

Real 건축물대장 search needs `DATA_GO_KR_API_KEY` (server) or a user-supplied `x-api-key`. On this
machine `.env.local` defines only `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `BIM_REASONING_PROVIDER`, so
local register search returns 401 while production works. See [[Deployment and Environment]].

## next.config.ts — three settings, each preventing a real failure

- `allowedDevOrigins: ["localhost", "127.0.0.1"]` — dev only. Playwright drives `127.0.0.1`, humans
  browse `localhost`; without this the other host form never hydrates and the whole e2e suite fails
  silently against a reused dev server. See [[Testing Strategy]].
- `serverExternalPackages: ["@mlightcad/libredwg-web"]` — the emscripten glue finds its ~10 MB
  `.wasm` sibling via `import.meta.url`; bundling rewrites that path.
- `outputFileTracingIncludes` for `/api/cad/convert` — the `.wasm` is loaded by path, so tracing has
  nothing to follow and would ship a serverless function that works locally and 500s on Vercel.

## Ports in use

`3000` is the dev/e2e default (`E2E_PORT`, or `E2E_BASE_URL` for an external target — setting both
throws). Ad-hoc capture scripts under [scripts/](../../scripts/) hardcode other ports:
`verify-demo-envelope.mjs` targets `:3001` and `scripts/qa_spatial_focus.py` defaults to `:3141`.
No document states which is canonical; treat 3000 as the convention and pass `--base-url` explicitly.
