---
type: reference
status: implemented
last_verified: 2026-09-02
---

# Lighting system

## BIM mode

Unchanged: hemisphere `#b1e1ff` / `#b97a20` at 0.6, directional white 2.0,
studio HDR for IBL, solid `#f5f5f5` background. Technical readability first.

## Realistic / hyperreal

| Light | Role |
|---|---|
| Preetham `Sky` | Background; `toneMapped = false` so ACES does not blow the dome |
| Directional sun | Position from NOAA-style solar model, Seoul 37.57°N 126.98°E default |
| Hemisphere | Sky/ground fill at low intensity |
| PMREM of the sky | Outdoor IBL (replaces studio HDR) |
| FogExp2 | Aerial perspective, density from weather |
| Contact shadows | Ground contact, quality ≥ balanced |
| GTAO | Architectural recesses, quality ≥ balanced |

Sun direction uses the scene convention **+Z south, +X west, +Y up**.

## Time of day

`08:00` / `12:00` / `16:00` / golden hour / overcast / night. Date is the
equinox (22 Sep) so the sun path is usable for architecture, not a random
winter azimuth.

## Weather

Clear, overcast, rain, fog. Rain sets `wetness` on the runtime snapshot; the
shader darkens horizontals and drops roughness. No particle rain.

## Camera

`CAMERA_PRESETS` set FOV, near plane, and orbit pose. Architectural exterior
is 35° — not a wide-angle game camera. Technical BIM remains 35°.

## Colour

ACES filmic + `SRGBColorSpace`. Exposure is part of the sun preset (≈0.74 noon,
0.82 golden, 0.55 night). No teal-orange grade, no bloom.
