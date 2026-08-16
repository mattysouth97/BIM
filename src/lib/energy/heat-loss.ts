// src/lib/energy/heat-loss.ts
// Steady-state heat loss per building envelope element PLUS the
// infiltration/ventilation term (ISO 13789-style H = H_tr + H_ve).
// Each element carries its heat-loss coefficient h [W/K] and the ΔT it was
// evaluated at, so annual-demand can annualize each element on the correct
// temperature basis (outdoor-air HDD vs constant ground ΔT).
// Envelope areas come from CAD/VWorld rings via envelopeQuantities (P2).

import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { ClimateData } from "./climate-data";
import { envelopeQuantities } from "./envelope-quantities";

/** Canonical P2-01 name for the air-exchange term. */
export const VENTILATION_ELEMENT_NAME = "Infiltration/Ventilation";
/** Accuracy-wave alias used by some report/UI lookups. */
export const VENTILATION_ELEMENT_ALIAS = "Ventilation";

export function isVentilationElement(name: string): boolean {
  return name === VENTILATION_ELEMENT_NAME || name === VENTILATION_ELEMENT_ALIAS;
}

export interface ElementHeatLoss {
  /** Element name ("Walls", "Windows", "Roof", "Ground Floor", "Infiltration/Ventilation") */
  element: string;
  /** Surface area (m²) — for ventilation this is the conditioned volume (m³) */
  area: number;
  /** U-value (W/m²·K) — for ventilation this is the effective ACH */
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

/** ach50 → natural infiltration ACH divisor (LBNL/Sherman / LBL N-factor). */
const ACH50_TO_NATURAL = 20;

/** Values above this are treated as volume flow (m³/h), not ACH. */
const AIRFLOW_ACH_MAX = 5;

/** Fallback ground temperature (°C) when foundation data is missing. */
const DEFAULT_GROUND_TEMP = 13.5;

function ventilationEta(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return 0;
  // Accept fraction (0.8) or percent (70 / 80).
  const frac = raw > 1 ? raw / 100 : raw;
  return Math.min(Math.max(frac, 0), 0.95);
}

/**
 * Mechanical ACH. P2-01 documents airflowRate as ACH; the accuracy wave also
 * accepts a volume-flow (m³/h) when the number is too large to be ACH.
 * Heat-recovery efficiency is applied for `heat-recovery` systems and for
 * any mechanical system that carries a non-zero recovery fraction.
 */
function mechanicalAch(
  vent: MaterialProperties["hvac"]["ventilation"] | undefined,
  volume: number
): number {
  if (!vent || vent.type === "natural") return 0;
  const raw = Math.max(0, vent.airflowRate ?? 0);
  const ach = raw > AIRFLOW_ACH_MAX && volume > 0 ? raw / volume : raw;
  const applyHr =
    vent.type === "heat-recovery" || (vent.heatRecoveryEfficiency ?? 0) > 0;
  return applyHr ? ach * (1 - ventilationEta(vent.heatRecoveryEfficiency)) : ach;
}

/**
 * Calculate steady-state heat loss for each building envelope element plus
 * infiltration/ventilation. Q = U × A × ΔT per element; H_ve = 0.34·ACH·V.
 */
export function calculateHeatLoss(
  materials: MaterialProperties,
  recipe: BuildingRecipe,
  climate: ClimateData
): HeatLossResult {
  const q = envelopeQuantities(recipe);
  const totalFloorArea = q.intensityFloorAreaSqm;
  const roofArea = q.roofAreaSqm;
  const floorArea = q.planAreaSqm;
  const volume = q.volumeM3;

  // ΔT for winter heat loss
  const deltaT = climate.indoorTemp - climate.winterDesignTemp;
  // Ground floor: indoor vs actual ground temperature (ISO 13370 simplified)
  const groundTemp =
    materials.envelope.foundation?.groundTemperature ?? DEFAULT_GROUND_TEMP;
  const groundDeltaT = Math.max(climate.indoorTemp - groundTemp, 0);

  const grossWallArea = q.grossWallAreaSqm;
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

  // Infiltration + mechanical ventilation (P2-01): H_ve = 0.34 · ACH_eff · V.
  // Infiltration from blower-door ach50/20 (LBL N-factor); mechanical airflow
  // credited with heat-recovery efficiency; natural systems add no mech term.
  const ach50 = materials.envelope.airtightness?.ach50 ?? 0;
  const infiltrationAch = ach50 / ACH50_TO_NATURAL;
  const mechAch = mechanicalAch(materials.hvac.ventilation, volume);
  const effAch = infiltrationAch + mechAch;
  const hVe = AIR_HEAT_CAPACITY_WH_M3K * effAch * volume;
  push(VENTILATION_ELEMENT_NAME, volume, effAch, hVe, deltaT);

  const totalHeatLoss = elements.reduce((sum, e) => sum + e.heatLoss, 0);

  return {
    elements,
    totalHeatLoss,
    totalHeatLossPerSqm: totalFloorArea > 0 ? totalHeatLoss / totalFloorArea : 0,
  };
}
