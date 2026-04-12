---
phase: 23
validated: 2026-04-12
nyquist_compliant: true
wave_0_complete: true
criteria_covered: 4/4
---

# Phase 23: Per-Floor Energy Model — Nyquist Validation

## Summary

Phase 23 introduced `useEnergyBreakdown` hook and `calculateSystemBreakdown` pure function
delivering per-floor kWh/m² arrays and HVAC/lighting/DHW/plug attributions with data-source
provenance. All four success criteria have automated test coverage.

## Success Criteria Coverage

| # | Criterion | Status | Test File(s) |
|---|-----------|--------|--------------|
| 1 | `useEnergyBreakdown(pk)` returns `SystemBreakdown` with `perFloor` array | COVERED | `src/hooks/__tests__/use-energy-breakdown.test.ts` — "returns a SystemBreakdown when both stores are populated", "perFloor length equals above-grade floor count" |
| 2 | `SystemBreakdown` includes HVAC/lighting/DHW/plug attribution summing to 100% | COVERED | `src/lib/energy/__tests__/system-breakdown.test.ts` — "total equals sum of the four system buckets (EA-01b)", "HVAC attribution equals calculateAnnualDemand().totalDemand", "mainPurpsCd prefix '02' selects office ratios" |
| 3 | Every non-actual value carries `dataSource: "estimated-ratio"` at TypeScript type level | COVERED | `src/lib/energy/__tests__/system-breakdown.test.ts` — "every *DataSource field carries the correct runtime string (EA-01d, D4)" |
| 4 | Hook result stable across camera movement (no recalc during useFrame/render) | COVERED | `src/hooks/__tests__/use-energy-breakdown.test.ts` — "returns the same reference across unrelated re-renders (stability)", "returns a new reference after a material change" |

## Build Evidence

- `pnpm build`: passes (0 TypeScript errors) per 23-VERIFICATION.md
- `pnpm test`: 456 tests passing (6 new for `useEnergyBreakdown`, 7 new for `calculateSystemBreakdown`) per 23-VERIFICATION.md
- `pnpm lint`: 0 errors per 23-VERIFICATION.md
