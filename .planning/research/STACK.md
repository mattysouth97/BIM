# Stack Research

**Domain:** Batch corpus generation, versioned dataset publishing, and calibration statistics — added to an existing Next.js/Vercel BIM energy app (BIMFIT v6.0 Building Energy Repository)
**Researched:** 2026-09-15
**Confidence:** HIGH (npm versions verified directly against the npm registry on 2026-09-15; platform limits verified against Vercel's own 2026 docs and a 2026 field-notes writeup; domain metrics verified against ASHRAE Guideline 14 secondary literature)

## Scope note

This document covers ONLY the five new capability gaps named in the research question:
batch/offline corpus generation, corpus storage, versioned/citable publishing, object
storage for released artifacts, and calibration statistics. The existing stack (Next.js
16.2, React 19.2, TypeScript, Three.js 0.182 + R3F 9, Zustand 5, TanStack Query 5,
Tailwind 4, shadcn/ui, Vitest 4, Playwright, Vercel with the `icn1` region pin) is not
re-researched and not reopened.

Three facts already in this codebase drive most of the recommendations below and are
worth stating up front:

1. **The batch-script pattern already exists.** `scripts/build-reference-building.mjs`
   already runs offline (manually or in CI), imports pure functions from `src/lib/`,
   and writes generated JSON under `public/reference-buildings/<id>/`. The corpus
   generator is the same pattern at a different scale, not a new pattern.
2. **The versioned-dataset pattern already exists.** `ENERGY_DATASET_SCHEMA_VERSION`
   in `src/lib/reference-buildings/energy-dataset.ts` (currently `"1.3.0"`) and the
   read-only routes under `src/app/api/reference-buildings/` are a working
   schema-versioned, hash-carrying, source-cited publishing convention for seven
   buildings. The corpus needs the same convention at population scale — which is
   precisely where it breaks: checking generated output into `public/` as static
   files, which is fine for seven hand-picked buildings, does not scale to a
   corpus that grows every sweep and must not bloat the git history or the
   Vercel deployment bundle. That is the one genuinely new architectural need
   this milestone introduces (see Object Storage below).
3. **`zod@^4.3.6` and `papaparse@^5.5.3` are already dependencies.** Both are reused
   below rather than replaced. `papaparse` already writes the CSV half of the
   existing per-building dataset export (`src/lib/export.ts`); the corpus CSV
   release is the same call at more rows. `zod` is already used for validation
   elsewhere in the app (its `zodResolver` react-hook-form integration is the
   part flagged as broken in CLAUDE.md, not `zod` itself) and is the natural
   choice for validating a corpus row against its own schema before publish.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| GitHub Actions scheduled workflow (`.github/workflows/*.yml`) | n/a (already in repo: `.github/workflows/ci.yml`) | Runs the corpus sweep: pages `bjdongCd` codes through the register API, calls `buildLedgerBaselineModel`, writes corpus rows, advances a resumable checkpoint | The sweep's binding constraint is an **unknown daily data.go.kr quota** (PROJECT.md lists this as the open risk), not compute. A GitHub Actions job runs up to 6 hours per job (360 min) on a standard runner — Vercel Functions cap at 300s by default and at most 900s on Enterprise even with `waitUntil`/Queues/Workflow, because none of Vercel's async primitives extend the underlying function invocation ceiling. A quota-paced sweep of thousands of buildings, resumed across many scheduled ticks, needs the longer, cheaper, already-used-in-this-repo runner, not a new paid Vercel product. |
| `@vercel/blob` | `2.8.0` | Object storage for generated corpus releases (JSON/CSV) and their checksums, read back by the publish API | Zero new vendor account: it is provisioned the moment the Vercel project enables it, uses the same env-var injection as everything else already deployed to this project, and needs no IAM/bucket/CORS setup. At the corpus's actual size (a Korean-building baseline row is tens of numeric/text fields; even 50,000 rows of JSON+CSV is realistically tens of MB, not the video/asset-scale traffic where egress fees dominate), the $0.05/GB Blob data-transfer charge is immaterial. This is a deliberate "cheapest to wire up first" choice, not a permanent one — see Alternatives. |
| `simple-statistics` | `7.12.0` | CV(RMSE), NMBE, and related calibration error-band arithmetic against the measured reference-building anchors | Zero dependencies, works identically in the Node batch script and in any server route, and already ships `rootMeanSquare`, `standardDeviation`/`sampleStandardDeviation`, `linearRegression`, and `tTestTwoSample`/t-distribution helpers — everything CV(RMSE) and NMBE are built from (see Sources below for the exact formulas; ASHRAE Guideline 14 does not require a special library, only a correct implementation, which is why this is a small helper module over `simple-statistics`, not a new statistics framework). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` (already `^4.3.6`) | `4.3.6` | Parse/validate every generated corpus row and the release manifest before it is written to Blob storage | Use at the single choke point where a corpus-generation script assembles a row from `buildLedgerBaselineModel` output — reject and log rather than publish a malformed row. Do not use `zodResolver`/react-hook-form here; that combination is the one already flagged as broken, and this is not a form. |
| `papaparse` (already `^5.5.3`) | `5.5.3` | Serialize the corpus to CSV for the versioned release, mirroring the per-building CSV export | Reuse `Papa.unparse()` exactly as `src/lib/export.ts` already does; do not add a second CSV library for the corpus. |
| Node `crypto` (built-in) | n/a | SHA-256 content hashes per released file and per release manifest, continuing the existing per-building dataset hash convention | No package needed — `createHash("sha256")` is already the right tool and is very likely already used by `scripts/build-reference-building.mjs`; extend the same helper rather than adding `hash-wasm` or similar. |
| Hand-written Table Schema descriptor (JSON, no package) | Frictionless Data **Table Schema v1** spec | Machine-readable column contract (name, type, unit, constraints) shipped alongside each released CSV | The spec is a public, versioned JSON Schema-like format; you can conform to it by writing the JSON object yourself. Do **not** install `tableschema` or `datapackage` — see What NOT to Use. |
| Hand-written `schema.org/Dataset` JSON-LD (no package) | schema.org **Dataset** vocabulary, current | Embed in the corpus catalogue page (`<script type="application/ld+json">`) so the release is indexed by Google Dataset Search and any generic DCAT/schema.org harvester | This is a single object literal in a Next.js page, not a library. Include `distribution` entries pointing at the Blob-hosted JSON/CSV/manifest, `version`, `identifier` (the release's content hash or DOI once minted), and `license`. |
| `CITATION.cff` (repo root file, no package) | Citation File Format 1.2.0 | Machine-readable citation metadata for the repository/corpus, required by GitHub's own citation UI and by Zenodo's GitHub integration | Add once, update per release. Costs one YAML file. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| GitHub → Zenodo integration (Settings → Webhooks, or the Zenodo GitHub app) | Mints a DOI automatically on every tagged GitHub Release, giving each corpus release a citable, versioned DOI plus a version-agnostic "concept DOI" | Zero code. Requires `CITATION.cff` (or `.zenodo.json`) at repo root and a tagged Release per corpus publish. Cite the release-specific DOI in the dataset itself; cite the concept DOI when referring to "the corpus" generally. |
| `git commit` of a small JSON checkpoint file (e.g. `data/corpus/checkpoint.json`) | Lets the resumable sweep survive across ephemeral GitHub Actions runners | Not a tool so much as a convention: the workflow's last step commits the advanced checkpoint (last processed 법정동 code / page / date) back to the branch using the workflow's own `GITHUB_TOKEN`, the same mechanism already available to `ci.yml`. |

## Installation

```bash
# Core additions
npm install @vercel/blob@2.8.0 simple-statistics@7.12.0

# Already present — reused, not reinstalled
# zod@^4.3.6, papaparse@^5.5.3

# No dev dependencies needed: GitHub Actions workflow YAML plus the existing
# scripts/ + tsx/node execution pattern is sufficient; no new build tooling.
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| GitHub Actions scheduled workflow | Vercel Cron + Vercel Queues/Workflow | If the sweep is later redesigned as "fan out one short message per building" rather than "long paced loop against an unknown daily quota" — Vercel's own 2026 guidance is to keep cron invocations short and push heavy lifting into Queues. That redesign is real engineering; it is not justified before the quota itself is even known (PROJECT.md's own open risk). Revisit if GitHub Actions' 6-hour ceiling or its scheduling jitter (GitHub does not guarantee cron start time) becomes the binding constraint instead of the data.go.kr quota. |
| GitHub Actions scheduled workflow | A separate always-on worker (Fly.io, Railway, a small VM) | Only justified once the sweep needs to run more often than GitHub Actions' minimum practical cadence, needs to hold long-lived state in memory between runs, or needs guaranteed low-latency start times. None of that applies to a periodic, quota-limited register sweep. Adding a second deployment target for this milestone would be new infrastructure for a problem GitHub Actions already solves. |
| Partitioned JSON/CSV | Parquet (`hyparquet@1.30.1` + `hyparquet-writer@0.16.9`, or `parquet-wasm@0.7.2`) | Revisit only if the corpus grows past roughly 100k rows or the column count grows enough that a flat CSV becomes unwieldy to query (Parquet's columnar layout pays off at that scale, not before). The project already tried a Parquet-based plan (the superseded v7.0 Prediction milestone) and it did not ship; re-adopting it now, before the corpus itself exists, repeats that ordering mistake. JSON/CSV is also what the existing `/api/reference-buildings` consumers already expect. |
| Partitioned JSON/CSV | DuckDB (native `duckdb` for the Node batch script, or `@duckdb/duckdb-wasm@1.33.1-dev57.0` for in-browser query) | Revisit if the read-only API needs to answer ad-hoc filter/aggregate queries over the full corpus rather than serve pre-computed catalogue + per-region/per-era summary files. At corpus sizes in the thousands to tens of thousands of rows, plain array `filter`/`reduce` in the Node script (to precompute summaries at publish time) is simpler, has no WASM bundle-size cost in the browser, and matches the "no new library" resolution the existing v5.0 STACK.md research reached for comparably-sized aggregation problems in this same codebase. |
| Vercel Blob | Cloudflare R2 (`@aws-sdk/client-s3` against R2's S3-compatible endpoint) | Revisit once the corpus is actually being downloaded at volume by external researchers — R2's $0 egress vs. Blob's $0.05/GB only matters once GB-scale monthly downloads are real, and switching later is a low-cost change (both are flat-file blob stores behind a URL; the read-only API route is the only code that touches the SDK). Standing up a second Cloudflare account and wiring R2 credentials into Vercel now, before that download volume exists, is speculative infrastructure. |
| Vercel Blob | Raw AWS S3 | Only if the project already has an AWS account/IAM story for another reason. It introduces a second cloud vendor, non-zero egress cost ($0.09/GB, worse than either Blob or R2), and no advantage over Blob or R2 for this workload. |
| Hand-written Table Schema JSON | `tableschema`/`datapackage` npm packages | Never for new work — see What NOT to Use. |
| `simple-statistics` | `jstat@1.9.6` | If a future phase needs distribution functions `simple-statistics` doesn't cover (e.g. non-normal distribution fitting). For CV(RMSE)/NMBE and t-based confidence/prediction intervals from a small anchor set, `simple-statistics`'s `linearRegression`, `standardDeviation`, and t-test helpers are sufficient and it has no dependency footprint; `jstat` is not needed to clear ASHRAE Guideline 14's metrics. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `tableschema` / `datapackage` (Frictionless Data JS libraries) | `tableschema` last published 2022-03-21, `datapackage` last published 2021-02-09 (verified against the npm registry) — both dead for 4-5 years. The upstream Frictionless Data project moved its actively maintained implementation to Python-only `frictionless`; there is no current JS runtime for either spec. | Hand-write a JSON object that conforms to the public Table Schema / Data Package spec. It's a data structure, not a runtime — you lose nothing by not depending on an abandoned package to produce it. |
| Vercel Cron for the sweep itself | Every plan's function duration ceiling (300s default, up to 900s at best) is far too short for a paced, quota-respecting sweep of a national building register. Using it anyway means either running the sweep across an impractical number of scheduled invocations with no shared in-memory state, or immediately reaching for Vercel Queues/Workflow — real new paid infrastructure this milestone doesn't yet need. | GitHub Actions scheduled workflow, per Core Technologies above. |
| Parquet (any of `hyparquet`, `parquet-wasm`, or a Node Parquet writer) for v1 | The project's own history: a prior milestone (v7.0 Prediction, superseded 2026-09-15) planned around Parquet releases and did not ship. Building the corpus's storage format around a columnar binary format before the corpus itself has a proven row/column shape and scale repeats that speculative-infrastructure pattern. It also breaks the "already publishes JSON/CSV" precedent for zero benefit at current scale. | Partitioned JSON + CSV, versioned per release, in the same shape as the existing per-building dataset export. |
| DuckDB / DuckDB-WASM for v1 | Adds a WASM bundle (browser) or a native binary dependency (Node/CI) to solve a query-performance problem the corpus does not have yet at thousands-to-tens-of-thousands of rows. | Precompute catalogue + summary JSON at publish time in the Node script; plain TypeScript aggregation. |
| SQLite / libsql / Turso for the corpus itself | Turso/libSQL is a genuinely good fit for a *mutable, queried-at-request-time* database, but the corpus is an **immutable, versioned, publish-once-per-release** artifact — exactly the case flat, content-hashed files serve better than a database, because "immutable versioned release" and "row in a mutable table" are different guarantees. Introducing a database here would also mean a new operational dependency (schema migrations, a Turso/Vercel Marketplace account) for a workload that is fundamentally batch-write-once, read-many. | Object storage (Vercel Blob) holding versioned, hashed JSON/CSV files; a small JSON catalogue/index file for the read-only API to list releases and rows. |
| Full DCAT (DCAT-AP RDF/Turtle generation) | Ceremony for this milestone: DCAT is aimed at government open-data *catalog* interoperability (the kind data.go.kr itself uses), and nothing in PROJECT.md asks this corpus to register with a DCAT harvester or open-data portal. | `schema.org/Dataset` JSON-LD, which is simpler, is what Google Dataset Search actually reads, and can be upgraded toward DCAT later without rework since DCAT and schema.org/Dataset overlap heavily in the fields that matter (title, distribution, license, version). |
| Croissant (ML dataset metadata) for v1 | Croissant's extra layers (ML-specific split/semantic annotations) target training-pipeline consumers. This corpus's stated consumers are the calibration/anchor pipeline and a human-facing read-only API, not an ML training loop. Adding Croissant now is metadata for an audience that doesn't exist yet. | `schema.org/Dataset` (which Croissant itself is built on top of) now; add Croissant-specific fields later only if/when an ML consumer is a real requirement. |
| A new API framework (tRPC, GraphQL, a generated OpenAPI server) for the read-only API | The existing `/api/reference-buildings` and `/api/reference-buildings/[id]/dataset` routes already establish the read-only publishing pattern as plain Next.js Route Handlers returning JSON. The corpus catalogue/dataset/release endpoints are more of the same shape at a larger row count, not a new API paradigm. | Next.js Route Handlers under `src/app/api/`, `zod`-validated response shapes, following the existing `energy-dataset.ts` convention. |

## Stack Patterns by Variant

**If the daily data.go.kr quota turns out to be small (low hundreds/day):**
- The GitHub Actions workflow should run more frequently (e.g. every few hours) with a small per-run page budget, rather than once daily with a large budget, so the checkpoint advances steadily without ever exceeding the quota in one run.
- Because a full national sweep would then take a genuinely long time, prioritize the 법정동 codes for regions or building-use types the anchor set (measured reference buildings) actually covers, so calibration error bands become meaningful before the corpus is large.

**If the daily quota turns out to be generous (tens of thousands/day or an approved bulk-access grant):**
- A single scheduled run per day is enough; the checkpoint file becomes a safety net for run-to-run failures rather than the primary pacing mechanism.
- Reconsider the Parquet/DuckDB thresholds above sooner, since a generous quota is also what would make the corpus grow past the "plain JSON/CSV is enough" size band.

**If the read-only API later needs ad-hoc filtering/aggregation across the whole corpus (not just pre-published summaries):**
- Reach for `@duckdb/duckdb-wasm` (server-side Node usage, querying the released Parquet/CSV directly) before reaching for a hosted database — it queries the already-published flat files in place, so it does not require a second, separately-maintained copy of the corpus in a database.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@vercel/blob@2.8.0` | Next.js 16.2 App Router Route Handlers | Standard `import { put, list } from "@vercel/blob"` server-side usage; no client bundle impact since all corpus writes happen from the GitHub Actions batch script or a server route, never a browser component. |
| `simple-statistics@7.12.0` | Node 20+ (already required by Next.js 16.2) and any browser target | Zero dependencies, pure ES module; safe to import from both the batch script and, if ever needed, a client-side confidence-interval display. |
| `zod@4.3.6` | Already pinned in `package.json`; no version change needed | Continue avoiding `zodResolver` with react-hook-form per the existing CLAUDE.md caveat — that caveat is about the resolver adapter, not about using `zod` for corpus-row validation. |
| `papaparse@5.5.3` | Already pinned in `package.json`; no version change needed | Same `Papa.unparse()` call already used in `src/lib/export.ts`. |
| GitHub Actions runner (`ubuntu-latest`) | Node version used by the rest of the repo's CI (`.github/workflows/ci.yml`) | Pin the corpus workflow's `actions/setup-node` version to match `ci.yml` so the batch script imports the same `src/lib/` TypeScript the app itself runs, via the same `tsx`/build step already used for `pnpm build`/`vitest`. |

## Sources

- npm registry (`registry.npmjs.org`), queried directly 2026-09-15 — exact latest versions for `simple-statistics` (7.12.0), `@vercel/blob` (2.8.0), `hyparquet` (1.30.1), `hyparquet-writer` (0.16.9), `@duckdb/duckdb-wasm` (1.33.1-dev57.0), `jstat` (1.9.6), `@libsql/client` (0.18.0), `parquet-wasm` (0.7.2), `tableschema` (1.12.6, last published 2022-03-21), `datapackage` (1.1.10, last published 2021-02-09). HIGH confidence — primary registry data.
- `C:/Users/남승헌/ProjectFiles/BIM/package.json` — confirmed `zod@^4.3.6` and `papaparse@^5.5.3` already installed; confirmed `@vercel/blob`, `simple-statistics`, `jstat`, `hyparquet`, `duckdb`/`@duckdb/duckdb-wasm` are not yet installed. HIGH confidence — direct inspection.
- `C:/Users/남승헌/ProjectFiles/BIM/src/lib/reference-buildings/energy-dataset.ts`, `manifest.ts`, `src/app/api/reference-buildings/*`, `scripts/build-reference-building.mjs`, `.github/workflows/ci.yml`, `vercel.json` — confirmed the existing versioned-dataset, batch-script, and CI patterns this research extends rather than replaces. HIGH confidence — direct inspection.
- Vercel docs (`vercel.com/docs/cron-jobs`, `vercel.com/docs/limits`) and a 2026 field-notes summary of Vercel Cron/Queues/Workflow/`waitUntil` — function duration ceilings (300s default, up to 900s Enterprise) and the "keep cron short, fan out via Queues" 2026 guidance. MEDIUM-HIGH confidence — vendor docs plus a secondary but detailed and current summary; the two sources' exact Enterprise ceiling numbers (900s vs. "300s on all plans") disagree slightly, which is why this document treats "well under an hour, in all cases" as the load-bearing fact rather than the exact second count.
- Web search on Cloudflare R2 vs. AWS S3 vs. Vercel Blob pricing (2026) and a direct Vercel post confirming Blob's $0.023/GB-month storage and $0.05/GB transfer pricing, with a 1GB storage / 10GB transfer Hobby-plan free allowance. MEDIUM confidence — third-party pricing aggregators plus one primary Vercel source; treat exact figures as approximate and re-verify against `vercel.com/docs/vercel-blob` before committing a budget.
- Web search on Croissant, DCAT, and Frictionless Data Table Schema relationships (Google Research's Croissant announcement, ACM/NeurIPS Croissant paper, Frictionless Data specs site). HIGH confidence for what each standard is and how they relate; this is standards documentation, not a fast-moving implementation detail.
- Web search on Zenodo's GitHub integration and DOI minting/versioning (`zenodo.org/help/versioning`, Zenodo GitHub-integration FAQ). HIGH confidence — official Zenodo documentation content reproduced in search results.
- Web search on ASHRAE Guideline 14 CV(RMSE)/NMBE thresholds (NMBE ≤10%, CV(RMSE) ≤30% for hourly calibration; ≤5%/≤15% for monthly) via secondary academic/industry sources (OSTI, NREL, ResearchGate summaries). MEDIUM confidence — consistent across multiple independent secondary sources but not read directly from the paywalled ASHRAE Guideline 14 document itself; a phase that implements the calibration module should confirm the exact current-edition thresholds against a licensed copy of the guideline before hard-coding pass/fail cutoffs.
- Web search on data.go.kr rate limits and Vercel Seoul-region (`icn1`) constraints; no evidence found of data.go.kr geo-blocking non-Korean egress (unlike the confirmed VWorld case already documented in this repo's `AGENTS.md`). LOW-MEDIUM confidence — absence of evidence is not confirmation; this is exactly the open risk PROJECT.md already flags ("Establish whether the register can be swept at scale, and on what quota") and should be empirically tested (a small real sweep from a GitHub Actions runner) before the corpus-generation phase is scoped at full size.

---
*Stack research for: Korean building energy repository — corpus generation, calibration, versioned dataset publishing*
*Researched: 2026-09-15*
