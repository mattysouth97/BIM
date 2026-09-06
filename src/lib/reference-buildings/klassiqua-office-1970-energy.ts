/** July 2026 Klassiqua synthetic office archetype; source T1_1970 operating scenario. */
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import type { MaterialProperties } from "@/lib/material-types";
import { getRecipe } from "@/lib/procedural/recipe";
import { AIRTIGHTNESS, OCCUPANCY_DEFAULTS } from "@/lib/korean-building-codes";

const ERA = "1970-1989";
const USE_CODE = "14000";
const CARDINALS = ["N", "E", "S", "W"] as const;
/** Four internal engine slots, with actual NE/SE/SW/NW labels supplied separately. */
const WALL = Object.freeze({ N: 272.36, E: 144.25, S: 271.85, W: 144.26 });
const GLAZING = Object.freeze({ N: 127.4, E: 63.7, S: 125.13, W: 63.7 });
const DOORS = Object.freeze({ N: 0, E: 0, S: 2.78, W: 0 });
export const KLASSIQUA_FLOOR_AREA = 1507.02;
export const KLASSIQUA_SOURCE = Object.freeze({
  recordUrl: "https://zenodo.org/records/21727160",
  documentationUrl: "https://zenodo.org/api/records/21727160/files/2026-07_Klassiqua_Buero_Archetypen_Dokumentation.pdf/content",
  documentationSha256: "116268af3109e568616acf4aa83b61e81905ee05a8590f249166be0746afa659",
  scenario: "T1_1970",
  wallU: 1.05, roofU: 0.62, effectiveGroundU: 0.45,
  wholeWindowU: 4.18, exteriorDoorU: 4.33, glazingG: 0.78, glassFraction: 0.70,
  publishedUsableFloorAreaSqm: 1507, publishedFacadeWindowRatio: 0.3013,
});
export const KLASSIQUA_MEASURED = Object.freeze({
  exteriorWallNetSqm: 832.72, glazingApertureSqm: 379.92, exteriorDoorSqm: 2.78,
  grossWallSqm: 832.72 + 379.92 + 2.78,
  groundSlabSqm: 427.36, groundPerimeterM: 87.11,
  roofAreaSqm: 420.94, roofProjectedSqm: 420.93,
  conditionedVolumeGrossM3: 5274.63, roomVolumeNetM3: 5048.52,
  exteriorWallByOrientationSqm: WALL,
});
export const KLASSIQUA_GROSS_BY_ORIENTATION = Object.freeze(Object.fromEntries(
  CARDINALS.map((direction) => [direction, WALL[direction] + GLAZING[direction] + DOORS[direction]]),
) as Record<(typeof CARDINALS)[number], number>);
const wwr = KLASSIQUA_MEASURED.glazingApertureSqm / KLASSIQUA_MEASURED.grossWallSqm;
const floors: FloorSpec[] = [0, 1, 2, 3].map((i) => ({
  floorNo: i + 1, label: `0${i}`, type: "above", y: i * 3.55,
  height: i === 3 ? 3.35 : 3.55, isGroundFloor: i === 0, useCode: USE_CODE,
}));
export const KLASSIQUA_RECIPE: BuildingRecipe = {
  ...getRecipe("21", ERA, USE_CODE, false),
  buildingName: "Klassiqua Office 1970 · synthetic T1_1970 scenario",
  address: "Aachen research scenario; no constructed counterpart",
  mainPurpsCd: USE_CODE, strctCd: "21", era: ERA, floors,
  totalHeight: 14.59, wallThickness: 0.25,
  // These source structural dimensions are recipe metadata; the measured envelope wins in energy calculations.
  footprintWidth: 28.48, footprintDepth: 14.78, siteWidth: 28.48, siteDepth: 14.78,
  officialFloorAreaSqm: KLASSIQUA_FLOOR_AREA,
  measuredEnvelope: {
    planAreaSqm: 427.36, wallLengthM: 87.11,
    grossWallAreaSqm: KLASSIQUA_MEASURED.grossWallSqm,
    roofAreaSqm: 420.94, volumeM3: 5274.63, derivedFloorAreaSqm: KLASSIQUA_FLOOR_AREA,
    basis: "48 IFC space-solid plan unions; 16 voided opaque cladding faces clipped to the occupied 0–14 m envelope (floor-edge bands included, parapet excluded); 167 whole-window openings and one exterior door; ground-slab union; sky-visible roof planes. July Klassiqua documentation supplies whole-assembly U-values. Conditioning and operational inputs remain a T1_1970 screening scenario, not metered performance.",
  },
};
const occupancy = OCCUPANCY_DEFAULTS[USE_CODE];
export const KLASSIQUA_MATERIALS: MaterialProperties = {
  source: "ifc-model", confidence: "estimated", codeYear: 1970,
  envelope: {
    walls: CARDINALS.map((orientation) => ({ orientation, surfaceArea: WALL[orientation], uValue: KLASSIQUA_SOURCE.wallU, rValue: 1 / KLASSIQUA_SOURCE.wallU, thermalBridge: 0, layers: [] })),
    roof: { uValue: KLASSIQUA_SOURCE.roofU, layers: [], solarReflectance: 0.3, emissivity: 0.9, greenRoofCoverage: 0 },
    // The published effective U already includes ISO 13370 ground coupling.
    groundFloor: { uValue: KLASSIQUA_SOURCE.effectiveGroundU, layers: [], groundContactResistance: 0 },
    windows: { uValue: KLASSIQUA_SOURCE.wholeWindowU, shgc: KLASSIQUA_SOURCE.glazingG, vlt: 0.81, glassType: "double", coating: "none", gasFill: "air", frameMaterial: "aluminum", airLeakageRate: 2, shadingCoefficient: 0.87, windowToWallRatio: { N: wwr, E: wwr, S: wwr, W: wwr } },
    foundation: { perimeterInsulationUValue: 0, groundTemperature: 13.5, moistureBarrier: "none" },
    airtightness: { ach50: AIRTIGHTNESS[ERA], equivalentLeakageArea: 0, testMethod: "estimated" },
  },
  hvac: {
    heating: { systemType: "central", fuelType: "gas", efficiency: 0.90, capacity: 0 },
    cooling: { systemType: "none", efficiency: 0, capacity: 0 },
    ventilation: { type: "natural", heatRecoveryEfficiency: 0, airflowRate: 0 },
    dhw: { systemType: "gas-boiler", efficiency: 0.85, storageVolume: 0 },
  },
  lighting: { lightingPowerDensity: 10, lampType: "fluorescent", controlType: "manual" },
  renewable: {
    solarPV: { installed: false, capacity: 0, panelType: "monocrystalline", tiltAngle: 30, orientation: 180, area: 0 },
    solarThermal: { installed: false, collectorArea: 0, efficiency: 0 },
    geothermal: { installed: false, systemType: "closed-loop", cop: 0 },
  },
  occupancy: {
    occupancyDensity: occupancy.density, internalHeatGain: occupancy.internalGain, hotWaterDemand: occupancy.hotWater,
    weekdaySchedule: [0, 0, 0, 0, 0, 0, 0.1, 0.3, 0.9, 1, 1, 1, 0.8, 1, 1, 1, 0.9, 0.5, 0.2, 0.1, 0, 0, 0, 0],
    weekendSchedule: [0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0, 0, 0, 0, 0, 0, 0],
  },
};

export const KLASSIQUA_ASSUMPTIONS = Object.freeze([
  { id: "S-SOURCE-THERMAL", assumes: "Source design inputs: full wall U 1.05, roof U 0.62, effective ground U 0.45, whole-window Uw 4.18 W/m²K and glazing g 0.78.", why: `${KLASSIQUA_SOURCE.documentationUrl} — July documentation tables 3.1 and 3.4 (PDF pages 11–12 and 16). These are archetype design calculations, not measured in-use properties. Ground U already includes ISO 13370; no second ground solver is applied. The full-wall value includes masonry, plaster and cladding, not one IFC leaf alone.` },
  { id: "A-SCENARIO-T1", assumes: "T1_1970: gas condensing heating with radiators, natural ventilation, no active cooling, no baseline PV.", why: "The source documentation table 3.6 (PDF page 19) defines this scenario; technical plant is not represented in the IFC. Heating efficiency 0.90 and gas DHW efficiency 0.85 are BIMFIT assumptions, not source values. Cooling efficiency zero intentionally produces no cooling electricity; this does not establish thermal comfort." },
  { id: "A-CLIMATE", assumes: "Seoul climate for comparison, instead of the source's Aachen scenario.", why: "The current engine supplies Korean regional weather. The archetype's location is a simulation input, not evidence of an existing office." },
  { id: "A-ENVELOPE-SCOPE", assumes: "All 48 spaces are conditioned. Opaque façade follows the cladding between the measured room floor and ceiling limits, 0–14 m; parapet faces are excluded.", why: "Floor-edge bands omitted by masonry solids are included. The source's published 30.13% façade window ratio has a different façade scope; the engine derives its own ratio from measured whole openings and this clipped envelope. Conditioning plant rooms and circulation is an explicit simplification." },
  { id: "A-UNIFORM-WALL-U", assumes: "The source full-wall U 1.05 applies uniformly to the clipped cladding footprint, including floor-edge bands; no extra thermal-bridge loss.", why: "The source supplies a combined wall construction U, not separate 2D floor-junction losses. Applying it across floor edges can understate heat loss where concrete bridges the insulation." },
  { id: "A-ROOF-SCOPE", assumes: "Roof U 0.62 across 420.94 m² of sky-visible flat planes, including the exposed structural perimeter strip.", why: "The structural slab and roofing assembly overlap; their 818.89 m² layer sum must not be priced twice. Parapet caps are omitted from roof planes. The uniform construction value can understate losses at the perimeter strip; roof reflectance 0.3 and emissivity 0.9 are assumptions." },
  { id: "A-WINDOWS", assumes: "Whole-window Uw 4.18 is applied to the full 379.92 m² aperture, without multiplying area by the 0.70 glass fraction.", why: "Source table 3.4 distinguishes Uw from glass-only Ug. Its 32 single-leaf and 135 double-leaf windows all have double glazing; leaf count is not glazing count. Source g=0.78 is retained; the engine separately applies its default combined shading/frame factor 0.7. The IFC window types state VLT 0.81, air fill, no coating and shading coefficient 0.87. Leakage remains an assumption; no shading survey is claimed." },
  { id: "A-DOORS", assumes: "The 2.78 m² exterior door is priced at wall U 1.05 because the shared engine has no separate door element.", why: "Source table 3.4 (PDF page 17) states exterior-door Ud 4.33. This engine limitation understates its transmission coefficient by (4.33−1.05)×2.78 = 9.1184 W/K. Door aperture is excluded from wall-insulation area." },
  { id: "A-NORTH-SLOTS", assumes: "Actual diagonal sectors NE/SE/SW/NW occupy the engine's N/E/S/W slots, with the displayed labels corrected to the actual sectors.", why: "The IFC states true north. The annual engine uses a whole-building mean WWR and does not model direction-specific solar gains. The full eight-sector measurements remain in the manifest; the four-slot representation must not be interpreted as a rotated building." },
  { id: "A-WWR-MEAN", assumes: "A uniform ratio across four engine slots reproduces the measured whole-building glazing aperture exactly.", why: "Sector glazing is preserved in the source manifest; the annual model uses the ratio's arithmetic mean. Independently rounded sector areas can differ from the whole-building total by 0.01 m²." },
  { id: "A-AIRTIGHT", assumes: "10 ACH50 from the assumed 1970–1989 Korean era table; the engine divides by 20 to natural air changes.", why: "The archetype's 1970 era is stated, but no blower-door result or numeric infiltration rate was found. This is not a measured German airtightness value." },
  { id: "A-USE-OPERATIONS", assumes: "Korean office use code 14000, concrete-family recipe code 21; office table occupancy/gains/DHW, 10 W/m² fluorescent lighting with manual switching, and an office schedule.", why: "Use and source constructions support these classifications; code mapping, loads and schedules are modeling assumptions. The low lighting density can understate electricity for an older office, and annual energy uses generic end-use shares rather than a room-by-room lighting simulation." },
  { id: "A-RENEWABLE-OTHER", assumes: "No solar thermal or geothermal plant; no separate perimeter-insulation term or moisture-barrier benefit.", why: "Technical systems are not modeled as IFC occurrences. These are explicit screening inputs, not absence claims about an occupied building." },
]);
