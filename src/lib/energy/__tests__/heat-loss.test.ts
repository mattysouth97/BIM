import { describe, it, expect } from "vitest";
import { calculateHeatLoss } from "../heat-loss";
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";
import type { ClimateData } from "../climate-data";
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

    // Should have 4 elements: Walls, Windows, Roof, Ground Floor
    expect(result.elements).toHaveLength(4);
    expect(result.elements.map((e) => e.element)).toEqual([
      "Walls",
      "Windows",
      "Roof",
      "Ground Floor",
    ]);
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
});
