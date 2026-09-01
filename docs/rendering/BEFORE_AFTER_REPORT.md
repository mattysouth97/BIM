---
type: report
status: implemented
last_verified: 2026-09-02
---

# Before / after report

Sample: 데모 오피스 타워 (`/building/demo`, 2000-2009 RC office, curtain wall).
Captured 2026-09-02 from identical workflow state (디지털 트윈).

## Original architecture

Untextured `MeshStandardMaterial`, studio HDR, solid gray void, CAD grid,
legacy `#88BBDD` glass, hemisphere fill that flattened the facade. Textures
existed on disk but were applied only to the ground plane, and ground UVs
were a 3×3 repeat independent of metres.

## Five largest causes of the synthetic look (Phase 0)

1. **Untextured facades** — colour-only PBR, stretched unit-box UVs
2. **Studio void lighting** — indoor HDR + gray background, no sun/sky
3. **CAD blue glass** looking into empty floor plates
4. **CAD grid ground** with no site, no contact, buildings reading as floating
5. **Identical windows / perfectly sharp CG edges** with no interior, no weathering

## What changed

| Area | Before | After (realistic) |
|---|---|---|
| Lighting | Studio + hemisphere | Preetham sky, solar sun, outdoor IBL |
| Glass | Transparent blue planes | Physical glazing, dark interior volume |
| Ground | Tiled concrete + grid | Grass / asphalt / sidewalk / plinth |
| Context | Gray neighbor boxes, no trees | Darker massing + simple trees |
| Materials | Structure colour only | Ontology → calibrated spec → world-space shader |
| Modes | One look | BIM / 실사 / 하이퍼 + time + weather + camera |
| Post | Outlines only | GTAO + SMAA in realistic/hyperreal |

## Identical-camera evidence

Files in `docs/rendering/qa/`:

- `01-bim-iso.png` — technical BIM (gray void, see-through floors)
- `02-realistic-iso.png` — sky, grass, trees, dark glazing
- `03-realistic-golden.png` — warmer sun, higher facade contrast
- `04-realistic-street.png` — punched windows with interior darkness
- `05-realistic-aerial.png` — roof, site, neighbors
- `06-hyperreal-iso.png` — same path, higher GTAO/SMAA budget

## Realism scorecard (demo office, honest)

Scale: 10 = architectural-visualization still. 5 = plausible real-time BIM.
1 = CAD drawing.

| Criterion | Baseline BIM | Realistic now |
|---|---|---|
| Material realism | 3 | 6 |
| Material scale | 2 | 6 |
| Surface variation | 2 | 5 |
| Geometry realism | 4 | 5 |
| Glass | 2 | 7 |
| Lighting | 3 | 6 |
| Shadows | 4 | 6 |
| Reflections | 3 | 5 |
| Atmospheric depth | 1 | 5 |
| Ground integration | 2 | 6 |
| Environmental context | 3 | 5 |
| Camera / exposure | 4 | 6 |
| Temporal stability | 6 | 6 |
| BIM readability | 8 | 8 |
| Performance | 8 | 7 |
| **Total /150** | **55** | **89** |

Do not read 89 as “hyperreal.” The street close-up is the first frame that
stops looking like a CAD model. Iso and aerial still show a curtain-wall
office with thin white spandrels — that is the BIM geometry, not a missing
4K plaster texture.

## Performance

Not instrumented with GPU timers in this pass. Draw-call budget is unchanged
(+1 interior volume, +ground meshes, +optional trees). Default quality is
`high` (2048 VSM, GTAO 12, SMAA). BIM mode disables those passes.

## Remaining limitations

- WebGL, not path tracing. No SSR. Indoor studio HDR still used in BIM mode.
- Curtain-wall spandrels are thin instanced boxes; micro-detail does not read
  at building scale.
- Trees are LOD-0 spheres. Neighbor massing is still extruded footprints.
- Headless Chromium sky stays paler than a discrete-GPU window.
- VWorld outlines in degrees (pre-existing) are unrelated.

## Next rendering improvements (priority)

1. Authored curtain-wall spandrel / metal-panel materials at real module width
2. Probe-based local reflections for street-level glass
3. Soften neighbor massing with facade cards, not more boxes
4. Optional presentation composer (higher shadow samples, still optional)

## Related

[[RENDERING_ARCHITECTURE]] · [[VISUAL_QA]] · [[PERFORMANCE_BUDGET]]
