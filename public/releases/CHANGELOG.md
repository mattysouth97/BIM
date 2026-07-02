# Portfolio Prediction Data Product — Release Changelog

All notable changes to the `public/releases/` data product are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/). Each
release is immutable once published — see the Schema Evolution Process in
`.omc/plans/consensus-v7-phase35-portfolio.md`.

## v0.1.0 — 2026-04-22

Baseline calibration release. First published artifact bundle for the v7.0
Prediction Data Product (Phase 35).

**Artifacts published:**
- `manifest.json` (per-release) — model family `portfolio-xgb`, model version
  `xgb-1.3.2`, feature schema version `1.0.0`. Coverage: 1,284 buildings across
  17 시도 / 64 시군구.
- `calibration.json` / (calibration.md pending) — held-out validation on 268
  buildings (804 observations), split by `sigungu` leave-out.
  - MAPE: **8.4%**
  - Kendall tau: **0.672** (passes the Phase 35 binding gate of ≥ 0.6 — see
    Task 7 gate protocol)
  - Spearman rho: 0.814
  - R²: 0.71
  - Tier: **B** (Calibrated · held-out validated)
- `schema.json` — JSON Schema (draft-07) for the 20-field
  `PortfolioFeatureVector`, generated from
  `src/lib/portfolio/features.ts::FEATURE_SCHEMA` via
  `pnpm export:feature-schema`.
- `data-dictionary.md` — human-readable field reference.

**Known gaps (honest status):**
- `predictions.parquet` is **NOT YET PUBLISHED**. The manifest and calibration
  metadata above reflect a genuine offline training run, but the trained
  model/dataset artifacts (ONNX model, Parquet release rows) currently exist
  only on the offline training host. `GET /api/v1/predictions/{bjdongCd}`
  will return `503 release-data-unavailable` until the Parquet file (or an
  equivalent readable `predictions.json` / `predictions.jsonl`) is uploaded
  to `public/releases/v0.1.0/`.
- `calibration.md` (human-readable calibration report) is pending alongside
  the Parquet upload.
- Region coverage for the v0.1.0 row-level release (single 법정동, per Phase
  35 scope) has not yet been generated — the 1,284-building figure in
  `manifest.json.coverage` describes the offline training corpus, not the
  published release rows.

No breaking changes — this is the first release.
