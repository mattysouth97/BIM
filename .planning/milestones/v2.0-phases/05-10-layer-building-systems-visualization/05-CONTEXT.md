# Phase 5: 10-Layer Building Systems Visualization - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the 10-layer building systems visualization framework on top of the existing ProceduralBuilding geometry. Each layer is independently toggleable via a floating layer panel. Layers are generated lazily (on first show) and toggled via Three.js group.visible. Animation handled via R3F useFrame with uTime shader uniforms. This phase establishes the full layer framework with correct visual language per layer — layers 1-4 with full procedural content, layers 5-10 as visual placeholders with correct colors/shapes.

</domain>

<decisions>
## Implementation Decisions

### Layer Architecture
- Separate generator file per layer: `src/lib/layers/layer-N-*.ts` — clean separation, independently testable
- New `useLayerStore` Zustand store (not persisted) — follows existing store pattern
- Layer visibility toggled via `group.visible = false` — no dispose/remount overhead, instant toggle
- Lazy generation: each layer generated on first-show, then cached (hidden via `visible`) — best perf/memory balance

### Layer Toggle UI
- Collapsible floating panel anchored to toolbar right — doesn't compete with side panel
- Row of colored icon toggles (layer color dot + name + toggle switch) — scannable
- Only Layer 1 (Architecture) visible by default on load
- "Layers" button in the toolbar triggers panel open/close — consistent with existing panel toggle pattern

### Animation & Performance
- R3F `useFrame` hook with uniform time injection for animated layers (3, 4, 7, 8)
- Vertex shader with `uTime` uniform for pulsing/flow effects — GPU-side animation
- InstancedMesh per layer for repeated elements (pipes, nodes, arrows) — consistent with Phase 4 approach (7 draw calls)
- Simplified procedural geometry scope — Phase 5 establishes the system, Phase 6 adds parameter controls

### Layer Content Mapping
- Layer 1 (Architecture): Reuse existing `ProceduralBuilding` group in wireframe/edge mode — no geometry duplication
- Layer 2 (MEP): Grid-routed horizontal mains per floor + vertical risers at corners, density from floor area
- Layer 3 (BAS/IoT): Sensor nodes on wall centers every N floors, line segments between adjacent nodes — purely procedural from floor count
- Layers 5-10: Visual placeholders with correct colors/shapes — establishes the framework

### Claude's Discretion
- Exact shader code and uniform names
- Layer icon choices from lucide-react
- Floating panel positioning and animation
- Specific InstancedMesh counts per layer type
- Color values for each layer (following ROADMAP guidance: L2 red/blue/yellow, L3 green, L5 red/orange, etc.)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ProceduralBuilding` class in `src/lib/procedural/procedural-building.ts` — has `getGroup()` method; layer-1 wraps this
- `BuildingRecipe` type in `src/lib/procedural/types.ts` — `floors`, `footprintWidth`, `footprintDepth`, `totalHeight` available for layer generation
- `useLayerStore` pattern: follow `useMaterialStore` in `src/store/material-store.ts` for store structure
- `building-scene.tsx` — R3F Canvas with `useFrame` capability; add layer groups to the Three.js scene here
- `building-toolbar.tsx` — right side `div.flex.items-center.gap-1.5` is the insertion point for the Layers button
- Zustand `persist` pattern from `app-store.ts` — layer store should NOT persist (ephemeral per session)

### Established Patterns
- InstancedMesh with `setMatrixAt` loop from `facade-generator.ts` and `structure-generator.ts`
- `useEffect` for Three.js object lifecycle (create → add to scene → return cleanup) from `procedural-building-model.tsx`
- ShaderMaterial with `uTime` uniform: standard R3F pattern — update via `useFrame((state) => { mat.uniforms.uTime.value = state.clock.elapsedTime })`
- Store slice pattern: each store in `src/store/` exports one named hook

### Integration Points
- Layer groups attach to the R3F scene via `scene.add(group)` / `scene.remove(group)` in `procedural-building-model.tsx` or a new `LayerManager` component
- `BuildingRecipe` flows from `building-scene.tsx` → `procedural-building-model.tsx` → layer generators
- Toolbar Layers button added to right side of `building-toolbar.tsx` div
- Floating layer panel rendered as portal or absolute-positioned div in `building-scene.tsx` overlay

</code_context>

<specifics>
## Specific Ideas

From ROADMAP phase description — exact visual language per layer:
- Layer 1: Architecture & Structure — semi-transparent wireframes, muted gray
- Layer 2: Standard MEP — solid pipes/boxes, red/blue thermal, yellow/orange power
- Layer 3: BAS, IoT & Controls — floating green nodes, pulsing orbs, dashed connection lines
- Layer 4: Transport & Logistics — animated light blocks in shafts, light trails
- Layer 5: Life Safety & Security — volumetric red/orange force fields, radar rings
- Layer 6: Specialized Media — neon purple/white/green tubes
- Layer 7: Microgrid & Energy — glowing battery cubes, bi-directional animated arrows
- Layer 8: Telecom & IT — cyan/magenta matrices, high-speed fiber pulses
- Layer 9: Waste & Resource Recovery — dark green/brown segmented lines, dissolving particles
- Layer 10: Dynamic Envelope — surface polygons shifting color, physically rotating elements

Each layer procedurally generated from: `recipe.floors` (floor count), `recipe.footprintWidth/Depth` (area), `recipe.mainPurpsCd` (use type).

</specifics>

<deferred>
## Deferred Ideas

- Parameter controls per layer (MEP pipe density slider, sensor frequency) — Phase 6: Interactive Configuration Panel
- Real MEP routing from BIM data — Phase 8: Energy Data Integration
- Layer-specific energy overlays — Phase 7: Energy Calculation

</deferred>
