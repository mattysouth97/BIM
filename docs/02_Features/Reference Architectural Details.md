# Source architectural detail layers

The five published reference buildings now have a separate
`architectural-details.glb`, described by `manifest.architecturalDetails`.
This is source geometry previously omitted by the core fabric extractor.
It does not change envelope measurements, energy inputs or existing service
geometry. The viewer integrates it as an architectural toggle; it must not
trigger the service layers' envelope X-ray treatment.

## Published extraction

| Building | Rendered source elements | GLB bytes | Stored triangles | Draw calls |
|---|---:|---:|---:|---:|
| Medical-Dental Clinic | 1,409 | 17,733,072 | 345,439 | 129 |
| Schependomlaan | 1,214 | 1,318,168 | 28,221 | 28 |
| Duplex Apartment | 93 | 647,308 | 12,008 | 20 |
| FZK House | 6 | 84,388 | 1,832 | 4 |
| KIT Office | 267 | 27,080 | 252 | 4 |

The triangle figures above are the stored meshes, counting an instanced shape
once. `placedTriangleCount` counts every actual placement and is reconciled
against the GLB and the element index in tests. The source model determines
the available detail: the Office's source furnishing geometry is simple even
though it contains many placements. No fabricated furniture or surface
textures are added to make an incomplete source look more detailed.

Selected classes and source roles:

- Clinic architectural: 118 furnishings, 250 coverings and 9 railings;
  structural: 738 beams, 195 columns, 96 footings and 3 railings.
- Schependomlaan architectural: 1,214 of 1,262 coverings emit a nonempty mesh.
  The other 48 are recorded as `withoutRenderedMesh`, not silently counted as
  rendered. Existing supplier steel, precast and railing layers remain
  separate; architectural frame and railing copies are excluded to avoid
  overlapping those supplier layers.
- Duplex architectural: 61 furnishings, 13 coverings, 4 railings, 8 beams
  and 7 footings.
- FZK architectural: 4 beams and 2 railings.
- KIT Office architectural: 253 furnishings, 12 railings and 2 columns.

`architectural-details-index.json` names every rendered element by source
role, IFC express ID, GlobalId, class, name and source reference, with mesh
part and placed triangle counts. The manifest records source IFC SHA-256s,
GLB/index SHA-256s, per-class candidate/rendered counts and byte/draw-call
budgets. Existing source licences and attributions continue to apply.

## Geometry and appearance

The extractor retains web-ifc's metre/Y-up geometry and original placements.
Repeated byte-identical geometry shares shapes. Tiny parts are merged by
source colour; instancing is used when it saves at least 512 source vertices.
Identical position/normal vertices at Float32 precision are reused without
a proximity tolerance, triangle removal or geometric simplification.

Mirrored placements are baked into reflected source geometry with reversed
triangle winding, leaving positive determinant instance transforms for
Three.js. Every detail transform is checked for finite, non-singular affine
TRS; shear fails extraction instead of being silently approximated. Merged
normals use the inverse transpose for nonuniform scale.

The GLB retains the tessellator's RGBA per part, which can include default
styles where the author supplied none. These colours are not a measured
finish. Metalness 0 and roughness 0.85 are renderer assumptions; there are no
inferred finish textures. These are selected source classes, not a claim of
complete architectural or fabrication detail, or a certified LOD level.

## Rebuild and validation

Run from the repository root with the documented direct Node invocation:

```sh
node scripts/build-reference-building.mjs --building fzk-haus --generated-at 2026-09-04T00:00:00.000Z --details-only
```

`--details-only` requires the building's existing manifest, verifies cached
IFC bytes against its source hashes, and writes only the additive manifest
field and two new detail artifacts. The regular full builder also emits the
layer. Extraction fails above 20 MiB or 200 draw calls per detail layer;
these are explicit payload limits, not permission to drop source objects.

`architectural-details.test.ts` decodes all five real GLBs through Three's
GLTFLoader, checks stored and placed triangles, positive instance determinants,
finite geometry, index identity/counts, source hashes, and payload limits.
Fixtures check reflection/winding, rejected shear, nonuniform normal transforms
and exact vertex reuse. Source counts and IFC identities were separately
audited against cached raw STEP records. Viewer screenshot validation belongs
to the integrating viewer milestone.
