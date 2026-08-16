---
id: P1-05
title: Fix benchmark unit mismatch and retire dual grading scales
priority: P1
area: energy
status: done
owner: claude-fable-5-ultrawork
effort: M
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-03, UC-08]
---

# P1-05 — Fix benchmark unit mismatch and retire dual grading scales

## 1. Requirement (RE)

- **Problem A — benchmark compared in the wrong unit.** The benchmark dataset is
  documented as *primary* energy: `src/lib/energy/benchmark-database.ts:3`
  ("Values are kWh/m²/year for primary energy demand by use type and era") and
  `compareToBenchmark`'s contract repeats it: `src/lib/energy/benchmark-comparison.ts:151`
  ("@param demand  Annual primary energy demand in kWh/m²/year"). Both call sites
  pass `metrics.demand.demandPerSqm`, which is **delivered** energy (heating +
  cooling + auxiliaries) straight out of `calculateAnnualDemand`:
  - `src/components/report/report-stage.tsx:164` — `compareToBenchmark(metrics.demand.demandPerSqm, useType, era)`
  - `src/components/workspace/properties-panel.tsx:185` — same call
    (path correction: brief said `src/components/building/properties-panel.tsx`;
    the file actually lives at `src/components/workspace/properties-panel.tsx`).
  With electricity-weighted primary conversion (factor 2.75,
  `src/lib/energy/primary-energy.ts:6`), delivered ≈ primary / ~2–2.75, so every
  building lands ~2–3 benchmark bands better than reality (e.g. a delivered
  120 kWh/m² office compares against the p25=130 "2010s office" band as
  "efficient", while its real primary intensity ≈ 250–300 kWh/m² sits above p75).
- **Problem B — two disagreeing grading scales are live.** The legacy
  `GRADE_THRESHOLDS` (60/90/120/150/190/230/270/320/370,
  `src/lib/energy/energy-grade.ts:39-49`) is applied to **delivered** energy with
  no building-type split in `useEnergyMetrics`
  (`src/hooks/use-energy-metrics.ts:97` — `getEnergyGrade(demand.demandPerSqm)`)
  and is what users see as `metrics.grade` in the status bar
  (`src/components/workspace/status-bar.tsx:90`), report
  (`src/components/report/report-stage.tsx:177,249,377`), properties panel
  (`src/components/workspace/properties-panel.tsx:200`), ECO2 export
  (`src/lib/energy/eco2-export.ts:271`), and PDF report engine
  (`src/lib/report/report-engine.ts:59`). Meanwhile the official MOTIE/KEMCO
  primary-energy tables with a residential/non-residential split already exist
  (`src/lib/compliance/efficiency-rating.ts:34-59`,
  `RESIDENTIAL_THRESHOLDS` / `NON_RESIDENTIAL_THRESHOLDS`) and disagree — e.g.
  grade "2" boundary is 190 (legacy, delivered, any type) vs 200 (residential
  primary) vs 320 (non-residential primary). The same building can render two
  different grades in adjacent panels (status bar vs the efficiency-rating
  section computed at `report-stage.tsx:197-207`).
- **Impact**: Users are told their building outperforms peers when it does not
  (greenwashed retrofit baseline → wrong savings narrative), and see two
  contradictory official-looking grades for the same building, destroying trust
  in the report/PDF output.
- **Use case**: As a retrofit consultant, I want the benchmark percentile and the
  displayed energy grade to be computed in primary energy against the official
  MOTIE/KEMCO tables, so that the peer comparison and the grade I put in client
  reports match the certification standard.

## 2. Specification (SDD)

- **Context pack** (read in this order):
  1. `src/lib/energy/benchmark-database.ts` (primary-energy contract, :3)
  2. `src/lib/energy/benchmark-comparison.ts` (`compareToBenchmark`, :148-196)
  3. `src/lib/energy/primary-energy.ts` (`calculatePrimaryEnergy`, :44-93; factors :5-11)
  4. `src/lib/compliance/efficiency-rating.ts` (official tables :34-59; `calculateEfficiencyRating` :106-133)
  5. `src/hooks/use-energy-metrics.ts` (grade at :97; `EnergyMetrics` shape :22-34)
  6. `src/components/report/report-stage.tsx` (benchmark :146-165; existing `calculateEfficiencyRating` call :187-208 — reuse its delivered-by-fuel derivation)
  7. `src/components/workspace/properties-panel.tsx` (benchmark :166-186; grade use :200)
  8. `src/lib/energy/energy-grade.ts` (legacy scale to retire from user-facing path)
  9. `src/lib/layers/energy-heatmap-builder.ts` (:27-31 — uses `getEnergyGrade` purely as a color ramp; decide deliberately, see Constraints)
- **Design**: Introduce one derived value — primary energy per m² — computed via
  `calculatePrimaryEnergy` from the same fuel split already used at
  `report-stage.tsx:197-207` (`electric = coolingDemand + totalDemand*0.15`,
  `gas = heatingDemand + totalDemand*0.1`, district/renewable = 0). Feed that
  value to `compareToBenchmark`. For grading, make `useEnergyMetrics` return the
  official `calculateEfficiencyRating` result (grade + label + per-area primary)
  as the user-facing grade, with building type derived from
  `materials.occupancy.occupancyDensity > 0.1` exactly as the existing call sites
  already do (`report-stage.tsx:194-196`, `properties-panel.tsx:169-173`) —
  factor that derivation into one shared helper to avoid a third copy.
- **BDD scenarios**:
  1. *Given* an office with delivered `demandPerSqm` = 120 and derived primary
     per-area = 300, *when* `compareToBenchmark` is called from the report stage,
     *then* it receives 300 (not 120) and classifies against the office bands
     accordingly (`performance` reflects the primary value).
  2. *Given* a residential building (`occupancyDensity > 0.1`) whose primary
     per-area is 190, *when* metrics are computed, *then* the displayed grade is
     "2" per `RESIDENTIAL_THRESHOLDS` (`efficiency-rating.ts:34-44`), and the
     status bar, properties panel, and PDF report render the **same** grade.
  3. *Given* the same primary per-area 190 for a non-residential building,
     *when* metrics are computed, *then* the grade is "1" per
     `NON_RESIDENTIAL_THRESHOLDS` (`efficiency-rating.ts:46-59`) — proving the
     building-type split is active.
  4. *Given* a building with zero/negative total floor area or missing
     materials, *when* metrics are computed, *then* no grade/benchmark is
     rendered (null path preserved) instead of a fabricated grade.
  5. *Given* the legacy `getEnergyGrade`, *when* the refactor lands, *then* no
     user-facing component imports it (only the heatmap color ramp may keep it,
     per Constraints) and `metrics.grade` type is the official `EfficiencyGrade`.

## 3. Constraints (CDD)

- **Design constraints**:
  - Single source of truth: primary conversion MUST go through
    `calculatePrimaryEnergy` (`src/lib/energy/primary-energy.ts:44`) and grading
    through `calculateEfficiencyRating` (`src/lib/compliance/efficiency-rating.ts:106`).
    Do not hand-inline conversion factors at call sites.
  - Reuse the existing fuel-split derivation; extract it into a small pure
    helper (e.g. `src/lib/energy/delivered-from-demand.ts`) so report-stage,
    properties-panel, and use-energy-metrics share one implementation.
  - Building-type detection (`occupancyDensity > 0.1`) must be extracted to one
    shared helper; three divergent copies must not survive this change.
  - `EnergyMetrics` (`src/hooks/use-energy-metrics.ts:22-34`) may change shape
    (e.g. replace `grade: EnergyGrade` with the official grade + keep
    `gradeColor`), but every consumer listed in RE Problem B must be updated in
    the same commit — no mixed-scale UI.
  - The 3D heatmap color ramp (`src/lib/layers/energy-heatmap-builder.ts:31`)
    takes raw kWh/m² values and needs a continuous color scale, not the official
    grade; it MAY keep `getEnergyGrade`/`getGradeColor` as an internal color
    ramp, but `energy-grade.ts` must be clearly marked "internal color scale,
    not the official rating" to prevent re-use in UI.
  - Do not change the benchmark dataset values themselves; the fix is unit
    correctness at the call sites, not data edits. (Relabeling the table to
    "delivered" is explicitly rejected — the KEMCO source data is primary.)
- **May touch**:
  - `src/hooks/use-energy-metrics.ts`
  - `src/components/report/report-stage.tsx`
  - `src/components/workspace/properties-panel.tsx`
  - `src/components/workspace/status-bar.tsx`
  - `src/lib/energy/energy-grade.ts` (doc/deprecation only)
  - `src/lib/report/report-engine.ts`, `src/lib/energy/eco2-export.ts` (grade field type)
  - New: `src/lib/energy/delivered-from-demand.ts` (or similar) + its test
  - Tests under `src/lib/energy/__tests__/`, `src/hooks/__tests__/`
- **Must not**:
  - Do not modify `BENCHMARK_DATA` values in `benchmark-database.ts`.
  - Do not change `PRIMARY_ENERGY_FACTORS` or the official threshold tables.
  - Do not touch the workflow/merge logic (that is P1-08 scope) — if
    `use-energy-metrics.ts` merge duplication tempts you, note it and move on.
  - No new `'use client'` directives in `src/lib/**` (libs stay pure).
- **Fitness functions**:
  - `grep -rn "getEnergyGrade" src/components src/hooks src/lib/report src/lib/energy/eco2-export.ts` → 0 matches.
  - `grep -n "compareToBenchmark(metrics.demand.demandPerSqm" -r src` → 0 matches.
  - `compareToBenchmark` is only ever called with a value produced by
    `calculatePrimaryEnergy` (verifiable by reading the two call sites).
  - Status bar grade === properties-panel grade === PDF report grade for a
    fixed building (one computation path).

## 4. Evaluation (EDD)

- **Tests to write first (TDD)**:
  - `src/lib/energy/__tests__/delivered-from-demand.test.ts` (new): fuel-split
    helper maps `AnnualDemand` → `DeliveredEnergy` exactly as
    `report-stage.tsx:197-207` does today; primary per-area matches hand-computed
    value (e.g. cooling=40k, heating=60k, total=150k on 1000 m² →
    electric=62.5k, gas=75k → primary = 62.5k×2.75 + 75k×1.1 = 254 375 kWh →
    254.375 kWh/m²).
  - Extend `src/lib/energy/__tests__/benchmark-comparison.test.ts`: document via
    a test that `compareToBenchmark` receives primary values in integration (a
    test around the new call path, e.g. a `useEnergyMetrics`-level test or a
    pure-function test of the new "benchmark input" helper).
  - `src/hooks/__tests__/use-energy-metrics.test.ts` (new or extend): grade
    field equals official `calculateEfficiencyRating` result for residential
    and non-residential fixtures; `grade` changes across the building-type
    split for identical demand.
  - Update `src/lib/energy/__tests__/energy-grade.test.ts` and
    `bim-accuracy.test.ts:275-285` expectations if the public surface of
    `energy-grade.ts` changes (keep the internal ramp tested).
- **Gates**:
  - `pnpm test -- src/lib/energy src/hooks src/lib/compliance`
  - `pnpm test` (full 902-test suite stays green)
  - `pnpm lint`
  - `pnpm build`
- **Security / honesty checklist**:
  - No fabricated benchmark or threshold values; all numbers trace to
    `benchmark-database.ts` / `efficiency-rating.ts`.
  - UI must label the benchmark "primary energy" (it already claims to be —
    after the fix the claim becomes true).
  - Where actual consumption data is absent, keep null paths — never synthesize
    a grade.
- **Acceptance criteria**:
  - [x] `compareToBenchmark` receives primary kWh/m² at both call sites
        (`report-stage.tsx`, `properties-panel.tsx`).
  - [x] One shared fuel-split helper; one shared building-type helper.
  - [x] `metrics.grade` (or its replacement) is the official
        `calculateEfficiencyRating` grade; identical across status bar,
        properties panel, report, PDF.
  - [x] Legacy delivered-energy grade no longer rendered in any user-facing
        component; `energy-grade.ts` documented as internal color ramp.
  - [x] New/updated tests pass; full suite, lint, build green.
- **Done when**: a building's benchmark band and displayed grade are both
  computed from primary energy via the official tables, and only one grading
  scale is visible anywhere in the UI.

### Evaluation notes (2026-07-21, claude-fable-5-ultrawork)

- New `src/lib/energy/delivered-from-demand.ts`: `deliveredFromDemand` (fuel split kept
  verbatim from report-stage), `isResidentialOccupancy`, `buildingTypeFromMaterials` —
  now the only implementations (three divergent copies removed).
- `useEnergyMetrics.grade` is the official `calculateEfficiencyRating` grade (type
  `EfficiencyGrade`, literal-compatible with the legacy union so every consumer —
  status bar, PDF engine, ECO2 export, certification input — compiled without shape
  churn); new `metrics.primaryEnergyPerArea` backs both grade and benchmark. Zero/neg
  floor area now returns null (no fabricated "1+++").
- Both benchmark call sites pass `metrics.primaryEnergyPerArea`. **Additional in-scope
  fix found during implementation**: `BuildingCertificationInput.primaryEnergyDemand`
  was receiving *delivered* `demandPerSqm` in both panels — same unit-mismatch class;
  now receives the primary intensity (noted here as it slightly shifts G-SEED scores
  toward honesty).
- `energy-grade.ts` re-headed as "internal color scale — NOT the official rating";
  heatmap keeps it as its color ramp per the constraint; `getGradeColor` reused for
  badge colors only.
- Gates: targeted `delivered-from-demand use-energy-metrics` 11/11 · fitness greps 0
  matches (getEnergyGrade in UI paths; demandPerSqm→benchmark) · `pnpm test`
  **1012 passed / 1 skipped** · `pnpm lint` 0 errors · `pnpm build` green.
