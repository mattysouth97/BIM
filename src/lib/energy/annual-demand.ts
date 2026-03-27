// src/lib/energy/annual-demand.ts
// Annual energy demand via degree-day method (Korean standard).

import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { ClimateData } from "./climate-data";
import type { HeatLossResult } from "./heat-loss";

export interface AnnualDemand {
  /** Annual heating demand (kWh/yr) */
  heatingDemand: number;
  /** Annual cooling demand (kWh/yr) */
  coolingDemand: number;
  /** Total annual energy demand (kWh/yr) */
  totalDemand: number;
  /** Total demand per floor area (kWh/m²·yr) */
  demandPerSqm: number;
}

/**
 * Calculate annual heating and cooling demand using degree-day method.
 *
 * Heating: totalHeatLoss(W) × HDD × 24h / 1000 → kWh/yr (envelope losses)
 * Cooling: coolingGain(W) × CDD × 24h / 1000 → kWh/yr (simplified 60% of heat loss as solar+internal gains)
 * Adjusted for HVAC efficiency.
 */
export function calculateAnnualDemand(
  heatLoss: HeatLossResult,
  materials: MaterialProperties,
  recipe: BuildingRecipe,
  climate: ClimateData
): AnnualDemand {
  const totalFloorArea =
    recipe.footprintWidth * recipe.footprintDepth * recipe.floors.length;

  if (totalFloorArea <= 0) {
    return { heatingDemand: 0, coolingDemand: 0, totalDemand: 0, demandPerSqm: 0 };
  }

  const { heating, cooling } = materials.hvac;

  // Heating efficiency (percentage → fraction), minimum 0.5 to avoid division by zero
  const heatingEfficiency = Math.max(heating.efficiency / 100, 0.5);
  // Cooling COP — efficiency field stores COP for cooling systems, minimum 1.0
  const coolingCOP = Math.max(cooling.efficiency, 1.0);

  // Raw heating energy via degree-day: Q_loss(kW) × HDD × 24h
  // heatLoss.totalHeatLoss is in watts at design ΔT
  // Degree-day method normalizes: Q(kWh/yr) = Q_loss(W) / ΔT_design × HDD × 24 / 1000
  const designDeltaT = climate.indoorTemp - climate.winterDesignTemp;
  const heatingRaw =
    designDeltaT > 0
      ? (heatLoss.totalHeatLoss / designDeltaT) * climate.hdd * 24 / 1000
      : 0;

  // Cooling heat gain: simplified as 60% of heating heat loss (accounts for solar + internal gains)
  const coolingGainFactor = 0.6;
  const coolingRaw =
    designDeltaT > 0
      ? (heatLoss.totalHeatLoss * coolingGainFactor / designDeltaT) *
        climate.cdd * 24 / 1000
      : 0;

  // Adjust for equipment efficiency
  const heatingDemand = heatingRaw / heatingEfficiency;
  const coolingDemand = coolingRaw / coolingCOP;
  const totalDemand = heatingDemand + coolingDemand;

  return {
    heatingDemand,
    coolingDemand,
    totalDemand,
    demandPerSqm: totalDemand / totalFloorArea,
  };
}
