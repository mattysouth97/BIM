// src/lib/twin/release-types.ts
// Shapes that describe a published prediction release.
// Consumed by the Twin-stage data-product surface (release rail, prediction
// readout, feature vector panel) and by the forthcoming /releases explorer.

export type CalibrationTier = "A" | "B" | "C" | "preview";

export interface ReleaseCoverage {
  buildingCount: number;
  sidoCount: number;
  sigunguCount: number;
  structureTypes: readonly string[];
  useTypes: readonly string[];
}

export interface ReleaseLineage {
  bldrgstSource: string;
  footprintSource: string;
  climateSource: string;
}

export interface ReleaseManifest {
  version: string;
  codename?: string;
  generatedAt: string; // ISO-8601 UTC
  trainingCutoff: string; // ISO date
  modelFamily: string;
  modelVersion: string;
  featureSchemaVersion: string;
  coverage: ReleaseCoverage;
  prediction: {
    target: string;
    unit: string;
    gradingScheme: string;
  };
  lineage: ReleaseLineage;
  license: string;
  notes?: string;
}

export interface CalibrationMetrics {
  mape: number;
  medianAbsError: number;
  medianAbsErrorUnit: string;
  rmse: number;
  kendallTau: number;
  spearmanRho: number;
  r2: number;
}

export interface CalibrationConfidence {
  /** Multiplier on point prediction yielding the lower prediction interval bound. */
  p10_multiplier: number;
  /** Multiplier on point prediction yielding the upper prediction interval bound. */
  p90_multiplier: number;
  /** Observed coverage rate — fraction of held-out observations that fell inside [p10, p90]. */
  intervalCoverage: number;
}

export interface SegmentPerformance {
  segment: string;
  mape: number;
  count: number;
}

export interface FeatureImportance {
  name: string;
  rank: number;
  gain: number;
}

export interface CalibrationReport {
  version: string;
  tier: CalibrationTier;
  tierLabel: string;
  metrics: CalibrationMetrics;
  confidence: CalibrationConfidence;
  holdout: {
    buildingCount: number;
    observationCount: number;
    splitStrategy: string;
  };
  segmentPerformance: SegmentPerformance[];
  featureImportance: FeatureImportance[];
}

/**
 * Point prediction + interval for a single twin. Eventually emitted by the
 * Python pipeline per building; for now the Twin stage derives a preview
 * prediction inline (see `derivePreviewPrediction`) so the UI can render with
 * zero backend dependency.
 */
export interface TwinPrediction {
  releaseVersion: string;
  eui: number;
  unit: string;
  grade: string;
  gradeDescription: string;
  confidenceLow: number;
  confidenceHigh: number;
  confidenceCoverage: number;
  /** True when derived inline from the feature vector (no released row yet). */
  isPreview: boolean;
}
