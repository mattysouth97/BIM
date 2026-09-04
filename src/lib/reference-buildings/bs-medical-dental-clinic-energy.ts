/**
 * The buildingSMART Medical-Dental Clinic as energy-engine input.
 *
 * Two objects — a `BuildingRecipe` and a `MaterialProperties` — which is
 * exactly what the `/building/demo` cards consume (`use-energy-metrics.ts`)
 * and what `generateECO2Input` takes. Every number here is either MEASURED
 * from the IFC (and says which extraction produced it) or ASSUMED (and is
 * listed in `CLINIC_ASSUMPTIONS` with the reason it cannot be measured).
 *
 * ## What this deliberately does NOT do
 *
 * The recipe carries **shape and metadata only**. The demo path re-derives
 * envelope areas from recipe geometry (`envelopeQuantities(recipe)`), and this
 * building's measured envelope is not a prism: 240.73 m² of its 2,150.30 m²
 * wall is a concourse clerestory above the roof line, which no rectangular
 * extrusion reproduces. So the recipe is NOT contorted to hit the measured
 * areas. The measured envelope is exported separately as
 * `CLINIC_MEASURED_ENVELOPE` for the route to inject, keeping the areas
 * traceable to the file rather than to a fitted footprint.
 *
 * Source of the measurements: the reference-building extraction on the
 * shared branch (`public/reference-buildings/bs-medical-dental-clinic/
 * manifest.json`) and main-coordinator's storey/roof/slab measurements of
 * 2026-09-04 17:12 from the architectural and structural IFCs.
 */

import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import type { MaterialProperties } from "@/lib/material-types";
import { getRecipe } from "@/lib/procedural/recipe";
import { slabOnGroundUValue, slabOnGroundUValueRange } from "@/lib/energy-standards/ground-coupling";

// ── Measured geometry ─────────────────────────────────────────────────────

/** Two occupied storeys; footing and roof datums are not storeys. */
const FIRST_FLOOR_F2F_M = 4.57;
const SECOND_FLOOR_F2F_M = 4.68; // to the roof datum at 9.25
const MONITOR_TOP_M = 13.53;

/** Exterior-wall bounding box, metres. The plan is L-shaped, not this rectangle. */
const BBOX_WIDTH_M = 52.66;
const BBOX_DEPTH_M = 56.9;

/** Storey datums and per-storey floor area (GSA BIM Area, floor-counting spaces only). */
export const CLINIC_STOREYS = Object.freeze({
  firstFloor: Object.freeze({ elevationM: 0, floorToFloorM: FIRST_FLOOR_F2F_M, floorAreaSqm: 2525.67 }),
  secondFloor: Object.freeze({ elevationM: FIRST_FLOOR_F2F_M, floorToFloorM: SECOND_FLOOR_F2F_M, floorAreaSqm: 1723.69 }),
  /** Mechanical / monitor rooms at roof level. Floor area, not a storey. */
  roofLevel: Object.freeze({ elevationM: 9.25, floorAreaSqm: 64.83 }),
  monitorTopM: MONITOR_TOP_M,
});
export const CLINIC_TOTAL_FLOOR_AREA_SQM = 4314.2;

/** Slab-on-grade one-face area = ground-contact area. Excludes 167.32 m² of paving. */
const GROUND_SLAB_SQM = 2621.08;
/** Exposed perimeter of the slab-on-grade outline, independently derived. */
const GROUND_PERIMETER_M = 217.01;
const WALL_THICKNESS_AT_SLAB_M = 0.267;

/** Exterior wall NET of openings — opaque only. */
const EXTERIOR_WALL_NET_SQM = 2150.3;
/**
 * Glazing aperture, as `scripts/lib/ifc-openings.mjs` measures it and the
 * manifest carries it (`areas.glazingApertureSqm`): 58 IfcWindow at
 * OverallWidth × OverallHeight (100.63 m²) + 15 exterior IfcCurtainWall at the
 * projected outline of their plates and mullions (162.10 m²). Every element
 * is a row in `openings.json` with its host wall and sector.
 *
 * Replaced 267.16 on 2026-09-05. That figure came from a verification
 * transcript whose method was recovered afterwards: the same 58 windows and
 * the same 15 storefronts, but with the 4.19 m² "Dbl Glass" entrance leaf in
 * storefront #742 counted as glazing. Here it is a door, because the file
 * types it IfcDoor — see A-DOORS and A-WWR-LOW. 262.73 + 4.19 = 266.92, within
 * 0.1 % of the transcript's 266.78.
 */
const GLAZING_APERTURE_SQM = 262.73;
/**
 * Exterior door leaves (`areas.exteriorDoorSqm`): 12 IfcDoor hosted in the
 * 80-wall exterior set (31.89 m²) plus the "Dbl Glass" leaf inside storefront
 * #742 (4.19 m²), each at OverallWidth × OverallHeight — which on this file
 * equals the IfcOpeningElement's own profile to the millimetre. Replaced
 * 37.06, a figure no route reproduces: the 12 hosted leaves measure 31.89 by
 * both OverallWidth × OverallHeight and their cut openings. Opaque bar the
 * one glazed leaf, and neither wall nor window in the engine's vocabulary —
 * see A-DOORS.
 */
const EXTERIOR_DOOR_SQM = 36.08;

/**
 * The measured envelope. `envelopeQuantities(CLINIC_RECIPE)` returns these
 * figures (via `CLINIC_RECIPE.measuredEnvelope`) in place of an extrusion of
 * the footprint. Walls are NET of openings (the tessellation is the final
 * solid); `grossWallSqm` adds the openings back, because that is the number
 * the heat-loss model multiplies by WWR. Orientation split has
 * `northAssumed: true` — the file states no TrueNorth, so north is the
 * model's −Z.
 */
export const CLINIC_MEASURED_ENVELOPE = Object.freeze({
  exteriorWallNetSqm: EXTERIOR_WALL_NET_SQM,
  exteriorWallByOrientationSqm: Object.freeze({ N: 563.53, E: 433.54, S: 586.67, W: 566.57 }),
  exteriorWallBelowRoofSqm: 1909.56,
  exteriorWallAboveRoofSqm: 240.73, // the concourse clerestory
  northAssumed: true,
  glazingApertureSqm: GLAZING_APERTURE_SQM,
  /**
   * Aperture per sector, from `areas.glazingByOrientationSqm` — each window
   * binned by its own host wall, each storefront by its outward face. Sums to
   * `glazingApertureSqm`. Measured, and NOT what the engine consumes: it
   * averages the four ratios against one gross wall (heat-loss.ts), so the
   * engine input stays the single derived ratio below and this split is for
   * the per-sector rows on the page.
   */
  glazingByOrientationSqm: Object.freeze({ N: 54.79, E: 95.11, S: 49.58, W: 63.24 }),
  /**
   * The doc's render-colour estimate of the glass alone (224.85), which the
   * extractor does not reproduce: aperture includes frames and mullions, so
   * the extractor's nearest figure is 100.63 (window frames) + 143.38 (glass
   * plates only) = 244.01. Recorded, not used.
   */
  glazingPaneSqm: 225,
  exteriorDoorSqm: EXTERIOR_DOOR_SQM,
  exteriorDoorByOrientationSqm: Object.freeze({ N: 5.86, E: 4.19, S: 6.51, W: 19.53 }),
  /** Opaque wall + glazing + doors: the whole exterior wall plane. */
  grossWallSqm: EXTERIOR_WALL_NET_SQM + GLAZING_APERTURE_SQM + EXTERIOR_DOOR_SQM,
  /** EPDM-on-rigid-insulation, 7 slabs, horizontal-projected. */
  roofEpdmSqm: 2286.93,
  /**
   * Standing seam over the atrium spine, 5 IfcRoof, horizontal-PROJECTED.
   * The top-face sum is 764.56 because it is pitched (two faces within 26° of
   * horizontal); an earlier geometry pass put it at ~296.6. Range 296–382.
   * This file uses the projected 382.28 and says so.
   */
  roofStandingSeamSqm: 382.28,
  roofStandingSeamRangeSqm: Object.freeze({ low: 296.6, high: 382.28 }),
  groundSlabSqm: GROUND_SLAB_SQM,
  groundPerimeterM: GROUND_PERIMETER_M,
  /**
   * Conditioned volume inside the air barrier, from
   * `public/reference-buildings/bs-medical-dental-clinic/manifest.json`
   * (`areas.conditionedVolumeGrossM3`): each floor-counting room as floor
   * area × its storey's floor-to-floor, plus the three OPEN TO BELOW voids as
   * their own solids, and the 9.25 m lift shaft — a room taller than its
   * storey with no void modelled above it — as its own solid. This replaced
   * a 19,610–24,240 range on 2026-09-04; it sits inside that range and every
   * term is named in `spaces.json`.
   */
  conditionedVolumeGrossM3: 20701.55,
  /**
   * The same 262 spaces' own solids summed, which stop at the ceilings — 150
   * of the 153 first-floor rooms are 2.80 m tall under a 4.57 m storey. The
   * air people stand in, plenums excluded. Recorded because it is what the
   * model literally contains; NOT the engine's volume, because ACH50 is
   * quoted against the air barrier, not the ceiling.
   */
  roomVolumeNetM3: 12928.26,
});

// ── Ground floor: ISO 13370, not air-to-air ───────────────────────────────

/**
 * 150 mm cast-in-situ slab on grade, uninsulated (the model states no edge or
 * under-slab insulation, so none is assumed). `calculateAssembly` gives 3.873
 * W/m²K for this — wrong physics, 16× too lossy. ISO 13370 gives 0.237,
 * bounded 0.185–0.376 by soil type. Soil is never in a drawing set; 2.0 is the
 * standard's own default and is assumption A-SOIL below.
 */
const groundInputs = {
  areaSqm: GROUND_SLAB_SQM,
  exposedPerimeterM: GROUND_PERIMETER_M,
  wallThicknessM: WALL_THICKNESS_AT_SLAB_M,
  floorResistanceM2KPerW: 0.15 / 2.3,
} as const;
export const CLINIC_GROUND_FLOOR = slabOnGroundUValue(groundInputs);
export const CLINIC_GROUND_FLOOR_RANGE = slabOnGroundUValueRange(groundInputs);

// ── Window-to-wall ratio: the denominator matters ─────────────────────────

/**
 * The engine computes `windows = grossWall × wwr` and then prices
 * `grossWall − windows` as opaque wall. So the wall area it is handed must be
 * GROSS — opaque + glazing + doors — and the ratio must be quoted against
 * that same gross, or one of two things goes wrong: against a net 2,150.30
 * with wwr 0.1222 the windows land on 262.73 but the opaque wall falls to
 * 1,888 m², 263 m² of real wall unpriced; against the gross 2,449.11 with the
 * net ratio the windows come out 14 % too large.
 *
 * `measuredEnvelope.grossWallAreaSqm` below carries the gross, so the ratio
 * is derived from the two measured numbers rather than typed, and a test
 * asserts that `gross × wwr` lands on the measured aperture. The 36.08 m² of
 * exterior doors end up priced at the wall U — the one approximation, stated
 * in A-DOORS.
 *
 * The ratio is applied uniformly across orientations. The per-orientation
 * split IS measured now (`glazingByOrientationSqm`), but heat-loss.ts
 * averages the four ratios against one gross wall, so per-sector ratios in
 * this table would put the windows 2.7 % over the measured aperture. One
 * ratio here; the split on the page.
 */
const WWR_AGAINST_GROSS_WALL =
  CLINIC_MEASURED_ENVELOPE.glazingApertureSqm / CLINIC_MEASURED_ENVELOPE.grossWallSqm;

// ── The recipe: shape and metadata only ───────────────────────────────────

const floors: FloorSpec[] = [
  {
    floorNo: 1,
    label: "1F — First Floor",
    type: "above",
    y: 0,
    height: FIRST_FLOOR_F2F_M,
    isGroundFloor: true,
    useCode: "09000",
  },
  {
    floorNo: 2,
    label: "2F — Second Floor",
    type: "above",
    y: FIRST_FLOOR_F2F_M,
    height: SECOND_FLOOR_F2F_M,
    isGroundFloor: false,
    useCode: "09000",
  },
];

/**
 * Era 2010-2019: the building is a 2011 US federal design. Note what the era
 * does in this engine — it selects Korean code-table defaults for anything not
 * overridden. Every value that matters is overridden explicitly below, so the
 * era's only surviving effect is on cosmetic recipe fields.
 */
/** Config sub-objects only (facade/slab/column/roof/materials) — same pattern as building-geometry.ts:240. */
const defaults = getRecipe("21", "2010-2019", "09000", true);

export const CLINIC_RECIPE: BuildingRecipe = {
  ...defaults,
  era: "2010-2019",
  buildingName: "buildingSMART Medical-Dental Clinic",
  address: "Site is the authoring tool's factory default (Boston, MA); real location redacted.",
  footprintWidth: BBOX_WIDTH_M,
  footprintDepth: BBOX_DEPTH_M,
  officialFloorAreaSqm: CLINIC_TOTAL_FLOOR_AREA_SQM,
  floors,
  totalHeight: MONITOR_TOP_M,
  wallThickness: WALL_THICKNESS_AT_SLAB_M,
  mainPurpsCd: "09000",
  strctCd: "21",
  siteWidth: BBOX_WIDTH_M,
  siteDepth: BBOX_DEPTH_M,
  /**
   * What `envelopeQuantities(CLINIC_RECIPE)` returns, in place of extruding
   * the bounding box above. Every figure is from the file; `basis` says
   * which extraction. The bbox stays a bbox — it is never bent to make these
   * numbers come out.
   */
  measuredEnvelope: {
    planAreaSqm: CLINIC_MEASURED_ENVELOPE.groundSlabSqm,
    wallLengthM: CLINIC_MEASURED_ENVELOPE.groundPerimeterM,
    grossWallAreaSqm: CLINIC_MEASURED_ENVELOPE.grossWallSqm,
    roofAreaSqm:
      CLINIC_MEASURED_ENVELOPE.roofEpdmSqm + CLINIC_MEASURED_ENVELOPE.roofStandingSeamSqm,
    volumeM3: CLINIC_MEASURED_ENVELOPE.conditionedVolumeGrossM3,
    derivedFloorAreaSqm: CLINIC_TOTAL_FLOOR_AREA_SQM,
    basis:
      "Read from the buildingSMART Clinic IFCs by scripts/build-reference-building.mjs: " +
      "walls from the tessellated exterior-wall solids, glazing and doors per opening " +
      "(windows and doors at OverallWidth × OverallHeight attributed to their host wall, " +
      "exterior curtain walls at the projected outline of plates and mullions), " +
      "roofs from the structural model's IfcRoof/IfcSlab " +
      "projected to plan, ground from the slab-on-grade outline, volume from the " +
      "IfcSpace rows (floor area × storey height, voids as their own solids).",
  },
};

// ── Materials ─────────────────────────────────────────────────────────────

const wallLayers = [
  { name: "Insulation - Insulated Panel (PIR core)", thickness: 0.042, thermalConductivity: 0.024, density: 40, specificHeat: 1400 },
  { name: "Metal - Firring (unventilated cavity)", thickness: 0.038, thermalConductivity: 0.211, density: 1.2, specificHeat: 1005 },
  { name: "Wood - Sheathing - plywood", thickness: 0.019, thermalConductivity: 0.13, density: 500, specificHeat: 1600 },
  { name: "Metal - Stud Layer (UNFILLED cavity, no insulation named)", thickness: 0.152, thermalConductivity: 0.844, density: 1.2, specificHeat: 1005 },
  { name: "Plasterboard", thickness: 0.016, thermalConductivity: 0.25, density: 900, specificHeat: 1000 },
];

const wall = (orientation: "N" | "S" | "E" | "W", surfaceArea: number) => ({
  orientation,
  uValue: 0.4,
  rValue: 1 / 0.4,
  layers: wallLayers,
  thermalBridge: 0,
  surfaceArea,
});

export const CLINIC_MATERIALS: MaterialProperties = {
  source: "ifc-model",
  confidence: "estimated",
  codeYear: 2011,
  envelope: {
    walls: [
      wall("N", CLINIC_MEASURED_ENVELOPE.exteriorWallByOrientationSqm.N),
      wall("E", CLINIC_MEASURED_ENVELOPE.exteriorWallByOrientationSqm.E),
      wall("S", CLINIC_MEASURED_ENVELOPE.exteriorWallByOrientationSqm.S),
      wall("W", CLINIC_MEASURED_ENVELOPE.exteriorWallByOrientationSqm.W),
    ],
    /**
     * Area-weighted across the two roofs: EPDM 0.317 over 2,286.93 m² and
     * standing seam 3.450 over 382.28 m² → 0.767 W/m²K. The standing-seam
     * roof has NO insulation layer and dominates roof loss despite being 14 %
     * of the area. The engine takes one roof U, so it is weighted here and the
     * two constituents are recorded in the assumptions.
     */
    roof: {
      uValue: (0.317 * 2286.93 + 3.45 * 382.28) / (2286.93 + 382.28),
      layers: [
        { name: "Roofing - EPDM Membrane", thickness: 0.006, thermalConductivity: 0.25, density: 1150, specificHeat: 1000 },
        { name: "Insulation - Rigid polyiso (ASTM C1289 LTTR)", thickness: 0.076, thermalConductivity: 0.0253, density: 32, specificHeat: 1400 },
        { name: "Metal - Decking", thickness: 0.038, thermalConductivity: 50, density: 7800, specificHeat: 450 },
      ],
      solarReflectance: 0.1, // black EPDM
      emissivity: 0.9,
      greenRoofCoverage: 0,
    },
    groundFloor: {
      uValue: CLINIC_GROUND_FLOOR.uValueWPerM2K,
      layers: [{ name: "Concrete - Cast In Situ", thickness: 0.15, thermalConductivity: 2.3, density: 2300, specificHeat: 1000 }],
      /** ISO 13370's soil path is already inside the U above; nothing to add here. */
      groundContactResistance: 0,
    },
    windows: {
      uValue: 2.8,
      shgc: 0.4,
      vlt: 0.6,
      glassType: "double",
      coating: "low-e",
      gasFill: "air",
      frameMaterial: "thermal-break-aluminum",
      airLeakageRate: 0.3,
      shadingCoefficient: 0.46,
      windowToWallRatio: {
        N: WWR_AGAINST_GROSS_WALL,
        S: WWR_AGAINST_GROSS_WALL,
        E: WWR_AGAINST_GROSS_WALL,
        W: WWR_AGAINST_GROSS_WALL,
      },
    },
    foundation: {
      perimeterInsulationUValue: 0,
      groundTemperature: 13.5,
      moistureBarrier: "none",
    },
    airtightness: {
      ach50: 5,
      equivalentLeakageArea: 0,
      testMethod: "estimated",
    },
  },
  hvac: {
    heating: { systemType: "central", fuelType: "gas", efficiency: 0.85, capacity: 0 },
    cooling: { systemType: "central-chiller", efficiency: 3.0, capacity: 0 },
    ventilation: { type: "mechanical-supply", heatRecoveryEfficiency: 0, airflowRate: 0 },
    dhw: { systemType: "gas-boiler", efficiency: 0.8, storageVolume: 0 },
  },
  lighting: {
    lightingPowerDensity: 9.4,
    controlType: "manual",
    lampType: "fluorescent",
  },
  renewable: {
    solarPV: { installed: false, capacity: 0, panelType: "monocrystalline", tiltAngle: 0, orientation: 0, area: 0 },
    solarThermal: { installed: false, collectorArea: 0, efficiency: 0 },
    geothermal: { installed: false, systemType: "closed-loop", cop: 0 },
  },
  occupancy: {
    occupancyDensity: 0.1,
    weekdaySchedule: [0, 0, 0, 0, 0, 0, 0, 0.3, 0.8, 1, 1, 1, 0.8, 1, 1, 1, 0.8, 0.4, 0.1, 0, 0, 0, 0, 0],
    weekendSchedule: [0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.2, 0.2, 0.2, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    internalHeatGain: 15,
    hotWaterDemand: 5,
  },
};

// ── Every assumption, named ───────────────────────────────────────────────

export type ClinicAssumption = Readonly<{ id: string; assumes: string; why: string }>;

export const CLINIC_ASSUMPTIONS: readonly ClinicAssumption[] = Object.freeze([
  { id: "A-CLIMATE", assumes: "A Korean climate (Seoul) for a US building.", why: "The IfcSite is the authoring tool's factory default (Boston) and the real location is redacted, so no climate may be taken from the file. ECO2 has no US regions. Any climate here is a substitution; this one is stated." },
  { id: "A-STUD-CAVITY", assumes: "The 152 mm metal-stud cavity is UNFILLED.", why: "The layer set names no insulation in it. Naming an R-13 batt would halve the wall U (0.404 → 0.218). A real clinic probably has one; the model does not say so, and the model is the source." },
  { id: "A-STEEL-BRIDGE", assumes: "No thermal bridging through the steel studs or bar joists.", why: "ISO 6946 Table 2 assumes an unsubdivided air layer; steel framing breaks that premise and the bridge is not represented. For steel it is tens of percent, not a rounding error, and is disclosed rather than tuned away." },
  { id: "A-SEAM-ROOF", assumes: "The standing-seam roof's 286 mm bar-joist zone is an unventilated upward cavity (R 0.16), U 3.45.", why: "No insulation layer exists in that assembly. As solid steel it would be 7.37. Both are stated; the cavity reading is used because a joist zone is mostly air." },
  { id: "A-SEAM-AREA", assumes: "Standing-seam roof plan area 382.28 m² (projected).", why: "The roof is pitched; its face sum is 764.56 and an earlier geometry pass gave 296.6. The range 296–382 is recorded; the projected figure is used." },
  { id: "A-ROOF-WEIGHT", assumes: "One area-weighted roof U of 0.767 W/m²K.", why: "The engine accepts a single roof U. The standing seam is 14 % of the roof area and most of its loss; the weighting is recorded so the constituents can be recovered." },
  { id: "A-SOIL", assumes: "Soil conductivity 2.0 W/m·K under the slab.", why: "ISO 13370's own default when soil is unknown. Soil moves the ground U from 0.185 (clay) to 0.376 (rock); 0.237 is the nominal." },
  { id: "A-GROUND-DT", assumes: "The engine's 13.5 °C ground temperature and 4,380 h ground season.", why: "ISO 13370's U pairs with annual-mean external air (~7.5 K at 20 °C indoor); the engine applies 6.5 K. About 13 % conservative, in the direction that makes the building look worse. Disclosed rather than reconciled, because reconciling moves every other building." },
  { id: "A-WWR-DENOMINATOR", assumes: "WWR 0.1073 against GROSS wall area (opaque + glazing + doors), uniform across orientations.", why: "The engine computes windows = gross × WWR and prices the rest as opaque wall, so the ratio must be quoted against the same gross the engine is handed, or the opaque wall silently loses 263 m². Derived from the two measured numbers, not typed. The per-orientation split is measured (manifest areas.glazingByOrientationSqm: N 54.79 / E 95.11 / S 49.58 / W 63.24) but the engine averages the four ratios against one gross wall, so per-sector ratios here would overstate the windows by 2.7 %; one ratio is applied and the split is shown, not consumed." },
  { id: "A-DOORS", assumes: "The 36.08 m² of exterior door leaves are priced at the wall U-value.", why: "The engine knows walls and windows and nothing between. Twelve leaves are flush insulated metal, so wall U is the nearer of the two; the thirteenth is the 4.19 m² 'Dbl Glass' entrance leaf in storefront #742, a glazed door counted as a door because the file types it IfcDoor — the one place this file departs from the verification transcript's 266.78, which counted that leaf as glazing. Leaving doors out would make the envelope smaller than the building." },
  { id: "A-WWR-LOW", assumes: "10.7–12.2 % is the building, not an undercount.", why: "262.73 m² is reproduced element by element by scripts/lib/ifc-openings.mjs from the file — 58 windows at their frame opening, 15 exterior storefronts at the projected outline of plates and mullions — and reconciles with the earlier 267.16 / 266.78 to within the 4.19 m² entrance leaf now carried as a door. The 13 storefronts the file also marks IsExternal that were left out face a room on both sides (atrium screens and interior storefronts, 120.76 m²): IsExternal means 'not a partition' to the authoring tool, never 'faces outdoor air'. The two occupied storeys are ~7 % glazed and the concourse is daylit from above through clerestory monitors. Do not normalise upward." },
  { id: "A-GLAZING", assumes: "Double low-e glazing, U 2.8, SHGC 0.40, thermal-break aluminium.", why: "The IFC carries no IfcThermalTransmittance for its windows. Typical for a 2011 US commercial building; not read from the file." },
  { id: "A-AIRTIGHT", assumes: "ACH50 = 5.", why: "No blower-door result exists. A generic mid value for a 2011 commercial envelope; ACH50/20 is the engine's natural-infiltration divisor." },
  { id: "A-HVAC", assumes: "Central gas heating (η 0.85), central chiller (COP 3.0), mechanical supply ventilation without heat recovery.", why: "The HVAC IFC has 8 IfcFlowMovingDevice and 3 IfcEnergyConversionDevice, so system TYPE is partly stated, but efficiencies are not. These are placeholders to be replaced from the device data; they are not read from the file." },
  { id: "A-LPD", assumes: "Lighting power density 9.4 W/m².", why: "ASHRAE 90.1-2010 clinic allowance, 0.87 W/ft². The file states no lighting load." },
  { id: "A-OCCUPANCY", assumes: "Clinic weekday/weekend schedules, 0.1 persons/m², 15 W/m² internal gain, 5 L/m²·day hot water.", why: "No occupancy data exists in a coordination model. Generic clinic profile; every one of these is an assumption." },
  { id: "A-VOLUME", assumes: "The ventilation term uses the gross conditioned volume (20,702 m³, inside the air barrier), not the 12,928 m³ the room solids sum to.", why: "The file states no volume; both figures are measured from it. The room solids stop at 2.80 m ceilings under 4.57 m storeys, so their sum leaves out the plenums, and ACH50 is defined against everything inside the air barrier. Choosing the net figure would cut infiltration loss by 37 % for a building whose plenums are inside its envelope. Gross also includes the intermediate slab and structure (~0.3 m per storey, ~6 %), so it is slightly more than the air itself — well inside ACH50's own uncertainty, and stated rather than corrected." },
  { id: "A-ENVELOPE-SOURCE", assumes: "Envelope areas come from the measured manifest, not from the recipe's footprint.", why: "The recipe footprint is a 52.66 × 56.90 bounding box of an L-shaped plan; extruding it cannot reproduce a 240.73 m² clerestory. The measured areas travel on the recipe as `measuredEnvelope`, and `envelopeQuantities` returns them with source \"measured\" instead of extruding." },
]);
