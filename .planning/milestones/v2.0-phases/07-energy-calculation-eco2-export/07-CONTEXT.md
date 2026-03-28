# Phase 7: BIM Authoring Tools - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform the viewer into an interactive BIM authoring environment. Three pillars: (1) Element-level editing with transform gizmos + parametric properties, (2) Component library with drag-and-drop for doors, windows, MEP fixtures, and stairs, (3) Measurement and annotation tools (dimension lines, area labels, section cuts).

</domain>

<decisions>
## Implementation Decisions

### Element-Level Editing
- **D-01:** Click any building element (wall, slab, column, roof) → transform gizmo appears (translate/rotate/scale)
- **D-02:** Three.js TransformControls for gizmo interaction — mode toggle buttons for translate/rotate/scale
- **D-03:** Parametric properties panel alongside gizmo: shows dimensions (width, height, thickness), material, position
- **D-04:** Edit numeric values in properties panel → element updates in 3D instantly
- **D-05:** Start with walls, slabs, columns — extend to other elements later
- **D-06:** Undo/redo system using command pattern (push edits to a stack)

### Component Library
- **D-07:** Draggable component palette panel (similar to ConfigPanel positioning)
- **D-08:** Initial components: doors (standard Korean sizes), windows (snap to wall faces), MEP fixtures (from 14-layer system), stairs & ramps
- **D-09:** Doors/windows snap to walls automatically — detect nearest wall face on placement
- **D-10:** MEP fixtures tie into the 14-layer system — placing a sprinkler head adds to Safety layer, placing a sensor adds to BAS layer
- **D-11:** Component instances stored in a new Zustand store (component-store) per building

### Measurement & Annotation
- **D-12:** Dimension lines: click two points → dimension line with distance label appears
- **D-13:** Area labels: click a floor slab → area label appears (m²)
- **D-14:** Level markers: horizontal lines at each floor level with elevation labels
- **D-15:** Section cut: plane that clips the model to show interior (using Three.js clipping planes)
- **D-16:** Annotations rendered as HTML overlays (CSS2DRenderer) for crisp text at any zoom

### Claude's Discretion
- Transform gizmo styling and size
- Component palette layout and icons
- Snap tolerance for wall/door/window placement
- Dimension line styling (arrow heads, label formatting)
- Section cut plane controls (position slider, rotation)
- Korean standard door/window dimensions for presets

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/procedural/` — BuildingRecipe, facade-generator, structure-generator for element geometry
- `src/store/recipe-store.ts` — Recipe overrides for building-level changes
- `src/store/material-store.ts` — Material property storage per building
- `src/lib/layers/` — 14-layer generators for MEP fixture integration
- `src/components/viewer/config-panel.tsx` — Tabbed panel pattern for component palette
- `src/components/viewer/building-scene.tsx` — R3F Canvas with existing click handling
- Three.js TransformControls from three/examples/jsm/controls/TransformControls
- CSS2DRenderer from three/examples/jsm/renderers/CSS2DRenderer for annotations

### Established Patterns
- Click-to-select on slab instances (procedural-building-model.tsx handleClick)
- Zustand stores for all state management
- Floating panels with backdrop-blur
- Bilingual (isKo) throughout

### Integration Points
- TransformControls attach to selected element in R3F scene
- Component instances stored alongside recipe overrides
- Annotation labels use CSS2DRenderer overlaid on Canvas
- Section cut uses THREE.Plane + renderer.clippingPlanes

</code_context>

<specifics>
## Specific Ideas

- Korean standard doors: 900x2100mm, 1000x2100mm, 1200x2100mm
- Korean standard windows: 1200x1500mm, 1800x1500mm, 2400x1500mm
- Transform gizmo colors: red/green/blue for X/Y/Z axes (Three.js default)
- Dimension lines: thin lines with arrow heads, label centered on line
- Area labels: "XX.X m²" centered on floor slab
- Level markers: dashed horizontal lines, "FL+X.Xm" labels at left edge

</specifics>

<deferred>
## Deferred Ideas

- Custom floor plan drawing (2D → 3D extrusion) — future milestone
- Furniture library (desks, chairs, beds) — future milestone
- IFC export of authored model — future milestone
- Collaborative editing / multi-user — future milestone
- Energy calculation + ECO2 export — Phase 8

</deferred>

---

*Phase: 07-bim-authoring-tools*
*Context gathered: 2026-03-27 via discuss-phase*
