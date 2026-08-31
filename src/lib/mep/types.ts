// src/lib/mep/types.ts
//
// Canonical MEP network model. This is the single source of truth that the
// layer generators render FROM — geometry is derived, never authoritative.
//
// Design rules (see docs/05_Research/MEP Pipeline - Current vs Target.md):
// - Pure data: JSON-serializable, no THREE imports, metres, XZ plan, Y-up,
//   footprint-local origin (identical to the layer generators' frame).
// - Every element knows its system, its role in the source→terminal
//   hierarchy, and the basis of every sized quantity.
// - Deterministic: planMepSystems(recipe) is a pure function; the model
//   carries the generator version + an input fingerprint for reproducibility.

export type MepDiscipline = "hvac" | "plumbing" | "fire" | "electrical";

export type MepSystemType =
  // air side
  | "supply-air"
  | "return-air"
  | "outdoor-air"
  | "exhaust-air"
  // hydronic
  | "chilled-water-supply"
  | "chilled-water-return"
  | "heating-water-supply"
  | "heating-water-return"
  | "refrigerant"
  | "condensate"
  // plumbing
  | "domestic-cold-water"
  | "domestic-hot-water"
  | "dhw-return"
  | "sanitary-drain"
  | "sanitary-vent"
  // fire
  | "sprinkler"
  // electrical
  | "power"
  | "cable-tray";

/** Where a numeric value came from — mirrors the project's evidence discipline. */
export type MepBasis = "calculated" | "estimated" | "defaulted" | "imported" | "user";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Hierarchy role, root → leaf. Renders should keep this visually legible. */
export type SegmentRole =
  | "service" // site entry (water service line, utility feeder)
  | "riser" // vertical distribution in a shaft
  | "main" // floor main along the corridor spine
  | "branch" // zone branch off the main
  | "runout" // terminal runout (last hop to a device)
  | "connector"; // equipment hookup stub (plant ↔ riser, coil ↔ pipe)

export type SegmentShape =
  | { kind: "round"; diameterM: number }
  | { kind: "rect"; widthM: number; heightM: number }
  | { kind: "tray"; widthM: number; heightM: number };

export type NodeKind =
  | "source" // system origin: plant, panel, street connection
  | "equipment" // placed equipment (AHU, pump, panel, VAV…)
  | "junction" // tee/wye point where a branch leaves a main
  | "bend" // direction change (an elbow is derived here)
  | "terminal" // diffuser, fixture, sprinkler head, luminaire feed
  | "transition"; // size/shape change point (reducer/transition derived)

export interface EquipmentSpecInfo {
  /** GLB asset id from equipment-assets.ts, when a hero asset exists. */
  assetId?: string;
  /** Legacy userData.type tag so the existing selection stack keeps working. */
  tag: string;
  widthM: number;
  heightM: number;
  depthM: number;
  rotationY: number;
  /**
   * Maintenance/access envelope, metres beyond the body on each side.
   * Rendered only in QA modes; validated against other systems' geometry.
   */
  clearance?: { front: number; back: number; left: number; right: number; top: number };
  /** Named connection points, local offsets from the node position. */
  ports?: { id: string; system: MepSystemType; offset: Vec3 }[];
}

export interface MepNode {
  id: string;
  systemId: string;
  kind: NodeKind;
  position: Vec3;
  floorNo: number | null;
  label?: string;
  equipment?: EquipmentSpecInfo;
  /** For terminals: served zone id and design demand at this device. */
  terminal?: { zoneId: string; demand: number; demandUnit: "m3h" | "lps" | "kw" | "fu" | "va" };
}

export interface MepSegment {
  id: string;
  systemId: string;
  from: string;
  to: string;
  role: SegmentRole;
  shape: SegmentShape;
  /** Accumulated design flow carried by this segment (unit per system). */
  flow: number;
  flowUnit: "m3h" | "lps" | "kw" | "fu" | "va";
  sizeBasis: MepBasis;
  flowBasis: MepBasis;
  floorNo: number | null;
  /** Gravity systems: slope (rise/run, positive = falls toward `to`). */
  slope?: number;
  /** Rule ids (docs/05_Research/MEP Design Practice Research.md) that governed this segment. */
  rules?: string[];
  insulated?: boolean;
}

export type FittingKind =
  | "elbow"
  | "tee"
  | "wye"
  | "reducer"
  | "transition"
  | "cap"
  | "valve"
  | "damper"
  | "cleanout"
  | "flex-connector";

/** Derived (never authored) from graph topology by deriveFittings(). */
export interface MepFitting {
  id: string;
  systemId: string;
  nodeId: string;
  kind: FittingKind;
  position: Vec3;
  /** Unit direction into the node along the upstream segment. */
  dirIn: Vec3;
  /** Unit direction out of the node along the downstream segment (elbow/tee). */
  dirOut: Vec3;
  shape: SegmentShape;
  /** For reducers/transitions: downstream shape. */
  shapeOut?: SegmentShape;
  floorNo: number | null;
}

export interface MepZone {
  id: string;
  floorNo: number;
  /** Axis-aligned rect, footprint-local metres. */
  rect: { minX: number; maxX: number; minZ: number; maxZ: number };
  areaSqm: number;
  /** Where the zone came from — the CAD-driven vs procedural distinction. */
  source: "grid" | "cad-room" | "wet-core";
  /** Design demands assigned by the requirement model. */
  supplyAirM3h: number;
  coolingKw: number;
  heatingKw: number;
  lightingVa: number;
  powerVa: number;
}

export interface MepRiser {
  id: string;
  shaft: "wet" | "mechanical" | "electrical" | "exterior" | "core";
  x: number;
  z: number;
  fromY: number;
  toY: number;
  systemIds: string[];
}

export interface MepSystem {
  id: string;
  type: MepSystemType;
  discipline: MepDiscipline;
  name: string;
  nameKo: string;
  /** Root node — every segment of the system must reach it. */
  sourceNodeId: string;
  flowUnit: "m3h" | "lps" | "kw" | "fu" | "va";
}

export interface MepAssumption {
  id: string;
  ruleId: string;
  text: string;
  textKo?: string;
  basis: MepBasis;
}

export type HvacArchetype = "central-ahu" | "vrf" | "residential-hydronic" | "packaged";

export interface MepModelStats {
  nodeCount: number;
  segmentCount: number;
  fittingCount: number;
  terminalCount: number;
  totalLengthM: number;
  systemCount: number;
}

export interface MepModel {
  /** Bump when generation logic changes meaningfully (regeneration invariant §41). */
  generatorVersion: string;
  /** Fingerprint of the planning inputs, for reproducibility checks. */
  inputKey: string;
  archetype: HvacArchetype;
  /** Above-grade floors the model was planned against (soffit = slab above). */
  floors: { floorNo: number; y: number; height: number; soffitY: number }[];
  systems: MepSystem[];
  nodes: MepNode[];
  segments: MepSegment[];
  fittings: MepFitting[];
  zones: MepZone[];
  risers: MepRiser[];
  assumptions: MepAssumption[];
  stats: MepModelStats;
}

// ---------------------------------------------------------------------------
// Convenience lookups (pure, allocation-light)

export function nodeById(model: { nodes: MepNode[] }): Map<string, MepNode> {
  const map = new Map<string, MepNode>();
  for (const n of model.nodes) map.set(n.id, n);
  return map;
}

export function segmentsBySystem(model: MepModel): Map<string, MepSegment[]> {
  const map = new Map<string, MepSegment[]>();
  for (const s of model.segments) {
    const list = map.get(s.systemId);
    if (list) list.push(s);
    else map.set(s.systemId, [s]);
  }
  return map;
}

export function systemsOfDiscipline(model: MepModel, d: MepDiscipline): MepSystem[] {
  return model.systems.filter((s) => s.discipline === d);
}

export function segmentLength(seg: MepSegment, nodes: Map<string, MepNode>): number {
  const a = nodes.get(seg.from);
  const b = nodes.get(seg.to);
  if (!a || !b) return 0;
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const dz = b.position.z - a.position.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
