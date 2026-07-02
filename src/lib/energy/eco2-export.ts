// src/lib/energy/eco2-export.ts
// Generate ECO2-compatible JSON input file from building data.

import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { EnergyMetrics } from "@/hooks/use-energy-metrics";
import type { AnnualConsumption } from "@/lib/energy/consumption-normalizer";
import type { PrimaryEnergyResult } from "@/lib/energy/primary-energy";
import type { BenchmarkResult } from "@/lib/energy/benchmark-comparison";
import type { EnergyDataSource } from "@/lib/energy/system-breakdown";
import {
  getHeatingSystemTypeCode,
  getCoolingSystemTypeCode,
  getDhwSystemTypeCode,
} from "@/lib/energy/eco2-hvac-codes";

export interface RetrofitScenario {
  description: string;
  energySaving: number;
  costSaving: number;
}

/**
 * Phase 27: Inferred sub-system data fields for ECO2 auditors (STD-02).
 * Fields read verbatim from materials — not re-derived from era.
 * dataSource uses EnergyDataSource from system-breakdown.ts (NOT EquipmentDataSource).
 *
 * HVAC system type string → ECO2/KS F 1900-style code mapping is provided by
 * src/lib/energy/eco2-hvac-codes.ts (heatingSystemTypeCode/coolingSystemTypeCode/
 * dhwSystemTypeCode below). PROVISIONAL — pending GX auditor sign-off (plan
 * risk R3); KS F 1900 is paywalled. Unknown values resolve to "UNKNOWN".
 */
export interface ECO2SubSystems {
  hvac: {
    heatingSystemType: string;       // from materials.hvac.heating.systemType
    coolingSystemType: string;       // from materials.hvac.cooling.systemType
    heatingFuelType: string;         // from materials.hvac.heating.fuelType
    heatingEfficiency: number;       // COP or %
    coolingEfficiency: number;       // COP
    dhwSystemType: string;           // from materials.hvac.dhw.systemType
    dhwEfficiency: number;           // from materials.hvac.dhw.efficiency
    /** Provisional ECO2/KS F 1900-style code for heatingSystemType (see eco2-hvac-codes.ts) */
    heatingSystemTypeCode: string;
    /** Provisional ECO2/KS F 1900-style code for coolingSystemType (see eco2-hvac-codes.ts) */
    coolingSystemTypeCode: string;
    /** Provisional ECO2/KS F 1900-style code for dhwSystemType (see eco2-hvac-codes.ts) */
    dhwSystemTypeCode: string;
    dataSource: EnergyDataSource;
    standardRef: "KS B 6364";
  };
  lighting: {
    lightingPowerDensity_Wm2: number; // from materials.lighting.lightingPowerDensity (W/m²)
    lampType: string;                 // from materials.lighting.lampType
    controlType: string;              // from materials.lighting.controlType
    dataSource: EnergyDataSource;
    standardRef: "KSC IEC 62301";
  };
  metadata: {
    inferenceNote: string;       // human-readable provenance warning
    inferenceTimestamp: string;  // ISO-8601
  };
}

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
  /** Actual measured consumption data when available */
  actualConsumption?: AnnualConsumption[];
  /** Ratio of actual to predicted energy (actual / predicted). >1 means building uses more than predicted. */
  calibrationRatio?: number;
  /** Primary energy values using Korean MOTIE/KEMCO conversion factors */
  primaryEnergy?: PrimaryEnergyResult;
  /** Where this building ranks vs peer buildings (0–100 percentile) */
  benchmarkPercentile?: number;
  /** Top retrofit scenarios ordered by energy saving potential */
  retrofitScenarios?: RetrofitScenario[];
  /** Phase 27: inferred sub-system data fields for ECO2 auditors (STD-02) */
  subSystems?: ECO2SubSystems;
}

export interface ECO2ExtraOptions {
  /** Actual measured consumption records (from consumption-normalizer) */
  actualConsumption?: AnnualConsumption[];
  /** Actual / predicted ratio from calibration */
  calibrationRatio?: number;
  /** Primary energy breakdown using Korean conversion factors */
  primaryEnergy?: PrimaryEnergyResult;
  /** Benchmark result containing percentile */
  benchmarkResult?: BenchmarkResult;
  /** Top 3 retrofit scenarios ordered by energy saving potential */
  retrofitScenarios?: RetrofitScenario[];
  /** Phase 27: inferred sub-system data fields (HVAC type, LPD, DHW) — STD-02 */
  subSystems?: ECO2SubSystems;
}

/**
 * Generate ECO2-compatible JSON string from building data.
 */
export function generateECO2Input(
  materials: MaterialProperties,
  recipe: BuildingRecipe,
  metrics: EnergyMetrics,
  extra?: ECO2ExtraOptions
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
    ...(extra?.actualConsumption !== undefined && {
      actualConsumption: extra.actualConsumption,
    }),
    ...(extra?.calibrationRatio !== undefined && {
      calibrationRatio: extra.calibrationRatio,
    }),
    ...(extra?.primaryEnergy !== undefined && {
      primaryEnergy: extra.primaryEnergy,
    }),
    ...(extra?.benchmarkResult !== undefined && {
      benchmarkPercentile: extra.benchmarkResult.percentile,
    }),
    ...(extra?.retrofitScenarios !== undefined && {
      retrofitScenarios: extra.retrofitScenarios.slice(0, 3),
    }),
    ...(extra?.subSystems !== undefined && {
      subSystems: extra.subSystems,
    }),
  };

  return JSON.stringify(data, null, 2);
}

/**
 * Build the ECO2 sub-systems block from materials.
 * Pure synchronous helper — reads materials.hvac.* and materials.lighting.* verbatim.
 * No era re-derivation (Pitfall 2 guard). Stamps dataSource: "estimated-inferred" (STD-02).
 */
export function buildSubSystems(materials: MaterialProperties): ECO2SubSystems {
  return {
    hvac: {
      heatingSystemType:   materials.hvac.heating.systemType,
      coolingSystemType:   materials.hvac.cooling.systemType,
      heatingFuelType:     materials.hvac.heating.fuelType,
      heatingEfficiency:   materials.hvac.heating.efficiency,
      coolingEfficiency:   materials.hvac.cooling.efficiency,
      dhwSystemType:       materials.hvac.dhw.systemType,
      dhwEfficiency:       materials.hvac.dhw.efficiency,
      heatingSystemTypeCode: getHeatingSystemTypeCode(materials.hvac.heating.systemType).code,
      coolingSystemTypeCode: getCoolingSystemTypeCode(materials.hvac.cooling.systemType).code,
      dhwSystemTypeCode:     getDhwSystemTypeCode(materials.hvac.dhw.systemType).code,
      dataSource:          "estimated-inferred",
      standardRef:         "KS B 6364",
    },
    lighting: {
      lightingPowerDensity_Wm2: materials.lighting.lightingPowerDensity,
      lampType:                 materials.lighting.lampType,
      controlType:              materials.lighting.controlType,
      dataSource:               "estimated-inferred",
      standardRef:              "KSC IEC 62301",
    },
    metadata: {
      inferenceNote:      "Fields inferred from building era and Korean building codes (KS B 6364, KSC IEC 62301). Not measured data.",
      inferenceTimestamp: new Date().toISOString(),
    },
  };
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
