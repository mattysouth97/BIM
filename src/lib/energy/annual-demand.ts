// src/lib/energy/annual-demand.ts
// Annual site energy via degree-day method (screening-level, ISO 13790 flavor).
// Heating: air-coupled H × HDD, ground element annualized at its own ΔT.
// Cooling: conduction (CDD) + solar gains through glazing, divided by COP.

import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { ClimateData } from "./climate-data";
import type { HeatLossResult } from "./heat-loss";

export interface AnnualDemand {
  /** Annual heating site consumption, after boiler η / COP (kWh/yr) */
  heatingDemand: number;
  /** Annual cooling site consumption, after cooling COP (kWh/yr) */
  coolingDemand: number;
  /** Total annual site consumption (kWh/yr) */
  totalDemand: number;
  /** Total per floor area (kWh/m²·yr) */
  demandPerSqm: number;
}

/** Heating-season hours used to annualize constant-ΔT ground losses. */
const HEATING_SEASON_HOURS = 4380; // ~half year

/** Combined shading/frame factor on glazed solar gains (screening default). */
const SOLAR_SHADING_FACTOR = 0.7;

/**
 * Normalize an efficiency input that may arrive as a fraction (0.85),
 * a COP (3.5), or a percentage (85). Values > 10 are treated as percent.
 * Returns 0 for missing/absent systems (callers decide what 0 means).
 */
export function normalizeEfficiency(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 10 ? raw / 100 : raw;
}

/**
 * Calculate annual heating and cooling site consumption.
 *
 * Heating: [Σ h_air × HDD × 24 + h_ground × ΔT_g × 4380] / 1000 / η
 * Cooling: [Σ h_air × CDD × 24 + A_win × SHGC × I_cool × f_shade × 1000] / 1000 / COP
 * (h in W/K; HDD/CDD in K·day; I_cool in kWh/m² per cooling season)
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

  // Heating efficiency: fraction or COP for heat pumps; bounded away from 0.
  const heatingEfficiency = Math.min(Math.max(normalizeEfficiency(heating.efficiency), 0.3), 6);
  // Cooling COP: 0 means the building has no cooling system.
  const coolingCOPRaw = normalizeEfficiency(cooling.efficiency);
  const coolingCOP = coolingCOPRaw > 0 ? Math.max(coolingCOPRaw, 1) : 0;

  // Split heat-loss coefficients by temperature basis.
  let hAir = 0; // W/K, follows outdoor air (walls/windows/roof/ventilation)
  let groundAnnualKwh = 0;
  for (const el of heatLoss.elements) {
    if (el.element === "Ground Floor") {
      groundAnnualKwh = (el.hCoefficient * el.deltaT * HEATING_SEASON_HOURS) / 1000;
    } else {
      hAir += el.hCoefficient;
    }
  }

  const heatingRaw = (hAir * climate.hdd * 24) / 1000 + groundAnnualKwh;

  // Cooling: conduction/ventilation during CDD hours + solar aperture gains.
  const windowsEl = heatLoss.elements.find((e) => e.element === "Windows");
  const windowArea = windowsEl?.area ?? 0;
  const shgc = materials.envelope.windows.shgc ?? 0.6;
  const solarGainsKwh =
    windowArea * shgc * (climate.coolingSeasonSolar ?? 350) * SOLAR_SHADING_FACTOR;
  const coolingRaw = (hAir * climate.cdd * 24) / 1000 + solarGainsKwh;

  const heatingDemand = heatingRaw / heatingEfficiency;
  const coolingDemand = coolingCOP > 0 ? coolingRaw / coolingCOP : 0;
  const totalDemand = heatingDemand + coolingDemand;

  return {
    heatingDemand,
    coolingDemand,
    totalDemand,
    demandPerSqm: totalDemand / totalFloorArea,
  };
}
