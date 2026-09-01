---
type: reference
status: implemented
last_verified: 2026-09-02
---

# Performance budget

Targets for the twin viewport on a discrete GPU laptop, demo office (~10
storeys, instanced facade).

| Tier | Shadow | GTAO | SMAA | Weathering | Vegetation | DPR |
|---|---|---|---|---|---|---|
| performance | 1024 | no | no | no | no | 1 |
| balanced | 2048 | 8 samples | no | yes | no | 1.5 |
| high (default) | 2048 | 12 | yes | yes | yes | 2 |
| ultra | 4096 | 16 | yes | yes | yes | 2 |
| presentation | 4096 | 16 | yes | yes | yes | 2 |

BIM mode forces the cheap budget regardless of the quality dropdown so
selection, isolation and energy overlays stay snappy.

## Draw-call discipline (unchanged)

Procedural building: facade 4 + slabs 1 + columns 1 + roof 1 (+ beams / interior
volume / ground). Instancing is mandatory. Do not explode per-window meshes.

## What we did not enable

- MeshPhysical `transmission` on every pane (fill-rate bomb)
- SSR / path tracing (no WebGPU renderer)
- Hardware ray tracing
- Per-frame cube-camera reflections

Hyperreal is the same pipeline with the higher quality budget, not a second
renderer. A future presentation path would be a separate composer, optional.
