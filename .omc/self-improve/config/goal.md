# Improvement Goal

## Objective
Improve the test coverage and code quality of `src/lib/portfolio/feature-extractor.ts` (the v7.0 Prediction feature extractor). No behavioral regressions.

## Target Metric
- **Metric name**: `coverage_pct` — statements coverage percentage for `src/lib/portfolio/feature-extractor.ts` only, measured by `@vitest/coverage-v8` via `coverage-summary.json`.
- **Target value**: `null` (run until plateau or max iterations).
- **Direction**: `higher_is_better`.

## Scope

**In scope:**
- Refactoring of `src/lib/portfolio/feature-extractor.ts` (subject to sealed-file constraints).
- Adding new test files under `src/lib/portfolio/__tests__/` OTHER than the two preserved files.
- Any internal helpers the extractor needs (same file or newly created inside `src/lib/portfolio/`).

**Out of scope (sealed):**
- `src/lib/portfolio/features.ts` — the `FeatureVector` contract; cannot change.
- `src/lib/portfolio/__tests__/feature-extractor.test.ts` — preserved test file.
- `src/lib/portfolio/__tests__/extract-features-cli.test.ts` — preserved test file.
- `scripts/extract-features.mjs` — parity mirror; must not be modified (parity smoke test would fail).
- Any file outside `src/lib/portfolio/`.

**Hard constraints** (variant rejected if any fail):
1. All existing tests in the two preserved files must continue to pass.
2. `pnpm build` must succeed (no new type errors).
3. `pnpm lint src/lib/portfolio/feature-extractor.ts` must have 0 errors.
4. Parity with `scripts/extract-features.mjs` must hold (enforced by the CLI smoke test in the preserved-tests set).

## Milestones (optional)
| Milestone | Target | Strategy Focus |
|-----------|--------|----------------|
| M1 | coverage_pct >= 95% | Add new test files for edge cases not covered by the preserved 21 tests |
| M2 | coverage_pct >= 98% + LOC reduction | Refactor extractor for cleanliness + add missing edge cases |

## Experiment Ideas (optional)
- Add a new test file `feature-extractor-edge-cases.test.ts` covering: extremely tall buildings, tiny footprints, unknown structure codes, missing era-prior entries, WGS-84 vs UTM boundary cases.
- Refactor era-prior lookup into a small pure helper to isolate that branch and enable tighter unit tests.
- Extract the climate-zone derivation into a named helper so it can be tested independently.
