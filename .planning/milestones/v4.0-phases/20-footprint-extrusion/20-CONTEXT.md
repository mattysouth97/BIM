# Phase 20: Footprint Extrusion - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Users see their selected building rendered with the real cadastral polygon shape extruded to the correct height, with existing facade materials and concave polygon support. This replaces the rectangular BoxGeometry base with real cadastral polygon geometry.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key constraints from research:
- Use earcut@^3.0.2 for triangulation (Three.js ShapeGeometry fails on concave polygons)
- `earcut.flatten()` converts GeoJSON coordinates to flat array format
- Build `earcut-extrude.ts` as a pure utility in `src/lib/gis/`
- Modify `procedural-building.ts` to use earcut caps when footprintPolygon is available
- `BuildingRecipe.footprintPolygon` already exists as optional field in `types.ts`
- `building-scene.tsx` already fetches and assigns the polygon
- Use `gis-transform.ts` (Phase 19) for coordinate conversion before extrusion
- Facade system must work on polygon-based buildings, not just rectangular

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/gis/gis-transform.ts` — Phase 19 proj4 coordinate transforms (just built)
- `src/lib/procedural/procedural-building.ts` — ProceduralBuilding class (7 draw calls)
- `src/lib/procedural/types.ts` — BuildingRecipe with optional `footprintPolygon`
- `src/lib/procedural/facade-generator.ts` — InstancedMesh glass/mullions/panels
- `src/lib/procedural/structure-generator.ts` — InstancedMesh slabs + columns
- `src/app/api/vworld/footprint/route.ts` — returns [x,z] meter-space polygon

### Established Patterns
- InstancedMesh for batched draw calls
- MeshStandardMaterial for all components
- Era-based PBR texture selection in `pbr-materials.ts`

### Integration Points
- `procedural-building.ts` currently generates rectangular cap geometry
- `building-scene.tsx` passes footprintPolygon into ProceduralBuilding
- Structure generator creates rectangular slabs — needs polygon slab option

</code_context>

<specifics>
## Specific Ideas

No specific requirements — refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
