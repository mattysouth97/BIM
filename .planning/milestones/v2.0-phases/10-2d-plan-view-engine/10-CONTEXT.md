# Phase 10: 2D Plan View Engine - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped — clear ROADMAP spec)

<domain>
## Phase Boundary

Create a 2D orthographic plan view with wall drawing tools. Users switch between 3D perspective and top-down plan view, draw walls by clicking start/end points, and see walls rendered in both views.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices at Claude's discretion — using ROADMAP phase goal and requirements (PLAN-01, PLAN-05).

Key guidance:
- Use Three.js OrthographicCamera for plan view (top-down)
- Toggle between perspective and orthographic cameras
- Wall drawing: click-to-start, click-to-end creates wall segment
- Store drawn walls in a new plan-store (Zustand)
- Walls render as thick lines in 2D, extruded BoxGeometry in 3D
- Grid overlay: use GridHelper in plan view
- "Plan View" button in toolbar to toggle

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- src/components/viewer/building-scene.tsx — R3F Canvas, camera setup
- src/components/viewer/scene-controls.tsx — OrbitControls, camera view presets
- src/components/viewer/viewer-overlay.tsx — Toolbar buttons
- src/store/authoring-store.ts — Edit mode state
- src/lib/procedural/types.ts — BuildingRecipe for building dimensions

### Integration Points
- New camera mode in building-scene.tsx
- Plan view toggle in viewer-overlay toolbar
- Wall segments stored in new Zustand store
- Walls rendered as R3F components in Canvas

</code_context>

<specifics>
## Specific Ideas

No specific requirements — ROADMAP goal is the spec.

</specifics>

<deferred>
## Deferred Ideas

None — Phase 11 handles room detection and extrusion.

</deferred>
