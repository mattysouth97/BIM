import { describe, it, expect } from "vitest";
import { calculateAnnualDemand } from "../annual-demand";
import { calculateHeatLoss } from "../heat-loss";
import { SEOUL_CLIMATE } from "../climate-data";
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";

function makeMaterials(heatingEff = 87, coolingEff = 3.5): MaterialProperties {
  return {
    source: "code-estimate",
    confidence: "estimated",
    codeYear: 2015,
    envelope: {
      walls: [
        { orientation: "N", uValue: 0.26, rValue: 3.85, layers: [], thermalBridge: 0.05, surfaceArea: 100 },
        { orientation: "S", uValue: 0.26, rValue: 3.85, layers: [], thermalBridge: 0.05, surfaceArea: 100 },
        { orientation: "E", uValue: 0.26, rValue: 3.85, layers: [], thermalBridge: 0.05, surfaceArea: 50 },
        { orientation: "W", uValue: 0.26, rValue: 3.85, layers: [], thermalBridge: 0.05, surfaceArea: 50 },
      ],
      roof: { uValue: 0.15, layers: [], solarReflectance: 0.5, emissivity: 0.9, greenRoofCoverage: 0 },
      groundFloor: { uValue: 0.22, layers: [], groundContactResistance: 0.5 },
      windows: {
        uValue: 1.5,
        shgc: 0.35,
        vlt: 0.5,
        glassType: "double",
        coating: "low-e",
        gasFill: "argon",
        frameMaterial: "thermal-break-aluminum",
        airLeakageRate: 1.5,
        shadingCoefficient: 0.4,
        windowToWallRatio: { N: 0.4, S: 0.4, E: 0.4, W: 0.4 },
      },
      foundation: { perimeterInsulationUValue: 0.3, groundTemperature: 13.5, moistureBarrier: "polyethylene" },
      airtightness: { ach50: 1.5, equivalentLeakageArea: 50, testMethod: "estimated" },
    },
    hvac: {
      heating: { systemType: "central", fuelType: "gas", efficiency: heatingEff, capacity: 20 },
      cooling: { systemType: "split", efficiency: coolingEff, capacity: 10 },
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

function makeRecipe(floorCount = 15): BuildingRecipe {
  const w = 11.2;
  const d = 7.5;
  const fh = 2.9;
  const floors: FloorSpec[] = Array.from({ length: floorCount }, (_, i) => ({
    floorNo: i + 1,
    label: `${i + 1}F`,
    type: "above" as const,
    y: i * fh,
    height: fh,
    isGroundFloor: i === 0,
  }));

  return {
    footprintWidth: w,
    footprintDepth: d,
    floors,
    totalHeight: floorCount * fh,
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
      glass: { color: "#88BBDD", roughness: 0.1, metalness: 0.3 },
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

describe("calculateAnnualDemand", () => {
  it("produces demand in Korean benchmark range for 2010s apartment", () => {
    const materials = makeMaterials();
    const recipe = makeRecipe(15);
    const heatLoss = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
    const demand = calculateAnnualDemand(heatLoss, materials, recipe, SEOUL_CLIMATE);

    // Korean typical apartment: 80-250 kWh/m2/yr
    expect(demand.demandPerSqm).toBeGreaterThan(20);
    expect(demand.demandPerSqm).toBeLessThan(300);

    // Total demand should be positive
    expect(demand.totalDemand).toBeGreaterThan(0);
    expect(demand.heatingDemand).toBeGreaterThan(0);
    expect(demand.coolingDemand).toBeGreaterThan(0);
  });

  it("higher airtightness (leakier) raises heating demand (P2-01)", () => {
    const recipe = makeRecipe(15);
    const tight = makeMaterials();
    tight.envelope.airtightness.ach50 = 1.0;
    const leaky = makeMaterials();
    leaky.envelope.airtightness.ach50 = 8.0;

    const tightDemand = calculateAnnualDemand(
      calculateHeatLoss(tight, recipe, SEOUL_CLIMATE), tight, recipe, SEOUL_CLIMATE);
    const leakyDemand = calculateAnnualDemand(
      calculateHeatLoss(leaky, recipe, SEOUL_CLIMATE), leaky, recipe, SEOUL_CLIMATE);

    expect(leakyDemand.heatingDemand).toBeGreaterThan(tightDemand.heatingDemand);
  });

  it("HRV recovery lowers heating demand vs plain exhaust (P2-01)", () => {
    const recipe = makeRecipe(15);
    const exhaust = makeMaterials();
    exhaust.hvac.ventilation = { type: "mechanical-exhaust", heatRecoveryEfficiency: 0, airflowRate: 0.6 };
    const hrv = makeMaterials();
    hrv.hvac.ventilation = { type: "heat-recovery", heatRecoveryEfficiency: 0.75, airflowRate: 0.6 };

    const exhaustDemand = calculateAnnualDemand(
      calculateHeatLoss(exhaust, recipe, SEOUL_CLIMATE), exhaust, recipe, SEOUL_CLIMATE);
    const hrvDemand = calculateAnnualDemand(
      calculateHeatLoss(hrv, recipe, SEOUL_CLIMATE), hrv, recipe, SEOUL_CLIMATE);

    expect(hrvDemand.heatingDemand).toBeLessThan(exhaustDemand.heatingDemand);
  });

  it("heating demand exceeds cooling demand for Seoul climate", () => {
    const materials = makeMaterials();
    const recipe = makeRecipe(15);
    const heatLoss = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
    const demand = calculateAnnualDemand(heatLoss, materials, recipe, SEOUL_CLIMATE);

    // Seoul has cold winters (HDD=2700) vs mild summers (CDD=600)
    expect(demand.heatingDemand).toBeGreaterThan(demand.coolingDemand);
  });

  it("lower heating efficiency increases heating demand", () => {
    const recipe = makeRecipe(15);

    const efficient = makeMaterials(95, 3.5);
    const inefficient = makeMaterials(80, 3.5);

    const hlEfficient = calculateHeatLoss(efficient, recipe, SEOUL_CLIMATE);
    const hlInefficient = calculateHeatLoss(inefficient, recipe, SEOUL_CLIMATE);

    const demandEff = calculateAnnualDemand(hlEfficient, efficient, recipe, SEOUL_CLIMATE);
    const demandIneff = calculateAnnualDemand(hlInefficient, inefficient, recipe, SEOUL_CLIMATE);

    // Lower efficiency (80%) should result in higher demand than higher efficiency (95%)
    expect(demandIneff.heatingDemand).toBeGreaterThan(demandEff.heatingDemand);
  });

  it("total floor area scales with floor count", () => {
    const materials = makeMaterials();
    const recipe5 = makeRecipe(5);
    const recipe15 = makeRecipe(15);

    const hl5 = calculateHeatLoss(materials, recipe5, SEOUL_CLIMATE);
    const hl15 = calculateHeatLoss(materials, recipe15, SEOUL_CLIMATE);

    const demand5 = calculateAnnualDemand(hl5, materials, recipe5, SEOUL_CLIMATE);
    const demand15 = calculateAnnualDemand(hl15, materials, recipe15, SEOUL_CLIMATE);

    // Total demand should increase with more floors
    expect(demand15.totalDemand).toBeGreaterThan(demand5.totalDemand);
  });

  it("handles zero floor area", () => {
    const materials = makeMaterials();
    const recipe = makeRecipe(0);
    recipe.totalHeight = 0;
    const heatLoss = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
    const demand = calculateAnnualDemand(heatLoss, materials, recipe, SEOUL_CLIMATE);

    expect(demand.demandPerSqm).toBe(0);
    expect(demand.totalDemand).toBe(0);
  });
});
