---
phase: 01-honest-physics
plan: "02"
status: complete
subsystem: energy
tags: [climate, solar, provenance, zustand]
requires:
  - phase: 01-01
    provides: Named end-use builder and lighting provenance
provides: [Resolved climate and irradiance region, Named summer-temperature sources, Unknown-region PV refusal]
affects: [01-03, 01-04, 01-05]
tech-stack:
  added: []
  patterns: [resolve at payload publication, immutable climate region]
key-files:
  created: [src/lib/energy/climate-region.ts, src/lib/energy/climate-tables.ts, src/components/viewer/climate-region-disclosure.tsx]
  modified: [src/store/scenario-store.ts, src/hooks/use-retrofit-scenario.ts, src/lib/retrofit/solar-potential.ts]
key-decisions:
  - Only sourced city temperatures map to city codes; do not expand a city figure to a province
  - Keep static tables below the adapter to avoid a runtime import cycle
  - Preserve an absent generated location instead of manufacturing a Seoul code
requirements-completed: [PHYS-02]
coverage:
  - id: region-resolution
    description: All declared regions resolve climate and exact PSH together while unknown regions refuse
    requirement: PHYS-02
    verification:
      - kind: unit
        ref: src/lib/energy/__tests__/climate-region.test.ts
        status: pass
      - kind: unit
        ref: src/hooks/__tests__/use-retrofit-scenario.test.tsx
        status: pass
    human_judgment: false
  - id: visible-climate-basis
    description: Regional design values, derived solar and withheld PV remain distinct in the UI
    verification:
      - kind: automated_ui
        ref: src/components/viewer/__tests__/climate-region-disclosure.test.tsx
        status: pass
      - kind: automated_ui
        ref: qa-evidence/phase01-task3/climate-mobile.png
        status: pass
    human_judgment: false
completed: 2026-09-15
---

# Plan 01-02 — One climate region for thermal and PV calculations

**A resolved region now carries climate and solar inputs together; unknown
locations withhold PV instead of receiving a plausible default.**

## Approved Decision — Option 1

User reply on 2026-09-15, verbatim:

> 권장 산정 기준 승인

The approved proposal uses defensible regional summer design temperatures,
with an explicitly named Seoul fallback when a regional figure cannot be
established. Cooling-season solar is a derived assumption:
`350 × (regional peak-sun-hours / Seoul peak-sun-hours)` kWh/m²·season.
It is not a measured regional glazing-irradiation series. Indoor heating and
cooling setpoints stay national occupancy assumptions.

The checkpoint was committed as `374cea4` before any climate implementation.

## Task Commits

1. Climate-basis checkpoint: `374cea4`.
2. Task 1, immutable region and sourced summer inputs: `d2ef4d5`.
3. Task 2, consumers, refusal, visible basis and tests: `c168915`.

## Implemented Basis

Official historical source fetched on 2026-09-15:
[2017 에너지절약계획서 실무 길라잡이 p170](https://greentogether.go.kr/ebook/eais_cust_2017/files/basic-html/page170.html).
Cooling **dry-bulb**, °C: Seoul31.2, Busan30.7, Daegu33.3, Incheon30.1,
Gwangju31.8, Daejeon32.3, Ulsan32.2. These are explicitly dated city design
inputs, not measured weather or a current-law compliance claim.

Codes36,41,43,44,45,46,47,48,50,51,52 retain the previous Seoul33.6 value with
`national_fallback` and no city-source citation. Province-wide applicability
could not be established from a table of cities. Resolved Seoul uses sourced31.2;
the old33.6 is explicitly the legacy fallback, not a sourced regional value.

Cooling solar is `350 × region.peakSunHours / REGIONAL_IRRADIANCE.seoul`;
Seoul350 versus Busan380 kWh/m²·season. Basis is
`derived_from_regional_psh`. The existing PSH, HDD/CDD and winter-temperature
tables were not newly verified; the new citation does not validate them.
Heating20/cooling26 °C setpoints remain national occupancy assumptions.

## Integration and Deviations

- `SIDO_TOKENS` and `ADDRESS_TOKENS` now live only in `lib/energy/climate-region.ts`;
  ledger weather imports them. Climate constants moved to `climate-tables.ts`,
  re-exported from `climate-data.ts`, to avoid a runtime cycle between the
  adapter and region resolver. No upward import into energy-diagnostics.
- Store publication resolves code first, then address. All seven scenario-hook
  call sites receive the object. The reference sidebar resolves its own known
  model climate; the five shared consumers plus HUD use published inputs.
- Added address forwarding from the twin title and threaded the object through
  both delta consumers and energy metrics, so address fallback does not create
  conflicting thermal and PV regions on one frame.
- A further hidden Seoul default was found in generated-design seeds. Missing
  sites now retain an empty code; existing thermal fallback remains named, while
  PV is withheld. Updated the affected seed contracts instead of preserving the bug.
- No `DEFAULT_PEAK_SUN_HOURS` remains. Solar economics takes a resolved numeric
  PSH and rejects invalid values. The scenario exposes `regionUnresolved` and
  suppresses PV; non-PV retrofit candidates keep the named legacy thermal fallback.
- `resolveClimateRegion` returns null for unknown/nonfinite inputs. Directly
  supplying a tampered typed region to `climateFromRegion` throws `RangeError`
  rather than returning a fabricated climate; this preserves its `ClimateData`
  return contract while refusing NaN propagation.
- The plan referenced a nonexistent ledger-climate test file. The new region
  test instead verifies every token against the actual ledger resolver.
- Shared disclosure is mounted on all seven surfaces. In the HUD it follows
  the controls, keeping figures first; the existing capped panel scrolls to it.

## Verification

- Task 1 energy/diagnostics selection:582 tests passed.
- Full suite after wiring:5,578 passed; final full suite after the generated-site
  fix and disclosure tests: **5,581 passed,4 existing skipped**,463 passed files,
  one skipped; explicit process exit0. No new skips.
- TypeScript passed. Full ESLint `src`:0 errors,6 existing warnings; changed
  seed/disclosure files checked again after their final edits, exit0.
- The final HUD paragraph reorder was checked in the browser after HMR rather
  than repeating unchanged physics tests.
- Browser `/models/kit-office`: actual Korean and English text names Seoul31.2,
  the2017 source and350.0 derived solar. Mobile390px client/scroll widths both390;
  disclosure358px wide. HUD content85px high with439px scroll height; scrolling
  reaches the basis. Screenshot inspected and controls kept ahead of the basis.
- Local logs and screenshots: `qa-evidence/phase01-task3/climate-*` (ignored).
- UI safety and schema drift gates pass. No full Playwright CLI suite,
  production build or deployment. Pre-existing DWG script diagnostic remains
  in the passing full-suite log.

## Next Readiness

Plan 02 is complete; PHYS-02 remains open at requirement level until Plan 03
connects PV generation to primary energy and the grade. Source and dated
assumptions are recorded in `ENERGY_STANDARD_TRACEABILITY.md`. Existing seven
reference scenarios still use their explicitly assumed Seoul comparison region;
this work does not claim seven buildings gained actual Korean locations.
