---
id: P2-02
title: Per-fuel CO2 factors and fuel-split demand result
priority: P2
area: energy
status: done
owner: claude-opus-4-8-ultrawork
effort: S
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-07, UC-08]
---

# P2-02 — Per-fuel CO2 factors and fuel-split demand result

## 1. Requirement (RE)
- **Problem**: `calculateCO2` (src/lib/energy/co2-emissions.ts:25-26) multiplies TOTAL demand by the grid electricity factor 0.4594 tCO2/MWh (:7), including gas-fired heating whose factor is ~0.20. The proportionality test (src/lib/energy/__tests__/bim-accuracy.test.ts:263-269, "Linear CO2 calculation means these ratios should be equal") entrenches the single-factor design. Separately, renewables never offset primary energy: factor 0.0 makes `primaryRenewable` always 0 (src/lib/energy/primary-energy.ts:10,65) so the subtraction at :59,68 is a no-op.
- **Impact**: emissions and "CO2 saved" claims are overstated for gas-heated stock (the dominant Korean residential case); on-site solar shows zero primary-energy benefit.
- **Use case**: As a report reader I want CO2 computed per fuel with correct factors so that savings claims for gas-heated buildings are not inflated.

## 2. Specification (SDD)
- **Context pack** (read in order): src/lib/energy/co2-emissions.ts; src/lib/energy/annual-demand.ts (demand breakdown by system/fuel); src/lib/energy/primary-energy.ts:44-93; src/lib/retrofit/cost-database.ts:201-209 (per-fuel `CO2_FACTORS` ALREADY EXIST: electricity 0.4594, gas 0.2018, districtHeating 0.3200 — reuse, do not duplicate); src/lib/energy/__tests__/bim-accuracy.test.ts:240-270.
- **BDD scenarios**:
  1. Given demand split electric/gas, When CO2 is computed, Then totalCO2 = electric×0.4594 + gas×0.2018 (per MWh) and is lower than the old single-factor result for gas-dominated buildings.
  2. Given 100% electric demand, When computed, Then result equals the legacy factor path (no regression for all-electric stock).
  3. Given renewable generation R kWh, When primary energy is computed, Then delivered total and primary total decrease by R and R×(electricity factor) respectively instead of 0.
  4. Given a building with no fuel split available, When computed, Then the function falls back to the documented all-electric assumption with an explicit `assumption` flag on the result.
- The `AnnualDemand` result must expose a per-fuel demand split (heating/DHW vs cooling/lighting/equipment) so CO2 is not re-derived from a flat total.

## 3. Constraints (CDD)
- **Design constraints**: single source of truth for factors — import `CO2_FACTORS` from src/lib/retrofit/cost-database.ts or move it to a shared src/lib/energy module; pure functions; update the bim-accuracy proportionality test to per-fuel expectations rather than deleting the coverage.
- **May touch**: src/lib/energy/co2-emissions.ts, annual-demand.ts, primary-energy.ts, src/lib/retrofit/cost-database.ts (factor relocation only), src/lib/energy/__tests__/**, consumers of `CO2Result`/`PrimaryEnergyResult` (type-shape updates only).
- **Must not**: change energy prices, escalation, or the retrofit economic model (P2-10 scope); no UI copy changes claiming specific % improvements.
- **Fitness functions**: exactly one definition of each CO2 factor in the repo; `CO2Result` carries a per-fuel breakdown; renewable offset reduces primary energy in tests.

## 4. Evaluation (EDD)
- **Tests to write first (TDD)**: src/lib/energy/__tests__/co2-emissions.test.ts — scenarios 1-4; extend bim-accuracy.test.ts:263-269 to per-fuel proportionality (electric ratio tracks electric factor, gas ratio tracks gas factor); primary-energy.test.ts — renewable offset case.
- **Gates**: `pnpm test -- co2 primary-energy bim-accuracy`; `pnpm test`; `pnpm lint`; `pnpm build`.
- **Security / honesty checklist**: every factor carries a source comment (grid 2023 average, gas, district heating); fallback path is flagged, never silent; no rounding that hides the gas/electric difference.
- **Acceptance criteria**:
  - [x] CO2 computed per fuel with shared factors
  - [x] Per-fuel demand split on the demand result
  - [x] Renewable offset actually reduces primary energy
  - [x] Proportionality test rewritten, coverage preserved
- **Done when**: a gas-heated reference building's reported CO2 drops to the gas-factor value and all downstream "CO2 saved" numbers flow from the per-fuel total.

### Evaluation notes (2026-07-21, claude-opus-4-8-ultrawork)

- **Single source of truth**: `CO2_FACTORS` moved to new `src/lib/energy/co2-factors.ts`;
  `retrofit/cost-database.ts` re-exports it (retrofit imports unchanged); grep confirms
  exactly one `export const CO2_FACTORS`. `KOREAN_GRID_EMISSION_FACTOR` is now an alias of
  `CO2_FACTORS.electricity` (no duplicate 0.4594 literal).
- `AnnualDemand` gains optional `fuelDemand { electricKwh, fossilKwh, fossilFuel }` — cooling
  is electric; heating follows `hvac.heating.fuelType` (electric/heat-pump→electric bucket;
  district-heat→districtHeating; gas/oil→gas, oil proxied per P1-03). `calculateCO2` charges
  each fuel its own factor and returns `electricCO2`/`fossilCO2`; absent split → all-electric
  fallback with an explicit `assumption` flag (never silent).
- **Renewable offset**: `PRIMARY_ENERGY_FACTORS.renewable` 0.0 → 2.75 (displaces grid
  electricity); stored as a negative offset so primary total drops by R×2.75 and the field
  reads ≤ 0.
- **Justified test updates** (coverage preserved, not deleted): (1) the bim-accuracy
  proportionality test rewritten to per-fuel component checks; (2) its "CO2 > 100 kg/m²"
  threshold lowered to 60 — the honest gas-heated value is ~72 (was inflated by the grid
  factor); (3) the primary-energy "renewable factor is zero" test rewritten to assert the
  offset. Existing hand-built `AnnualDemand` literals (no `fuelDemand`) exercise the
  fallback and stayed green.
- Gates: `vitest run co2 primary-energy bim-accuracy` 30/30 · `pnpm test` **1104 passed /
  1 skipped** · `pnpm lint` 0 errors · `pnpm build` green.
