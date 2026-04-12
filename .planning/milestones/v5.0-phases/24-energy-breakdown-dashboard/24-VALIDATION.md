---
phase: 24
validated: 2026-04-12
nyquist_compliant: false
wave_0_complete: false
criteria_covered: 2/4
---

# Phase 24: Energy Breakdown Dashboard — Nyquist Validation

## Summary

Phase 24 delivered a recharts BarChart inside the "Energy / 에너지" ConfigPanel tab showing
HVAC/Lighting/DHW/Plug attributions with amber "estimated" badges. Two criteria (reactive
update on slider change, no re-render during camera rotation) are architectural properties
verified only by human inspection. Two criteria have indirect automated coverage via the
underlying data model tests.

## Success Criteria Coverage

| # | Criterion | Status | Test File(s) |
|---|-----------|--------|--------------|
| 1 | Bar/donut chart displays HVAC/Lighting/DHW/Plug attribution | PARTIAL | No component render test. Underlying data — `src/lib/energy/__tests__/system-breakdown.test.ts` verifies the 4-system breakdown shape that feeds the chart |
| 2 | Every `estimated-ratio` value carries amber "estimated" label | PARTIAL | No component render test. Underlying provenance — `src/lib/energy/__tests__/system-breakdown.test.ts` "every *DataSource field carries the correct runtime string"; `src/hooks/__tests__/use-energy-breakdown.test.ts` verifies hook returns correct `dataSource` |
| 3 | Chart updates reactively when material slider changes | MISSING | No automated test — human visual verification only. Underlying reactivity tested indirectly: `use-energy-breakdown.test.ts` "returns a new reference after a material change" |
| 4 | Chart does not re-render during camera rotation | MISSING | No automated test — architectural property verified by human only |

## Gaps

- **Criteria 1 & 2 (UI rendering):** No React component test asserts chart bars render or
  that amber Badge appears for estimated values. Would require vitest + @testing-library/react.
- **Criteria 3 & 4:** Reactivity and render-isolation are DOM/canvas-level properties with
  no automated coverage.

  Implementation files with no test coverage:
  - `src/components/viewer/config-tabs/building-tab.tsx` — energy chart rendering, badge display

## Build Evidence

- `pnpm build`: passes (0 TypeScript errors) per 24-VERIFICATION.md
- recharts ^3.8.1 + shadcn chart installed per 24-VERIFICATION.md
- Human visual verification: approved per 24-VERIFICATION.md
