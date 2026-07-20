---
id: P2-09
title: Rewrite e2e suite around the real user journey with mocked APIs
priority: P2
area: infra
status: not-started
owner: unassigned
effort: M
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-01, UC-03, UC-05, UC-08]
---

# P2-09 — Rewrite e2e suite around the real user journey

## 1. Requirement (RE)
- **Problem**: every e2e test navigates to an invalid `/building/test-id` and asserts the page didn't crash. e2e/building-flow.spec.ts:66 `expect(body).toContain("</div>")` is tautological — any rendered page passes. e2e/plan-view.spec.ts:36-39 has an else-branch that skips all assertions when the viewer doesn't render (always-true). building-flow.spec.ts:5 claims "tests will be skipped via the beforeEach check" — no such beforeEach exists. The critical journey (search → building → 3D twin → retrofit report) has zero coverage.
- **Impact**: CI e2e is green-by-construction; regressions in the core journey ship undetected; false confidence in the 902-test gate story.
- **Use case**: As a maintainer I want e2e tests that fail when the search → twin → report journey breaks, so CI means something.

## 2. Specification (SDD)
- **Context pack**: e2e/building-flow.spec.ts; e2e/plan-view.spec.ts; playwright.config.* (webServer config, reuseExistingServer); src/app/page.tsx (search UI — tabs/inputs, API-key banner :258-259); src/app/building/[id]/page.tsx; twin selectors already in the DOM: `data-twin-prediction` (roi-readout.tsx:115), `data-twin-rail` (scenario-rail.tsx:66), `data-twin-capex-input` (capex-input.tsx:69); the bldrgst API routes under src/app/api/bldrgst/ (what to mock).
- **BDD scenarios**:
  1. Given Playwright `page.route` mocks for the bldrgst endpoints returning a small recorded fixture, When the user searches and selects a building, Then the building page renders real data (assert specific ledger fields, not "</div>").
  2. Given the mocked building loaded, When the Twin stage opens, Then `data-twin-rail`/`data-twin-prediction` become visible (WebGL-dependent assertions guard on canvas presence, failing loudly in CI if the viewer never mounts — no silent else).
  3. Given a CAPEX budget entered via `data-twin-capex-input`, When measures compute, Then NPV/payback readouts render non-empty formatted values.
  4. Given the Report stage, When opened, Then export controls exist (export-dropdown trigger) and the stage completes the journey.
  5. Given no API key configured, When the app loads, Then the API-key banner/dialog path is asserted (this is real, deterministic behavior).
- **Deletions**: the "</div>" assertion, the plan-view always-true else branch, and the false beforeEach comment all go.

## 3. Constraints (CDD)
- **Design constraints**: no live data.go.kr calls in e2e — mock at the network layer with committed minimal fixtures (honor the API-key-free CI environment); keep runtime bounded (< ~3 min); WebGL assertions tolerate headless software GL but never pass on absent canvas; specs stay independent (no order coupling).
- **May touch**: e2e/**, playwright.config.*, new e2e/fixtures/** (recorded API responses).
- **Must not**: change app code to "make tests pass" beyond adding data-testid hooks; no network allowlist hacks that let tests hit real APIs; do not delete the API-key dialog's own unit tests.
- **Fitness functions**: every spec contains at least one content-specific assertion (named data, visible labeled control, or formatted value); zero `waitForTimeout` used as an assertion substitute (keep only where documented as render-settle); suite fails when the ledger mock is removed mid-journey.

## 4. Evaluation (EDD)
- **Tests to write first (TDD)**: the rewritten specs ARE the deliverable — author journey spec first, watch it fail against current invalid-id approach, then pass with mocks.
- **Gates**: `pnpm exec playwright test` (with the config's webServer); `pnpm test`; `pnpm lint`; `pnpm build`.
- **Security / honesty checklist**: fixtures contain no real API key and only public ledger data; CI skips nothing silently — any environment skip is explicit (`test.skip` with reason) and reported.
- **Acceptance criteria**:
  - [ ] Journey spec: search → building → twin → report passes with mocked API
  - [ ] Tautological assertions + false comment deleted
  - [ ] Suite demonstrably fails when a journey step breaks (verified by mutation)
- **Done when**: breaking the search→report journey turns CI red.
