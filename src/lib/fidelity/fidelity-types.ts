export type FidelityLevel = 1 | 2 | 3;

/**
 * Geometric level-of-detail — model detail axis, independent of FidelityLevel
 * (which tracks data-source breadth). A building can be FidelityLevel 3
 * (rich data) but GeometricLOD "L2" (no geometric refinement applied yet).
 *   L1 = era defaults only (no ledger data applied)
 *   L2 = ledger-driven (current procedural output: heights, floor count, roof shape from 건축물대장)
 *   L3 = per-orientation WWR + explicit footprint polygon + per-floor heights from calibration overrides
 */
export type GeometricLOD = "L1" | "L2" | "L3";

/**
 * Provenance record for a single calibration override applied on top of
 * era+code inference. Every override in a building-calibration file must
 * carry one of these — see src/lib/fidelity/building-calibration-loader.ts.
 */
export interface OverrideRationale {
  /** Dotted path into MaterialProperties, e.g. "walls.uValue" */
  field: string;
  /** What era+code inference (material-inference.ts) produced */
  inferredValue: unknown;
  /** What the calibration sets instead */
  overrideValue: unknown;
  /** Specific source document, e.g. "건축물대장:frstRegstrGbCd", "permit-drawing-A3", "operator-self-report", "manufacturer-spec-sheet" */
  source: string;
  /** Narrative: "if we could infer from X, we wouldn't need this override" — feeds future material-inference.ts improvements */
  hypothesisForInference: string;
}

/**
 * Per-building calibration record — file-based overrides keyed by buildingId
 * (default resolver: buildingId = PNU). Loaded via building-calibration-loader.ts.
 */
export interface BuildingCalibration {
  /** buildingId this calibration applies to (defaults to PNU) */
  buildingId: string;
  /** 19-digit 필지고유번호, when buildingId is PNU-derived */
  pnu?: string;
  overrides: OverrideRationale[];
  geometricLOD: GeometricLOD;
  notes?: string;
}

export interface DataSource {
  name: string;
  available: boolean;
  source: 'public' | 'uploaded' | 'ifc' | 'sensor';
  confidence: 'low' | 'medium' | 'high';
}

export interface FidelityReport {
  level: FidelityLevel;
  dataSources: DataSource[];
  availableCount: number;
  totalPossible: number;
  completeness: number; // 0-1
}

export interface UpgradeItem {
  description: string;       // e.g. "Upload monthly energy bills (gas + electric) from 2023-2025"
  targetLevel: FidelityLevel;
  category: 'energy' | 'geometry' | 'material' | 'equipment' | 'sensor';
  impact: 'high' | 'medium' | 'low'; // how much this improves the twin
}

export interface UpgradeChecklist {
  currentLevel: FidelityLevel;
  items: UpgradeItem[];
  nextLevel: FidelityLevel | null; // null if already at Level 3
}
