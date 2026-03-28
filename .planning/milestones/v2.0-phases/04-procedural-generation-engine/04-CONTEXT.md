# Phase 4: Procedural Generation Engine - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the current per-component React rendering (WallGenerator, SlabMesh, ColumnGenerator, RoofGenerator) with a class-based ProceduralBuilding generator that uses InstancedMesh for high-performance facade rendering. The generator takes a BuildingRecipe (derived from API data + era + codes) and produces a single THREE.Group with all geometry. One React wrapper component bridges the generator to the R3F scene.

</domain>

<decisions>
## Implementation Decisions

### Generator Architecture
- Class-based `ProceduralBuilding` in `src/lib/procedural/` — pure Three.js, no React dependency
- One InstancedMesh per element type: windows, mullions/frames, wall panels, columns, slabs
- Grid subdivision function: wall plane + floor height + window width → instance matrices
- Single React wrapper `<ProceduralBuildingModel>` calls generator in useMemo
- Performance target: <10 draw calls per building

### Parameter Pipeline
- `BuildingRecipe` flat config type derived from BuildingGeometry + era + structure codes
- Era-based recipe presets via `getRecipe(strctCd, era, useCode)` → window sizing, mullion depth, panel proportions
- Keep and extend `building-geometry.ts` — add `toRecipe()` conversion
- User overrides merge into recipe via material-store overlay (source = "user-input")

### Integration
- Replace WallGenerator + SlabMesh + ColumnGenerator + RoofGenerator with single ProceduralBuildingModel
- Old components stay as dead code until verified
- Floor selection via raycaster on slab instances (instance ID → floor index in userData)
- Reuse existing useTexturedMaterial hook for texture loading

### Claude's Discretion
- InstancedMesh count allocation strategy (fixed max vs dynamic)
- Mullion/frame depth values by era
- Spandrel panel sizing
- Random variation percentage for facade asymmetry
- Ground floor entrance treatment in instanced system

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/building-geometry.ts` — BuildingGeometry interface, generateBuildingGeometry() (extend with toRecipe)
- `src/lib/korean-building-codes.ts` — WALL_LAYERS, WINDOW_RATIOS, FLOOR_HEIGHTS lookup tables
- `src/lib/pbr-materials.ts` — getPBRMaterial(), getTextureSet(), TextureSet interface
- `src/hooks/use-textured-material.ts` — useTexturedMaterial hook (reuse for R3F wrapper)
- `src/store/material-store.ts` — overrideProperty() for user parameter changes

### Current Components Being Replaced
- wall-generator.tsx — 4 wall faces per floor, window planes overlaid
- slab-mesh.tsx — BoxGeometry per floor with selection
- column-generator.tsx — individual meshes per column (not instanced)
- roof-generator.tsx — Box/Extrude/BufferGeometry by type

### Performance Issues in Current System
- Each column is a separate mesh (not instanced)
- Window panes are separate planes (16-32 extra draw calls per floor)
- No LOD or frustum culling optimization
- Textures loaded per component instance (redundant)

</code_context>

<specifics>
## Specific Ideas

- Gemini's ProceduralFacadeGenerator prompt: push glass inward, extrude mullions outward, add parapet at top
- 15% random solid-panel variation for realistic asymmetric facades
- PBR materials: glass = high smoothness/low metalness/dark tint, frames = anodized aluminum look
- Corner treatment: frames must not awkwardly overlap at building corners

</specifics>

<deferred>
## Deferred Ideas

- Visual node-graph editor (Phase 5+ if needed)
- Web Worker offloading (optimize later if needed)
- LOD system (add when multiple buildings visible)

</deferred>
