// src/lib/retrofit/hvac-retrofits.ts
// HVAC retrofit recommendations based on system efficiency, age, and energy demand.

import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";
import { ENERGY_PRICES, CO2_FACTORS } from "@/lib/retrofit/cost-database";

/** Cost per m² for each HVAC measure (KRW) */
const BOILER_UPGRADE_COST_PER_SQM = 2_500_000 / 100;
const HEAT_PUMP_COST_PER_SQM = 4_000_000 / 100;
const HRV_COST_PER_SQM = 800_000 / 100;

/**
 * Generate HVAC retrofit recommendations for a building.
 *
 * @param currentSystem       Heating/cooling system characteristics
 * @param floorArea           Total conditioned floor area (m²)
 * @param annualHeatingDemand Annual heating energy demand (kWh)
 * @param annualCoolingDemand Annual cooling energy demand (kWh)
 */
export function generateHvacRetrofits(
  currentSystem: {
    heatingType: string;
    heatingEfficiency: number;
    coolingType?: string;
    coolingEfficiency?: number;
    age?: number;
  },
  floorArea: number,
  annualHeatingDemand: number,
  annualCoolingDemand: number
): RetrofitMeasure[] {
  const measures: RetrofitMeasure[] = [];
  const { age = 0 } = currentSystem;
  // Normalize percent-style efficiencies (e.g. 75 → 0.75). A real fractional
  // efficiency/COP above 3 is only plausible for heat pumps, which are not
  // valid inputs here — so > 3 is treated as a percentage.
  const heatingEfficiency =
    currentSystem.heatingEfficiency > 3
      ? currentSystem.heatingEfficiency / 100
      : currentSystem.heatingEfficiency;

  // --- Boiler upgrade: efficiency < 0.85 ---
  if (heatingEfficiency < 0.85) {
    const newEfficiency = 0.95;
    // `annualHeatingDemand` is USEFUL heat. Fuel input = demand / efficiency,
    // so fuel saved = demand × (1/oldEff − 1/newEff).
    // (Audit finding #1: the old demand-side form (1 − oldEff/newEff)
    // under-counted; D=100,000 at 0.75→0.95 must save 28,070 kWh, not 21,053.)
    const annualEnergySaving =
      annualHeatingDemand * (1 / heatingEfficiency - 1 / newEfficiency);
    const annualCostSaving = annualEnergySaving * ENERGY_PRICES.gas;
    const annualCO2Saving = (annualEnergySaving / 1000) * CO2_FACTORS.gas;
    const totalCost = BOILER_UPGRADE_COST_PER_SQM * floorArea;
    const simplePayback =
      annualCostSaving > 0 ? totalCost / annualCostSaving : Infinity;

    measures.push({
      id: "hvac-boiler-upgrade",
      name: "고효율 보일러 교체",
      category: "hvac",
      exclusiveGroup: "heating-plant", // alternative to heat-pump conversion

      estimatedCost: totalCost,
      annualEnergySaving,
      annualCostSaving,
      co2Reduction: annualCO2Saving,
      paybackYears: simplePayback,
      description: `현재 효율 ${(heatingEfficiency * 100).toFixed(0)}%에서 95% 고효율 보일러로 교체. 연간 ${annualEnergySaving.toFixed(0)} kWh 절감.`,
    });
  }

  // --- Heat pump conversion: efficiency < 0.70 or age > 15 ---
  if (heatingEfficiency < 0.7 || age > 15) {
    const heatPumpCOP = 3.5;
    // Existing fuel consumption = demand / efficiency
    const existingFuelUse = annualHeatingDemand / heatingEfficiency;
    // New electricity consumption = demand / COP
    const newElectricUse = annualHeatingDemand / heatPumpCOP;
    const annualEnergySaving = existingFuelUse - newElectricUse;
    // Cost: old gas vs new electricity
    const oldFuelCost = existingFuelUse * ENERGY_PRICES.gas;
    const newElecCost = newElectricUse * ENERGY_PRICES.electricity;
    const annualCostSaving = oldFuelCost - newElecCost;
    // CO2: old gas emissions minus new electricity emissions
    const annualCO2Saving =
      (existingFuelUse / 1000) * CO2_FACTORS.gas -
      (newElectricUse / 1000) * CO2_FACTORS.electricity;
    const totalCost = HEAT_PUMP_COST_PER_SQM * floorArea;
    const simplePayback =
      annualCostSaving > 0 ? totalCost / annualCostSaving : Infinity;

    measures.push({
      id: "hvac-heat-pump",
      name: "히트펌프 시스템 전환",
      category: "hvac",
      exclusiveGroup: "heating-plant", // alternative to boiler upgrade

      estimatedCost: totalCost,
      annualEnergySaving,
      annualCostSaving,
      co2Reduction: annualCO2Saving,
      paybackYears: simplePayback,
      description: `COP 3.5 히트펌프로 전환. 기존 시스템(효율 ${(heatingEfficiency * 100).toFixed(0)}%, 사용연수 ${age}년) 대비 연간 ${annualCostSaving > 0 ? annualCostSaving.toFixed(0) : 0} KRW 절감.`,
    });
  }

  // --- HRV: always recommended (assumes no existing heat recovery ventilation) ---
  const hrvSavingRate = 0.15;
  // HRV reduces ventilation heat DEMAND. Convert the demand-side saving to
  // fuel by dividing by the heating-system efficiency (audit finding #2).
  const hrvEnergySaving = (annualHeatingDemand * hrvSavingRate) / heatingEfficiency;
  const hrvCostSaving = hrvEnergySaving * ENERGY_PRICES.gas;
  const hrvCO2Saving = (hrvEnergySaving / 1000) * CO2_FACTORS.gas;
  const hrvTotalCost = HRV_COST_PER_SQM * floorArea;
  const hrvPayback =
    hrvCostSaving > 0 ? hrvTotalCost / hrvCostSaving : Infinity;

  measures.push({
    id: "hvac-hrv",
    name: "열회수환기장치(HRV) 설치",
    category: "hvac",
    estimatedCost: hrvTotalCost,
    annualEnergySaving: hrvEnergySaving,
    annualCostSaving: hrvCostSaving,
    co2Reduction: hrvCO2Saving,
    paybackYears: hrvPayback,
    description: `열회수효율 75% HRV 설치로 환기 열손실 15% 절감. 연간 ${hrvEnergySaving.toFixed(0)} kWh 절감.`,
  });

  return measures;
}
