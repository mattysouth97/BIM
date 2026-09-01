---
type: reference
status: implemented
last_verified: 2026-09-02
---

# PBR standards

Construction-time clamps live in `src/lib/rendering/pbr-standards.ts`.

| Rule | Dielectric | Metal |
|---|---|---|
| Albedo floor | 0.04 | 0.56 |
| Albedo ceiling | 0.94 | 1.00 |
| Roughness | 0.02–1.0 | 0.02–1.0 |
| Glass IOR | 1.52 | — |
| Dielectric F0 | 0.04 | — |

Albedo textures must not contain baked lighting. The bundled JPG sets under
`/textures/` are treated as albedo/normal/roughness; they are sampled in
**world space**, never with the stretched UVs of a 1×1×1 instanced box.

`isCadBlueGlass()` detects the historical `#88BBDD` / `#88BBCC` viewport colour
so realistic mode can replace it without changing recipe fixtures that tests
still construct by hand.
