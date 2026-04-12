---
phase: 28
validated: 2026-04-12
nyquist_compliant: false
wave_0_complete: false
criteria_covered: 4/5
---

# Phase 28: Procedural 3D Models for MEP Equipment — Nyquist Validation

## Summary

Phase 28 upgraded all MEP layer generators with distinct procedural 3D models, wired them
into production via `setupMepSubGroups`/`assignToSubGroup`, added real-time config panel
controls, and verified draw-call budgets. Four of five criteria have automated coverage.
The real-time config panel update criterion is verified by human only.

## Success Criteria Coverage

| # | Criterion | Status | Test File(s) |
|---|-----------|--------|--------------|
| 1 | Each MEP sub-type renders distinct procedural 3D model | COVERED | `src/lib/layers/__tests__/layer-3-cooling.test.ts` — "chiller geometry has more vertices than a plain BoxGeometry"; `src/lib/layers/__tests__/layer-4-heating.test.ts` — "boiler geometry has more vertices", VRF + fan coil InstancedMesh; `src/lib/layers/__tests__/layer-5-ventilation.test.ts` — "merged AHU geometry has more vertices"; `src/lib/layers/__tests__/layer-6-dhw.test.ts` — "Storage tank geometry has MORE vertices than plain CylinderGeometry"; `src/lib/layers/__tests__/layer-7-lighting.test.ts` — fixture Y-extent >= 0.08m, showDiffuserFace adds vertices |
| 2 | Users can adjust procedural parameters in config panel — scene updates in real time | MISSING | No automated test — UI reactivity verified by human only. Underlying param store covered: `src/store/__tests__/equipment-store.test.ts` — `overrideParam`, `setParams`, `getParams` |
| 3 | Models recognizable at typical camera distances (fixture >= 0.10m height) | COVERED | `src/lib/layers/__tests__/layer-7-lighting.test.ts` — "Fixture geometry Y-extent (height) is >= 0.08m — regression guard against invisible 0.02m flat box"; `src/lib/layers/mep-equipment-params.test.ts` — "lightingFixture.height === 0.10 (NOT 0.02)" |
| 4 | InstancedMesh + mergeGeometries — <10 draw calls per sub-layer | COVERED | `src/lib/layers/__tests__/layer-5-ventilation.test.ts` — "no per-floor vent-duct Meshes exist in the group (floating ducts eliminated)"; `src/lib/layers/__tests__/layer-3-cooling.test.ts` — "generate() with equipParams override changes chiller bounding box width" confirms InstancedMesh path; `src/lib/layers/__tests__/layer-4-heating.test.ts` — VRF + fan coil InstancedMesh count assertions |
| 5 | Phase 22 toggling + Phase 26 click selection continue working | COVERED | `src/lib/layers/__tests__/layer-3-cooling.test.ts` — "chiller plant mesh has userData.type === 'cooling-plant' (Phase 26 dispatch preserved)"; `src/lib/layers/__tests__/layer-4-heating.test.ts` — "boiler mesh has userData.type === 'heating-boiler' (Phase 26 dispatch preserved)"; `src/store/__tests__/selection-store.test.ts` — `clearSelection` composite clear; `src/store/__tests__/layer-store.test.ts` — `ALL_LAYER_IDS` length = 5 unchanged |

## Gaps

- **Criterion 2 (real-time config update):** No automated test asserts that changing an
  `equipmentParams` slider causes `BuildingLayers` useEffect to re-run and regenerate MEP
  geometry. Would require a React component integration test.

  Implementation file with no test coverage for this criterion:
  - `src/components/viewer/procedural-building-model.tsx` — `BuildingLayers` useEffect
    `[equipmentParams]` dependency

## Build Evidence

- `pnpm build`: passes (0 TypeScript errors) per 28-VERIFICATION.md
- All Phase 28 unit tests passing (chiller, boiler, AHU, DHW, lighting + store) per 28-VERIFICATION.md
- Human visual verification: approved per 28-VERIFICATION.md
