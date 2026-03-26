# Project State

## Current Phase
Phase 5: 10-Layer Building Systems Visualization

## Current Plan
Plan 02 (next)

## Last Action
Phase 5 Plan 01 executed: Layer type system (LayerId 1-10, LAYER_CONFIGS), Zustand layer store, 4 procedural generators (Architecture wireframes, MEP pipes, BAS sensor nodes, Transport elevators), LayerManager with lazy generation and animation updates.

## Last Session
- Stopped at: Completed 05-01-PLAN.md
- Date: 2026-03-27

## Key Decisions
- Structural clarity over photorealism
- PIVOT: procedural, parametric building generation with InstancedMesh
- 10-layer building systems visualization framework
- ProceduralBuilding class in src/lib/procedural/ — pure Three.js, one R3F wrapper
- BuildingRecipe flat config from API data + era + codes
- InstancedMesh per element type: glass, mullions, panels, columns, slabs (7 draw calls)
- Gemini facade approach: glass inset, mullions extruded, parapet cap, 15% solid panel variation
- LayerId literal union type 1-10 with non-persisted Zustand visibility store
- ShaderMaterial with uTime for animated layers (BAS pulsing, transport movement)
- Lazy generation pattern: generate on first toggle, cache thereafter
- BIM renderer: VSMShadowMap, solid #f5f5f5 bg, HemisphereLight + DirectionalLight, SAOPass AO
- MeshStandardMaterial for all components
- Era boundary: pre-2000 = weathered, 2000+ = clean

## Blockers
None currently.

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01    | 01   | 160s     | 2     | 5     |
| 02    | 01   | inline   | 3     | 8     |
| 03    | 01   | inline   | 2     | 23    |
| 03    | 02   | inline   | 3     | 7     |
| 04    | 01   | inline   | 2     | 3     |
| 04    | 02   | inline   | 2     | 3     |
| 04    | 03   | inline   | 2     | 2     |
| 05    | 01   | 44s      | 3     | 7     |
