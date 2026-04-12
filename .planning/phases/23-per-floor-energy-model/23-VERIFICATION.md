status: passed

# Phase 23: Per-Floor Energy Model — Verification

**Verified:** 2026-04-12
**Score:** 4/4 must-haves verified

## Criterion Results

### 1. useEnergyBreakdown(pk) returns SystemBreakdown with perFloor array
VERIFIED. Hook signature: `useEnergyBreakdown(buildingPk, sigunguCd?)` returns `SystemBreakdown | null`. `perFloor: number[]` field present, one kWh/m² per above-ground floor.

### 2. SystemBreakdown includes HVAC/lighting/DHW/plug attribution summing to 100%
VERIFIED. ASHRAE 90.1 ratios for office (mainPurpsCd prefix "02"): HVAC 55%, Lighting 25%, DHW 10%, Plug 10%. HVAC value anchored to calculateAnnualDemand().totalDemand; others scaled via `total = hvac / hvac_ratio`.

### 3. Every non-actual value carries dataSource: "estimated-ratio" at TypeScript type level
VERIFIED. EnergyDataSource = "actual" | "estimated-ratio" | "estimated-inferred" (discriminated union). Runtime `=== "estimated-ratio"` checks work correctly. All system values tagged appropriately.

### 4. Hook result stable across camera movement (no recalc during useFrame/render)
VERIFIED. Referential stability test passes: `result.current === first` across unrelated re-renders. Two-useMemo pattern mirrors use-energy-metrics.ts — no getter subscriptions, only stable Zustand slices.

## Build & Test Status
- `pnpm build`: passes (0 TypeScript errors)
- `pnpm test`: 456 tests passing (6 new for useEnergyBreakdown, 7 new for calculateSystemBreakdown)
- `pnpm lint`: 0 errors

## Requirements Coverage
- EA-01: ✅ SATISFIED (per-floor kWh/m² + system attribution in useEnergyBreakdown hook)
