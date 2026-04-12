# Phase 25: Energy Consumption Heatmap - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning
**Mode:** Auto-generated from research (3D rendering phase with clear technical contract)

<domain>
## Phase Boundary

Per-floor color-coded planes on 3D building geometry keyed to Korean energy grade thresholds (blue Grade 1+++ → red Grade 7). Updates reactively on material slider changes. Remains visible when structure layer is hidden. Uses separate THREE.Mesh floor planes (NOT vertex colors on structural InstancedMesh).

</domain>

<decisions>
## Implementation Decisions

### Geometry Approach
- **Separate THREE.Mesh per floor** using PlaneGeometry (rotated horizontal)
- **MeshBasicMaterial with vertexColors: true** — zero lighting overhead
- Placed in existing `energy-zones` layer group (not structural)
- **Forbidden:** setColorAt on structural InstancedMesh (PITFALLS anti-pattern)

### Color Mapping
- Reuse existing `getEnergyGrade()` + `getGradeColor()` from `src/lib/energy/energy-grade.ts`
- 10-grade Korean scale: 1+++ → 7 (blue → red)
- `kwhmToColor()` is a one-liner: `getGradeColor(getEnergyGrade(kwhm))`
- No new threshold table needed

### Disposal Strategy
- **Named group "energy-heatmap"** as child of energy-zones layer group
- Rebuild on material change: find by name → traverse-dispose → remove → add new group
- NOT `disposeLayer("energy-zones")` — that would destroy other energy-zones content

### BuildingLayers Prop
- Add `buildingPk?: string` optional prop to BuildingLayers
- Required to call useEnergyBreakdown(pk) from Phase 23
- Minimal surgical change

### perFloor Indexing
- Filter `floors.filter(f => f.type === "above")` — MUST match Phase 23 convention
- Basement floors excluded (no heatmap)

### Claude's Discretion
- Exact blue→red gradient steps (use existing GRADE_COLORS)
- Mesh Y positioning per floor (use floor.bottomHeight + small offset)
- Polygon footprint handling: rectangular PlaneGeometry overhangs irregular edges for v5.0, polygon-accurate deferred

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/energy/energy-grade.ts` — GRADE_THRESHOLDS + GRADE_COLORS (Korean 10-grade)
- `src/lib/layers/layer-manager.ts` — disposeLayer recursive pattern reference
- `src/hooks/use-energy-breakdown.ts` — from Phase 23 (perFloor array)
- `src/components/viewer/building-layers.tsx` — energy-zones layer setup

### Established Patterns
- THREE.Group hierarchy for layer contents
- useEffect rebuild-on-change with dispose cleanup
- Material changes trigger recalc via Phase 23 memoization

### Integration Points
- `src/lib/layers/energy-heatmap-builder.ts` — NEW pure function
- `src/components/viewer/building-layers.tsx` — add buildingPk prop + useEffect
- `src/lib/layers/energy-zones-layer.ts` (if exists) or inline in BuildingLayers

</code_context>

<specifics>
## Specific Ideas

- MeshBasicMaterial sufficient — no shader needed for uniform per-floor color
- Polygon footprint buildings (v4.0 GIS): acceptable overhang for v5.0, polygon-accurate deferred to v5.x
- Mobile GPU performance: vertex colors are cheap, no concerns

</specifics>

<deferred>
## Deferred Ideas

- Sub-system heatmap filter (HVAC-only, lighting-only) — deferred v5.x (ADV-01)
- Polygon-accurate floor planes matching cadastral footprint — deferred v5.x
- Shader-based spatial gradient within floor — out of scope

</deferred>
