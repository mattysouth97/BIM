---
id: P1-02
title: Add measure lifetimes, truncate cash flows, and add generator-level savings-formula tests
priority: P1
area: retrofit
status: not-started
owner: unassigned
effort: M
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-06, UC-07]
---

# P1-02 — Add measure lifetimes, truncate cash flows, and add generator-level savings-formula tests

## 1. Requirement (RE)

- **Problem**: Two defects, both verified in code:
  1. **No measure lifetimes — phantom savings in years 16–20.** `projectCashFlow` (`src/lib/retrofit/economic-model.ts:159-171`) runs every measure for the full `analysisHorizonYears` (20 by default, `src/lib/retrofit/cost-database.ts:47`): the loop at economic-model.ts:167-169 credits `annualCostSaving × (1+esc)^(t−1)` for all t ≤ horizon with no truncation. `RetrofitMeasure` (`src/lib/retrofit/retrofit-types.ts:8-38`) has NO lifetime field (verified: fields are id/name/category/estimatedCost/annualEnergySaving/annualCostSaving/co2Reduction/paybackYears/description/fuel?/financials?). Consequence: short-lived equipment collects savings it cannot deliver — LED fixtures (~15 yr rated life, lighting-retrofits.ts:26-77), boilers (~15 yr, hvac-retrofits.ts:35-58), HRV units (~15 yr, hvac-retrofits.ts:93-112) all book years 16–20. NPV, IRR, discounted payback, knapsack ranking (economic-model.ts:356-450), and `portfolioNpv` (retrofit-report.ts:97-107) are all systematically optimistic. There is also no replacement CAPEX, O&M cost, or salvage value anywhere in the model.
  2. **Savings generators have ZERO tests.** `src/lib/retrofit/__tests__/` contains ONLY `economic-model.test.ts`, `retrofit-report.test.ts`, `solar-potential.test.ts` (verified by directory listing). The three modules whose formulas feed every downstream number — `envelope-retrofits.ts` (ΔU × area × HDD × 24 / 1000 / η at :48-50), `hvac-retrofits.ts` (boiler :39-40, heat pump :64-67, HRV :94-95), `lighting-retrofits.ts` (ΔLPD × area × hours / 1000 at :29-30, :57-58) — have no regression net. Any silent formula drift propagates straight into NPV and knapsack selection.
- **Spot-check corrections**: brief cited the horizon loop at economic-model.ts:167-169 — exact (function spans :159-171). Brief cited RetrofitMeasure at retrofit-types.ts:8-37 — interface body ends at :37, closing brace at :38; cite as :8-38.
- **Impact**: 20-yr NPVs for LED/boiler/HRV measures are overstated by roughly the discounted value of 5 phantom years (at 5% discount + 3–5% escalation, ≈ 15–20% of a flat-measure NPV) — enough to flip knapsack selections and mislead CAPEX decisions. Missing generator tests mean the core engineering formulas can regress undetected.
- **Use case**: As a retrofit analyst, I want each measure's cash flow to stop at its realistic equipment lifetime (with documented lifetime assumptions), and I want the savings formulas pinned by unit tests, so that NPV and payback figures are defensible.

## 2. Specification (SDD)

- **Context pack** (read in this order):
  1. `src/lib/retrofit/retrofit-types.ts` — full file; the extension point.
  2. `src/lib/retrofit/economic-model.ts:152-171` — `projectCashFlow` (truncation point); also :306-324 `computeFinancials` and :182-242 NPV/IRR (they consume the truncated vector unchanged).
  3. `src/lib/retrofit/cost-database.ts:1-48` — constants style + `DEFAULT_ECONOMIC_ASSUMPTIONS` (horizon = 20); new lifetime constants belong here.
  4. Generators to annotate: `envelope-retrofits.ts` (4 measures), `hvac-retrofits.ts` (3 measures), `lighting-retrofits.ts` (2 measures), `solar-potential.ts` (1 measure).
  5. `src/lib/retrofit/__tests__/economic-model.test.ts` — `makeMeasure`/`flatAssumptions` helpers to reuse.
- **Design (decided)**:
  1. Add optional `lifetimeYears?: number` to `RetrofitMeasure` with doc comment: "Useful equipment life; cash flow truncates at `min(lifetimeYears, analysisHorizonYears)`. Absent ⇒ full horizon (legacy behavior for external/custom measures)."
  2. Add a `MEASURE_LIFETIMES` constant table to `cost-database.ts` keyed by measure id, each entry carrying a source comment (engineering standard or manufacturer-rated life; use ASHRAE equipment-life tables / KEMCO guidance — record exactly which in the comment; do NOT invent a citation). Initial values: `lighting-led` = 15, `lighting-led-smart` = 15, `hvac-boiler-upgrade` = 15, `hvac-heat-pump` = 20, `hvac-hrv` = 15, `envelope-wall-insulation` = 30, `envelope-roof-insulation` = 30, `envelope-floor-insulation` = 30, `envelope-window-replacement` = 25, solar PV measure id (read actual id in solar-potential.ts) = 25. Envelope/solar values ≥ horizon mean "no truncation at 20 yr" — that is intentional and must be commented.
  3. Every generator sets `lifetimeYears` from the table when pushing measures.
  4. `projectCashFlow`: `const years = Math.min(measure.lifetimeYears ?? horizon, horizon);` fill entries beyond `years` with 0 (keep vector length = horizon so `BudgetSelection.aggregateCashFlow` shape and `computeDiscountedPayback` indexing are unchanged). NPV/IRR/payback then automatically respect the truncation — do not special-case them.
  5. O&M / replacement CAPEX / salvage: OUT of scope for this item. Add only a `// TODO(P1-02-followup)` comment at the truncation site naming them, so the extension point is discoverable. Do not add half-wired fields.
- **BDD scenarios**:
  1. *Truncation* — Given a measure with `lifetimeYears: 15`, horizon 20, escalation 0, When `projectCashFlow` runs, Then `cashFlow` has length 20, entries 1–15 equal `annualCostSaving`, entries 16–20 equal exactly 0.
  2. *NPV respects lifetime* — Given two identical measures differing only in `lifetimeYears` (15 vs 20/absent), When `computeFinancials` runs, Then the 15-yr measure's NPV is strictly lower, and its `discountedPayback` is ≥ the 20-yr measure's.
  3. *Longer than horizon* — Given `lifetimeYears: 30` and horizon 20, Then behavior is identical to absent (all 20 years populated) — envelope measures never lose savings.
  4. *Envelope formula pinned* — Given U_wall 0.26 → 0.15, area 300 m², HDD 2400, η 0.87, When `generateEnvelopeRetrofits` runs, Then wall-insulation `annualEnergySaving` = (0.26−0.15) × 300 × 2400 × 24 / 1000 / 0.87 ≈ 2184.83 kWh/yr (compute exactly in the test) and cost = 300 × 120,000 KRW.
  5. *HVAC + lighting formulas pinned* — boiler: D=100,000, η=0.7 ⇒ saving = 100,000 × (1 − 0.7/0.95); heat pump: same D,η ⇒ saving = D/0.7 − D/3.5; HRV: 0.15 × D; lighting: LPD 20→6, 1,000 m², 2,500 h ⇒ 35,000 kWh/yr, and the >15 vs >10 LPD branch boundary (LPD 15 ⇒ LED-only path, LPD 10 ⇒ no measure).

## 3. Constraints (CDD)

- **Design constraints**:
  - Additive only: `lifetimeYears` optional; absent ⇒ legacy full-horizon behavior (protects any external/hand-built measures and existing tests that don't set it — except tests whose expected NPVs change because GENERATORS now set it; update only those expectations, with a comment stating the lifetime assumption driving the new number).
  - Cash-flow vector length MUST remain `analysisHorizonYears` (zero-padded tail) — aggregation in `selectMeasuresForBudget` (economic-model.ts:432-434) indexes by year; do not return shorter arrays.
  - Constants with provenance: every `MEASURE_LIFETIMES` entry has an inline source comment; if a value is an engineering estimate rather than a cited standard, say `// engineering estimate` explicitly — honesty over false precision.
  - No `'use client'` in `src/lib/**`; pure functions stay pure.
- **May touch**: `src/lib/retrofit/retrofit-types.ts`, `src/lib/retrofit/economic-model.ts` (projectCashFlow only), `src/lib/retrofit/cost-database.ts`, `src/lib/retrofit/envelope-retrofits.ts`, `src/lib/retrofit/hvac-retrofits.ts`, `src/lib/retrofit/lighting-retrofits.ts`, `src/lib/retrofit/solar-potential.ts` (annotation only), tests under `src/lib/retrofit/__tests__/`.
- **Must not**: do not implement O&M/replacement/salvage math; do not change `analysisHorizonYears` defaults or escalation rates; do not touch knapsack DP logic, conflict groups, or damping (P1-01 scope); do not touch fuel pricing (P1-03 scope); do not change any UI component or hook.
- **Fitness functions**:
  - `projectCashFlow(m, a).cashFlow.length === a.analysisHorizonYears` for all inputs (with and without `lifetimeYears`).
  - For any measure with `lifetimeYears = L < horizon`: all `cashFlow[t] === 0` for t ≥ L; NPV(L) < NPV(horizon) when `annualCostSaving > 0`.
  - Every measure emitted by every generator carries a `lifetimeYears` value present in `MEASURE_LIFETIMES` (single test iterating all generators with triggering inputs).
  - `assembleRetrofitReport` and `selectMeasuresForBudget` outputs unchanged in SHAPE (same keys, same array lengths).

## 4. Evaluation (EDD)

- **Tests to write first (TDD)**:
  - NEW `src/lib/retrofit/__tests__/envelope-retrofits.test.ts`: per-element saving formula (scenario 4 above + roof/floor variants), gas-price cost conversion, Infinity payback when saving = 0 (U already at target ⇒ no measure emitted), sort-by-payback ordering, `lifetimeYears` present on all emitted measures.
  - NEW `src/lib/retrofit/__tests__/hvac-retrofits.test.ts`: scenario 5 formulas; trigger boundaries (η = 0.85 ⇒ no boiler measure; η = 0.7 / age = 15 boundary behavior for heat pump — assert current semantics, do not redesign); HRV always emitted; `lifetimeYears` present.
  - NEW `src/lib/retrofit/__tests__/lighting-retrofits.test.ts`: both branches + boundaries (LPD 15, 10, 9.9), formula, `lifetimeYears` present.
  - EXTEND `economic-model.test.ts`: scenarios 1–3 (truncation, NPV ordering, ≥horizon no-op); zero-escalation + zero-rate cases via existing `flatAssumptions`; knapsack smoke test with truncated measures.
  - Update any existing expectations in `economic-model.test.ts` / `retrofit-report.test.ts` that change solely because generators now annotate lifetimes — annotate each changed expectation with the lifetime used.
- **Gates**: `pnpm test -- src/lib/retrofit` green; full `pnpm test` green; `pnpm lint` clean; `pnpm build` green.
- **Security / honesty checklist**:
  - No invented standards: each lifetime cites a real source or is labeled `engineering estimate`.
  - Phantom savings eliminated, not hidden: UI/report consumers see the same truncated numbers (no separate "optimistic" path left reachable).
  - Test expectations computed from the formulas by hand in the test file (not copied from implementation output) — state the arithmetic in comments.
- **Acceptance criteria**:
  - [ ] `RetrofitMeasure.lifetimeYears?` exists with doc comment.
  - [ ] `MEASURE_LIFETIMES` in cost-database.ts with per-entry source comments; all 10 generator measures annotated.
  - [ ] `projectCashFlow` truncates and zero-pads; NPV/IRR/payback respect it with no special-casing.
  - [ ] Three new generator test files exist and pin every savings formula + branch boundary.
  - [ ] All gates green.
- **Done when**: A 15-yr LED measure shows zero cash flow in years 16–20, its NPV drops accordingly, and every savings formula feeding the model is locked by a hand-computed unit test.
