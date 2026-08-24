# Assumption, default, and inference catalog

## Catalog rules

This catalog separates four things that are easy to conflate:

- **Canonical assumption** — a reversible `AssumptionRecord` and an
  `EnergyFact.assumptionId` visible to the user.
- **Run approximation/default** — an `EngineApproximation` stored in the exact
  engine payload and repeated in run warnings.
- **Engine constant** — a code-level screening coefficient. Some constants do
  not yet emit a standalone runtime record; this is stated explicitly.
- **Fixture/display rule** — controlled test truth or viewer-only fallback. It
  never becomes an undocumented production simulation input.

Unless a row says otherwise, overriding a canonical fact and regenerating the
run is the only valid way to change its result. Scenario overrides remain
delta-only and never edit drawing evidence.

## Canonical project assumptions

### `assumption.tier1-office-screening-template`

This is the versioned production assumption used only by the narrow Tier-1
uploaded-plan path. It is independent of the controlled fixtures below.

| Field | Exact value |
| --- | --- |
| Assumption key | `tier1.office-screening-template.v1` |
| Template version | `tier1-office-screening-v1` |
| Model version before acceptance | `tier1-office-screening-v1-unaccepted` |
| Model version after acceptance | `tier1-office-screening-v1-accepted` |
| Blocking acceptance key | `simulation.tier1OfficeScreeningTemplateAccepted` |

The builder creates this model only when all of the following are true:

- there is exactly one accepted source document and no rejected upload;
- the document is classified as `floor_plan` by user assignment, or its
  classification confidence is at least `0.72` and is at least `0.15` above the
  strongest alternative;
- the document validation status is accepted; unit and drawing-scale facts are
  non-null, non-missing, non-defaulted, non-conflicted, and not assumption-
  backed; and drawing scale is finite and positive;
- every conflict has `resolutionStatus: user_resolved`, and there are no
  blocking unsupported extraction stages or blocking missing values other than
  north orientation;
- exactly one valid, finite, simple closed boundary is present in metres, with a
  positive recorded area in `m2`; and
- the recorded area and polygon area agree within `1%` relative error.

An ambiguous classification, unscaled or assumed-scale geometry, unresolved
or merely auto-selected conflict, zero or multiple boundaries, invalid boundary,
or area mismatch over `1%` remains `extraction_only`. Rejected, multi-document,
wrong-type, blocked, or otherwise incomplete input also remains extraction-only;
this path never invents a model to get past eligibility. A missing north
orientation is the one non-blocking exception and is covered visibly by the
template value `0 deg`.

#### Exact v1 template values

| Category | Exact value |
| --- | --- |
| Geometry | one conditioned storey; elevation `0 m`; floor-to-floor height `3 m`; coordinate system `local-meters-x-east-y-north`; orientation band `mixed` |
| Site | `Seoul, KR`; latitude `37.5665 deg`; longitude `126.978 deg`; north `0 deg` when absent; weather source `KR-Seoul-TMY`; `slab_on_grade` |
| Compiled regional climate | Seoul lookup: HDD `2700 K-day` (base `18 degC`), CDD `220 K-day` (base `24 degC`), winter design `-11.3 degC`, summer design `33.6 degC`; cooling-season solar `350 kWh/m2` |
| Opaque envelope | wall U `0.35 W/m2K`; roof U `0.20 W/m2K`; ground U `0.40 W/m2K` |
| Opaque construction layer | one screening layer: thickness `0.10 m`, conductivity `0.035 W/mK`, density `30 kg/m3`, specific heat `1400 J/kgK`; assembly R-value is `1/U` |
| Glazing | one aggregate window per exterior wall; window-to-wall ratio `0.30` (`30%`); U `1.60 W/m2K`; SHGC `0.35`; visible transmittance `0.60`; height `1.5 m`; sill `0.9 m`; width derived as opening area / `1.5 m` |
| Infiltration | `0.5 ACH` natural/design infiltration; explicitly not an ACH50 test result |
| Use | `office`; occupancy `0.1 people/m2`; lighting `8 W/m2`; equipment `10 W/m2`; ventilation `10 L/s-person`; heating/cooling setpoints `20/26 degC`; operating hours `Mon-Fri 08:00-18:00` |
| Occupancy, lighting, and equipment schedule | hours `08:00` through `17:59` value `1`; all other hours value `0.05` |
| HVAC | `packaged_heat_pump`; heating source `electric_heat_pump`; cooling source `electric_dx`; distribution `air`; capacity `0.15 kW/m2`; heating COP `3.2`; cooling COP `3.5`; outdoor-air strategy `scheduled_outdoor_air`; heat recovery `0.70` |
| HVAC control schedule | hours `07:00` through `18:59` value `1`; all other hours value `0` |

The extracted floor-plate polygon and recorded area are reused as the original
source-backed facts. Everything that needs more than those facts is
assumption-dependent: the single-storey/space/zone topology, height and volume,
wall/roof/ground derivation, aggregate glazing, envelope performance, office
use, schedules, HVAC, and Seoul climate. Some derived geometry facts therefore
carry both the boundary source references and this `assumptionId`; source links
do not make the assumed height, topology, or template inputs measured.
When a finite north-orientation fact is present, it also retains its source and
review state; otherwise the visible `0 deg` assumption applies.
This builder also does not import other detailed envelope, use, system, or
weather facts that may be present in ingestion; those uploads require the normal
review/model workflow rather than being silently blended with the Tier-1 model.

The initial model is deliberately invalid for simulation. A blocking missing-
value record requires the user to review and explicitly accept this exact
version. Acceptance marks facts carrying this assumption and the selected
floor-plate boundary/area facts as reviewed, changes the model version to
`tier1-office-screening-v1-accepted`, removes that one gate, and re-runs
validation. It is acknowledgement, not new evidence: acceptance never changes
fact status or turns assumed/inferred inputs into measured, extracted, or
compliance-verified facts. The assumption is reversible, and sourced/user-
confirmed replacements require a regenerated run.

Every resulting run must retain its assumption-heavy warning and regional
climate approximation. The result is screening output, not measured building
performance and not a code, regulatory, certification, or compliance
prediction. This disclaimer persists after acceptance and on displayed results.

### `assumption.reference-office-natural-infiltration`

| Field | Value |
| --- | --- |
| Trigger | The representative office drawing set contains no airtightness or infiltration source |
| Value/method | `0.5 ACH` natural/design infiltration, inserted only after the user applies it |
| Scope | Representative office building envelope |
| User explanation | Early-design natural infiltration until an airtightness specification is supplied |
| Simulation impact | Changes the air-exchange heat-loss coefficient and annual heating/cooling demand |
| Override | Replace with a sourced or user-confirmed ACH fact; the assumption remains reversible and records `overriddenByFactId` |

Before acceptance the fact is `missing`, the corresponding missing-value record
is blocking, and simulation cannot compile. The named assumption is not a global
default for arbitrary projects.

### `assumption.reference-office-design-defaults`

| Field | Value |
| --- | --- |
| Trigger | The representative seven-document set supplies geometry and selected schedules but is silent on the remaining whole-building screening inputs |
| Value/method | Seoul / `KR-Seoul-TMY`; roof/ground U `0.20/0.40 W/m²K`; office occupancy `0.10 people/m²`, plug load `10 W/m²`, 20/26 °C setpoints, Mon–Fri schedules, heating COP `3.2`, outdoor air `10 L/s-person`, and heat recovery `0.70` |
| Scope | Only the representative-office canonical model and facts that explicitly carry this ID |
| User explanation | These are early-design defaults for fields absent from the seven sources; the sourced DXF, section, wall/window, HVAC, and lighting values remain distinct and higher-authority |
| Simulation impact | Regional climate, roof/ground heat loss, heating setpoint, ventilation, recovery, and heating efficiency; retained density/schedule fields do not become simulated end-use physics |
| Override | Replace individual facts with sourced or user-confirmed project values and create a new run; never transfer this record to arbitrary uploads |

The representative W01 sill is not part of this assumption: the elevation now
supplies an explicit `0.9 m` sill fact and source region.

### `assumption.dxf-unitless-as-meter`

| Field | Value |
| --- | --- |
| Trigger | Existing DXF parser reports a unitless drawing and no explicit input units/scale were supplied |
| Value/method | Treat one drawing unit as one metre for the document unit and scale facts |
| Scope | That source document only |
| User explanation | The DXF did not declare units; metre interpretation is a low-confidence project-template assumption |
| Simulation impact | Every derived length, area, and volume can scale incorrectly if the assumption is wrong |
| Override | Supply `DrawingSourceInput.units` and `drawingScale`, or correct them in review before model compilation |

Both affected facts are marked `defaulted`, confidence `0.5`, and
`reviewedByUser: false`. The assumption does not make raster pixels calibrated.
Because the Tier-1 eligibility gate rejects defaulted or assumption-backed unit
and scale facts, this DXF assumption must be replaced by extracted or user-
confirmed calibration before the Tier-1 auto-builder can run.

### `assumption_<stable-hash>` from `zoning-rule-v1`

Each inferred zone fact receives a deterministic ID produced by:

```text
stableId("assumption", fact-key, "zoning-rule-v1")
```

| Field | Value |
| --- | --- |
| Trigger | `suggestThermalZones` creates candidates from reviewed spaces |
| Value/method | Group by storey, conditioning status, space type, schedule key, HVAC service key, atrium identity, and perimeter/core orientation |
| Scope | Each inferred zone name, conditioning state, area, volume, and orientation fact |
| User explanation | A deterministic energy-behavior grouping, not one zone per floor or automatically one zone per room |
| Simulation impact | Conditioned area controls EUI, HVAC weighting, and area-apportioned zone results; exact zone physics is not simulated |
| Override | Accept, merge, split, or rename. User operations create user-confirmed facts and stable merge/split IDs |

These are fact-level assumption IDs. The fixture builder does not also populate
a duplicate top-level `AssumptionRecord` for every generated zone.

## Engine-run approximation and default records

The following IDs are emitted in `DegreeDayEnginePayload.approximations` when
their trigger applies.

### `engine-assumption:tier1-office-screening-template`

- **Trigger:** a compiled model contains
  `assumption.tier1-office-screening-template` after explicit user acceptance.
- **Method:** repeats the active versioned template at the engine boundary and
  links all facts carrying its assumption ID.
- **Scope:** `recipe.floors`, `recipe.totalHeight`, `recipe.facade`,
  `materials.envelope`, `materials.hvac`, `materials.lighting`,
  `materials.occupancy`, and `climate`.
- **Explanation/impact:** keeps the run visibly assumption-heavy; it is not
  measured data or a compliance prediction.
- **Override:** replace template facts with sourced or user-confirmed project
  facts through the reviewed model workflow and compile a new run.

### `engine-assumption:ground-temperature`

- **Trigger:** every compiled run while the canonical contract has no explicit
  ground-temperature field.
- **Method:** writes the legacy engine's fixed `13.5 °C` value and links the
  model's weather source, location, and ground relationship as trigger context.
- **Scope:** `materials.envelope.foundation.groundTemperature`.
- **Explanation/impact:** affects ground-floor design and annual heat loss; it
  is screening default data, not a measured site temperature.
- **Override:** requires a versioned canonical ground-temperature field and
  adapter extension; changing only unrelated climate facts does not override it.

### `engine-assumption:thermal-bridge-zero`

- **Trigger:** every compiled run while the canonical contract has no numeric
  junction-loss/thermal-bridge field.
- **Method:** writes a zero additive U-value surcharge on all four wall records
  and links the canonical thermal-bridge notes fact as context.
- **Scope:** `materials.envelope.walls[].thermalBridge`.
- **Explanation/impact:** zero is consumed by wall transmission and can
  understate heat loss where junctions are material; it is not measured truth.
- **Override:** requires a versioned numeric thermal-bridge contract and adapter
  mapping; prose notes alone do not change the value.

### `engine-method:degree-day-screening`

- **Trigger:** every compiled run.
- **Method:** BIMFIT's existing whole-building steady-state design heat loss and
  annual degree-day demand functions.
- **Scope:** recipe, material, and climate payload.
- **Explanation/impact:** appropriate for design screening; not hourly,
  regulatory, or certification analysis.
- **Override:** use a future versioned adapter to a verified dynamic engine; do
  not relabel this output.

### `engine-approximation:end-use-ratios`

- **Trigger:** every compiled run.
- **Method:** anchors HVAC to degree-day heating+cooling, then applies the
  building-use ratios in `SYSTEM_RATIOS` or `DEFAULT_RATIOS`.
- **Scope:** lighting, DHW, and plug/equipment annual outputs.
- **Explanation/impact:** extracted LPD, occupancy, equipment density, and
  schedules do not drive these values.
- **Override:** requires an engine adapter that consumes those inputs; user
  edits to unsupported fields must not be presented as simulated savings.

### `engine-approximation:zone-apportionment`

- **Trigger:** every compiled run.
- **Method:** allocates whole-building heating, cooling, and total energy to
  conditioned zones by floor-area share.
- **Scope:** `result.zones` and zone spatial overlays.
- **Explanation/impact:** useful for navigation and coarse attribution, not a
  zonal heat balance.
- **Override:** requires a zone-capable engine. The UI must retain the
  `area_apportioned_approximation` status.

### `engine-unsupported:monthly-and-cooling-peak`

- **Trigger:** every compiled run.
- **Method:** keeps monthly, time-series, zone-peak, and cooling-peak outputs
  empty or null.
- **Scope:** temporal and peak fields.
- **Explanation/impact:** prevents unsupported output from appearing as zero.
- **Override:** only a real engine output can populate these fields.

### `engine-assumption:regional-climate`

- **Trigger:** explicit HDD, CDD, winter design temperature, and summer design
  temperature facts are not all present, but `weatherSource`/`location` contains
  a supported Korean region token.
- **Method:** `getClimateData` static regional HDD/CDD/winter-design lookup;
  summer design remains the shared Seoul value `33.6 °C`.
- **Scope:** whole-building climate.
- **Explanation/impact:** HDD/CDD affect annual heating/cooling; winter design
  temperature affects design heat loss.
- **Override:** supply all four exact climate facts from an approved source.

The actual static table is:

| Region code | HDD (base 18 °C) | CDD (base 24 °C) | Winter design °C |
| --- | ---: | ---: | ---: |
| 11 Seoul | 2700 | 220 | -11.3 |
| 26 Busan | 1900 | 280 | -5.3 |
| 27 Daegu | 2200 | 320 | -7.6 |
| 28 Incheon | 2750 | 200 | -10.4 |
| 29 Gwangju | 2150 | 270 | -6.6 |
| 30 Daejeon | 2400 | 250 | -10.3 |
| 31 Ulsan | 2050 | 260 | -7.0 |
| 36 Sejong | 2450 | 240 | -10.3 |
| 41 Gyeonggi | 2750 | 210 | -11.3 |
| 43 Chungbuk | 2800 | 230 | -10.9 |
| 44 Chungnam | 2600 | 240 | -9.6 |
| 46 Jeonnam | 2100 | 280 | -6.1 |
| 47 Gyeongbuk | 2500 | 260 | -9.0 |
| 48 Gyeongnam | 2100 | 290 | -6.3 |
| 50 Jeju | 1600 | 320 | -1.1 |
| 51 Gangwon | 3400 | 150 | -14.7 |
| 52 Jeonbuk | 2350 | 260 | -8.7 |

The underlying engine also retains legacy code 45 for Jeonbuk with the same
values, but the diagnostics adapter maps Jeonbuk to code 52.

### `engine-assumption:cooling-solar`

- **Trigger:** no finite `site.climate.coolingSeasonSolarKwhPerM2` fact.
- **Value/method:** `350 kWh/m²` per cooling season, orientation averaged.
- **Scope:** whole-building glazing solar gain.
- **Explanation/impact:** affects annual cooling raw load through glazing area ×
  SHGC × solar × the fixed shading/frame factor.
- **Override:** provide a traceable explicit solar fact.

### `engine-approximation:representative-footprint`

- **Trigger:** more than one floor plate exists and their boundary signatures
  differ.
- **Method:** use the lowest valid plate and its voids as one repeated engine
  footprint while retaining the exact sum of conditioned zone area for EUI.
- **Scope:** plan/roof/ground area, perimeter, volume, and total-height envelope.
- **Explanation/impact:** setbacks and different upper-floor plates are not
  represented in the engine geometry.
- **Override:** requires a multi-footprint engine adapter; canonical geometry is
  retained for that future compilation.

### `engine-approximation:exterior-doors`

- **Trigger:** one or more canonical openings have type `door`.
- **Method:** no separate door heat-loss term is compiled.
- **Scope:** exterior-door area and U-value.
- **Explanation/impact:** door performance cannot be diagnosed independently;
  door spatial result is `not_applicable`.
- **Override:** requires a door-capable engine mapping.

### `engine-approximation:hvac-aggregation`

- **Trigger:** more than one HVAC system exists.
- **Method:** heating/cooling efficiencies are weighted by served conditioned
  area; ventilation flows are summed; heat recovery is flow weighted; largest
  served area chooses the primary heating source/capacity payload.
- **Scope:** one whole-building legacy HVAC record.
- **Explanation/impact:** system topology and part-load behavior are lost.
- **Override:** requires a multi-system engine adapter.

### `engine-boundary:natural-ach`

- **Trigger:** every compiled run.
- **Method:** canonical natural/design ACH × 20 is written to legacy field
  `airtightness.ach50`; `calculateHeatLoss` divides it by its fixed LBL N-factor
  20.
- **Scope:** infiltration term.
- **Explanation/impact:** preserves the canonical ACH exactly at this boundary;
  it does not assert that an ACH50 test occurred.
- **Override:** compile a true pressure-test model through a contract that can
  represent it explicitly.

## Engine constants and deterministic mappings without separate runtime IDs

These are code symbols or input paths, not top-level `AssumptionRecord` IDs.
They are listed because they can affect the result even though the current run
payload does not emit an individual record for each one.

| Code/path identifier | Trigger and value/method | Scope and simulation impact | Override behavior |
| --- | --- | --- | --- |
| `adapter:mainPurposeCode` | Maps office→`14000`, apartment/residential→`02000`, retail→`07000`, any other text→`00000` | Selects reported end-use ratios | Correct `building.useType`; unknown remains visible through the source fact |
| `system-breakdown:DEFAULT_RATIOS` | Unknown use: HVAC 0.42, lighting 0.28, DHW 0.12, plug 0.18 | Annual end-use attribution | Supply a mapped use or replace the adapter; not editable as a scenario |
| `adapter:whole-building-wall-aggregation` | Area-weighted wall U applied equally to N/S/E/W | Transmission heat loss | Future adapter must map orientation explicitly; zero junction loss is separately disclosed by `engine-assumption:thermal-bridge-zero` |
| `adapter:orientation-average-WWR` | Total glazing area ÷ total exterior-wall area, capped `0.95`, copied to all four orientations | Window/wall heat loss and solar gain | Scenario can change opening area; orientation-specific changes unsupported |
| `adapter:no-glazing` | No glazed openings yields U `1`, SHGC `0`, WWR `0` | U is numerically irrelevant because window area is zero | Add a sourced opening or explicitly confirm zero openings |
| `heat-loss:AIR_HEAT_CAPACITY_WH_M3K` | `0.34 Wh/(m³·K)` | Air-exchange heat-loss coefficient | Engine version change only |
| `heat-loss:ACH50_TO_NATURAL` | `20` | Paired with boundary translation above | Engine/adapter version change only |
| `heat-loss:AIRFLOW_ACH_MAX` | Ventilation airflow `>5` is treated as `m³/h` and divided by volume; otherwise treated as ACH | Mechanical ventilation heat loss | Adapter supplies L/s×3.6; future contract should remove heuristic units |
| `heat-loss:ventilationEta` | Percent when value `>1`, then clamped to `0…0.95` | Heat-recovery credit | Correct the source value; scenario accepts fraction or percent |
| `annual-demand:HEATING_SEASON_HOURS` | `4380 h` | Annualizes ground heat loss at constant ground ΔT | Engine version change only |
| `annual-demand:SOLAR_SHADING_FACTOR` | `0.7` | Multiplies cooling-season glazing solar gain | No canonical shading scenario in current adapter |
| `annual-demand:normalizeEfficiency` | Values `>10` interpreted as percent; heating clamped `0.3…6`; positive cooling COP minimum `1` | Annual delivered heating/cooling energy | Use an unambiguous sourced value; engine version change for different bounds |
| `adapter:heating-fuel-map` | heat-pump token→heat-pump; district→district; electric→electric; oil→oil; other→gas | Raw `fuelDemand` split; oil later uses gas CO₂ category | Correct `heatingSource`; canonical result currently does not publish carbon |
| `adapter:profile-setpoint-weight` | Assigned conditioned-zone area weights profiles; an unassigned profile receives weight `1` | Heating setpoint changes design/ground heat loss; cooling setpoint is currently unused | Complete usage-profile-to-zone mappings |
| `adapter:heat-recovery-zero-flow` | No positive ventilation weight yields recovery `0`; total zero flow creates natural ventilation type | Air-exchange term | Supply sourced flow/recovery facts |
| `adapter:primary-system` | Largest served conditioned area wins; stable input order breaks an equal weight | Fuel/capacity payload; capacity is not consumed | Use explicit multi-system adapter for system-level fidelity |
| `adapter:deterministic-input-hash` | Sorted immutable payload, two FNV-1a-style 32-bit values | Detects mutation and makes identical inputs reproducible | Not a security hash; source integrity always uses SHA-256 |

The legacy engine also contains dormant fallbacks (wall U `0.47`, missing
foundation temperature `13.5 °C`, missing solar `350`, missing SHGC `0.6`, and
missing ACH50 `0`). A valid diagnostics compilation supplies those fields, so
these fallbacks are not the source of a successful canonical run.

### Adapter placeholders with no current numerical effect

The compiler must fill the broader legacy `BuildingRecipe` and
`MaterialProperties` contracts even when the three called energy functions do
not read every field. These values are frozen in the exact input snapshot but
are not simulation claims:

| Identifier | Compiled placeholder | Current behavior |
| --- | --- | --- |
| `adapter:recipe-shell` | wall thickness 0.2 m; era `2020+`; blank structure code; fixed zero/minimal facade, slab, column, flat-roof, and PBR values; site margin max(1.5× extent, extent+10 m) | Supports the shared recipe/view contract; current energy functions use footprint, floors, total height, official area, and main purpose only |
| `adapter:material-metadata` | source `code-estimate`, confidence `estimated` when the canonical model contains assumed/defaulted inputs; otherwise source `user-input`, confidence `measured`; code year 2026 | Metadata only; detailed fact provenance remains in the separate payload provenance entries |
| `adapter:wall-unused-fields` | R=1/U, empty layers, surface area ÷4 by orientation | Current heat loss reads average U and zero thermal-bridge surcharge, not R/layers/surfaceArea |
| `adapter:roof-unused-fields` | empty layers, reflectance 0.5, emissivity 0.9, green roof 0 | Current engine reads roof U only |
| `adapter:ground-unused-fields` | perimeter insulation U=floor U, contact resistance 0, moisture barrier `none` | Current engine reads ground-floor U and the explicit 13.5 °C ground temperature only |
| `adapter:window-unused-fields` | VLT 0, double glass, no coating, air fill, thermal-break aluminium frame, leakage 0, shading coefficient 1 | Current engine reads window U, SHGC, and WWR; its 0.7 solar factor is independent of these placeholders |
| `adapter:airtightness-unused-fields` | equivalent leakage area 0, method `estimated` | Current engine reads the translated ACH50 field only |
| `adapter:hvac-capacity-and-types` | primary capacity or 0; deterministic central/district/chiller/natural/mechanical type labels | Type influences only ventilation natural/mechanical branching; capacities do not size or cap load |
| `adapter:dhw-placeholder` | gas boiler, efficiency 1, storage 0 | Ignored; reported DHW is use-type ratio attribution |
| `adapter:lighting-placeholder` | profile-average LPD, manual control, LED | All three are ignored by current calculations; reported lighting is ratio attribution |
| `adapter:renewable-placeholder` | PV/solar thermal/geothermal disabled with zero capacity/area/COP | Ignored; no renewable production or offset is calculated |
| `adapter:occupancy-placeholder` | profile-average density, empty weekday/weekend schedules, zero heat gain and hot water | Ignored by current calculations |

## Ingestion and classification inferences

| Identifier | Trigger/method | Scope and user explanation | Override |
| --- | --- | --- | --- |
| `classification:RULES-v1` | Korean/English filename and up to 64,000 characters of text signals; filename match weight `0.72`, content match `0.22`, capped `0.99`; no match confidence `0.15` | Suggests drawing type/discipline only; it does not prove extracted semantics | `userDocumentType` produces confidence `1` and method `user_assignment` |
| `classification:documentTier` | Tier 1 for site/plan/elevation/section/opening schedules; Tier 2 for details/construction/HVAC/lighting documents; other known types Tier 3; unknown Tier 1 | Drawing-set tier is the highest classified document tier, not a readiness score | Reassign document type; readiness remains category-based |
| `classification:inferRevision` | Explicit revision wins; otherwise filename `rev`, `revision`, `r`, or `개정` token; otherwise `"0"` | Revision grouping and conflict context | Supply explicit revision |
| `ingestion:duplicate-by-sha256` | Exact content hash repeats | Later document points to `duplicateOfDocumentId`; extraction is skipped/reused | Change source content or remove duplicate registration |
| `ingestion:revision-group-stem` | Filename minus extension/revision token, normalized to hyphens/lowercase | Connects revisions; later non-duplicate document records `supersedesDocumentId` | Supply consistent filenames/revisions; no content is deleted |
| `ingestion:default-page-count` | `pageCount` omitted → one page placeholder | Metadata only; not proof of actual PDF pagination | A format adapter supplies real page count/pages |
| `ingestion:default-ingested-at` | timestamp omitted → Unix epoch | Reproducible library output; product passes explicit times where needed | Pass `ingestedAt` |

## Controlled fixture truth and fixture-only inferences

Fixtures A–E are non-proprietary test inputs, not themselves regional/project
defaults. Some values intentionally coincide with the separately versioned
Tier-1 template above, but fixture facts are not its source. Their facts are
marked reviewed and point to a fixture source reference. They must never be
copied into a user project without preserving that provenance.

### Common fixture inputs

| Fixture identifier | Value/method | Scope and impact | Override |
| --- | --- | --- | --- |
| `fixtures:FIXTURE_DATE` | `2026-01-15T00:00:00.000Z` | Deterministic timestamps only | Rebuild fixture with another explicit timestamp |
| `fixtures:HEIGHT_M` | `3 m` | Storey height, space volume, exterior-wall area | Fixture configuration/code |
| `fixtures:location` | Seoul (`37.5665`, `126.978`), `KR-Seoul-TMY`, north `0°`, slab on grade | Static regional climate and geometry orientation metadata | Fixture configuration |
| `fixtures:construction-wall` | U `0.35 W/m²K` | Wall transmission | Fixture construction fact/scenario |
| `fixtures:construction-roof` | U `0.20 W/m²K` | Roof transmission | Fixture construction fact/scenario |
| `fixtures:construction-ground` | U `0.40 W/m²K` | Ground transmission | Fixture construction fact/scenario |
| `fixtures:construction-window` | U `1.60 W/m²K`, SHGC `0.35`, VT `0.60` | Glazing U/SHGC consumed; VT retained only | Fixture construction fact/scenario where supported |
| `fixtures:opaque-layer` | 0.10 m, conductivity 0.035 W/mK, density 30 kg/m³, heat capacity 1400 J/kgK | Retained layer evidence; current adapter uses assembly U only | Fixture configuration |
| `fixtures:infiltration` | `0.5 ACH` natural/design | Air-exchange loss | Fixture fact/scenario |
| `fixtures:usage-office` | occupancy `0.1 people/m²`, LPD `8 W/m²`, equipment `10 W/m²`, ventilation `10 L/s-person`, setpoints `20/26 °C`, Mon–Fri 08:00–18:00 | Heating setpoint consumed; other density/schedule fields retained or ratio-estimated | Fixture fact; unsupported fields do not create simulated deltas |
| `fixtures:occupied-schedule` | hours 08–17 value `1`, otherwise `0.05` | Retained; not consumed by degree-day engine | Fixture fact |
| `fixtures:hvac-main` | heat pump; capacity 150 kW; heating COP 3.2; cooling COP 3.5; HR 0.7; ventilation 1,000 L/s; control 07:00–19:00 | Efficiencies/flow/recovery consumed; capacity/control retained | Fixture facts/scenarios where supported |

### Fixture geometry rules

| Identifier | Method | Scope and impact | Override |
| --- | --- | --- | --- |
| `fixtures:space-volume` | floor area × `HEIGHT_M`, except explicitly supplied atrium volume | Zone validation and mapping; engine uses representative volume | Fixture config can provide `volumeM3` |
| `fixtures:wall-area` | oriented boundary-edge length × `HEIGHT_M` | Wall-U weighting and expected surface truth | Fixture boundary/height |
| `fixtures:wall-azimuth` | deterministic outward azimuth from polygon winding | Geometry truth only; current engine ignores orientation | Fixture boundary |
| `fixtures:adjacency` | shared collinear boundary detection | Topology truth | Fixture space polygons |
| `fixtures:zoning` | common deterministic zoning rule with fixture use/orientation/schedule/HVAC keys | Produces expected zone counts and area shares | Fixture config or merge/split functions |

Fixture geometry truth is:

- **A:** 10 m × 8 m, one conditioned office, one 2.0 m × 1.5 m
  window (`3.0 m²`).
- **B:** 30 m × 20 m, south/north/west/east perimeter and core office zones.
- **C:** concave 20 m × 20 m L-shape with 300 m² net plan area.
- **D:** three 20 m × 20 m storeys, upper-floor voids, a vertically spanning
  atrium, conditioned offices plus unconditioned cores, and one 1.8 m × 1.5 m
  window (`2.7 m²`) hosted on the ground-storey exterior wall.
- **E:** 20 m × 10 m with 150 m² conditioned office and 50 m² unconditioned
  parking.

The `simulationExpectations` strings stored with fixtures describe acceptance
intent. The current adapter tests execute deterministic reruns, wall-U, cooling-
COP, and opening-area directional behavior. Expectations involving LPD,
operating hours, and orientation are retained requirements but are not claimed
as passing physics in this degree-day adapter.

## Representative-office overlay values

The example drawing set supplies these explicit signals: three repeated
storeys, north orientation 0 deg, 3.0 m floor height, east-elevation window
width 1.5 m and sill 0.9 m, schedule window width 1.8 m, window U 1.6, SHGC
0.35, wall U 0.32, heat-pump capacity 120 kW, HP01 service scope for levels
01-03, cooling COP 3.6, and LPD 8 W/m². The two window widths create a visible
conflict and the schedule wins by source priority until the user confirms a
candidate.

The representative model contains only the seven registered documents. Its
three plates, storeys, full-floor spaces/zones, exterior surfaces, roof, and
ground slab are deterministic derivatives of the calibrated 20 m × 20 m DXF
boundary, repeated-storey annotation, north-arrow fact, and section height. W01
is hosted on the level-one east-facing wall, and its sill is explicitly
dimensioned at 0.9 m on the east elevation. HP01's three-zone mapping derives
from its explicit levels 01-03 service scope plus the extracted storey count.
Fields absent from
the sources carry `assumption.reference-office-design-defaults`; infiltration
stays missing and blocking until the separate 0.5 ACH assumption is applied.

## Viewer-only display fallbacks

Viewer bridge defaults are not energy assumptions and never enter the canonical
facts or simulation payload. Warnings are returned when a fallback hides missing
geometry.

| Viewer identifier | Trigger/value | User impact | Override |
| --- | --- | --- | --- |
| `viewer-bridge:missing-storey-geometry` | display elevation `index×3 m`, height `3 m` | Keeps the scene inspectable while simulation remains blocked | Supply valid storey facts |
| `viewer-bridge:missing-floor-plate` | display-only 20 m × 15 m rectangle | Scene placeholder with warning; no engine input | Supply a valid floor plate |
| `viewer-bridge:representative-plate` | repeats lowest valid plate when upper plates differ | Existing procedural shell is approximate; canonical zone overlay retains spaces | Use canonical review/source view; future multi-plate viewer adapter |
| `viewer-bridge:room-bounds` | room element width/depth from polygon bounding box; invalid boundary omitted | Energy overlay is selectable but not an exact solid for concave rooms | Supply valid boundary / future polygon room renderer |
| `viewer-bridge:window-display` | average valid opening width/height; WWR is opening area / exterior wall area, max 0.85; explicit zero openings displays zero glazing | Does not fabricate windows for a verified zero; glazing with no valid wall area is hidden with a warning | Correct opening/wall topology |
| `viewer-bridge:procedural-metadata` | visual shell uses office code `14000`, structure code `11`, 2020+ era, flat roof, and fixed facade/slab/column/PBR settings | Display styling and legacy title metadata only | Future viewer adapter maps richer canonical display data |

## Review discipline

When adding a default or inference:

1. Give it a stable ID or a named code/path identifier.
2. State its trigger and exact value/method.
3. Add source fact IDs and affected engine paths when it enters a run.
4. Mark whether it is canonical, engine, fixture-only, or display-only.
5. Provide a reversible override.
6. Add a test proving it cannot masquerade as verified drawing evidence.
7. Update this catalog and the input source map in the same change.
