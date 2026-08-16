---
id: P1-09
title: Ratchet src/lib coverage floors from the measured 52/57 baseline to 70/70
priority: P1
area: infra
status: not-started
owner: unassigned
effort: S
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-05, UC-06, UC-07]
---

# P1-09 — Ratchet src/lib coverage floors from the measured 52/57 baseline to 70/70

## 1. Requirement (RE)

- **Problem**: P0-05 introduced CI coverage floors for `src/lib/**`, but the honestly
  measured 2026-07-21 baseline was **52.78% lines / 57.54% functions** — below the 70%
  target — so the floors were set at 52/57 (never above the measured truth).
  Zero-coverage hotspots at baseline: `src/lib/retrofit/{envelope,hvac,lighting}-retrofits.ts`,
  `src/lib/report/templates/compliance-report.ts`, `src/lib/twin/*`,
  `src/lib/upload/plan-metadata.ts`, `src/lib/workflow/stage-sidebar-configs.ts`.
- **Impact**: Large untested surfaces in the savings engine (per-category measure
  generators!) can regress without CI noticing, as long as aggregate stays above 52/57.
- **Use case**: As the repo maintainer, I want the coverage floor raised to 70/70 by adding
  real tests to the zero-coverage libs, so that the savings engine's generators are
  regression-protected.

## 2. Specification (SDD)

- **Context pack**:
  1. `vitest.config.ts` — thresholds block (P0-05).
  2. `src/lib/retrofit/envelope-retrofits.ts`, `hvac-retrofits.ts`, `lighting-retrofits.ts` — untested generators (P1-02 also adds generator-level tests; coordinate).
  3. Coverage report: `pnpm test:coverage` per-file table.
- **BDD scenarios**:
  1. Given new tests for the retrofit generators and other zero-coverage libs, When `pnpm test:coverage` runs, Then `src/lib/**` meets `{ lines: 70, functions: 70 }` and the thresholds in `vitest.config.ts` are raised to 70/70.
  2. Given the raised floors, When any later change drops `src/lib` below 70, Then CI fails.

## 3. Constraints (CDD)

- **May touch**: `vitest.config.ts` (thresholds only), new tests under `src/lib/**/__tests__/`.
- **Must not**: weaken/delete existing tests; add `coverage.exclude` entries to game the metric; change production code except trivially-testable seams.
- **Fitness functions**: thresholds in `vitest.config.ts` read `{ lines: 70, functions: 70 }` for `src/lib/**` and `pnpm test:coverage` exits 0.

## 4. Evaluation (EDD)

- **Tests to write first**: generator-level tests for envelope/hvac/lighting retrofits (may land via P1-02 — if so, this item only raises the floor and fills remaining gaps).
- **Gates**: `pnpm test:coverage`, `pnpm lint`, `pnpm build`.
- **Acceptance criteria**:
  - [ ] `src/lib/**` coverage ≥ 70% lines and functions, floors raised to 70/70.
  - [ ] No test weakened, no exclusion added.
- **Done when**: CI enforces 70/70 on `src/lib/**` with honestly earned coverage.
