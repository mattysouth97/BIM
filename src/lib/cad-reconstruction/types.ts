// src/lib/cad-reconstruction/types.ts
//
// Evidence-to-CAD reconstruction contracts.
//
// The invariant this module exists to protect: geometry that was EXTRACTED,
// OBSERVED, CALCULATED or INFERRED must stay distinguishable all the way to
// the DXF and to every report generated beside it. Nothing in this pipeline
// may convert an inference into a fact.
//
// Units: millimetres, integers, one local metric frame per reconstruction.
// Data-only — no source bytes, no React, no DOM.

import type {
  BrAreaInfo,
  BrFloorInfo,
  BrRecapTitleInfo,
  BrTitleInfo,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Confidence                                                          */
/* ------------------------------------------------------------------ */

/**
 * Per-object provenance state. Ordered strongest to weakest, except
 * X-UNRESOLVED, which is not "weakest" but "sources disagree" — it must never
 * be quietly downgraded to D-INFERRED to make a drawing look finished.
 */
export type EvidenceGrade =
  | "A-VERIFIED"
  | "B-OBSERVED"
  | "C-CALCULATED"
  | "D-INFERRED"
  | "X-UNRESOLVED";

export const EVIDENCE_GRADES: readonly EvidenceGrade[] = [
  "A-VERIFIED",
  "B-OBSERVED",
  "C-CALCULATED",
  "D-INFERRED",
  "X-UNRESOLVED",
] as const;

/** Source hierarchy tier. 1 = direct geometric evidence, 5 = inference. */
export type SourceTier = 1 | 2 | 3 | 4 | 5;

/** The weaker of two grades — used when geometry combines several inputs. */
export function weakerGrade(a: EvidenceGrade, b: EvidenceGrade): EvidenceGrade {
  if (a === "X-UNRESOLVED" || b === "X-UNRESOLVED") return "X-UNRESOLVED";
  return EVIDENCE_GRADES.indexOf(a) >= EVIDENCE_GRADES.indexOf(b) ? a : b;
}

/* ------------------------------------------------------------------ */
/* Source inventory                                                    */
/* ------------------------------------------------------------------ */

export type SourceKind =
  | "building_register_title"
  | "building_register_recap"
  | "building_register_floors"
  | "building_register_areas"
  | "gis_building_outline"
  | "gis_parcel_outline"
  | "gis_measured_attributes"
  | "gis_zoning_district"
  | "user_statement"
  | "code_table";

export interface SourceRecord {
  sourceId: string;
  sourceType: SourceKind;
  sourceTitle: string;
  /** Dataset or endpoint the evidence came from — never a secret or a key. */
  sourceLocation: string;
  accessDate: string;
  authorityLevel: SourceTier;
  scaleAvailable: boolean;
  dimensionsAvailable: boolean;
  coordinateSystem: string | null;
  floorsCovered: string;
  disciplinesCovered: string;
  knownLimitations: string[];
  confidence: EvidenceGrade;
  /**
   * False when the source was looked for and did not answer. The register's
   * four endpoints fail independently and intermittently — an absent one is
   * recorded as absent, never read as a zero.
   */
  available: boolean;
}

/* ------------------------------------------------------------------ */
/* User claims — what the prompt module produces                       */
/* ------------------------------------------------------------------ */

export type ClaimKind =
  | "overall_width_m"
  | "overall_depth_m"
  | "footprint_area_sqm"
  | "site_area_sqm"
  | "building_height_m"
  | "floor_to_floor_m"
  | "storeys_above"
  | "storeys_below"
  | "wall_thickness_mm"
  | "window_ratio"
  | "entrance_orientation"
  | "core_position"
  | "roof_form"
  | "structure"
  | "note";

export type Orientation = "north" | "east" | "south" | "west";

export interface ReconstructionClaim {
  id: string;
  kind: ClaimKind;
  /** Numeric for dimensional claims, string for categorical, null for notes. */
  value: number | string | null;
  unit: string | null;
  /**
   * A-VERIFIED only when the user says the value was measured or read off a
   * document. Anything they merely believe stays D-INFERRED.
   */
  grade: EvidenceGrade;
  measured: boolean;
  /** The user's own words this claim was read from. Never paraphrased away. */
  quote: string;
  reason: string;
}

/* ------------------------------------------------------------------ */
/* Geometric control network                                           */
/* ------------------------------------------------------------------ */

export type ControlId =
  | "C1"
  | "C2"
  | "C3"
  | "C4"
  | "C5"
  | "C6"
  | "C7"
  | "C8"
  | "C9"
  | "C10"
  | "C11"
  | "C12"
  | "C13"
  | "C14";

export interface GeometricControl {
  id: ControlId;
  key: string;
  labelKo: string;
  labelEn: string;
  value: number | string | null;
  unit: string | null;
  grade: EvidenceGrade;
  sourceIds: string[];
  /** How the value was obtained — extraction, calculation, or rule. */
  method: string;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

/** Millimetres in the local building frame. X = east, Y = north. */
export type PointMm = [number, number];
/** Closed ring; the first vertex is NOT repeated at the end. */
export type RingMm = PointMm[];

export interface LocalFrame {
  /** WGS84 origin of the local metric frame, or null when none was available. */
  originLngLat: [number, number] | null;
  /** proj4 definition of the working CRS, kept for the record. */
  projection: string;
  /** Degrees from project north (+Y) to true north. */
  trueNorthDeg: number;
  /** The plus/minus 0.000 datum, described. */
  zDatum: string;
  grade: EvidenceGrade;
}

export interface ReconLevel {
  id: string;
  name: string;
  floorNo: number;
  below: boolean;
  /** 층별개요 area, when the register stated one. */
  registeredAreaSqm: number | null;
  registeredUse: string | null;
  elevationMm: number;
  floorToFloorMm: number;
  floorToFloorGrade: EvidenceGrade;
  /** Outer plate ring for this level. */
  plate: RingMm;
  plateGrade: EvidenceGrade;
  /** Area of `plate`, recomputed from the ring — never a cached input. */
  modelAreaSqm: number;
  /** Uniform scale applied to the footprint to reach the registered area. */
  plateScale: number;
  /**
   * The face area was removed from, when evidence determined one (P2-31).
   * Null means the plate was shrunk concentrically because nothing said which
   * way it steps — the area is right and the face is unknown, and that must
   * stay visible rather than reading as a decision.
   */
  setbackFacing?: Orientation | null;
  /** Why that face — see `SetbackReason` in `setback.ts`. */
  setbackReason?: "daylight_setback" | "lot_slack" | "undetermined";
}

export interface ReconWall {
  id: string;
  levelId: string;
  /** Centreline, in plan. */
  centreline: [PointMm, PointMm];
  thicknessMm: number;
  kind: "exterior" | "core";
  grade: EvidenceGrade;
}

export interface ReconOpening {
  id: string;
  levelId: string;
  type: "window" | "door";
  /** Index of the plate edge hosting this opening — the host-validation key. */
  hostEdgeIndex: number;
  hostWallId: string;
  /** The hole in the wall, in plan. */
  plan: [PointMm, PointMm];
  widthMm: number;
  sillMm: number;
  headMm: number;
  grade: EvidenceGrade;
}

export interface ReconCore {
  id: string;
  ring: RingMm;
  areaSqm: number;
  hasElevator: boolean;
  stairCount: number;
  /** Levels the core is present on — vertical continuity is asserted here. */
  levelIds: string[];
  grade: EvidenceGrade;
}

export interface ReconGrid {
  bayXMm: number;
  bayYMm: number;
  /** Grid line positions in the local frame. */
  xLines: number[];
  yLines: number[];
  columnSizeMm: number;
  columns: PointMm[];
  grade: EvidenceGrade;
}

export interface ReconElevation {
  id: string;
  facing: Orientation;
  /** Outline in its own drawing frame: x along the facade, y = height. */
  outline: RingMm;
  floorLines: Array<{ levelId: string; yMm: number; label: string }>;
  openings: Array<{ id: string; rect: RingMm; grade: EvidenceGrade }>;
  grade: EvidenceGrade;
}

export interface ReconSection {
  id: string;
  label: string;
  /** Cut direction: along X (east-west) or Y (north-south). */
  axis: "x" | "y";
  outline: RingMm;
  slabs: RingMm[];
  coreProfile: RingMm | null;
  floorLines: Array<{ levelId: string; yMm: number; label: string }>;
  grade: EvidenceGrade;
}

/* ------------------------------------------------------------------ */
/* Ledgers                                                             */
/* ------------------------------------------------------------------ */

export interface AssumptionEntry {
  id: string;
  element: string;
  floor: string;
  assumption: string;
  reason: string;
  sourceContext: string;
  confidence: EvidenceGrade;
  impactIfWrong: string;
  verificationMethod: string;
  status: "open" | "verified" | "superseded";
}

export interface ConflictEntry {
  id: string;
  subject: string;
  sourceA: string;
  valueA: string;
  sourceB: string;
  valueB: string;
  magnitude: string;
  possibleExplanation: string;
  resolutionStatus: "unresolved" | "documented";
  requiredVerification: string;
  /** Geometry the conflict attaches to; drawn on X-CONFLICT when present. */
  geometry?: RingMm;
}

export interface AreaValidationRow {
  metric: string;
  sourceValue: number | null;
  modelValue: number | null;
  deltaSqm: number | null;
  deltaPct: number | null;
  status: "PASS" | "REVIEW" | "NO_SOURCE";
}

export interface QaCheck {
  id: string;
  group:
    | "polygon"
    | "line"
    | "building"
    | "area"
    | "cross-drawing"
    | "dxf"
    | "round-trip";
  labelKo: string;
  labelEn: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail: string;
}

export interface FieldVerificationItem {
  rank: number;
  measurement: string;
  reason: string;
  eliminates: string;
  method: string;
}

/* ------------------------------------------------------------------ */
/* The canonical model                                                 */
/* ------------------------------------------------------------------ */

export const RECONSTRUCTION_MODEL_VERSION = "1.0.0" as const;

export interface ReconstructionModel {
  id: string;
  schemaVersion: typeof RECONSTRUCTION_MODEL_VERSION;
  /** R00 evidence ingestion, R01 estimated reconstruction, R02+ field-verified. */
  revision: "R00" | "R01" | "R02" | "R03" | "R04";
  createdAt: string;
  building: {
    buildingPk: string;
    name: string;
    address: string | null;
    useType: string | null;
    structure: string | null;
    structureKey: string;
    era: string;
    eraResolved: boolean;
    approvalDate: string | null;
    storeysAbove: number | null;
    storeysBelow: number | null;
  };
  frame: LocalFrame;
  sources: SourceRecord[];
  claims: ReconstructionClaim[];
  controls: GeometricControl[];
  site: {
    ring: RingMm | null;
    areaSqm: number | null;
    grade: EvidenceGrade;
    note: string;
  };
  footprint: {
    ring: RingMm;
    areaSqm: number;
    grade: EvidenceGrade;
    method: string;
  };
  levels: ReconLevel[];
  walls: ReconWall[];
  openings: ReconOpening[];
  core: ReconCore | null;
  grid: ReconGrid;
  elevations: ReconElevation[];
  sections: ReconSection[];
  assumptions: AssumptionEntry[];
  conflicts: ConflictEntry[];
  areaValidation: AreaValidationRow[];
  /** What this reconstruction is honestly called, in both languages. */
  titleKo: string;
  titleEn: string;
  /** Reasons no reconstruction was possible at all. */
  blockers: string[];
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export interface GisFootprintInput {
  polygon: number[][][] | null;
  source: "building" | "parcel" | null;
  attributes: {
    height: number | null;
    groundFloors: number | null;
    undergroundFloors: number | null;
  } | null;
  error: string | null;
}

/** 용도지역 as VWorld's `LT_C_UQ111` reports it. */
export interface ZoningInput {
  /** `uname`, verbatim — e.g. "제3종일반주거지역". Null when it did not answer. */
  district: string | null;
  /** Dataset the value came from, for the evidence register. */
  source: string;
  error: string | null;
}

export interface EvidenceInput {
  buildingPk: string;
  title: BrTitleInfo | null;
  recap: BrRecapTitleInfo | null;
  floors: BrFloorInfo[];
  areas: BrAreaInfo[];
  gis: GisFootprintInput | null;
  /**
   * The PARCEL outline, when one is available alongside a building outline
   * (P2-31). Used only to read which side of the lot the building leaves free,
   * which is what decides the face a setback comes off.
   *
   * Deliberately separate from `gis`: a lot is not a building, and a parcel
   * ring must never reach the footprint chain. `gis` already carries a parcel
   * as a *fallback* footprint; this field is the other case — a parcel held
   * next to a real outline rather than instead of one.
   */
  parcel?: GisFootprintInput | null;
  /** 용도지역, when the zoning layer answered (P2-31). */
  zoning?: ZoningInput | null;
  address: string | null;
  claims: ReconstructionClaim[];
  /** Injected so a reconstruction is reproducible in tests and in reports. */
  now?: string;
}
