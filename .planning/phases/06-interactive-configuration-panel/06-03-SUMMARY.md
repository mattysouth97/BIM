---
phase: 06-interactive-configuration-panel
plan: 03
subsystem: ui
tags: [react, zustand, three.js, r3f, hvac, layers, config-panel]

requires:
  - phase: 06-interactive-configuration-panel
    provides: ConfigPanel shell, BuildingTab, EnvelopeTab, SliderRow, recipe-store, layer-store
provides:
  - SystemsTab with HVAC/lighting/occupancy/renewables controls
  - LayersTab with per-layer density sliders and visibility toggles
  - Recipe overrides wired from store through applyOverrides to 3D scene
  - Layer density state and regeneration on density change
affects: [energy-simulation, eco2-export, layer-generators]

tech-stack:
  added: []
  patterns: [material-store overrideProperty for HVAC/lighting, layer density-driven regeneration]

key-files:
  created:
    - src/components/viewer/config-tabs/systems-tab.tsx
    - src/components/viewer/config-tabs/layers-tab.tsx
  modified:
    - src/components/viewer/config-panel.tsx
    - src/components/viewer/building-scene.tsx
    - src/components/viewer/procedural-building-model.tsx
    - src/components/viewer/building-layers.tsx
    - src/store/layer-store.ts
    - src/lib/layers/layer-manager.ts

key-decisions:
  - "Used material-store overrideProperty for HVAC/lighting/occupancy/renewable values rather than a separate systems store"
  - "Layer density stored in layer-store as Record<LayerId, number> (0-100), regeneration via dispose+getOrGenerate"
  - "ProceduralBuildingModel accepts recipeOverride prop for pre-computed recipe from scene level"

patterns-established:
  - "Density-driven layer regeneration: disposeLayer + getOrGenerate pattern for live updates"
  - "Recipe override flow: useRecipeStore.overrides -> applyOverrides -> scene passes to children"

requirements-completed: []

duration: 4min
completed: 2026-03-27
---

# Phase 6 Plan 3: Systems Tab + Layers Tab + 3D Integration Summary

**Systems/Layers config tabs with HVAC/lighting/renewables controls, per-layer density sliders, and live recipe override wiring to 3D scene**

## Performance

- **Duration:** 4 min (262s)
- **Started:** 2026-03-27T08:30:57Z
- **Completed:** 2026-03-27T08:35:19Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- SystemsTab with HVAC heating/cooling type dropdowns, efficiency/COP sliders, lighting LPD + control type, occupancy density, solar type + panel area
- LayersTab rendering all 10 layers with colored dot, name, visibility toggle (Eye/EyeOff), and context-specific density slider
- Full 3D wiring: recipe overrides from useRecipeStore flow through applyOverrides to ProceduralBuildingModel and BuildingLayers
- Layer density changes trigger dispose + regenerate for affected visible layers

## Task Commits

Each task was committed atomically:

1. **Task 1: Systems tab with HVAC/lighting/renewables** - `55df0f5` (feat)
2. **Task 2: Layers tab with density controls** - `42353be` (feat)
3. **Task 3: Wire ConfigPanel tabs + recipe overrides to 3D scene** - `b8acadf` (feat)

## Files Created/Modified
- `src/components/viewer/config-tabs/systems-tab.tsx` - HVAC/lighting/occupancy/renewables controls with bilingual labels
- `src/components/viewer/config-tabs/layers-tab.tsx` - 10 layer rows with visibility + density sliders
- `src/components/viewer/config-panel.tsx` - Wired SystemsTab and LayersTab into tab content
- `src/components/viewer/building-scene.tsx` - Reads recipe overrides from store, applies via applyOverrides, passes to children
- `src/components/viewer/procedural-building-model.tsx` - Added recipeOverride prop for live recipe updates
- `src/components/viewer/building-layers.tsx` - Subscribes to density changes, disposes + regenerates layers
- `src/store/layer-store.ts` - Added density state and setDensity action
- `src/lib/layers/layer-manager.ts` - Added disposeLayer() for single-layer cleanup

## Decisions Made
- Used material-store's existing overrideProperty for HVAC/lighting/occupancy/renewable values rather than creating a separate systems store — keeps all material properties centralized for ECO2 export
- Layer density stored as simple 0-100 integer per layer in Zustand — regeneration uses dispose+getOrGenerate pattern
- ProceduralBuildingModel accepts recipeOverride prop so scene-level recipe computation (with overrides) is passed down cleanly
- Used Eye/EyeOff icons instead of Switch component (not available in UI library) for layer visibility toggles

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 config panel tabs now have real controls
- Recipe overrides flow end-to-end from UI sliders to 3D regeneration
- Layer density infrastructure in place for generator-level density scaling
- Material properties (HVAC, lighting, occupancy, renewables) ready for future ECO2 export

## Self-Check: PASSED

---
*Phase: 06-interactive-configuration-panel*
*Completed: 2026-03-27*
