// src/lib/demo/demo-energy.ts
//
// Bundled meter years for the demo office. The live 건물에너지정보 API is
// never called: demo must work without a key, and the fixture is labeled
// 데모 데이터 wherever it is shown.
//
// Totals sit a little above the modeled whole-building site energy so the
// predicted-vs-actual story is a real 2008 office (bills exist, the model
// is a bit optimistic) rather than a perfect match.

import { demoTitle } from "./demo-building";
import type { AnnualConsumption } from "@/lib/energy/consumption-normalizer";

/** Whole-building site EUI for the most recent bundled year, kWh/m²·yr. */
export const DEMO_ACTUAL_EUI_KWH_PER_SQM = 83;

const ELECTRIC_SHARE = 0.72;

function yearTotal(eui: number): { electric: number; gas: number; total: number } {
  const total = Math.round(eui * demoTitle.totArea);
  const electric = Math.round(total * ELECTRIC_SHARE);
  const gas = total - electric;
  return { electric, gas, total };
}

/**
 * Three prior calendar years, newest last. `referenceYear` is usually
 * `new Date().getFullYear()` so the series stays "last three years".
 */
export function getDemoAnnualConsumption(referenceYear: number): AnnualConsumption[] {
  const years: Array<[number, number]> = [
    [referenceYear - 3, 88],
    [referenceYear - 2, 85],
    [referenceYear - 1, DEMO_ACTUAL_EUI_KWH_PER_SQM],
  ];
  return years.map(([year, eui]) => {
    const split = yearTotal(eui);
    return {
      year,
      electric_kwh: split.electric,
      gas_kwh: split.gas,
      district_kwh: 0,
      total_kwh: split.total,
    };
  });
}
