// src/lib/retrofit/lighting-retrofits.ts
// Lighting retrofit recommendations based on lighting power density and usage hours.

import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";
import { ENERGY_PRICES, CO2_FACTORS, MEASURE_LIFETIMES } from "@/lib/retrofit/cost-database";

/** LED fixture installation cost per m² (KRW) */
const LED_FIXTURE_COST_PER_SQM = 45_000;
/** Additional smart lighting controls cost per m² (KRW) */
const SMART_CONTROLS_COST_PER_SQM = 25_000;

/**
 * Generate lighting retrofit recommendations for a building.
 *
 * @param currentLPD           Current lighting power density (W/m²)
 * @param floorArea            Total conditioned floor area (m²)
 * @param annualOperatingHours Annual lighting operating hours (e.g. 2500 office, 4000 hospital)
 */
export function generateLightingRetrofits(
  currentLPD: number,
  floorArea: number,
  annualOperatingHours: number
): RetrofitMeasure[] {
  const measures: RetrofitMeasure[] = [];

  // --- LED + smart controls: LPD > 15 W/m² ---
  if (currentLPD > 15) {
    const targetLPD = 6;
    const annualEnergySaving =
      ((currentLPD - targetLPD) * floorArea * annualOperatingHours) / 1000;
    const annualCostSaving = annualEnergySaving * ENERGY_PRICES.electricity;
    const annualCO2Saving =
      (annualEnergySaving / 1000) * CO2_FACTORS.electricity;
    const totalCost =
      (LED_FIXTURE_COST_PER_SQM + SMART_CONTROLS_COST_PER_SQM) * floorArea;
    const simplePayback =
      annualCostSaving > 0 ? totalCost / annualCostSaving : Infinity;

    measures.push({
      id: "lighting-led-smart",
      lifetimeYears: MEASURE_LIFETIMES["lighting-led-smart"], // P1-02
      name: "LED 조명 + 스마트 제어 시스템",
      category: "lighting",
      estimatedCost: totalCost,
      annualEnergySaving,
      annualCostSaving,
      co2Reduction: annualCO2Saving,
      paybackYears: simplePayback,
      description: `현재 ${currentLPD} W/m²에서 목표 ${targetLPD} W/m²로 LED 전환 및 조도센서·타이머 스마트 제어 도입. 연간 ${annualEnergySaving.toFixed(0)} kWh 절감.`,
    });

    return measures;
  }

  // --- LED only: LPD > 10 W/m² ---
  if (currentLPD > 10) {
    const targetLPD = 8;
    const annualEnergySaving =
      ((currentLPD - targetLPD) * floorArea * annualOperatingHours) / 1000;
    const annualCostSaving = annualEnergySaving * ENERGY_PRICES.electricity;
    const annualCO2Saving =
      (annualEnergySaving / 1000) * CO2_FACTORS.electricity;
    const totalCost = LED_FIXTURE_COST_PER_SQM * floorArea;
    const simplePayback =
      annualCostSaving > 0 ? totalCost / annualCostSaving : Infinity;

    measures.push({
      id: "lighting-led",
      lifetimeYears: MEASURE_LIFETIMES["lighting-led"], // P1-02
      name: "LED 조명 교체",
      category: "lighting",
      estimatedCost: totalCost,
      annualEnergySaving,
      annualCostSaving,
      co2Reduction: annualCO2Saving,
      paybackYears: simplePayback,
      description: `현재 ${currentLPD} W/m²에서 목표 ${targetLPD} W/m²로 LED 조명 전면 교체. 연간 ${annualEnergySaving.toFixed(0)} kWh 절감.`,
    });
  }

  return measures;
}
