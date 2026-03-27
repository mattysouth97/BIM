---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Ready to plan
last_updated: "2026-03-27T03:27:59.705Z"
progress:
  total_phases: 9
  completed_phases: 8
  total_plans: 18
  completed_plans: 18
---

# Project State

## Current Phase

Phase 8: Energy Calculation & ECO2 Export

## Current Plan

Plan 02 (complete)

## Last Action

Phase 8 Plan 02 executed: Energy dashboard cards with grade badge, demand/CO2/heat-loss breakdown, and ECO2 JSON export/import.

## Last Session

- Stopped at: Completed 08-02-PLAN.md
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
- LayerPanel with colored dots, BuildingLayers R3F wrapper with useFrame animation loop
- BIM renderer: VSMShadowMap, solid #f5f5f5 bg, HemisphereLight + DirectionalLight, SAOPass AO
- MeshStandardMaterial for all components
- Era boundary: pre-2000 = weathered, 2000+ = clean
- Extended RecipeOverrides with top-level scalars for building geometry controls
- material-store overrideProperty for HVAC/lighting/occupancy/renewable controls
- Layer density stored as Record<LayerId, number> in layer-store; regeneration via disposeLayer + getOrGenerate
- Recipe override flow: useRecipeStore.overrides -> applyOverrides -> scene passes to ProceduralBuildingModel + BuildingLayers
- Authoring store: useAuthoringStore with isAuthoring gate, command pattern undo/redo
- Emissive highlight selection (blue #2196f3) over wireframe overlay
- Custom events for TransformControls/OrbitControls coordination
- ComponentPreset pattern: id/name/nameKo/category/dimensions/metadata with Korean standard sizes
- Generator-per-category: pure Three.js generators returning THREE.Group for door/window/MEP/stair
- MEP presets bound to LayerId (5=ventilation, 7=lighting, 10=BAS, 13=safety)
- Non-persisted component-store for placed instances (authoring session state)
- THREE.Sprite + CanvasTexture for annotation text labels (not CSS2DRenderer)
- Annotation state in authoring-store (annotationMode, annotations array, sectionPosition)
- Section cut via renderer.clippingPlanes with normalized 0-1 position slider
- Degree-day method for energy demand; cooling = 60% of heating loss; useEnergyMetrics avoids getEffectiveRecipe via separate subscriptions
- ECO2 export/import buttons co-located with energy cards; import shows parsed results via alert, not overriding live metrics

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
| 05    | 03   | 179s     | 3     | 4     |
| 06    | 01   | 344s     | 3     | 5     |
| 06    | 02   | 234s     | 3     | 8     |
| 06    | 03   | 262s     | 3     | 8     |
| 07    | 01   | 298s     | 4     | 6     |
| 07    | 02   | 332s     | 3     | 9     |
| 07    | 03   | 278s     | 3     | 8     |
| 08    | 01   | 172s     | 3     | 6     |
| Phase 08 P02 | 182s | 3 tasks | 4 files |
