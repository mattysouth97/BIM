---
phase: 18-guidance-energy-feedback
plan: 03
subsystem: ui
tags: [react, hooks, energy, zustand, tailwind]

# Dependency graph
requires:
  - phase: 18-guidance-energy-feedback plan 01
    provides: useEnergyMetrics hook with live demand/CO2 computation from material and recipe stores
provides:
  - useEnergyDelta hook: snapshot/delta computation wrapping useEnergyMetrics
  - Inline delta annotations on thermal conductivity slider in WallProperties panel
affects: [properties-panel, energy-feedback, configure-stage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Snapshot-on-focus delta: call snapshot() on onFocus/onPointerDown, read demandDelta for signed kWh/m2 change"
    - "Auto-dismiss via useEffect timeout (4s) — avoids stale annotations without user action"

key-files:
  created:
    - src/hooks/use-energy-delta.ts
  modified:
    - src/components/workspace/properties-panel.tsx

key-decisions:
  - "useEnergyDelta stores snapshot in useRef (no re-render on snapshot) — only setHasSnapshot triggers re-render to recompute useMemo delta"
  - "CO2Result uses co2PerSqm field (not emissionsPerSqm) — fixed during Task 1 verification"
  - "Delta annotation on label row (not below input) — keeps input field uncluttered while keeping annotation contextually adjacent"

patterns-established:
  - "Energy-affecting inputs: add onFocus + onPointerDown calling snapshot(), render delta span next to label"

requirements-completed: [ENRG-02]

# Metrics
duration: 3min
completed: 2026-03-30
---

# Phase 18 Plan 03: Energy Delta Annotations Summary

**useEnergyDelta hook with snapshot/auto-dismiss wired into WallProperties thermal conductivity input showing signed kWh/m2 impact in green/amber**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-30T07:53:56Z
- **Completed:** 2026-03-30T07:56:31Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `useEnergyDelta` hook wrapping `useEnergyMetrics` with snapshot/delta/auto-dismiss logic
- Wired inline delta annotation onto WallProperties thermal conductivity label — shows `+X.X kWh/m2` or `-X.X kWh/m2`
- Color-coded: green for demand reduction (improvement), amber for demand increase (degradation)
- Snapshot taken on slider focus/pointerdown; auto-clears after 4 seconds of inactivity

## Task Commits

1. **Task 1: Create useEnergyDelta hook** - `e462480` (feat)
2. **Task 2: Wire delta annotations into properties panel sliders** - `cae8a4b` (feat)

**Plan metadata:** (docs commit pending)

## Files Created/Modified
- `src/hooks/use-energy-delta.ts` — New hook: snapshot + delta computation + 4s auto-dismiss on top of useEnergyMetrics
- `src/components/workspace/properties-panel.tsx` — WallProperties updated to accept buildingPk, call useEnergyDelta, display signed delta next to thermal conductivity label

## Decisions Made
- `useEnergyDelta` stores snapshot in `useRef` (avoids unnecessary re-renders) while using `useState<boolean>` for `hasSnapshot` so that `useMemo` recomputes the delta correctly.
- Auto-dismiss timer resets on each delta change — if user keeps interacting, annotation stays; 4s after last change it clears.
- Delta annotation placed inline next to the Label (not below the input) to keep the input row clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong CO2 field name**
- **Found during:** Task 1 TypeScript verification
- **Issue:** Hook referenced `co2.emissionsPerSqm` but `CO2Result` interface defines the field as `co2PerSqm`
- **Fix:** Changed reference to `current.co2.co2PerSqm` and `snap.co2.co2PerSqm`
- **Files modified:** src/hooks/use-energy-delta.ts
- **Verification:** `npx tsc --noEmit` showed zero errors in use-energy-delta.ts after fix
- **Committed in:** e462480 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug: wrong interface field name)
**Impact on plan:** Fix was essential for correct delta computation. No scope creep.

## Issues Encountered
None beyond the field name mismatch documented above.

## User Setup Required
None - no external service configuration required.

## Known Stubs
- `buildingPk ?? ""` in WallProperties: empty string pk means `useEnergyDelta` will return null metrics (no snapshot possible) until a real building PK is wired in. This is intentional — same placeholder pattern established in Phase 17 for SceneOutliner and StatusBar. The delta UI gracefully hides when `demandDelta === null`.

## Self-Check: PASSED

All created files verified on disk. Both task commits exist (e462480, cae8a4b).

## Next Phase Readiness
- useEnergyDelta hook ready for reuse on any future energy-affecting slider (recipe overrides, HVAC, insulation)
- Properties panel pattern established: energy-affecting inputs add `onFocus`/`onPointerDown → snapshot()` + label-adjacent delta span
- Plan 18-04 or integration phase can wire real buildingPk to unlock live delta feedback

---
*Phase: 18-guidance-energy-feedback*
*Completed: 2026-03-30*
