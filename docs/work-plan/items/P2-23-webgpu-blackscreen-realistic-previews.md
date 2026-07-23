---
id: P2-23
title: Fix WebGPU black screen + scenario clicks render the post-retrofit state
priority: P2
area: viewer
status: done
owner: claude-fable-5-session
effort: M
created: 2026-07-23
updated: 2026-07-23
use_cases: [UC-04, UC-06, UC-07, UC-08]
---

# P2-23 — WebGPU black-wall fix + realistic retrofit previews

User feedback on P2-20/21: WebGPU mode showed a black wall, and applied
scenarios read as highlights rather than showing what the change looks like.

## 1. Root causes (WebGPU black wall) — two independent bugs, same symptom
- **Mount-time throw**: `SceneSetup` constructed `THREE.PMREMGenerator(gl)` —
  a WebGL-only pipeline — with the WebGPU renderer, throwing during mount and
  blanking the canvas via the error boundary. Fix: under WebGPU, set
  `EquirectangularReflectionMapping` on the HDR and assign it directly
  (WebGPU consumes equirect maps natively); WebGL path unchanged.
- **Per-frame abort**: raw `ShaderMaterial`s (MEP flow animations, layer-15
  load arrows — visible by default) are not convertible by the node renderer
  (`NodeMaterial: Material "ShaderMaterial" is not compatible`), killing the
  frame. Fix: under WebGPU, BuildingLayers hides exactly the
  ShaderMaterial-bearing meshes (equipment bodies are MeshStandardMaterial
  and stay); re-applied after every regeneration.

## 2. Realistic previews (SDD)
Applied measures now render the POST-RETROFIT state; a single low-intensity
emerald emissive (`PROPOSAL_EMISSIVE`) is the shared "proposed, not built"
marker:
- Wall insulation → fresh plaster/EIFS finish (RENEWED_WALL_COLOR) instead of
  a green tint; roof insulation → new membrane gray.
- HVAC measures → **physical rooftop heat-pump outdoor units**
  (`retrofit-hvac-units.tsx`: instanced bodies + fan grilles along the roof
  front edge, 1 per ~8 m frontage, max 6) plus factory-new metal recolor of
  the MEP hvac sub-layer.
- Lighting measures → fixtures actually LIT: bright neutral-white emissive
  with a mint hint.
- Solar (already physical PV array) → proposal emissive accent added so the
  preview differs from as-built PV.
- Window replacement unchanged (the low-e glazing swap is the real look).

## 3. Constraints (CDD)
- Clone-and-restore only (no shared-material mutation); un-applying restores
  baseline; WebGL rendering byte-identical when WebGPU is off.

## 4. Evaluation (EDD)
- **Gates**: `pnpm test` (1277), `pnpm lint` (0 errors), `pnpm build`, tsc.
- [x] WebGPU mode renders the model (env-map path + shader hiding)
- [x] Every measure family shows a physical/material change + proposal accent
- **Known trade-off (documented)**: MEP flow/arrow animations are hidden in
  WebGPU mode until migrated to TSL node materials.
