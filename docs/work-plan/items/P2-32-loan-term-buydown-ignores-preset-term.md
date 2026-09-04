---
id: P2-32
title: Interest-support buy-down amortizes over a hardcoded 5 years, ignoring the preset's 10-year loan term
priority: P2
area: retrofit
status: not-started
owner: unassigned
effort: S
created: 2026-09-04
updated: 2026-09-04
use_cases: [UC-06, UC-07]
---

# P2-32 — The buy-down schedule ignores `loanTermYears`

Found by the refactor session (orange) on 2026-09-04 while removing duplication
in `src/lib/retrofit/economic-model.ts`. **Deliberately not fixed there:** that
work was a no-behaviour-change refactor, and this changes numbers.

## 1. Requirement (RE)

- **Problem.** `computeInterestSavedSchedule` (src/lib/retrofit/economic-model.ts)
  amortizes the 그린리모델링 이자지원 buy-down over the module constant
  `LOAN_TERM_YEARS = 5` and never reads `financingMix.loanTermYears`. All three
  private-track presets set `loanTermYears: GR_PRIVATE_LOAN_TERM_YEARS`, and
  **that constant is 10, not 5** (src/lib/retrofit/cost-database.ts:117). So the
  engine values a 10-year interest subsidy as a 5-year one.

- **This is live, not dormant.** It was first reported as a trap armed for a
  future non-5-year program; that was wrong, and the correction is the point of
  this item. Measured on `KOREAN_GR_PRIVATE_BASE` with ₩100,000,000 effective
  CAPEX (debtFraction 0.7, loanRatePreSubsidy 0.055, interestSupportPp 0.045):

  | | schedule | total interest saved (undiscounted) |
  |---|---|---|
  | today | ₩3.15M, 2.52M, 1.89M, 1.26M, 0.63M, then zero from year 6 | **₩9,450,000** |
  | over the declared 10-year term | equal-principal across 10 years | **₩17,325,000** |

  The model captures ~55% of the declared program benefit. `subsidyValue` is an
  additive term in NPV, so **private-track NPV is understated** — the error is
  directional, not noise, and it always understates.

- **`loanTermYears`' numeric value is read nowhere.** The only surviving read is
  a presence check at economic-model.ts:627 (`=== undefined`) selecting the
  legacy permanent-WACC comparison path. The field P2-10 (a) introduced now
  functions purely as a boolean flag.

- **How it got here.** P2-10 (a) implemented the loan-term scoping as a per-year
  discount schedule in `buildDiscountFactors` (subsidized WACC during the term,
  equity rate after). A later audit correction replaced the blended-WACC model
  with the additive `subsidyValue` approach and made `effectiveDiscountRate`
  return the base rate unchanged — which silently neutered that schedule (both
  sides of its ternary began reading the same number). The replacement mechanism,
  `computeInterestSavedSchedule`, was written against the constant rather than
  the field. The dead branch was removed in `7aedbf6`; this item is the other
  half of that story.

- **Use case.** As an analyst on the 민간 이자지원 track I want the buy-down valued
  over the loan term the preset declares, so the NPV I present matches the program.

## 2. Specification (SDD)

- **Context pack**: `economic-model.ts` — `FinancingMix.loanTermYears` (and its doc
  comment, which already promises this behaviour), `LOAN_TERM_YEARS`,
  `computeInterestSavedSchedule`, `computeFinancials`; `cost-database.ts:110-220`
  (`GR_PRIVATE_LOAN_TERM_YEARS` and the three presets); `docs/superpowers/research/2026-04-30-green-remodeling.md` §3 for the program's actual term and amortization.
- **BDD scenarios**:
  1. Given a `financingMix` with `loanTermYears: 10` and a 20-year horizon, When
     the schedule is built, Then it is non-zero for years 1-10 and zero after.
  2. Given `loanTermYears: 3`, Then the schedule is non-zero for years 1-3 only.
  3. Given a `loanTermYears` longer than the horizon, Then the schedule is
     truncated at the horizon and never indexes past it.
  4. Given `loanTermYears` omitted, Then the legacy permanent-WACC path is
     unchanged — this item must not disturb the P2-10 comparison path.

## 3. Constraints (CDD)

- **Confirm the term before changing the number.** `GR_PRIVATE_LOAN_TERM_YEARS`
  carries the comment "Adjust when the program portal publishes the term", so 10
  is itself an assumption. Verify against the dossier; if 10 is wrong, fix the
  constant in the same change and say so.
- Decide explicitly whether `LOAN_TERM_YEARS = 5` should remain as a default for
  a `financingMix` without a term, or be deleted. It is exported, so removing it
  is an API change.
- Equal-principal amortization is the model's own convention, not a program rule
  — keep it unless the dossier says otherwise, and don't quietly switch to
  annuity while fixing the term.
- **Must not**: change `MeasureFinancials`/`BudgetSelection` shapes; change energy
  demand; touch the UI.

## 4. Evaluation (EDD)

- **Red test first**: a preset with `loanTermYears: 10` asserting a 10-year
  non-zero schedule — it fails today at year 6.
- **Disclose the NPV delta.** This moves published private-track numbers upward.
  Record before/after NPV for the reference scenario in the PR, the way P2-10 did.
- **Gates**: `node node_modules/vitest/vitest.mjs run src/lib/retrofit`,
  `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js src`.
- **Acceptance criteria**:
  - [ ] `computeInterestSavedSchedule` honours `financingMix.loanTermYears`
  - [ ] The horizon-truncation and omitted-term paths keep their current behaviour
  - [ ] `GR_PRIVATE_LOAN_TERM_YEARS` verified against the research dossier
  - [ ] NPV before/after disclosed for the reference private-track scenario
- **Done when**: the buy-down is valued over the term the preset declares, and no
  code path reads `loanTermYears` as a mere flag.

## Notes

- Not scheduled onto the dashboard by this item's author: `docs/work-plan/README.md`
  is another session's lock, so the P2-32 row is added there separately.
