# Project State

## Current Phase
Phase 5: 10-Layer Building Systems Visualization

## Current Plan
Plan 03 (next)

## Last Action
Phase 5 Plan 02 executed: Layer generators 5-10 (Safety, Media, Microgrid, Telecom, Waste, Envelope) with InstancedMesh elements, ShaderMaterial animations, all 10 generators wired into LayerManager.

## Last Session
- Stopped at: Completed 05-02-PLAN.md
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
- ShaderMaterial with uTime for animated layers (BAS pulsing, transport movement, safety radar, microgrid glow, telecom pulse, envelope shift)
- Lazy generation pattern: generate on first toggle, cache thereafter
- All 10 layer generators implemented with distinct visual language per ROADMAP
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
| 05    | 02   | 206s     | 3     | 7     |
