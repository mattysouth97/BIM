# Phase 6: Interactive Configuration Panel - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Unified configuration panel that controls all building parameters in real-time: BuildingRecipe geometry (footprint, floors, facade), material properties (envelope, HVAC, windows), and layer density controls. Tabbed UI replacing the read-only MaterialPanel. All changes immediately update the 3D model via Zustand stores.

</domain>

<decisions>
## Implementation Decisions

### Panel Scope
- **D-01:** Unified panel controlling materials + BuildingRecipe + layer parameters (single source of truth)
- **D-02:** Replace existing MaterialPanel with a new tabbed ConfigPanel component
- **D-03:** Four tabs: Building (recipe geometry), Envelope (materials), Systems (HVAC/lighting/renewables), Layers (per-layer density)

### Panel UX
- **D-04:** Tabbed panel using shadcn Tabs component — reuses existing MaterialPanel position (absolute top-left)
- **D-05:** Wider than current MaterialPanel (w-96 vs w-80) to accommodate tabs
- **D-06:** Inline editable rows with sliders/dropdowns — click value to edit, auto-apply with live preview
- **D-07:** "Reset to Defaults" button per tab section — restores inferMaterialProperties or getRecipe defaults
- **D-08:** Source badge changes to "User Input" on any manual edit

### Building Tab (Recipe Controls)
- **D-09:** Geometry basics: footprint width/depth sliders, floor count, floor height
- **D-10:** Facade params: window ratio, mullion depth, sill height, solid panel chance, parapet height
- **D-11:** Structure params: column spacing, column size, slab thickness, wall thickness
- **D-12:** Roof config: type dropdown (flat/gable), gable height slider
- **D-13:** Recipe changes trigger full ProceduralBuilding regeneration + layer regeneration for visible layers

### Envelope Tab (Material Properties)
- **D-14:** Wall U-value slider with insulation layer preset dropdown (from WALL_LAYERS)
- **D-15:** Window controls: U-value + SHGC + WWR per orientation (3 values ECO2 needs)
- **D-16:** Roof and floor U-value sliders
- **D-17:** Airtightness (ACH50) slider
- **D-18:** Material property changes update material-store via overrideProperty()

### Systems Tab
- **D-19:** HVAC system type dropdown + efficiency slider (matches HVAC_DEFAULTS structure)
- **D-20:** Lighting power density slider
- **D-21:** Occupancy density slider
- **D-22:** Renewable energy section (solar panel area, system type)

### Layers Tab
- **D-23:** Basic density control per layer: single slider controlling main parameter (MEP pipe count, sensor spacing, elevator count, etc.)
- **D-24:** Changing density regenerates that specific layer via LayerManager.disposeLayer() + getOrGenerate()
- **D-25:** Layer visibility toggles also available here (duplicating LayerPanel functionality for convenience)

### 3D Integration
- **D-26:** Click 3D element to open relevant tab/section in config panel
- **D-27:** Material color/texture tint changes on property edit
- **D-28:** Recipe changes trigger full procedural rebuild (ProceduralBuilding.updateRecipe())

### Claude's Discretion
- Slider ranges and step sizes (use Korean building code limits as bounds)
- Specific color tinting logic for property changes
- Animation/transition on value changes
- Tab icons and labels
- Mobile responsiveness

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/viewer/material-panel.tsx` — Current panel with sourceBadge, Section/Row components, bilingual
- `src/store/material-store.ts` — `overrideProperty(pk, path, value)` for deep nested updates
- `src/lib/material-inference.ts` — `inferMaterialProperties()` for reset-to-defaults
- `src/lib/korean-building-codes.ts` — WALL_LAYERS, HVAC_DEFAULTS, WINDOW_U_VALUES for presets/ranges
- `src/lib/procedural/recipe.ts` — `getRecipe()` for default recipe, `applyOverrides()` for user customization
- `src/lib/procedural/types.ts` — BuildingRecipe, RecipeOverrides types
- `src/lib/layers/layer-manager.ts` — `disposeLayer()` + `getOrGenerate()` for layer regeneration
- `src/lib/layers/types.ts` — LAYER_CONFIGS for layer names and properties
- `src/store/layer-store.ts` — layer visibility state
- shadcn/ui: Tabs, Slider, Select, Input components available

### Established Patterns
- Zustand store with path-based property override (material-store)
- Bilingual (isKo) throughout UI
- RecipeOverrides partial type for user customization
- LayerManager lazy generation with dispose/regenerate cycle
- BuildingRecipe flows: toRecipe(geometry) in building-scene.tsx → ProceduralBuildingModel + BuildingLayers

### Integration Points
- ConfigPanel replaces MaterialPanel in building-scene.tsx (same visible/onClose pattern)
- Recipe overrides need a new store or extension of material-store
- ProceduralBuilding.updateRecipe() called when recipe params change
- LayerManager.disposeLayer() + getOrGenerate() when layer params change
- ViewerOverlay button triggers panel (rename from material to config)

</code_context>

<specifics>
## Specific Ideas

- U-value ranges: Korean code limits (0.12-2.5 W/(m2K) for walls)
- WWR slider: 0-80% (Korean code limits 60% for most zones)
- Efficiency sliders: heating 60-98%, cooling COP 2.0-6.0
- Layer presets show Korean names from WALL_LAYERS
- Footprint: 4-50m range for width/depth
- Floor count: 1-30 range
- Floor height: 2.5-5.0m range
- Window ratio: 10-80%

</specifics>

<deferred>
## Deferred Ideas

- ECO2 export from config values — Phase 7
- Real energy consumption data overlay — Phase 8
- Advanced per-layer parameter tuning (beyond density) — future milestone

</deferred>

---

*Phase: 06-interactive-configuration-panel*
*Context gathered: 2026-03-27 via discuss-phase (updated)*
