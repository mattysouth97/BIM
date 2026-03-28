---
phase: "05"
plan: "01"
subsystem: layers
tags: [three.js, instanced-mesh, shader-material, zustand, layer-system]
dependency_graph:
  requires: [procedural-building, building-recipe]
  provides: [layer-type-system, layer-store, layer-generators-1-4, layer-manager]
  affects: [building-scene, procedural-building-model]
tech_stack:
  added: [shader-material-animations]
  patterns: [lazy-generation, layer-generator-interface, instanced-mesh-pipes]
key_files:
  created:
    - src/lib/layers/types.ts
    - src/lib/layers/layer-1-architecture.ts
    - src/lib/layers/layer-2-mep.ts
    - src/lib/layers/layer-3-bas.ts
    - src/lib/layers/layer-4-transport.ts
    - src/lib/layers/layer-manager.ts
    - src/store/layer-store.ts
  modified: []
decisions:
  - "LayerId as literal union type 1-10 for type safety"
  - "Non-persisted Zustand store for layer visibility (resets each session)"
  - "ShaderMaterial with uTime uniform for animated layers (BAS pulsing, transport movement)"
  - "PlaceholderLayer class for layers 5-10 to be replaced in Plan 02"
  - "Lazy generation pattern: generate on first visibility toggle, cache thereafter"
metrics:
  duration: "44s"
  completed: "2026-03-27"
---

# Phase 5 Plan 01: Layer Type System, Store, and Generators 1-4 Summary

Layer type system covering all 10 building systems with LayerGenerator interface, Zustand visibility store, 4 procedural generators using InstancedMesh and ShaderMaterial animations, plus LayerManager with lazy generation and centralized animation updates.

## What Was Built

### Task 1: Layer Type System and Zustand Store (d03638b)
- `LayerId` literal union type (1-10) and `LayerConfig` interface with id, name, color, icon, animated, description
- `LAYER_CONFIGS` constant with all 10 layer definitions matching the visual language spec
- `LayerGenerator` interface requiring `generate(recipe)` and `dispose()`
- `useLayerStore` Zustand store (non-persisted) with visibility/generated records, toggleLayer, setLayerVisible, setGenerated, resetAll
- Default state: only layer 1 visible, all layers ungenerated

### Task 2: Layer Generators 1-4 (0e44a68)
- **Layer 1 (Architecture):** EdgesGeometry floor wireframes with LineBasicMaterial (gray, 40% opacity)
- **Layer 2 (MEP):** InstancedMesh pipes in 3 colors (hot red, cold blue, power yellow), vertical risers at 4 corners, junction boxes every 3rd floor
- **Layer 3 (BAS/IoT):** ShaderMaterial sensor nodes with uTime-driven green pulsing glow, LineDashedMaterial connections between sensors every 2 floors
- **Layer 4 (Transport):** Elevator shaft wireframes (1 shaft if <10 floors, 2 if >=10), ShaderMaterial animated elevator cars in amber

### Task 3: LayerManager Class (4e46e82)
- `LayerManager` with generators Map, groups cache Map, parent THREE.Group("building-layers")
- `getOrGenerate()`: lazy generation on first request, cached thereafter, auto-adds to parent group
- `setVisible()`: toggle group.visible for generated layers
- `updateAnimations(elapsedTime)`: traverses visible groups, updates ShaderMaterial uTime uniforms
- `dispose()`: disposes all generators, clears caches, removes children from parent
- PlaceholderLayer for layers 5-10 returning empty named groups

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- All 7 new files exist in src/lib/layers/ and src/store/
- `pnpm build` passes with no type errors
- Each layer generator produces a named THREE.Group
- LayerManager lazy-generates and caches layer groups
- LAYER_CONFIGS has exactly 10 entries with correct colors

## Commits

| Task | Commit  | Message                                                  |
|------|---------|----------------------------------------------------------|
| 1    | d03638b | feat(05-01): layer type system and Zustand store         |
| 2    | 0e44a68 | feat(05-01): layer generators 1-4 (architecture, MEP, BAS, transport) |
| 3    | 4e46e82 | feat(05-01): LayerManager with lazy generation and animation updates |

## Known Stubs

None - all generators produce real geometry. Layers 5-10 use PlaceholderLayer (empty groups) by design; Plan 02 will implement their generators.

## Self-Check: PASSED

- All 7 created files: FOUND
- All 3 commit hashes (d03638b, 0e44a68, 4e46e82): FOUND
- pnpm build: PASSED
