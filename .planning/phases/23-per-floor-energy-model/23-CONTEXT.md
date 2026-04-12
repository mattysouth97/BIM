# Phase 23: Per-Floor Energy Model - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning
**Mode:** Infrastructure phase — discuss skipped (engine-only work, no user-facing behavior)

<domain>
## Phase Boundary

Extend the energy calculation engine to produce per-floor kWh/m² estimates and system-level attribution percentages (HVAC, lighting, DHW, plug loads). Provides a new `useEnergyBreakdown(pk)` hook returning `SystemBreakdown` — consumed by Phase 24 (dashboard) and Phase 25 (heatmap).

</domain>

<decisions>
## Implementation Decisions

### Engine Architecture
- **Separate function, not optional-param extension.** Create new `calculateSystemBreakdown()` in `src/lib/energy/system-breakdown.ts` that internally calls existing `calculateAnnualDemand()`. All 15+ existing callers remain untouched (no breaking change).
- **HVAC anchoring:** HVAC value comes from `calculateAnnualDemand().totalDemand` (degree-day engine), not back-calculated from ratio. Other systems scaled so `total = hvac / hvac_ratio`. Ensures `SystemBreakdown.hvac` matches existing EnergyCards display exactly.
- **perFloor filter:** Only above-ground floors (`type === "above"`). Array index matches Phase 25 heatmap convention.

### Type Safety
- **EnergyDataSource type:** Single source of truth in `system-breakdown.ts`, re-exported everywhere. Values: `"actual" | "estimated-ratio" | "estimated-inferred"`.
- **Discriminated union** at TypeScript level — runtime `=== "estimated-ratio"` checks work correctly (no silent structural typing).

### Memoization
- Exact pattern from `use-energy-metrics.ts` — two nested useMemo calls:
  1. Derive `effectiveRecipe` from `[baseRecipe, overrides]`
  2. Run computation from `[materials, effectiveRecipe, sigunguCd]`
- **DO NOT** subscribe to `getEffectiveRecipe()` getter — creates new object per call, causes infinite render loops (documented in use-energy-metrics.ts).

### ASHRAE Ratios
- Use ASHRAE 90.1 Table G3.1 default ratios, cross-referenced against `benchmark-database.ts` KEMCO data
- Korean office buildings (mainPurpsCd prefix `"02"`): HVAC ~55%, Lighting ~25%, DHW ~10%, Plug ~10%
- Match `mainPurpsCd` by 2-digit prefix (not exact code)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/energy/annual-demand.ts` — `calculateAnnualDemand()` core engine
- `src/hooks/use-energy-metrics.ts` — reactive memoization pattern (two nested useMemo)
- `src/hooks/use-actual-energy.ts` — actual data source for EnergyDataSource tagging
- `src/lib/energy/benchmark-database.ts` — KEMCO benchmark data for Korean ratios cross-reference
- `src/store/material-store.ts` — material overrides pattern

### Established Patterns
- Hook naming: `useX` returning memoized derivations of store state + pure calculations
- No camera-triggered recalc: computations only on material/recipe changes, NOT useFrame
- Bilingual consistency: energy values formatted identically to EnergyCards

### Integration Points
- `src/lib/energy/system-breakdown.ts` — NEW file, new function + type
- `src/hooks/use-energy-breakdown.ts` — NEW hook
- Phase 24 (dashboard) and Phase 25 (heatmap) are the only downstream consumers

</code_context>

<specifics>
## Specific Ideas

- ASHRAE 90.1 ratios need GX team validation against Korean sub-metered buildings (flagged in research as MEDIUM confidence)
- Open question: mainPurpsCd prefix match vs exact — recommend prefix (e.g., "02" matches all office sub-types)
- Phase 23 is a hard prerequisite for Phases 24 and 25

</specifics>

<deferred>
## Deferred Ideas

- Per-floor variation (perimeter vs interior zones) — defer to post-Phase 25 if GX team needs it
- Equipment-override parameter for Phase 26 scenario mode — defer to Phase 26 scope

</deferred>
