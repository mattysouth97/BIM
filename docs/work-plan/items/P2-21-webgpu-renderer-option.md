---
id: P2-21
title: Opt-in WebGPU renderer backend for higher-fidelity twin rendering
priority: P2
area: viewer
status: done
owner: claude-fable-5-session
effort: S
created: 2026-07-23
updated: 2026-07-23
use_cases: [UC-04, UC-05]
---

# P2-21 — WebGPU rendering path (experimental, opt-in)

User direction: "Incorporate WebGPU and ThreeJS to render higher fidelity
models." three@0.183 ships `three/webgpu` (WebGPURenderer) and R3F v9
supports async renderer factories, so the twin can render on WebGPU where
the browser exposes `navigator.gpu`.

## 1. Requirement (RE)
- A WebGPU rendering mode with graceful WebGL fallback, without breaking
  the existing pipeline (OutlinePass post-processing and the advanced-layer
  ShaderMaterials are WebGL-only).

## 2. Specification (SDD)
- `app-store` gains persisted `rendererBackend: "webgl" | "webgpu"`
  (default webgl — WebGPU is opt-in, honestly labeled experimental).
- `building-scene`: when webgpu is chosen AND `navigator.gpu` exists, the
  Canvas remounts (`key`) with R3F v9's async `gl` factory —
  `new WebGPURenderer(props)` + `await renderer.init()` — dynamically
  imported from `three/webgpu` so the WebGPU build is code-split off the
  default path. Shadow map resolution doubles (2048→4096) in WebGPU mode.
- `<ScenePostProcessing />` (OutlinePass via WebGL EffectComposer) mounts
  only on the WebGL path; selection outlines are the documented trade-off
  in WebGPU mode until a TSL-based outline replaces it.
- Toolbar gains a Sparkles toggle (aria-pressed; disabled with an
  explanatory tooltip when the browser lacks WebGPU).

## 3. Constraints (CDD)
- **Must not**: change the default rendering for existing users; ship the
  WebGPU bundle to users who never enable it; silently lose features
  (tooltip + comments name the outline trade-off).
- **Known limitation**: advanced-layer ShaderMaterials (BAS/telecom/
  transport/safety/microgrid animations) are not node-material based and
  do not render under WebGPU — those layers are optional toggles; migrating
  them to TSL is future work.

## 4. Evaluation (EDD)
- **Gates**: `pnpm test`; `pnpm lint`; `pnpm build`; tsc clean.
- **Acceptance criteria**:
  - [x] WebGPU opt-in via toolbar, persisted, auto-fallback without support
  - [x] WebGL path byte-equivalent when the toggle is off
  - [x] WebGPU bundle dynamically imported (code-split)
- **Done when**: toggling Sparkles re-renders the twin on WebGPU in
  supporting browsers. 1265 tests, lint 0 errors, build green.
