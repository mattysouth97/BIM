# Energy input source map

## How to read this map

This is the authoritative map for adapter version `1.0.0` and the
`bimfit-degree-day@existing-2026.08` engine boundary. “Consumed” means changing
the compiled value can change a real engine calculation or a canonical result
derived from it. “Mapping-only” means the value is validated/carried for
traceability or spatial attribution but does not change whole-building physics.

No fallback in this table is silent. A project-template value is allowed only
when it is an `EnergyFact` with a named `assumptionId`; a regional/engine value
must appear in `payload.approximations`.

## Narrow Tier-1 auto-model contract

`tier-one-model.ts` provides one deliberately narrow production path under
`assumption.tier1-office-screening-template` (assumption key
`tier1.office-screening-template.v1`). Its exact compatibility values are:

| Contract | Exact value |
| --- | --- |
| Template version | `tier1-office-screening-v1` |
| Unaccepted model version | `tier1-office-screening-v1-unaccepted` |
| Accepted model version | `tier1-office-screening-v1-accepted` |
| Acceptance key | `simulation.tier1OfficeScreeningTemplateAccepted` |

Eligibility requires exactly one accepted, confidently classified and
calibrated floor-plan document, exactly one valid metre-coordinate boundary,
and a positive `m2` area that agrees with polygon area within `1%`. Automatic
classification requires confidence at least `0.72` and a margin of at least
`0.15` over the strongest alternative; user assignment is also accepted. A
rejected or additional source, ambiguous classification/boundary, unscaled or
assumed-scale document, any conflict not explicitly `user_resolved`, blocking
unsupported/missing input, invalid polygon, or area mismatch over `1%` returns
`extraction_only`. Missing north orientation alone is retained as non-blocking
and uses a visible `0 deg` assumption.

The floor-plate boundary and recorded area are reused unchanged as source-backed
facts. A finite source-backed north fact is also retained when available. The
one-storey topology, `3 m` height, area-derived volume and surfaces, aggregate
glazing, envelope, office use, HVAC, and Seoul climate all depend on the named
template. A derived fact can therefore carry both source references and the
assumption ID; that is not equivalent to measured geometry beyond the source
polygon and area. The builder consumes the boundary/area and optional north
fact; other detailed extracted envelope, use, system, or weather facts are not
blended into this auto-model and instead require the normal reviewed-model
workflow.

The v1 template assumes one conditioned office storey at elevation `0 m` in
`Seoul, KR` (`37.5665`, `126.978`, `KR-Seoul-TMY`, slab on grade); wall/roof/
ground U-values `0.35/0.20/0.40 W/m2K`; `30%` WWR with one aggregate window per
exterior wall, window U `1.60 W/m2K`, SHGC `0.35`, visible transmittance `0.60`,
height `1.5 m`, sill `0.9 m`, and infiltration `0.5 ACH`. Office inputs are
occupancy `0.1 people/m2`, lighting `8 W/m2`, equipment `10 W/m2`, ventilation
`10 L/s-person`, setpoints `20/26 degC`, and Mon-Fri `08:00-18:00`. HVAC is a
packaged electric heat-pump/DX system with `0.15 kW/m2`, heating COP `3.2`,
cooling COP `3.5`, scheduled outdoor air, and heat recovery `0.70`. Occupancy,
lighting, and equipment schedules are `1` for hours 08-17 and `0.05` otherwise;
HVAC control is `1` for hours 07-18 and `0` otherwise. Each opaque construction
also carries one screening layer: `0.10 m`, `0.035 W/mK`, `30 kg/m3`, and
`1400 J/kgK`; assembly R-value is `1/U`.
At compilation, `KR-Seoul-TMY` resolves visibly through the regional assumptions
to HDD `2700 K-day` (base `18 degC`), CDD `220 K-day` (base `24 degC`), winter
design `-11.3 degC`, summer design `33.6 degC`, and cooling-season solar
`350 kWh/m2`.

The model remains blocked until the user explicitly reviews and accepts that
exact version. Acceptance removes only the acceptance gate and marks the named
assumption facts plus the selected floor-plate boundary and area facts reviewed;
it does not change their fact status or make assumed inputs extracted, measured,
or verified. Every accepted run remains assumption-heavy, uses a visible
regional climate approximation, and must be presented as screening output—not
measured performance or a code, regulatory, certification, or compliance
prediction.

## Geometry and model identity

| Canonical input | Preferred drawing source | Fallback source | Allowed assumption | Unit and validation | Engine mapping and effect |
| --- | --- | --- | --- | --- | --- |
| `geometry.floorPlates[].boundary` and selected plate voids | Dimensioned floor-plan vector boundary | Reviewed BIMFIT schematic/model geometry | No polygon default: Tier-1 requires and reuses exactly one calibrated source boundary | metres; valid ring, non-zero area, no self-intersection | Lowest valid plate becomes `recipe.footprintPolygon`; outer/void ring area and perimeter drive plan, roof, ground, wall, and volume quantities |
| `geometry.floorPlates[].areaSqm` | Dimensioned floor plan | Area derived from a calibrated closed vector polygon | Named rule inference is allowed; Tier-1 requires the recorded and polygon areas to agree within `1%` and reuses the recorded fact | `m2`, `m²`, or `sqm`; finite positive | Preflight and viewer metadata; the engine recomputes representative plan area from the polygon rather than using this fact directly |
| `geometry.storeys[].elevationM` | Section/level dimension | Reviewed BIM level | Tier-1 visibly assumes one storey at `0 m`; other model paths require a sourced, user-confirmed, or named-assumption fact | metres; finite | Sorts levels, marks above/below grade, and contributes to `recipe.totalHeight` through storey tops |
| `geometry.storeys[].floorToFloorHeightM` | Section dimension | Reviewed floor-stack value | Tier-1 visibly assumes `3 m`; other model paths require a sourced, user-confirmed, or named-assumption fact | metres; finite positive | Becomes each `FloorSpec.height`; maximum level top minus minimum elevation drives gross wall area and engine volume |
| `geometry.thermalZones[].conditioned` | Space/room conditioning annotation and HVAC service area | User confirmation | Tier-1 assumes one conditioned office zone; deterministic zoning may otherwise carry the source-space status | Boolean; at least one conditioned zone | Selects the zones included in conditioned floor area and spatial results |
| `geometry.thermalZones[].floorAreaSqm` | Reviewed source-space boundaries | Sum of sourced space areas | Tier-1 copies its sourced plate area into an assumption-linked derived zone fact; rule-derived sums are otherwise allowed | `m2`/`m²`/`sqm`; finite positive | Sum becomes `recipe.officialFloorAreaSqm`, EUI denominator, HVAC weighting, and zone-result area share |
| `geometry.thermalZones[].volumeM3` | Reviewed space area × sourced clear/floor height | Source-linked deterministic volume | Tier-1 derives source area × assumed `3 m`; rule inference is otherwise allowed | `m3` or `m³`; finite positive | Mapping/preflight only; the legacy engine derives whole-building volume from representative footprint × total height |
| `building.useType` | Room/use schedule or project brief | User-confirmed building use | Tier-1 assumes `office`; otherwise unknown use maps visibly to the engine's mixed-use ratio profile | String with traceable origin | Deterministic map to `recipe.mainPurpsCd`; selects non-HVAC end-use ratios |
| `building.name` | Title block/project metadata | User input | None needed for physics | Non-empty string with traceable origin | Stored in recipe/log context; no numerical effect |
| `site.location` | Site plan/title block | Project location | Tier-1 assumes `Seoul, KR` with `KR-Seoul-TMY`; otherwise regional lookup applies only when a supported Korean region token is present | String with traceable origin | Together with `weatherSource`, selects a static regional climate when explicit climate facts are absent; also stored as recipe address |

## Envelope and openings

| Canonical input | Preferred drawing source | Fallback source | Allowed assumption | Unit and validation | Engine mapping and effect |
| --- | --- | --- | --- | --- | --- |
| `surfaces[].boundaryCondition` and `type` | Floor/section topology | User-reviewed adjacency/classification | Tier-1 derives exterior walls plus one ground floor and roof from its one sourced boundary under the named assumption; no general repair/default | Valid host space; exterior wall/roof/ground boundaries required | Selects exterior walls, roofs, ground floors, and spatial-result categories |
| Exterior-wall `surfaces[].areaSqm` | Dimensioned wall/elevation geometry | Rule-derived edge length × reviewed height | Tier-1 derives source edge length × assumed `3 m`; named deterministic inference is otherwise allowed | `m2`; finite positive | Weights whole-building wall U-value and supplies the denominator for average WWR; the engine's actual gross wall area comes from representative footprint × total height |
| Wall `surfaces[].constructionId` and construction `uValueWPerM2K` | Wall detail/construction or material schedule | User-confirmed assembly | Tier-1 assumes `0.35 W/m2K`; other paths require a sourced, user-confirmed, or visible named-assumption assembly | `W/m2K`, `W/m²K`, `W/(m2·K)`, or `W/(m²·K)`; finite positive and existing construction ID | Exterior-surface-area-weighted value becomes all four engine wall orientations' U-value |
| Roof surface area/construction/U-value | Roof plan/detail and assembly schedule | User-confirmed assembly | Tier-1 assumes U `0.20 W/m2K`; other paths require a sourced, user-confirmed, or visible named-assumption assembly | same U-value units; finite positive | Roof-surface-area-weighted U-value; representative footprint supplies actual roof area |
| Ground-floor surface area/construction/U-value | Section/slab detail and assembly schedule | User-confirmed assembly | Tier-1 assumes U `0.40 W/m2K`; other paths require a sourced, user-confirmed, or visible named-assumption assembly | same U-value units; finite positive | Ground-surface-area-weighted U-value; representative footprint supplies actual ground area |
| Glazed `openings[].areaSqm` | Elevation geometry reconciled with window schedule | Width × height from reviewed sources | Tier-1 assumes one aggregate window per exterior wall at `30%` WWR; user-confirmed scenario delta is supported | `m2`; positive and no larger than host wall | Sums total glazing area, weights U/SHGC, forms average WWR, and weights opening-level result attribution |
| `openings[].sillHeightM` | Dimensioned elevation, section, or window detail | User-confirmed spatial placement | Tier-1 assumes `0.9 m`; representative W01 uses its explicit elevation sill dimension | metres; retained as a placement fact and not a current physics gate | Spatial-model placement only; the current degree-day engine does not consume sill height, so it has no numerical energy effect |
| `openings[].hostSurfaceId` and opening type | Elevation/plan topology | User review | Tier-1 creates one assumed aggregate `window` hosted by every derived exterior wall; no general host repair applies | Host must exist and be exterior; construction must exist | Ensures glazing participates in the correct exterior mapping; doors are not a separate engine term |
| Opening `constructionId` and window `uValueWPerM2K` | Window schedule/specification | User-confirmed window type | Tier-1 assumes U `1.60 W/m2K`; other paths require a sourced, user-confirmed, or named-assumption construction | U-value units above; finite positive | Opening-area-weighted whole-building glazing U-value |
| Window construction `shgc` | Window/glazing schedule | User-confirmed product value | Tier-1 assumes `0.35`; other paths require a sourced, user-confirmed, or named-assumption value | Dimensionless; compiler requires a finite non-negative value | Opening-area-weighted SHGC drives cooling-season solar gains |
| Total glazing area ÷ gross canonical wall area | Elevation plus plan/section | Derived from canonical opening and wall areas | Tier-1 opening areas implement its explicit `0.30` WWR; the adapter transformation is deterministic | Ratio clamped to at most `0.95` | Same average WWR is assigned to N/S/E/W; orientation-specific WWR is not supported |
| `envelope.infiltrationAirChangesPerHour` | Airtightness specification or test-derived design assumption | User input | Tier-1 assumes `0.5 ACH`; the separate `assumption.reference-office-natural-infiltration` supplies the same value only when explicitly accepted in the representative workflow | `ACH`, `1/h`, `h-1`, or `h⁻¹`; finite non-negative | Multiplied by 20 into legacy `ach50`; engine divides by 20, recovering canonical natural/design ACH |
| `materials.envelope.foundation.groundTemperature` | Future measured/site ground-temperature field | None in the current canonical schema | `engine-assumption:ground-temperature` emits the fixed legacy-engine `13.5 °C` value on every run | °C; runtime approximation, not a canonical fact | Consumed by ground-floor design and annual heat loss; payload provenance links weather source, location, and ground relationship as trigger context |
| `materials.envelope.walls[].thermalBridge` | Future numeric junction-loss schedule/calculation | Canonical thermal-bridge notes provide context only | `engine-assumption:thermal-bridge-zero` emits a zero additive U-value surcharge on every run | `W/m2K`; runtime approximation, not a canonical numeric fact | Added to average wall U in design and annual wall transmission; zero can understate junction losses |

## Weather and setpoints

| Canonical input | Preferred drawing/source | Fallback source | Allowed assumption | Unit and validation | Engine mapping and effect |
| --- | --- | --- | --- | --- | --- |
| `site.climate.hdd` | Explicit approved weather dataset summary | Supported Korean regional lookup | `engine-assumption:regional-climate` | K·day; finite non-negative | `climate.hdd`; annual air-coupled heating energy |
| `site.climate.cdd` | Explicit approved weather dataset summary | Supported Korean regional lookup | `engine-assumption:regional-climate` | K·day; finite non-negative | `climate.cdd`; annual conduction/ventilation cooling energy |
| `site.climate.winterDesignTemperatureC` | Explicit design-weather source | Supported Korean regional lookup | `engine-assumption:regional-climate` | °C; finite | `climate.winterDesignTemp`; winter design heat loss |
| `site.climate.coolingSeasonSolarKwhPerM2` | Explicit weather/solar source | Static regional value (currently 350) | `engine-assumption:cooling-solar` | `kWh/m2-season`; finite non-negative | `climate.coolingSeasonSolar`; glazing solar gain |
| `site.weatherSource` | Explicit weather file/source ID | Supported Korean region in weather source/location text | Tier-1 assumes `KR-Seoul-TMY`; its resulting regional HDD/CDD/design-temperature/solar approximations remain visible | String; must resolve or the four explicit climate facts above must be present | Provenance selector for regional HDD/CDD/design temperature/solar values |
| `usageProfiles[].heatingSetpointC` | Controls sequence or operating criteria | User-confirmed usage profile | Tier-1 assumes `20 degC`; other paths require a sourced, user-confirmed, or named-assumption value | `C`, `°C`, or `degC`; finite positive | Conditioned-zone-area-weighted `climate.indoorTemp`; affects design heat loss and ground annual heat loss |

`site.climate.summerDesignTemperatureC` and
`usageProfiles[].coolingSetpointC` are currently required/compiled for a complete
climate contract, but the existing heat-loss/annual-demand functions do not use
them in a numerical equation. They are listed under retained inputs below rather
than represented as result-driving values. Tier-1 visibly assumes `26 degC` for
the retained cooling setpoint and Seoul's regional `33.6 degC` summer design
value.

## HVAC and ventilation

| Canonical input | Preferred drawing source | Fallback source | Allowed assumption | Unit and validation | Engine mapping and effect |
| --- | --- | --- | --- | --- | --- |
| `systems.hvac[].servedZoneIds` | HVAC zoning plan/system diagram, or an explicit equipment-schedule service scope such as levels served | User-reviewed zone assignment | Tier-1 assumes its one HVAC system serves its one conditioned zone; otherwise use a user-confirmed service mapping | Stable zone IDs; every conditioned zone must be served and orphan/unconditioned references block | Determines system weight by served conditioned floor area |
| `heatingEfficiency` | Equipment schedule/specification | User-confirmed early-design system | Tier-1 assumes heating COP `3.2`; other paths require a sourced, user-confirmed, or named-assumption value | COP/fraction/percent accepted by engine normalization; compiler requires finite positive | Served-area-weighted `materials.hvac.heating.efficiency`; engine normalizes values over 10 as percent and clamps to 0.3–6 |
| `heatingSource` | Equipment schedule/system diagram | User-confirmed source | Tier-1 assumes `electric_heat_pump`; otherwise unknown text deterministically maps to gas | String with traceable origin | Primary system (largest served area) maps to heat-pump, district heat, electric, oil, or gas fuel; affects the raw engine fuel split, not total annual demand |
| `coolingSource` | Equipment schedule/system diagram | User-confirmed source | Tier-1 assumes `electric_dx`; otherwise explicit `none` means no cooling | String; traceable | Filters active cooling systems; if all are `none`, engine cooling efficiency is zero and cooling site demand is zero |
| `coolingCop` | Equipment schedule/specification | User-confirmed early-design system | Tier-1 assumes COP `3.5`; other paths require a sourced, user-confirmed, or named-assumption value | `COP`, `ratio`, `-`, or absent unit; finite positive for active cooling | Served-area-weighted cooling efficiency; engine normalizes and enforces a minimum effective COP of 1 when positive |
| `ventilationLps` | Air-system schedule/ventilation calculation | User-confirmed system flow | Tier-1 derives flow as floor area × `0.1 people/m2` × `10 L/s-person`; elsewhere a named assumption is allowed and zero is permitted | canonical `L/s`; compiler requires finite non-negative | Sum of systems ×3.6 becomes `m3/h`; the engine converts volume flow to ACH using engine-derived volume |
| `heatRecoveryEfficiency` | AHU/equipment schedule or controls sequence | User-confirmed value | Tier-1 assumes `0.70`; otherwise zero is permitted | Fraction or percent; compiler requires finite non-negative | Ventilation-flow-weighted value; engine converts percent when over 1 and clamps recovery to 0–0.95 |

HVAC `capacityKw` is copied to the legacy material payload for the primary system,
but the current heat-loss, annual-demand, and system-breakdown functions do not
read capacity. Tier-1 derives it as floor area × `0.15 kW/m2`; it still cannot
constrain or size the calculated load.

## Output attribution inputs

| Input | Preferred source | Fallback/assumption | Validation | Result mapping |
| --- | --- | --- | --- | --- |
| Conditioned zone area and IDs | Reviewed zoning | Deterministic zoning from sourced spaces | Positive area/volume; stable spaces | Whole-building heating, cooling, and total are apportioned by conditioned area and labelled `area_apportioned_approximation` |
| Surface type, boundary, area, and U-value | Reviewed envelope topology/assembly | None beyond named facts above | Existing surface/construction | Whole-building wall/roof/ground design heat-loss categories are apportioned by `U×A` |
| Glazed opening type, area, and U-value | Elevation/window schedule | None beyond named facts above | Exterior host and construction | Whole-building window design heat loss is apportioned by `U×A`; doors are `not_applicable` |
| `CanonicalObjectMapping.threeObjectIds` / direct `threeObjectId` | Existing BIM element IDs or viewer bridge | Authored stable `energy-room:<space-id>` IDs for display elements | JSON strings; no `THREE.Object3D` instances | Carries the result to existing scene objects; it never changes the calculation |

## Use-type ratio attribution

The real degree-day HVAC total is expanded into reported whole-building end uses
by `calculateSystemBreakdown`. These are fixed ratio estimates, not schedule
simulation:

| `mainPurpsCd` prefix | Use | HVAC | Lighting | DHW | Plug/equipment |
| --- | --- | ---: | ---: | ---: | ---: |
| `01` | Single-family residential | 50% | 7% | 25% | 18% |
| `02` | Multi-family residential | 50% | 7% | 25% | 18% |
| `07` | Retail | 45% | 40% | 3% | 12% |
| `14` | Office | 55% | 25% | 10% | 10% |
| other / `00000` | Mixed-use fallback | 42% | 28% | 12% | 18% |

The ratio is selected by `building.useType` through `mainPurposeCode`. Extracted
lighting, equipment, occupancy, and schedule facts do not alter these ratios.

## Retained, validated, mapped, or displayed—but not simulated

The canonical schema deliberately retains the following inputs for evidence,
review, later adapters, or 3D display. The current degree-day result must not be
described as responding to them:

| Retained input | Current behavior |
| --- | --- |
| Latitude/longitude, north orientation, surface azimuth | Retained and useful for evidence/viewer; no orientation-sensitive engine calculation |
| Different upper-storey footprints, exact space polygons, atria/void topology | Retained; engine uses the lowest valid representative floor plate and one repeated footprint |
| Zone volume and exact zone boundaries | Required for topology/mapping; whole-building engine volume comes from representative footprint × total height |
| Interior partitions/floors/ceilings and detailed adjacency | Validated/retained; not separate heat-loss terms |
| Doors | Host/construction retained; no separate engine heat-loss term |
| Shading devices and external obstructions | Retained; no adapter mapping; engine uses a fixed 0.7 solar shading/frame factor |
| Material layers, R-value, density, heat capacity, visible transmittance | Retained; adapter uses only assembly U-value and glazing SHGC |
| Air-tightness and thermal-bridge notes | Evidence/context only; the numeric zero wall surcharge is separately disclosed by `engine-assumption:thermal-bridge-zero` |
| Cooling setpoint and summer design temperature | Validated/compiled, but not read in the current annual cooling equation |
| Occupancy density and lighting power density | Copied into `MaterialProperties`, then ignored by current engine functions; Tier-1 additionally uses occupancy density upstream to derive its consumed ventilation flow |
| Occupancy, lighting, equipment, holiday, and operating schedules | Retained; not compiled into a schedule simulation |
| Equipment power density and ventilation per person | Not read directly by the engine; Tier-1 uses ventilation per person upstream with occupancy and floor area to derive consumed system `ventilationLps`, while equipment density remains retained only |
| HVAC name/type, distribution, capacity, outdoor-air strategy, control schedule | Retained; capacity is copied but not used, other fields are not mapped to physics |
| DHW system efficiency/demand/schedule | Retained; reported DHW uses the use-type ratio |
| PV, solar thermal, storage, and other renewables | Retained; adapter disables legacy renewable placeholders and produces no renewable offset |
| Tariff and emissions factors | No implemented adapter facts; cost/carbon stay absent |
| Monthly/time-series, cooling peak, zone peaks, fans/pumps | Unsupported outputs stay empty or null; building peak heating is design heat loss only |

## Scenario paths that are actually enabled

Only these dot-path patterns pass `isSupportedSimulationDeltaPath`:

```text
envelope.constructions.<index>.uValueWPerM2K
envelope.constructions.<index>.shgc
envelope.infiltrationAirChangesPerHour
systems.hvac.<index>.heatingEfficiency
systems.hvac.<index>.coolingCop
systems.hvac.<index>.heatRecoveryEfficiency
systems.hvac.<index>.ventilationLps
geometry.openings.<index>.areaSqm
```

Scenario replacements are user-confirmed facts with no drawing source and are
stored only in the scenario delta. Unsupported paths throw before compilation.
