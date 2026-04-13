// src/lib/campus/load-diversity.ts
// Campus-level load diversity factor calculation.
// Pure functions — no React, no Three.js.

export interface LoadDiversityResult {
  individualPeakSum: number;   // kW — sum of each building's peak demand
  campusPeakDemand: number;    // kW — actual campus peak (lower due to diversity)
  diversityFactor: number;     // 0-1, campusPeak / individualPeakSum
  peakReduction: number;       // kW saved
  insight: string;             // human-readable summary
}

/** 24-hour demand profiles (0-1 per hour) keyed by use-type keyword */
const USE_TYPE_PROFILES: Record<string, number[]> = {
  // Office: 9am-6pm weekdays
  office: [
    0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2, // 0-7
    0.5, 0.9, 1.0, 1.0, 0.9, 1.0, 1.0, 1.0, // 8-15
    0.9, 0.8, 0.5, 0.2, 0.1, 0.1, 0.1, 0.1, // 16-23
  ],
  // Residential: morning + evening peaks
  residential: [
    0.3, 0.2, 0.2, 0.2, 0.2, 0.3, 0.6, 1.0, // 0-7
    0.9, 0.5, 0.4, 0.4, 0.5, 0.4, 0.4, 0.4, // 8-15
    0.5, 0.6, 0.8, 1.0, 0.9, 0.8, 0.6, 0.4, // 16-23
  ],
  // Retail: 10am-9pm
  retail: [
    0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, // 0-7
    0.2, 0.4, 0.8, 1.0, 1.0, 1.0, 1.0, 1.0, // 8-15
    1.0, 1.0, 0.9, 0.8, 0.5, 0.3, 0.2, 0.1, // 16-23
  ],
  // Factory: near-flat 24/7
  factory: [
    0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.9, 0.9, // 0-7
    1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, // 8-15
    1.0, 1.0, 0.9, 0.9, 0.9, 0.9, 0.8, 0.8, // 16-23
  ],
  // School: 8am-4pm weekdays
  school: [
    0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2, // 0-7
    0.7, 1.0, 1.0, 1.0, 1.0, 1.0, 0.9, 0.5, // 8-15
    0.3, 0.2, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, // 16-23
  ],
};

/** Default profile for unrecognised use types */
const DEFAULT_PROFILE = USE_TYPE_PROFILES['office'];

/**
 * Resolve a demand profile from a free-form use-type string.
 * Matches against profile keys as substrings (case-insensitive).
 */
function resolveProfile(useType: string): number[] {
  const key = useType.toLowerCase();
  for (const profileKey of Object.keys(USE_TYPE_PROFILES)) {
    if (key.includes(profileKey)) {
      return USE_TYPE_PROFILES[profileKey];
    }
  }
  return DEFAULT_PROFILE;
}

export function calculateLoadDiversity(
  buildings: Array<{
    name: string;
    peakHeating: number; // kW
    peakCooling: number; // kW
    useType: string;
  }>
): LoadDiversityResult {
  if (buildings.length === 0) {
    return {
      individualPeakSum: 0,
      campusPeakDemand: 0,
      diversityFactor: 1,
      peakReduction: 0,
      insight: 'No buildings provided.',
    };
  }

  // Each building's combined peak = peakHeating + peakCooling
  // (season peaks don't coincide, but we use a conservative combined figure
  //  that represents the worst-case total electrical demand)
  const buildingPeaks = buildings.map((b) => b.peakHeating + b.peakCooling);
  const individualPeakSum = buildingPeaks.reduce((s, p) => s + p, 0);

  if (individualPeakSum === 0) {
    return {
      individualPeakSum: 0,
      campusPeakDemand: 0,
      diversityFactor: 1,
      peakReduction: 0,
      insight: 'All buildings report zero peak demand.',
    };
  }

  // Single building — no diversity
  if (buildings.length === 1) {
    return {
      individualPeakSum,
      campusPeakDemand: individualPeakSum,
      diversityFactor: 1,
      peakReduction: 0,
      insight: 'Single building — no campus diversity benefit.',
    };
  }

  // Build an hourly campus demand curve by summing each building's
  // scaled hourly contribution.
  const hourlyDemand = new Array<number>(24).fill(0);
  for (let i = 0; i < buildings.length; i++) {
    const profile = resolveProfile(buildings[i].useType);
    const peak = buildingPeaks[i];
    for (let h = 0; h < 24; h++) {
      hourlyDemand[h] += profile[h] * peak;
    }
  }

  const campusPeakDemand = Math.max(...hourlyDemand);
  const diversityFactor = campusPeakDemand / individualPeakSum;
  const peakReduction = individualPeakSum - campusPeakDemand;
  const reductionPct = Math.round((1 - diversityFactor) * 100);

  const insight =
    reductionPct > 0
      ? `Campus-level diversity reduces peak demand by ${reductionPct}% (saves ${peakReduction.toFixed(1)} kW vs sum of individual peaks).`
      : 'Buildings share the same peak hour — no diversity benefit.';

  return {
    individualPeakSum,
    campusPeakDemand,
    diversityFactor,
    peakReduction,
    insight,
  };
}
