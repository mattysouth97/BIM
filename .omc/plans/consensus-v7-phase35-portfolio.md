# v7.0 Prediction — Phase 35: Portfolio Forecasting as Data Product

**Date:** 2026-04-24
**Milestone:** v7.0 Prediction (Phases 35–40 TBD)
**Status:** 2026-07-02: Tasks 1-3 + 8-11 SHIPPED (release bundle docs, ReleaseStore, /api/v1/predictions + eco2-imports, /releases explorer, CI guards via pnpm ci:check). Tasks 4-7 (Python ml pipeline) BLOCKED: no Python runtime on this host + training dataset/model exist only offline; predictions.parquet pending upload of the offline artifact — all runtime surfaces degrade honestly until it lands.
**Mode:** Short RALPLAN-DR

---

## Progress (for autopilot pickup)

- ✅ **Task 1** — Roadmap + plan commit. Commit `624db0e`.
- ✅ **Task 2** — `PortfolioFeatureVector` type + schema + `.gitattributes`. Commit `5769fc5`. 8/8 tests pass, build + lint green. Spec review ✅; quality review ⚠️ APPROVED_WITH_SUGGESTIONS (4 minor nits, non-blocking).
- ✅ **Task 3** — `extractFeatures` + Node CLI wrapper + `FootprintGeometry` type. Commit `4ab85cb`. 17 extractor tests + 4 CLI smoke tests = 21 tests, all passing. Build + lint green. No spec/quality review run before context pivot — should be picked up by autopilot's Phase 4 validation at the end of the run.
- ⏳ **Task 4** — next. Python project bootstrap + feature-schema round-trip.
- ⏳ **Tasks 5–12** — pending per original plan.

**Autopilot instruction:** start Phase 2 execution at Task 4. Tasks 1–3 are frozen; do NOT re-execute or re-verify. Treat commits `624db0e`, `5769fc5`, `4ab85cb` as the starting state.

**Baseline coverage for Task 3 artifact** (for downstream self-improve loop): 91.66% statements coverage on `src/lib/portfolio/feature-extractor.ts`. Recorded at `.omc/self-improve/tracking/baseline.json`.

---

## Requirements Summary

Ship the first release of a **portfolio energy-prediction data product for the Korean building stock**. Deliverable is an immutable, versioned, calibrated Parquet release accompanied by (a) a public feature & output schema, (b) a calibration report against ECO2, and (c) a read-only API for programmatic consumers. The Next.js app contains one thin explorer page that advertises the release; it is not the product.

Phase 35 covers **one region** (chosen by user) as the first release at semver `v0.1.0`. Later phases extend coverage, add attribution (SHAP), observed-data fine-tuning (KEPCO), and live simulation.

### Strategic framing

The moat is three-sided, all data and distribution — never model weights:

1. **Calibration-grade Korean-specific labeled corpus** (ECO2 runs accumulated over time).
2. **National coverage of 건축물대장 + VWorld fusion**.
3. **ECO2-agreement brand guarantee** ("our predictions agree with ECO2 within X% per release, re-verified quarterly").

Every Phase 35 artifact must either grow the corpus, extend coverage, or strengthen the calibration claim.

---

## RALPLAN-DR Summary

### Principles (5)

1. **The product is the dataset, not the app.** Parquet release is the deliverable. UI is marketing/exploration surface.
2. **Every prediction persists with provenance** — feature vector, model version, input snapshot hash, timestamp — append-only.
3. **Public contracts first.** Schema is semver-versioned, changelog-maintained, CI-enforced.
4. **National-coverage-shaped from day one.** Storage partitioning + versioning must scale to all ~7M 건축물대장 entries without refactor.
5. **Audit-credibility is the brand.** Every release ships a machine-readable `calibration.json` + human-readable `calibration.md` with MAPE, Kendall tau, coverage, limitations.

### Decision Drivers (top 3)

1. **Moat position** — build what's hard to replicate (labeled Korean corpus, calibration claim, coverage).
2. **Consumer economics** — artifacts consumers can integrate without inheriting our stack (Parquet + schema + data dictionary), plus read-only REST for live programmatic access.
3. **Delivery economics for Phase 35** — ship without new infra (no blob storage contract, no new database, no new deploy target). File-system-based artifact storage in Next.js acceptable for v0.1.0; migration to object storage is a Phase 36 concern.

### Viable Options

| # | Shape | Pros | Cons |
|---|---|---|---|
| **A. D+B hybrid (CHOSEN)** — immutable Parquet releases primary, read-only API secondary, thin explorer UI | Immutable archive-ready artifacts for audit-grade use; programmatic access for live consumers; clear moat framing | Two distribution mechanisms to maintain; API must stay in lockstep with latest release |
| B. D-only — Parquet releases only | Simplest surface | No programmatic path; consumers must parse files |
| C. B-only — REST API only | Easiest live consumption | No immutable snapshot → audit-unfriendly; regulators can't point to "the 2026-Q2 release" |
| D. A+D — thin-viewer feature + artifacts | Includes discoverability | Redundant with A's thin explorer; invites UI-creep legitimation |

### Why A chosen — invalidation rationale

- **B rejected:** No programmatic path. Kills the API-driven partnership channel.
- **C rejected:** No immutable snapshot breaks audit-credibility. Brand promise "our 2026-Q2 predictions agree with ECO2 within X%" requires pinnable artifact.
- **D rejected:** Not meaningfully different from A (thin explorer ships regardless). "A+D" framing legitimizes the viewer as a co-product and invites scope creep.

---

## Acceptance Criteria

A1. One Parquet release at `public/releases/v0.1.0/predictions.parquet` containing ≥50 rows from a single 법정동, one column per public schema field, with a primary-energy prediction and predicted energy grade per row.

A2. Schema bundle per release: machine-readable `public/releases/v0.1.0/schema.json` (JSON Schema draft-07) matching Parquet columns exactly; human-readable `public/releases/v0.1.0/data-dictionary.md`; `public/releases/CHANGELOG.md` with a v0.1.0 entry. Latest-release pointer at `public/releases/manifest.json` = `{"latest": "v0.1.0", "history": ["v0.1.0"]}`. **No symlinks** (Vercel + Windows compatibility).

A3. Calibration artifacts per release: **both** machine-readable `public/releases/v0.1.0/calibration.json` (fields: `mape`, `cvRmse`, `kendallTau`, `sampleSize`, `heldOutMethod`, `perEra[]`, `knownLimitations[]`) **and** human-readable `public/releases/v0.1.0/calibration.md`. Auto-generated by `ml/portfolio/evaluate.py`; never hand-edited.

A4. `GET /api/v1/predictions/{bjdongCd}` returns latest-release rows for that bjdongCd as JSON plus `{ releaseVersion, schemaVersion, generatedAt }` metadata. 404 on unknown bjdongCd; 503 if no release published. **Rate limit**: max 60 req/min per IP via a simple in-memory token bucket (Phase 35 stopgap; formal rate-limiting is Phase 37 scope).

A5. Thin explorer page at `/releases` (server component at `src/app/releases/page.tsx`): latest release version, total row count, region coverage, download links (Parquet + schema.json + data-dictionary.md + calibration.md + calibration.json), link to API docs. **No client components, no sliders, no interactive prediction.** Enforced by CI guard (A11).

A6. `PortfolioFeatureVector` TypeScript type at `src/lib/portfolio/features.ts` — 15–20 fields derivable ONLY from public data (건축물대장 + footprint geometry + era priors; no user inputs). Strict, flat, all `number`, no optionals. Mirrored as semver-versioned `FEATURE_SCHEMA` constant.

A7. `extractFeatures(building: BuildingRecord, geometry: FootprintGeometry): PortfolioFeatureVector` pure function at `src/lib/portfolio/feature-extractor.ts`. Public input contract: `BuildingRecord` from `src/lib/types.ts`; `FootprintGeometry` is a pre-fetched object (the v4.0 VWorld API call happens in the batch runner, NOT in the extractor). Unit-tested on 9 fixtures (3 eras × 3 use types).

A8. Python pipeline at `ml/portfolio/` (uv + Python 3.11) with its own pytest suite. Produces: sampled feature rows → ECO2 training pairs → XGBoost → ONNX export → Parquet release. Deterministic by seed.

A9. **Append-only corpus** at `ml/portfolio/corpus/predictions.jsonl` (JSON Lines, chosen over Parquet partitioning for trivial append semantics). Each row: `{featureVector, prediction, modelVersion, inputSnapshotSha256, timestamp, source: "generated" | "eco2_labeled"}`. Corpus writer has a pytest verifying append-only-ness (existing rows unchanged after write).

A10. **ECO2-import endpoint — LOCAL DEV ONLY.** `POST /api/v1/eco2-imports` at `src/app/api/v1/eco2-imports/route.ts`:
   - Returns `503 Service Unavailable` on production (`NODE_ENV !== "development"`).
   - In dev, requires `x-corpus-key` header matching `CORPUS_API_KEY` env var; returns 401 otherwise.
   - Request body: `{ buildingPk: string, featureVector: PortfolioFeatureVector, eco2Result: ECO2ImportResult }` — **caller MUST supply building identification and the feature vector**. The existing `parseECO2Result` returns only `{grade, demand, co2}`, which is insufficient alone; the endpoint composes a corpus row from all three parts.
   - Appends one row to `ml/portfolio/corpus/predictions.jsonl` with `source: "eco2_labeled"`.
   - Production corpus-growth path is a Phase 36 deliverable when blob storage lands.

A11. **CI guard** (`scripts/ci-check-plan.mjs`, run in CI):
   - (a) Schema drift: `pnpm export:feature-schema` regenerates the schema from the TS `FEATURE_SCHEMA` to a temp path; CI resolves the latest released version via `public/releases/manifest.json` and diffs the regenerated schema against `public/releases/<latest-version>/schema.json`. Fails on diff. (No `public/releases/latest/` directory — the latest pointer lives only in `manifest.json`.)
   - (b) Explorer page purity: greps `src/app/releases/page.tsx` and fails if `"use client"` appears anywhere in that file or its imports.
   - (c) Release immutability: checks that no files under `public/releases/v*/` have been modified compared to their first introduction (simple git history check — fails if `git log --follow --diff-filter=M` returns entries for an already-released version).

A12. `pnpm test && pnpm lint && pnpm build` all pass. No regressions.

## File Structure

**New directories:**
- `src/lib/portfolio/` — TS runtime.
- `src/app/api/v1/predictions/[bjdongCd]/` — prediction API.
- `src/app/api/v1/eco2-imports/` — corpus-grow endpoint (dev-only).
- `src/app/releases/` — explorer page.
- `scripts/` — NEW directory (confirmed not present today); holds `export-feature-schema.mjs`, `extract-features.mjs`, `ci-check-plan.mjs`.
- `ml/portfolio/` — offline Python pipeline.
- `ml/portfolio/corpus/` — append-only JSONL corpus (directory committed via `.gitkeep`; contents gitignored).
- `ml/portfolio/tests/` — Python pytest suite.
- `public/releases/v0.1.0/` — shipped artifact bundle for v0.1.0.

**New TS files:**
- `src/lib/portfolio/features.ts` — `PortfolioFeatureVector` + `FEATURE_SCHEMA`.
- `src/lib/portfolio/feature-extractor.ts` — pure extractor.
- `src/lib/portfolio/release-store.ts` — **`ReleaseStore` interface** with `getManifest()`, `getRelease(version)`, `listReleases()`. Phase 35 implementation `StaticFileReleaseStore` reads from `public/releases/`. Phase 36 can swap in `ObjectStorageReleaseStore` without touching callers.
- `src/lib/portfolio/types.ts` — `PredictionRow`, `ReleaseManifest`, `CalibrationJson`, `FootprintGeometry`.
- `src/lib/portfolio/__tests__/features.test.ts` — type + schema tests.
- `src/lib/portfolio/__tests__/feature-extractor.test.ts` — 9 fixture cases.
- `src/lib/portfolio/__tests__/release-store.test.ts` — manifest resolution, missing-release fallback, interface contract.
- `src/app/api/v1/predictions/[bjdongCd]/route.ts` — prediction API route (uses `ReleaseStore`).
- `src/app/api/v1/predictions/[bjdongCd]/__tests__/route.test.ts` — API contract tests (4 cases: valid, unknown bjdongCd, no release, rate-limit).
- `src/app/api/v1/eco2-imports/route.ts` — dev-only corpus append endpoint.
- `src/app/api/v1/eco2-imports/__tests__/route.test.ts` — 503 in prod, 401 without key, valid append in dev.
- `src/app/releases/page.tsx` — server component explorer.

**New Python files:**
- `ml/portfolio/pyproject.toml`, `uv.lock`, `.python-version` (3.11).
- `ml/portfolio/README.md`.
- `ml/portfolio/schema.py` — loads feature schema JSON; pydantic-validated.
- `ml/portfolio/eco2.py` — input emitter + result parser.
- `ml/portfolio/build_dataset.py` — sampled features × ECO2 → training CSV.
- `ml/portfolio/train.py` — XGBoost → ONNX + `model_card.json`. **ONNX model committed to repo at `ml/portfolio/models/<version>/model.onnx`** (~1–5 MB; small enough for Git, versioned alongside releases).
- `ml/portfolio/evaluate.py` — MAPE + CV(RMSE) + Kendall tau; writes `calibration.json` and `calibration.md`.
- `ml/portfolio/generate_release.py` — region → extract features (via Node subprocess) → inference → Parquet + release bundle.
- `ml/portfolio/corpus.py` — append-only JSONL writer.
- `ml/portfolio/tests/test_schema.py`, `test_eco2.py`, `test_corpus.py`, `test_generate_release.py` — pytest coverage.

**New scripts:**
- `scripts/export-feature-schema.mjs` — writes `public/releases/latest/schema.json` from TS source.
- `scripts/extract-features.mjs` — Node CLI wrapping `extractFeatures`. **Reads `BuildingRecord + FootprintGeometry` JSON on stdin, emits `PortfolioFeatureVector` JSON on stdout.** JSONL batch mode with `--batch` flag. This replaces the Python port of the extractor — eliminates behavioral drift entirely. Python pipeline calls this subprocess.
- `scripts/ci-check-plan.mjs` — the three CI guards from A11.

**Modified files:**
- `package.json` — add `apache-arrow` (for API Parquet reads); add npm scripts `export:feature-schema`, `ci:check`. **Note:** `onnxruntime-node` is NOT added — Phase 35 ONNX inference runs in the Python pipeline (`onnxruntime` Python package), not in the Next.js runtime.
- `.gitignore` — add `ml/portfolio/.venv/`, `ml/portfolio/__pycache__/`, `ml/portfolio/corpus/*.jsonl`, `ml/portfolio/data/training.csv`, `!ml/portfolio/corpus/.gitkeep`.
- `.gitattributes` — add `*.parquet binary` and `*.onnx binary` to prevent Git diff/merge issues on release artifacts.
- `CLAUDE.md` — "v7.0 Prediction Data Product" section.
- `.planning/ROADMAP.md` — add v7.0 block alongside v6.0 (not replacing).

**Removed from "Modified files" in prior draft:**
- `next.config.ts` — not needed; Next.js serves `public/` as static by default.
- Reference to `src/lib/bldrgst/*` — does NOT exist. Corrected below.

## Implementation Steps (TDD, one commit per task)

**Task ordering note:** the validation gate (Task 7) comes **before** all packaging work (Tasks 8–12). If Task 7's Kendall tau gate (below) fails, Tasks 8–12 are cancelled and Phase 35 ships as "training infrastructure only" with a decision memo (see Gate Protocol in Risks section).

### ~~Task 1~~ ✅ SHIPPED — Roadmap + plan commit
Commit `624db0e`. Skip.

### ~~Task 2~~ ✅ SHIPPED — `PortfolioFeatureVector` type + schema
Commit `5769fc5`. Skip. See `src/lib/portfolio/features.ts` for the 20-field contract.

### ~~Task 3~~ ✅ SHIPPED — `extractFeatures` + Node CLI wrapper
Commit `4ab85cb`. Skip. See `src/lib/portfolio/feature-extractor.ts` and `scripts/extract-features.mjs`. `FootprintGeometry` type lives at `src/lib/portfolio/types.ts`. Task 3 reviews were not run in-session due to context pivot; Phase 4 validation at end of autopilot run will cover them.

### Task 4: Python project bootstrap + feature-schema round-trip
`ml/portfolio/` with uv, deps (`pandas`, `xgboost`, `onnxmltools`, `onnx`, `pydantic`, `pytest`, `numpy`). `scripts/export-feature-schema.mjs` writes `public/releases/latest/schema.json`. `ml/portfolio/schema.py::load_schema()` validates. pytest: `test_schema.py` asserts the loaded schema matches the committed JSON. npm script added.

### Task 5: ECO2 dataset builder (semi-automated)
`ml/portfolio/build_dataset.py --count N --seed S --synthetic-eco2`. Samples feature rows from priors (construction-year CDF, era-adjusted U-values). Emits ECO2 input JSONs; waits for result JSONs; joins; writes CSV. `--synthetic-eco2` uses a deterministic Python target for test-time runs so pytest doesn't invoke the desktop app. `test_eco2.py` validates round-trip.

### Task 6: XGBoost trainer + ONNX export + model card
`ml/portfolio/train.py --dataset training.csv --version v0.1.0`. Trains XGBoost; exports ONNX via `onnxmltools`; commits `ml/portfolio/models/v0.1.0/model.onnx` + `model_card.json` (schema version, training row count, feature importances, git SHA, hyperparameters).

### Task 7: Calibration harness + **explicit STOP gate**
`ml/portfolio/evaluate.py`. 60/20/20 split seeded by model version. Computes MAPE, CV(RMSE), Kendall tau on ranking stability, per-era breakdown. Writes **both** `calibration.json` (machine-readable) and `calibration.md` (human-readable).

**GATE PROTOCOL (binding):**
- **Maximum 3 feature-engineering iterations** (distinct feature subsets or augmentations) per Phase 35.
- **Maximum 100 ECO2 runs total** across all iterations (operational ceiling given R1 human-gated batches).
- After each iteration, compute Kendall tau on held-out test set.
- If any iteration reaches **Kendall tau ≥ 0.6**, proceed to Tasks 8–12.
- If all 3 iterations yield **Kendall tau < 0.6**, **STOP**:
  - Phase 35 deliverable downgrades to **"training infrastructure only"** — Tasks 1–7 ship, Tasks 8–12 are deferred to Phase 39 (after observed-data augmentation).
  - Author a `docs/superpowers/decisions/2026-phase35-gate-decision.md` memo documenting: best tau achieved, hypothesis for why, recommended pivot (e.g., add KEPCO observed data earlier, switch to physics baseline, narrow scope to specific use-types).
  - Gate failure is declared by the repo owner (user), not the model trainer. The Critic agent is the stand-in authority if a user ruling is not immediately available in an autonomous run.

### Task 8: Release generator
`ml/portfolio/generate_release.py --region <bjdongCd> --version v0.1.0`. Pipeline:
  1. Pull buildings via existing `/api/bldrgst/*` routes (NOT `src/lib/bldrgst/*` which doesn't exist).
  2. Call `scripts/extract-features.mjs --batch` via subprocess (Node subprocess IS the default; Python port explicitly rejected to prevent behavioral drift — see R3 below).
  3. ONNX inference via Python `onnxruntime` (the release generator is a Python script; `onnxruntime-node` is not added to the Next.js runtime).
  4. Write `public/releases/v0.1.0/predictions.parquet` + `schema.json` + `data-dictionary.md` + `calibration.json` + `calibration.md`.
  5. Update `public/releases/manifest.json` (**not a symlink**) → `{"latest": "v0.1.0", "history": [...]}`.
  6. Append every predicted row to `ml/portfolio/corpus/predictions.jsonl` with `source: "generated"`.
  7. Append v0.1.0 entry to `public/releases/CHANGELOG.md`.

### Task 9: Prediction API route + ReleaseStore interface
`src/lib/portfolio/release-store.ts` defines the interface with Phase 35 `StaticFileReleaseStore` implementation reading from `public/releases/`. `src/app/api/v1/predictions/[bjdongCd]/route.ts` uses the store via dependency injection. Simple in-memory token-bucket rate limiter (60 req/min per IP; Phase 37 replaces with proper infra). Tests: valid, unknown, no-release, rate-limit-exceeded.

### Task 10: Append-only corpus + ECO2-import endpoint (dev-only)
`ml/portfolio/corpus.py` JSONL writer with append-only test. `src/app/api/v1/eco2-imports/route.ts` per A10:
  - 503 in production (`NODE_ENV !== "development"`).
  - 401 without `x-corpus-key` matching `CORPUS_API_KEY` env.
  - Request body: `{ buildingPk, featureVector, eco2Result }` — caller supplies context.
  - Appends composed row to corpus.
  Full import UI is Phase 36.

### Task 11: Explorer page + CI guards
`/releases` page (server component). `scripts/ci-check-plan.mjs` runs the three guards from A11 (schema drift + explorer purity + release immutability). Wire into `package.json` as `ci:check`. README section on running locally.

### Task 12: Smoke run → v0.1.0 release
Run `generate_release.py` against one real 법정동 (user picks). Commit the v0.1.0 artifact bundle. Verify `/releases` renders, API returns rows, calibration.md shows Kendall tau ≥ 0.6 (gate passed), CI check passes.

## Schema Evolution Process

**Breaking change to `PortfolioFeatureVector` or API response shape:**
1. Bump `FEATURE_SCHEMA.version` major (e.g., `1.0.0` → `2.0.0`).
2. Start a new release track `v0.2.0` (minor bump per release; major bump only if feature schema major bumped).
3. Existing `public/releases/v0.1.0/` stays frozen forever; `manifest.json` history grows.
4. API routes: breaking API changes require a new route at `/api/v2/...`. v1 stays pinned to v1-compatible releases.
5. CHANGELOG.md entry documents the schema-version change and rationale.

**Non-breaking change (adding an optional field):**
1. Bump `FEATURE_SCHEMA.version` minor.
2. New release inherits minor bump.
3. Consumers reading the old shape continue working.

## Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | ECO2 has no CLI — training cycles human-gated | High | High | Semi-automated pipe, bulk batches (max 100 runs/phase per Gate Protocol). Fallback: Korean building-code K-value physics model from `src/lib/korean-building-codes.ts`. |
| R2 | Public data too sparse → Kendall tau < 0.6 | High | High | **Binding Gate Protocol in Task 7** (max 3 iterations, 100 ECO2 budget, decision-memo fallback to "infrastructure only" deliverable). No soft language — the gate has operational teeth. |
| R3 | Schema drift TS extractor ↔ Python pipeline | Was High; **now Low** | High | **Architecture fix: there is no Python port.** Python calls `scripts/extract-features.mjs` subprocess. Single source of truth in TS. CI guard on schema JSON still runs. Drift becomes impossible by construction. |
| R4 | Parquet in `public/` inflates build/deploy | Medium | Medium | v0.1.0 < 100 KB. Single-region scales to ~200 KB, all-of-Seoul ~60 MB — reassess at multi-region in Phase 36 when blob-storage migration lands. `ReleaseStore` interface (Task 9) means migration requires no caller changes. |
| R5 | `onnxruntime-node` + `apache-arrow` native binaries + Vercel | Medium | Medium | **Confirm viability as Task 4 sub-step** — measure deploy bundle; if either package breaks Vercel, fall back to reading Parquet via a small custom reader (we only need row-by-bjdongCd lookup). ONNX inference runs only in the offline release generator (Python), not in the Next.js runtime, so onnxruntime-node is only needed if we later want in-API inference; Phase 35 does not. **Recommendation:** drop `onnxruntime-node` from package.json; keep `apache-arrow` for the API's Parquet reading. |
| R6 | API schema breaks consumers | Medium | High | Schema Evolution Process above. Version routes + CHANGELOG. |
| R7 | Corpus grows unboundedly | Low | Low | Phase 35 corpus < 1 MB (append-only JSONL, < 50 KB per 1K rows). Phase 37+ problem. |
| R8 | Release immutability broken by accident | Medium | High | **CI guard (c) in A11** checks `git log --follow --diff-filter=M` for any file under `public/releases/v*/`; fails if a frozen release has modifications. This is a Phase 35 check, not a Phase 36 pre-commit-hook promise. |
| R9 | Thin explorer UI creeps toward interactive feature | Medium | Medium | **CI guard (b) in A11** greps `src/app/releases/page.tsx` for `"use client"`; fails if present. Combined with server-component-by-default architecture, this blocks interactivity by construction. |
| R10 (NEW) | Vercel ephemeral filesystem — production corpus writes lost | **Mitigated** | High | **eco2-imports endpoint is dev-only** (returns 503 in production). Production corpus-growth path is an explicit Phase 36 deliverable tied to blob-storage migration. Phase 35 corpus grows only via local `generate_release.py` runs. |
| R11 (NEW) | Open unauthenticated API abuse | Medium | Low | In-memory token bucket rate limit in Task 9 (60 req/min per IP). Phase 37 replaces with proper edge/platform rate limiting. |

## Verification Steps

- Task 2 — `pnpm test src/lib/portfolio/__tests__/features.test.ts` green; `.gitattributes` updated.
- Task 3 — 9/9 fixture cases green; `node scripts/extract-features.mjs` smoke test green.
- Task 4 — `pnpm export:feature-schema` emits JSON; `cd ml/portfolio && uv sync && uv run pytest tests/test_schema.py` green.
- Task 5 — `uv run python -m portfolio.build_dataset --count 10 --synthetic-eco2` produces `training.csv`; `test_eco2.py` green.
- Task 6 — `model.onnx` + `model_card.json` committed; `onnx` Python package loads it round-trip.
- Task 7 — `calibration.json` and `calibration.md` both produced; Kendall tau visible IN `calibration.json.kendallTau` and `calibration.md` results table; **gate pass/fail documented in the task-completion commit message**.
- Task 8 — all five release artifacts present in `public/releases/v0.1.0/`; `manifest.json` updated; CHANGELOG entry committed; corpus file gained N rows.
- Task 9 — `release-store.test.ts` and `route.test.ts` green (4 API cases).
- Task 10 — `test_corpus.py` green (append-only assertion); `route.test.ts` green (503 prod, 401 no-key, 200 happy-path).
- Task 11 — `/releases` server-renders; `pnpm ci:check` passes all three guards (schema, explorer purity, release immutability).
- Task 12 — end-to-end: 10+ building release generated + served + /releases page shows it + API route returns rows for at least one bjdongCd.
- Global — `pnpm test && pnpm lint && pnpm build && pnpm ci:check` green at every task boundary.

## Out of Scope (explicit)

- Per-building SHAP/attribution — Phase 36.
- National coverage (> one region) — Phase 36.
- Observed (KEPCO) meter data — Phase 39.
- Live simulation in 3D viewer — Phase 37.
- Confidence intervals / prediction intervals — Phase 40.
- Blob-storage migration for releases — Phase 36.
- **Production corpus-growth endpoint** — Phase 36 (blob storage lands).
- Authenticated / billed API — Phase 37+.
- ECO2-import UI — Phase 36.
- Pre-commit hook for schema sync — Phase 36 (Phase 35 CI check is sufficient).

## Dependencies (corrected)

- v4.0 public-data Level-1 pipeline (shipped).
- `src/lib/energy/energy-grade.ts` for kWh→grade mapping.
- `src/app/api/bldrgst/*/route.ts` for building data (**not** `src/lib/bldrgst/*` — that path does not exist).
- `src/lib/types.ts` for `BuildingRecord` type.
- `src/app/api/vworld/footprint/route.ts` for footprint geometry.
- `src/lib/energy/eco2-export.ts` + `eco2-import.ts` for ECO2 JSON contracts.
- `src/lib/korean-building-codes.ts` for era-prior lookup tables (used by extractor AND fallback physics model).
- Does NOT block v6.0 phases 29–34 or paused CAD upload tasks 4–8.
- Requires `uv` + Python 3.11 on dev host; Node 20+ on Python pipeline host.

## ADR — Phase 35 architectural decisions

**Decision:** Ship v7.0 Phase 35 as a **versioned data product** (D+B hybrid — immutable Parquet releases primary, read-only REST API secondary, thin server-only explorer page as marketing). Phase 35 scope: one region, ≥50 buildings, release v0.1.0. Training data: ECO2-driven simulated pairs. Python pipeline at `ml/portfolio/` produces releases; Node subprocess handles feature extraction to eliminate cross-language drift. Binding Kendall-tau ≥ 0.6 gate at Task 7 determines whether Tasks 8–12 ship or phase downgrades to "training infrastructure only."

**Drivers:**
1. Moat position — build what's hard to replicate (labeled Korean corpus, calibration claim, national coverage).
2. Consumer economics — artifacts consumers integrate without inheriting our stack; live programmatic access for dashboards.
3. Delivery economics — ship without new infrastructure (no blob storage, no new database, no new deploy target) in Phase 35.

**Alternatives considered:**
- **D-only (Parquet releases only):** Rejected — no programmatic path kills the API-driven partnership channel.
- **B-only (REST API only):** Rejected — no immutable snapshot breaks audit-credibility; the "2026-Q2 release agrees with ECO2 within X%" brand promise requires a pinnable artifact.
- **A+D (thin-viewer feature + artifacts):** Rejected — not meaningfully different from chosen (thin explorer ships regardless); "A+D" framing legitimizes the viewer as co-product and invites UI-creep.
- **Python port of TS feature extractor:** Rejected (Architect recommendation) — behavioral drift risk is unbounded and the CI guard catches schema drift only, not logic drift. Node subprocess via `scripts/extract-features.mjs` eliminates drift by construction.
- **UI-embedded prediction feature (pre-data-product framing):** Rejected — reframe as data product per strategic discussion on 2026-04-24; UI-embedded framing loses the moat story.

**Why chosen:**
D+B hybrid preserves audit-credible immutability (Principle 5) while enabling live programmatic consumers (Decision Driver 2). The thin explorer page is a marketing surface, never the product — CI guards enforce that invariant so no well-meaning PR drifts it toward a feature. Delivery economics are met by using `public/releases/` as the Phase 35 storage target; the `ReleaseStore` interface makes the Phase 36 blob-storage migration a caller-invisible swap.

**Consequences:**
- Corpus accumulation on production is explicitly deferred to Phase 36 (blob-storage dependency). Phase 35 corpus grows only via local `generate_release.py` runs and dev-only `POST /api/v1/eco2-imports` (returns 503 on production). The moat's "labeled Korean corpus" leg is incomplete at end of Phase 35; prediction + calibration legs are demonstrated.
- Binding gate protocol (max 3 feature-engineering iterations, max 100 ECO2 runs, fallback to "infrastructure only") protects against committing packaging work to an unproven model.
- ONNX model artifacts committed to git (~1–5 MB per version); Git LFS may be needed by Phase 37 as versions accumulate.
- No interactive prediction UI in Phase 35 by design and by CI enforcement. Design-tool framing (if ever pursued) requires a separate product / separate codebase — the data product's moat story does not survive UI-creep.

**Follow-ups (Phase 36+):**
- Production corpus-growth path (blob storage, A10 promoted to production).
- Release storage migration from `public/releases/` to object storage (`ReleaseStore` interface swap only).
- SHAP/attribution per building (Phase 36).
- Multi-region coverage + national expansion (Phase 36).
- Observed (KEPCO) meter data → fine-tune on real labels (Phase 39).
- Live simulation layer on twin authoring (Phase 37, separate v7 track).
- Confidence intervals / prediction intervals (Phase 40).
- Pre-commit hook for schema sync (Phase 36).
- Git LFS for ONNX model artifacts (Phase 37+).
- Proper edge-or-platform rate limiting for the prediction API (Phase 37).

---

## Changelog

- **2026-04-24** — Initial draft (restart after prior plan revert + "data product" reframing). Consensus review dispatched.
- **2026-04-24** — Revised after Architect + Critic consensus review. Changes applied:
  - **A10 endpoint redesigned** (Critic reject #3): request body now `{buildingPk, featureVector, eco2Result}`; endpoint is dev-only (503 in production); `x-corpus-key` auth guard added.
  - **Kendall-tau STOP gate given operational teeth** (Critic reject #2 + Architect #4): max 3 iterations, max 100 ECO2 runs, downgraded "training infrastructure only" deliverable on failure, decision memo requirement.
  - **R8 mitigation fixed** (Critic reject #1): release immutability now enforced via Phase 35 CI guard (`git log --diff-filter=M` check), not a Phase-36-deferred pre-commit hook.
  - **Symlink replaced by `manifest.json`** (Architect + Critic): Vercel + Windows compatible.
  - **Python port of extractor explicitly rejected** (Architect #2): Node subprocess via `scripts/extract-features.mjs` eliminates behavioral drift by construction.
  - **`ReleaseStore` interface added** (Architect #3): storage abstraction at `src/lib/portfolio/release-store.ts` makes Phase 36 blob-storage migration non-breaking.
  - **Shared-secret guard on eco2-imports** (Architect #5): `x-corpus-key` header.
  - **`*.parquet binary` and `*.onnx binary` in `.gitattributes`** (Architect #7).
  - **`calibration.json` companion to `calibration.md`** (Critic minor #5): machine-readable calibration data for downstream pipelines.
  - **Schema Evolution Process section added** (Critic missing): explicit major/minor bump protocol + route-versioning rule.
  - **Rate limiting added to `/api/v1/predictions`** (Critic missing): in-memory token bucket, 60 req/min per IP.
  - **ONNX model storage location specified** (Critic missing): `ml/portfolio/models/<version>/model.onnx` committed.
  - **Python pipeline tests explicit** (Critic missing): `ml/portfolio/tests/` with 4 pytest files.
  - **`extractFeatures` geometry contract clarified** (Critic missing): extractor receives pre-fetched `FootprintGeometry`; does not call any API.
  - **Dependencies paths corrected** (Critic minor #1): `src/app/api/bldrgst/*/route.ts` + `src/lib/types.ts`, not `src/lib/bldrgst/*`.
  - **`next.config.ts` removed from modified files** (Critic minor #3): not needed.
  - **JSONL chosen over Parquet for corpus** (Critic ambiguity): trivially appendable.
  - **`onnxruntime-node` flagged for removal** (Critic open question): inference is Python-side; Next.js does not need the Node ONNX runtime for Phase 35.
