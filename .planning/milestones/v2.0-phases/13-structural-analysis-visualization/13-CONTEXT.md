# Phase 13: Structural Analysis Visualization - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Visual structural analysis overlay showing load paths, stress levels, and member sizing. Engineering feedback layer for the GX team. Renders on the 3D model as an independent layer toggle.

</domain>

<decisions>
## Implementation Decisions

### Load Calculation Model
- Driven by existing BuildingRecipe data (floor count, footprint, floor height, material properties)
- Korean standard dead loads by floor type: Residential 5.0 kN/m², Office 6.0 kN/m², mapped from structure code
- Live loads per KBC 2016: Residential 2.0 kN/m², Office 2.5 kN/m², Retail 4.0 kN/m², Roof 1.0 kN/m²
- Column tributary area: simple grid division (total floor area / column count)

### Visualization Style
- Load path arrows: animated Three.js arrows (ConeGeometry + CylinderGeometry), size proportional to load magnitude
- Arrow animation: slow pulse (2s cycle), opacity 0.3→1.0 via useFrame, conveying downward flow
- Stress color gradient: Green (#22c55e) < 60% capacity, Yellow (#eab308) 60-85%, Red (#ef4444) > 85%
- Stress colors applied to column/beam meshes via MeshStandardMaterial color property
- Member sizing display: drei Html tooltip on hover showing recommended dimensions (e.g. "400x400mm column")

### Layer Integration
- Layer 15 in the existing layer system (extends from current 14 max)
- Toggle independent of other layers — any combination supported
- Korean structural code references: KBC 2016 + Korean Concrete Design Code for column sizing tables
- Sizing data stored as constants in src/lib/structural-codes.ts
- 3D perspective only — no plan view variant

### Claude's Discretion
- Arrow geometry proportional sizing formula
- Exact column capacity calculation method
- Tooltip positioning and styling details
- Layer 15 color and label in LayerPanel

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/procedural/structure-generator.ts` — InstancedMesh slabs + columns (existing column positions)
- `src/lib/procedural/types.ts` — BuildingRecipe with floorCount, footprint, floorHeight, columnCount
- `src/store/layer-store.ts` — LayerId type, layer visibility toggles, density controls
- `src/components/viewer/building-scene.tsx` — R3F Canvas with BuildingLayers
- `src/lib/korean-building-codes.ts` — Structure codes, use type codes, wall data

### Established Patterns
- Layer generators: pure Three.js generators returning THREE.Group, lazy generation + cache
- ShaderMaterial with uTime for animated layers (existing pattern in BAS, transport, etc.)
- LayerPanel with colored dots for toggle
- useFrame for per-frame animation updates

### Integration Points
- layer-store: extend LayerId to include 15, add to LAYER_NAMES
- BuildingLayers component: add structural analysis generator
- LayerPanel: add layer 15 entry
- building-scene.tsx: ensure BuildingLayers supports new layer

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
