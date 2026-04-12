status: passed

# Phase 28: Procedural 3D Models for MEP Equipment — Verification

**Verified:** 2026-04-12
**Score:** 5/5 must-haves verified

## Criterion Results

### 1. Each MEP sub-type renders distinct procedural 3D model
VERIFIED by user. AHU ≠ chiller ≠ fan coil ≠ boiler ≠ lighting fixture ≠ electrical panel ≠ DHW tank — each visually distinct via mergeGeometries combining primitives.

### 2. Users can adjust procedural parameters in config panel — scene updates in real time
VERIFIED by user. Equipment tab in ConfigPanel with SliderRow + checkboxes for chiller, boiler, AHU, DHW, lighting, electrical sections. BuildingLayers useEffect depends on equipmentParams — regenerates MEP on change.

### 3. Models recognizable at typical camera distances
VERIFIED. Lighting fixtures bumped from 0.02m → 0.10m (was invisible at distance). Diffuser face on bottom. Chiller has compressor+pipes. Boiler has flue. AHU has duct stubs + fan ring.

### 4. InstancedMesh + mergeGeometries — <10 draw calls per sub-layer
VERIFIED via build. AHU draw calls 13 → 1 (eliminated floating ducts). HVAC sub-layer 5-6 draws. DHW 4-5 draws. Lighting 3 draws.

### 5. Phase 22 toggling + Phase 26 click selection continue working
VERIFIED. Phase 22 sub-toggles now hide/show real geometry (was empty groups before gap-wiring). Phase 26 raycaster hits real MEP meshes. userData.type prefixes preserved for Phase 26 inference.

## Critical Gap Fixed
**Phase 28-gap (MEP wiring):** Discovered MEP generators (CoolingLayer, HeatingLayer, etc.) were defined but NEVER invoked in production code. Wired them into BuildingLayers via setupMepSubGroups + assignToSubGroup. Without this, Phase 22/26/28 features had no MEP geometry to operate on.

## Critical Bug Fixed
**Snapshot caching error:** EquipmentTab subscribed via `s.getParams(pk)` which returns new JSON.parse object each render → React infinite loop warning. Fixed by subscribing to `s.params[pk] ?? DEFAULT_MEP_EQUIPMENT_PARAMS` (stable reference).

## Build & Test Status
- `pnpm build`: passes (0 TypeScript errors)
- All Phase 28 unit tests passing (chiller, boiler, AHU, DHW, lighting + store)
- Human visual verification: approved

## Requirements Coverage
- EQUIP-01: ✅ SATISFIED
