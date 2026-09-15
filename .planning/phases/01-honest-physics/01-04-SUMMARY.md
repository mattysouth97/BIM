---
phase: 01-honest-physics
plan: "04"
status: complete
subsystem: retrofit
requirements-completed: [PHYS-04]
completed: 2026-09-15
---

# Plan 01-04 — One retrofit core

Twin and diagnostics adapters call the React/store-free `generateRetrofitMeasures`.
The canonical fixture renders the real hook and constructs a frozen-shaped
`DegreeDaySimulationRun` with the same materials, recipe, climate, resolved region,
conditioned area and roof planes. All measure IDs, individual kWh, cost, annual
saving, numeric financial fields and the entire core result compare exactly.

## Contracts

`RetrofitCoreInput` carries materials, a real recipe (or null for explicitly named
legacy screening), climate/region, conditioned floor area, roof planes/geometric
capacity, roof type, optional engine element areas, program track, chosen measure
IDs, local edit count, assumptions and optional budget. No recipe is invented.

`RetrofitCoreResult` exposes measures with financials/pricedByEngine, recommendation
and chosen set, selected-package engine delta, paired annual bill and purchased
energy, assumptions, notes and edit count. A null chosen input uses recommendation
for the delta as well. Bill tariffs and annual-netting limits are explicit; export
revenue remains a separately labeled economic assumption. PV self-consumption
revenue is capped at the building's remaining electric demand.

- Wall U is area-weighted. Inspection found the twin already used this derivation,
  so no expectation changed because of a newly introduced wall-U average.
- Real recipe paths use isolated engine reruns for individual measure savings,
  including negative/no-benefit outcomes. They do not sum individual savings to
  claim package performance; the selected package is rerun separately.
- Measured roof planes win; absent planes use the shared PV helper's named ratio
  assumption containing the exact roof area. Unknown region produces no PV.
- Gross site intensity now includes LPD lighting, DHW and plug loads. Shared
  `calculateDeliveredCO2` includes all delivered carriers and annual capped PV;
  district-cooling emissions/tariff proxy is stated.
- Material store retains a baseline and distinct differing override paths.
  Changing one field repeatedly counts once; returning to baseline removes it.
  The screen says local edits not saved to the source model, distinguishing source
  persistence from browser-local persistence.

## Evidence

- RED commit `fa286e7`: all 3 tests ran and failed; ID diff explicitly showed
  diagnostics missing `solar-pv-flat`. TypeScript passed.
- GREEN commit `4628790`: 595 focused tests passed, followed by 65 UI/parity
  regression cases. Final TypeScript passed. Full ESLint: 0 errors, 6 existing
  warnings; no new dependency.
- Final full suite reported 5,608 passed and 4 existing skipped, no failing tests.
  PowerShell redirected-stderr command reported exit 1 with the existing happy-dom
  external-script warning, so clean integrated exit verification remains with the
  root lane rather than claiming an exit-0 check here.
- Deliberately changed only diagnostics LPD from 18 to 19: kWh, financials and
  whole-core cases failed (3 failed, ID case passed). Restored the fixture before
  the final suite. No tolerance or intersection-only comparison is used.
- Real store edits to LPD and roof U produce count 2; the rendered notice's numeric
  text is parsed back and equals 2. Re-editing LPD keeps 2; reverting it gives 1.
- Root lane owns the additional browser edit/count check after integration. No
  deployment was performed by this lane.

## Expectations changed and why

- Historical proxy-baseline tests now require equality when the real recipe is
  available: omitting an engine-demand argument no longer activates a fake demand.
- Measured-roof costs are equal with/without caller area hints because core derives
  those areas from the recipe itself. Explicit published roof typology still wins.
- LED site delta is -52.56 kWh/m²·yr in the 18→6 W/m², 4,380-hour fixture, rather
  than zero HVAC-only change. Direct-engine site/carbon tests use whole end uses.
- Clinic's old empty recommendation assertion used stale economics. It now sets an
  explicit zero budget to test the empty-selection behavior independently.
- The already-priced PV disclosure test opens its detail control before parsing;
  removed unsupported Testing Library `exact` option from that upstream fix.

## Remaining integration

Root updates metrics/datasets to consume the shared delivered-carbon helper and
performs final phase-wide browser, type, test and documentation verification.
Canonical diagnostics primary parsing is a separate boundary; retrofit parity
alone is not evidence that every canonical result field shares the same mapping.
