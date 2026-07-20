---
id: P2-05
title: Make the v0.1.0 ML release honest — build the pipeline or strip the metrics
priority: P2
area: ml
status: not-started
owner: unassigned
effort: M
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-10]
---

# P2-05 — Make the v0.1.0 ML release honest

## 1. Requirement (RE)
- **Problem**: public/releases/v0.1.0/ contains only manifest.json, schema.json, calibration.json, data-dictionary.md — no predictions artifact. `GET /api/v1/predictions/*` therefore always returns 503 (src/app/api/v1/predictions/[bjdongCd]/route.ts:119-121 via src/lib/portfolio/release-store.ts:126-151 — brief cited src/lib/release-store.ts, corrected) while manifest.json:9-15 claims 1,284 buildings / 17 sido coverage. calibration.json:2-23 reports MAPE 8.4%, R² 0.71, 268-building holdout, tierLabel "Calibrated · held-out validated" — but no training code exists anywhere (ml/portfolio/corpus/ contains only .gitkeep), so the metrics are unverifiable. golden-corpus.json is not committed (fixtures dir holds only build-corpus.mts, generate-corpus.test.ts, golden-corpus-generator.ts) and src/lib/energy/__tests__/fixtures/generate-corpus.test.ts:16 is `describe.skip`.
- **Impact**: the public API and /releases page present unverifiable accuracy claims as validated fact — a trust/honesty defect, not just missing data.
- **Use case**: As an API consumer I want release metrics backed by a reproducible pipeline, or clearly labeled as schema-only placeholders.

## 2. Specification (SDD)
- **Context pack**: public/releases/v0.1.0/manifest.json + calibration.json; src/lib/portfolio/release-store.ts:107-165; src/app/api/v1/predictions/[bjdongCd]/route.ts; src/app/releases/page.tsx:23-31,85-120; src/lib/energy/__tests__/fixtures/{golden-corpus-generator.ts,generate-corpus.test.ts,build-corpus.mts}; ml/portfolio/corpus/.
- **Decision gate (choose one, document in the PR)**:
  - **Option A — build it**: training script under ml/ that produces a corpus + predictions.json/jsonl artifact committed to public/releases/v0.1.0/; metrics recomputed from the actual holdout; unskip/repair generate-corpus.test.ts (its comment at :17-20 admits it is node-only tooling — convert to a plain script like build-corpus.mts).
  - **Option B — strip it**: mark v0.1.0 "schema-only": remove/relabel metrics in calibration.json (tierLabel → "Schema preview — not validated"), manifest notes updated, /releases page already handles `predictionsAvailable=false` honestly (page.tsx:85-91,114-120) — keep that path; fix-or-delete the skipped corpus test.
- **BDD scenarios**:
  1. (A) Given the pipeline run, When predictions.jsonl lands, Then GET /api/v1/predictions/{covered bjdongCd} returns 200 with rows and unknown regions 404.
  2. (B) Given schema-only labeling, When /releases renders, Then no validated-accuracy claim is displayed and the API's 503 body/documentation says "schema-only release".
  3. Given either option, When CI runs, Then no `describe.skip` fixture-emission test remains masquerading as a test.

## 3. Constraints (CDD)
- **Design constraints**: never fabricate metrics — any number in calibration.json must trace to a committed script + committed input data; keep the ReleaseStore interface unchanged (release-store.ts:22-44); rate-limit/route semantics unchanged.
- **May touch**: public/releases/v0.1.0/**, ml/**, src/lib/energy/__tests__/fixtures/**, src/app/releases/page.tsx (labeling only), route.ts 503 copy if relabeled.
- **Must not**: weaken the 400/404/429/503 contract of the predictions route; no training on live API keys; do not commit large parquet into git (JSONL readable artifact only, per release-store.ts:122-127).
- **Fitness functions**: every calibration metric reproducible by a committed command, or absent; `pnpm test` green with no skipped corpus generator.

## 4. Evaluation (EDD)
- **Tests to write first (TDD)**: route.test.ts — add a case asserting 503-vs-200 behavior matches the actual artifact state; fixtures — corpus generator converted to a runnable script with a smoke assertion (row count, schema keys).
- **Gates**: `pnpm test -- predictions fixtures`; `pnpm test`; `pnpm lint`; `pnpm build`.
- **Security / honesty checklist**: no invented building counts; "held-out validated" label removed unless a real holdout exists; data-dictionary/schema stay consistent with whatever ships.
- **Acceptance criteria**:
  - [ ] Decision (A or B) documented and executed
  - [ ] Metrics either reproducible or removed
  - [ ] Skipped corpus test fixed or deleted
  - [ ] /releases + API tell the same truth
- **Done when**: nothing user-visible claims validation that cannot be reproduced from the repo.
