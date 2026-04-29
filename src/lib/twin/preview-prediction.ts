// src/lib/twin/preview-prediction.ts
// Inline prediction preview for Twin stage until the Python pipeline emits
// per-building rows. Deterministic, purely feature-driven — NOT a replacement
// for the released model. Surfaced to the UI with isPreview=true so callers
// can signal the provisional nature.

import type { PortfolioFeatureVector } from "@/lib/portfolio/features";
import type {
  CalibrationReport,
  ReleaseManifest,
  TwinPrediction,
} from "./release-types";

// Rough use-type baselines (kWh/m²·yr) derived from Korean public energy
// disclosure averages. Held inline so the Twin stage can render an
// interpretable readout without awaiting the pipeline.
const USE_TYPE_BASELINE: Record<number, number> = {
  0: 162, // residential
  1: 218, // office
  2: 205, // mixed
  3: 245, // retail
  4: 190, // other
};

// Climate zone multiplier (1.0 = central baseline).
const CLIMATE_MULTIPLIER: Record<number, number> = {
  0: 1.0, // central
  1: 0.91, // southern
  2: 0.96, // jeju
};

export interface PredictionGrade {
  letter: string;
  description: string;
}

function gradeFromEui(eui: number): PredictionGrade {
  if (eui < 120) return { letter: "A+", description: "Exceptional" };
  if (eui < 150) return { letter: "A", description: "High efficiency" };
  if (eui < 185) return { letter: "B", description: "Above typical" };
  if (eui < 215) return { letter: "C", description: "Typical" };
  if (eui < 260) return { letter: "D", description: "Below typical" };
  return { letter: "E", description: "Inefficient" };
}

/**
 * Deterministic preview prediction derived from the feature vector.
 * Combines a use-type baseline with climate, envelope (wall U, window SHGC),
 * and vintage adjustments. The released model will supersede this.
 */
export function derivePreviewPrediction(
  features: PortfolioFeatureVector,
  manifest: ReleaseManifest,
  calibration: CalibrationReport
): TwinPrediction {
  const baseline =
    USE_TYPE_BASELINE[features.useTypeCode] ?? USE_TYPE_BASELINE[4];
  const climate = CLIMATE_MULTIPLIER[features.climateZoneCode] ?? 1.0;

  // Envelope adjustment: weighted sum of normalised deviations from era baseline.
  // Higher U-value / SHGC ⇒ higher EUI.
  const wallFactor = 0.85 + (features.wallUValuePrior - 0.4) * 0.35;
  const windowFactor = 0.92 + (features.windowUValuePrior - 2.4) * 0.08;
  const shgcFactor = 0.96 + (features.windowShgcPrior - 0.4) * 0.22;
  const ageFactor = features.constructionYear >= 2010 ? 0.88
    : features.constructionYear >= 2000 ? 0.95
    : features.constructionYear >= 1990 ? 1.02
    : 1.14;
  const compactnessFactor = 1.1 - features.compactness * 0.12;

  const eui =
    baseline *
    climate *
    wallFactor *
    windowFactor *
    shgcFactor *
    ageFactor *
    compactnessFactor;

  const { p10_multiplier, p90_multiplier, intervalCoverage } =
    calibration.confidence;

  const grade = gradeFromEui(eui);

  return {
    releaseVersion: manifest.version,
    eui: Math.round(eui * 10) / 10,
    unit: manifest.prediction.unit,
    grade: grade.letter,
    gradeDescription: grade.description,
    confidenceLow: Math.round(eui * p10_multiplier * 10) / 10,
    confidenceHigh: Math.round(eui * p90_multiplier * 10) / 10,
    confidenceCoverage: intervalCoverage,
    isPreview: true,
  };
}
