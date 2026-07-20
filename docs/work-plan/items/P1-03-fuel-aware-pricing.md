---
id: P1-03
title: Thread heating fuel type into envelope/HVAC generators and price district heating correctly
priority: P1
area: retrofit
status: not-started
owner: unassigned
effort: M
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-06, UC-07]
---

# P1-03 — Thread heating fuel type into envelope/HVAC generators and price district heating correctly

## 1. Requirement (RE)

- **Problem**: All heating-side retrofit savings are priced as natural gas regardless of the building's actual heating fuel. Verified in code:
  1. `generateEnvelopeRetrofits` prices wall/roof/floor savings at `ENERGY_PRICES.gas` (75 KRW/kWh) — `src/lib/retrofit/envelope-retrofits.ts:60, :80, :122` — and applies `CO2_FACTORS.gas` at :71, :91, :133. (Window replacement uses electricity at :101 as a documented heating+cooling proxy — keep, but see constraints.)
  2. `generateHvacRetrofits` prices boiler-upgrade savings at gas (`src/lib/retrofit/hvac-retrofits.ts:41`), the heat-pump conversion's displaced fuel at gas (:69), and HRV savings at gas (:96), with `CO2_FACTORS.gas` at :42, :74, :97.
  3. `ENERGY_PRICES.districtHeating` (90 KRW/kWh, `src/lib/retrofit/cost-database.ts:196`), `CO2_FACTORS.districtHeating` (0.3200 tCO2/MWh, :208), and the `districtHeating` escalation (:31) exist but are NEVER used by any generator (verified: no reference outside cost-database/economic-model).
  4. Escalation fuel resolution is an ID heuristic: `resolveFuel` (`src/lib/retrofit/economic-model.ts:131-150`) maps `envelope-*`/`hvac-*` → `"gas"` (:142, :146). An explicit override path EXISTS (`measure.fuel`, :132-134; field at `src/lib/retrofit/retrofit-types.ts:31`) but NO generator sets it.
  5. The real fuel information is available but dropped: `use-retrofit-scenario.ts:182` passes `materials.hvac.heating.systemType` into `generateHvacRetrofits` as `heatingType`, yet the generator NEVER READS it (destructures only `heatingEfficiency, age` at hvac-retrofits.ts:33). Worse, the material model carries an even sharper signal the hook never passes at all: `HVACProperties.heating.fuelType: "gas" | "electric" | "oil" | "district-heat" | "heat-pump"` (`src/lib/material-types.ts:88`), alongside `systemType: "individual" | "central" | "district"` (:87).
- **Spot-check corrections**: brief cited only the `systemType` availability — spot-check found `fuelType` (material-types.ts:88) is the primary signal and `systemType` the corroborating one; document updated accordingly. Additional gas-priced line found beyond the brief: hvac-retrofits.ts:69 (heat-pump displaced fuel). All other citations verified exact.
- **Impact**: District-heated buildings — a large share of the Korean multi-family and public stock — get savings priced at 75 instead of 90 KRW/kWh (−17%), CO2 at 0.2018 instead of 0.3200 tCO2/MWh (−37%), and gas escalation instead of district-heat escalation. Payback, NPV, knapsack ranking, and the GR tier hint are all mispriced for exactly the building class 그린리모델링 targets. Electric-heated buildings are equally wrong in the other direction.
- **Use case**: As an analyst modeling a district-heated apartment building, I want envelope and HVAC savings priced and escalated at district-heating rates, so that payback and NPV reflect the building's actual tariff.

## 2. Specification (SDD)

- **Context pack** (read in this order):
  1. `src/lib/material-types.ts:85-107` — `HVACProperties.heating.systemType` + `fuelType` (the source of truth).
  2. `src/lib/retrofit/cost-database.ts:191-209` — `ENERGY_PRICES` / `CO2_FACTORS` (all three fuels exist); :28-32 `ENERGY_ESCALATION`.
  3. `src/lib/retrofit/envelope-retrofits.ts` — full file; gas touchpoints :53-54, :60, :71, :80, :91, :122, :133.
  4. `src/lib/retrofit/hvac-retrofits.ts` — full file; note unused `heatingType` param (:22, :33) and heat-pump dual-fuel structure (:64-75).
  5. `src/lib/retrofit/economic-model.ts:122-150` — `resolveFuel` preference order (explicit `measure.fuel` wins — this is the escalation hook).
  6. `src/hooks/use-retrofit-scenario.ts:144-208` — call sites to thread the fuel through.
  7. `src/lib/retrofit/economic-model.ts` tests for `makeMeasure` patterns.
- **Design (decided)**:
  1. Add a pure exported mapper in a shared spot (economic-model.ts or cost-database.ts): `resolveHeatingFuel(heating: { systemType: string; fuelType: string }): Fuel` — mapping: `fuelType "gas" → "gas"`, `"district-heat" → "districtHeating"`, `"electric" → "electricity"`, `"heat-pump" → "electricity"`, `"oil" → "gas"` (proxy, documented: no oil price in ENERGY_PRICES; gas is the closest KRW/kWh benchmark — comment must say so); `systemType "district"` ⇒ `"districtHeating"` as a corroborating override when `fuelType` is missing/unknown. Default `"gas"` only when both are absent, preserving legacy behavior.
  2. Thread the resolved fuel into generators: add an optional trailing parameter `heatingFuel: Fuel = "gas"` to `generateEnvelopeRetrofits` and `generateHvacRetrofits` (default keeps every existing caller/test green). Inside: replace `ENERGY_PRICES.gas` / `CO2_FACTORS.gas` with `ENERGY_PRICES[heatingFuel]` / `CO2_FACTORS[heatingFuel]` for wall/roof/floor and boiler/HRV. Heat pump: displaced fuel = `heatingFuel`, new fuel = electricity (already correct at :70/:75); when `heatingFuel` is already `"electricity"` or the system is a heat pump, the conversion measure is meaningless — suppress `hvac-heat-pump` when resolved heating fuel is `"electricity"` and document why (nothing to switch from).
  3. Set `measure.fuel = heatingFuel` on every emitted heating-side measure (wall/roof/floor insulation, boiler-upgrade, HRV) so `resolveFuel`'s explicit path (economic-model.ts:132-134) drives escalation with no heuristic change. Keep `envelope-window-replacement` on its documented electricity proxy (:100-101) — leave as-is, but its `fuel` stays unset/electricity per existing heuristic; add a comment cross-referencing this item.
  4. Hook: in `use-retrofit-scenario.ts`, resolve once from `materials.hvac.heating` and pass to both generators.
  5. Do NOT change any price/CO2/escalation constant — the data is already correct; only the selection is wrong.
- **BDD scenarios**:
  1. *District-heated wall insulation* — Given U_wall 0.26→0.15, area 300 m², HDD 2400, η 0.87, `heatingFuel: "districtHeating"`, When `generateEnvelopeRetrofits` runs, Then wall `annualCostSaving` = energySaving × 90 (not 75), `co2Reduction` = energySaving × 0.3200/1000, and `measure.fuel === "districtHeating"`.
  2. *Escalation follows fuel* — Given the measure from (1), When `computeFinancials` runs with `DEFAULT_ECONOMIC_ASSUMPTIONS`, Then `resolvedFuel === "districtHeating"` and year-2 cash flow = year-1 × 1.03 via the districtHeating escalation entry (same 3% today — assert via `resolvedFuel`, not the numeric coincidence).
  3. *Heat pump on district heat* — Given η 0.65 and `heatingFuel: "districtHeating"`, Then `hvac-heat-pump.annualCostSaving` = (D/0.65) × 90 − (D/3.5) × 140, and boiler-upgrade saving is priced at 90.
  4. *Electric-heated building* — Given `fuelType: "electric"` in the material store, When the hook generates measures, Then heating-side measures carry `fuel: "electricity"` and `hvac-heat-pump` is NOT emitted.
  5. *Legacy default* — Given no fuel arguments (existing call signature), Then all outputs are byte-identical to current behavior (regression guard).

## 3. Constraints (CDD)

- **Design constraints**:
  - Backward compatible: new parameters optional with `"gas"` defaults; no existing call site breaks; hook is the only production caller to pass the new argument.
  - Single mapping point: fuel resolution lives in ONE exported function with the mapping table in comments; generators never parse `fuelType`/`systemType` strings themselves.
  - Generators stay pure and synchronous; no store imports inside `src/lib/retrofit/*` (fuel arrives as a plain parameter).
  - Reuse the existing `Fuel` union (`economic-model.ts:28`) — do not create a parallel enum; `fuelType: "oil"` and `"heat-pump"` collapse onto it ONLY inside the mapper.
  - No `'use client'` in `src/lib/**`.
- **May touch**: `src/lib/retrofit/envelope-retrofits.ts`, `src/lib/retrofit/hvac-retrofits.ts`, `src/lib/retrofit/economic-model.ts` (mapper + doc updates to `resolveFuel` comment block), `src/lib/retrofit/cost-database.ts` (only if the mapper is placed there), `src/hooks/use-retrofit-scenario.ts`, tests under `src/lib/retrofit/__tests__/` and the hook's test convention.
- **Must not**: do not change any value in `ENERGY_PRICES`, `CO2_FACTORS`, `ENERGY_ESCALATION`, `RETROFIT_COSTS`; do not alter the window-replacement electricity proxy or the lighting/solar generators (electricity is already correct there); do not touch conflict groups/lifetimes (P1-01/P1-02 scope); do not modify material-types.ts or the material store (read-only consumption).
- **Fitness functions**:
  - No literal `ENERGY_PRICES.gas` or `CO2_FACTORS.gas` remains in envelope-retrofits.ts / hvac-retrofits.ts except inside the `"gas"`-resolved branch (grep-able invariant).
  - For identical inputs, district-heated results differ from gas results ONLY by the price/CO2/escalation ratios (energy kWh savings identical — fuel changes price, not physics).
  - Every heating-side measure emitted carries an explicit `fuel` field; `resolveFuel` heuristic branches (economic-model.ts:138-146) become unreachable for generator-produced measures (assert via `resolvedFuel` in tests).
  - Existing tests unchanged and green (default-argument compatibility).

## 4. Evaluation (EDD)

- **Tests to write first (TDD)**:
  - NEW `src/lib/retrofit/__tests__/heating-fuel.test.ts` (or extend the generator test files from P1-02 if they land first): mapper coverage for all five `fuelType` values + `systemType: "district"` + absent/absent default; scenarios 1–5 above, each with hand-computed arithmetic in comments.
  - Heat-pump suppression test when heating fuel resolves to electricity.
  - Hook-level (or extracted-pure-function) test: material store with `fuelType: "district-heat"` ⇒ generated measures carry `fuel: "districtHeating"` and cost savings use 90 KRW/kWh.
- **Gates**: `pnpm test -- src/lib/retrofit` green; full `pnpm test` green; `pnpm lint` clean; `pnpm build` green.
- **Security / honesty checklist**:
  - The `"oil" → "gas"` proxy and window-replacement electricity proxy MUST be labeled as approximations in code comments — no silent substitutions.
  - Do not fabricate a district-heating tariff: 90 KRW/kWh already exists at cost-database.ts:196; if the implementer believes it is stale, note it in a comment — do not change the constant in this item.
  - kWh energy savings must remain fuel-independent in tests (physics honesty: fuel changes price, not ΔU physics).
- **Acceptance criteria**:
  - [ ] `resolveHeatingFuel` mapper exported, unit-tested for all branches incl. default.
  - [ ] Both generators accept `heatingFuel` and use `ENERGY_PRICES[heatingFuel]` / `CO2_FACTORS[heatingFuel]` for heating-side measures.
  - [ ] Emitted heating-side measures set `fuel`; escalation follows via the existing explicit path.
  - [ ] `hvac-heat-pump` suppressed when heating is already electric; documented.
  - [ ] Hook threads `materials.hvac.heating` into both generators.
  - [ ] All gates green with zero changes to existing test expectations.
- **Done when**: A district-heated building's envelope/HVAC savings are priced at 90 KRW/kWh, escalated as district heating, and CO2-factored at 0.3200 tCO2/MWh — asserted per fuel type in tests, with legacy gas behavior preserved by default.
