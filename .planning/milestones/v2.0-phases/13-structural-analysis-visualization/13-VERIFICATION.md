---
phase: 13-structural-analysis-visualization
verified: 2026-03-28T14:22:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 13: Structural Analysis Visualization Verification Report

**Phase Goal:** Visual structural analysis overlay showing load paths, stress levels, and member sizing. Engineering feedback layer for the GX team.
**Verified:** 2026-03-28T14:22:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Animated load path arrows appear at each column position from roof to foundation when layer 15 is toggled on | VERIFIED | `layer-15-structural.ts` lines 136-198: per-column, per-floor CylinderGeometry shaft + ConeGeometry head, grouped under "structural-arrows", oriented downward (X-axis PI rotation) |
| 2  | Columns in the structural overlay are colored green, yellow, or red based on stress ratio | VERIFIED | InstancedMesh uses `setColorAt()` per instance with `getStressColor(ratio)` output; `instanceColor.needsUpdate = true` at line 128 |
| 3  | Hovering a structural column shows a tooltip with sizing recommendation and load info | VERIFIED | `structural-tooltip.tsx` raycasts against structural-column InstancedMesh in `useFrame`; reads `userData.sizingLabels[instanceId]`; renders `<Html>` tooltip |
| 4  | Layer 15 can be toggled on/off independently via LayerPanel | VERIFIED | Layer 15 registered in `LAYER_CONFIGS` (types.ts:183), `defaultVisibility[15] = false` (layer-store.ts:35), LayerManager registers `StructuralAnalysisLayer` at id 15 (layer-manager.ts:56) |
| 5  | Arrows pulse opacity 0.3-1.0 on a 2-second cycle | VERIFIED | ShaderMaterial fragmentShader: `pulse = 0.3 + 0.7 * (0.5 + 0.5 * sin(uTime * 3.14159))` at `layer-15-structural.ts:31`; uTime driven by LayerManager.updateAnimations() |
| 6  | Tooltip does not appear when in plan view mode | VERIFIED | `structural-tooltip.tsx:57,108`: guards on `viewMode === "plan"` from `usePlanStore` |
| 7  | Layer 15 structural overlay toggle present in LayerPanel | VERIFIED | `LAYER_CONFIGS[15]` = `{name: "Structural Analysis", nameKo: "구조 해석", color: "#f97316", animated: true}` in `types.ts:183-196`; `layers-tab.tsx:29` has `DENSITY_LABELS[15]` |
| 8  | LayerId type includes 15 and compiles without errors | VERIFIED | `types.ts:9`: `export type LayerId = 1 | 2 | ... | 14 | 15`; `ALL_LAYER_IDS` includes 15; `pnpm build` passes cleanly |
| 9  | Layer 15 appears in ALL_LAYER_IDS, LAYER_CONFIGS, and layer-store defaults | VERIFIED | `types.ts:12`: `ALL_LAYER_IDS` includes 15; `LAYER_CONFIGS[15]` defined; `layer-store.ts:35,41,47`: `defaultVisibility[15]=false`, `defaultGenerated[15]=false`, `defaultDensity[15]=50` |
| 10 | calcColumnLoad returns correct cumulative loads per KBC 2016 values | VERIFIED | 25/25 unit tests pass in `structural-codes.test.ts`; test covers 5-floor residential with 875 kN ground floor load |
| 11 | calcColumnCapacity returns correct kN value for given column size | VERIFIED | Test: 0.4m column → 1768 kN via `0.65 * 0.80 * 0.85 * 25 * Ag / 1000` formula |
| 12 | getRecommendedColumnSize returns correct KBC dimension string | VERIFIED | Tests: 200 kN → "300x300mm RC column", 500 kN → "400x400mm RC column", 1500 kN → "600x600mm RC column" |
| 13 | Stress color thresholds produce green < 60%, yellow 60-85%, red > 85% | VERIFIED | `structural-codes.ts:191-194`: `< 0.6 → 0x22c55e`, `< 0.85 → 0xeab308`, `>= 0.85 → 0xef4444` |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/structural-codes.ts` | KBC 2016 load tables, column capacity, sizing lookup, column position helper | VERIFIED | 195 lines; exports all 8 required symbols: `KBC_2016_DEAD_LOADS`, `KBC_2016_LIVE_LOADS`, `KBC_COLUMN_SIZING`, `calcColumnLoad`, `calcColumnCapacity`, `getRecommendedColumnSize`, `getColumnPositions`, `getStressColor` |
| `src/lib/layers/types.ts` | LayerId extended to include 15 | VERIFIED | Line 9: union includes `\| 15`; line 12: `ALL_LAYER_IDS` includes 15; lines 183-196: `LAYER_CONFIGS[15]` fully defined |
| `src/store/layer-store.ts` | Layer 15 in defaultVisibility, defaultGenerated, defaultDensity | VERIFIED | Lines 35, 41, 47: `15: false`, `15: false`, `15: 50` present in all three records |
| `src/lib/layers/layer-manager.ts` | StructuralAnalysisLayer registered for id 15 | VERIFIED | Line 23: import; line 56: `this.generators.set(15, new StructuralAnalysisLayer())` |
| `src/lib/__tests__/structural-codes.test.ts` | Unit tests for all structural-codes exports | VERIFIED | 242 lines; 25 tests — all pass covering load calc, capacity, sizing, stress color, column positions |
| `src/lib/layers/layer-15-structural.ts` | Full StructuralAnalysisLayer generator with arrows and stress-colored columns | VERIFIED | 244 lines (min_lines: 100); implements stress-colored InstancedMesh (A), animated ShaderMaterial arrows (B), foundation CircleGeometry markers (C) |
| `src/lib/layers/__tests__/layer-15-structural.test.ts` | Unit tests for StructuralAnalysisLayer generator output | VERIFIED | 165 lines (min_lines: 30); 9 tests — all pass covering group names, subgroups, InstancedMesh count, userData, dispose behavior |
| `src/components/viewer/structural-tooltip.tsx` | R3F hover tooltip component using drei Html | VERIFIED | 119 lines (min_lines: 40); uses `useFrame`, `useThree`, `Html`, `useLayerStore`, `usePlanStore` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/structural-codes.ts` | `src/lib/procedural/types.ts` | BuildingRecipe import | VERIFIED | `structural-codes.ts:5`: `import type { BuildingRecipe } from "@/lib/procedural/types"` |
| `src/lib/layers/layer-manager.ts` | `src/lib/layers/layer-15-structural.ts` | StructuralAnalysisLayer import | VERIFIED | `layer-manager.ts:23`: `import { StructuralAnalysisLayer } from "./layer-15-structural"` |
| `src/lib/layers/layer-15-structural.ts` | `src/lib/structural-codes.ts` | imports structural calculation functions | VERIFIED | Lines 9-13: imports `getColumnPositions`, `calcColumnLoad`, `calcColumnCapacity`, `getStressColor`, `getRecommendedColumnSize` — all actively called at lines 59, 65, 66/68, 110, 120 |
| `src/components/viewer/structural-tooltip.tsx` | `src/store/layer-store.ts` | useLayerStore visibility[15] check | VERIFIED | `structural-tooltip.tsx:21`: `useLayerStore((s) => s.visibility[15])` |
| `src/components/viewer/building-scene.tsx` | `src/components/viewer/structural-tooltip.tsx` | StructuralTooltip mounted inside Canvas | VERIFIED | `building-scene.tsx:42`: import; line 315: `<StructuralTooltip />` inside parametric Canvas block |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `layer-15-structural.ts` InstancedMesh | stress color per column | `calcColumnLoad()` + `calcColumnCapacity()` → ratio → `getStressColor()` | Yes — KBC 2016 formula with recipe inputs | FLOWING |
| `layer-15-structural.ts` sizingLabels | `userData.sizingLabels[idx]` | `getRecommendedColumnSize(floorLoad)` + load/ratio values computed from recipe | Yes — populated per instance at lines 119-121 | FLOWING |
| `structural-tooltip.tsx` label | `hovered.label` | Reads `mesh.userData.sizingLabels[instanceId]` on raycast hit | Yes — reads from populated InstancedMesh userData | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| `structural-codes.test.ts` — 25 unit tests | `pnpm vitest run src/lib/__tests__/structural-codes.test.ts` | 25/25 passed, 520ms | PASS |
| `layer-15-structural.test.ts` — 9 unit tests | `pnpm vitest run src/lib/layers/__tests__/layer-15-structural.test.ts` | 9/9 passed, 557ms | PASS |
| TypeScript build clean | `pnpm build` | Build completes with no TypeScript errors | PASS |
| Layer 15 visual rendering in browser | Toggle layer 15 in LayerPanel | Requires running app + R3F canvas | SKIP (human) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| STRUCT-01 | 13-02-PLAN.md | Display load path arrows from roof through columns to foundation | SATISFIED | `layer-15-structural.ts` "structural-arrows" group: per-column per-floor CylinderGeometry + ConeGeometry, X-axis PI rotation for downward direction |
| STRUCT-02 | 13-01-PLAN.md, 13-02-PLAN.md | Color-code structural members by stress level (green→yellow→red) | SATISFIED | InstancedMesh `setColorAt()` with `getStressColor(ratio)` at thresholds 0.60/0.85; `instanceColor.needsUpdate = true` |
| STRUCT-03 | 13-01-PLAN.md, 13-02-PLAN.md | Show structural member sizing recommendations based on span and load | SATISFIED | `getRecommendedColumnSize()` populates `userData.sizingLabels[idx]`; tooltip renders "NxNmm RC column | X kN | Y% cap." on hover |
| STRUCT-04 | 13-01-PLAN.md, 13-02-PLAN.md | Toggle structural analysis overlay on/off independently | SATISFIED | Layer 15 in `ALL_LAYER_IDS`, `LAYER_CONFIGS`, `defaultVisibility`; `useLayerStore(s => s.visibility[15])` gates both layer generator and tooltip |

**Note:** The REQUIREMENTS.md traceability table at lines 54-57 still shows "TBD / Pending" for all STRUCT rows. This is a documentation inconsistency — the `[x]` marks at lines 26-29 correctly reflect completion and the implementation is fully present. The traceability table was never updated after phase execution. This does not block the goal but should be noted as a doc debt item.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `structural-tooltip.tsx:109` | `return null` | Info | Correct conditional guard — returns null when `!isVisible \|\| !hovered \|\| viewMode === "plan"`. Not a stub. |

No blockers. No warnings. The `return null` is a legitimate conditional render, not a hollow implementation.

---

### Human Verification Required

#### 1. Load Path Arrow Animation

**Test:** Open app, search for a building, toggle Layer 15 (Structural Analysis) in the Layers tab.
**Expected:** Colored column overlays appear; white arrows at each column position per floor pulse opacity 0.3→1.0 on a 2-second cycle.
**Why human:** ShaderMaterial `uTime` animation requires a live R3F render loop; cannot verify via static analysis.

#### 2. Hover Tooltip

**Test:** With layer 15 active, hover over a stress-colored column in the 3D view.
**Expected:** Tooltip appears showing "NxNmm RC column | X kN | Y% cap." (e.g. "400x400mm RC column | 450 kN | 38% cap."). Tooltip disappears when cursor moves off the column.
**Why human:** Raycaster hit detection and drei `<Html>` positioning require a live Three.js scene.

#### 3. Plan View Mode Suppression

**Test:** With layer 15 active, switch to 2D Plan View.
**Expected:** Tooltip disappears and does not reappear on hover while in plan mode.
**Why human:** `usePlanStore` viewMode state transition requires user interaction in a live session.

---

### Gaps Summary

No gaps found. All 13 must-have truths are verified against actual codebase artifacts.

---

## Summary

Phase 13 delivers a complete structural analysis visualization layer. The KBC 2016 calculation library (`structural-codes.ts`) is fully implemented with 8 exports, tested by 25 passing unit tests. The layer system is correctly extended to support Layer 15 across `types.ts`, `layer-store.ts`, `layer-manager.ts`, and `layers-tab.tsx`. The full `StructuralAnalysisLayer` generator (replacing the Plan 01 stub) renders stress-colored InstancedMesh columns, animated ShaderMaterial load path arrows, and foundation markers. The `StructuralTooltip` R3F component correctly gates on `visibility[15]` and suppresses in plan view mode. The build is clean and all automated tests pass.

The one documentation gap (traceability table in REQUIREMENTS.md still showing "TBD / Pending") is cosmetic and does not affect functionality.

---

_Verified: 2026-03-28T14:22:00Z_
_Verifier: Claude (gsd-verifier)_
