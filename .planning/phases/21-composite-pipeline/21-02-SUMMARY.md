---
phase: 21-composite-pipeline
plan: "02"
subsystem: viewer
tags: [loading-overlay, prop-drilling, footprint, composite-pipeline]
dependency_graph:
  requires: [21-01]
  provides: [BuildingScene-prop-driven-footprint, composite-loading-overlay]
  affects: [building/[id]/page.tsx, BuildingScene]
tech_stack:
  added: []
  patterns: [prop-driven data consumption, conditional overlay, Loader2 spinner]
key_files:
  created: []
  modified:
    - src/components/viewer/building-scene.tsx
    - src/app/building/[id]/page.tsx
decisions:
  - "BuildingScene no longer fetches footprint internally — all data flows via props from page"
  - "Loading overlay uses absolute inset-0 z-20 so it covers the Canvas without blocking layout"
  - "isCompositeLoading is optional so BuildingScene remains usable in standalone/campus contexts without a loading flag"
  - "address variable removed from BuildingScene (was only used for the now-removed internal hook call)"
metrics:
  duration_minutes: 8
  completed: "2026-04-11T20:54:21Z"
  tasks_completed: 1
  files_changed: 2
---

# Phase 21 Plan 02: Composite Pipeline — BuildingScene Prop Wiring Summary

**One-liner:** BuildingScene now reads `footprintData` exclusively from props (removing internal `useBuildingFootprint`), with a `Loader2` overlay gated on `isCompositeLoading` covering the Canvas during fetch.

## What Was Built

### Task 1: Remove internal fetch, consume prop, add loading overlay

Three targeted changes to `src/components/viewer/building-scene.tsx`:

**Change 1 — Props interface extended:**
- Replaced stale comment in `footprintData` JSDoc (removed "Plan 02 will remove..." note)
- Added `isCompositeLoading?: boolean` prop with JSDoc explaining its purpose

**Change 2 — Internal hook removed:**
- Deleted `useBuildingFootprint` import (`lucide-react/Loader2` import added in its place)
- Deleted `address` variable (was only used to conditionally pass to the hook)
- Deleted `useBuildingFootprint(...)` call and its `footprintDataInternal` binding
- Deleted the `footprintDataProp ?? footprintDataInternal` merge line
- Replaced with: `const footprintPolygon = footprintDataProp?.polygon ?? undefined;`
- Fallback behaviour preserved: `undefined` polygon leaves `geo.footprintPolygon` unset → rectangular box

**Change 3 — Loading overlay:**
```tsx
{isCompositeLoading && (
  <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">건물 데이터 로딩 중…</p>
    </div>
  </div>
)}
```
Placed inside `<div className="relative flex-1 min-h-0">` above the `ViewerErrorBoundary` / `Canvas`, so `z-20` covers the R3F canvas during fetch and disappears when `isCompositeLoading` becomes false.

**Page wiring (`src/app/building/[id]/page.tsx`):**
- Added `isCompositeLoading={compositeLoading}` prop to the `<BuildingScene>` call
- `compositeLoading` was already derived in Plan 01 as `isLoading || footprintResult.isLoading`

### Verification

- `pnpm build` — zero TypeScript errors (Compiled successfully, TypeScript finished in 4.6s)
- `pnpm lint` — zero errors (53 pre-existing warnings, all unrelated to this plan)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All four success criteria are implemented in code:
1. `BuildingScene` does not import or call `useBuildingFootprint`
2. `footprintData` is read from props
3. Loading overlay (`Loader2` + "건물 데이터 로딩 중…") renders when `isCompositeLoading=true`
4. Rectangular fallback preserved when footprint absent or errored

Visual verification (checkpoint:human-verify) is still pending — see checkpoint section below.

## Checkpoint: Human Verify Required

**Status:** Awaiting visual verification

The automated portion of this plan is complete. A human needs to verify:
1. Both `/api/bldrgst/title` and `/api/vworld/footprint` network requests start simultaneously
2. Loading spinner visible during fetch, disappears when 3D scene renders
3. Composite footprint shape renders (not just a box) on a real building
4. Blocking the VWorld footprint URL results in rectangular box, no error banner

See plan file for full verification steps.

## Self-Check

- [x] `src/components/viewer/building-scene.tsx` does not import `useBuildingFootprint`
- [x] `BuildingScene` reads `footprintPolygon` from `footprintDataProp?.polygon`
- [x] `isCompositeLoading` prop present in interface and destructured in function signature
- [x] Loading overlay renders conditionally on `isCompositeLoading`
- [x] `src/app/building/[id]/page.tsx` passes `isCompositeLoading={compositeLoading}`
- [x] `pnpm build` passes with zero TypeScript errors
- [x] Commit debefa4 exists

## Self-Check: PASSED
