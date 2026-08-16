// src/lib/energy/__tests__/eco2-export.test.ts
// Vitest coverage for STD-02 SC1/SC2/SC3
// SC1: sub-system fields present in exported JSON
// SC2: provenance labeling with dataSource "estimated-inferred"
// SC3: envelope-only backward compatibility (no subSystems key when not passed)

import { describe, it, expect } from "vitest";
import { generateECO2Input, buildSubSystems } from "../eco2-export";
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { EnergyMetrics } from "@/hooks/use-energy-metrics";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeMaterials(): MaterialProperties {
  return {
    source: "code-estimate",
    confidence: "estimated",
    codeYear: 2010,
    envelope: {
      walls: [
        {
          orientation: "N",
          uValue: 0.36,
          rValue: 2.78,
          layers: [
            {
              name: "Concrete",
              thickness: 0.2,
              thermalConductivity: 1.7,
              density: 2300,
              specificHeat: 840,
            },
          ],
          thermalBridge: 0.02,
          surfaceArea: 40,
        },
      ],
      roof: {
        uValue: 0.25,
        layers: [],
        solarReflectance: 0.3,
        emissivity: 0.9,
        greenRoofCoverage: 0,
      },
      groundFloor: {
        uValue: 0.45,
        layers: [],
        groundContactResistance: 0.5,
      },
      windows: {
        uValue: 1.5,
        shgc: 0.4,
        vlt: 0.7,
        glassType: "double",
        coating: "low-e",
        gasFill: "argon",
        frameMaterial: "thermal-break-aluminum",
        airLeakageRate: 0.3,
        shadingCoefficient: 0.46,
        windowToWallRatio: { N: 0.3, S: 0.4, E: 0.25, W: 0.25 },
      },
      foundation: {
        perimeterInsulationUValue: 0.5,
        groundTemperature: 12,
        moistureBarrier: "polyethylene",
      },
      airtightness: {
        ach50: 5,
        equivalentLeakageArea: 250,
        testMethod: "estimated",
      },
    },
    hvac: {
      heating: {
        systemType: "individual",
        fuelType: "gas",
        efficiency: 85,
        capacity: 20,
      },
      cooling: {
        systemType: "split",
        efficiency: 3.0,
        capacity: 15,
      },
      ventilation: {
        type: "natural",
        heatRecoveryEfficiency: 0,
        airflowRate: 0.5,
      },
      dhw: {
        systemType: "gas-boiler",
        efficiency: 80,
        storageVolume: 100,
      },
    },
    lighting: {
      lightingPowerDensity: 10,
      controlType: "manual",
      lampType: "led",
    },
    renewable: {
      solarPV: {
        installed: false,
        capacity: 0,
        panelType: "monocrystalline",
        tiltAngle: 30,
        orientation: 180,
        area: 0,
      },
      solarThermal: {
        installed: false,
        collectorArea: 0,
        efficiency: 0,
      },
      geothermal: {
        installed: false,
        systemType: "closed-loop",
        cop: 0,
      },
    },
    occupancy: {
      occupancyDensity: 0.1,
      weekdaySchedule: Array(24).fill(0.5),
      weekendSchedule: Array(24).fill(0.1),
      internalHeatGain: 5,
      hotWaterDemand: 10,
    },
  };
}

function makeRecipe(): BuildingRecipe {
  return {
    footprintWidth: 20,
    footprintDepth: 15,
    floors: [
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 3, isGroundFloor: true },
      { floorNo: 2, label: "2F", type: "above", y: 3, height: 3, isGroundFloor: false },
    ],
    totalHeight: 6,
    wallThickness: 0.2,
    era: "2010-2019",
    strctCd: "11",
    mainPurpsCd: "02000",
    facade: {
      windowWidth: 1.5,
      windowHeight: 1.8,
      sillHeight: 0.9,
      windowSpacing: 0.6,
      windowRatio: 0.35,
      mullionDepth: 0.08,
      mullionWidth: 0.05,
      glassInset: 0.03,
      solidPanelChance: 0.1,
      parapetHeight: 0.6,
      cornerInset: 0.1,
    },
    slab: { thickness: 0.25, overhang: 0.3 },
    column: { spacing: 6, size: 0.5, inset: 0.1 },
    roof: {
      type: "flat",
      flatThickness: 0.3,
      gableHeight: 0,
      hipInset: 0,
    },
    materials: {
      wall: { color: "#B8B0A8", roughness: 0.9, metalness: 0.0 },
      glass: { color: "#88BBCC", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.4 },
      mullion: { color: "#888888", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#A0A0A0", roughness: 0.8, metalness: 0.0 },
      column: { color: "#909090", roughness: 0.85, metalness: 0.0 },
      roof: { color: "#707070", roughness: 0.9, metalness: 0.0 },
      groundFloor: { color: "#A8A0A0", roughness: 0.8, metalness: 0.0 },
    },
    siteWidth: 30,
    siteDepth: 25,
    buildingName: "Test Building",
    address: "Seoul",
  };
}

function makeMetrics(): EnergyMetrics {
  return {
    heatLoss: {
      elements: [
        { element: "Walls", area: 80, uValue: 0.36, hCoefficient: 28.8, deltaT: 41.7, heatLoss: 1200, heatLossPerSqm: 4 },
        { element: "Windows", area: 24, uValue: 1.5, hCoefficient: 36, deltaT: 22.2, heatLoss: 800, heatLossPerSqm: 2.7 },
        { element: "Roof", area: 300, uValue: 0.25, hCoefficient: 75, deltaT: 6.67, heatLoss: 500, heatLossPerSqm: 1.67 },
        { element: "Ground Floor", area: 300, uValue: 0.45, hCoefficient: 135, deltaT: 2.96, heatLoss: 400, heatLossPerSqm: 1.33 },
      ],
      totalHeatLoss: 2900,
      totalHeatLossPerSqm: 9.7,
    },
    demand: {
      heatingDemand: 45000,
      coolingDemand: 18000,
      totalDemand: 63000,
      demandPerSqm: 105,
    },
    grade: "3",
    gradeColor: "#FFA500",
    // P1-05 field — fixture value (kWh/m²·yr primary energy), grade-3 band
    primaryEnergyPerArea: 230,
    primaryPerSqm: 230,
    siteTotal: 90000,
    breakdown: {
      hvac: 63000,
      lighting: 12000,
      dhw: 8000,
      plugLoads: 7000,
      total: 90000,
      perFloor: [45000, 45000],
      hvacDataSource: "estimated-ratio",
      lightingDataSource: "estimated-ratio",
      dhwDataSource: "estimated-ratio",
      plugLoadsDataSource: "estimated-ratio",
    },
    co2: {
      totalCO2: 28.95,
      co2PerSqm: 48.25,
      // P2-02 CO2Result split — fixture values, electric-dominant office
      electricCO2: 20.0,
      fossilCO2: 8.95,
    },
    predictedVsActualDelta: null,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateECO2Input", () => {
  describe("SC3 — envelope-only backward compatibility", () => {
    it("omits subSystems key when no extra arg is passed", () => {
      const json = generateECO2Input(makeMaterials(), makeRecipe(), makeMetrics());
      const parsed = JSON.parse(json) as Record<string, unknown>;
      expect(parsed).not.toHaveProperty("subSystems");
    });

    it("retains all core sections when called without extra arg", () => {
      const json = generateECO2Input(makeMaterials(), makeRecipe(), makeMetrics());
      const parsed = JSON.parse(json) as Record<string, unknown>;
      expect(parsed).toHaveProperty("envelope");
      expect(parsed).toHaveProperty("hvac");
      expect(parsed).toHaveProperty("lighting");
      expect(parsed).toHaveProperty("calculated");
    });
  });

  describe("SC1 — sub-system field presence", () => {
    it("includes HVAC heating/cooling/DHW system types and lighting power density", () => {
      const materials = makeMaterials();
      const subSystems = buildSubSystems(materials);
      const json = generateECO2Input(materials, makeRecipe(), makeMetrics(), { subSystems });
      const parsed = JSON.parse(json) as {
        subSystems: {
          hvac: {
            heatingSystemType: string;
            coolingSystemType: string;
            dhwSystemType: string;
            dataSource: string;
          };
          lighting: {
            lightingPowerDensity_Wm2: number;
            dataSource: string;
          };
        };
      };
      expect(parsed.subSystems).toBeDefined();
      expect(parsed.subSystems.hvac.heatingSystemType).toBeTruthy();
      expect(parsed.subSystems.hvac.coolingSystemType).toBeTruthy();
      expect(parsed.subSystems.hvac.dhwSystemType).toBeTruthy();
      expect(parsed.subSystems.lighting.lightingPowerDensity_Wm2).toBeGreaterThan(0);
    });
  });

  describe("SC2 — provenance labeling", () => {
    it("stamps every sub-system block with dataSource 'estimated-inferred'", () => {
      const materials = makeMaterials();
      const subSystems = buildSubSystems(materials);
      const json = generateECO2Input(materials, makeRecipe(), makeMetrics(), { subSystems });
      const parsed = JSON.parse(json) as {
        subSystems: {
          hvac: { dataSource: string };
          lighting: { dataSource: string };
          metadata: { inferenceNote: string; inferenceTimestamp: string };
        };
      };
      expect(parsed.subSystems.hvac.dataSource).toBe("estimated-inferred");
      expect(parsed.subSystems.lighting.dataSource).toBe("estimated-inferred");
    });

    it("emits inferenceNote string and ISO-8601 inferenceTimestamp", () => {
      const materials = makeMaterials();
      const subSystems = buildSubSystems(materials);
      const json = generateECO2Input(materials, makeRecipe(), makeMetrics(), { subSystems });
      const parsed = JSON.parse(json) as {
        subSystems: {
          metadata: { inferenceNote: string; inferenceTimestamp: string };
        };
      };
      expect(typeof parsed.subSystems.metadata.inferenceNote).toBe("string");
      expect(parsed.subSystems.metadata.inferenceNote.length).toBeGreaterThan(0);
      expect(parsed.subSystems.metadata.inferenceTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
