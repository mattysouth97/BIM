// Phase 01 (D-10): one PV sizing/yield calculation for physics and economics.
// Pure functions — no React, no stores. Named inputs prevent numeric-slot mistakes.

export type PvRoofType = 'flat' | 'gable' | 'hip' | 'sawtooth';
export const ROOF_UTILIZATION_FACTORS: Readonly<Record<PvRoofType, number>> = {
  flat: 0.7, gable: 0.5, hip: 0.4, sawtooth: 0.3,
};
export const M2_PER_KWP = 5.0; // mono-Si panels
/**
 * Plane-of-array gain from tilting/orienting panels vs the horizontal
 * irradiance the peak-sun-hour figures describe. ~1.15 at Korean latitudes
 * (33–38°N) for near-optimally tilted south-facing arrays (audit finding #6).
 */
export const TILT_FACTOR = 1.15;
/** System performance ratio (inverter, soiling, temperature, wiring losses). */
export const PERFORMANCE_RATIO = 0.80;

export type PvGenerationResult = {
  annualKWh: number;
  systemSizeKWp: number;
  roofUtilization: number;
  invalidInput: boolean;
} & (
  | { sizingBasis: 'declared_capacity' }
  | { sizingBasis: 'roof_utilization_assumption'; assumption: string }
);

export function annualPvGenerationKWh(input: {
  peakSunHours: number;
  systemSizeKWp?: number;
  roofAreaSqm?: number;
  roofType?: PvRoofType;
}): PvGenerationResult {
  const declared = input.systemSizeKWp !== undefined;
  const roofUtilization = ROOF_UTILIZATION_FACTORS[input.roofType ?? 'flat'];
  const area = input.roofAreaSqm ?? 0;
  const size = declared ? input.systemSizeKWp! : area * roofUtilization / M2_PER_KWP;
  const invalidInput = !Number.isFinite(size) || size < 0 ||
    !Number.isFinite(input.peakSunHours) || input.peakSunHours <= 0;
  const systemSizeKWp = Number.isFinite(size) && size >= 0 ? size : 0;
  // Seoul (3.5 PSH): 3.5 ×365 ×1.15 ×0.80 ≈1,175 kWh/kWp; the inherited
  // model's stated 1,100–1,300 band, not an independently measured validation.
  const generation = invalidInput ? 0 : systemSizeKWp * input.peakSunHours * 365 * TILT_FACTOR * PERFORMANCE_RATIO;
  const finiteGeneration = Number.isFinite(generation);
  return {
    annualKWh: finiteGeneration ? generation : 0,
    systemSizeKWp,
    roofUtilization,
    invalidInput: invalidInput || !finiteGeneration,
    ...(declared ? { sizingBasis: 'declared_capacity' as const } : {
      sizingBasis: 'roof_utilization_assumption' as const,
      assumption: `PV sizing assumes roof area ${area} m² × utilization ${roofUtilization} ÷ ${M2_PER_KWP} m²/kWp; not measured module capacity.`,
    }),
  };
}
