---
phase: 28
plan: gap
subsystem: mep-wiring
tags: [mep, building-layers, equipment, three.js, gap-closure]
dependency_graph:
  requires: [layer-3-cooling, layer-4-heating, layer-5-ventilation, layer-6-dhw, layer-7-lighting, mep-coordinator, equipment-store]
  provides: [mep-geometry-visible-in-scene]
  affects: [phase-22-toggles, phase-26-click-selection, phase-28-procedural-params]
tech_stack:
  added: []
  patterns: [useEffect-for-imperative-three-geometry, snapshot-safe-zustand-selector, idempotent-subgroup-setup]
key_files:
  modified:
    - src/components/viewer/building-layers.tsx
    - src/lib/layers/layer-manager.ts
decisions:
  - Dispose sub-group children but preserve sub-group nodes themselves — setupMepSubGroups is idempotent so it reuses existing nodes, avoiding re-append bugs
  - equipmentParams selector uses nullish coalescing fallback to DEFAULT_MEP_EQUIPMENT_PARAMS so the component renders correctly before any building is loaded
  - THREE.Line added to updateAnimations traversal — VentilationLayer airflow trails use Line + ShaderMaterial with uTime uniform
metrics:
  duration: ~15min
  completed: 2026-04-12
  tasks: 1
  files: 2
---

# Phase 28 Gap: Wire MEP Generators into BuildingLayers Summary

MEP generators (CoolingLayer, HeatingLayer, VentilationLayer, DHWLayer, LightingLayer) were fully implemented but never invoked in production. This gap closure wires all five generators into `BuildingLayers`, making MEP equipment visible in the 3D scene for the first time.

## What Was Done

### Core change — `src/components/viewer/building-layers.tsx`

Added imports for all five MEP layer generators, `setupMepSubGroups`, `assignToSubGroup`, `useEquipmentStore`, and `DEFAULT_MEP_EQUIPMENT_PARAMS`.

Added equipment params subscription (snapshot-safe, pk-scoped):
```ts
const equipmentParams = useEquipmentStore((s) => s.params[pk]) ?? DEFAULT_MEP_EQUIPMENT_PARAMS;
```

Added a `useEffect` with dependency array `[effectiveRecipe, equipmentParams]` that:
1. Bails when `effectiveRecipe` is absent
2. Gets the MEP group via `manager.getGroup("mep")`
3. Traverses the MEP group, disposes geometry + materials on all `Mesh`, `InstancedMesh`, `Points`, `Line` objects
4. Clears children from sub-groups (preserving the sub-group nodes) and removes any non-group direct children from `mepGroup`
5. Calls `setupMepSubGroups(mepGroup)` — idempotent, reuses existing sub-group nodes
6. Instantiates each generator and calls `.generate(effectiveRecipe, 1.0, equipmentParams.{section})`
7. Routes each output via `assignToSubGroup(mepGroup, output.name, output)` into the correct sub-group

Equipment param sections mapped to generators:
- `equipmentParams.chiller` → `CoolingLayer` → routed to `mep-hvac` sub-group
- `equipmentParams.boiler` → `HeatingLayer` → routed to `mep-hvac` sub-group
- `equipmentParams.ahu` → `VentilationLayer` → routed to `mep-hvac` sub-group
- `equipmentParams.dhw` → `DHWLayer` → routed to `mep-dhw` sub-group
- `{ fixture: equipmentParams.lightingFixture, panel: equipmentParams.electricalPanel }` → `LightingLayer` → routed to `mep-lighting` sub-group

### Auto-fix — `src/lib/layers/layer-manager.ts`

`updateAnimations` was missing `THREE.Line` in its traversal predicate. `VentilationLayer` airflow trails are `THREE.Line` objects with `ShaderMaterial` uniforms including `uTime`. Without this fix, ventilation animation would be frozen even after the generators were wired in. Added `|| obj instanceof THREE.Line` to the type guard.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Functionality] `THREE.Line` missing from `updateAnimations` traversal in `layer-manager.ts`**
- **Found during:** Implementation review before committing
- **Issue:** `VentilationLayer` generates `THREE.Line` objects with animated `ShaderMaterial` (`uTime` uniform). `updateAnimations` checked for `Mesh | InstancedMesh | Points` only — `Line` was silently skipped, freezing ventilation airflow animation.
- **Fix:** Added `obj instanceof THREE.Line` to the type guard in `updateAnimations`.
- **Files modified:** `src/lib/layers/layer-manager.ts`
- **Commit:** ebc561a

## Downstream Impact

- **Phase 22 toggles** — MEP layer toggle and all 4 MEP sub-layer toggles (electrical, HVAC, lighting, DHW) now control real geometry
- **Phase 26 click selection** — Raycaster will now hit real MEP mesh objects; `userData.type` on each mesh identifies the element
- **Phase 28 procedural params** — `equipmentParams` is in the `useEffect` dependency array, so any store update (via `overrideParam`) triggers a full MEP geometry rebuild in real time

## Self-Check: PASSED

- `src/components/viewer/building-layers.tsx` — exists, modified
- `src/lib/layers/layer-manager.ts` — exists, modified
- Commit `ebc561a` — verified via `git log`
- `pnpm build` — 0 errors
- `pnpm lint` — 0 errors (55 pre-existing warnings, none from modified files)
