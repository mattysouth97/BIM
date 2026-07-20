// src/lib/retrofit/solar-potential.ts
// Solar PV potential assessment for Korean buildings.

import type { RetrofitMeasure } from '@/lib/retrofit/retrofit-types';
import { MEASURE_LIFETIMES } from '@/lib/retrofit/cost-database';

export interface SolarPVResult extends RetrofitMeasure {
  systemSizeKWp: number;
  annualGenerationKWh: number;
  roofUtilization: number; // 0-1
  feedInTariffRate: number; // KRW/kWh (user-configurable)
}

/** Korean regional peak sun hours (hours/day annual average) */
export const REGIONAL_IRRADIANCE: Record<string, number> = {
  'seoul': 3.5, 'busan': 3.8, 'daegu': 3.7, 'incheon': 3.4,
  'gwangju': 3.7, 'daejeon': 3.6, 'ulsan': 3.8, 'sejong': 3.6,
  'gyeonggi': 3.5, 'gangwon': 3.6, 'chungbuk': 3.6, 'chungnam': 3.5,
  'jeonbuk': 3.6, 'jeonnam': 3.8, 'gyeongbuk': 3.7, 'gyeongnam': 3.7, 'jeju': 3.5,
};

const DEFAULT_PEAK_SUN_HOURS = 3.6; // fallback for unknown region

const ROOF_UTILIZATION_FACTORS: Record<'flat' | 'gable' | 'hip' | 'sawtooth', number> = {
  flat: 0.7,
  gable: 0.5,
  hip: 0.4,
  sawtooth: 0.3,
};

const M2_PER_KWP = 5.0; // mono-Si panels
const PERFORMANCE_RATIO = 0.75;
const SELF_CONSUMPTION_RATIO = 0.7;
const FEED_IN_RATIO = 0.3;
const COST_PER_KWP = 1_500_000; // KRW/kWp (Korean average)
const DEFAULT_ELECTRICITY_PRICE = 120; // KRW/kWh

/** CO2 emission factor for Korean grid (tCO2/kWh) */
const CO2_FACTOR_ELECTRICITY = 0.000459;

export function calculateSolarPotential(
  roofArea: number, // m2
  roofType: 'flat' | 'gable' | 'hip' | 'sawtooth',
  region: string,
  feedInTariffRate: number, // KRW/kWh — user-configurable
  electricityPrice: number = DEFAULT_ELECTRICITY_PRICE,
): SolarPVResult {
  const roofUtilization = ROOF_UTILIZATION_FACTORS[roofType];
  const usableArea = roofArea * roofUtilization;
  const systemSizeKWp = usableArea / M2_PER_KWP;

  const peakSunHours = REGIONAL_IRRADIANCE[region.toLowerCase()] ?? DEFAULT_PEAK_SUN_HOURS;
  const annualGenerationKWh = systemSizeKWp * peakSunHours * 365 * PERFORMANCE_RATIO;

  const annualSelfConsumptionRevenue = annualGenerationKWh * SELF_CONSUMPTION_RATIO * electricityPrice;
  const annualFeedInRevenue = annualGenerationKWh * FEED_IN_RATIO * feedInTariffRate;
  const annualCostSaving = annualSelfConsumptionRevenue + annualFeedInRevenue;

  const estimatedCost = systemSizeKWp * COST_PER_KWP;
  const paybackYears = annualCostSaving > 0 ? estimatedCost / annualCostSaving : Infinity;

  const co2Reduction = annualGenerationKWh * CO2_FACTOR_ELECTRICITY;

  return {
    // RetrofitMeasure fields
    id: `solar-pv-${roofType}`,
    // P1-02: one shared "solar-pv" lifetime applies to all roof variants.
    lifetimeYears: MEASURE_LIFETIMES['solar-pv'],
    category: 'renewable',
    name: `Solar PV (${roofType} roof, ${systemSizeKWp.toFixed(1)} kWp)`,
    description: `Solar PV system (${roofType} roof, ${systemSizeKWp.toFixed(1)} kWp)`,
    estimatedCost,
    annualEnergySaving: annualGenerationKWh,
    annualCostSaving,
    co2Reduction,
    paybackYears,
    // SolarPVResult-specific fields
    systemSizeKWp,
    annualGenerationKWh,
    roofUtilization,
    feedInTariffRate,
  };
}
