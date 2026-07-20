// src/lib/retrofit/envelope-retrofits.ts
// Generates envelope retrofit recommendations with cost/benefit analysis.
// All formulas per Korean energy assessment methodology.

import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";
import { RETROFIT_COSTS, ENERGY_PRICES, CO2_FACTORS, MEASURE_LIFETIMES } from "@/lib/retrofit/cost-database";

/** 2020+ Korean building energy standard target U-values (W/m²K) */
export const KOREAN_2020_TARGET_U_VALUES = {
  wall: 0.15,
  roof: 0.15,
  window: 0.9,
  floor: 0.18,
} as const;

/**
 * Derive priority from simple payback period.
 * < 5 years = high, 5–10 years = medium, > 10 years = low
 */
function paybackPriority(paybackYears: number): 'high' | 'medium' | 'low' {
  if (paybackYears < 5) return 'high';
  if (paybackYears <= 10) return 'medium';
  return 'low';
}

/**
 * Generate envelope retrofit recommendations for a building.
 *
 * Energy saving formula per element:
 *   energySaving (kWh/yr) = (currentU - targetU) × area × HDD × 24 / 1000 / heatingEfficiency
 *
 * @param currentUValues    - Current U-values of each envelope element (W/m²K)
 * @param targetUValues     - Target U-values to meet (use KOREAN_2020_TARGET_U_VALUES for defaults)
 * @param areas             - Surface areas of each envelope element (m²)
 * @param hdd               - Heating degree days (°C·days/year) for the site
 * @param heatingEfficiency - Heating system efficiency (0–1, e.g. 0.87 for 87% boiler)
 * @returns Array of RetrofitMeasure, sorted by payback period (shortest first)
 */
export function generateEnvelopeRetrofits(
  currentUValues: { wall: number; roof: number; window: number; floor?: number },
  targetUValues: { wall: number; roof: number; window: number; floor: number },
  areas: { wall: number; roof: number; window: number; floor: number },
  hdd: number,
  heatingEfficiency: number
): RetrofitMeasure[] {
  const measures: RetrofitMeasure[] = [];

  function calcEnergySaving(currentU: number, targetU: number, area: number): number {
    return (currentU - targetU) * area * hdd * 24 / 1000 / heatingEfficiency;
  }

  // CO2_FACTORS are in tCO2/MWh — convert to tCO2/kWh by dividing by 1000
  const co2PerKwhElec = CO2_FACTORS.electricity / 1000;
  const co2PerKwhGas = CO2_FACTORS.gas / 1000;

  // --- Wall insulation ---
  if (currentUValues.wall > targetUValues.wall) {
    const energySaving = calcEnergySaving(currentUValues.wall, targetUValues.wall, areas.wall);
    const totalCost = areas.wall * RETROFIT_COSTS.wallInsulation.perM2;
    const annualCostSaving = energySaving * ENERGY_PRICES.gas;
    const simplePayback = annualCostSaving > 0 ? totalCost / annualCostSaving : Infinity;

    measures.push({
      id: 'envelope-wall-insulation',
      lifetimeYears: MEASURE_LIFETIMES['envelope-wall-insulation'], // P1-02
      name: 'Wall Insulation Upgrade',
      category: 'envelope',
      description: 'Add external wall insulation to meet 2020+ Korean energy standard (U ≤ 0.15 W/m²K)',
      estimatedCost: totalCost,
      annualEnergySaving: energySaving,
      annualCostSaving,
      co2Reduction: energySaving * co2PerKwhGas,
      paybackYears: simplePayback,
    });
  }

  // --- Roof insulation ---
  if (currentUValues.roof > targetUValues.roof) {
    const energySaving = calcEnergySaving(currentUValues.roof, targetUValues.roof, areas.roof);
    const totalCost = areas.roof * RETROFIT_COSTS.roofInsulation.perM2;
    const annualCostSaving = energySaving * ENERGY_PRICES.gas;
    const simplePayback = annualCostSaving > 0 ? totalCost / annualCostSaving : Infinity;

    measures.push({
      id: 'envelope-roof-insulation',
      lifetimeYears: MEASURE_LIFETIMES['envelope-roof-insulation'], // P1-02
      name: 'Roof Insulation Upgrade',
      category: 'envelope',
      description: 'Upgrade roof insulation to meet 2020+ Korean energy standard (U ≤ 0.15 W/m²K)',
      estimatedCost: totalCost,
      annualEnergySaving: energySaving,
      annualCostSaving,
      co2Reduction: energySaving * co2PerKwhGas,
      paybackYears: simplePayback,
    });
  }

  // --- Window replacement ---
  if (currentUValues.window > targetUValues.window) {
    const energySaving = calcEnergySaving(currentUValues.window, targetUValues.window, areas.window);
    const totalCost = areas.window * RETROFIT_COSTS.windowReplacement.perM2;
    // Windows affect both heating and cooling; use electricity price as combined proxy
    const annualCostSaving = energySaving * ENERGY_PRICES.electricity;
    const simplePayback = annualCostSaving > 0 ? totalCost / annualCostSaving : Infinity;

    measures.push({
      id: 'envelope-window-replacement',
      lifetimeYears: MEASURE_LIFETIMES['envelope-window-replacement'], // P1-02
      name: 'High-Performance Window Replacement',
      category: 'envelope',
      description: 'Replace windows with high-performance glazing (Low-E, triple or double-pane) to meet 2020+ standard (U ≤ 0.9 W/m²K)',
      estimatedCost: totalCost,
      annualEnergySaving: energySaving,
      annualCostSaving,
      co2Reduction: energySaving * co2PerKwhElec,
      paybackYears: simplePayback,
    });
  }

  // --- Floor insulation ---
  const currentFloorU = currentUValues.floor ?? 0;
  if (currentFloorU > targetUValues.floor) {
    const energySaving = calcEnergySaving(currentFloorU, targetUValues.floor, areas.floor);
    const totalCost = areas.floor * RETROFIT_COSTS.floorInsulation.perM2;
    const annualCostSaving = energySaving * ENERGY_PRICES.gas;
    const simplePayback = annualCostSaving > 0 ? totalCost / annualCostSaving : Infinity;

    measures.push({
      id: 'envelope-floor-insulation',
      lifetimeYears: MEASURE_LIFETIMES['envelope-floor-insulation'], // P1-02
      name: 'Ground Floor Insulation Upgrade',
      category: 'envelope',
      description: 'Upgrade ground floor insulation to meet 2020+ Korean energy standard (U ≤ 0.18 W/m²K)',
      estimatedCost: totalCost,
      annualEnergySaving: energySaving,
      annualCostSaving,
      co2Reduction: energySaving * co2PerKwhGas,
      paybackYears: simplePayback,
    });
  }

  // Sort by payback period ascending (shortest first = best ROI first)
  measures.sort((a, b) => a.paybackYears - b.paybackYears);

  return measures;
}
