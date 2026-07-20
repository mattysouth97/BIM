---
id: P2-10
title: Financial model refinements — loan-term buy-down, rate honesty, solar/escalation fixes, sourced costs
priority: P2
area: retrofit
status: not-started
owner: unassigned
effort: L
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-06, UC-07, UC-08]
---

# P2-10 — Financial model refinements

## 1. Requirement (RE)
- **Problem** (seven sub-defects, all verified):
  (a) Private-track 그린리모델링 interest buy-down is modeled as a permanent WACC cut over 20 years — `effectiveDiscountRate` (src/lib/retrofit/economic-model.ts:92-102) + presets with `analysisHorizonYears: 20` (src/lib/retrofit/cost-database.ts:111-157) — while the research dossier scopes support to "cost of capital over the loan term" (docs/superpowers/research/2026-04-30-green-remodeling.md:82-91).
  (b) UI mislabels the rate: RoiReadout displays `assumptions.discountRate` (5%) and discounts its chart at 5% (src/components/twin/roi-readout.tsx:50,93,119) while headline NPV was computed at WACC ~2.2% (cost-database.ts:105-106); ScenarioRail same (src/components/twin/scenario-rail.tsx:81).
  (c) Solar stream fully escalated at the 5% electricity rate (resolveFuel → "electricity", economic-model.ts:139) though the 30% feed-in portion (FEED_IN_RATIO, src/lib/retrofit/solar-potential.ts:33) is a fixed SMP/REC tariff that shouldn't escalate; no ~0.5%/yr panel degradation.
  (d) Self-consumption priced 120 KRW/kWh (solar-potential.ts:35 DEFAULT_ELECTRICITY_PRICE) vs 140 engine-wide (cost-database.ts:194).
  (e) Heat-pump net saving escalated at the gas rate (economic-model.ts:140) though its electricity component escalates faster.
  (f) Unsourced costs: HVAC per-m² (hvac-retrofits.ts:8-10), lighting per-m² (lighting-retrofits.ts:8-10), solar 1.5M KRW/kWp (solar-potential.ts:34), HRV 15% saving (hvac-retrofits.ts:94) — no source annotations like the KICT-tagged envelope costs.
  (g) 2026 program parameters are compile-time constants (cost-database.ts:111-167) with no version/effective-date metadata; the 200B KRW loan cap is unenforced (no cap logic exists in economic-model.ts).
- **Impact**: overstated NPV on private-track scenarios, self-contradictory rate display, solar revenue overstated late-horizon, and untraceable cost basis.
- **Use case**: As an analyst I want the model to match the 2026 program rules, display the rate it actually used, and cite every cost source.

## 2. Specification (SDD)
- **Context pack**: economic-model.ts full; cost-database.ts:100-209; solar-potential.ts:25-55; hvac-retrofits.ts; lighting-retrofits.ts; roi-readout.tsx:45-125; scenario-rail.tsx:68-95; the research dossier §3.
- **BDD scenarios**:
  1. (a) Given a financingMix with loanTermYears L < horizon, When NPV is computed, Then the buy-down applies as loan-term interest savings (or rate reverts to discountRate after L) — a 20-year horizon no longer enjoys 20 years of subsidized WACC.
  2. (b) Given private-base preset, When RoiReadout/ScenarioRail render, Then displayed rate and chart discounting equal `effectiveDiscountRate(assumptions)` (2.2%), labeled as WACC/유효할인율.
  3. (c) Given a solar measure, When cash flows project, Then the feed-in 30% stays flat (or at tariff escalation) and output degrades ~0.5%/yr; self-consumed 70% escalates at the electricity rate.
  4. (d/e) Given solar + heat-pump measures, When priced, Then one electricity price constant is used everywhere and the heat-pump stream blends gas-saved vs electricity-spent escalations.
  5. (g) Given program constants, When read, Then a `PROGRAM_PARAMETERS_VERSION`/effective-date object accompanies them and budgets above the loan cap are clamped or flagged.

## 3. Constraints (CDD)
- **Design constraints**: keep `MeasureFinancials`/`BudgetSelection` shapes backward-compatible (add fields, don't rename); every changed number carries a source comment; dossier remains the authority for program rules — deviating assumptions must be documented inline; pure functions in src/lib/retrofit.
- **May touch**: src/lib/retrofit/**, src/components/twin/{roi-readout,scenario-rail}.tsx (display only), related tests.
- **Must not**: change energy-demand calculations (P2-01/02 scope); no UI redesign; do not silently alter KOREAN_GR_PRESETS keys (program-track-selector depends on them).
- **Fitness functions**: displayed rate === rate used in NPV for every preset; single electricity-price constant; every per-unit cost has a source annotation; loan cap enforced or flagged in results.

## 4. Evaluation (EDD)
- **Tests to write first (TDD)**: economic-model tests — loan-term vs permanent buy-down delta; feed-in flat-escalation split; degradation year-N check; heat-pump blended escalation; effectiveDiscountRate display consistency test for both components.
- **Gates**: `pnpm test -- retrofit economic solar roi`; `pnpm test`; `pnpm lint`; `pnpm build`.
- **Security / honesty checklist**: no fabricated tariff/price sources — annotate as "assumption" where no citation exists; NPV changes disclosed in PR (before/after for the reference scenario).
- **Acceptance criteria**:
  - [ ] (a) loan-term-scoped buy-down
  - [ ] (b) UI shows effective rate
  - [ ] (c) feed-in un-escalated + degradation
  - [ ] (d) unified price
  - [ ] (e) blended heat-pump escalation
  - [ ] (f) sourced cost annotations
  - [ ] (g) versioned program parameters + cap handling
- **Done when**: private-track NPV follows the 2026 program rules, the UI's displayed rate matches the computed rate, and every cost input has a stated basis.
