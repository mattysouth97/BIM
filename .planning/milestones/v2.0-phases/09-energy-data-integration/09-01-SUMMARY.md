---
phase: 09-energy-data-integration
plan: 01
subsystem: energy-api
tags: [api-proxy, energy-data, actual-vs-modeled, korean-energy-api]
dependency_graph:
  requires: [08-01, 08-02]
  provides: [energy-consumption-api, energy-grade-api, weather-api, actual-energy-hook, energy-comparison-ui]
  affects: [energy-cards, viewer]
tech_stack:
  added: [BdEnergyUseService, BdEnergyRatingService, AsosHourlyInfoService]
  patterns: [api-proxy-route, client-fetch-null-fallback, useEffect-useState-hook, delta-color-coding]
key_files:
  created:
    - src/app/api/energy/consumption/route.ts
    - src/app/api/energy/grade/route.ts
    - src/app/api/weather/route.ts
    - src/lib/energy-api-client.ts
    - src/hooks/use-actual-energy.ts
  modified:
    - src/components/viewer/energy-cards.tsx
decisions:
  - Separate API routes per energy service (not shared with bldrgst) since base URLs differ
  - useEffect+useState for actual energy hook (not react-query) per project convention
  - In-memory Map cache in hook to avoid refetching on re-renders
  - CO2 actual estimated via ratio (modeled CO2/demand) applied to certified demand
  - Card width increased w-52 to w-56 to fit comparison content
metrics:
  duration: 239s
  completed: "2026-03-27"
  tasks_completed: 3
  tasks_total: 3
  files_created: 5
  files_modified: 1
---

# Phase 09 Plan 01: Korean Energy APIs + Actual vs Modeled Comparison Summary

API proxy routes for Korean energy consumption (BdEnergyUseService), energy grade (BdEnergyRatingService), and weather data (ASOS), with client-side fetch functions, a useActualEnergy hook, and energy card UI showing modeled vs actual comparison with green/red delta indicators.

## Tasks Completed

### Task 1: API proxy routes for energy and weather data
- Created 3 Next.js API route handlers following the bldrgst proxy pattern
- Energy consumption route: proxies to BdEnergyUseService, returns monthly electricity (kWh) + gas (MJ)
- Energy grade route: proxies to BdEnergyRatingService, returns certified grade + primary energy demand
- Weather route: proxies to ASOS hourly data, returns daily temps for degree-day calculation
- All handle XML error responses, timeouts, and auth errors identically to existing bldrgst routes
- Created energy-api-client.ts with typed fetch functions (fetchEnergyConsumption, fetchEnergyGrade, fetchWeatherData) + computeAnnualKwh utility
- Client functions return null on any error (graceful fallback for buildings without data)
- **Commit:** b14115e

### Task 2: Actual energy data hook
- Created useActualEnergy hook using useEffect + useState (no react-query)
- Fetches energy grade and consumption in parallel on mount
- In-memory Map cache prevents refetching across re-renders
- Tracks stale requests via ref to avoid race conditions on pk change
- Returns ActualEnergy interface with dataAvailable flag for conditional rendering
- totalAnnualKwh computed from electricity + gas (MJ to kWh conversion at 1/3.6)
- **Commit:** a935936

### Task 3: Update energy cards with actual vs modeled comparison
- Grade card: shows "modeled" label + actual grade in blue when available
- Demand card: shows actual certified demand + delta indicator (green/red)
- CO2 card: estimates actual CO2 using modeled emission factor ratio applied to certified demand
- Heat loss card: unchanged (no actual comparison source)
- ActualDataBadge component: blue pill badge when real data is shown
- DeltaIndicator component: green when modeled <= actual (conservative), red when modeled > actual (optimistic)
- Graceful fallback: italic "No grade data" / "No actual demand data" when partial data
- All labels bilingual (Korean/English)
- **Commit:** 5cecae6

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. All API routes are fully functional proxy handlers. The actual data display depends on whether the external Korean energy APIs have data for a given building (many buildings will show "No actual data" which is expected behavior, not a stub).

## Verification

- All 3 API routes registered and responding (visible in build output)
- Energy cards show comparison when actual data available, graceful fallback otherwise
- Delta color coding: green for conservative, red for optimistic estimates
- `pnpm build` passes with zero errors

## Self-Check: PASSED

All 7 files verified present. All 3 commit hashes verified in git log.
