// src/lib/export/json-export.ts
// Export full digital twin dataset as structured JSON.
// Pure functions — no React, no side effects.

import type { BuildingRecipe } from "@/lib/procedural/types";
import type { MaterialProperties } from "@/lib/material-types";
import type { EnergyMetrics } from "@/hooks/use-energy-metrics";
import type { RetrofitScenario } from "@/lib/energy/eco2-export";
import type { BenchmarkResult } from "@/lib/energy/benchmark-comparison";
import type { PrimaryEnergyResult } from "@/lib/energy/primary-energy";

export interface FidelityReport {
  level: number;
  dataQualityScore: number;
  missingFields?: string[];
  notes?: string;
}

export interface CampusData {
  siteId: string;
  buildingIds: string[];
  totalArea: number;
  totalEnergyDemand: number;
}

export interface TwinExportData {
  /** Building metadata (name, address, use type, era) */
  metadata: {
    buildingPk: string;
    name: string;
    address: string;
    useType: string;
    era: string;
    exportedAt?: string;
  };
  /** Full procedural generation recipe */
  recipe: BuildingRecipe;
  /** Material and system properties */
  materials: MaterialProperties;
  /** Computed energy metrics */
  energyMetrics: EnergyMetrics;
  /** Primary energy breakdown (optional) */
  primaryEnergy?: PrimaryEnergyResult;
  /** Retrofit improvement scenarios (optional) */
  retrofitRecommendations?: RetrofitScenario[];
  /** Benchmark comparison result (optional) */
  benchmarkResult?: BenchmarkResult;
  /** Data fidelity report (optional) */
  fidelityReport?: FidelityReport;
  /** Campus / site aggregate data (optional) */
  campusData?: CampusData;
}

/**
 * Serialize a full digital twin dataset to a JSON string.
 * Adds exportedAt timestamp if not already set in metadata.
 */
export function generateTwinJSON(twin: TwinExportData): string {
  const payload: TwinExportData = {
    ...twin,
    metadata: {
      ...twin.metadata,
      exportedAt: twin.metadata.exportedAt ?? new Date().toISOString(),
    },
  };

  return JSON.stringify(payload, null, 2);
}
