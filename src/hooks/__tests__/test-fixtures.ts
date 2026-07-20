// src/hooks/__tests__/test-fixtures.ts
// P1-08 — shared building fixtures for hook tests (materials + recipe).
// Values mirror src/lib/energy/__tests__/system-breakdown.test.ts.

import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe, FloorSpec } from "@/lib/procedural/types";

export function makeMaterials(heatingEff = 87, coolingEff = 3.5): MaterialProperties {
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

export function makeRecipe(floorCount = 10, mainPurpsCd = "02000"): BuildingRecipe {
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
    mainPurpsCd,
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
    buildingName: "Test Building",
    address: "Seoul",
  };
}

/** GeoJSON-style triangle footprint rings in local meters. */
export const TRIANGLE_RINGS: [number, number][][] = [
  [
    [0, 0],
    [10, 0],
    [5, 8],
  ],
];
