# Design-stage energy diagnostics

## Status and scope

This document describes the implementation in `src/lib/energy-diagnostics` and
`src/components/energy-diagnostics`. It is intentionally narrower than the full
product mission: the working engine boundary is BIMFIT's existing whole-building
degree-day screening engine. The canonical model can retain richer drawing,
space, system, schedule, renewable, and evidence data, but the adapter must not
present retained data as simulated when the current engine does not consume it.

Current contract versions are:

| Contract | Version |
| --- | --- |
| Canonical energy model | `1.0.0` |
| Drawing ingestion pipeline | `1.0.0` |
| Energy adapter | `1.0.0` |
| Engine input schema | `1.0.0` |
| Engine identifier | `bimfit-degree-day` |
| Engine version label | `existing-2026.08` |
| Tier-1 office screening template | `tier1-office-screening-v1` |
| Tier-1 model before explicit acceptance | `tier1-office-screening-v1-unaccepted` |
| Tier-1 model after explicit acceptance | `tier1-office-screening-v1-accepted` |
| Derived-project storage envelope | `2` |
| Source-byte storage envelope | `1` |

These version strings are stored with the model or run. They are compatibility
identifiers, not claims that an external simulation program was executed.

## Product workflow

The implemented vertical slice follows this reviewable sequence:

> 도면 세트 등록 → 도면 분류 → 추출 검토 → 공간 및 열구역 → 외피 성능 → 설비 시스템 → 가정 및 누락값 → 모델 검사 → 시뮬레이션 → 결과 비교

The workflow can start with a partial drawing set. Registration and extraction
results are preserved even when a reviewed canonical model cannot yet be built.
Simulation is a separate action and remains blocked until preflight succeeds.

### Narrow Tier-1 uploaded-plan path

The production Tier-1 builder is intentionally narrower than general drawing-
set review. It creates a screening model only from exactly one accepted floor-
plan document with confidently classified, calibrated physical units and exactly
one valid closed boundary. Automatic classification must have confidence at
least `0.72` and a margin of at least `0.15` over its strongest alternative;
user assignment is also accepted. The boundary must be a finite, simple polygon
in metres, its recorded area must be finite and positive in `m2`, and recorded
and polygon areas must agree within `1%` relative error.

Ambiguous classification or boundary selection, an unscaled/assumed-scale
document, any conflict not explicitly `user_resolved`, a rejected/additional/
wrong-type source, a blocking unsupported or missing extraction input, an
invalid polygon, or an area mismatch over `1%` returns `extraction_only`;
registration and evidence remain available, but no model is invented. Missing
north orientation is the only non-blocking missing input and is covered by the
visible `0 deg` template assumption.

The named assumption is
`assumption.tier1-office-screening-template`, key
`tier1.office-screening-template.v1`. Version
`tier1-office-screening-v1` has these exact values:

| Category | Exact v1 value |
| --- | --- |
| Geometry | one conditioned storey at `0 m`; `3 m` floor-to-floor; local metre coordinates; one office space/zone with `mixed` orientation |
| Site/climate | `Seoul, KR`; `37.5665`, `126.978`; north `0 deg` when absent; `KR-Seoul-TMY`; slab on grade; regional lookup HDD `2700 K-day`, CDD `220 K-day`, winter/summer design `-11.3/33.6 degC`, cooling-season solar `350 kWh/m2` |
| Envelope | wall/roof/ground U `0.35/0.20/0.40 W/m2K`; `0.5 ACH` natural/design infiltration |
| Opaque layer | one screening layer: `0.10 m`, `0.035 W/mK`, `30 kg/m3`, `1400 J/kgK`; assembly R-value `1/U` |
| Glazing | one aggregate window per exterior wall; `30%` WWR; U `1.60 W/m2K`; SHGC `0.35`; visible transmittance `0.60`; height `1.5 m`; sill `0.9 m`; width derived from area/height |
| Office use | `0.1 people/m2`; `8 W/m2` lighting; `10 W/m2` equipment; `10 L/s-person`; `20/26 degC` setpoints; Mon-Fri `08:00-18:00` |
| Schedules | occupancy/lighting/equipment value `1` for hours 08-17 and `0.05` otherwise; HVAC value `1` for hours 07-18 and `0` otherwise |
| HVAC | packaged heat pump; `electric_heat_pump` heating; `electric_dx` cooling; air distribution; `0.15 kW/m2`; heating COP `3.2`; cooling COP `3.5`; scheduled outdoor air; heat recovery `0.70` |

The floor-plate polygon and recorded area are reused unchanged as exact source-
backed facts; a finite source-backed north fact is also retained when available.
The one-storey topology, height, area-derived volume/surfaces, aggregate glazing,
envelope, office use, HVAC, and Seoul climate are assumption-dependent. Derived
facts may carry both boundary source references and the assumption ID; those
references do not turn the assumed topology or values into measured data. The
auto-builder consumes the boundary/area and optional north fact; it does not
silently blend other extracted envelope, use, system, or weather details into
the template. Those inputs require the normal reviewed-model workflow.

Creation uses model version `tier1-office-screening-v1-unaccepted` and adds the
blocking key `simulation.tier1OfficeScreeningTemplateAccepted`. The user must
review and explicitly accept this exact version before simulation. Acceptance
marks the named assumption facts and the selected floor-plate boundary/area
facts reviewed, removes that one gate, revalidates, and changes the model version
to `tier1-office-screening-v1-accepted`. It does not change fact status or
convert defaulted or inferred facts into measured, extracted, or verified facts.

The disclaimer is persistent, including after acceptance: every run remains an
assumption-heavy, regional-climate screening estimate. It is not measured
building performance and not a code, regulatory, certification, or compliance
prediction.

The representative office case exercises the same ingestion and model-review
contracts with non-proprietary DXF/SVG sources:

- one closed 20 m × 20 m DXF floor boundary plus annotations that identify
  three repeated storeys and a `0 deg` north arrow;
- east-elevation and window-schedule evidence with a visible window-width
  conflict; W01 is hosted on the level-one east-facing wall;
- a section-extracted 3.0 m floor-to-floor-height fact;
- wall and window performance schedules;
- an HVAC equipment schedule that explicitly states HP01 serves levels 01-03;
- lighting information retained as a sourced fact;
- a named, reversible infiltration assumption;
- a canonical window hosted by an exterior wall;
- a baseline run and a delta-only window-U-value scenario.

The representative case is built from exactly those seven registered sources.
The calibrated DXF boundary is repeated into three canonical floor plates using
the plan's explicit repeated-storey annotation; storey elevations, wall areas,
zone areas/volumes, and the roof/ground topology are deterministic derivatives
of that boundary and the section's 3.0 m height. W01 dimensions and the
wall/window/HVAC/lighting facts retain their exact schedule/elevation regions.
Inputs that the drawings do not contain are linked to the visible
`assumption.reference-office-design-defaults` record; no fixture geometry or
eighth evidence document enters the representative model.

## Existing BIMFIT seams preserved

This feature is additive. It does not replace BIMFIT's text generation,
schematic editor, vector importer, BIM snapshot, viewer, energy functions, or
existing project stores.

- Existing DWG conversion remains in `readCadFile` / `parseDwgFile`, including
  the libdxfrw, LibreDWG, and `/api/cad/convert` fallbacks.
- Existing DXF geometry remains parsed by `parseDxfText`.
- Existing schematic adoption remains in `mapDxfTextToDoc`,
  `importCadDocument`, and the SVG blueprint adapter.
- The diagnostics ingestion contract accepts `vectorBoundaries` and
  `extractionSignals` from those existing adapters. It does not create a second
  DWG or SVG geometry interpretation.
- Simulation calls the existing `calculateHeatLoss`, `calculateAnnualDemand`,
  and `calculateSystemBreakdown` functions.
- 3D integration converts the canonical model into the existing
  `BuildingRecipe` and `BimModelSnapshot` contracts. The diagnostics workspace
  exposes a `renderScene` seam for the existing `BuildingScene`; it does not own
  a second scene implementation.

## Architecture

```text
source bytes / existing schematic or model
                │
                ▼
       format-specific adapter
                │ DrawingSourceInput
                ▼
       drawing-set ingestion v1
                │ facts + boundaries + conflicts + gaps
                ▼
       eligibility review ──► extraction-only evidence
                │ eligible single calibrated plan
                ▼
      Tier-1 builder v1 / reviewed model operation
                │
                ▼
      canonical energy model v1
       │        │          │
       │        │          └── viewer bridge ──► existing BuildingScene
       │        └── browser persistence v2 + source bytes by SHA-256
       └── preflight ──► degree-day adapter v1 ──► existing real functions
                                      │
                                      └── canonical + spatial results/findings
```

The canonical record is data-only and uses readonly structures. Source file
bytes never appear in it. `facts` is a flat lookup index of the facts embedded
inside the model branches, not an independent interpretation. `collectEnergyFacts`
rebuilds that index, and `replaceFact` can replace every structurally shared copy
of one fact without creating divergent values with the same ID.

## Canonical model

`CanonicalEnergyModel` is the shared contract between extraction, review,
preflight, persistence, the engine adapter, and result mapping. It contains:

- project, building, site, locale, schema version, and model version;
- a revision-aware drawing set and extraction-run history;
- storeys, floor plates, spaces, thermal zones, surfaces, openings, shading,
  boundary conditions, adjacency, areas, volumes, and construction links;
- constructions and material layers, window properties, infiltration, and
  envelope notes;
- usage profiles, schedules, loads, ventilation requirements, and setpoints;
- HVAC, domestic-hot-water, and renewable-system records;
- facts, source references, conflicts, missing values, assumptions, and
  category readiness;
- canonical-to-source and canonical-to-Three-object mappings;
- delta-only scenarios, immutable engine-input snapshots, and simulation runs.

Derived identifiers use deterministic content-based `stableId` values. They are
stable when their logical inputs are stable, but they are not security hashes.
Source content uses Web Crypto SHA-256 instead.

## Provenance and conflict handling

Every material engine fact must resolve to one of four visible origins:

1. drawing evidence through one or more `SourceReference` records;
2. a user-entered value;
3. a named assumption referenced by `assumptionId`;
4. an identified regional or engine default.

`EnergyFact` records value, unit, evidence status, confidence, extraction
method, authority, review state, timestamps, source references, assumption ID,
and conflict IDs. A source reference can point to the document, page/sheet,
CAD layer, region, geometry/entity, original text, revision, extraction run,
preview coordinates, and linked 3D object.

Competing facts are never dropped. The deterministic source priority is:

1. user-confirmed project value;
2. explicit schedule or specification;
3. dimensioned vector geometry;
4. drawing annotation;
5. repeated graphical evidence;
6. deterministic rule inference;
7. project template;
8. regional or engine default.

Ties use higher confidence and then stable fact ID. A disagreement creates a
`ConflictRecord` containing all candidates, their priority, the visible selected
fact, rationale, downstream impact, and resolution status. Blocking unresolved
conflicts stop preflight; non-blocking selections remain visible and reversible.
The narrower Tier-1 builder has a stricter entry gate: every conflict must be
`user_resolved`, including a conflict that the general validator would treat as
non-blocking or automatically selected.

The evidence inspector answers “이 값은 어디에서 왔습니까?” by navigating
from a fact to its source region, original text, revision, extraction run, and
linked object. User input and assumptions intentionally have no fabricated
drawing region.

## Drawing-set ingestion

`ingestDrawingSet` performs deterministic, local processing. It currently
implements:

- filename, size, extension, MIME, and signature checks;
- rejection of path-like file names and active SVG content;
- SHA-256 hashing, exact duplicate detection, and revision grouping;
- filename/text-signal classification with user override;
- page placeholders, CAD-layer inventory, unit/scale/north facts;
- direct DXF closed-boundary extraction through the existing parser;
- acceptance of vector boundaries and semantic signals supplied by existing
  format adapters;
- evidence creation, source-priority reconciliation, conflict records,
  missing-value records, and unsupported-stage records.

Current format coverage is explicit:

| Format | Registration | Geometry in diagnostics ingestion |
| --- | --- | --- |
| DXF | Yes | Parsed directly with existing `parseDxfText` |
| DWG | Yes, signature checked | Requires the existing DWG-to-DXF path to supply boundaries; ingestion alone does not convert it |
| SVG | Yes, active content rejected | Requires the existing SVG adapter to supply calibrated boundaries; example SVGs supply semantic signals only |
| PDF | Yes, signature checked | No built-in page/vector adapter yet |
| PNG/JPEG/WEBP/TIFF | Yes, signature checked | No geometry is accepted without scale; no built-in tracing adapter yet |
| BIMFIT schematic/model JSON | Yes, JSON signature checked | Requires an existing-model adapter to supply geometry and facts |

Multipage extraction, title-block parsing, north-arrow recognition, OCR,
general schedule parsing, symbol recognition, and cross-sheet entity matching
are represented in the extraction contract but are not general-purpose parsers
in this implementation. Unsupported coverage is reported; it is not treated as
a successful extraction.

A raster plan without a confirmed scale produces a blocking calibration record.
Pixels are never converted to dimensions by this pipeline.

## Thermal zoning

Initial zone suggestions are deterministic and group spaces by:

- storey;
- conditioned or unconditioned status;
- space use;
- schedule key;
- HVAC service key;
- perimeter orientation or core status;
- atrium identity.

This avoids both unconditional one-zone-per-floor and one-zone-per-room rules.
Atriums remain separate. Zone names, area, volume, conditioning, and orientation
are inferred facts with source references and stable rule-versioned assumption
IDs. Merge and split operations create user-confirmed, deterministic zones and
require every source space to be assigned exactly once.

## Progressive preflight

Readiness is reported independently for geometry, envelope, usage, systems, and
simulation. It is not reduced to one opaque percentage.

Preflight checks currently cover:

- missing storeys or floor plates, invalid heights, open/zero/self-intersecting
  floor plates, and unsupported area units;
- absence of conditioned zones, invalid area/volume, orphan zone spaces,
  duplicate/zero-area/orphan surfaces, and missing interior adjacency;
- orphan or interior-hosted openings and invalid opening-to-host area;
- missing thermal-boundary/opening constructions and invalid U-values;
- absent wall, roof, or ground-floor engine boundaries;
- missing infiltration, usage profiles, setpoints, HVAC service, efficiencies,
  zone service mappings, and resolvable weather;
- blocking and visible conflicts, recorded missing values, and provenance for
  material engine inputs.

The validator returns object IDs, fact IDs, severity, category, and a corrective
action. It does not silently repair exact geometry.

For a newly created Tier-1 model, preflight also sees the blocking missing-value
key `simulation.tier1OfficeScreeningTemplateAccepted`. Only the explicit
acceptance operation removes that record and changes the model to
`tier1-office-screening-v1-accepted`; merely viewing, saving, or compiling the
model does not imply consent.

## Versioned real-engine boundary

The engine boundary is deliberately split into five operations:

```ts
validateCanonicalEnergyModel(model)
compileCanonicalModelToEngineInput(model, scenario)
runSimulation(engineInput)
parseEngineOutput(engineOutput, engineInput)
mapResultsToCanonicalObjects(result, engineInput, engineOutput)
```

Compilation first runs preflight and checks that a scenario belongs to the same
canonical model/schema. The immutable snapshot contains engine/schema/adapter
versions, a deterministic input fingerprint, exact recipe/material/climate
payload, provenance transformations, object mappings, and every approximation.
The fingerprint detects accidental mutation; it is not a cryptographic source
hash.

`runSimulation` executes BIMFIT's real synchronous degree-day functions. There
is no production fixture or mock-output branch. A failed run has status
`"failed"`, a null result, logs, and a typed adapter/engine error. A successful
run stores the exact input and the raw heat-loss, annual-demand, and system-
breakdown output.

The current calculation is screening-level:

- whole-building transmission and air-exchange design heat loss;
- annual heating and cooling site demand by degree days;
- orientation-averaged glazing solar gain;
- heating efficiency/fuel, cooling COP, ventilation, and heat recovery;
- use-type ratio attribution for lighting, domestic hot water, and plug loads.

It is not an hourly or regulatory simulation. Monthly/time-series results,
cooling peak, and zone peak fields stay empty or null. The one building-level
`peakHeatingKw` value is the engine's winter design heat-loss result divided by
1,000; zone peaks are not invented.

When Tier-1 assumptions are active, the payload also emits
`engine-assumption:tier1-office-screening-template` over the affected recipe,
envelope, HVAC, lighting, occupancy, and climate paths. Its warning and the
regional climate approximation remain part of the run after acceptance. No UI
or exported result may present that run as measured performance or as a code,
regulatory, certification, or compliance prediction.

## Scenarios and findings

Scenarios retain only replacements and reference the baseline model ID/schema.
The baseline facts are never mutated. Supported delta paths are limited to what
the current adapter actually reads:

- construction U-value and glazing SHGC;
- infiltration ACH;
- HVAC heating efficiency, cooling COP, heat-recovery efficiency, and outdoor-
  air flow;
- opening area.

The finding engine produces only validation-backed or real-result-backed
findings. It can report validation defects, the dominant whole-building envelope
design-heat-loss category, the ratio-estimated nature of non-HVAC end uses, run
failure, and a baseline/scenario annual-energy difference. Each finding carries
object IDs, fact IDs, sources, result paths, confidence, action, and whether the
impact was simulated.

## 2D/3D/result mapping

The mapping chain uses authored application identifiers, never transient
`THREE.Object3D.uuid` values:

```text
SourceReference.id / source entity
          ↕
EnergyFact.id
          ↕
canonical space / zone / surface / opening ID
          ↕ CanonicalObjectMapping.threeObjectIds
existing BimElement.id / authored Three object name
          ↕
spatial result canonicalObjectId + exact simulation run
```

`canonicalModelToViewerBridge` creates the existing `BuildingRecipe` and
`BimModelSnapshot` shapes. Canonical spaces become `IfcSpace`-style room
elements carrying `canonicalSpaceId`, `canonicalZoneId`, conditioning state,
area, and volume. Viewer-only fallback geometry emits warnings and never writes
facts or engine inputs.

`compileObjectMappings` carries zone, surface, and opening IDs into the engine
snapshot. `mapResultsToCanonicalObjects` maps results back to canonical and
Three IDs. Whole-building zone energy is marked
`area_apportioned_approximation`; envelope and glazed-opening design heat loss
is apportioned by `U×A`. Unconditioned is `not_applicable`, which is distinct
from a calculated zero and from `missing`.

The global selection store adds a transient, JSON-only `CanonicalSelection`.
It can carry an energy fact, thermal zone, source reference, or simulation
series together with canonical IDs, document ID, stable Three IDs, room ID, and
run ID. Clearing selection does not persist scene objects or leak Three.js
resources.

## Persistence, privacy, and retention

This slice is browser-local:

- the derived canonical project is one atomic IndexedDB record under the
  `bimfit:energy-diagnostics` namespace;
- original bytes are separate content-addressed IndexedDB records keyed by
  lower-case SHA-256;
- the canonical record stores only the source hash manifest, never binary data;
- source bytes are copied defensively and hash-verified on save and load;
- corrupt, mismatched, or unsupported records fail with typed storage errors;
- a valid V1 project is copy-migrated to V2; the V1 record is retained as a
  recovery copy.

Ingestion does not execute embedded content and does not call an external AI
service. The upload limit is 50 MiB per source and the declared page limit is
200. These controls are input hardening, not a malware scanner.

There is currently no server upload for this workflow, no cloud sharing, and no
cross-user storage surface. Consequently, server-side authentication and object-
storage authorization are not involved. There is also no implemented automatic
expiry or in-product deletion API: records remain in that browser profile until
browser/site storage is cleared or a later retention UI removes their exact
keys. This limitation must be resolved before claiming managed retention or
enterprise isolation.

## Known limitations

- Tier-1 auto-generation is an assumption-heavy, one-storey office screening
  template for one calibrated floor-plan boundary. It does not interpret a
  general drawing set or make accepted assumptions measured/compliance-grade.
- Only DXF has direct vector-boundary extraction in the diagnostics ingestion
  module. DWG, SVG, PDF, raster, schematic, and saved-model geometry require an
  adapter handoff; that handoff is not complete for every workspace upload path.
- Classification is deterministic filename/text matching, not learned drawing
  understanding. General OCR, schedule parsing, title-block parsing, north-arrow
  recognition, symbol recognition, and cross-sheet reconciliation are absent.
- The engine accepts one repeated representative footprint. Different upper-
  storey plates and exact per-surface geometry remain canonical but are
  approximated at the engine and procedural-viewer boundaries.
- Wall/window properties and WWR are whole-building aggregates. Orientation,
  shading devices, external obstructions, thermal bridges, and doors are not
  independently simulated by this adapter.
- Zone values are floor-area apportionments of a whole-building result, not
  thermal-zone simulations.
- Lighting, plug, and DHW output uses fixed use-type ratios. Extracted LPD,
  occupancy, and schedules do not drive those outputs.
- Canonical HVAC topology, capacity, control schedules, DHW systems,
  renewables/storage, tariffs, and emissions factors are retained but not
  simulated by this adapter.
- Monthly/time-series, cooling peak, and zone peak outputs are unsupported.
- The viewer bridge uses display-only representative/fallback geometry; its
  warnings must remain visible and those values must never flow back into the
  canonical model or simulation.
- The project/source store is local to one browser profile and has no automatic
  retention/deletion control.

The detailed boundary between consumed and retained inputs is maintained in
[`energy-input-source-map.md`](./energy-input-source-map.md). Every default,
approximation, and fixture-only inference is catalogued in
[`assumption-catalog.md`](./assumption-catalog.md).
