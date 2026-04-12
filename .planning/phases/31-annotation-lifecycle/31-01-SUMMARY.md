---
phase: 31
plan: "01"
subsystem: annotations
tags: [store, zustand, persist, types, discriminated-union]
dependency_graph:
  requires: [phase-30-element-ids]
  provides: [annotation-store, annotation-types]
  affects: [annotation-lifecycle, scene-rendering]
tech_stack:
  added: []
  patterns: [zustand-persist-partialize, discriminated-union, branded-types]
key_files:
  created:
    - src/lib/bim/annotations/annotation-types.ts
    - src/store/annotation-store.ts
    - src/store/__tests__/annotation-store.test.ts
  modified:
    - src/lib/undo/commands/component-commands.ts
decisions:
  - "ElementId typed as branded string (not imported from Phase 30 which is not yet implemented) — forward-compatible placeholder"
  - "Persist partializes only annotations array; selectedAnnotationId is ephemeral UI state"
  - "component-commands.ts stubbed out (component-store deleted in v5.0 cleanup) to unblock build"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-12"
  tasks_completed: 1
  files_created: 3
  files_modified: 1
---

# Phase 31 Plan 01: Annotation Store + Types Summary

Annotation store with ElementId anchors and Zustand persist — ready for the 4 stub rendering functions to be wired.

## What Was Built

### `src/lib/bim/annotations/annotation-types.ts`

Discriminated union type definitions for the annotation data model:

- `AnnotationInstance` = `DimensionAnnotation | AreaLabelAnnotation | LevelMarkerAnnotation | SectionPlaneAnnotation`
- Each variant has `{ id, kind, anchorElementId?, params, createdAt }` shape
- Per-kind param shapes: `DimensionParams`, `AreaLabelParams`, `LevelMarkerParams`, `SectionPlaneParams`
- `ElementId` branded string type (forward-compatible with Phase 30 element-id.ts)
- `isAnnotationKind<K>()` type narrowing helper
- `toVector3()` helper converting stored `{x,y,z}` objects to `THREE.Vector3`

### `src/store/annotation-store.ts`

Zustand store with persist middleware:

- State: `annotations: AnnotationInstance[]`, `selectedAnnotationId: string | null`
- Actions: `addAnnotation`, `removeAnnotation`, `updateAnnotation`, `clearAll`, `removeByAnchor`, `selectAnnotation`
- `removeByAnchor(elementId)` — removes all annotations anchored to a deleted element (Phase 31 success criterion 5)
- `removeAnnotation` and `removeByAnchor` both auto-clear `selectedAnnotationId` when the selected annotation is removed
- Persists to localStorage key `bim-annotation-store`; `partialize` includes only `annotations` (selection is ephemeral)
- Re-exports all types from `annotation-types.ts` for single-import convenience

### `src/store/__tests__/annotation-store.test.ts`

22 tests across 6 describe blocks:
- `addAnnotation` — all 4 kinds, insertion order
- `removeAnnotation` — by id, no-op, selectedId clearing
- `updateAnnotation` — params patch, anchorElementId patch, isolation
- `clearAll` — empties annotations + clears selection
- `removeByAnchor` — multi-annotation removal, no-op, selection clearing, sibling safety
- `selectAnnotation` + persist partialize round-trip

All 22 tests pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stubbed dead `component-commands.ts` to unblock build**
- **Found during:** `pnpm build` after task completion
- **Issue:** `src/lib/undo/commands/component-commands.ts` imported `@/store/component-store` and `@/lib/components/component-types`, both of which were deleted during v5.0 cleanup. This caused a TypeScript build error unrelated to our changes.
- **Fix:** Replaced file contents with `export {}` stub and explanatory comment. File is not imported anywhere in the codebase.
- **Files modified:** `src/lib/undo/commands/component-commands.ts`
- **Note:** Build could not be verified due to a stale `.next/lock` file from a prior crashed build process. TypeScript type-check (`tsc --noEmit`) confirmed zero errors in our new files. Manual build required: `rm .next/lock && pnpm build`.

## Known Stubs

None — this plan creates pure data-layer types and store with no rendering. The 4 annotation stub rendering functions (`dimension-line.ts`, `area-label.ts`, `level-marker.ts`, `section-cut.ts`) are intentionally untouched per plan scope.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check

| Claim | Verified |
|-------|---------|
| `src/lib/bim/annotations/annotation-types.ts` created | FOUND |
| `src/store/annotation-store.ts` created | FOUND |
| `src/store/__tests__/annotation-store.test.ts` created | FOUND |
| 22 tests pass | PASSED (vitest output confirmed) |
| No TS errors in new files | PASSED (tsc --noEmit grep: 0 matches) |
| component-commands.ts stubbed | FOUND |

## Self-Check: PASSED
