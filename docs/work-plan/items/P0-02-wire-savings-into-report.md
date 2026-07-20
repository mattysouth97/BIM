---
id: P0-02
title: Wire scenario savings (NPV/IRR/payback) into report outputs
priority: P0
area: report
status: not-started
owner: unassigned
effort: M
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-06, UC-08]
---

# P0-02 — Wire scenario savings (NPV/IRR/payback) into report outputs

## 1. Requirement (RE)

- **Problem**: The retrofit savings the user simulates never reach any report — the
  product's core promise dead-ends before export.
  - `src/components/report/report-stage.tsx:7-36` — imports `app-store`, `material-store`,
    `recipe-store`, energy hooks… but **never** `scenario-store`. The only scenario-store
    consumers in the repo are `src/components/twin/twin-stage-overlay.tsx` and
    `src/components/workspace/scene-outliner.tsx` (verified by grep for `scenario-store`).
  - `src/lib/report/templates/energy-audit.ts:50-55` — `EnergyAuditInput.retrofitSummary`
    exists, but the sole producer site (`report-stage.tsx:221-278`) never sets it, so every
    report falls into the else-branch at `energy-audit.ts:251-259` and prints
    *"No retrofit analysis available. Upgrade to Fidelity Level 2 or higher…"* (`:257`).
  - `report-stage.tsx:237,326,347,384` — `fidelityLevel: 1` is hardcoded in all four places
    (energy-audit input, energy PDF, compliance PDF, CSV export).
  - `src/lib/report/report-engine.ts:246-310` — `assembleRetrofitReport` renders simple
    payback only; the DCF layer that `retrofit-report.ts:96-118` already aggregates
    (`portfolioNpv`, `portfolioEffectiveCapex`) is never rendered — no NPV, no IRR, no
    subsidy-adjusted CAPEX anywhere in PDF output. (Note: this `assembleRetrofitReport`
    currently has no callers — `scene-outliner.tsx:297` uses the same-named function from
    `src/lib/retrofit/retrofit-report.ts:51`.)
  - Dishonest zeros: `src/lib/retrofit/retrofit-report.ts:77-78` sets `portfolioPayback = 0`
    when `totalAnnualCostSaving <= 0`, and `:86` sets `cumulativePayback = 0` likewise;
    `report-engine.ts:264` then renders `` `${fmt(0)}년` `` → **"0.0년" instant payback** in
    the PDF next to label `포트폴리오 회수 기간`.
- **Impact**: A user who runs the CAPEX/ROI simulator and downloads the energy-audit or
  retrofit PDF gets a document claiming no analysis exists — or worse, a 0-year payback —
  making every exported report wrong for its primary decision (investment justification).
- **Use case**: As a building owner, I want the PDF/CSV/JSON report to carry the same
  NPV, IRR, discounted payback, subsidy-adjusted CAPEX, and selected measures I see in
  the twin-stage simulator, so that the exported document supports my 그린리모델링
  investment decision.

## 2. Specification (SDD)

- **Context pack** (read first, in order):
  1. `src/store/scenario-store.ts` (63 lines) — `capexBudgetKrw`, `programTrack`, `buildingInputs` published by the twin stage.
  2. `src/hooks/use-retrofit-scenario.ts:266-273` — returns `{ allMeasures (financials-enriched), selection: BudgetSelection | null, assumptions, energyImprovementFraction, suggestedPrivateTrack }`.
  3. `src/lib/retrofit/economic-model.ts:104-117` (`MeasureFinancials`: `npv`, `irr: number | null`, `discountedPayback`, `effectiveCapex`) and `:330-340` (`BudgetSelection`: aggregate `npv`, `effectiveCapex`, discounted payback).
  4. `src/lib/report/templates/energy-audit.ts:40-56,229-260` — `retrofitSummary` shape and the section-8 producer.
  5. `src/lib/report/report-engine.ts:44-49` (`assembleEnergyAuditReport` signature — takes no retrofit input today) and `:246-321` (`assembleRetrofitReport`).
  6. `src/lib/retrofit/retrofit-report.ts:72-94` — payback computation producing the dishonest zeros.
  7. `src/components/report/report-stage.tsx:220-390` — all four export paths.
  8. `src/hooks/use-actual-energy.ts:58` — actual-consumption query; empty array = no measured data (fidelity signal).
- **BDD scenarios**:
  1. *Savings in energy-audit report*: Given a loaded building with `scenario-store.buildingInputs` published and a non-empty knapsack selection, When the energy-audit preview/PDF is produced, Then section 8 renders the measures table with real values (not the "No retrofit analysis" fallback), including portfolio NPV, IRR, discounted payback, and subsidy-adjusted (effective) CAPEX.
  2. *Zero-savings honesty*: Given selected measures whose `totalAnnualCostSaving` is 0, When the retrofit summary is built, Then payback fields are `null` (not 0, not `Infinity`) and every rendered surface prints a dash or `회수 불가`/`N/A` — never a string starting with `0` followed by `년` as a payback claim.
  3. *No scenario published*: Given `buildingInputs` is null (user jumped straight to report), When the report renders, Then the retrofit section shows the existing "No retrofit analysis available" fallback (unchanged behavior) and no fabricated numbers appear.
  4. *Fidelity honesty*: Given only public-ledger data (no actual energy rows, no calibration), When exports are produced, Then `fidelityLevel` is 1; given actual energy rows present, Then 2; given a calibration result present, Then 3 — consistently across preview, PDF, and CSV.
  5. *Export parity*: Given the same building state, When CSV and JSON exports are produced, Then the retrofit financials present in the PDF are also present (CSV: new columns; JSON: new field in `generateTwinJSON` output or a documented omission with a `retrofit: null` marker — pick one, document in PR).

## 3. Constraints (CDD)

- **Design constraints**:
  - Single source: `ReportStage` must consume `useScenarioStore` + `useRetrofitScenario` (same hook the twin stage uses) rather than re-deriving engine inputs. If `scenario-store.buildingInputs` is null, pass no retrofit data (fallback branch).
  - Extend `EnergyAuditInput.retrofitSummary` (`energy-audit.ts:50-55`) additively: optional `npv?: number | null`, `irr?: number | null`, `discountedPayback?: number | null`, `effectiveCapex?: number`. Do not break the existing required fields (`totalInvestment`, `totalAnnualSaving`, `payback`, `topMeasures`).
  - `assembleEnergyAuditReport` (`report-engine.ts:44-49`) gains an optional trailing parameter for the retrofit summary; keep existing call sites compiling (optional param only).
  - Payback type change: `portfolioPayback` / `cumulativePayback` become `number | null` in `src/lib/retrofit/retrofit-types.ts` and `retrofit-report.ts`; `null` when savings ≤ 0. **Do not use `Infinity`** — it is not JSON-serializable (serializes to `null` silently, corrupting exports).
  - Renderers (`report-engine.ts:264,281,306`, `energy-audit.ts:235,247`, and any preview component touching payback) must format `null` as `N/A` (EN) / `회수 불가` (KO) — no `0.0년`.
  - Fidelity mapping (document it in code): `3` if `calibration` result exists; else `2` if `useActualEnergy` returned ≥1 row; else `1`. Apply in all four `report-stage.tsx` sites via one shared derivation.
  - NPV/IRR/effective-CAPEX rows in `assembleRetrofitReport` render only when the underlying values exist (`retrofit-report.ts:117-118` already makes them conditional) — no fabricated placeholders.
- **May touch**:
  - `src/components/report/report-stage.tsx`
  - `src/lib/report/templates/energy-audit.ts`
  - `src/lib/report/report-engine.ts`
  - `src/lib/retrofit/retrofit-report.ts`, `src/lib/retrofit/retrofit-types.ts`
  - `src/lib/export/csv-export.ts`, `src/lib/export/json-export.ts` (additive fields only)
  - `src/components/report/energy-audit-preview.tsx` (render new fields)
  - tests under `src/lib/report/__tests__/`, `src/lib/retrofit/__tests__/`, `src/components/report/__tests__/` (all currently absent — create as needed)
- **Must not**:
  - Do not change knapsack selection logic, `computeFinancials`, or any physics in `economic-model.ts` / `use-retrofit-scenario.ts`.
  - Do not publish to `scenario-store` from `ReportStage` (read-only consumer).
  - Do not change the compliance report sections or certification scoring.
  - No new runtime dependencies.
- **Fitness functions**:
  - `grep "fidelityLevel: 1" src/components/report/report-stage.tsx` → zero matches.
  - `grep -n "portfolioPayback" src/lib/retrofit/retrofit-report.ts` shows no `: 0` fallback for the zero-savings case.
  - Built `ReportData` JSON (`JSON.stringify`) contains no `Infinity`/`NaN` tokens.
  - With a mocked non-empty selection, the assembled energy-audit `ReportData` contains a section titled `Retrofit Recommendations` whose content is a `table` (not the `text` fallback).
  - No `"use client"` added under `src/lib/**`.

## 4. Evaluation (EDD)

- **Tests to write first (TDD)**:
  - `src/lib/retrofit/__tests__/retrofit-report.test.ts` (extend existing): zero-savings measures ⇒ `portfolioPayback === null` and every `cumulativePayback === null`; with financials present ⇒ `portfolioNpv`/`portfolioEffectiveCapex` still aggregated (`:96-118` behavior preserved).
  - `src/lib/report/__tests__/report-engine.test.ts` (new): `assembleRetrofitReport` with `portfolioPayback: null` renders no `0.0년`; with NPV/effective CAPEX present, the summary section includes those rows; `assembleEnergyAuditReport` with a retrofit summary argument includes the measures table.
  - `src/lib/report/__tests__/energy-audit-template.test.ts` (new): `buildEnergyAuditSections` with `retrofitSummary` (incl. NPV/IRR) renders the table branch; without it renders the `:257` fallback text unchanged.
  - `src/components/report/__tests__/report-stage.test.tsx` (new): mock `useScenarioStore` + `useRetrofitScenario` + energy hooks; assert the assembled `energyAuditInput.retrofitSummary` is populated when a selection exists and absent when `selection` is null; assert derived `fidelityLevel` follows the 1/2/3 mapping.
- **Gates**:
  - `pnpm test -- retrofit`
  - `pnpm test -- report`
  - `pnpm test` (full suite)
  - `pnpm lint && pnpm build`
- **Security / honesty checklist**:
  - Zero-savings ⇒ null/absent payback everywhere; no "instant payback" string reachable.
  - No `Infinity`/`NaN` in any export payload.
  - `fidelityLevel` derives from actual data availability; nothing hardcoded.
  - Numbers in the report are the same store/hook values the simulator UI displays (no re-derivation drift).
- **Acceptance criteria**:
  - [ ] `ReportStage` consumes `useScenarioStore`/`useRetrofitScenario`; energy-audit section 8 shows real measures when a selection exists.
  - [ ] PDF/CSV/JSON carry NPV, IRR, discounted payback, effective CAPEX when available.
  - [ ] Zero-savings payback renders as `N/A`/`회수 불가` in all renderers.
  - [ ] `fidelityLevel` honestly reflects data tier in preview, PDF, and CSV.
  - [ ] All new + existing tests, lint, build green.
- **Done when**: An exported energy-audit PDF for a building with an active scenario shows the same financials as the twin-stage simulator, and zero-savings cases never print a 0-year payback.
