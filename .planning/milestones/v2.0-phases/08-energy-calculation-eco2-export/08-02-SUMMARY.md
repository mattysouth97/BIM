---
phase: 08-energy-calculation-eco2-export
plan: 02
subsystem: ui
tags: [energy, eco2, react, zustand, overlay, bilingual]

requires:
  - phase: 08-energy-calculation-eco2-export
    provides: energy calculation engine (heat-loss, annual-demand, energy-grade, co2-emissions, useEnergyMetrics hook)
provides:
  - 4 floating energy metric cards (grade, demand, CO2, heat loss) in 3D viewer
  - ECO2 JSON export with full building envelope/HVAC/calculated data
  - ECO2 JSON import parser with multi-format support
  - Export/Import buttons integrated into energy cards UI
affects: [eco2-integration, energy-reporting, building-viewer]

tech-stack:
  added: []
  patterns: [animated-number-display, eco2-json-schema, file-download-trigger]

key-files:
  created:
    - src/components/viewer/energy-cards.tsx
    - src/lib/energy/eco2-export.ts
    - src/lib/energy/eco2-import.ts
  modified:
    - src/components/viewer/building-scene.tsx

key-decisions:
  - "Export/Import buttons placed directly below energy cards rather than in viewer-overlay toolbar"
  - "ECO2 import shows alert with parsed results rather than overriding live metrics"
  - "AnimatedValue uses requestAnimationFrame with ease-out cubic for smooth number transitions"

patterns-established:
  - "ECO2 JSON schema: version/building/envelope/hvac/lighting/calculated structure"
  - "Multi-format import parsing: own format first, then generic ECO2 fields"

requirements-completed: []

duration: 3min
completed: 2026-03-27
---

# Phase 8 Plan 02: Energy Dashboard Cards + ECO2 Export/Import Summary

**Floating energy metric cards with grade badge, demand/CO2/heat-loss breakdown, and ECO2 JSON export/import for building energy assessment**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-27T03:24:05Z
- **Completed:** 2026-03-27T03:27:07Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- 4 compact energy cards at bottom-left of 3D viewer: grade badge (colored), annual demand (heating/cooling split), CO2 emissions (with tree equivalent), heat loss (element breakdown percentages)
- ECO2-compatible JSON export with full building envelope, HVAC, lighting, and calculated metrics
- ECO2 result import parser supporting both own export format and generic ECO2 result structures
- Smooth animated number transitions via requestAnimationFrame with ease-out cubic easing
- Full bilingual support (Korean/English) throughout all cards and buttons

## Task Commits

Each task was committed atomically:

1. **Tasks 1+2: Energy cards + ECO2 export/import** - `0c1dec3` (feat)
2. **Task 3: Integrate energy cards into building-scene** - `a98cdab` (feat)

## Files Created/Modified
- `src/components/viewer/energy-cards.tsx` - 4 floating metric cards with export/import buttons, animated values, skeleton loading
- `src/lib/energy/eco2-export.ts` - generateECO2Input() and downloadECO2File() for JSON export
- `src/lib/energy/eco2-import.ts` - parseECO2Result() multi-format JSON parser
- `src/components/viewer/building-scene.tsx` - Import and render EnergyCards when modelSource is parametric

## Decisions Made
- Combined Tasks 1 and 2 into a single commit because energy-cards.tsx directly imports eco2-export and eco2-import modules
- Export/Import buttons placed below the 4 cards rather than in the top-right toolbar to keep energy-related controls co-located
- ECO2 import displays results via alert rather than overriding the live calculated metrics (calculated values remain authoritative)
- AnimatedValue component uses requestAnimationFrame loop with cubic ease-out over 400ms for smooth number transitions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Energy dashboard fully functional with live-updating metrics
- ECO2 export/import pipeline ready for integration with external ECO2 software
- Future enhancement: import could update material properties from ECO2 calibration results

## Self-Check: PASSED

---
*Phase: 08-energy-calculation-eco2-export*
*Completed: 2026-03-27*
