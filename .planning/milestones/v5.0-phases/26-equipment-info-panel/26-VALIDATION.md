---
phase: 26
validated: 2026-04-12
nyquist_compliant: false
wave_0_complete: false
criteria_covered: 3/4
---

# Phase 26: Equipment Info Panel — Nyquist Validation

## Summary

Phase 26 delivered click-to-inspect MEP equipment info cards with inferred specs, amber
"estimated" badges, Korean energy efficiency grades (1~5등급), and a once-allocated
raycaster. Three of four criteria have strong automated coverage. The raycaster allocation
criterion is an architectural property with no automated test.

## Success Criteria Coverage

| # | Criterion | Status | Test File(s) |
|---|-----------|--------|--------------|
| 1 | Click MEP mesh opens info card with inferred specs (type, capacity, install year, kWh/yr) | COVERED | `src/lib/energy/__tests__/equipment-specs.test.ts` — covers `inferEquipmentSpecs` for all MEP types returning category, grade, installYear, annualKwh; `src/store/__tests__/selection-store.test.ts` — "sets selectedEquipment to the passed info", "stores all SelectedEquipmentInfo fields correctly" |
| 2 | Every value in info card carries visible "estimated" label | COVERED | `src/lib/energy/__tests__/equipment-specs.test.ts` — "every type returns dataSource = estimated-from-era or estimated-from-recipe", `dataSource` field present on all returned specs |
| 3 | Info card displays Korean energy efficiency grade (1~5등급) | COVERED | `src/lib/energy/__tests__/equipment-specs.test.ts` — `EQUIPMENT_GRADE_LABELS` has non-empty Korean string for each grade, grade monotonicity tests (newer era = better grade for HVAC and ELECTRICAL) |
| 4 | Raycaster allocated once via `useRef`, NOT per-frame | MISSING | No automated test — architectural property (React hook lifecycle) verified by human code review only |

## Gaps

- **Criterion 4 (raycaster allocation):** No test asserts the `Raycaster` is instantiated
  exactly once. Would require a React component test or a spy on `THREE.Raycaster`
  constructor.

  Implementation file with no test coverage for this criterion:
  - `src/components/viewer/procedural-building-model.tsx` — `EquipmentClickHandler` component

## Build Evidence

- `pnpm build`: passes (0 TypeScript errors) per 26-VERIFICATION.md
- 21 unit tests passing (equipment-specs + selection-store) per 26-VERIFICATION.md
- Human visual verification: approved per 26-VERIFICATION.md
