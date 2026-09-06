/** TalTech Mäemaja, Zenodo 15782433. Geometry and typed IFC properties are
 * source statements; conditioning, climate and operation remain assumptions.
 * Source-physics.json retains the property/type references and alternatives.
 */
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import type { MaterialProperties } from "@/lib/material-types";
import { getRecipe } from "@/lib/procedural/recipe";
import { slabOnGroundUValue, GROUND_RSI, GROUND_RSE } from "@/lib/energy-standards/ground-coupling";

const CARDINALS = ["N", "E", "S", "W"] as const;
const WALL = Object.freeze({ N: 616.86, E: 467.15, S: 421.73, W: 434.21 });
const GLAZING = Object.freeze({ N: 88.69, E: 79.41, S: 71.57, W: 308.85 });
const DOORS = Object.freeze({ N: 6.4, E: 41.36, S: 3.89, W: 6.7 });
export const TALTECH_TOTAL_FLOOR_AREA_SQM = 3486.12;
export const TALTECH_MEASURED_ENVELOPE = Object.freeze({
  exteriorWallNetSqm: 1939.94, exteriorWallByOrientationSqm: WALL,
  glazingApertureSqm: 548.52, glazingByOrientationSqm: GLAZING,
  exteriorDoorSqm: 58.34, exteriorDoorByOrientationSqm: DOORS,
  grossWallSqm: 1939.94 + 548.52 + 58.34,
  groundSlabSqm: 1173.44, groundPerimeterM: 524.97,
  roofAreaSqm: 1369.11, roofProjectedSqm: 1360.74,
  conditionedVolumeGrossM3: 17503.65, roomVolumeNetM3: 15841.48,
  northAssumed: true,
});
export const TALTECH_GROSS_BY_ORIENTATION = Object.freeze(Object.fromEntries(
  CARDINALS.map((s) => [s, WALL[s] + GLAZING[s] + DOORS[s]]),
) as Record<(typeof CARDINALS)[number], number>);

// Area-weighted typed ThermalTransmittance. SI units explicitly confirmed in
// IfcUnitAssignment: kg s^-3 K^-1 = W/(m² K), source #158274.
export const TALTECH_STATED_THERMAL = Object.freeze({
  wallAreaSqm: 1939.9379238014037, wallUaWPerK: 257.3443629814021,
  wallUValue: 257.3443629814021 / 1939.9379238014037,
  roofAreaSqm: 1369.11, roofUaWPerK: 137.98805365280901,
  roofUValue: 137.98805365280901 / 1369.11,
  windowAreaSqm: 518.285, windowUValue: 0.66,
  curtainWallAreaSqm: 30.234, curtainWallUValueAssumed: 1.4,
  groundElementSumSqm: 1173.45, groundUaAirToAirWPerK: 188.17565,
  groundAirToAirUValue: 188.17565 / 1173.45,
  doorUValue: 1,
});
export const TALTECH_EXISTING_PV = Object.freeze({
  sourceArrayOccurrences: 48, statedModuleCount: 192, ratedCapacityKw: 63.36,
  statedTypeInclinationDeg: 15,
  capacityProperty: "Other.RatedElectricPowerOutput", moduleCountProperty: "Data.Total Number of Modules",
  sourceFile: "source-physics.json",
});
export const TALTECH_GROUND_FLOOR = slabOnGroundUValue({
  areaSqm: 1173.44, exposedPerimeterM: 524.97, wallThicknessM: 0.4,
  floorResistanceM2KPerW: 1 / TALTECH_STATED_THERMAL.groundAirToAirUValue - GROUND_RSI - GROUND_RSE,
});
const wwr = 548.52 / TALTECH_MEASURED_ENVELOPE.grossWallSqm;
const floors: FloorSpec[] = [
  { floorNo: -1, label: "B1 · +Kelder", type: "below", y: -3.5, height: 3.5, isGroundFloor: false, useCode: "14000" },
  { floorNo: 1, label: "1. korrus", type: "above", y: 0, height: 4.9, isGroundFloor: true, useCode: "14000" },
  { floorNo: 2, label: "2. korrus", type: "above", y: 4.9, height: 4.9, isGroundFloor: false, useCode: "14000" },
  { floorNo: 3, label: "3. korrus", type: "above", y: 9.8, height: 4.71, isGroundFloor: false, useCode: "14000" },
];
const side = Math.sqrt(1173.44);
export const TALTECH_RECIPE: BuildingRecipe = {
  ...getRecipe("21", "2010-2019", "14000", false),
  buildingName: "TalTech Mäemaja", address: "Tallinn, Estonia (source publication)",
  mainPurpsCd: "14000", strctCd: "21", era: "2010-2019", floors,
  totalHeight: 14.51, wallThickness: 0.4,
  footprintWidth: side, footprintDepth: side, siteWidth: side, siteDepth: side,
  officialFloorAreaSqm: TALTECH_TOTAL_FLOOR_AREA_SQM,
  measuredEnvelope: {
    planAreaSqm: 1173.44, wallLengthM: 524.97,
    grossWallAreaSqm: TALTECH_MEASURED_ENVELOPE.grossWallSqm,
    roofAreaSqm: 1369.11, volumeM3: 17503.65, derivedFloorAreaSqm: TALTECH_TOTAL_FLOOR_AREA_SQM,
    basis: "IFC: 115 stated space areas and net volumes; 40 physical/external-boundary walls, using NetSideArea or Dimensions.Area; 548.52 m² counted glazing and 58.34 m² counted doors with unresolved opening coverage; 1,173.44 m² selected basement slab union; 1,369.11 m² sky-visible roof surface after overlap removal and the source-cited KL-04 winding correction. All rooms are assumed conditioned. The model is not calibrated to the separately published meter archive.",
  },
};
const wallU = TALTECH_STATED_THERMAL.wallUValue;
const windowU = (518.285 * 0.66 + 30.234 * 1.4) / (518.285 + 30.234);
export const TALTECH_MATERIALS: MaterialProperties = {
  source: "ifc-model", confidence: "estimated", codeYear: 2015,
  envelope: {
    walls: CARDINALS.map((orientation) => ({ orientation, surfaceArea: WALL[orientation], uValue: wallU, rValue: 1 / wallU, thermalBridge: 0, layers: [] })),
    roof: { uValue: TALTECH_STATED_THERMAL.roofUValue, layers: [], solarReflectance: 0.3, emissivity: 0.9, greenRoofCoverage: 0 },
    groundFloor: { uValue: TALTECH_GROUND_FLOOR.uValueWPerM2K, layers: [], groundContactResistance: 0 },
    windows: { uValue: windowU, shgc: 0.45, vlt: 0.6, glassType: "triple", coating: "low-e", gasFill: "argon", frameMaterial: "thermal-break-aluminum", airLeakageRate: 2, shadingCoefficient: 0.45 / 0.87, windowToWallRatio: { N: wwr, E: wwr, S: wwr, W: wwr } },
    foundation: { perimeterInsulationUValue: 0, groundTemperature: 13.5, moistureBarrier: "none" },
    airtightness: { ach50: 3, equivalentLeakageArea: 0, testMethod: "estimated" },
  },
  hvac: {
    heating: { systemType: "district", fuelType: "district-heat", efficiency: 1, capacity: 0 },
    cooling: { systemType: "central-chiller", efficiency: 4.03, capacity: 0 },
    ventilation: { type: "heat-recovery", heatRecoveryEfficiency: 0.82, airflowRate: 0.7 },
    dhw: { systemType: "gas-boiler", efficiency: 0.85, storageVolume: 0 },
  },
  lighting: { lightingPowerDensity: 10, lampType: "led", controlType: "daylight-dimming" },
  renewable: {
    solarPV: { installed: true, capacity: 63.36, panelType: "monocrystalline", tiltAngle: 15, orientation: 180, area: 0 },
    solarThermal: { installed: false, collectorArea: 0, efficiency: 0 },
    geothermal: { installed: false, systemType: "closed-loop", cop: 0 },
  },
  occupancy: { occupancyDensity: 0.1, internalHeatGain: 15, hotWaterDemand: 10,
    weekdaySchedule: [0,0,0,0,0,0,0.1,0.3,0.9,1,1,1,0.8,1,1,1,1,0.9,0.5,0.2,0.1,0,0,0],
    weekendSchedule: [0,0,0,0,0,0,0,0,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0,0,0,0,0,0,0] },
};

export const TALTECH_ASSUMPTIONS = Object.freeze([
  { id: "A-CLIMATE", assumes: "Seoul comparison climate, not Tallinn weather.", why: "The source identifies a real Tallinn site. The engine currently has Korean regional climates only; these outputs cannot be presented as observed Estonian demand." },
  { id: "A-ERA-USE", assumes: "2010–2019 cosmetic/default era, 2015 code year, Korean office use 14000 and concrete-family structure 21.", why: "The publication calls this an office/laboratory. The IFC export date is not a verified construction year; these Korean codes and era are mappings." },
  { id: "A-CONDITIONED-SPACES", assumes: "All 115 spaces are conditioned, including 44 basement spaces (1,160.67 m²).", why: "Room quantities do not establish operating schedules or conditioned status. Including unconditioned rooms would understate energy intensity. Gross volume uses floor area × floor-to-floor height; all 115 net volumes are stated quantities, even where tessellation is not closed." },
  { id: "A-STATED-U-PRIMARY", assumes: "Typed standard Pset ThermalTransmittance is the primary thermal statement; weighted wall U 0.132656 and roof U 0.100787 W/m²K, no extra thermal bridges.", why: "The source unit is W/m²K. Some alternate Data.Soojusläbivus text values disagree; source-physics.json retains both. Stated design properties are not field-tested performance. Walls use a whole-building mean on each sector because the engine averages four wall U-values." },
  { id: "A-OPENING-COVERAGE", assumes: "The counted opening subset supplies the current baseline: 548.52 m² glazing and 58.34 m² doors.", why: "Host/space classification excludes other openings and six remain unresolved. 90 of 115 space meshes fail the closed-mesh test, limiting both-sides probes. Unmeasured exterior apertures could increase heat loss; the output can look too efficient. No complete opening survey is claimed." },
  { id: "A-DOORS", assumes: "The engine prices 58.34 m² of doors at the wall U-value, while their source U is 1 W/m²K.", why: "There is no separate door heat-loss element. This understates door heat loss; door area is excluded from wall-insulation sizing." },
  { id: "A-CURTAIN-U", assumes: "30.234 m² curtain-wall aperture U = 1.4 W/m²K; other 518.285 m² window aperture uses stated Uw = 0.66. The weighted combined U is used by the engine.", why: "The included curtain walls have no typed thermal property. Their U is a named stand-in, not copied from a neighboring window." },
  { id: "A-WINDOW-OPTICS", assumes: "SHGC 0.45, VLT 0.60, low-e triple/argon glazing, thermally broken aluminium frame, air leakage 2 and shading coefficient 0.45/0.87.", why: "These descriptive and optical fields are assumptions; a stated Uw does not establish construction, solar transmission or airtightness. The whole-building glazing/gross ratio is repeated on each sector to conserve total aperture in the shared engine." },
  { id: "A-GROUND-BASEMENT", assumes: "Slab-on-ground approximation for the basement, with source air-to-air U converted to construction R by removing 0.17 + 0.04 m²K/W surface resistances; generic soil λ 2 W/mK and 0.4 m edge-wall thickness.", why: "The engine lacks a basement-specific model. Source U 0.160361 is not directly a soil-facing U. The 524.97 m union boundary includes slab fragmentation/gaps and is used as an exposed-perimeter surrogate, potentially overstating ground loss. Basement walls are also priced against outdoor air. Soil, ground temperature 13.5°C and moisture/perimeter insulation fields are assumptions." },
  { id: "A-ROOF-STACK", assumes: "One sky-visible surface per roof location: 1,369.11 m², not the raw 1,581.14 m² element/layer sum; reflectance 0.3, emissivity 0.9.", why: "Stacked roof layers would double-count heat-transfer area. The selected surface rows are weighted by their source typed U. KL-04's source winding is reversed for top-surface selection using recorded source ray evidence. Upstands and hidden faces are not independently resolved thermal zones." },
  { id: "A-HVAC", assumes: "Map source District Heating_Radiators to district heat and interpret Data.efficiency text 1 as efficiency; use the chiller's Other.efficiency text 4.03 as representative COP and heat_recovery_efficiency text 0.82 as recovery. Ventilation 0.7 ACH remains assumed; capacities unavailable.", why: "Source properties #463229, #433198 and #497566 are retained in source-physics.json. These are author-stated text values interpreted as operating ratios, not measured seasonal performance; the chiller value is not established for every plant occurrence. Korean district-heat emissions factors and Seoul weather are comparison assumptions. Outputs are not calibrated to the separately published measurements." },
  { id: "A-DHW-MAPPING", assumes: "Gas-boiler DHW at efficiency 0.85 is a legacy comparison stand-in.", why: "The source explicitly names District Heating DHW and states text efficiency 1 (#498112). The shared DHW input type has no district-heat option; it cannot represent that system faithfully. The source statement is retained separately, and the stand-in must not be read as installed gas equipment." },
  { id: "A-OPERATION", assumes: "10 W/m² LED with daylight dimming; 0.1 persons/m², 15 W/m² gains, 10 L/person/day DHW, weekday office schedule; airtightness 3 ACH50 (engine divides by 20).", why: "One office schedule is applied to office and laboratory space. Lighting controls, occupancy and blower-door performance have not been established; unmodeled laboratory processes may increase electricity demand." },
  { id: "A-EXISTING-PV", assumes: "Baseline PV capacity uses the sum of Other.RatedElectricPowerOutput: 63.36 kW over 48 modeled arrays / 192 stated modules. All nine array types state Other.Inclination 15° in source degree units. Monocrystalline technology and representative south-facing orientation are assumed; face area is unavailable.", why: "The separate Data.Total Power Watt Peak field repeats 430.06 W on every occurrence and conflicts with per-array ratings; it is retained but not used. Type inclination is a source design parameter, not a measured world-face angle. Roof exclusions use source-derived conservative array shadow envelopes, regardless of the representative yield orientation. No measured PV yield is claimed, and the grade conversion currently ignores baseline PV." },
  { id: "A-NORTH-FOOTPRINT", assumes: "Project north; square fallback recipe footprint of area 1,173.44 m²; no baseline solar thermal or geothermal.", why: "The rendered IFC geometry supplies the actual shape. No surveyed orientation or complete renewable installation inventory has been established; the fallback square is not measured geometry. Proposed PV winter row spacing uses accepted source site latitude 59.3949928283°, independently of the assumed Seoul energy weather." },
]);

export const TALTECH_PENDING_MEASUREMENTS = Object.freeze([
  { manifestField: "areas.glazingApertureSqm", constant: "TALTECH_MEASURED_ENVELOPE.glazingApertureSqm", placeholderValue: 548.52, unit: "m2" as const, derivedFrom: "Retained measured opening subset, pending completeness reconciliation; not an arbitrary area default.", biasDirection: "May understate glazing where omitted openings are exterior; classification uncertainty prevents a one-direction prediction.", envelopeBias: "unknown" as const },
  { manifestField: "areas.exteriorDoorSqm", constant: "TALTECH_MEASURED_ENVELOPE.exteriorDoorSqm", placeholderValue: 58.34, unit: "m2" as const, derivedFrom: "Retained 10 counted door apertures, pending excluded-door reconciliation.", biasDirection: "May understate aperture where unresolved doors are exterior; classification uncertainty prevents a one-direction prediction.", envelopeBias: "unknown" as const },
]);
