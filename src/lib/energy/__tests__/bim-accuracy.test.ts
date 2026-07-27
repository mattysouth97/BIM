import { describe, it, expect } from "vitest";
import { calculateHeatLoss } from "../heat-loss";
import { calculateAnnualDemand } from "../annual-demand";
import { getEnergyGrade } from "../energy-grade";
import { calculateCO2 } from "../co2-emissions";
import { SEOUL_CLIMATE } from "../climate-data";
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";

/**
 * BIM accuracy benchmark tests against published Korean energy benchmarks.
 * Validates that the energy calculation pipeline produces realistic results
 * for three distinct performance tiers.
 */

/** Helper: create MaterialProperties with specific U-values */
function makeMaterials(params: {
  wallU: number;
  roofU: number;
  floorU: number;
  windowU: number;
  shgc: number;
  wwr: number;
  heatingEfficiency: number;
  coolingCOP: number;
}): MaterialProperties {
  return {
    source: "code-estimate",
    confidence: "estimated",
    codeYear: 2020,
    envelope: {
      walls: [
        { orientation: "N", uValue: params.wallU, rValue: 1 / params.wallU, layers: [], thermalBridge: 0.05, surfaceArea: 100 },
        { orientation: "S", uValue: params.wallU, rValue: 1 / params.wallU, layers: [], thermalBridge: 0.05, surfaceArea: 100 },
        { orientation: "E", uValue: params.wallU, rValue: 1 / params.wallU, layers: [], thermalBridge: 0.05, surfaceArea: 50 },
        { orientation: "W", uValue: params.wallU, rValue: 1 / params.wallU, layers: [], thermalBridge: 0.05, surfaceArea: 50 },
      ],
      roof: { uValue: params.roofU, layers: [], solarReflectance: 0.5, emissivity: 0.9, greenRoofCoverage: 0 },
      groundFloor: { uValue: params.floorU, layers: [], groundContactResistance: 0.5 },
      windows: {
        uValue: params.windowU,
        shgc: params.shgc,
        vlt: 0.5,
        glassType: "double",
        coating: "low-e",
        gasFill: "argon",
        frameMaterial: "thermal-break-aluminum",
        airLeakageRate: 1.5,
        shadingCoefficient: params.shgc * 0.87,
        windowToWallRatio: { N: params.wwr, S: params.wwr, E: params.wwr, W: params.wwr },
      },
      foundation: { perimeterInsulationUValue: 0.3, groundTemperature: 13.5, moistureBarrier: "polyethylene" },
      airtightness: { ach50: 1.5, equivalentLeakageArea: 50, testMethod: "estimated" },
    },
    hvac: {
      heating: { systemType: "central", fuelType: "gas", efficiency: params.heatingEfficiency, capacity: 20 },
      cooling: { systemType: "split", efficiency: params.coolingCOP, capacity: 10 },
      ventilation: { type: "heat-recovery", heatRecoveryEfficiency: 70, airflowRate: 0.5 },
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

/** Helper: create a standard recipe for benchmarking */
function makeRecipe(floorCount: number, floorHeight: number): BuildingRecipe {
  const footprintWidth = 11.2;
  const footprintDepth = 7.5;
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
    buildingName: "Benchmark",
    address: "Seoul",
  };
}

describe("BIM Energy Accuracy Benchmarks", () => {
  describe("Passive House Target (<60 kWh/m2/yr)", () => {
    // High-performance envelope: U-wall=0.15, U-roof=0.10, U-window=0.8, SHGC=0.4
    const materials = makeMaterials({
      wallU: 0.15,
      roofU: 0.10,
      floorU: 0.12,
      windowU: 0.8,
      shgc: 0.4,
      wwr: 0.3,
      heatingEfficiency: 95,  // high-efficiency gas boiler
      coolingCOP: 4.5,        // high-efficiency heat pump
    });
    const recipe = makeRecipe(5, 2.9);

    it("annual demand below 60 kWh/m2/yr", () => {
      const heatLoss = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
      const demand = calculateAnnualDemand(heatLoss, materials, recipe, SEOUL_CLIMATE);

      expect(demand.demandPerSqm).toBeLessThan(60);
      expect(demand.demandPerSqm).toBeGreaterThan(0);
    });

    it("gets energy grade 1+++ or 1++", () => {
      const heatLoss = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
      const demand = calculateAnnualDemand(heatLoss, materials, recipe, SEOUL_CLIMATE);
      const grade = getEnergyGrade(demand.demandPerSqm);

      expect(["1+++", "1++"]).toContain(grade);
    });

    it("has low CO2 emissions", () => {
      const heatLoss = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
      const demand = calculateAnnualDemand(heatLoss, materials, recipe, SEOUL_CLIMATE);
      const totalFloorArea = recipe.footprintWidth * recipe.footprintDepth * recipe.floors.length;
      const co2 = calculateCO2(demand, totalFloorArea);

      // Passive house: CO2/m2 should be low
      expect(co2.co2PerSqm).toBeLessThan(30); // kg CO2/m2/yr
      expect(co2.co2PerSqm).toBeGreaterThan(0);
    });
  });

  describe("Code-Minimum Building (2000s Korean code, moderate demand)", () => {
    // 2000s-era code-minimum envelope: worse U-values than 2020
    // U-wall=0.47, U-roof=0.29, U-window=2.1 (matching WALL_U_VALUES for 2000-2009)
    // 2-story building has higher envelope-to-floor ratio -> more demand/m2
    const materials = makeMaterials({
      wallU: 0.47,
      roofU: 0.29,
      floorU: 0.35,
      windowU: 2.1,
      shgc: 0.45,
      wwr: 0.35,
      heatingEfficiency: 85,  // standard gas boiler
      coolingCOP: 3.2,        // standard split AC
    });
    const recipe = makeRecipe(2, 3.0);

    it("annual demand between 90 and 200 kWh/m2/yr", () => {
      const heatLoss = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
      const demand = calculateAnnualDemand(heatLoss, materials, recipe, SEOUL_CLIMATE);

      // Code-minimum should be in the moderate range
      expect(demand.demandPerSqm).toBeGreaterThan(90);
      expect(demand.demandPerSqm).toBeLessThan(200);
    });

    it("gets energy grade 1+ to 2", () => {
      const heatLoss = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
      const demand = calculateAnnualDemand(heatLoss, materials, recipe, SEOUL_CLIMATE);
      const grade = getEnergyGrade(demand.demandPerSqm);

      expect(["1++", "1+", "1", "2"]).toContain(grade);
    });

    it("CO2 emissions are proportional to demand", () => {
      const heatLoss = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
      const demand = calculateAnnualDemand(heatLoss, materials, recipe, SEOUL_CLIMATE);
      const totalFloorArea = recipe.footprintWidth * recipe.footprintDepth * recipe.floors.length;
      const co2 = calculateCO2(demand, totalFloorArea);

      // CO2/m2 should scale with demand/m2
      expect(co2.co2PerSqm).toBeGreaterThan(25);
      expect(co2.co2PerSqm).toBeLessThan(100);
    });
  });

  describe("Old Uninsulated Building (1970s, >300 kWh/m2/yr)", () => {
    // Poor envelope: U-wall=2.0, U-roof=1.5, U-window=5.0
    const materials = makeMaterials({
      wallU: 2.0,
      roofU: 1.5,
      floorU: 1.2,
      windowU: 5.0,
      shgc: 0.82,
      wwr: 0.2,
      heatingEfficiency: 75,  // old boiler
      coolingCOP: 2.5,        // old AC
    });
    const recipe = makeRecipe(5, 2.9);

    it("annual demand exceeds 300 kWh/m2/yr", () => {
      const heatLoss = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
      const demand = calculateAnnualDemand(heatLoss, materials, recipe, SEOUL_CLIMATE);

      expect(demand.demandPerSqm).toBeGreaterThan(300);
    });

    it("gets energy grade 5 or worse", () => {
      const heatLoss = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
      const demand = calculateAnnualDemand(heatLoss, materials, recipe, SEOUL_CLIMATE);
      const grade = getEnergyGrade(demand.demandPerSqm);

      expect(["5", "6", "7"]).toContain(grade);
    });

    it("CO2 emissions are much higher than passive house", () => {
      const heatLoss = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
      const demand = calculateAnnualDemand(heatLoss, materials, recipe, SEOUL_CLIMATE);
      const totalFloorArea = recipe.footprintWidth * recipe.footprintDepth * recipe.floors.length;
      const co2 = calculateCO2(demand, totalFloorArea);

      // Old building: very high CO2/m2. With per-fuel factors the gas-heated
      // stock emits ~0.202 kg/kWh (not the 0.4594 grid factor), so the old
      // >100 threshold — an artifact of mispricing gas — becomes >60,
      // still 2×+ the passive-house bound of 30.
      expect(co2.co2PerSqm).toBeGreaterThan(60);
    });
  });

  describe("CO2 proportionality across tiers", () => {
    it("CO2 emissions scale proportionally with energy demand", () => {
      const recipe = makeRecipe(5, 2.9);
      const totalFloorArea = recipe.footprintWidth * recipe.footprintDepth * recipe.floors.length;

      // Passive house
      const passiveMat = makeMaterials({ wallU: 0.15, roofU: 0.10, floorU: 0.12, windowU: 0.8, shgc: 0.4, wwr: 0.3, heatingEfficiency: 95, coolingCOP: 4.5 });
      const passiveHL = calculateHeatLoss(passiveMat, recipe, SEOUL_CLIMATE);
      const passiveDemand = calculateAnnualDemand(passiveHL, passiveMat, recipe, SEOUL_CLIMATE);
      const passiveCO2 = calculateCO2(passiveDemand, totalFloorArea);

      // Old building
      const oldMat = makeMaterials({ wallU: 2.0, roofU: 1.5, floorU: 1.2, windowU: 5.0, shgc: 0.82, wwr: 0.2, heatingEfficiency: 75, coolingCOP: 2.5 });
      const oldHL = calculateHeatLoss(oldMat, recipe, SEOUL_CLIMATE);
      const oldDemand = calculateAnnualDemand(oldHL, oldMat, recipe, SEOUL_CLIMATE);
      const oldCO2 = calculateCO2(oldDemand, totalFloorArea);

      // Old building should have significantly higher CO2 than passive
      expect(oldCO2.totalCO2).toBeGreaterThan(passiveCO2.totalCO2 * 3);

      // With per-fuel factors CO2 is linear in the (heating, cooling) pair,
      // not in the total: heating rides gas (0.202), cooling the grid
      // (0.4594). The exact linear identity per fuel leg:
      const expectedRatio =
        (oldDemand.heatingDemand * 0.202 + oldDemand.coolingDemand * 0.4594) /
        (passiveDemand.heatingDemand * 0.202 +
          passiveDemand.coolingDemand * 0.4594);
      const co2Ratio = oldCO2.totalCO2 / passiveCO2.totalCO2;
      expect(co2Ratio).toBeCloseTo(expectedRatio, 5);
    });
  });

  describe("Energy grade thresholds are correctly applied", () => {
    it("boundary values get correct grades", () => {
      expect(getEnergyGrade(59)).toBe("1+++");
      expect(getEnergyGrade(60)).toBe("1++");
      expect(getEnergyGrade(89)).toBe("1++");
      expect(getEnergyGrade(90)).toBe("1+");
      expect(getEnergyGrade(119)).toBe("1+");
      expect(getEnergyGrade(120)).toBe("1");
      expect(getEnergyGrade(149)).toBe("1");
      expect(getEnergyGrade(150)).toBe("2");
      expect(getEnergyGrade(319)).toBe("5");
      expect(getEnergyGrade(320)).toBe("6");
      expect(getEnergyGrade(370)).toBe("7");
    });
  });
});
