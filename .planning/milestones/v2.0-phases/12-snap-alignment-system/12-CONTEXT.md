# Phase 12: Snap & Alignment System - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Precision editing tools for BIM authoring — grid snapping, vertex/edge snapping, axis constraints, and alignment guides. Operates in 2D plan view for wall drawing and opening placement tools.

</domain>

<decisions>
## Implementation Decisions

### Snap Behavior & Configuration
- Extend plan-store with snapEnabled, snapType (grid/vertex/edge), gridSnapSize, proximityTolerance
- Snap visual feedback: blue dot (8px) at snap point with thin crosshair lines extending to canvas edge
- Toolbar toggle + S keyboard shortcut for snap on/off
- Grid snap size presets: 0.1m / 0.5m / 1.0m buttons in toolbar, plus custom input

### Axis Constraints & Alignment Guides
- Keyboard modifiers: Hold Shift for auto-detect axis-lock, X/Y/Z keys for explicit axis lock
- Dashed colored constraint lines: Red (X), Green (Y), Blue (Z) — standard XYZ color coding
- Auto-detect collinearity: show guides when drawn point aligns with existing wall endpoints (0.05m tolerance)
- Alignment guide lines: thin dashed magenta (#ff00ff) spanning between aligned elements

### Integration Scope
- Snap applies to wall drawing + opening placement tools
- 2D plan view only — no snap in 3D perspective
- Priority: Vertex > Edge > Grid (distance-weighted within each tier)
- Snap targets include wall endpoints, wall edges, grid points, and opening edges

### Claude's Discretion
- Snap engine internal data structures and spatial indexing
- Edge midpoint calculation approach
- Exact keyboard shortcut registration method
- Crosshair line rendering (Three.js Line vs CSS overlay)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/store/plan-store.ts` — WallSegment, Opening types, gridSize already exists
- `src/components/viewer/wall-drawer.tsx` — Wall drawing with ground plane raycasting
- `src/components/viewer/opening-drawer.tsx` — Opening placement with wall-snap (projectOntoWall)
- `src/lib/plan/room-detector.ts` — buildWallGraph, projectOntoWall functions
- `src/components/viewer/viewer-overlay.tsx` — Toolbar buttons, drawing mode toggle

### Established Patterns
- Ground plane raycasting: THREE.Plane(0,1,0) + ray.intersectPlane
- Zustand plan-store for all plan view state
- useFrame for per-frame updates (preview lines, snap indicators)
- Keyboard event listeners attached to window in useEffect

### Integration Points
- wall-drawer.tsx: integrate snap before click handler places wall endpoint
- opening-drawer.tsx: integrate snap before opening placement
- viewer-overlay.tsx: add snap toggle, grid size presets, axis constraint indicators
- plan-store: snap state management

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
