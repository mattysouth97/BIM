---
phase: 26-equipment-info-panel
plan: "01"
subsystem: energy
tags: [equipment-specs, selection-store, types, tdd, korean-standards]
dependency_graph:
  requires: []
  provides:
    - src/lib/energy/equipment-specs.ts
    - src/store/selection-store.ts (selectedEquipment slice)
  affects:
    - src/store/selection-store.ts
tech_stack:
  added: []
  patterns:
    - TDD (RED → GREEN, Vitest)
    - Pure inference function (no async, no React, no THREE.js)
    - Zustand additive store extension
key_files:
  created:
    - src/lib/energy/equipment-specs.ts
    - src/lib/energy/__tests__/equipment-specs.test.ts
    - src/store/__tests__/selection-store.test.ts
  modified:
    - src/store/selection-store.ts
decisions:
  - "D-04 enforced: EquipmentEfficiencyGrade (1|2|3|4|5) is a distinct union from EnergyGrade (1+++…7) with zero cross-import"
  - "D-05 enforced: SelectedEquipmentInfo is plain JSON with no THREE.* fields; selection-store imports no three"
  - "clearSelection() updated to also clear selectedEquipment (composite clear per plan spec)"
  - "microgrid-* always returns grade 1 (renewable) with dataSource=estimated-from-recipe"
metrics:
  duration: "315s (~5 min)"
  completed: "2026-04-12T00:33:12Z"
  tasks_completed: 2
  files_changed: 4
---

# Phase 26 Plan 01: Equipment Specs Module + Selection Store Slice Summary

**One-liner:** Pure `inferEquipmentSpecs()` covering 7 MEP userData.type prefixes with Korean KS B 6364 / KSC IEC 62301 era-based grade tables, plus additive `selectedEquipment` slice in selection-store with JSON-serialisability contract.

---

## What Was Built

### Task 1 — `src/lib/energy/equipment-specs.ts`

**Types exported:**
- `EquipmentEfficiencyGrade = 1 | 2 | 3 | 4 | 5` — separate from `EnergyGrade` (D-04)
- `EquipmentDataSource = "estimated-from-era" | "estimated-from-recipe"`
- `EquipmentStandardRef = "KS B 6364" | "KSC IEC 62301"`
- `EquipmentSpec` interface — 10 fields, all carrying provenance via `dataSource`

**Grade tables exported:**
- `ERA_INSTALL_YEAR` — 6 eras → year midpoint (1965 / 1979 / 1994 / 2004 / 2014 / 2022)
- `HVAC_ERA_GRADE` — 6 eras → `EquipmentEfficiencyGrade` (pre-1970=5 … 2020+=1)
- `ELECTRICAL_ERA_GRADE` — same monotonic pattern for electrical
- `EQUIPMENT_GRADE_LABELS` — 5 grades → Korean strings (e.g. "1등급 (우수)")
- `EQUIPMENT_GRADE_COLORS` — 5 grades → hex colors (#16a34a … #dc2626)

**`inferEquipmentSpecs(userData, recipe)` dispatch table:**

| userData.type prefix | MEP sub-layer | Standard | Grade source | annualKwh basis |
|---------------------|---------------|----------|--------------|-----------------|
| `cooling-*` | mep-hvac | KS B 6364 | HVAC_ERA_GRADE | 0.05 kW/m²·floor × opHours × 40% / COP |
| `heating-*` | mep-hvac | KS B 6364 | HVAC_ERA_GRADE | 0.06 kW/m²·floor × opHours × 45% / eff |
| `vent-*` | mep-hvac | KS B 6364 | HVAC_ERA_GRADE | SFP × airflow (3 ACH) × opHours |
| `lighting-*` | mep-lighting | KSC IEC 62301 | ELECTRICAL_ERA_GRADE | LPD W/m² × floor area × opHours |
| `dhw-*` | mep-dhw | KS B 6364 | HVAC_ERA_GRADE | 5–8 kWh/m²·yr × floor area × floors |
| `shell-*` | mep-electrical | KSC IEC 62301 | ELECTRICAL_ERA_GRADE | plug load W/m² × area × opHours |
| `microgrid-*` | mep-electrical | KSC IEC 62301 | always 1 | 10% footprint as PV × 1100 kWh/kWp/yr |
| `unknown-*` | — | KSC IEC 62301 | grade 3 (neutral) | 3 kWh/m²·yr × area × floors |

Operating hours derived from `mainPurpsCd` lookup (ASHRAE 90.1 defaults, 2500h fallback).

**D-04 verified:** `grep "^import" src/lib/energy/equipment-specs.ts` returns only `@/lib/material-types` and `@/lib/procedural/types` — zero energy-grade references.

### Task 2 — `src/store/selection-store.ts` extension

**New interface exported:**
```typescript
export interface SelectedEquipmentInfo {
  equipmentId: string;
  subLayerId: MepSubLayerId;
  componentType: string;
  floorNo: number | null;
  specs: EquipmentSpec;
}
```

**New store fields/actions added (additive):**
- `selectedEquipment: SelectedEquipmentInfo | null` — initial state `null`
- `selectEquipment(info)` — sets `selectedEquipment`; does NOT mutate `selectedType`/`selectedId`/`buildingPk`
- `clearEquipment()` — sets `selectedEquipment: null` only
- `clearSelection()` — updated to also set `selectedEquipment: null` (composite clear)

**D-05 verified:** `grep "^import" src/store/selection-store.ts` — no `three` import.

---

## Test Results

```
src/lib/energy/__tests__/equipment-specs.test.ts   11 tests passed
src/store/__tests__/selection-store.test.ts        10 tests passed
Total: 21/21 tests passed
```

Test coverage:
- `inferEquipmentSpecs` for cooling, heating, lighting, dhw, microgrid, unknown prefixes
- Grade monotonicity (HVAC_ERA_GRADE and ELECTRICAL_ERA_GRADE tables)
- `EQUIPMENT_GRADE_LABELS` Korean strings / `EQUIPMENT_GRADE_COLORS` hex format
- `dataSource` presence on all 28 known userData.type values
- `annualKwh > 0` for energy-consuming types
- Store: initial null, selectEquipment/clearEquipment isolation, composite clearSelection, JSON round-trip

---

## Deviations from Plan

None — plan executed exactly as written.

All `must_haves.truths` met:
- `inferEquipmentSpecs` handles every MEP prefix ✓
- Every `EquipmentSpec` field carries `dataSource` ✓
- `EquipmentEfficiencyGrade` is a separate union from `EnergyGrade` ✓
- `EQUIPMENT_GRADE_LABELS` covers all 5 grades with Korean strings ✓
- `EQUIPMENT_GRADE_COLORS` covers all 5 grades with hex strings ✓
- `selectedEquipment`, `selectEquipment`, `clearEquipment` added additively ✓
- `SelectedEquipmentInfo` is JSON-serialisable with no THREE.* properties ✓

---

## Known Stubs

None. This plan is pure data foundation (types, tables, inference function, store slice). No UI rendering, no placeholder values flowing to display.

---

## Self-Check: PASSED

Files created/modified:
- `src/lib/energy/equipment-specs.ts` — FOUND
- `src/lib/energy/__tests__/equipment-specs.test.ts` — FOUND
- `src/store/selection-store.ts` — FOUND (modified)
- `src/store/__tests__/selection-store.test.ts` — FOUND

Commit `eeff315` — verified via `git log --oneline -1`.
