# Klassiqua Office 1970

The new reference is a **synthetic research archetype**, not a constructed office. It is the July 1970 variant of Klassiqua's German office family. The 1998 and 2026 variants are not published in this change.

## Sources

- [July Zenodo record 21727160](https://zenodo.org/records/21727160), CC BY 4.0, verified in its official API metadata. Full creator attribution and adaptation notice are in the gallery and manifest.
- IFC: `2026-07_Klassiqua_Buero_Archetyp_Baujahr_1970.ifc`, 1,471,687 bytes, SHA-256 `4d77774850b817d8ed9534e19886a1ff7fbcbe734a8f3138eebf2751e4c879fb`.
- July documentation PDF SHA-256 `116268af3109e568616acf4aa83b61e81905ee05a8590f249166be0746afa659`; its URL, hash and scope are in `manifest.documentation` and the energy dataset export.
- Source IFC header: IFC4X3_ADD2, ReferenceView, Bonsai/IfcOpenShell 0.8.5-post1, exported 2026-07-30. The 1970 year is an archetype era, not a construction record.

## What the importer measures

- 48 closed room solids, 12 on each of four storeys. No room has a floor-area quantity. Plan unions yield 1,507.02 m², consistent with the PDF's rounded 1,507 m². Individual rooms retain `areaQuantityName:null` and `floorAreaSource:solid_plan_union`.
- The four storeys have absent `Elevation` attributes. Nested placements give 0 / 3.55 / 7.10 / 10.65 m. A stated zero still wins over a placement fallback.
- This IFC has 675 second-level space boundaries and zero base-class rows. Exact web-ifc type queries previously omitted them. Boundary subtype queries now deduplicate by entity ID. Boundaries supply membership, never envelope area.
- 16 exterior masonry walls remain the host set for 167 whole-window openings (379.92 m²) and one exterior door (2.78 m²). The other 48 doors are interior-hosted.
- Masonry wall solids alone omit floor-edge bands. The opaque envelope instead measures 16 `AluminiumCladding_1970` solids, clipped to measured room limits 0–14 m: 832.72 m². Full cladding faces are 881.33 m²; excluded upper faces are 48.62 m², with independently rounded totals. Source rows and clip limits are retained under `areas.opaqueFacade`. The PDF's 30.13% façade WWR has a different parapet scope and is not substituted for the measured ratio.
- Ground slab union 427.36 m², outer perimeter 87.11 m. Gross modeled volume 5,274.63 m³, room-solid net volume 5,048.52 m³.
- Roof surface 420.94 m² from visible plane rows: 397.96 m² of roofing and 22.98 m² of visible structural perimeter. Lower layers are not priced twice; the layer sum is 818.89 m². The source types its gravel roofing covering as `FLOORING`, so an explicit source-name rule includes it without rewriting the source type. Parapet caps are excluded. PV placement fits 84 modules / 33.6 kWp on the covering, none on the narrow structural ring.

## Appearance and thermal evidence

The 16 opaque curtain walls previously fell into the generic glass group. For this source they are excluded from that fabric group and included once in the source-coloured architectural details: 52 coverings + 16 cladding elements, 68 total, five draw calls, 120,560-byte detail GLB. This is source geometry and tessellator colour, not a measured finish texture.

Fifteen source layer assemblies retain exact names, order, thickness refs and optional `sourceThermalProperties: {conductivityWPerMK, ref}`. The extractor only emits positive source conductivity under an explicit verified-SI policy and does not invent absent values. The ventilated aluminium layer has no conductivity. Root integrates the material-card consumer: source λD with the PDF's 1.03 design factor on four insulation names; other source conductivities use factor 1.0. Standalone layer-card U uses the existing library surface resistances and must not be called the complete source envelope U.

## Energy interpretation

The baseline selects source **T1_1970**: gas-condensing/radiator heating, natural ventilation, no active cooling and no PV. Source design U-values are wall 1.05, roof 0.62, ground 0.45 and whole-window 4.18 W/m²K. Ground U already includes ISO 13370 coupling; no second ground calculation is applied. Source glazing g is 0.78. Both window types state two glass layers, air fill, no coating, VLT 0.81 and shading coefficient 0.87. The source's 32 single-leaf / 135 double-leaf counts do not describe single/double glazing.

The engine uses assumed Seoul climate, 0.90 heating efficiency, 10 ACH50, office schedules and occupancy. Cooling efficiency zero intentionally produces zero cooling electricity; it does not establish comfort. The visible scope notice states these limitations. Applying the full-wall U uniformly across floor-edge bands omits detailed thermal bridges and may understate loss. The engine prices the door at wall U instead of the source Ud 4.33, understating that door's coefficient by 9.1184 W/K; this is explicitly quantified in the assumptions. Baseline result: **177.131176494 kWh/m²·yr, grade 2**, with zero cooling electricity.

The IFC true north puts walls in NE/SE/SW/NW. Four internal engine slots are retained, with `orientationLabels` giving their actual octants. The same additive caption mapping corrects the FZK diagonal labels. Root/roof_panel integrates the shared legend consumer.

## Verification and integration

- `tsc --noEmit`: passed.
- Reference/gallery tests: 446 passed across 19 files.
- New model plus PV geometry/table tests: 80 passed across three files.
- Scoped ESLint: passed.
- Builder successfully regenerated the complete new artifact set; a second run produced identical SHA-256 hashes for all eight files. Source parser tests cover quantity priority, nested placement units, missing evidence, boundary subtype deduplication, declared roof-covering scope and source conductivity provenance.
- Root must visually inspect the combined main viewer after cherry-pick and consume `areas.floorAreaNote` in the workspace caption. Main also owns material-card λ support and compass labels. Those integration changes are outside this isolated worktree's browser verification.

Rebuild:

```powershell
node scripts/build-reference-building.mjs --building klassiqua-office-1970 --generated-at 2026-09-07T00:00:00.000Z
```

Shared parser commit `47d6f2b` precedes the model commit. The unrelated shared property reader was cherry-picked here as `9d92c2c` from `2bf492d`; do not cherry-pick it twice.
