// src/lib/mep/size.ts
//
// Flow accumulation and sizing (rules T3, A1, W1, F3, P4, E2). Flow on every
// segment equals the sum of terminal demands on its far-from-source side
// (rule T3) — computed by DFS over the system tree — then sizes snap to the
// real-world catalogs in rules.ts, which is also what keeps geometry
// instanceable (a building yields a handful of distinct sizes).

import {
  TRAY_HEIGHT_M,
  sizeDrainPipe,
  sizePipe,
  sizeRectDuct,
  sizeRoundDuct,
  sizeSprinklerPipe,
  sizeTray,
} from "./rules";
import type { MepBasis, MepNode, MepSegment, MepSystem, SegmentShape } from "./types";

export interface SystemGraphIndex {
  /** nodeId → incident segments. */
  adjacency: Map<string, MepSegment[]>;
  /** segmentId → downstream accumulated demand (far side from source). */
  flows: Map<string, number>;
  /** nodeId → parent segment (toward source); source has none. */
  parentSegment: Map<string, MepSegment>;
  reachable: Set<string>;
}

export function indexSystem(system: MepSystem, nodes: MepNode[], segments: MepSegment[]): SystemGraphIndex {
  const adjacency = new Map<string, MepSegment[]>();
  for (const seg of segments) {
    if (seg.systemId !== system.id) continue;
    for (const end of [seg.from, seg.to]) {
      const list = adjacency.get(end);
      if (list) list.push(seg);
      else adjacency.set(end, [seg]);
    }
  }
  const demandByNode = new Map<string, number>();
  for (const n of nodes) {
    if (n.systemId === system.id && n.terminal) demandByNode.set(n.id, n.terminal.demand);
  }

  const flows = new Map<string, number>();
  const parentSegment = new Map<string, MepSegment>();
  const reachable = new Set<string>();

  // Iterative post-order DFS from the source.
  const stack: { nodeId: string; via: MepSegment | null; state: 0 | 1 }[] = [
    { nodeId: system.sourceNodeId, via: null, state: 0 },
  ];
  const subtree = new Map<string, number>();
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.state === 0) {
      frame.state = 1;
      reachable.add(frame.nodeId);
      for (const seg of adjacency.get(frame.nodeId) ?? []) {
        if (seg === frame.via) continue;
        const next = seg.from === frame.nodeId ? seg.to : seg.from;
        if (reachable.has(next)) continue; // loop guard
        parentSegment.set(next, seg);
        stack.push({ nodeId: next, via: seg, state: 0 });
      }
    } else {
      stack.pop();
      let sum = demandByNode.get(frame.nodeId) ?? 0;
      for (const seg of adjacency.get(frame.nodeId) ?? []) {
        if (seg === frame.via) continue;
        const next = seg.from === frame.nodeId ? seg.to : seg.from;
        if (parentSegment.get(next) === seg) sum += subtree.get(next) ?? 0;
      }
      subtree.set(frame.nodeId, sum);
      if (frame.via) flows.set(frame.via.id, sum);
    }
  }
  return { adjacency, flows, parentSegment, reachable };
}

function roleClass(role: MepSegment["role"]): "main" | "branch" | "runout" {
  if (role === "branch") return "branch";
  if (role === "runout") return "runout";
  return "main";
}

const REFRIGERANT_DNS = [0.015, 0.02, 0.025, 0.032, 0.04];

function shapeFor(system: MepSystem, seg: MepSegment, flow: number): { shape: SegmentShape; basis: MepBasis } {
  const rc = roleClass(seg.role);
  switch (system.type) {
    case "supply-air":
    case "return-air":
    case "outdoor-air":
    case "exhaust-air": {
      if (rc === "runout") {
        return { shape: { kind: "round", diameterM: sizeRoundDuct(flow, "runout") }, basis: "estimated" };
      }
      const { widthM, heightM } = sizeRectDuct(flow, rc, seg.role === "riser" ? "riser" : "horizontal");
      return { shape: { kind: "rect", widthM, heightM }, basis: "estimated" };
    }
    case "chilled-water-supply":
    case "chilled-water-return":
    case "heating-water-supply":
    case "heating-water-return":
    case "domestic-cold-water":
    case "domestic-hot-water":
    case "dhw-return":
    case "condensate":
      return { shape: { kind: "round", diameterM: sizePipe(flow, rc) }, basis: "estimated" };
    case "refrigerant": {
      const raw = 0.015 + flow * 0.00022;
      const dn = REFRIGERANT_DNS.find((d) => d >= raw) ?? 0.04;
      return { shape: { kind: "round", diameterM: dn }, basis: "estimated" };
    }
    case "sprinkler":
      return { shape: { kind: "round", diameterM: sizeSprinklerPipe(Math.max(1, flow)) }, basis: "defaulted" };
    case "sanitary-drain":
      return { shape: { kind: "round", diameterM: Math.max(sizeDrainPipe(flow), rc === "main" ? 0.1 : 0.05) }, basis: "defaulted" };
    case "sanitary-vent":
      return { shape: { kind: "round", diameterM: 0.05 }, basis: "defaulted" };
    case "cable-tray":
      return { shape: { kind: "tray", widthM: sizeTray(Math.max(flow, seg.flow)), heightM: TRAY_HEIGHT_M }, basis: "estimated" };
    case "power": {
      const dn = flow >= 15_000 ? 0.032 : 0.025;
      return { shape: { kind: "round", diameterM: dn }, basis: "defaulted" };
    }
    default:
      return { shape: { kind: "round", diameterM: 0.05 }, basis: "defaulted" };
  }
}

/**
 * Mutates segments in place: assigns accumulated flows and catalog sizes.
 * Returns the per-system graph indices for downstream passes (fittings, QA).
 */
export function assignFlowsAndSizes(
  systems: MepSystem[],
  nodes: MepNode[],
  segments: MepSegment[],
): Map<string, SystemGraphIndex> {
  const indices = new Map<string, SystemGraphIndex>();
  for (const system of systems) {
    const index = indexSystem(system, nodes, segments);
    indices.set(system.id, index);
    for (const seg of segments) {
      if (seg.systemId !== system.id) continue;
      const accumulated = index.flows.get(seg.id) ?? 0;
      const flow = Math.max(accumulated, seg.flow);
      const { shape, basis } = shapeFor(system, seg, flow);
      seg.flow = flow;
      seg.shape = shape;
      seg.sizeBasis = basis;
      seg.flowBasis = "estimated";
    }
  }
  return indices;
}
