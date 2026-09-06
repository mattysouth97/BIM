# Building Energy Datasets

The reference models expose a versioned, machine-readable **published baseline**.
The export separates quantities extracted from IFC geometry, the inputs the
energy model actually uses, and modeled energy. No meter readings or calibration
observations are supplied.

## Downloads

| Route | Content |
|---|---|
| `/api/reference-buildings/[id]/dataset` | One building, full JSON |
| `/api/reference-buildings/datasets` | All registered buildings, full JSON |
| `/api/reference-buildings/datasets?format=csv` | One summary row per registered building |

`ReferenceDatasetDownloads` supplies links for existing model pages and the
gallery. The routes do not create an entry workflow. The catalogue iterates
`REFERENCE_BUILDING_IDS`; a new model appears when its committed manifest and
registry entry are available. A missing registered manifest fails the catalogue
request instead of silently dropping a row.

Schema: `bimfit_building_energy_dataset`, version `1.2.0`; catalogue kind:
`bimfit_building_energy_catalogue`. Breaking field or semantic changes require a
major schema increment. The HTTP response is a UTF-8 attachment with a stable
ETag and conditional-GET support.

## What the fields mean

| Field | Meaning |
|---|---|
| `measuredEnvelope` | Values copied from the current manifest; measured **from the model**, not surveyed on site. Each quantity names its unit, manifest field and selection scope. |
| `modelInputs` | The exact published recipe/material inputs, with mixed provenance explicitly stated. Legacy source/confidence metadata does not certify individual parameters. |
| `assumptions` | The adapter's named input-basis records, including assumptions and explicitly cited source inputs. Read each record's claim; the historical field name does not make a source-stated value an assumption. |
| `modelInputs.pendingMeasurements` | Values the energy adapter still uses as stand-ins, including derivation and direction of bias. |
| `modelInputs.pendingMeasurementReconciliation` | Whether the current manifest now contains a figure for each pending field. Availability requires a scope review, not automatic replacement. |
| `modeledEnergy.hvac` | Heating/cooling delivered energy after efficiency/COP, in kWh/year and kWh/(m²·year). |
| `modeledEnergy.comparisonRating` | The engine's Korean-threshold comparison, with its input fuel shares and primary factors. `officialCertificate` is false. |
| `modeledEnergy.estimatedWholeBuilding` | A separate ratio-based expansion of HVAC to lighting, DHW and plug loads. It is not the rating's fuel total. |
| `isMetered`, `meteredEnergy`, `calibration` | False, null and uncalibrated respectively. No observed consumption is implied by an energy output. |

Unavailable scalar measurements are `null` in JSON and blank in CSV. A
documented numeric zero remains zero. Unsupported format requests return 400;
unknown model IDs return 404; unavailable artifacts return 503.

### Scope traps the schema preserves

- **Openings are selected sets.** A measured aperture sum does not prove every
  exterior aperture was found. Each opening quantity carries a coverage field
  and links to the detailed opening records. On Schependomlaan, 106.06 m² of
  selected glazing and 81.03 m² of selected doors coexist with the engine's
  115.5/40 m² stand-ins. The host-wall selection and unresolved openings must
  be reviewed before replacing those inputs.
- **Roof sums differ from the energy envelope.** `roofElementSurfaceSum`
  sums element surfaces, which can overlap in a roof stack.
  `roofFamilyProjectedSum` sums unions within each family, while
  `roofPlanUnion` is one union across families. The engine's selected outer
  roof area is separately under `modelInputs.engineEnvelope.roofAreaSqm`.
  Schependomlaan's 692.04 m² element sum is not its 542.96 m² energy roof.
- **The solar input category is not a measured typology.** The adapter's
  `energyInputRoofCategory` includes its original reading. For example,
  Schependomlaan's `gable` is the nearest available solar-model category to
  its mixed roof, not a claim that it has a simple gable.
- **An IFC location is a declaration.** `verifiedCoordinates` is null even
  when declared coordinates exist. KIT labels FZK Haus and Office Building
  as fictional examples on its [source listing](https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples).
  Their models do not establish occupied buildings at their IFC coordinates.
  Clinic and Duplex real-world status remains unverified in the dataset;
  Schependomlaan's project archive supplies constructed-building context.

### Source geometry coverage (schema 1.1)

`modelGeometry` adds the artifact base URL, source architectural-detail records,
service-layer metadata and MEP coverage inventories. Missing typed MEP geometry
is a statement about the IFC sources, not proof that a building has no systems.
Inventory counts do not establish system connectivity or installed performance.
The separate energy inputs continue to disclose their system assumptions.

### Material bindings and envelope evidence (schema 1.2)

`modelGeometry.materialFabric` publishes source-to-material bindings, artifact
hashes and rendering counts. The textures illustrate the stated material class;
they do not establish an observed finish or alter thermal conductivity.

Floor-area scope and `extractionNotes.floor` preserve whether area came from
quantities or source space geometry. Klassiqua's 48 closed-space footprints
produce 1,507.02 m²; its source has no floor-area quantities. Its
`opaqueFacadeScope` records clipping cladding to the occupied-height envelope,
so the energy wall area excludes the parapet. Source-declared conductivity and
the documented insulation design factor remain separate from generic values.

## Reproducibility and reuse

The export reads manifest JSON from disk at request time and computes energy
with the same pure functions as `useEnergyMetrics`. It does not read user stores,
browser overrides, the current retrofit proposal, or financing selections.

`source` retains the source URL, source-file hashes, licence as declared,
attribution and extraction time. Missing attribution remains null and explicitly
says that the rights holder is not established; the export invents no substitute
author or licence. Source-file hashes are the extractor's recorded original-file
hashes, not a claim that the server downloaded those IFC files again.

`integrity.manifestSha256` hashes the exact served artifact bytes.
`modelInputsSha256` hashes the serialized input-registry object.
`datasetPayloadSha256` hashes the compact `JSON.stringify` of the exported object
without `integrity`, preserving property order. `codeRevision` carries deployment
metadata when present and otherwise is null. Full-response ETags hash the actual
download bytes, including formatting and integrity metadata.

CSV includes units in numeric column names, opening coverage, assumption IDs,
source hashes, licence and attribution. Formula-looking external strings are
prefixed with an apostrophe for spreadsheet safety; JSON preserves exact text.
Use the full JSON for parameter-level analysis and limitations.

Runtime filesystem reads are allowlisted before path construction. The
`/api/reference-buildings/**` tracing rule includes only manifest JSON in the
serverless bundle; meshes do not need to be bundled into these functions.

## Implementation and verification

- Pure schema/energy/CSV: `src/lib/reference-buildings/energy-dataset.ts`
- Server loading, hashes and HTTP downloads: `energy-dataset-server.ts`
- Route/provenance/CSV tests: `__tests__/energy-dataset.test.ts`

Tests compare published baseline demand/grade pairs with the values
already exercised by the model-page E2E suite, verify source/payload/HTTP hashes,
distinguish aperture stand-ins from extracted subsets, and check CSV null/zero,
Unicode, quoting, formula protection and path rejection. These checks do not
validate physical as-built performance or replace the extraction scope review.
