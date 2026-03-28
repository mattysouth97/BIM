---
phase: 04-procedural-generation-engine
plan: 01
status: complete
---
# Summary: BuildingRecipe type system + factory + toRecipe()
- Created src/lib/procedural/types.ts — BuildingRecipe, FacadeConfig (mullionDepth, glassInset, solidPanelChance, cornerInset, parapetHeight), SlabConfig, ColumnConfig, RoofConfig, MaterialRefs, FloorSpec, RecipeOverrides
- Created src/lib/procedural/recipe.ts — getRecipe() with era-based presets, applyOverrides() for user customization
- Extended src/lib/building-geometry.ts — toRecipe() converts BuildingGeometry to BuildingRecipe
