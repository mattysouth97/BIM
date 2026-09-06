/**
 * KIT IAI's fictional office example, AC20-Institute-Var-2.ifc.
 * Geometry is measured; operating conditions and thermal properties below
 * are named assumptions. The source explicitly says "No real site".
 * The paired test reconciles these constants against the shipped artifacts.
 */
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import type { MaterialProperties } from "@/lib/material-types";
import { getRecipe } from "@/lib/procedural/recipe";
import { calculateAssembly, SURFACE_RESISTANCES } from "@/lib/energy-standards/assembly";
import { slabOnGroundUValue } from "@/lib/energy-standards/ground-coupling";
import { genericMaterialById } from "@/lib/energy-standards/materials";
import { AIRTIGHTNESS, GLAZING_TYPE, HVAC_DEFAULTS, LIGHTING_DEFAULTS, OCCUPANCY_DEFAULTS, WINDOW_SHGC, WINDOW_U_VALUES } from "@/lib/korean-building-codes";

const ERA = "2000-2009";
const USE_CODE = "14000";
const CARDINALS = ["N", "E", "S", "W"] as const;
const WALL = Object.freeze({ N: 312.63, E: 162.32, S: 304.36, W: 161.51 });
const GLAZING = Object.freeze({ N: 144, E: 5.85, S: 153.8, W: 5.85 });
const DOORS = Object.freeze({ N: 0, E: 0, S: 4.2, W: 0 });
export const KIT_OFFICE_TOTAL_FLOOR_AREA_SQM = 2266.66;
export const KIT_OFFICE_MEASURED_ENVELOPE = Object.freeze({
  exteriorWallNetSqm: 940.81,
  exteriorWallByOrientationSqm: WALL,
  glazingApertureSqm: 309.5,
  glazingByOrientationSqm: GLAZING,
  exteriorDoorSqm: 4.2,
  exteriorDoorByOrientationSqm: DOORS,
  grossWallSqm: 940.81 + 309.5 + 4.2,
  groundSlabSqm: 516,
  groundPerimeterM: 112,
  // Visible, non-overlapping roof planes, not 793.93 m² summed over the
  // overlapping strips. The same sky-visible surfaces supply PV placement.
  roofAreaSqm: 659.54,
  roofProjectedSqm: 632,
  conditionedVolumeGrossM3: 6227.27,
  roomVolumeNetM3: 5500.66,
  northAssumed: true,
});
export const KIT_OFFICE_GROSS_BY_ORIENTATION = Object.freeze(Object.fromEntries(
  CARDINALS.map((s) => [s, WALL[s] + GLAZING[s] + DOORS[s]]),
) as Record<(typeof CARDINALS)[number], number>);
const wwr = KIT_OFFICE_MEASURED_ENVELOPE.glazingApertureSqm / KIT_OFFICE_MEASURED_ENVELOPE.grossWallSqm;

// The library has no calcium-silicate masonry entry. Concrete brick is an
// explicit conductivity surrogate, not a translation of Kalksandstein.
const masonry = genericMaterialById("st-brick")!;
const concrete = genericMaterialById("st-rc")!;
export const KIT_OFFICE_WALL_ASSEMBLY = calculateAssembly([
  { id: "Kalksandstein — concrete-brick conductivity surrogate", thicknessM: 0.3, conductivityWPerMK: masonry.conductivityWPerMK! },
], "horizontal");
export const KIT_OFFICE_GROUND_FLOOR = slabOnGroundUValue({
  areaSqm: 516, exposedPerimeterM: 112, wallThicknessM: 0.3,
  floorResistanceM2KPerW: 0.3 / concrete.conductivityWPerMK!,
});
// Uninsulated metal skin limit: ISO 6946 upward surface resistances only.
// Missing insulation is NOT evidence that none exists; A-ROOF-UNINSULATED
// states the deliberately conservative thermal assumption separately.
const roofSurface = SURFACE_RESISTANCES.upward;
const roofU = 1 / (roofSurface.rsi + roofSurface.rse);
const wallU = KIT_OFFICE_WALL_ASSEMBLY.uValueWPerM2K;
const floors: FloorSpec[] = [
  { floorNo: -1, label: "B1 — Keller", type: "below", y: -3, height: 3, isGroundFloor: false, useCode: USE_CODE },
  { floorNo: 1, label: "1F — Erdgeschoss", type: "above", y: 0, height: 3, isGroundFloor: true, useCode: USE_CODE },
  { floorNo: 2, label: "2F — 1. Obergeschoss", type: "above", y: 3, height: 3, isGroundFloor: false, useCode: USE_CODE },
  { floorNo: 3, label: "3F — 2. Obergeschoss", type: "above", y: 6, height: 3, isGroundFloor: false, useCode: USE_CODE },
  { floorNo: 4, label: "Attic — Dachgeschoss", type: "above", y: 9, height: 3.05, isGroundFloor: false, useCode: USE_CODE },
];
const footprintSide = Math.sqrt(516);
export const KIT_OFFICE_RECIPE: BuildingRecipe = {
  ...getRecipe("21", ERA, USE_CODE, false),
  buildingName: "KIT Office — fictional validation example",
  address: "No real site (IfcSite.Description)",
  mainPurpsCd: USE_CODE, strctCd: "21", era: ERA,
  floors, totalHeight: 12.05, wallThickness: 0.3,
  footprintWidth: footprintSide, footprintDepth: footprintSide,
  siteWidth: footprintSide, siteDepth: footprintSide,
  officialFloorAreaSqm: KIT_OFFICE_TOTAL_FLOOR_AREA_SQM,
  measuredEnvelope: {
    planAreaSqm: 516, wallLengthM: 112,
    grossWallAreaSqm: KIT_OFFICE_MEASURED_ENVELOPE.grossWallSqm,
    roofAreaSqm: 659.54, volumeM3: 6227.27,
    derivedFloorAreaSqm: KIT_OFFICE_TOTAL_FLOOR_AREA_SQM,
    basis: "Geometry from the KIT Office IFC: 44 exterior walls classified by physical/external space-boundary links and measured by NetSideArea; openings by host and OverallWidth × OverallHeight; 82 enclosed-space quantities; basement slab union; 659.54 m² of sky-visible roof planes after overlap removal. Thermal properties, conditioning the attic and basement, and all operating inputs are assumptions, not measured performance.",
  },
};
const hvac = HVAC_DEFAULTS[USE_CODE];
const lighting = LIGHTING_DEFAULTS[USE_CODE];
const occupancy = OCCUPANCY_DEFAULTS[USE_CODE];
const shgc = WINDOW_SHGC[ERA];
export const KIT_OFFICE_MATERIALS: MaterialProperties = {
  source: "ifc-model", confidence: "estimated", codeYear: 2005,
  envelope: {
    walls: CARDINALS.map((orientation) => ({
      orientation, surfaceArea: WALL[orientation], uValue: wallU, rValue: 1 / wallU, thermalBridge: 0,
      layers: [{ name: "Kalksandstein (concrete-brick conductivity surrogate)", thickness: 0.3, thermalConductivity: masonry.conductivityWPerMK!, density: masonry.densityKgPerM3!, specificHeat: masonry.specificHeatJPerKgK! }],
    })),
    roof: { uValue: roofU, layers: [], solarReflectance: 0.3, emissivity: 0.9, greenRoofCoverage: 0 },
    groundFloor: { uValue: KIT_OFFICE_GROUND_FLOOR.uValueWPerM2K, layers: [{ name: "Stahlbeton", thickness: 0.3, thermalConductivity: concrete.conductivityWPerMK!, density: concrete.densityKgPerM3!, specificHeat: concrete.specificHeatJPerKgK! }], groundContactResistance: 0 },
    windows: { uValue: WINDOW_U_VALUES[ERA], shgc, vlt: shgc + 0.15, ...GLAZING_TYPE[ERA], airLeakageRate: 2, shadingCoefficient: shgc / 0.87, windowToWallRatio: { N: wwr, E: wwr, S: wwr, W: wwr } },
    foundation: { perimeterInsulationUValue: 0, groundTemperature: 13.5, moistureBarrier: "none" },
    airtightness: { ach50: AIRTIGHTNESS[ERA], equivalentLeakageArea: 0, testMethod: "estimated" },
  },
  hvac: {
    heating: { systemType: hvac.heatingType, fuelType: hvac.fuelType, efficiency: hvac.heatingEfficiency, capacity: 0 },
    cooling: { systemType: hvac.coolingType, efficiency: hvac.coolingEfficiency, capacity: 0 },
    ventilation: { type: "natural", heatRecoveryEfficiency: 0, airflowRate: 0 },
    dhw: { systemType: "gas-boiler", efficiency: 0.85, storageVolume: 0 },
  },
  lighting: { lightingPowerDensity: lighting.lpd, lampType: lighting.lampType, controlType: lighting.controlType },
  renewable: {
    solarPV: { installed: false, capacity: 0, panelType: "monocrystalline", tiltAngle: 30, orientation: 180, area: 0 },
    solarThermal: { installed: false, collectorArea: 0, efficiency: 0 },
    geothermal: { installed: false, systemType: "closed-loop", cop: 0 },
  },
  occupancy: {
    occupancyDensity: occupancy.density, internalHeatGain: occupancy.internalGain, hotWaterDemand: occupancy.hotWater,
    weekdaySchedule: [0, 0, 0, 0, 0, 0, 0.1, 0.3, 0.9, 1, 1, 1, 0.8, 1, 1, 1, 1, 0.9, 0.5, 0.2, 0.1, 0, 0, 0],
    weekendSchedule: [0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0, 0, 0, 0, 0, 0, 0],
  },
};

export const KIT_OFFICE_ASSUMPTIONS = Object.freeze([
  { id: "A-CLIMATE", assumes: "Seoul climate, not a German site climate.", why: "The official source describes a fictional office and IfcSite.Description says 'No real site'; its example coordinates are rejected." },
  { id: "A-ERA-UNDATED", assumes: "2000–2009 operational/glazing defaults and cosmetic recipe era; 2005 is an assumed code year.", why: "The 2017 IFC export timestamp dates a file, not construction. No construction year is established." },
  { id: "A-USE-CODE", assumes: "Korean office use code 14000 and concrete-family structure code 21.", why: "The source calls this an office; the Korean codes are mappings. The model contains masonry walls and reinforced-concrete slabs, not a Korean register entry." },
  { id: "A-WALL-CONDUCTIVITY", assumes: "0.30 m Kalksandstein uses the generic concrete-brick conductivity, 0.8 W/mK; no thermal bridges.", why: "Layer thickness and calcium-silicate material name are stated. Conductivity is not: the library lacks that masonry, so concrete brick is a named surrogate. Unknown density and omitted thermal bridges can change heat loss; no stated U-value is claimed." },
  { id: "A-ROOF-UNINSULATED", assumes: `Roof U = 1/(${roofSurface.rsi}+${roofSurface.rse}) = ${roofU.toFixed(2)} W/m²K, the uninsulated metal-skin limit from the standards library's upward surface resistances; reflectance 0.3 and emissivity 0.9.`, why: "The roofs name aluminium but provide no thermal layer stack. Absence is not proof of no insulation. Assuming none tends to OVERSTATE roof heat loss if insulation was omitted from the model; roof insulation savings are correspondingly optimistic until the build-up is known." },
  { id: "A-GROUND-BASEMENT", assumes: "ISO 13370 slab-on-ground approximation on the measured 516 m² basement slab/112 m perimeter with 0.30 m reinforced concrete; generic soil properties, no perimeter insulation.", why: "Basement-specific earth coupling is not supported. Exterior basement walls are also priced as outdoor walls, tending to overstate heating loss because ground buffers outdoor temperatures. The soil and damp-proofing are not stated." },
  { id: "A-CONDITIONED-SPACES", assumes: "All 82 enclosed spaces are conditioned, including basement laboratories and the 475.92 m² attic storey (403.56 m² in two attic rooms plus 72.36 m² stair/circulation).", why: "IFC supplies room geometry, not conditioning or occupancy. If the attic is unconditioned, including its floor area tends to understate intensity; the boundary would also move from roof skin to attic floor. A verified conditioning schedule is needed before treating the grade as a building rating." },
  { id: "A-WINDOWS", assumes: "2000–2009 Korean table: U 2.1, SHGC 0.45, low-e double glazing, air fill and thermally broken aluminium frame; VLT 0.60.", why: "206 window apertures are measured. These thermal/optical/frame properties are not stated by this IFC and may flatter the result if the actual example windows are single glazed." },
  { id: "A-WWR-ENGINE-MEAN", assumes: "One whole-building glazing/gross-wall ratio on four orientations; measured sector splits retained in the legend.", why: "This reproduces 309.50 m² of glazing exactly in the shared engine; gross includes 940.81 m² wall and 4.20 m² doors. Independently rounded sector totals differ by 0.01 m²." },
  { id: "A-DOORS", assumes: "4.20 m² exterior door is priced at the wall U-value.", why: "The engine has no separate door heat-loss element. Door area is excluded from the wall-insulation measure." },
  { id: "A-HVAC", assumes: "Office code-table central gas heating (0.88), central cooling COP 4, natural ventilation, no heat recovery; DHW gas boiler 0.85.", why: "This release contains no MEP model or operating plant data. No equipment capacity or actual ventilation installation is claimed." },
  { id: "A-LPD", assumes: "Office code-table lighting: 10 W/m² LED with daylight dimming.", why: "No lighting model or measured power exists. Controls are assumed, so the estimate may understate electricity where dimming is absent." },
  { id: "A-OCCUPANCY", assumes: "Office table: 0.1 persons/m², 15 W/m² gains, 10 L/person/day DHW, weekday office hours and low weekend activity.", why: "Room names classify zones but supply no occupancy schedule. Applying one office schedule to laboratories and attics is a simplification." },
  { id: "A-AIRTIGHT", assumes: "3.5 ACH50, the assumed 2000–2009 table value; the engine divides by 20 to natural ACH.", why: "No blower-door measurement or infiltration property exists." },
  { id: "A-NORTH", assumes: "Project north, not surveyed true north.", why: "The source provides no usable orientation for a real site." },
  { id: "A-NO-FOOTPRINT", assumes: "A square of area 516 m² only for fallback recipe metadata.", why: "The real IFC model is rendered and measuredEnvelope supplies every energy quantity; this square is never treated as a measured outline." },
  { id: "A-RENEWABLE", assumes: "No baseline PV, solar thermal or geothermal installation.", why: "None is supplied in this architectural example. The absence of services models cannot establish real installations." },
]);
