---
phase: 13-structural-analysis-visualization
plan: "01"
subsystem: structural-analysis
tags: [kbc-2016, structural, layer-system, typescript, vitest]
dependency_graph:
  requires: []
  provides: [structural-codes-ts, layer-15-type-foundation]
  affects: [layer-manager, layer-store, layers-tab, procedural-building]
tech_stack:
  added: []
  patterns: [tdd-red-green, pure-functions, kbc-2016-tables]
key_files:
  created:
    - src/lib/structural-codes.ts
    - src/lib/layers/layer-15-structural.ts
    - src/lib/__tests__/structural-codes.test.ts
  modified:
    - src/lib/layers/types.ts
    - src/store/layer-store.ts
    - src/lib/layers/layer-manager.ts
    - src/components/viewer/config-tabs/layers-tab.tsx
decisions:
  - KBC 2016 f'c = 25 MPa standard concrete for all RC column capacity calculations
  - Stress color thresholds: green < 60%, yellow 60-85%, red > 85% (per user plan)
  - getColumnPositions mirrors structure-generator.ts exactly to prevent position drift
  - Layer 15 stub satisfies LayerGenerator interface; full visual generator in Plan 02
  - Orange #f97316 for layer 15 (engineering analysis distinct from safety red / power yellow)
metrics:
  duration: 227s
  completed: "2026-03-28"
  tasks: 2
  files: 7
---

# Phase 13 Plan 01: Structural Analysis Layer Foundation Summary

Established the KBC 2016 structural calculation library and extended the 14-layer building system to include Layer 15 (Structural Analysis), with all 8 pure calculation functions tested and a stub generator enabling compile-clean integration.

## Tasks Completed

### Task 1: structural-codes.ts with KBC 2016 data and calculation functions (TDD)

**RED:** Wrote 25 failing tests in `structural-codes.test.ts` covering all 8 exports.
**GREEN:** Implemented `structural-codes.ts` with exact KBC 2016 values. All 25 tests pass.

Exports implemented:
- `KBC_2016_DEAD_LOADS` — dead loads by mainPurpsCd (01000/02000/14000/10000/default)
- `KBC_2016_LIVE_LOADS` — live loads by mainPurpsCd + "roof" key
- `KBC_COLUMN_SIZING` — ascending table from 300mm (200kN) to 700mm (Infinity)
- `getColumnPositions(recipe)` — mirrors structure-generator.ts grid logic verbatim
- `calcColumnLoad(recipe, columnCount)` — per-floor cumulative load array (kN)
- `calcColumnCapacity(recipe)` — Pu = 0.65 × 0.80 × 0.85 × 25 × Ag / 1000 (kN)
- `getRecommendedColumnSize(loadKN)` — size string from KBC_COLUMN_SIZING lookup
- `getStressColor(ratio)` — 0x22c55e / 0xeab308 / 0xef4444 at 0.6 / 0.85 thresholds

Commit: `0e37ee1`

### Task 2: Extend LayerId to 15 across types, store, and manager

- `src/lib/layers/types.ts`: LayerId union extended to `1 | ... | 15`; ALL_LAYER_IDS includes 15; LAYER_CONFIGS entry 15 added (name: "Structural Analysis", nameKo: "구조 해석", color: "#f97316", category: "Engineering", animated: true)
- `src/store/layer-store.ts`: defaultVisibility/Generated/Density all include `15: false`/`15: 50`
- `src/lib/layers/layer-15-structural.ts`: stub StructuralAnalysisLayer implementing LayerGenerator (returns empty Group, proper dispose traversal)
- `src/lib/layers/layer-manager.ts`: imports and registers StructuralAnalysisLayer at id 15
- `pnpm build` passes with no TypeScript errors

Commit: `39a0d61`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] DENSITY_LABELS in layers-tab.tsx missing entry 15**
- **Found during:** Task 2 — TypeScript build failure
- **Issue:** `DENSITY_LABELS: Record<LayerId, {...}>` did not include key `15` after LayerId was extended
- **Fix:** Added `15: { ko: "분석 밀도", en: "Analysis Density" }` to DENSITY_LABELS
- **Files modified:** `src/components/viewer/config-tabs/layers-tab.tsx`
- **Commit:** `39a0d61`

## Known Stubs

- `src/lib/layers/layer-15-structural.ts` — `generate()` returns an empty Group with no geometry. Intentional: full visual generator (load path arrows, stress-colored columns, sizing labels) is implemented in Plan 02.

## Self-Check: PASSED

Files created/exist:
- FOUND: src/lib/structural-codes.ts
- FOUND: src/lib/__tests__/structural-codes.test.ts
- FOUND: src/lib/layers/layer-15-structural.ts

Commits exist:
- FOUND: 0e37ee1
- FOUND: 39a0d61

Tests: 25/25 passing
Build: clean (no TypeScript errors)
