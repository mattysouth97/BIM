---
phase: 04-procedural-generation-engine
plan: 03
status: complete
---
# Summary: React wrapper + scene integration
- Created src/components/viewer/procedural-building-model.tsx — R3F wrapper using useMemo for recipe conversion, useEffect for Three.js group lifecycle, primitive for scene attachment
- Updated building-scene.tsx to import ProceduralBuildingModel instead of BuildingModel
- Floor selection via click handler on slab InstancedMesh instances (instanceId → FloorSpec → FloorGeometry)
- Old components (building-model.tsx, wall-generator.tsx, slab-mesh.tsx, column-generator.tsx) preserved as dead code
