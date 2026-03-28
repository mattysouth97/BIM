---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: milestone
status: Executing Phase 12
last_updated: "2026-03-28T04:43:31Z"
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 9
  completed_plans: 9
---

# Project State

## Current Phase

Phase 12: Snap Alignment System

## Current Plan

Plan 02 (complete)

## Last Action

Phase 12 Plan 02 executed: Axis constraint functions (applyAxisConstraint, detectAlignments), AlignmentGuides R3F component (colored dashed lines: red=X, green=Z, magenta=alignments), plan-store axisConstraint state, wall-drawer keyboard shortcuts (Shift/X/Y/S), snap toolbar UI with ON/OFF toggle and grid/vertex/edge checkboxes, axis lock info card.

## Last Session

- Stopped at: Completed 12-02-PLAN.md
- Date: 2026-03-28
- Date: 2026-03-28

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
- Separate API routes per energy service (different base URLs from bldrgst)
- useEffect+useState for actual energy hook (not react-query) per project convention
- CO2 actual estimated via ratio (modeled CO2/demand) applied to certified demand
- Separate plan-store (usePlanStore) for plan view concerns, not extending authoring-store
- OrthographicCamera swapped via useThree().set() for plan/3D mode toggle
- Walls stored as start/end XZ coordinates, rendered as flat boxes in 2D and extruded boxes in 3D
- THREE.Line wrapped in primitive component to avoid R3F JSX type collision with SVG
- CW winding (negative shoelace) = interior room faces; CCW = outer boundary excluded
- Most-clockwise DFS face extraction produces interior rooms as CW, outer as CCW
- copyFloor uses crypto.randomUUID() for new IDs when duplicating walls/openings
- WallDrawer isActive gated on drawingMode==='wall' to prevent accidental drawing in opening mode
- FloorSlabs use cumulative Y stacking for variable-height floors; RoomFills plan-only, FloorSlabs 3D-only
- useOpeningPreset as exported Zustand store from opening-drawer.tsx enables overlay+R3F preset sharing without prop drilling
- latestSnapRef + React state pattern: click handler reads ref (no stale closure), state drives preview re-render
- CSG sill heights: doors at baseY+0 (floor), windows at baseY+0.9m; opening BoxGeometry thickness +0.02 prevents coplanar artifacts
- OpeningDrawer and WallDrawer are peer R3F components both mounted in building-scene.tsx, sharing plan-store
- snap-engine.ts dependency-free: inlines projectOntoSegment rather than importing from room-detector.ts for isolation
- opening snap uses t-grid: parametric t snapped to gridSize/wallLength steps; wall-proximity remains primary mechanism
- Y key maps to Z axis (Y = vertical in 2D plan view = Z in 3D XZ space)
- usePlanStore.getState() in keyboard handlers to avoid stale closure on axisConstraint
- Alignment detection deduplicates by axis+value key (millimeter precision bucketing)

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
| 09    | 01   | 239s     | 3     | 6     |
| 10    | 01   | 319s     | 3     | 7     |
| 11    | 01   | 270s     | 2     | 7     |
| Phase 10.1 P01 | 5min | 3 tasks | 12 files |
| Phase 10.1 P02 | 6min | 2 tasks | 7 files |
| Phase 10.1 P03 | 249s | 2 tasks | 4 files |
| Phase 11 P02 | 158s | 2 tasks | 5 files |
| Phase 11 P03 | 257s | 2 tasks | 4 files |
| Phase 12 P01 | 222 | 2 tasks | 5 files |
| Phase 12 P02 | 229s | 2 tasks | 5 files |
