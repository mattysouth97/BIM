// src/lib/portfolio/types.ts
// Supporting types for the v7.0 Prediction Data Product (Phase 35).
//
// FootprintGeometry — Task 3.
// PredictionRow, ReleaseManifest, CalibrationJson — Task 9.

/**
 * Pre-fetched footprint geometry for a building. Produced by the v4.0
 * public-data pipeline (VWorld + bldrgst fusion). The feature extractor
 * consumes this directly — it does NOT call any API.
 */
export interface FootprintGeometry {
  /** Outer ring as [lng, lat] pairs in WGS-84. Minimum 3 vertices. */
  outerRing: Array<[number, number]>;
  /** Pre-computed footprint area in m² (UTM or equivalent projection, not raw lng/lat). */
  areaSqm: number;
  /** Pre-computed perimeter in m (same projection). */
  perimeterM: number;
  /** Long-axis / short-axis of oriented bounding box. >= 1. */
  aspectRatio: number;
}

/**
 * One row of a published prediction release. Shape mirrors the Parquet
 * schema described in the data dictionary — see
 * public/releases/v0.1.0/data-dictionary.md "Prediction output fields".
 */
export interface PredictionRow {
  /** 10-digit 법정동 code the building belongs to */
  bjdongCd: string;
  /** 건축물대장 PK (mgmBldrgstPk) */
  buildingPk: string;
  /** Predicted primary energy use intensity, kWh/m²·yr */
  predictedEuiKwhPerSqmYr: number;
  /** K-Green-Grade-v2 predicted energy grade */
  predictedGrade: string;
  /** Model artifact version used for inference */
  modelVersion: string;
  /** ISO-8601 timestamp the row was generated */
  generatedAt: string;
}

/** Per-release manifest metadata — written by ml/portfolio/generate_release.py. */
export interface ReleaseManifest {
  version: string;
  codename?: string;
  generatedAt: string;
  trainingCutoff?: string;
  modelFamily?: string;
  modelVersion?: string;
  featureSchemaVersion?: string;
  coverage?: {
    buildingCount: number;
    sidoCount?: number;
    sigunguCount?: number;
    structureTypes?: string[];
    useTypes?: string[];
  };
  prediction?: {
    target: string;
    unit: string;
    gradingScheme?: string;
  };
  lineage?: Record<string, string>;
  license?: string;
  notes?: string;
}

/** Top-level latest-release pointer at public/releases/manifest.json. */
export interface LatestReleasePointer {
  latest: string;
  history: string[];
}

/** Machine-readable calibration report — public/releases/<version>/calibration.json. */
export interface CalibrationJson {
  version: string;
  tier?: string;
  tierLabel?: string;
  /**
   * P2-05 — false ⇒ no model has been trained/validated; accuracy `metrics`
   * are intentionally absent (never fabricated). Consumers must not present
   * validated-accuracy claims when this is false/omitted-with-no-metrics.
   */
  validated?: boolean;
  notes?: string;
  /** Present only for a genuinely validated release (P2-05). */
  metrics?: {
    mape: number;
    cvRmse?: number;
    rmse?: number;
    kendallTau: number;
    spearmanRho?: number;
    r2?: number;
    medianAbsError?: number;
    medianAbsErrorUnit?: string;
  };
  confidence?: Record<string, number>;
  holdout?: {
    buildingCount: number;
    observationCount?: number;
    splitStrategy?: string;
  };
  segmentPerformance?: Array<{ segment: string; mape: number; count: number }>;
  featureImportance?: Array<{ name: string; rank: number; gain: number }>;
  sampleSize?: number;
  heldOutMethod?: string;
  perEra?: unknown[];
  knownLimitations?: string[];
}

/** Result of a ReleaseStore.getPredictions() call — always honest about absence. */
export type PredictionsResult =
  | { status: "ok"; rows: PredictionRow[]; releaseVersion: string; schemaVersion: string; generatedAt: string }
  | { status: "unknown-region" }
  | { status: "data-unavailable"; reason: string };
