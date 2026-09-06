# Reference MEP source coverage

`manifest.mepCoverage` records what the supplied IFC files can support,
alongside the services layers the viewer actually publishes. It inventories
source occurrences, not unique installed equipment: architectural copies,
discipline models and alternative revisions can overlap.

| Building | Typed source occurrences | Distribution ports | Published services |
|---|---:|---:|---|
| Medical-Dental Clinic | 12,482 | 20,448 | HVAC, electrical, plumbing |
| Duplex Apartment | 2,010 | 970 | HVAC, electrical, plumbing |
| Schependomlaan | 73 | 0 | Rainwater drainage / ventilation grilles, supplier utility connections |
| FZK House | 0 | 0 | None supported by the supplied file's typed MEP entities |
| KIT Office | 0 | 0 | None supported by the supplied file's typed MEP entities |

The inventory uses the actual web-ifc schema class inheritance under
`IfcDistributionElement`, plus legacy `IfcElectricalElement`. It supports
IFC2x3, IFC4 and IFC4x3, and excludes type definitions, relationships and
generic furnishings/proxies. Unknown schemas fail instead of reporting zero.
Every inventory row retains the source role, filename and verified SHA-256.
FZK and KIT Office use IFC4; the other three architectural sources use IFC2x3.

Generic furnishings in the Office include source names such as `Objekt-002`
and `Objekt-006`. They are not evidence of a connected MEP system. The absence
of typed MEP records is a limitation of these supplied files, not a claim that
a building has no services. No speculative network is drawn.

## Added Schependomlaan geometry

`serviceLayers` gains `source-services`, separate from the architectural
detail toggle and existing supplier layers. Its source is the architectural
IFC: all 60 `IfcFlowSegment` named `hwa afvoer` (rainwater drainage) and all
13 `IfcDistributionElement` named `vent. rooster` (ventilation grille).

The actual `source-services.glb` is 382,940 bytes, with 8,209 stored triangles,
17,662 placed triangles and 7 draw calls. Geometry, original placements and
tessellator RGBA are retained. The accompanying `source-services-index.json`
names all 73 source entities and reconciles their placed triangle counts.
Its byte hash is stable across Windows/Linux through a Git LF rule.

There are no distribution ports in the Schependomlaan sources. This layer
does not infer connectivity, direction, supply/return classification or a
complete MEP design. The existing `utilities` layer remains its separately
described supplier proxy representation.

Clinic architectural terminal occurrences are inventoried but not added
over the coordinated services: duplicate identity is unresolved. Duplex's
rooms-and-spaces IFC contains an alternative services representation; it is
inventoried without overlaying another revision on the three published
discipline layers.

## Build and checks

```sh
node scripts/build-reference-building.mjs --building schependomlaan --generated-at 2026-09-04T00:00:00.000Z --mep-only
```

This verifies every cached source against the existing manifest, inventories
all sources, and only tessellates newly published source services. Existing
envelope/energy fields, core GLBs, architectural details and discipline GLBs
are unchanged. The regular full builder also emits coverage and the new
layer. Coverage has bilingual summary and limitations, published layer IDs,
per-file occurrence counts and separate port counts.

`mep-coverage.test.ts` checks schema inheritance, excluded catalogue/proxy
classes, rejected unknown schemas, all five source/count/layer descriptions,
and the actual Schependomlaan GLB. The prose explaining 60 drainage elements
and 13 grilles is parsed back and reconciled with the source index. Geometry
hashes and stored/placed triangles are independently checked through Three's
GLTFLoader. Integration checks all five coverage panels and the apartment's
separate 73-element source layer, with independent detail/service controls.
