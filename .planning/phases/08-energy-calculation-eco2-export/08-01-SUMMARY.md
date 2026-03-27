---
phase: 08-energy-calculation-eco2-export
plan: 01
subsystem: energy
tags: [heat-loss, degree-day, energy-grade, co2, zustand, hooks]

requires:
  - phase: 04-material-properties-system
    provides: MaterialProperties type and material-store
  - phase: 05-procedural-building-generation
    provides: BuildingRecipe type and recipe-store
provides:
  - Pure energy calculation functions (heat loss, demand, grade, CO2)
  - Reactive useEnergyMetrics hook for UI consumption
affects: [08-02-energy-panel-eco2-export, eco2-integration]

tech-stack:
  added: []
  patterns: [degree-day energy method, Korean energy grading scale]

key-files:
  created:
    - src/lib/energy/climate-data.ts
    - src/lib/energy/heat-loss.ts
    - src/lib/energy/annual-demand.ts
    - src/lib/energy/energy-grade.ts
    - src/lib/energy/co2-emissions.ts
    - src/hooks/use-energy-metrics.ts
  modified: []

key-decisions:
  - "Degree-day method for annual demand: totalHeatLoss/designDeltaT * HDD * 24/1000"
  - "Cooling simplified as 60% of heating heat loss (solar+internal gains factor)"
  - "Ground floor deltaT = 5C (indoor vs ground contact) instead of full winter deltaT"
  - "useEnergyMetrics subscribes to baseRecipes[pk] and overrides[pk] separately to avoid getEffectiveRecipe infinite loop"

patterns-established:
  - "Energy calculation pipeline: climate -> heat-loss -> annual-demand -> grade + co2"
  - "Pure functions in src/lib/energy/ with no React dependencies"

requirements-completed: []

duration: 3min
completed: 2026-03-27
---

# Phase 8 Plan 01: Energy Calculation Engine Summary

**Steady-state heat loss, degree-day annual demand, Korean energy grade (1+++ to 7), and CO2 emissions with reactive Zustand hook**

## Performance

- **Duration:** 3 min (172s)
- **Started:** 2026-03-27T03:19:00Z
- **Completed:** 2026-03-27T03:22:00Z
- **Tasks:** 3
- **Files created:** 6

## Accomplishments
- Per-element heat loss calculation (walls, windows, roof, ground floor) using Q = U x A x deltaT
- Annual heating/cooling demand via degree-day method with HVAC efficiency adjustment
- Korean energy efficiency grade mapping (1+++ through 7) with color gradient
- CO2 emissions using Korean grid factor (0.4594 tCO2/MWh)
- Reactive useEnergyMetrics hook that recalculates on any material or recipe config change

## Task Commits

Each task was committed atomically:

1. **Task 1: Climate data and heat loss calculator** - `3e19fef` (feat)
2. **Task 2: Annual demand, energy grade, and CO2** - `0e4b221` (feat)
3. **Task 3: Reactive energy metrics hook** - `5c102f4` (feat)

## Files Created/Modified
- `src/lib/energy/climate-data.ts` - Seoul climate constants (HDD, CDD, design temps)
- `src/lib/energy/heat-loss.ts` - Steady-state heat loss per envelope element
- `src/lib/energy/annual-demand.ts` - Annual heating/cooling demand via degree-day method
- `src/lib/energy/energy-grade.ts` - Korean 1+++ to 7 grade scale with color mapping
- `src/lib/energy/co2-emissions.ts` - CO2 calculation with Korean grid emission factor
- `src/hooks/use-energy-metrics.ts` - Reactive hook composing all calculations

## Decisions Made
- Used degree-day method (industry standard for preliminary energy assessment) rather than dynamic simulation
- Cooling heat gain simplified as 60% of heating heat loss factor (accounts for solar and internal gains without requiring detailed solar analysis)
- Ground floor uses reduced deltaT of 5C (ground contact) instead of full 31.3C winter deltaT
- Hook subscribes to baseRecipes[pk] and overrides[pk] separately, derives effective recipe in useMemo to avoid the known getEffectiveRecipe infinite loop issue

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all calculation functions are fully implemented with real formulas.

## Next Phase Readiness
- Energy calculation engine ready for UI panel consumption (08-02)
- useEnergyMetrics hook provides all data needed for energy dashboard display
- CO2Result ready for future ECO2 export integration

## Self-Check: PASSED

All 6 created files verified on disk. All 3 task commits (3e19fef, 0e4b221, 5c102f4) verified in git log.

---
*Phase: 08-energy-calculation-eco2-export*
*Completed: 2026-03-27*
