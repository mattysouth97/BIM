// src/lib/retrofit/hvac-retrofits.ts
// HVAC retrofit recommendations based on system efficiency, age, and energy demand.

import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";
import type { Fuel } from "@/lib/retrofit/economic-model";
import { ENERGY_PRICES, CO2_FACTORS, MEASURE_LIFETIMES } from "@/lib/retrofit/cost-database";

// P2-10 (f) — HVAC unit costs are ENGINEERING ASSUMPTIONS (system cost per
// 100 m² conditioned area ÷ 100), not an official Korean tariff. They reflect
// typical 2024 Korean commercial equipment-plus-install pricing; unlike the
// KICT-tagged envelope costs there is no single citable source. Stress-test
// with sensitivity analysis.
const BOILER_UPGRADE_COST_PER_SQM = 2_500_000 / 100; // ₩25,000/m² — assumption
const HEAT_PUMP_COST_PER_SQM = 4_000_000 / 100; // ₩40,000/m² — assumption
const HRV_COST_PER_SQM = 800_000 / 100; // ₩8,000/m² — assumption

/**
 * Generate HVAC retrofit recommendations for a building.
 *
 * @param currentSystem       Heating/cooling system characteristics
 * @param floorArea           Total conditioned floor area (m²)
 * @param annualHeatingDemand Annual heating energy demand (kWh)
 * @param annualCoolingDemand Annual cooling energy demand (kWh)
 * @param heatingFuel         Building's heating fuel (P1-03); boiler/HRV savings
 *                            and the heat pump's DISPLACED fuel follow it.
 *                            Default "gas" = legacy behavior.
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
  _annualCoolingDemand: number,
  heatingFuel: Fuel = "gas"
): RetrofitMeasure[] {
  const measures: RetrofitMeasure[] = [];
  const { heatingEfficiency, age = 0 } = currentSystem;
  // P1-03: heating-side savings priced/emitted at the building's actual fuel.
  const heatingPrice = ENERGY_PRICES[heatingFuel];
  const heatingCo2 = CO2_FACTORS[heatingFuel];

  // --- Boiler upgrade: efficiency < 0.85 ---
  if (heatingEfficiency < 0.85) {
    const newEfficiency = 0.95;
    // Energy saved = demand × (1 - oldEff / newEff)
    const annualEnergySaving =
      annualHeatingDemand * (1 - heatingEfficiency / newEfficiency);
    const annualCostSaving = annualEnergySaving * heatingPrice;
    const annualCO2Saving = (annualEnergySaving / 1000) * heatingCo2;
    const totalCost = BOILER_UPGRADE_COST_PER_SQM * floorArea;
    const simplePayback =
      annualCostSaving > 0 ? totalCost / annualCostSaving : Infinity;

    measures.push({
      id: "hvac-boiler-upgrade",
      fuel: heatingFuel, // P1-03
      lifetimeYears: MEASURE_LIFETIMES["hvac-boiler-upgrade"], // P1-02
      name: "고효율 보일러 교체",
      category: "hvac",
      conflictGroup: "heating-plant", // P1-01: exclusive with heat-pump conversion
      estimatedCost: totalCost,
      annualEnergySaving,
      annualCostSaving,
      co2Reduction: annualCO2Saving,
      paybackYears: simplePayback,
      description: `현재 효율 ${(heatingEfficiency * 100).toFixed(0)}%에서 95% 고효율 보일러로 교체. 연간 ${annualEnergySaving.toFixed(0)} kWh 절감.`,
    });
  }

  // --- Heat pump conversion: efficiency < 0.70 or age > 15 ---
  // P1-03: suppressed when heating is already electric — nothing to switch
  // FROM (resistive-to-heat-pump would be a different measure; not modeled).
  if ((heatingEfficiency < 0.7 || age > 15) && heatingFuel !== "electricity") {
    const heatPumpCOP = 3.5;
    // Existing fuel consumption = demand / efficiency
    const existingFuelUse = annualHeatingDemand / heatingEfficiency;
    // New electricity consumption = demand / COP
    const newElectricUse = annualHeatingDemand / heatPumpCOP;
    const annualEnergySaving = existingFuelUse - newElectricUse;
    // Cost: old (displaced) heating fuel vs new electricity (P1-03)
    const oldFuelCost = existingFuelUse * heatingPrice;
    const newElecCost = newElectricUse * ENERGY_PRICES.electricity;
    const annualCostSaving = oldFuelCost - newElecCost;
    // CO2: old gas emissions minus new electricity emissions
    const annualCO2Saving =
      (existingFuelUse / 1000) * heatingCo2 -
      (newElectricUse / 1000) * CO2_FACTORS.electricity;
    const totalCost = HEAT_PUMP_COST_PER_SQM * floorArea;
    const simplePayback =
      annualCostSaving > 0 ? totalCost / annualCostSaving : Infinity;

    measures.push({
      id: "hvac-heat-pump",
      lifetimeYears: MEASURE_LIFETIMES["hvac-heat-pump"], // P1-02
      name: "히트펌프 시스템 전환",
      category: "hvac",
      conflictGroup: "heating-plant", // P1-01: exclusive with boiler upgrade
      // P2-10 (e): the net saving blends a displaced-fuel stream (gas/district,
      // slower escalation) against an electricity stream that escalates faster.
      // Escalating the net at one rate over/understates late-horizon value, so
      // split it: +displaced fuel, −electricity spent.
      escalationComponents: [
        { amount: oldFuelCost, fuel: heatingFuel },
        { amount: -newElecCost, fuel: "electricity" },
      ],
      estimatedCost: totalCost,
      annualEnergySaving,
      annualCostSaving,
      co2Reduction: annualCO2Saving,
      paybackYears: simplePayback,
      description: `COP 3.5 히트펌프로 전환. 기존 시스템(효율 ${(heatingEfficiency * 100).toFixed(0)}%, 사용연수 ${age}년) 대비 연간 ${annualCostSaving > 0 ? annualCostSaving.toFixed(0) : 0} KRW 절감.`,
    });
  }

  // --- HRV: always recommended (assumes no existing heat recovery ventilation) ---
  // P2-10 (f) — assumption: ~15% of heating demand recovered by a 75%-effective
  // HRV net of fan energy. Order-of-magnitude engineering estimate (site-specific
  // in reality), not an official standard.
  const hrvSavingRate = 0.15;
  const hrvEnergySaving = annualHeatingDemand * hrvSavingRate;
  const hrvCostSaving = hrvEnergySaving * heatingPrice;
  const hrvCO2Saving = (hrvEnergySaving / 1000) * heatingCo2;
  const hrvTotalCost = HRV_COST_PER_SQM * floorArea;
  const hrvPayback =
    hrvCostSaving > 0 ? hrvTotalCost / hrvCostSaving : Infinity;

  measures.push({
    id: "hvac-hrv",
    fuel: heatingFuel, // P1-03
    lifetimeYears: MEASURE_LIFETIMES["hvac-hrv"], // P1-02
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
