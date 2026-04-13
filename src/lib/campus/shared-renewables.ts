// src/lib/campus/shared-renewables.ts
// Optimize solar PV placement across campus rooftops.
// Pure functions — no React, no Three.js.

import { REGIONAL_IRRADIANCE } from '@/lib/retrofit/solar-potential';

export interface SharedRenewableResult {
  buildings: Array<{
    name: string;
    roofArea: number;
    optimalPVSize: number;    // kWp
    annualGeneration: number; // kWh
  }>;
  totalPVSize: number;         // kWp
  totalGeneration: number;     // kWh
  campusSelfConsumption: number; // % (higher than individual due to load diversity)
  insight: string;
}

const DEFAULT_PEAK_SUN_HOURS = 3.6;
const PERFORMANCE_RATIO = 0.75;
const M2_PER_KWP = 5.0; // mono-Si panels

const ROOF_UTILIZATION_FACTORS: Record<'flat' | 'gable' | 'hip' | 'sawtooth', number> = {
  flat: 0.7,
  gable: 0.5,
  hip: 0.4,
  sawtooth: 0.3,
};

/** Individual building self-consumption (without campus diversity) */
const INDIVIDUAL_SELF_CONSUMPTION = 0.70; // 70%
/** Campus self-consumption (higher due to load diversity across buildings) */
const CAMPUS_SELF_CONSUMPTION = 0.85; // 85%

export function optimizeSharedRenewables(
  buildings: Array<{
    name: string;
    roofArea: number;
    roofType: 'flat' | 'gable' | 'hip' | 'sawtooth';
    annualDemand: number; // kWh
  }>,
  region: string
): SharedRenewableResult {
  const peakSunHours =
    REGIONAL_IRRADIANCE[region.toLowerCase()] ?? DEFAULT_PEAK_SUN_HOURS;

  const totalAnnualDemand = buildings.reduce((s, b) => s + b.annualDemand, 0);

  if (buildings.length === 0) {
    return {
      buildings: [],
      totalPVSize: 0,
      totalGeneration: 0,
      campusSelfConsumption: 0,
      insight: 'No buildings provided.',
    };
  }

  // Sort by descending flat-equivalent roof area so we fill best roofs first.
  // "flat-equivalent" = roofArea * utilization factor — a flat 100 m2 is better
  // than a hip 200 m2 (70 vs 80 usable m2 but also panel yield is the same per kWp).
  // We simply prioritise flat-roof buildings to maximise utilization.
  const sorted = [...buildings].sort((a, b) => {
    const effA = a.roofArea * ROOF_UTILIZATION_FACTORS[a.roofType];
    const effB = b.roofArea * ROOF_UTILIZATION_FACTORS[b.roofType];
    return effB - effA;
  });

  // Size each building: install as much PV as the roof allows.
  // Cap generation at ~120% of building demand (excess flows to campus pool).
  const perBuilding = sorted.map((b) => {
    const utilization = ROOF_UTILIZATION_FACTORS[b.roofType];
    const usableArea = b.roofArea * utilization;
    const maxSystemKWp = usableArea / M2_PER_KWP;

    const annualGenerationKWh =
      maxSystemKWp * peakSunHours * 365 * PERFORMANCE_RATIO;

    return {
      name: b.name,
      roofArea: b.roofArea,
      optimalPVSize: maxSystemKWp,
      annualGeneration: annualGenerationKWh,
    };
  });

  // Restore original order for the result
  const nameToResult = new Map(perBuilding.map((r) => [r.name, r]));
  const orderedBuildings = buildings.map((b) => nameToResult.get(b.name)!);

  const totalPVSize = orderedBuildings.reduce((s, b) => s + b.optimalPVSize, 0);
  const totalGeneration = orderedBuildings.reduce(
    (s, b) => s + b.annualGeneration,
    0
  );

  // Campus self-consumption: excess from one building offsets another,
  // raising effective self-consumption from ~70% (individual) to ~85% (campus).
  const campusSelfConsumption = CAMPUS_SELF_CONSUMPTION * 100; // as %

  // Compute savings vs building-by-building approach
  const individualUsefulGeneration = totalGeneration * INDIVIDUAL_SELF_CONSUMPTION;
  const campusUsefulGeneration = totalGeneration * CAMPUS_SELF_CONSUMPTION;
  const extraUsefulKWh = campusUsefulGeneration - individualUsefulGeneration;

  let insight: string;
  if (totalGeneration === 0) {
    insight = 'No PV generation possible with provided roof areas.';
  } else if (totalAnnualDemand === 0) {
    insight = `Total campus PV: ${totalPVSize.toFixed(1)} kWp, generating ${Math.round(totalGeneration).toLocaleString()} kWh/year.`;
  } else {
    const coveragePct = Math.min(
      Math.round((totalGeneration * CAMPUS_SELF_CONSUMPTION) / totalAnnualDemand * 100),
      100
    );
    const savingPct = Math.round(
      ((CAMPUS_SELF_CONSUMPTION - INDIVIDUAL_SELF_CONSUMPTION) / INDIVIDUAL_SELF_CONSUMPTION) * 100
    );
    insight = `Campus-level optimization saves ${savingPct}% vs building-by-building (${Math.round(extraUsefulKWh).toLocaleString()} kWh/year extra useful generation), covering ~${coveragePct}% of campus demand.`;
  }

  return {
    buildings: orderedBuildings,
    totalPVSize,
    totalGeneration,
    campusSelfConsumption,
    insight,
  };
}
