// The one window-to-wall mean, and the line it must not cross.
//
// `meanWindowToWallRatio` weights the four cardinal ratios by their own wall
// area where the recipe carries a MEASURED envelope, and leaves the unweighted
// arithmetic mean everywhere else. The second half is the part with teeth:
// every 건축물대장 building takes the unweighted branch, and this file pins
// that their numbers are byte-identical to the pre-change formula.

import { describe, it, expect } from "vitest";
import { calculateHeatLoss, meanWindowToWallRatio } from "../heat-loss";
import { envelopeQuantities } from "../envelope-quantities";
import { SEOUL_CLIMATE } from "../climate-data";
import { referenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe, FloorSpec, MeasuredEnvelope } from "@/lib/procedural/types";

/** The formula that stood in both callers before this function existed. */
function unweightedMean(m: MaterialProperties): number {
  const w = m.envelope.windows.windowToWallRatio;
  return (w.N + w.S + w.E + w.W) / 4;
}

/**
 * Four orientations with deliberately unequal walls and unequal ratios —
 * the only shape in which a weighted and an unweighted mean differ at all.
 * North is the big wall with little glass, south the small wall with a lot.
 */
const WALL_SQM = { N: 400, S: 100, E: 250, W: 250 } as const;
const WWR = { N: 0.1, S: 0.6, E: 0.2, W: 0.2 } as const;

function makeMaterials(): MaterialProperties {
  const wall = (orientation: "N" | "S" | "E" | "W") => ({
    orientation,
    uValue: 0.3,
    rValue: 1 / 0.3,
    layers: [],
    thermalBridge: 0,
    surfaceArea: WALL_SQM[orientation],
  });
  return {
    source: "code-estimate",
    confidence: "estimated",
    codeYear: 2015,
    envelope: {
      walls: [wall("N"), wall("S"), wall("E"), wall("W")],
      roof: { uValue: 0.2, layers: [], solarReflectance: 0.5, emissivity: 0.9, greenRoofCoverage: 0 },
      groundFloor: { uValue: 0.25, layers: [], groundContactResistance: 0 },
      windows: {
        uValue: 1.5,
        shgc: 0.4,
        vlt: 0.6,
        glassType: "double",
        coating: "low-e",
        gasFill: "argon",
        frameMaterial: "thermal-break-aluminum",
        airLeakageRate: 0.3,
        shadingCoefficient: 0.5,
        windowToWallRatio: { ...WWR },
      },
      foundation: { perimeterInsulationUValue: 0, groundTemperature: 13.5, moistureBarrier: "none" },
      airtightness: { ach50: 3, equivalentLeakageArea: 0, testMethod: "estimated" },
    },
    hvac: {
      heating: { systemType: "central", fuelType: "gas", efficiency: 0.85, capacity: 0 },
      cooling: { systemType: "split", efficiency: 3, capacity: 0 },
      ventilation: { type: "natural", heatRecoveryEfficiency: 0, airflowRate: 0 },
      dhw: { systemType: "gas-boiler", efficiency: 0.85, storageVolume: 0 },
    },
    lighting: { lightingPowerDensity: 8, controlType: "manual", lampType: "led" },
    renewable: {
      solarPV: { installed: false, capacity: 0, panelType: "monocrystalline", tiltAngle: 30, orientation: 180, area: 0 },
      solarThermal: { installed: false, collectorArea: 0, efficiency: 0 },
      geothermal: { installed: false, systemType: "closed-loop", cop: 0 },
    },
    occupancy: { occupancyDensity: 0.05, weekdaySchedule: [], weekendSchedule: [], internalHeatGain: 3, hotWaterDemand: 40 },
  };
}

/** A register-shaped recipe: a footprint, storeys, and NO measured envelope. */
function makeLedgerRecipe(): BuildingRecipe {
  const floors: FloorSpec[] = Array.from({ length: 5 }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * 3,
    height: 3,
    isGroundFloor: i === 0,
  }));
  return {
    footprintWidth: 20,
    footprintDepth: 15,
    floors,
    totalHeight: 15,
    wallThickness: 0.3,
    era: "2010-2019",
    strctCd: "11",
    mainPurpsCd: "02000",
    facade: {
      windowWidth: 1.6, windowHeight: 1.8, sillHeight: 0.7, windowSpacing: 2.4,
      windowRatio: 0.35, mullionDepth: 0.08, mullionWidth: 0.05,
      glassInset: 0.03, solidPanelChance: 0.15, parapetHeight: 0.9, cornerInset: 0.05,
    },
    slab: { thickness: 0.2, overhang: 0 },
    column: { spacing: 6, size: 0.4, inset: 0.5 },
    roof: { type: "flat", flatThickness: 0.3, gableHeight: 3, hipInset: 0.4 },
    materials: {
      wall: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      glass: { color: "#88BBDD", roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.4 },
      mullion: { color: "#808890", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      column: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
      roof: { color: "#808080", roughness: 0.8, metalness: 0.1 },
      groundFloor: { color: "#B8B0A8", roughness: 0.9, metalness: 0 },
    },
    siteWidth: 30,
    siteDepth: 25,
    buildingName: "Ledger fixture",
    address: "Seoul",
  };
}

/** The same building, but with its envelope read off a model's own solids. */
function withMeasuredEnvelope(recipe: BuildingRecipe): BuildingRecipe {
  const measured: MeasuredEnvelope = {
    planAreaSqm: 300,
    wallLengthM: 70,
    grossWallAreaSqm: WALL_SQM.N + WALL_SQM.S + WALL_SQM.E + WALL_SQM.W,
    roofAreaSqm: 320,
    volumeM3: 4500,
    derivedFloorAreaSqm: 1500,
    basis: "test fixture",
  };
  return { ...recipe, measuredEnvelope: measured };
}

describe("meanWindowToWallRatio — the unweighted branch is the one that must not move", () => {
  it("returns the plain arithmetic mean for a recipe with no measured envelope", () => {
    const materials = makeMaterials();
    const recipe = makeLedgerRecipe();

    // 0.1 + 0.6 + 0.2 + 0.2 = 1.1, ÷ 4 = 0.275
    expect(unweightedMean(materials)).toBeCloseTo(0.275, 12);
    expect(meanWindowToWallRatio(materials, recipe)).toBe(unweightedMean(materials));
  });

  it("prices a ledger building's windows at gross × the UNWEIGHTED mean, exactly as before", () => {
    const materials = makeMaterials();
    const recipe = makeLedgerRecipe();
    const gross = envelopeQuantities(recipe).grossWallAreaSqm;

    const result = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
    const windows = result.elements.find((e) => e.element === "Windows")!;
    const walls = result.elements.find((e) => e.element === "Walls")!;

    // The pre-change formula, reproduced literally.
    expect(windows.area).toBeCloseTo(gross * 0.275, 10);
    expect(walls.area).toBeCloseTo(gross - gross * 0.275, 10);
    // And NOT the weighted answer, which for this fixture is 0.20.
    expect(windows.area).not.toBeCloseTo(gross * 0.2, 6);
  });

  it("falls back to the unweighted mean when a measured envelope has no wall split to weight by", () => {
    const materials = makeMaterials();
    materials.envelope.walls = [];
    const recipe = withMeasuredEnvelope(makeLedgerRecipe());

    // Not 0 — the ratio the file states survives when the weights do not.
    expect(meanWindowToWallRatio(materials, recipe)).toBe(unweightedMean(materials));
    expect(meanWindowToWallRatio(materials, recipe)).toBeCloseTo(0.275, 12);
  });
});

describe("meanWindowToWallRatio — the measured branch", () => {
  it("weights each cardinal ratio by its own wall area", () => {
    const materials = makeMaterials();
    const recipe = withMeasuredEnvelope(makeLedgerRecipe());

    // (400×0.1 + 100×0.6 + 250×0.2 + 250×0.2) / 1000 = 200 / 1000
    const expected =
      (WALL_SQM.N * WWR.N + WALL_SQM.S * WWR.S + WALL_SQM.E * WWR.E + WALL_SQM.W * WWR.W) /
      (WALL_SQM.N + WALL_SQM.S + WALL_SQM.E + WALL_SQM.W);
    expect(expected).toBeCloseTo(0.2, 12);
    expect(meanWindowToWallRatio(materials, recipe)).toBeCloseTo(0.2, 12);
  });

  it("reproduces the building's own aperture, which the unweighted mean does not", () => {
    const materials = makeMaterials();
    const recipe = withMeasuredEnvelope(makeLedgerRecipe());
    const gross = envelopeQuantities(recipe).grossWallAreaSqm;

    // What the four elevations actually glaze, summed.
    const aperture =
      WALL_SQM.N * WWR.N + WALL_SQM.S * WWR.S + WALL_SQM.E * WWR.E + WALL_SQM.W * WWR.W;
    expect(aperture).toBe(200);

    expect(gross * meanWindowToWallRatio(materials, recipe)).toBeCloseTo(aperture, 8);
    // The unweighted mean over-glazes this building by 75 m² — 37 % more
    // than it has — because the 100 m² south wall, at WWR 0.6, votes as
    // loudly as the 400 m² north one at 0.1.
    expect(gross * unweightedMean(materials)).toBeCloseTo(275, 8);
  });
});

describe("the two published reference buildings", () => {
  // Both currently hand the engine ONE ratio on all four cardinals
  // (A-WWR-DENOMINATOR), so weighting cannot change their answer. Asserting
  // it is the point: the WWR change is what makes a real per-sector split
  // safe to land, not a correction to a number on screen today.
  for (const id of ["bs-medical-dental-clinic", "schependomlaan"] as const) {
    it(`${id}: weighted equals unweighted, so its kWh/m² does not move`, () => {
      const energy = referenceBuildingEnergyInputs(id);
      expect(energy).not.toBeNull();
      const { materials, recipe } = energy!;

      expect(recipe.measuredEnvelope).toBeDefined();
      expect(meanWindowToWallRatio(materials, recipe)).toBe(unweightedMean(materials));
    });

    it(`${id}: the engine's window area still equals the file's measured aperture`, () => {
      const { materials, recipe } = referenceBuildingEnergyInputs(id)!;
      const gross = envelopeQuantities(recipe).grossWallAreaSqm;
      const result = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
      const windows = result.elements.find((e) => e.element === "Windows")!;

      expect(windows.area).toBeCloseTo(gross * meanWindowToWallRatio(materials, recipe), 8);
    });
  }
});
