// src/lib/portfolio/types.ts
// Supporting types for the v7.0 Prediction Data Product (Phase 35).
//
// Only FootprintGeometry is defined here for Task 3.
// PredictionRow, ReleaseManifest, CalibrationJson will be added in Phase 35 Task 9/8.

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
