---
phase: 28-procedural-mep-equipment-models
plan: "05"
subsystem: config-ui
tags: [equipment-tab, config-panel, slider-row, equipment-store, mep, bilingual]
dependency_graph:
  requires: [28-01]
  provides: [equipment-config-ui]
  affects: [config-panel, equipment-store]
tech_stack:
  added: []
  patterns: [SliderRow, native-checkbox-row, Select, useEquipmentStore, bilingual-labels]
key_files:
  created:
    - src/components/viewer/config-tabs/equipment-tab.tsx
  modified:
    - src/components/viewer/config-panel.tsx
decisions:
  - "Used native styled <input type=checkbox> (Tailwind accent-primary) instead of shadcn Checkbox — component not installed in this project"
  - "Equipment tab placed between Systems and Layers (after Systems trigger/content) to keep MEP concerns adjacent"
  - "Used Wrench icon (lucide-react) for Equipment tab — already available, equipment-appropriate"
  - "useCallback applied to set() helper and validateFixtureHeight to prevent unnecessary re-renders on every store tick"
metrics:
  duration: "~15 min"
  completed: "2026-04-12"
  tasks_completed: 2
  files_changed: 2
---

# Phase 28 Plan 05: Equipment Config Tab — Summary

**One-liner:** Equipment config tab with 6 SliderRow sections bound to useEquipmentStore, bilingual labels, and VRF select — wired into ConfigPanel between Systems and Layers tabs.

## What Was Built

### `src/components/viewer/config-tabs/equipment-tab.tsx`

New "use client" React component with 6 sections mirroring the SystemsTab pattern:

| Section | Korean heading | Sliders | Checkboxes / Selects |
|---------|---------------|---------|----------------------|
| Chiller | 냉동기 (Chiller) | bodyWidth, bodyDepth, bodyHeight, pipeStubRadius | showCoolingTower checkbox |
| Boiler | 보일러 (Boiler) | radius, height, flueHeight, vrfHeadsPerFloor | vrfHeads checkbox, vrfLocation Select |
| AHU | 공기조화기 (AHU) | width, height, depth, unitsPerFloor | showDuctStubs checkbox, showFanFace checkbox |
| DHW | 급탕 시스템 (DHW) | tankRadius, tankHeight | showPump checkbox, showInsulationJacket checkbox |
| Lighting Fixture | 조명기구 (Lighting Fixture) | width, depth, height* | showDiffuserFace checkbox |
| Electrical Panel | 분전반 (Electrical Panel) | width, height, depth | showDoorOutline checkbox, showBreakerGrid checkbox |

*height slider has a `validate` callback — warns "조명이 너무 얇아 보이지 않을 수 있음 / Fixture may be invisible at distance" when value < 0.08 m.

**Store wiring:**
- `params = useEquipmentStore(s => s.getParams(buildingPk))` — always returns a valid deep copy of `DEFAULT_MEP_EQUIPMENT_PARAMS` when no override exists (Plan 01 guarantee).
- `set(path, value)` calls `overrideParam(buildingPk, path, value)` with dotted paths like `"chiller.bodyWidth"`, `"boiler.vrfHeads"`, etc.
- Reset button calls `setParams(buildingPk, JSON.parse(JSON.stringify(DEFAULT_MEP_EQUIPMENT_PARAMS)))`.

**Checkbox pattern:** No shadcn `Checkbox` component is installed in this project. A local `CheckboxRow` helper renders a native `<input type="checkbox" className="h-3.5 w-3.5 accent-primary" />` with a muted-foreground label — consistent with the panel's xs text style.

### `src/components/viewer/config-panel.tsx`

- Added `import { EquipmentTab } from "./config-tabs/equipment-tab"` and `Wrench` from lucide-react.
- Added `<TabsTrigger value="equipment">` with Wrench icon and bilingual label ("장비" / "Equipment") after the Systems trigger.
- Added `<TabsContent value="equipment"><EquipmentTab buildingPk={buildingPk} /></TabsContent>` after the Systems content block.
- `defaultValue="building"` unchanged — Building tab still opens first.

## Verification

- `pnpm build` — passed, zero TypeScript errors, all 15 routes generated cleanly.
- `pnpm lint equipment-tab.tsx config-panel.tsx` — passed, no warnings.
- Task 3 (human-verify checkpoint) — skipped per user instruction; user will verify at end of phase.

## Commit

- `1f99a8a` — `feat(28-05): Equipment config tab with procedural parameter controls`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug / Rule 2 - Missing] Native checkbox instead of shadcn Checkbox**
- **Found during:** Task 1 (checkbox verification step)
- **Issue:** `@/components/ui/checkbox` does not exist in this project — `ls src/components/ui/ | grep -i checkbox` returned no output.
- **Fix:** Used a local `CheckboxRow` helper component with native `<input type="checkbox">` styled with `accent-primary` and `h-3.5 w-3.5` Tailwind classes. No new dependencies introduced.
- **Files modified:** `src/components/viewer/config-tabs/equipment-tab.tsx`
- **Commit:** `1f99a8a` (included in main task commit)

No other deviations — plan executed as written.

## Known Stubs

None. All 6 sections read live from `useEquipmentStore.getParams(buildingPk)`. The store falls back to `DEFAULT_MEP_EQUIPMENT_PARAMS` when no override exists, so sliders always show real values (not placeholder text or hardcoded empty arrays).

## Phase 28 Status

This is the final plan of Phase 28. All Wave 1 and Wave 2 plans are complete:

| Plan | Description | Status |
|------|-------------|--------|
| 28-01 | MepEquipmentParams + equipment-store foundation | Complete (af7fed9) |
| 28-02 | Layer-3 Cooling chiller/cooling-tower geometry | Owned by parallel Wave 2 agent |
| 28-03 | Layer-4 Heating boiler/VRF geometry | Owned by parallel Wave 2 agent |
| 28-04 | Layer-5–7 AHU/DHW/Fixture/Panel geometry | Owned by parallel Wave 2 agent |
| 28-05 | Equipment config tab UI | Complete (1f99a8a) |

Phase 28 is ready for `/gsd:verify-work` once Plans 28-02 through 28-04 geometry work is confirmed complete. The config tab UI is fully functional and will drive real-time updates to any layer generators that read `useEquipmentStore.getParams(buildingPk)`.
