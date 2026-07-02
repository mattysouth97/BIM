export type QualityTier = 'minimal' | 'partial' | 'good' | 'excellent';

export interface QualityDimension {
  name: string;
  score: number;        // 0-100
  available: string[];  // which data fields are available
  missing: string[];    // which data fields are missing
}

export interface QualityScore {
  overall: number;  // 0-100 weighted average
  tier: QualityTier;  // derived from overall: 0-25=minimal, 25-50=partial, 50-75=good, 75-100=excellent
  dimensions: {
    geometry: QualityDimension;  // footprint, floor count, heights, total area
    codes: QualityDimension;     // structure code, use code, permit date
    energy: QualityDimension;    // actual consumption data available
    material: QualityDimension;  // confidence of material inference from era+code
  };
}
