// src/lib/energy/heat-loss.ts
// Steady-state heat loss per building envelope element PLUS the
// infiltration/ventilation term (ISO 13789-style H = H_tr + H_ve).
// Each element carries its heat-loss coefficient h [W/K] and the ΔT it was
// evaluated at, so annual-demand can annualize each element on the correct
// temperature basis (outdoor-air HDD vs constant ground ΔT).

import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { ClimateData } from "./climate-data";

export interface ElementHeatLoss {
  /** Element name ("Walls", "Windows", "Roof", "Ground Floor", "Ventilation") */
  element: string;
  /** Surface area (m²) — for Ventilation this is the conditioned volume (m³) */
  area: number;
  /** U-value (W/m²·K) — for Ventilation this is the effective ACH */
  uValue: number;
  /** Heat-loss coefficient h = U·A or 0.34·ACH·V (W/K) */
  hCoefficient: number;
  /** ΔT this element's design heatLoss was evaluated at (K) */
  deltaT: number;
  /** Design heat loss = h × ΔT (W) */
  heatLoss: number;
  /** Heat loss per m² of total floor area (W/m²) */
  heatLossPerSqm: number;
}

export interface HeatLossResult {
  elements: ElementHeatLoss[];
  /** Total design heat loss (W) — transmission + ventilation + ground */
  totalHeatLoss: number;
  /** Total heat loss per m² of floor area (W/m²) */
  totalHeatLossPerSqm: number;
}

/** Volumetric heat capacity of air: ~0.34 Wh/(m³·K) (ρ·cp). */
const AIR_HEAT_CAPACITY_WH_M3K = 0.34;

/** ach50 → natural infiltration ACH divisor (LBNL/Sherman rule of thumb). */
const ACH50_TO_NATURAL = 20;

/** Fallback ground temperature (°C) when foundation data is missing. */
const DEFAULT_GROUND_TEMP = 13.5;

/**
 * Calculate steady-state heat loss for each building envelope element plus
 * infiltration/ventilation. Q = U × A × ΔT per element; H_ve = 0.34·ACH·V.
 */
export function calculateHeatLoss(
  materials: MaterialProperties,
  recipe: BuildingRecipe,
  climate: ClimateData
): HeatLossResult {
  const { footprintWidth, footprintDepth, totalHeight } = recipe;
  const perimeter = 2 * (footprintWidth + footprintDepth);
  const totalFloorArea = footprintWidth * footprintDepth * recipe.floors.length;
  const roofArea = footprintWidth * footprintDepth;
  const floorArea = roofArea; // ground floor area
  const volume = roofArea * totalHeight; // conditioned volume (m³)

  // ΔT for winter heat loss
  const deltaT = climate.indoorTemp - climate.winterDesignTemp;
  // Ground floor: indoor vs actual ground temperature (ISO 13370 simplified)
  const groundTemp =
    materials.envelope.foundation?.groundTemperature ?? DEFAULT_GROUND_TEMP;
  const groundDeltaT = Math.max(climate.indoorTemp - groundTemp, 0);

  const grossWallArea = perimeter * totalHeight;
  const wwr = materials.envelope.windows.windowToWallRatio;
  const avgWWR = (wwr.N + wwr.S + wwr.E + wwr.W) / 4;
  const totalWindowArea = grossWallArea * avgWWR;
  const netWallArea = grossWallArea - totalWindowArea;

  const elements: ElementHeatLoss[] = [];
  const push = (
    element: string, area: number, uValue: number, h: number, dT: number,
  ) => {
    const heatLoss = h * dT;
    elements.push({
      element, area, uValue, hCoefficient: h, deltaT: dT, heatLoss,
      heatLossPerSqm: totalFloorArea > 0 ? heatLoss / totalFloorArea : 0,
    });
  };

  // Walls — average U across assemblies + thermal-bridge surcharge ΔU_tb
  // (ISO 14683 simplified: per-assembly ψ expressed as an additive U term).
  const wallUValues = materials.envelope.walls;
  const avgWallU =
    wallUValues.length > 0
      ? wallUValues.reduce((sum, w) => sum + w.uValue, 0) / wallUValues.length
      : 0.47; // fallback: Korean code default
  const avgThermalBridge =
    wallUValues.length > 0
      ? wallUValues.reduce((sum, w) => sum + (w.thermalBridge ?? 0), 0) /
        wallUValues.length
      : 0;
  push("Walls", netWallArea, avgWallU + avgThermalBridge,
    (avgWallU + avgThermalBridge) * netWallArea, deltaT);

  // Windows
  const windowU = materials.envelope.windows.uValue;
  push("Windows", totalWindowArea, windowU, windowU * totalWindowArea, deltaT);

  // Roof
  const roofU = materials.envelope.roof.uValue;
  push("Roof", roofArea, roofU, roofU * roofArea, deltaT);

  // Ground floor (reduced ΔT for ground contact)
  const floorU = materials.envelope.groundFloor.uValue;
  push("Ground Floor", floorArea, floorU, floorU * floorArea, groundDeltaT);

  // Infiltration + mechanical ventilation: H_ve = 0.34 · ACH_eff · V.
  // Infiltration from blower-door ach50/20; mechanical airflow credited with
  // heat-recovery efficiency; natural ventilation systems add no mech term.
  const ach50 = materials.envelope.airtightness?.ach50 ?? 0;
  const infiltrationAch = ach50 / ACH50_TO_NATURAL;
  const vent = materials.hvac.ventilation;
  const mechAch =
    vent && vent.type !== "natural" && volume > 0
      ? (vent.airflowRate / volume) *
        (1 - Math.min(Math.max(vent.heatRecoveryEfficiency ?? 0, 0), 0.95))
      : 0;
  const effAch = infiltrationAch + mechAch;
  const hVe = AIR_HEAT_CAPACITY_WH_M3K * effAch * volume;
  push("Ventilation", volume, effAch, hVe, deltaT);

  const totalHeatLoss = elements.reduce((sum, e) => sum + e.heatLoss, 0);

  return {
    elements,
    totalHeatLoss,
    totalHeatLossPerSqm: totalFloorArea > 0 ? totalHeatLoss / totalFloorArea : 0,
  };
}
