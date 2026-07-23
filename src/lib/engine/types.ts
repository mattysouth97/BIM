export type SourceKind =
  | "cad-exact" | "cad-converted" | "cad-traced"
  | "vworld-measured" | "ledger" | "manual" | "era-estimate";

export type ElementKind = "wall" | "slab" | "window" | "door";

/** Window-placement parameters (Slice-2), sourced from the era-based facade recipe. */
export interface FacadeParams {
  windowWidth: number;
  windowHeight: number;
  sillHeight: number;
  windowSpacing: number;
}

export interface BimEngineInput {
  pk: string;
  title?: string;
  cadFootprint?: { rings: [number, number][][]; source: "cad-exact" | "cad-converted" | "cad-traced" };
  vworldFootprint?: { rings: [number, number][][]; measuredHeightM?: number; groundFloors?: number };
  ledger?: { heightM?: number; floors?: number };
  params?: { floors?: number; heightM?: number; year?: number };
  defaultStoreyHeightM?: number;
  facade?: FacadeParams;
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
  facade: FacadeParams | null;
  facadeSource: SourceKind;
}

export interface GeneratedElement {
  expressId: number;
  kind: ElementKind;
  storey: number;
  geomSource: SourceKind;
  heightSource: SourceKind;
  /** Set only on "window" elements — provenance of the facade recipe used to place them. */
  facadeSource?: SourceKind;
}

export interface ValidationCheck {
  id: "ring-closed" | "footprint-nondegenerate" | "storey-monotonic" | "element-count" | "openings-hosted";
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
  // Not yet consumed (Slice-1 has no distinct per-slab profiles to compare —
  // see validate.ts's "footprint-nondegenerate" check comment); reserved for
  // Slice-2's per-slab area delta check.
  SLAB_AREA_TOLERANCE_PCT: 2,
  HITL_THRESHOLD: 0.85,
  W_GEOM: 0.6,
  W_HEIGHT: 0.4,
  TOPOLOGY_PENALTY: 0.2,
  // Windows are placed from era-based facade defaults (never measured), so
  // their geometry confidence is capped low — this MUST keep window sconf
  // below HITL_THRESHOLD (0.85) so they are always flagged, never presented
  // as measured. See score.ts's FACADE_SCORE table. This applies to ALL
  // heuristic-placed openings — windows AND the Slice-3 entrance door.
  FACADE_ESTIMATE_SCORE: 0.5,
  // Slice-3: the single ground-floor entrance door's size — a heuristic
  // placement (centered on the longest footprint edge), never measured.
  DEFAULT_DOOR: { width: 1.2, height: 2.1 },
} as const;

/** Era-default window placement (Slice-2) — used when no finer facade source is known. */
export const DEFAULT_FACADE: FacadeParams = {
  windowWidth: 1.2,
  windowHeight: 1.5,
  sillHeight: 0.9,
  windowSpacing: 1.5,
};
