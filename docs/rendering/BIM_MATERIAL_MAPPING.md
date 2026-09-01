---
type: reference
status: implemented
last_verified: 2026-09-02
---

# BIM → visual material mapping

`resolveVisualMaterialId({ strctCd, mainPurpsCd, era, role, roofType })` is
deterministic. It never writes U-values, λ, or geometry.

## Structure codes (`STRUCTURE_TO_WALL_KEY`)

| Codes | Family | Typical wall visual |
|---|---|---|
| 11, 21 | RC | Board-formed (pre-2000) → architectural concrete (2010+) |
| 14 | Precast | Precast concrete |
| 12, 42 | SRC | Same as RC |
| 13 | Steel | Painted steel / aluminium; factories stay painted steel |
| 15 | Timber | Weathered exterior wood / engineered timber |
| 22–25 | Masonry | Weathered brick (old) / red clay brick (new) |
| 02000 apartments, post-2000 RC | Stucco | `paint-stucco` |

## Glazing by era

| Era | Visual id |
|---|---|
| pre-1970 … 1990-1999 | `glass-clear` |
| 2000-2009 | `glass-tinted` |
| 2010+ | `glass-low-e` |

Thermal U / SHGC still come from `korean-building-codes.ts`. This table is
appearance only.

## Roofs

| Recipe roof type | Visual |
|---|---|
| hip / gable, old | Clay tile |
| hip / gable, new | Concrete tile |
| sawtooth / steel | Standing seam |
| flat (default) | Membrane |

## Surfaces without a BIM material

Ground, sidewalk, pavement, foundation plinth, interior cavity and neighbor
massing are **visual context**. They are not ledger facts.
