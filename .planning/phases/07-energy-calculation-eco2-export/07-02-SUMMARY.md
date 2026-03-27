---
phase: 07-energy-calculation-eco2-export
plan: 02
subsystem: ui, 3d-viewer
tags: [three.js, r3f, zustand, component-library, procedural-geometry, korean-standards]

requires:
  - phase: 07-energy-calculation-eco2-export
    provides: authoring-store with isAuthoring flag and edit mode infrastructure
provides:
  - Component type system with Korean standard presets (doors, windows, MEP, stairs)
  - Component store for placed instances and drag state
  - 4 procedural geometry generators (door, window, MEP fixture, stair)
  - Component palette UI with category tabs
  - Click-to-place in 3D scene with wall/ceiling snapping
affects: [07-energy-calculation-eco2-export, eco2-export]

tech-stack:
  added: []
  patterns: [component-preset-pattern, procedural-generator-per-category, palette-drag-place-flow]

key-files:
  created:
    - src/lib/components/component-types.ts
    - src/store/component-store.ts
    - src/lib/components/door-generator.ts
    - src/lib/components/window-generator.ts
    - src/lib/components/mep-fixture-generator.ts
    - src/lib/components/stair-generator.ts
    - src/components/viewer/component-palette.tsx
    - src/components/viewer/placed-components.tsx
  modified:
    - src/components/viewer/building-scene.tsx

key-decisions:
  - "Korean standard dimensions in meters for presets (KS F 3109 door sizes, standard windows)"
  - "MEP presets bound to LayerId for layer system integration (5=ventilation, 7=lighting, 10=BAS, 13=safety)"
  - "Non-persisted Zustand store for component placement (runtime state only)"
  - "Ghost preview with semi-transparent materials during drag placement"

patterns-established:
  - "ComponentPreset pattern: id/name/nameKo/category/dimensions/metadata for all component types"
  - "Generator-per-category: each category has a pure Three.js generator returning THREE.Group"
  - "Palette drag-place flow: click preset in palette, click in scene to place at raycasted position"

requirements-completed: []

duration: 5min
completed: 2026-03-27
---

# Phase 7 Plan 02: Component Library + Component Store Summary

**Procedural door/window/MEP/stair generators with Korean standard presets, Zustand component store, and drag-to-place palette UI integrated into R3F scene**

## Performance

- **Duration:** 5 min 32s
- **Started:** 2026-03-27T05:18:35Z
- **Completed:** 2026-03-27T05:24:07Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Complete component type system with 13 Korean-standard presets across 4 categories
- 4 procedural geometry generators producing realistic Three.js groups (door with frame+panel+handle, window with aluminum frame+glass+mullions, 5 MEP fixture types matching layer visual styles, straight and spiral stairs)
- Floating component palette UI with bilingual category tabs and preset cards
- Click-to-place workflow with ghost preview, ground-plane raycasting, and category-specific snapping (MEP to ceiling, stairs to ground)

## Task Commits

Each task was committed atomically:

1. **Task 1: Component types and store** - `29240fb` (feat)
2. **Task 2: Component geometry generators** - `638f168` (feat)
3. **Task 3: Component palette panel + scene integration** - `604123d` (feat)

## Files Created/Modified
- `src/lib/components/component-types.ts` - ComponentPreset, PlacedComponent interfaces + 13 Korean standard presets
- `src/store/component-store.ts` - Zustand store for placed components and drag state
- `src/lib/components/door-generator.ts` - Door geometry: wood frame, panel, handle cylinder
- `src/lib/components/window-generator.ts` - Window geometry: aluminum frame, MeshPhysicalMaterial glass, mullion dividers
- `src/lib/components/mep-fixture-generator.ts` - 5 MEP fixtures matching layer visual styles
- `src/lib/components/stair-generator.ts` - Straight and spiral stair geometry with treads, stringers, handrails
- `src/components/viewer/component-palette.tsx` - Floating palette panel with 4 category tabs
- `src/components/viewer/placed-components.tsx` - R3F component rendering placed instances + drag preview
- `src/components/viewer/building-scene.tsx` - Added ComponentPalette and PlacedComponents integration

## Decisions Made
- Used Korean standard dimensions: doors 900/1000/1200x2100mm, windows 1200/1800/2400x1500mm per KS standards
- MEP fixture presets bound to correct LayerId (sprinkler/fire-alarm=13, BAS=10, lighting=7, HVAC vent=5)
- Door material: MeshStandardMaterial wood-brown (0x8B4513) with roughness 0.7
- Window glass: MeshPhysicalMaterial with transmission 0.9 for realistic transparency
- Component store keyed by buildingPk for multi-building support
- Non-persisted store since placed components are authoring-session state

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed lucide-react Stairs icon not exported**
- **Found during:** Task 3 (Component palette)
- **Issue:** `Stairs` is not exported from lucide-react, TypeScript error TS2724
- **Fix:** Replaced with `ArrowUpDown` icon which is available
- **Files modified:** src/components/viewer/component-palette.tsx
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** 604123d (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor icon substitution, no functional impact.

## Issues Encountered
None beyond the icon fix above.

## Known Stubs
None - all generators produce complete geometry, all presets have real dimensions and metadata.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Component library ready for ECO2 export integration (material properties attached to presets)
- Placed components available in store for serialization/export
- Wall snapping logic is simplified (raycasted hit point) - could be enhanced with proper wall-face detection in future

---
*Phase: 07-energy-calculation-eco2-export*
*Completed: 2026-03-27*
