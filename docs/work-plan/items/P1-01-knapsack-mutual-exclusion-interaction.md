---
id: P1-01
title: Enforce mutually exclusive measures and damp interaction double-counting in retrofit portfolios
priority: P1
area: retrofit
status: not-started
owner: unassigned
effort: L
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-06, UC-07]
---

# P1-01 — Enforce mutually exclusive measures and damp interaction double-counting in retrofit portfolios

## 1. Requirement (RE)

- **Problem**: Two distinct over-counting defects, both verified in code:
  1. **Mutually exclusive measures summed as independent.** `generateHvacRetrofits` emits `hvac-boiler-upgrade` when `heatingEfficiency < 0.85` (`src/lib/retrofit/hvac-retrofits.ts:36-58`, saving = `D × (1 − η/0.95)` at :39-40) AND `hvac-heat-pump` when `heatingEfficiency < 0.7 || age > 15` (`src/lib/retrofit/hvac-retrofits.ts:61-91`). For any building with η < 0.7 — or η < 0.85 with age > 15 — BOTH measures are generated against the same baseline heating demand. Neither `selectMeasuresForBudget` (`src/lib/retrofit/economic-model.ts:356-450`) nor `assembleRetrofitReport` (`src/lib/retrofit/retrofit-report.ts:51-123`) has any conflict/mutual-exclusion concept: the knapsack aggregates per-measure NPVs and cash flows by plain summation (economic-model.ts:428-435) and the report sums savings across all measures (retrofit-report.ts:73-76). A portfolio containing both is physically impossible (you cannot upgrade the boiler AND replace it with a heat pump).
  2. **No interaction damping across demand-reducing measures.** HRV saving is computed as 15% of BASELINE heating demand (`src/lib/retrofit/hvac-retrofits.ts:94-95`: `hrvEnergySaving = annualHeatingDemand * 0.15`), and the boiler-upgrade saving likewise scales with baseline demand (:40). Envelope insulation measures (`src/lib/retrofit/envelope-retrofits.ts:48-50`) reduce that same heating demand. Knapsack aggregation (economic-model.ts:428-435), report summary (retrofit-report.ts:73-76), and `cumulativeSavings` (retrofit-report.ts:83-94) all sum the un-damped values, so combined portfolios systematically overstate savings.
  3. **Propagates into GR tier suggestion.** `energyImprovementFraction` (`src/hooks/use-retrofit-scenario.ts:239-264`, summation at :252-256) sums `annualEnergySaving` of all selected non-renewable measures over baseline. It inherits both inflations and feeds `suggestPrivateTrack` (:271; tier thresholds ≥0.3 / ≥0.2 at `src/lib/retrofit/cost-database.ts:182-189`), so the UI can suggest a 그린리모델링 private tier the building does not physically qualify for.
- **Spot-check corrections**: brief cited boiler block at :36-58 — actual trigger line is :36 with the block spanning :35-58; heat-pump block is :60-91 (trigger at :61 also fires on `age > 15` alone, widening the overlap beyond η < 0.7). All other citations verified exact.
- **Impact**: Reported portfolio savings, NPV, and `aggregateCashFlow` are overstated whenever (a) boiler+heat-pump co-occur (any old/low-efficiency building — the common retrofit target) or (b) envelope + HRV/boiler measures combine (any deep-retrofit package). CAPEX allocation decisions and the GR tier hint are based on physically impossible numbers — a credibility and compliance risk for a tool whose purpose is investment-grade retrofit analysis.
- **Use case**: As a building owner evaluating a retrofit package, I want the simulator to never combine mutually exclusive measures and to discount overlapping savings, so that the projected savings, payback, and suggested subsidy tier reflect what the building can actually achieve.

## 2. Specification (SDD)

- **Context pack** (read in this order before writing code):
  1. `src/lib/retrofit/hvac-retrofits.ts` — full file; note both trigger conditions (:36, :61) and the baseline-demand scaling of all three savings (:40, :64-67, :94-95).
  2. `src/lib/retrofit/economic-model.ts:326-450` — `BudgetSelection` + `selectMeasuresForBudget` DP, backtrack (:412-421), and aggregation loop (:423-435).
  3. `src/lib/retrofit/retrofit-report.ts:51-123` — summary sums (:73-76) and `cumulativeSavings` (:83-94).
  4. `src/hooks/use-retrofit-scenario.ts:135-272` — measure assembly order (:153-208: envelope → HVAC → lighting → solar) and `energyImprovementFraction` (:239-264).
  5. `src/lib/retrofit/retrofit-types.ts` — `RetrofitMeasure` (extension point for conflict metadata).
  6. `src/lib/retrofit/__tests__/economic-model.test.ts` — existing knapsack test patterns, `makeMeasure` helper.
- **Design (decided — implement this, not an ad-hoc alternative)**:
  1. **Conflict groups.** Add optional `conflictGroup?: string` to `RetrofitMeasure`. Emit `conflictGroup: "heating-plant"` on `hvac-boiler-upgrade` and `hvac-heat-pump` in hvac-retrofits.ts. In `selectMeasuresForBudget`, enforce at-most-one-per-group EXACTLY: conflict groups are tiny (today one group of two), so branch — run the existing DP once per feasible combination of group representatives (here: {neither}, {boiler}, {heat-pump}), take the max-NPV feasible result. Do NOT bolt conflicts onto the DP table itself (0/1 knapsack with conflict constraints is not solvable by the current single-table DP; branching over ≤ a handful of combinations is exact and cheap). Document the branching cap: if a future group set yields > 64 combinations, fall back to greedy per-group best-NPV representative and mark the result approximate in a code comment.
  2. **Sequential-demand damping (primary model).** Dampen at generation time in physical order, envelope first:
     - In `use-retrofit-scenario.ts`, compute envelope measures first; subtract Σ envelope heating-side savings from `heatingDemand`; pass the RESIDUAL demand to `generateHvacRetrofits`. Pass undamped demands only where the measure does not act on heating demand (lighting, solar unchanged).
     - Keep generators pure: `generateHvacRetrofits` keeps its signature — it already takes `annualHeatingDemand` as a parameter; the hook simply passes the damped value. Add an explicit code comment at the call site stating the demand is post-envelope.
     - Report path: measures generated outside the hook (tests, future callers) carry no damping context, so add an exported helper `dampPortfolioSavings(measures)` (new module `src/lib/retrofit/measure-interactions.ts`) implementing the documented pairwise fallback: for each unordered pair (i, j) where both act on heating demand, subtract `INTERACTION_COEFFICIENTS[pairKey] × min(s_i, s_j)`; coefficients live in one documented constant (initial values: envelope↔hvac-boiler-upgrade = boiler saving fraction of baseline, envelope↔hvac-hrv = 0.15 × envelope saving / baseline — i.e. recompute-from-residual equivalents; record derivation in comments). `assembleRetrofitReport` uses this helper for `summary` totals and `cumulativeSavings` (damping applied in fixed physical order envelope → hvac → lighting, NOT payback display order; display order unchanged).
     - `energyImprovementFraction` must consume damped values (with generator-level damping in the hook, the selected measures already carry damped savings — assert in tests that the hook path and report path agree within 1e-6).
  3. Keep per-measure `annualEnergySaving`/`annualCostSaving` semantics unchanged ("saving of this measure applied to the demand it was generated against"); damping is a PORTFOLIO-level concern, never silently mutate a measure's own fields after generation except via the explicit sequential hook flow.

- **BDD scenarios**:
  1. *Conflict exclusion (knapsack)* — Given measures `hvac-boiler-upgrade` (NPV 5M) and `hvac-heat-pump` (NPV 8M) both within a budget that fits both, When `selectMeasuresForBudget` runs, Then `selected` contains at most one of them (the heat pump, higher NPV), and `npv` equals that measure's NPV alone.
  2. *Conflict branching can pick the cheaper measure* — Given boiler-upgrade NPV 5M @ CAPEX 10M and heat-pump NPV 8M @ CAPEX 40M, and a budget of 15M, When the knapsack runs, Then boiler-upgrade is selected (heat-pump branch infeasible) — proving branching evaluates feasibility per branch, not just global NPV.
  3. *Sequential damping in hook* — Given a building where envelope measures save 30,000 kWh/yr of heating against baseline heating demand 100,000 kWh/yr, When `useRetrofitScenario` generates HVAC measures, Then `hvac-hrv.annualEnergySaving` = 0.15 × 70,000 = 10,500 kWh/yr (NOT 15,000), and boiler-upgrade saving scales with 70,000 likewise.
  4. *Report totals damped* — Given envelope + HRV measures assembled via `assembleRetrofitReport`, Then `summary.totalAnnualSaving` is strictly less than the naive sum of individual `annualEnergySaving`, equals the damped helper output, and cumulative savings reflect the same damping.
  5. *GR tier no longer inflated* — Given the scenario in (3) plus the conflict pair, Then `energyImprovementFraction` computed from selected measures does not exceed (physically damped saving)/baseline and never exceeds 1.

## 3. Constraints (CDD)

- **Design constraints**:
  - Pure functions stay pure: generators receive already-damped demands; no hidden global state. `selectMeasuresForBudget` remains deterministic for identical inputs (branch iteration order fixed; tie-break by higher NPV, then by lower effective CAPEX, then by measure id lexical order — document and test).
  - Reuse existing patterns: conflict metadata rides on `RetrofitMeasure` (same approach as the optional `fuel` field, retrofit-types.ts:31); damping helper is a pure exported function with colocated constants, mirroring cost-database.ts style (Korean-context constants + source comments).
  - Backward compatibility: `conflictGroup` optional — measures without it behave exactly as before; `assembleRetrofitReport` callers see no signature change.
  - No `'use client'` in any `src/lib/**` file; all changed lib modules stay server/client agnostic.
- **May touch**: `src/lib/retrofit/hvac-retrofits.ts`, `src/lib/retrofit/economic-model.ts`, `src/lib/retrofit/retrofit-report.ts`, `src/lib/retrofit/retrofit-types.ts`, `src/hooks/use-retrofit-scenario.ts`, new `src/lib/retrofit/measure-interactions.ts`, new/existing tests under `src/lib/retrofit/__tests__/`, hook tests if a `src/hooks/__tests__/` pattern exists (otherwise colocate per repo convention).
- **Must not**: do not change ENERGY_PRICES/CO2_FACTORS or any cost constant; do not alter solar-potential.ts or lighting-retrofits.ts (unaffected end-uses); do not change the DP quantization scheme or `BudgetSelection` interface shape (additive fields only if unavoidable); do not modify UI components; do not "fix" P1-02 lifetimes or P1-03 fuel pricing here (separate items — no drive-by changes).
- **Fitness functions**:
  - For every possible `selectMeasuresForBudget` result: no two selected measures share a `conflictGroup` (property-style test over generated measure sets).
  - Damping is monotone non-increasing: damped portfolio total ≤ naive sum, ALWAYS (test with randomized measure sets).
  - Physical bound: summed heating-side savings of any selected portfolio ≤ baseline heating demand passed to the hook.
  - `energyImprovementFraction` ∈ [0, 1] for all inputs; equals damped-saving/baseline within 1e-6 of the report-path computation on the same selection.
  - Existing 902-test suite stays green with no snapshot edits unrelated to these modules.

## 4. Evaluation (EDD)

- **Tests to write first (TDD)**:
  - `src/lib/retrofit/__tests__/measure-interactions.test.ts` (new): conflict-group metadata presence on boiler/heat-pump measures; damping helper math on hand-computed pairs (envelope 30,000 + HRV baseline-15% case above); monotonicity + physical-bound property tests; coefficient-table documentation assertions (every key matches a real measure-id pair pattern).
  - Extend `src/lib/retrofit/__tests__/economic-model.test.ts`: knapsack conflict scenarios 1–2 above; tie-break determinism; conflict-branching picks feasible branch; zero-budget and empty-input regressions still pass.
  - Extend `src/lib/retrofit/__tests__/retrofit-report.test.ts`: damped summary totals; cumulativeSavings damping in physical order while display order stays payback-sorted.
  - Hook-level test for scenario 3 (post-envelope residual demand passed to HVAC generator) — follow the repo's existing hook-test convention; if none exists, test the extracted pure assembly function instead of rendering the hook.
- **Gates**: `pnpm test -- src/lib/retrofit` green; full `pnpm test` green (902 + new); `pnpm lint` clean; `pnpm build` green.
- **Security / honesty checklist**:
  - No fabricated coefficients: every entry in `INTERACTION_COEFFICIENTS` carries a comment deriving it from the sequential-demand model (or an external source if one is cited).
  - Report/UI must not present damped totals as per-measure savings: per-measure fields keep their generated semantics; only portfolio aggregates are damped, and the damping helper's doc comment states this explicitly.
  - No silent behavioral change for single-measure portfolios (damped total == naive total when no interacting pair exists).
- **Acceptance criteria**:
  - [ ] `RetrofitMeasure.conflictGroup` exists; boiler-upgrade and heat-pump carry `"heating-plant"`.
  - [ ] `selectMeasuresForBudget` never returns conflicting measures; branching is exact for ≤64 combinations and tested.
  - [ ] Hook passes post-envelope residual heating demand to `generateHvacRetrofits` (commented).
  - [ ] `assembleRetrofitReport` totals and cumulative savings use the damping helper.
  - [ ] `energyImprovementFraction` reflects damped savings; GR tier suggestion test updated/added.
  - [ ] All gates green.
- **Done when**: A low-efficiency old building (η < 0.7, age > 15) with poor envelope yields a knapsack selection containing at most one heating-plant measure, portfolio totals ≤ naive sums, and `energyImprovementFraction` no longer exceeds the physically damped bound — all asserted by tests.
