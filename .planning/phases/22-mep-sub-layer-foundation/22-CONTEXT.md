# Phase 22: MEP Sub-Layer Foundation - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Split the single MEP layer group into 4 independently togglable utility sub-layers (electrical, HVAC, lighting, DHW) in the layer panel and scene graph, without expanding `ALL_LAYER_IDS` or triggering full-scene re-renders.

</domain>

<decisions>
## Implementation Decisions

### Layer Panel Sub-Toggle UI
- Expandable chevron on MEP row — click chevron to reveal 4 indented sub-toggles (progressive disclosure)
- Distinct colors per system: yellow=electrical, cyan=HVAC, lime=lighting, orange=DHW (industry conventions)
- Bilingual labels (e.g., "전기 Electrical") matching existing LAYER_CONFIGS pattern
- Indented sub-toggle rows with smaller dot (2px vs 2.5px), slightly lighter text — visually subordinate

### Generator-to-Group Mapping
- Electrical: layer-1-electrical only (telecom/media deferred to v5.x 15-layer expansion)
- HVAC: layer-3-cooling + layer-4-heating + layer-5-ventilation (three thermal subsystems grouped)
- Lighting: layer-7-lighting only
- DHW/Plumbing: layer-6-hot-water + layer-8-special-waste (domestic + waste water)
- Unmapped generators (safety, microgrid, telecom, media, etc.): hidden — no sub-layer toggle yet, objects still render under main MEP toggle

### Toggle State Behavior
- Main MEP toggle off→on restores previous sub-layer states (remembers which were on/off)
- Initial state: all 4 sub-layers visible (matches current "MEP on" behavior)
- Sub-layer state persists to localStorage via existing layer-store pattern

### Claude's Discretion
- Architecture: use nested `MepSubLayerId` type parallel to `LayerId`, not extending `ALL_LAYER_IDS` (per architecture research)
- Store: `mepSubVisibility` slice in existing `layer-store.ts`, not a new store file
- LayerManager: add `setMepSubVisible()` method assigning generator output to named sub-groups

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/layers/types.ts` — `LayerId` union, `ALL_LAYER_IDS`, `LAYER_CONFIGS` with color/name/nameKo
- `src/store/layer-store.ts` — `Record<LayerId, boolean>` visibility, `toggleLayer()`, localStorage persist
- `src/lib/layers/layer-manager.ts` — `COMPONENT_TO_LAYER` mapping, `setLayerVisible()` on THREE.Group
- `src/components/viewer/layer-panel.tsx` — iterates `ALL_LAYER_IDS`, renders colored dot + toggle rows
- 15 generator files in `src/lib/layers/` (layer-1 through layer-14) — already produce MEP sub-system geometry

### Established Patterns
- Layer visibility: store boolean → `LayerManager.setLayerVisible(id, bool)` → THREE.Group.visible
- Store persistence: Zustand persist middleware to localStorage (same as app-store, workspace-store)
- Bilingual UI: `isKo ? config.nameKo : config.name` pattern throughout

### Integration Points
- `layer-panel.tsx` — add expandable sub-toggle section under MEP row
- `layer-store.ts` — add `mepSubVisibility` record + `toggleMepSub()` action
- `types.ts` — add `MepSubLayerId` type + `MEP_SUB_CONFIGS`
- `layer-manager.ts` — add `GENERATOR_TO_SUB_GROUP` mapping + `setMepSubVisible()` method
- `building-layers.tsx` — wire sub-group creation in MEP layer setup

</code_context>

<specifics>
## Specific Ideas

- Architecture research recommends `MepSubLayerId` as nested parallel type to avoid cross-subscriber re-render cascades
- Per-frame Raycaster allocation anti-pattern in structural-tooltip.tsx — do NOT copy this pattern for any new tooltip code
- Generator files already set `userData.type` and `userData.floorNo` on meshes — useful for equipment tooltip in Phase 26

</specifics>

<deferred>
## Deferred Ideas

- All 15 individual sub-layer toggles — deferred to v5.x after 4 primary groups validated
- Sub-system heatmap filter per layer — deferred to v5.x (depends on Phase 25 heatmap first)

</deferred>
