// src/lib/mep/graph.ts
//
// Mutable builder the system planners write into. Ids are deterministic
// (system-scoped counters, no RNG) so identical inputs yield identical
// models — regeneration invariant §41.

import type {
  EquipmentSpecInfo,
  MepDiscipline,
  MepNode,
  MepSegment,
  MepSystem,
  MepSystemType,
  NodeKind,
  SegmentRole,
  Vec3,
} from "./types";

export interface ChainOptions {
  role: SegmentRole;
  floorNo: number | null;
  flow?: number;
  slope?: number;
  rules?: string[];
  insulated?: boolean;
}

export class MepGraphBuilder {
  readonly systems: MepSystem[] = [];
  readonly nodes: MepNode[] = [];
  readonly segments: MepSegment[] = [];
  private nodeSeq = new Map<string, number>();
  private segSeq = new Map<string, number>();

  addSystem(
    id: string,
    type: MepSystemType,
    discipline: MepDiscipline,
    name: string,
    nameKo: string,
    flowUnit: MepSystem["flowUnit"],
  ): MepSystem {
    const system: MepSystem = { id, type, discipline, name, nameKo, sourceNodeId: "", flowUnit };
    this.systems.push(system);
    return system;
  }

  addNode(
    systemId: string,
    kind: NodeKind,
    position: Vec3,
    floorNo: number | null,
    extra?: {
      label?: string;
      equipment?: EquipmentSpecInfo;
      terminal?: MepNode["terminal"];
      idHint?: string;
    },
  ): MepNode {
    const seq = (this.nodeSeq.get(systemId) ?? 0) + 1;
    this.nodeSeq.set(systemId, seq);
    const node: MepNode = {
      id: `${systemId}:n${extra?.idHint ?? seq}`,
      systemId,
      kind,
      position: { x: position.x, y: position.y, z: position.z },
      floorNo,
      label: extra?.label,
      equipment: extra?.equipment,
      terminal: extra?.terminal,
    };
    this.nodes.push(node);
    return node;
  }

  addSegment(system: MepSystem, from: MepNode, to: MepNode, opts: ChainOptions): MepSegment {
    const seq = (this.segSeq.get(system.id) ?? 0) + 1;
    this.segSeq.set(system.id, seq);
    const seg: MepSegment = {
      id: `${system.id}:s${seq}`,
      systemId: system.id,
      from: from.id,
      to: to.id,
      role: opts.role,
      // Placeholder shape — the sizing pass assigns real dimensions.
      shape: { kind: "round", diameterM: 0.05 },
      flow: opts.flow ?? 0,
      flowUnit: system.flowUnit,
      sizeBasis: "estimated",
      flowBasis: "estimated",
      floorNo: opts.floorNo,
      slope: opts.slope,
      rules: opts.rules,
      insulated: opts.insulated,
    };
    this.segments.push(seg);
    return seg;
  }

  /**
   * Adds a run of segments through `waypoints`, creating bend nodes at
   * interior waypoints. Consecutive duplicate points are skipped. Returns the
   * final node (the run's downstream end).
   */
  chain(system: MepSystem, start: MepNode, waypoints: Vec3[], opts: ChainOptions, endKind: NodeKind = "bend"): MepNode {
    let prev = start;
    const pts = waypoints.filter((p, i) => {
      const ref = i === 0 ? start.position : waypoints[i - 1];
      return Math.abs(p.x - ref.x) + Math.abs(p.y - ref.y) + Math.abs(p.z - ref.z) > 1e-6;
    });
    pts.forEach((p, i) => {
      const kind: NodeKind = i === pts.length - 1 ? endKind : "bend";
      const node = this.addNode(system.id, kind, p, opts.floorNo);
      this.addSegment(system, prev, node, opts);
      prev = node;
    });
    return prev;
  }
}

// ---------------------------------------------------------------------------
// Orthogonal waypoint helpers (rule Z5 — grid-parallel routing).

export function v3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

/** L-shaped horizontal path at constant y: move along X first, then Z. */
export function xThenZ(from: Vec3, to: { x: number; z: number }, y: number): Vec3[] {
  return [v3(to.x, y, from.z), v3(to.x, y, to.z)];
}

/** L-shaped horizontal path at constant y: move along Z first, then X. */
export function zThenX(from: Vec3, to: { x: number; z: number }, y: number): Vec3[] {
  return [v3(from.x, y, to.z), v3(to.x, y, to.z)];
}

/**
 * Keeps a horizontal run line clear of column centrelines (rule Z3): if the
 * proposed constant-coordinate `line` passes within `clearance` of any column
 * (on the perpendicular axis), shift it deterministically to the nearest
 * clear value. `columnCoords` are the columns' coordinates on the same axis
 * as `line`.
 */
export function clearOfColumns(line: number, columnCoords: number[], clearance: number): number {
  const ok = (v: number) => columnCoords.every((c) => Math.abs(c - v) >= clearance - 1e-9);
  if (ok(line)) return line;
  const candidates = columnCoords.flatMap((c) => [c + clearance, c - clearance]).filter(ok);
  if (candidates.length === 0) return line;
  candidates.sort((a, b) => Math.abs(a - line) - Math.abs(b - line));
  return candidates[0];
}
