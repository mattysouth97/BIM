// src/lib/retrofit/solar-potential.ts
// Solar PV potential assessment for Korean buildings.

import { annualPvGenerationKWh } from '@/lib/energy/pv-generation';
import type { RetrofitMeasure } from '@/lib/retrofit/retrofit-types';
import { CO2_FACTORS, MEASURE_LIFETIMES, ENERGY_PRICES } from '@/lib/retrofit/cost-database';

export interface SolarPVResult extends RetrofitMeasure {
  systemSizeKWp: number;
  annualGenerationKWh: number;
  roofUtilization: number; // 0-1
  feedInTariffRate: number; // KRW/kWh (user-configurable)
  /** P2-10 (c) — year-1 revenue from self-consumed generation (escalates at electricity rate). */
  annualSelfConsumptionRevenue: number;
  /** P2-10 (c) — year-1 revenue from the feed-in portion (fixed SMP/REC tariff — does not escalate). */
  annualFeedInRevenue: number;
}

/** Korean regional peak sun hours (hours/day annual average) */
export const REGIONAL_IRRADIANCE: Record<string, number> = {
  'seoul': 3.5, 'busan': 3.8, 'daegu': 3.7, 'incheon': 3.4,
  'gwangju': 3.7, 'daejeon': 3.6, 'ulsan': 3.8, 'sejong': 3.6,
  'gyeonggi': 3.5, 'gangwon': 3.6, 'chungbuk': 3.6, 'chungnam': 3.5,
  'jeonbuk': 3.6, 'jeonnam': 3.8, 'gyeongbuk': 3.7, 'gyeongnam': 3.7, 'jeju': 3.5,
};



const SELF_CONSUMPTION_RATIO = 0.7;
const FEED_IN_RATIO = 0.3;
// P2-10 (f) — assumption: turnkey rooftop PV ~1.5M KRW/kWp reflects Korean
// small-commercial installed cost circa 2024. No single official tariff; treat
// as an engineering estimate and stress-test with sensitivity analysis.
const COST_PER_KWP = 1_500_000; // KRW/kWp — assumption (Korean small-commercial avg)
// P2-10 (d) — one electricity price for the whole engine (was a divergent 120
// here vs 140 in cost-database). Self-consumed solar offsets retail electricity.
const DEFAULT_ELECTRICITY_PRICE = ENERGY_PRICES.electricity; // 140 KRW/kWh
// P2-10 (c) — assumption: ~0.5%/yr panel output degradation, consistent with the
// 80%-at-25yr performance warranty encoded in MEASURE_LIFETIMES['solar-pv'].
const PANEL_DEGRADATION_RATE = 0.005;

/** CO2 emission factor for Korean grid (tCO2/kWh) — shared constant, tCO2/MWh ÷ 1000 */
const CO2_FACTOR_ELECTRICITY = CO2_FACTORS.electricity / 1000;

/**
 * `geometricKWp`: where the roof HAS been measured into planes and modules
 * laid out on them (`pv-layout.ts`), the size the economics prices is the
 * drawn count × the module rating. The utilisation-ratio path below is the
 * fallback for a roof with no measured planes, and it is why the picture and
 * the price disagreed: it turns an area into a kWp by a factor that never
 * meets the geometry, so the Clinic could be priced at 373 kWp while the grid
 * drew whatever fitted a box that included its courtyards. A count wins.
 */
export function calculateSolarPotential(
  roofArea: number, // m2
  roofType: 'flat' | 'gable' | 'hip' | 'sawtooth',
  peakSunHours: number, // resolved ClimateRegion value; no region-name lookup or national fallback
  feedInTariffRate: number, // KRW/kWh — user-configurable
  electricityPrice: number = DEFAULT_ELECTRICITY_PRICE,
  /**
   * SIXTH positional argument, after `electricityPrice`. Passing the kWp in
   * the fifth slot silently prices the system at that number per kWh and
   * leaves the size on the ratio path — a wrong number, not a type error.
   */
  geometricKWp?: number,
): SolarPVResult {
  if (!Number.isFinite(peakSunHours) || peakSunHours <= 0) throw new RangeError('A resolved positive peak-sun-hours value is required');
  const generation = annualPvGenerationKWh({ peakSunHours, systemSizeKWp: geometricKWp, roofAreaSqm: roofArea, roofType });
  const { roofUtilization, systemSizeKWp, annualKWh: annualGenerationKWh } = generation;

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
    description:
      geometricKWp != null
        ? `Solar PV system (${roofType} roof, ${systemSizeKWp.toFixed(1)} kWp) — sized from the modules laid out on the measured roof planes, not from a utilisation ratio.`
        : `Solar PV system (${roofType} roof, ${systemSizeKWp.toFixed(1)} kWp) — sized from ${roofArea.toFixed(0)} m² of roof at a ${roofUtilization} utilisation ratio; this roof has not been measured into planes.`,
    estimatedCost,
    annualEnergySaving: annualGenerationKWh,
    annualCostSaving,
    co2Reduction,
    paybackYears,
    // P2-10 (c)/(e): split the blended saving so the DCF escalates each stream
    // correctly — self-consumption tracks the retail electricity price while the
    // feed-in portion is a fixed tariff, and both fade with panel degradation.
    escalationComponents: [
      {
        amount: annualSelfConsumptionRevenue,
        fuel: 'electricity',
        degradationRate: PANEL_DEGRADATION_RATE,
      },
      {
        amount: annualFeedInRevenue,
        escalation: 0, // fixed SMP/REC tariff — does not escalate
        degradationRate: PANEL_DEGRADATION_RATE,
      },
    ],
    // SolarPVResult-specific fields
    systemSizeKWp,
    annualGenerationKWh,
    roofUtilization,
    feedInTariffRate,
    annualSelfConsumptionRevenue,
    annualFeedInRevenue,
  };
}
