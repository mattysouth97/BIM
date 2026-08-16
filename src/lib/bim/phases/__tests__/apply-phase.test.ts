import { describe, it, expect } from "vitest";
import type { MaterialProperties } from "@/lib/material-types";
import { KOREAN_2020_TARGET_U_VALUES } from "@/lib/retrofit/envelope-retrofits";
import { applyPhaseToMaterials } from "../apply-phase";

function makeMaterials(): MaterialProperties {
  return {
    source: "code-estimate",
    confidence: "estimated",
    codeYear: 1995,
    envelope: {
      walls: [
        { orientation: "N", uValue: 0.8, rValue: 1.25, layers: [], thermalBridge: 0.1, surfaceArea: 100 },
      ],
      roof: { uValue: 0.6, layers: [], solarReflectance: 0.3, emissivity: 0.9, greenRoofCoverage: 0 },
      groundFloor: { uValue: 0.7, layers: [], groundContactResistance: 0.4 },
      windows: {
        uValue: 3.2,
        shgc: 0.6,
        vlt: 0.7,
        glassType: "single",
        coating: "none",
        gasFill: "air",
        frameMaterial: "aluminum",
        airLeakageRate: 4,
        shadingCoefficient: 0.7,
        windowToWallRatio: { N: 0.3, S: 0.3, E: 0.3, W: 0.3 },
      },
      foundation: { perimeterInsulationUValue: 0.5, groundTemperature: 13, moistureBarrier: "none" },
      airtightness: { ach50: 8, equivalentLeakageArea: 120, testMethod: "estimated" },
    },
    hvac: {
      heating: { systemType: "central", fuelType: "gas", efficiency: 0.8, capacity: 100 },
      cooling: { systemType: "split", efficiency: 2.8, capacity: 80 },
      ventilation: { type: "natural", heatRecoveryEfficiency: 0, airflowRate: 0.3 },
      dhw: { systemType: "gas-boiler", efficiency: 0.75, storageVolume: 200 },
    },
    lighting: { lightingPowerDensity: 12, controlType: "manual", lampType: "fluorescent" },
    renewable: {
      solarPV: { installed: false, capacity: 0, panelType: "monocrystalline", tiltAngle: 30, orientation: 180, area: 0 },
      solarThermal: { installed: false, collectorArea: 0, efficiency: 0 },
      geothermal: { installed: false, systemType: "closed-loop", cop: 0 },
    },
    occupancy: { occupancyDensity: 0.1, weekdaySchedule: [], weekendSchedule: [], internalHeatGain: 4, hotWaterDemand: 20 },
  };
}

describe("applyPhaseToMaterials", () => {
  it("leaves existing phase untouched (same reference)", () => {
    const materials = makeMaterials();
    expect(applyPhaseToMaterials(materials, "existing")).toBe(materials);
  });

  it("applies all 2020 envelope targets when measure ids are omitted", () => {
    const next = applyPhaseToMaterials(makeMaterials(), "retrofit");
    expect(next.envelope.walls[0].uValue).toBe(KOREAN_2020_TARGET_U_VALUES.wall);
    expect(next.envelope.windows.uValue).toBe(KOREAN_2020_TARGET_U_VALUES.window);
    expect(next.envelope.windows.glassType).toBe("triple");
    expect(next.envelope.roof.uValue).toBe(KOREAN_2020_TARGET_U_VALUES.roof);
    expect(next.envelope.groundFloor.uValue).toBe(KOREAN_2020_TARGET_U_VALUES.floor);
  });

  it("applies only the selected measures", () => {
    const next = applyPhaseToMaterials(makeMaterials(), "retrofit", [
      "envelope-window-replacement",
    ]);
    expect(next.envelope.windows.uValue).toBe(KOREAN_2020_TARGET_U_VALUES.window);
    expect(next.envelope.walls[0].uValue).toBe(0.8);
    expect(next.envelope.roof.uValue).toBe(0.6);
  });

  it("does not mutate the source", () => {
    const materials = makeMaterials();
    applyPhaseToMaterials(materials, "retrofit");
    expect(materials.envelope.walls[0].uValue).toBe(0.8);
  });
});
