export type SourceKind =
  | "cad-exact" | "cad-converted" | "cad-traced"
  | "vworld-measured" | "ledger" | "manual" | "era-estimate";

export type ElementKind = "wall" | "slab";

export interface BimEngineInput {
  pk: string;
  title?: string;
  cadFootprint?: { rings: [number, number][][]; source: "cad-exact" | "cad-converted" | "cad-traced" };
  vworldFootprint?: { rings: [number, number][][]; measuredHeightM?: number; groundFloors?: number };
  ledger?: { heightM?: number; floors?: number };
  params?: { floors?: number; heightM?: number; year?: number };
  defaultStoreyHeightM?: number;
}

export interface SpatialFeature {
  kind: "footprint" | "height" | "floors";
  footprint?: [number, number][][];
  heightM?: number;
  floors?: number;
  source: SourceKind;
}

export interface Conflict {
  field: "height" | "floors";
  sources: { source: SourceKind; value: number }[];
  chosen: SourceKind;
  deltaPct: number;
}

export interface FusedModel {
  pk: string;
  title: string;
  footprint: [number, number][][];
  footprintSource: SourceKind;
  floors: number;
  floorsSource: SourceKind;
  storeyHeightM: number;
  totalHeightM: number;
  heightSource: SourceKind;
  wallThicknessM: number;
}

export interface GeneratedElement {
  expressId: number;
  kind: ElementKind;
  storey: number;
  geomSource: SourceKind;
  heightSource: SourceKind;
}

export interface ValidationCheck {
  id: "ring-closed" | "slab-area" | "storey-monotonic" | "roundtrip-count";
  passed: boolean;
  detail: string;
  elementIds?: number[];
}

export interface ValidationReport {
  checks: ValidationCheck[];
  passed: boolean;
}

export interface ElementConfidence {
  expressId: number;
  kind: ElementKind;
  sconf: number;
  geomScore: number;
  heightScore: number;
  topologyPenalty: number;
}

export interface HitlFlag {
  expressId: number;
  kind: ElementKind;
  sconf: number;
  reason: string;
}

export interface BimEngineResult {
  ifcBytes: Uint8Array;
  model: FusedModel;
  elements: ElementConfidence[];
  hitlFlags: HitlFlag[];
  conflicts: Conflict[];
  validation: ValidationReport;
}

export const ENGINE_CONSTANTS = {
  DEFAULT_STOREY_HEIGHT_M: 3.3,
  DEFAULT_WALL_THICKNESS_M: 0.3,
  CONFLICT_TOLERANCE_PCT: 10,
  SLAB_AREA_TOLERANCE_PCT: 2,
  HITL_THRESHOLD: 0.85,
  W_GEOM: 0.6,
  W_HEIGHT: 0.4,
  TOPOLOGY_PENALTY: 0.2,
} as const;
