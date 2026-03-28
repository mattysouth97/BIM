# Phase 11: Room Boundaries + 3D Extrusion - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Detect enclosed spaces from drawn walls, label them as rooms, and auto-extrude 2D plans to 3D building geometry. Add door/window placement tools and multi-floor support with floor duplication.

</domain>

<decisions>
## Implementation Decisions

### Room Detection & Labeling
- Graph-based cycle detection: build wall graph from endpoints, find minimal cycles using DFS to detect enclosed rooms
- Room labels use THREE.Sprite + CanvasTexture (consistent with existing annotation pattern)
- Labels placed at polygon centroid showing room name + area (m²)
- Semi-transparent colored fill per room type (living/kitchen/bedroom/custom), 20% opacity so grid shows through

### Door/Window Placement
- Components snap to wall segment — click near wall, component snaps to nearest point on wall centerline
- Position stored as parametric offset (0-1 along wall length) for robustness when walls resize
- Boolean subtraction on wall mesh creates rectangular openings in 3D wall geometry
- Korean standard size presets reusing existing ComponentPreset pattern
- Plan view: architectural symbols (door = arc sweep line, window = parallel double lines)

### Multi-Floor & Extrusion
- "Copy floor" button duplicates all walls + openings from active floor to target floor
- Auto-extrusion is automatic — walls already render as Wall3D when switching to 3D mode
- Floor slabs added as horizontal planes at each floor level
- Per-floor configurable height (extend plan-store with floor height settings)
- Reuse existing floor selector in viewer-overlay toolbar, extend to dynamic count

### Claude's Discretion
- Wall graph data structure implementation details
- Room type assignment UI (dropdown, click-to-cycle, etc.)
- Floor slab material and thickness defaults
- Exact Korean standard door/window dimensions

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/store/plan-store.ts` — WallSegment type with start/end XZ, thickness, height, floor
- `src/components/viewer/wall-drawer.tsx` — Wall2D/Wall3D components, ground plane raycasting
- `src/store/authoring-store.ts` — isAuthoring gate, command pattern undo/redo
- ComponentPreset pattern from Phase 8 — id/name/nameKo/category/dimensions/metadata
- Generator-per-category pattern — pure Three.js generators returning THREE.Group
- THREE.Sprite + CanvasTexture for text labels (annotation pattern)

### Established Patterns
- Zustand stores: non-persisted for session state, separate stores per domain
- R3F components: useFrame for animation, useThree for scene access
- Ground plane raycasting: THREE.Plane(0,1,0) + ray.intersectPlane for XZ coordinates
- Primitive wrapper pattern for Three.js objects avoiding JSX type collisions

### Integration Points
- plan-store: extend with rooms array, floor heights, openings
- wall-drawer.tsx: add opening placement mode alongside wall drawing
- building-scene.tsx: add room visualization components
- viewer-overlay.tsx: add copy-floor button, room tools in toolbar

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
