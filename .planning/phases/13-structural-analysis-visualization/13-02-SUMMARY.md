---
phase: 13-structural-analysis-visualization
plan: "02"
subsystem: structural-analysis-layer
tags: [three.js, r3f, structural, tdd, instanced-mesh, shader-material, layer-system]
dependency_graph:
  requires: ["13-01"]
  provides: ["StructuralAnalysisLayer full impl", "StructuralTooltip R3F component"]
  affects: ["building-scene.tsx", "layer-15 visual output"]
tech_stack:
  added: []
  patterns:
    - "InstancedMesh with setColorAt for per-instance stress color coding"
    - "ShaderMaterial uTime pulse (0.3-1.0, 2s cycle) for animated arrows"
    - "useFrame raycaster with 3rd-frame throttle for hover tooltip"
    - "drei Html for world-space tooltip"
    - "TDD: vitest RED→GREEN cycle for Three.js generator"
key_files:
  created:
    - src/lib/layers/__tests__/layer-15-structural.test.ts
    - src/lib/layers/layer-15-structural.ts
    - src/components/viewer/structural-tooltip.tsx
  modified:
    - src/components/viewer/building-scene.tsx
decisions:
  - "Arrow geometry uses individual Meshes grouped per floor (not InstancedMesh) — per research recommendation for <600 arrows, avoids per-instance ShaderMaterial complexity"
  - "Single shared ShaderMaterial for all arrow meshes — uTime updated by LayerManager.updateAnimations() automatically"
  - "Raycaster throttled to every 3rd frame in useFrame — balances responsiveness vs GPU cost"
  - "Arrow Y position: floor.y + slab.thickness + 0.1 (just above slab), oriented downward via X-axis PI rotation"
metrics:
  duration: 165s
  completed: "2026-03-28"
  tasks: 2
  files: 4
---

# Phase 13 Plan 02: Structural Analysis Visualization (Visual Layer) Summary

**One-liner:** Full StructuralAnalysisLayer with stress-colored InstancedMesh columns, pulsing ShaderMaterial load-path arrows, foundation discs, and StructuralTooltip R3F hover component showing KBC 2016 sizing data.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | TDD — Write layer-15-structural tests then implement full generator | baff321 | layer-15-structural.ts, __tests__/layer-15-structural.test.ts |
| 2 | Create StructuralTooltip R3F component and mount in building-scene.tsx | 0b1aa59 | structural-tooltip.tsx, building-scene.tsx |

## What Was Built

### StructuralAnalysisLayer (layer-15-structural.ts)

Replaces the Plan 01 stub with a full three-part generator:

**A. Stress-Colored Column Overlay**
- InstancedMesh with BoxGeometry(1,1,1) scaled per column instance
- `setColorAt()` called per instance with color from `getStressColor(ratio)` — green < 60%, yellow 60-85%, red ≥ 85%
- `instanceColor.needsUpdate = true` after all color assignments
- `userData.sizingLabels[idx]` stores "NxNmm RC column | X kN | Y% cap." per instance
- Semi-transparent (opacity 0.7) so underlying building columns show through
- Floor load from `calcColumnLoad()`, capacity from `calcColumnCapacity()`, stress ratio per floor

**B. Animated Load Path Arrows**
- Per-floor, per-column: CylinderGeometry shaft + ConeGeometry head
- ArrowHeight proportional to floor load: `0.3 + 1.2 * (load - min) / (range || 1)`
- ShaderMaterial with `uTime` uniform: `pulse = 0.3 + 0.7 * (0.5 + 0.5 * sin(uTime * PI))`
- Arrows point downward (X-axis PI rotation) — load flows roof → foundation
- Shared material across all arrow meshes; `uTime` updated by LayerManager automatically
- Grouped under "structural-arrows" named sub-group

**C. Foundation Markers**
- CircleGeometry(column.size * 1.5, 16) at y=0 per column position
- Rotated -PI/2 on X axis (horizontal disc), gray #6b7280, opacity 0.5
- Grouped under "structural-foundations" named sub-group

### StructuralTooltip (structural-tooltip.tsx)

- `useLayerStore(s => s.visibility[15])` gates activation
- `usePlanStore(s => s.viewMode)` — returns null in "plan" mode
- `useEffect` registers `pointermove` on `gl.domElement` → updates `mouse` ref
- `useFrame` throttled (every 3rd frame): raycasts against structural-column InstancedMesh
- Reads `hit.instanceId` → `mesh.userData.sizingLabels[instanceId]`
- Renders `<Html position={hit.point} center>` with zinc-900 tooltip div

### building-scene.tsx

- Added `import { StructuralTooltip } from "./structural-tooltip"`
- Mounted `<StructuralTooltip />` inside the Canvas parametric block after `<BuildingLayers />`

## Test Results

9 unit tests passing covering:
1. Group named "layer-15-structural" returned
2. "structural-arrows" sub-group present
3. "structural-foundations" sub-group present
4. InstancedMesh present (stress-colored columns)
5. `userData.type === "structural-column"`
6. instanceCount divisible by aboveFloors.length
7. `userData.sizingLabels.length === im.count`
8. dispose() then double-dispose safe; generate() after dispose works
9. structural-arrows group has children

## Verification

- `pnpm vitest run src/lib/layers/__tests__/layer-15-structural.test.ts` — 9/9 pass
- `pnpm build` — clean, no TypeScript errors

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all functionality fully wired. sizingLabels read from InstancedMesh userData, tooltip reads from raycaster hit.

## Self-Check: PASSED
