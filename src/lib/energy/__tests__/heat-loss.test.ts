import { describe, it, expect } from "vitest";
import { calculateHeatLoss } from "../heat-loss";
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import { SEOUL_CLIMATE } from "../climate-data";

/** Helper: create a realistic 84m2 Korean apartment MaterialProperties */
function makeApartmentMaterials(overrides?: {
  wallU?: number;
  roofU?: number;
  floorU?: number;
  windowU?: number;
  wwr?: number;
}): MaterialProperties {
  const wallU = overrides?.wallU ?? 0.26;
  const roofU = overrides?.roofU ?? 0.15;
  const floorU = overrides?.floorU ?? 0.22;
  const windowU = overrides?.windowU ?? 1.5;
  const wwr = overrides?.wwr ?? 0.4;

  return {
    source: "code-estimate",
    confidence: "estimated",
    codeYear: 2015,
    envelope: {
      walls: [
        { orientation: "N", uValue: wallU, rValue: 1 / wallU, layers: [], thermalBridge: 0.05, surfaceArea: 100 },
        { orientation: "S", uValue: wallU, rValue: 1 / wallU, layers: [], thermalBridge: 0.05, surfaceArea: 100 },
        { orientation: "E", uValue: wallU, rValue: 1 / wallU, layers: [], thermalBridge: 0.05, surfaceArea: 50 },
        { orientation: "W", uValue: wallU, rValue: 1 / wallU, layers: [], thermalBridge: 0.05, surfaceArea: 50 },
      ],
      roof: { uValue: roofU, layers: [], solarReflectance: 0.5, emissivity: 0.9, greenRoofCoverage: 0 },
      groundFloor: { uValue: floorU, layers: [], groundContactResistance: 0.5 },
      windows: {
        uValue: windowU,
        shgc: 0.35,
        vlt: 0.5,
        glassType: "double",
        coating: "low-e",
        gasFill: "argon",
        frameMaterial: "thermal-break-aluminum",
        airLeakageRate: 1.5,
        shadingCoefficient: 0.4,
        windowToWallRatio: { N: wwr, S: wwr, E: wwr, W: wwr },
      },
      foundation: { perimeterInsulationUValue: 0.3, groundTemperature: 13.5, moistureBarrier: "polyethylene" },
      airtightness: { ach50: 1.5, equivalentLeakageArea: 50, testMethod: "estimated" },
    },
    hvac: {
      heating: { systemType: "central", fuelType: "gas", efficiency: 87, capacity: 20 },
      cooling: { systemType: "split", efficiency: 3.5, capacity: 10 },
      ventilation: { type: "mechanical-exhaust", heatRecoveryEfficiency: 0, airflowRate: 0.5 },
      dhw: { systemType: "gas-boiler", efficiency: 85, storageVolume: 100 },
    },
    lighting: { lightingPowerDensity: 6, controlType: "manual", lampType: "led" },
    renewable: {
      solarPV: { installed: false, capacity: 0, panelType: "monocrystalline", tiltAngle: 30, orientation: 180, area: 0 },
      solarThermal: { installed: false, collectorArea: 0, efficiency: 0 },
      geothermal: { installed: false, systemType: "closed-loop", cop: 0 },
    },
    occupancy: { occupancyDensity: 0.04, weekdaySchedule: [], weekendSchedule: [], internalHeatGain: 3, hotWaterDemand: 40 },
  };
}

/** Helper: create a 15-floor apartment recipe (84m2 footprint ~ 11.2m x 7.5m) */
function makeApartmentRecipe(floorCount = 15): BuildingRecipe {
  const footprintWidth = 11.2;
  const footprintDepth = 7.5;
  const floorHeight = 2.9;
  const floors: FloorSpec[] = Array.from({ length: floorCount }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * floorHeight,
    height: floorHeight,
    isGroundFloor: i === 0,
  }));

  return {
    footprintWidth,
    footprintDepth,
    floors,
    totalHeight: floorCount * floorHeight,
    wallThickness: 0.332,
    era: "2010-2019",
    strctCd: "11",
    mainPurpsCd: "02000",
    facade: {
      windowWidth: 1.6, windowHeight: 1.8, sillHeight: 0.7, windowSpacing: 2.4,
      windowRatio: 0.35, mullionDepth: 0.08, mullionWidth: 0.05,
      glassInset: 0.03, solidPanelChance: 0.15, parapetHeight: 0.9, cornerInset: 0.05,
    },
    slab: { thickness: 0.2, overhang: 0 },
    column: { spacing: 6, size: 0.4, inset: 0.582 },
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
    siteWidth: 20,
    siteDepth: 15,
    buildingName: "Test Apartment",
    address: "Seoul",
  };
}

describe("calculateHeatLoss", () => {
  it("calculates reasonable total heat loss for 84m2 Korean apartment", () => {
    const materials = makeApartmentMaterials();
    const recipe = makeApartmentRecipe(15);
    const result = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);

    // Total heat loss for a 15-story apartment with modern insulation
    // Should be in a reasonable range (thousands of watts)
    expect(result.totalHeatLoss).toBeGreaterThan(1000);
    expect(result.totalHeatLoss).toBeLessThan(100000);

    // P2-01: 5 elements now — the air-exchange term joins the 4 envelope ones.
    expect(result.elements).toHaveLength(5);
    expect(result.elements.map((e) => e.element)).toEqual([
      "Walls",
      "Windows",
      "Roof",
      "Ground Floor",
      "Infiltration/Ventilation",
    ]);
  });

  // ── P2-01: infiltration / ventilation heat loss ──────────────────────────

  /** Mutate airtightness + ventilation on a fresh materials object. */
  function withAir(
    ach50: number,
    vent: MaterialProperties["hvac"]["ventilation"]
  ): MaterialProperties {
    const m = makeApartmentMaterials();
    m.envelope.airtightness.ach50 = ach50;
    m.hvac.ventilation = vent;
    return m;
  }

  it("adds an Infiltration/Ventilation element sized by Q = 0.34 × ACH × V × ΔT (P2-01 s1)", () => {
    const materials = withAir(3.0, { type: "natural", heatRecoveryEfficiency: 0, airflowRate: 0 });
    const recipe = makeApartmentRecipe(15);
    const result = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);

    const el = result.elements.find((e) => e.element === "Infiltration/Ventilation")!;
    expect(el).toBeDefined();

    // ACH = ach50/20 (natural leakage only) = 0.15; V = 84 m² × 43.5 m = 3654 m³
    const V = 11.2 * 7.5 * (15 * 2.9);
    const deltaT = 20 - -11.3;
    const expectedQ = 0.34 * (3.0 / 20) * V * deltaT;
    expect(el.heatLoss).toBeCloseTo(expectedQ, 1);
    // It contributes to the total.
    const envelopeOnly = result.elements
      .filter((e) => e.element !== "Infiltration/Ventilation")
      .reduce((s, e) => s + e.heatLoss, 0);
    expect(result.totalHeatLoss).toBeCloseTo(envelopeOnly + el.heatLoss, 1);
  });

  it("reduces the ventilation term when HRV recovers heat (P2-01 s2)", () => {
    const recipe = makeApartmentRecipe(15);
    const exhaust = withAir(1.5, { type: "mechanical-exhaust", heatRecoveryEfficiency: 0, airflowRate: 0.5 });
    const hrv = withAir(1.5, { type: "heat-recovery", heatRecoveryEfficiency: 0.8, airflowRate: 0.5 });

    const exhaustEl = calculateHeatLoss(exhaust, recipe, SEOUL_CLIMATE)
      .elements.find((e) => e.element === "Infiltration/Ventilation")!;
    const hrvEl = calculateHeatLoss(hrv, recipe, SEOUL_CLIMATE)
      .elements.find((e) => e.element === "Infiltration/Ventilation")!;

    // Same leakage, but the mechanical share is cut 80% by the HRV.
    expect(hrvEl.heatLoss).toBeLessThan(exhaustEl.heatLoss);
  });

  it("is zero and backward-compatible when airtightness and airflow are zero (P2-01 s3)", () => {
    const materials = withAir(0, { type: "natural", heatRecoveryEfficiency: 0, airflowRate: 0 });
    const recipe = makeApartmentRecipe(15);
    const result = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);

    const el = result.elements.find((e) => e.element === "Infiltration/Ventilation")!;
    expect(el.heatLoss).toBe(0);
    // Total equals the sum of the 4 envelope elements exactly.
    const envelopeOnly = result.elements
      .filter((e) => e.element !== "Infiltration/Ventilation")
      .reduce((s, e) => s + e.heatLoss, 0);
    expect(result.totalHeatLoss).toBeCloseTo(envelopeOnly, 6);
  });

  it("infiltration share of the standard fixture is a plausible fraction (P2-01 s4)", () => {
    const materials = makeApartmentMaterials(); // ach50 1.5, mech-exhaust 0.5
    const recipe = makeApartmentRecipe(15);
    const result = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);

    const el = result.elements.find((e) => e.element === "Infiltration/Ventilation")!;
    const share = el.heatLoss / result.totalHeatLoss;
    // Sanity band — a real, non-fabricated fraction of total loss.
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.45);
  });

  it("wall heat loss exceeds roof heat loss for typical apartment", () => {
    const materials = makeApartmentMaterials();
    const recipe = makeApartmentRecipe(15);
    const result = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);

    const wallLoss = result.elements.find((e) => e.element === "Walls")!.heatLoss;
    const roofLoss = result.elements.find((e) => e.element === "Roof")!.heatLoss;

    // Walls have much larger area than roof in a tall building
    expect(wallLoss).toBeGreaterThan(roofLoss);
  });

  it("window heat loss is significant due to high U-value", () => {
    const materials = makeApartmentMaterials();
    const recipe = makeApartmentRecipe(15);
    const result = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);

    const windowLoss = result.elements.find((e) => e.element === "Windows")!.heatLoss;
    const totalLoss = result.totalHeatLoss;

    // Windows typically account for 20-60% of total heat loss
    const windowPct = windowLoss / totalLoss;
    expect(windowPct).toBeGreaterThan(0.15);
    expect(windowPct).toBeLessThan(0.85);
  });

  it("handles zero floor area gracefully", () => {
    const materials = makeApartmentMaterials();
    const recipe = makeApartmentRecipe(0); // no floors
    recipe.totalHeight = 0;
    const result = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);

    // With no floors, totalFloorArea is 0, heatLossPerSqm should be 0
    expect(result.totalHeatLossPerSqm).toBe(0);
    for (const el of result.elements) {
      expect(el.heatLossPerSqm).toBe(0);
    }
  });

  it("uninsulated building has much higher heat loss than insulated", () => {
    const insulated = makeApartmentMaterials({ wallU: 0.15, roofU: 0.12, windowU: 0.9 });
    const uninsulated = makeApartmentMaterials({ wallU: 2.0, roofU: 1.5, windowU: 5.8 });
    const recipe = makeApartmentRecipe(5);

    const insResult = calculateHeatLoss(insulated, recipe, SEOUL_CLIMATE);
    const uninsResult = calculateHeatLoss(uninsulated, recipe, SEOUL_CLIMATE);

    // Uninsulated should be at least 3x the heat loss
    expect(uninsResult.totalHeatLoss).toBeGreaterThan(insResult.totalHeatLoss * 3);
  });

  it("deltaT uses Seoul winter design temperature correctly", () => {
    const materials = makeApartmentMaterials();
    const recipe = makeApartmentRecipe(1);

    // Seoul: indoorTemp=20, winterDesignTemp=-11.3, so deltaT=31.3
    const result = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
    // Wall heat loss = avgWallU * netWallArea * 31.3
    const wallEl = result.elements.find((e) => e.element === "Walls")!;
    // Verify it used the correct deltaT by back-calculating
    const expectedDeltaT = 20 - (-11.3); // 31.3
    const expectedWallHeatLoss = wallEl.uValue * wallEl.area * expectedDeltaT;
    expect(wallEl.heatLoss).toBeCloseTo(expectedWallHeatLoss, 1);
  });

  it("uses the CAD ring for wall area instead of the bounding box", () => {
    const materials = makeApartmentMaterials({ wwr: 0 });
    const box = makeApartmentRecipe(1);
    const triangle: BuildingRecipe = {
      ...box,
      footprintPolygon: [
        [
          [0, 0],
          [box.footprintWidth, 0],
          [0, box.footprintDepth],
        ],
      ],
    };
    const boxLoss = calculateHeatLoss(materials, box, SEOUL_CLIMATE);
    const triLoss = calculateHeatLoss(materials, triangle, SEOUL_CLIMATE);
    const boxWalls = boxLoss.elements.find((e) => e.element === "Walls")!;
    const triWalls = triLoss.elements.find((e) => e.element === "Walls")!;
    expect(triWalls.area).toBeLessThan(boxWalls.area);
    expect(triLoss.totalHeatLoss).toBeLessThan(boxLoss.totalHeatLoss);
  });
});
