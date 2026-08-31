// src/lib/mep/fittings.ts
//
// Fitting derivation (rule A6, §21): a bend is never two intersecting
// cylinders — every topology event at a node becomes an explicit fitting
// derived from the graph, sized from the adjacent segments.

import type { SystemGraphIndex } from "./size";
import type { FittingKind, MepFitting, MepNode, MepSegment, MepSystem, Vec3 } from "./types";

function dir(from: Vec3, to: Vec3): Vec3 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  return { x: dx / len, y: dy / len, z: dz / len };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function shapeKey(seg: MepSegment): string {
  const s = seg.shape;
  if (s.kind === "round") return `r${s.diameterM.toFixed(3)}`;
  return `${s.kind}${s.widthM.toFixed(3)}x${s.heightM.toFixed(3)}`;
}

/**
 * Derives fittings for every node of every system. Requires sizes to be
 * assigned first (fitting shape = the larger adjacent shape).
 */
export function deriveFittings(
  systems: MepSystem[],
  nodes: MepNode[],
  indices: Map<string, SystemGraphIndex>,
): MepFitting[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const fittings: MepFitting[] = [];
  let seq = 0;

  for (const system of systems) {
    const index = indices.get(system.id);
    if (!index) continue;
    for (const [nodeId, incident] of index.adjacency) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;
      const parent = index.parentSegment.get(nodeId);
      const children = incident.filter((s) => s !== parent);

      const dirOf = (seg: MepSegment, outward: boolean): Vec3 => {
        const other = nodeMap.get(seg.from === nodeId ? seg.to : seg.from);
        if (!other) return { x: 1, y: 0, z: 0 };
        return outward ? dir(node.position, other.position) : dir(other.position, node.position);
      };

      const push = (kind: FittingKind, main: MepSegment, out: MepSegment | null, shapeOut?: MepSegment) => {
        fittings.push({
          id: `fit-${seq++}`,
          systemId: system.id,
          nodeId,
          kind,
          position: node.position,
          dirIn: dirOf(main, false),
          dirOut: out ? dirOf(out, true) : dirOf(main, false),
          shape: main.shape,
          shapeOut: shapeOut?.shape,
          floorNo: node.floorNo,
        });
      };

      if (node.label?.toLowerCase().includes("valve") && parent) {
        push("valve", parent, children[0] ?? null);
        continue;
      }

      if (!parent) continue; // source — hookups read as equipment connections

      if (children.length === 0) {
        // Dead end that is not a terminal gets a cap so nothing ends "open".
        if (!node.terminal && node.kind !== "equipment") push("cap", parent, null);
        continue;
      }
      if (children.length === 1) {
        const inDir = dirOf(parent, false);
        const outDir = dirOf(children[0], true);
        const straight = dot(inDir, outDir) > 0.985;
        if (straight) {
          if (shapeKey(parent) !== shapeKey(children[0])) {
            const kind: FittingKind = parent.shape.kind === "rect" ? "transition" : "reducer";
            push(kind, parent, children[0], children[0]);
          }
        } else {
          push("elbow", parent, children[0], shapeKey(parent) === shapeKey(children[0]) ? undefined : children[0]);
        }
        continue;
      }
      // 2+ children: a tee (crosses render as tees too). The straight-through
      // child keeps the main; the perpendicular one is the tap.
      const inDir = dirOf(parent, false);
      let through: MepSegment | null = null;
      let bestDot = -2;
      for (const child of children) {
        const d = dot(inDir, dirOf(child, true));
        if (d > bestDot) {
          bestDot = d;
          through = child;
        }
      }
      const tap = children.find((c) => c !== through) ?? children[0];
      push("tee", parent, tap, tap);
    }
  }
  return fittings;
}
