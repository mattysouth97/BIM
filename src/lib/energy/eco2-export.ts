// src/lib/energy/eco2-export.ts
// Generate ECO2-compatible JSON input file from building data.

import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { EnergyMetrics } from "@/hooks/use-energy-metrics";

interface ECO2InputData {
  version: string;
  generatedAt: string;
  building: {
    name: string;
    floorCount: number;
    totalFloorArea: number;
    footprintWidth: number;
    footprintDepth: number;
    totalHeight: number;
  };
  envelope: {
    walls: {
      avgUValue: number;
      orientations: { direction: string; uValue: number; surfaceArea: number }[];
    };
    roof: {
      uValue: number;
      solarReflectance: number;
      emissivity: number;
    };
    groundFloor: {
      uValue: number;
      groundContactResistance: number;
    };
    windows: {
      uValue: number;
      shgc: number;
      vlt: number;
      glassType: string;
      coating: string;
      gasFill: string;
      frameMaterial: string;
      windowToWallRatio: { N: number; S: number; E: number; W: number };
    };
    airtightness: {
      ach50: number;
      testMethod: string;
    };
  };
  hvac: {
    heating: {
      systemType: string;
      fuelType: string;
      efficiency: number;
      capacity: number;
    };
    cooling: {
      systemType: string;
      efficiency: number;
      capacity: number;
    };
    ventilation: {
      type: string;
      heatRecoveryEfficiency: number;
      airflowRate: number;
    };
    dhw: {
      systemType: string;
      efficiency: number;
      storageVolume: number;
    };
  };
  lighting: {
    lightingPowerDensity: number;
    controlType: string;
    lampType: string;
  };
  calculated: {
    totalHeatLoss_W: number;
    heatLossPerSqm_W: number;
    heatingDemand_kWh: number;
    coolingDemand_kWh: number;
    totalDemand_kWh: number;
    demandPerSqm_kWh: number;
    energyGrade: string;
    co2Total_tCO2: number;
    co2PerSqm_kgCO2: number;
    heatLossBreakdown: { element: string; heatLoss_W: number; percentage: number }[];
  };
}

/**
 * Generate ECO2-compatible JSON string from building data.
 */
export function generateECO2Input(
  materials: MaterialProperties,
  recipe: BuildingRecipe,
  metrics: EnergyMetrics
): string {
  const totalFloorArea =
    recipe.footprintWidth * recipe.footprintDepth * recipe.floors.length;
  const totalHL = metrics.heatLoss.totalHeatLoss;

  const data: ECO2InputData = {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    building: {
      name: recipe.buildingName ?? "Unknown",
      floorCount: recipe.floors.length,
      totalFloorArea,
      footprintWidth: recipe.footprintWidth,
      footprintDepth: recipe.footprintDepth,
      totalHeight: recipe.totalHeight,
    },
    envelope: {
      walls: {
        avgUValue:
          materials.envelope.walls.length > 0
            ? materials.envelope.walls.reduce((s, w) => s + w.uValue, 0) /
              materials.envelope.walls.length
            : 0,
        orientations: materials.envelope.walls.map((w) => ({
          direction: w.orientation,
          uValue: w.uValue,
          surfaceArea: w.surfaceArea,
        })),
      },
      roof: {
        uValue: materials.envelope.roof.uValue,
        solarReflectance: materials.envelope.roof.solarReflectance,
        emissivity: materials.envelope.roof.emissivity,
      },
      groundFloor: {
        uValue: materials.envelope.groundFloor.uValue,
        groundContactResistance:
          materials.envelope.groundFloor.groundContactResistance,
      },
      windows: {
        uValue: materials.envelope.windows.uValue,
        shgc: materials.envelope.windows.shgc,
        vlt: materials.envelope.windows.vlt,
        glassType: materials.envelope.windows.glassType,
        coating: materials.envelope.windows.coating,
        gasFill: materials.envelope.windows.gasFill,
        frameMaterial: materials.envelope.windows.frameMaterial,
        windowToWallRatio: { ...materials.envelope.windows.windowToWallRatio },
      },
      airtightness: {
        ach50: materials.envelope.airtightness.ach50,
        testMethod: materials.envelope.airtightness.testMethod,
      },
    },
    hvac: {
      heating: {
        systemType: materials.hvac.heating.systemType,
        fuelType: materials.hvac.heating.fuelType,
        efficiency: materials.hvac.heating.efficiency,
        capacity: materials.hvac.heating.capacity,
      },
      cooling: {
        systemType: materials.hvac.cooling.systemType,
        efficiency: materials.hvac.cooling.efficiency,
        capacity: materials.hvac.cooling.capacity,
      },
      ventilation: {
        type: materials.hvac.ventilation.type,
        heatRecoveryEfficiency:
          materials.hvac.ventilation.heatRecoveryEfficiency,
        airflowRate: materials.hvac.ventilation.airflowRate,
      },
      dhw: {
        systemType: materials.hvac.dhw.systemType,
        efficiency: materials.hvac.dhw.efficiency,
        storageVolume: materials.hvac.dhw.storageVolume,
      },
    },
    lighting: {
      lightingPowerDensity: materials.lighting.lightingPowerDensity,
      controlType: materials.lighting.controlType,
      lampType: materials.lighting.lampType,
    },
    calculated: {
      totalHeatLoss_W: metrics.heatLoss.totalHeatLoss,
      heatLossPerSqm_W: metrics.heatLoss.totalHeatLossPerSqm,
      heatingDemand_kWh: metrics.demand.heatingDemand,
      coolingDemand_kWh: metrics.demand.coolingDemand,
      totalDemand_kWh: metrics.demand.totalDemand,
      demandPerSqm_kWh: metrics.demand.demandPerSqm,
      energyGrade: metrics.grade,
      co2Total_tCO2: metrics.co2.totalCO2,
      co2PerSqm_kgCO2: metrics.co2.co2PerSqm,
      heatLossBreakdown: metrics.heatLoss.elements.map((el) => ({
        element: el.element,
        heatLoss_W: el.heatLoss,
        percentage: totalHL > 0 ? (el.heatLoss / totalHL) * 100 : 0,
      })),
    },
  };

  return JSON.stringify(data, null, 2);
}

/**
 * Trigger a file download with the given content.
 */
export function downloadECO2File(content: string, fileName: string): void {
  const blob = new Blob([content], {
    type: "application/json;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
