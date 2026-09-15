---
phase: 34
plan: "01"
subsystem: sheets
tags: [sheet-composition, pdf, title-block, zustand, react-pdf]
dependency_graph:
  requires: []
  provides: [sheet-types, sheet-store, korean-title-block]
  affects: [pdf-renderer.tsx (future integration)]
tech_stack:
  added: []
  patterns: [zustand-persist, react-pdf-renderer-elements]
key_files:
  created:
    - src/lib/bim/sheets/sheet-types.ts
    - src/lib/bim/sheets/sheet-store.ts
    - src/lib/bim/sheets/korean-title-block.ts
    - src/lib/bim/sheets/__tests__/sheet-store.test.ts
  modified: []
decisions:
  - "Used React.createElement() in korean-title-block.ts instead of JSX to avoid requiring a tsconfig jsx transform in a .ts file"
  - "renderKoreanTitleBlock accepts an optional locale override so callers can force English without mutating config"
  - "getSheetDimensions() helper keeps orientation logic out of consumers"
  - "selectActiveSheet exported as a plain selector function rather than a hook-internal selector for testability"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-12"
  tasks_completed: 5
  files_created: 4
---

# Phase 34 Plan 01: Sheet Data Model + Korean Title Block Summary

Sheet data model (types + Zustand store) and Korean GX audit title block implemented; PDF integration deferred to follow-up plan per scope boundary.

## What Was Built

### `src/lib/bim/sheets/sheet-types.ts`
- `PageSize` union (`"A0" | "A1" | "A2" | "A3" | "A4"`) with `PAGE_SIZE_MM` lookup table (ISO 216 mm dimensions)
- `ViewportBlock` interface: id, kind (`"view" | "schedule"`), targetId, x/y/width/height, optional scale and title
- `TitleBlockConfig` interface: projectName, buildingName, architectName, auditorName, date, sheetNumber, revision, locale (`"ko" | "en"`)
- `SheetDefinition` interface: id, name, pageSize, orientation, viewports array, titleBlock
- `getSheetDimensions()` helper that swaps width/height for landscape orientation

### `src/lib/bim/sheets/sheet-store.ts`
- Zustand `persist` store keyed as `"bim-sheet-store"`
- State: `sheets: SheetDefinition[]`, `activeSheetId: string | null`
- Sheet actions: `addSheet`, `removeSheet`, `updateSheet`, `setActiveSheet`
- Viewport actions: `addViewport`, `removeViewport`, `updateViewport`
- Auto-selects first added sheet as active
- `selectActiveSheet` plain selector exported for use outside hooks

### `src/lib/bim/sheets/korean-title-block.ts`
- `renderKoreanTitleBlock(config, locale?)` returns `React.ReactElement` using `@react-pdf/renderer` primitives
- GX audit standard layout: blue accent stripe → platform banner → 4-row info grid (project/building/architect/auditor) → bottom stamp row (sheet number / revision / date)
- Bilingual label map (`LABELS.ko` / `LABELS.en`) for all field labels
- Uses `React.createElement()` (not JSX) so the file stays `.ts` without jsx compiler config changes
- Caller is responsible for font registration (noted in file header)

### `src/lib/bim/sheets/__tests__/sheet-store.test.ts`
- 19 tests across 6 `describe` blocks
- Covers: addSheet (3), removeSheet (4), updateSheet (3), addViewport (2), removeViewport (2), updateViewport (4), setActiveSheet (2)
- All 19 tests pass (`pnpm test src/lib/bim/sheets`)

## Verification

```
pnpm test src/lib/bim/sheets
 Test Files  1 passed (1)
      Tests  19 passed (19)

npx tsc --noEmit | grep src/lib/bim/sheets
(no output — zero type errors in new files)
```

## Deviations from Plan

### Auto-fixed Issues

None.

### Scope notes

- Pre-existing type errors exist in unrelated test files (`src/lib/__tests__/`, `src/lib/layers/__tests__/`, etc.) — confirmed pre-existing, not introduced by this plan. Logged as out-of-scope per deviation scope boundary.
- `pdf-renderer.tsx` was NOT modified per plan instructions.
- `sheet-editor.tsx` UI was NOT created per plan instructions.

## Known Stubs

None. This plan delivers a pure data model and rendering primitive — no UI or PDF wiring yet. The `renderKoreanTitleBlock` function is fully functional; it will be consumed by `pdf-renderer.tsx` integration in the follow-up plan.

## Threat Flags

None. No network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- `src/lib/bim/sheets/sheet-types.ts` — created and type-checks clean
- `src/lib/bim/sheets/sheet-store.ts` — created and type-checks clean
- `src/lib/bim/sheets/korean-title-block.ts` — created and type-checks clean
- `src/lib/bim/sheets/__tests__/sheet-store.test.ts` — created, 19/19 tests pass
