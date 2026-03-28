# Phase 9: Energy Data Integration - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped — infrastructure phase using ROADMAP spec)

<domain>
## Phase Boundary

Connect real energy consumption data from Korean government APIs. Compare actual vs modeled energy. Overlay real data on the 3D model.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices at Claude's discretion — using ROADMAP phase goal and success criteria.

### API Integrations
- 건축HUB 건물에너지정보 API (monthly electricity + gas per building)
- 건축물 에너지효율등급 API (certified energy grades)
- KMA weather data API (temperature, solar radiation for degree-day analysis)
- All APIs proxied through src/app/api/ routes (same pattern as bldrgst)

### Data Display
- Compare actual vs modeled energy consumption in energy cards
- Overlay real vs predicted data — show delta/difference
- Weather data feeds into more accurate degree-day calculations

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- src/app/api/bldrgst/* — Existing API proxy pattern
- src/lib/api-proxy.ts — fetchFromDataGoKr utility
- src/lib/api-client.ts — Client-side fetch wrapper
- src/hooks/use-energy-metrics.ts — Energy calculation hook to extend
- src/components/viewer/energy-cards.tsx — Cards to add actual vs modeled comparison
- src/lib/energy/* — Calculation functions to feed with real weather data

### Integration Points
- New API routes in src/app/api/ for energy and weather APIs
- Extend energy-cards.tsx with actual data comparison
- Use KMA weather data to improve degree-day calculations in annual-demand.ts

</code_context>

<specifics>
## Specific Ideas

- data.go.kr energy API key: same key as building ledger (user's existing key)
- KMA weather API: separate key may be needed
- Monthly electricity/gas data: show as time series chart below energy cards
- Actual energy grade badge: show alongside modeled grade for comparison

</specifics>

<deferred>
## Deferred Ideas

None — final phase of milestone.

</deferred>
