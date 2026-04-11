---
phase: 21-composite-pipeline
plan: "01"
subsystem: data-fetching
tags: [react-query, footprint, parallel-fetch, useQueries]
dependency_graph:
  requires: []
  provides: [useCompositeBuilding, footprintData-prop-on-BuildingScene]
  affects: [building/[id]/page.tsx, BuildingScene]
tech_stack:
  added: []
  patterns: [useQueries parallel fetch, prop-drilling footprintData from page to scene]
key_files:
  created:
    - src/hooks/use-composite-building.ts
  modified:
    - src/app/building/[id]/page.tsx
    - src/components/viewer/building-scene.tsx
decisions:
  - "useCompositeBuilding accepts optional address param; footprint query fires in same useQueries call when address is known"
  - "Page hoists footprint fetch via useBuildingFootprint(address) after title resolves; BuildingScene receives footprintData as prop"
  - "BuildingScene keeps internal useBuildingFootprint as fallback (disabled when prop provided) — full removal in Plan 02"
  - "isError covers only ledger queries (0-3); footprint errors are soft and do not block the page error overlay"
metrics:
  duration_minutes: 12
  completed: "2026-04-11T20:49:39Z"
  tasks_completed: 2
  files_changed: 3
---

# Phase 21 Plan 01: Composite Pipeline — Parallel Fetch Hoist Summary

**One-liner:** `useCompositeBuilding` hook + page-level `useBuildingFootprint` call that passes `footprintData` as a prop to `BuildingScene`, decoupling the footprint fetch from scene mount.

## What Was Built

### Task 1: useCompositeBuilding hook (`src/hooks/use-composite-building.ts`)

A single `useQueries` call grouping all 5 queries together:

- Queries 0-3: `title`, `recap`, `floors`, `areas` (ledger — enabled when `sigunguCd` + `bjdongCd` present)
- Query 4: `footprint` (VWorld — enabled when `address` is non-empty, `staleTime: 30 min`, `retry: 1`)

Exported interface `CompositeBuildingResult` exposes:
- `title | recap | floors | areas | footprintData` — individual query results
- `isLoading` — true while ANY of the 5 queries is pending
- `isFootprintLoading` — footprint-only loading flag for granular UI feedback
- `isError` — true only if a ledger query (0-3) errors; footprint errors are soft
- `errors` — error array for ledger queries only

### Task 2: Page-level footprint hoist (`src/app/building/[id]/page.tsx`)

- Replaced `useBuildingDetail` import with `useCompositeBuilding`
- Derives `address` from `titleData?.platPlcNm || titleData?.newPlatPlc` once title resolves
- Calls `useBuildingFootprint(address)` at page scope — fires as soon as address is known
- Passes `footprintData={footprintResult.data}` as a new prop to `BuildingScene`
- `compositeLoading` combines ledger + footprint loading for toolbar spinner

### BuildingScene prop interface update (`src/components/viewer/building-scene.tsx`)

- Added `footprintData?: FootprintResult` to `BuildingSceneProps`
- When prop is provided, internal `useBuildingFootprint` is disabled (address passed as `undefined`)
- When prop is absent, falls back to internal fetch — maintains self-contained behavior until Plan 02

## Deviations from Plan

### Auto-added — FootprintResult type local to BuildingScene

**Found during:** Task 2 (wiring BuildingSceneProps)
**Issue:** `building-scene.tsx` needed a `FootprintResult` type for the new prop but the type was only defined in `use-building-footprint.ts` as a non-exported interface.
**Fix:** Declared a local `FootprintResult` interface in `building-scene.tsx` matching the shape (`polygon: number[][][] | null; error: string | null`). This avoids cross-module coupling until Plan 02 consolidates types.
**Files modified:** `src/components/viewer/building-scene.tsx`
**Commit:** c949465

## Known Stubs

None. The footprint prop pipeline is fully wired — page fetches, page passes, scene consumes. The internal fallback in BuildingScene is intentional and documented (Plan 02 removes it).

## Self-Check

- [x] `src/hooks/use-composite-building.ts` exists and exports `useCompositeBuilding` and `CompositeBuildingResult`
- [x] `src/app/building/[id]/page.tsx` imports `useCompositeBuilding` and calls `useBuildingFootprint` at page level
- [x] `BuildingScene` receives `footprintData` as a prop
- [x] `pnpm build` passes with zero TypeScript errors (Compiled successfully in 6.0s, TypeScript finished in 5.4s)
- [x] Commit c949465 exists

## Self-Check: PASSED
