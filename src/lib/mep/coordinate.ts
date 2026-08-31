// src/lib/mep/coordinate.ts
//
// Self-repair coordination pass (§28): detect → classify → identify movable
// → re-route locally → revalidate. The channel/band/offset scheme resolves
// the bulk of coordination structurally; this pass resolves the residue the
// way a human coordinator does — a local displacement of the smaller run,
// with orthogonal connector stubs, never a long detour. Deterministic:
// clashes are processed in id order, displacement direction is chosen by
// available room, and the loop runs a fixed number of rounds. Whatever
// remains after that is honestly reported by the validator.

import type { MepBuildingContext } from "./context";
import { MepGraphBuilder } from "./graph";
import type { MepNode, MepSegment, MepSystem, Vec3 } from "./types";
import { segmentDistance } from "./validate";

interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

interface Entry {
  seg: MepSegment;
  a: Vec3;
  b: Vec3;
  box: Box;
  axis: "x" | "y" | "z" | "pt";
  halfW: number;
  halfH: number;
}

function segHalves(seg: MepSegment): { halfW: number; halfH: number } {
  if (seg.shape.kind === "round") {
    const h = seg.shape.diameterM / 2 + (seg.insulated ? 0.02 : 0);
    return { halfW: h, halfH: h };
  }
  return { halfW: seg.shape.widthM / 2, halfH: seg.shape.heightM / 2 };
}

function entryOf(seg: MepSegment, a: Vec3, b: Vec3): Entry {
  const { halfW, halfH } = segHalves(seg);
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const dz = Math.abs(b.z - a.z);
  let axis: Entry["axis"] = "pt";
  if (dx >= dy && dx >= dz && dx > 0.05) axis = "x";
  else if (dy >= dx && dy >= dz && dy > 0.05) axis = "y";
  else if (dz > 0.05) axis = "z";
  return {
    seg,
    a,
    b,
    axis,
    halfW,
    halfH,
    box: {
      minX: Math.min(a.x, b.x) - halfW,
      maxX: Math.max(a.x, b.x) + halfW,
      minY: Math.min(a.y, b.y) - halfH,
      maxY: Math.max(a.y, b.y) + halfH,
      minZ: Math.min(a.z, b.z) - halfW,
      maxZ: Math.max(a.z, b.z) + halfW,
    },
  };
}

function overlap(a: Box, b: Box): number {
  const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  if (ox <= 0 || oy <= 0 || oz <= 0) return 0;
  return Math.min(ox, oy, oz);
}

const ROLE_MOBILITY: Record<MepSegment["role"], number> = {
  runout: 5,
  branch: 4,
  connector: 3,
  main: 2,
  service: 1,
  riser: 0,
};

/** Gravity drainage never moves vertically; risers never move at all. */
function mobility(entry: Entry, systemById: Map<string, MepSystem>): number {
  const system = systemById.get(entry.seg.systemId);
  let m = ROLE_MOBILITY[entry.seg.role];
  // Vertical runs may shift laterally but are less mobile than horizontals.
  if (entry.axis === "y") m = Math.max(0, m - 2);
  if (system && (system.type === "sanitary-drain" || system.type === "sanitary-vent")) m = 0;
  if (entry.seg.slope !== undefined) m = 0;
  return m;
}

/**
 * Replace `seg` with a locally displaced span: A → A+d → B+d → B, where d is
 * a vertical or lateral offset over [t0, t1] of the run. New nodes are bends;
 * fittings derive later, so the stubs become real elbows.
 */
function displaceSpan(
  g: MutableGraph,
  entry: Entry,
  t0: number,
  t1: number,
  d: Vec3,
): void {
  const { seg, a, b } = entry;
  const p = (t: number): Vec3 => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  });
  const p0 = p(t0);
  const p1 = p(t1);
  const q0 = { x: p0.x + d.x, y: p0.y + d.y, z: p0.z + d.z };
  const q1 = { x: p1.x + d.x, y: p1.y + d.y, z: p1.z + d.z };

  const mk = (pos: Vec3): MepNode => {
    g.nodeSeq += 1;
    const node: MepNode = {
      id: `${seg.systemId}:coord${g.nodeSeq}`,
      systemId: seg.systemId,
      kind: "bend",
      position: pos,
      floorNo: seg.floorNo,
    };
    g.nodes.push(node);
    return node;
  };
  const chainIds: string[] = [seg.from];
  const inner = [mk(p0), mk(q0), mk(q1), mk(p1)];
  for (const n of inner) chainIds.push(n.id);
  chainIds.push(seg.to);

  // Remove the original, add the five replacement segments.
  g.removed.add(seg.id);
  const idx = g.segments.indexOf(seg);
  if (idx >= 0) g.segments.splice(idx, 1);
  for (let i = 0; i < chainIds.length - 1; i += 1) {
    g.segSeq += 1;
    g.segments.push({
      ...seg,
      id: `${seg.id}c${g.segSeq}`,
      from: chainIds[i],
      to: chainIds[i + 1],
    });
  }
}

interface MutableGraph {
  systems: MepSystem[];
  nodes: MepNode[];
  segments: MepSegment[];
  removed: Set<string>;
  nodeSeq: number;
  segSeq: number;
}

/**
 * Runs the self-repair loop over the planned graph, mutating segments/nodes
 * in the builder. Returns the number of surgeries applied.
 */
export function coordinateMepGraph(g: MepGraphBuilder, ctx: MepBuildingContext): number {
  const mg: MutableGraph = {
    systems: g.systems,
    nodes: g.nodes,
    segments: g.segments,
    removed: new Set<string>(),
    nodeSeq: 0,
    segSeq: 0,
  };
  const systemById = new Map(g.systems.map((s) => [s.id, s]));
  const surgeryCount = new Map<string, number>();
  const failedPairs = new Set<string>();
  let surgeries = 0;

  const equipmentPositions = g.nodes.filter((n) => n.equipment).map((n) => n.position);
  for (let round = 0; round < 8; round += 1) {
    const nodeMap = new Map(mg.nodes.map((n) => [n.id, n]));
    const entries: Entry[] = [];
    for (const seg of mg.segments) {
      const a = nodeMap.get(seg.from)?.position;
      const b = nodeMap.get(seg.to)?.position;
      if (!a || !b) continue;
      entries.push(entryOf(seg, a, b));
    }
    // Spatial hash (fine cells: corridor buckets get dense otherwise).
    const cell = 1.5;
    const grid = new Map<string, Entry[]>();
    const keyOf = (x: number, y: number, z: number) =>
      `${Math.floor(x / cell)}|${Math.floor(y / cell)}|${Math.floor(z / cell)}`;
    for (const e of entries) {
      for (let x = e.box.minX; x <= e.box.maxX + cell; x += cell) {
        for (let y = e.box.minY; y <= e.box.maxY + cell; y += cell) {
          for (let z = e.box.minZ; z <= e.box.maxZ + cell; z += cell) {
            const key = keyOf(x, y, z);
            const bucket = grid.get(key);
            if (bucket) bucket.push(e);
            else grid.set(key, [e]);
          }
        }
      }
    }

    // Collect hard segment-segment conflicts (same criteria as the validator).
    const conflicts: { mover: Entry; other: Entry; pairKey: string; pen: number }[] = [];
    const seen = new Set<string>();
    const handled = new Set<string>();
    for (const e of entries) {
      const keys = new Set<string>();
      for (let x = e.box.minX; x <= e.box.maxX + cell; x += cell) {
        for (let y = e.box.minY; y <= e.box.maxY + cell; y += cell) {
          for (let z = e.box.minZ; z <= e.box.maxZ + cell; z += cell) {
            keys.add(keyOf(x, y, z));
          }
        }
      }
      for (const key of keys) {
        for (const o of grid.get(key) ?? []) {
          if (o.seg.id === e.seg.id || o.seg.systemId === e.seg.systemId) continue;
          const pairKey = e.seg.id < o.seg.id ? `${e.seg.id}|${o.seg.id}` : `${o.seg.id}|${e.seg.id}`;
          if (seen.has(pairKey)) continue;
          seen.add(pairKey);
          const sibling =
            e.seg.systemId.replace(/[sr]$/, "") === o.seg.systemId.replace(/[sr]$/, "");
          let pen = overlap(e.box, o.box);
          if (pen <= 0.02 || sibling) continue;
          if (e.seg.shape.kind === "round" && o.seg.shape.kind === "round") {
            const rE = e.seg.shape.diameterM / 2 + (e.seg.insulated ? 0.02 : 0);
            const rO = o.seg.shape.diameterM / 2 + (o.seg.insulated ? 0.02 : 0);
            pen = rE + rO - segmentDistance(e.a, e.b, o.a, o.b);
            if (pen <= 0.02) continue;
          }
          // Hookup congestion at an equipment's connection zone is exempt
          // (same rule as the validator) — pipes meet at the unit they serve.
          const cxp = (Math.max(e.box.minX, o.box.minX) + Math.min(e.box.maxX, o.box.maxX)) / 2;
          const cyp = (Math.max(e.box.minY, o.box.minY) + Math.min(e.box.maxY, o.box.maxY)) / 2;
          const czp = (Math.max(e.box.minZ, o.box.minZ) + Math.min(e.box.maxZ, o.box.maxZ)) / 2;
          if (
            equipmentPositions.some(
              (q) => Math.abs(q.x - cxp) < 1.0 && Math.abs(q.y - cyp) < 1.4 && Math.abs(q.z - czp) < 1.0,
            )
          ) {
            continue;
          }
          const mobE = mobility(e, systemById);
          const mobO = mobility(o, systemById);
          if (mobE === 0 && mobO === 0) continue;
          // Swap the mover when a previous round failed to displace it.
          let mover = mobE >= mobO ? e : o;
          let other = mover === e ? o : e;
          if (failedPairs.has(pairKey) && mobility(other, systemById) > 0) {
            const tmp = mover;
            mover = other;
            other = tmp;
          }
          conflicts.push({ mover, other, pairKey, pen });
        }
      }
    }
    if (conflicts.length === 0) break;

    // Occupancy probe: would a box at this location hit anything (other than
    // the two segments being coordinated)?
    const occupied = (box: Box, skipA: string, skipB: string, systemId: string): boolean => {
      const keys = new Set<string>();
      for (let x = box.minX; x <= box.maxX + cell; x += cell) {
        for (let y = box.minY; y <= box.maxY + cell; y += cell) {
          for (let z = box.minZ; z <= box.maxZ + cell; z += cell) {
            keys.add(keyOf(x, y, z));
          }
        }
      }
      for (const key of keys) {
        for (const o of grid.get(key) ?? []) {
          if (o.seg.id === skipA || o.seg.id === skipB || o.seg.systemId === systemId) continue;
          if (overlap(box, o.box) > 0.015) return true;
        }
      }
      // Structure: never displace into a column line (rule Z3).
      for (const col of ctx.columns) {
        const colBox: Box = {
          minX: col.x - col.half,
          maxX: col.x + col.half,
          minY: 0,
          maxY: ctx.roofY,
          minZ: col.z - col.half,
          maxZ: col.z + col.half,
        };
        if (overlap(box, colBox) > 0.01) return true;
      }
      return false;
    };

    const baseId = (id: string) => id.replace(/c\d+.*/, "");
    // Worst first (§36), deterministic tiebreak, capped per round for
    // performance — later rounds catch the rest.
    conflicts.sort((c1, c2) => c2.pen - c1.pen || (c1.mover.seg.id < c2.mover.seg.id ? -1 : 1));
    const roundConflicts = conflicts.slice(0, 500);
    for (const { mover, other, pairKey } of roundConflicts) {
      const base = baseId(mover.seg.id);
      if (handled.has(mover.seg.id) || handled.has(other.seg.id)) continue;
      if ((surgeryCount.get(base) ?? 0) >= 6) continue;
      if (mg.removed.has(mover.seg.id)) continue;

      const { a, b } = mover;
      const axis = mover.axis;
      if (axis === "pt") continue;
      const coord = (p: Vec3) => (axis === "x" ? p.x : axis === "y" ? p.y : p.z);
      const boxMin = (box: Box) => (axis === "x" ? box.minX : axis === "y" ? box.minY : box.minZ);
      const boxMax = (box: Box) => (axis === "x" ? box.maxX : axis === "y" ? box.maxY : box.maxZ);
      const len = Math.abs(coord(b) - coord(a));
      if (len < 0.3) continue;

      // Overlap interval along the mover's axis.
      const lo = Math.max(boxMin(mover.box), boxMin(other.box));
      const hi = Math.min(boxMax(mover.box), boxMax(other.box));
      const start = Math.min(coord(a), coord(b));
      const forward = coord(b) >= coord(a) ? 1 : -1;
      const toT = (v: number) => {
        const t = (v - start) / len;
        return forward === 1 ? t : 1 - t;
      };
      let t0 = Math.min(toT(lo - 0.25), toT(hi + 0.25));
      let t1 = Math.max(toT(lo - 0.25), toT(hi + 0.25));
      t0 = Math.max(0.04, t0);
      t1 = Math.min(0.96, t1);
      if (t1 - t0 < 0.02) continue;

      // Candidate displacements, preferred order. Against a vertical (riser,
      // stack, drop) — or when the mover itself is vertical — only a lateral
      // shift can clear; otherwise prefer a vertical dip toward the freer side.
      const gravityLocked = mover.seg.slope !== undefined;
      const candidates: Vec3[] = [];
      const latVecFor = (latAxis: "x" | "z", s: number, extra = 0): Vec3 => {
        const otherHalf =
          latAxis === "z" ? (other.box.maxZ - other.box.minZ) / 2 : (other.box.maxX - other.box.minX) / 2;
        const need = otherHalf + mover.halfW + 0.06 + extra;
        return latAxis === "z" ? { x: 0, y: 0, z: s * need } : { x: s * need, y: 0, z: 0 };
      };
      const signFor = (latAxis: "x" | "z"): number => {
        const otherCenter =
          latAxis === "z" ? (other.box.minZ + other.box.maxZ) / 2 : (other.box.minX + other.box.maxX) / 2;
        const moverAt = latAxis === "z" ? a.z : a.x;
        return moverAt >= otherCenter ? 1 : -1;
      };
      const needUp = other.box.maxY + mover.halfH - a.y + 0.05;
      const needDown = a.y - (other.box.minY - mover.halfH) + 0.05;
      const soffit = soffitAbove(ctx, a.y);
      const roomUp = soffit === null ? 2 : soffit - 0.05 - (a.y + mover.halfH);

      if (axis === "y") {
        // Vertical mover: sidestep in both plan axes, nearer escape first.
        for (const la of ["x", "z"] as const) {
          const s = signFor(la);
          candidates.push(latVecFor(la, s), latVecFor(la, -s));
        }
        for (const la of ["x", "z"] as const) {
          const s = signFor(la);
          candidates.push(latVecFor(la, s, 0.35), latVecFor(la, -s, 0.35));
        }
      } else {
        const latAxis: "x" | "z" = axis === "x" ? "z" : "x";
        const s = signFor(latAxis);
        if (other.axis === "y" || gravityLocked) {
          candidates.push(latVecFor(latAxis, s), latVecFor(latAxis, -s));
          candidates.push(latVecFor(latAxis, s, 0.35), latVecFor(latAxis, -s, 0.35));
          candidates.push(latVecFor(latAxis, s, 0.7), latVecFor(latAxis, -s, 0.7));
        } else {
          if (needUp <= roomUp + 1e-6 && needUp <= needDown + 0.12) {
            candidates.push({ x: 0, y: needUp, z: 0 }, { x: 0, y: -needDown, z: 0 });
          } else {
            candidates.push({ x: 0, y: -needDown, z: 0 });
            if (needUp <= roomUp) candidates.push({ x: 0, y: needUp, z: 0 });
          }
          candidates.push(latVecFor(latAxis, s), latVecFor(latAxis, -s));
          candidates.push(latVecFor(latAxis, s, 0.4), latVecFor(latAxis, -s, 0.4));
        }
      }

      // Displaced-span box: only the [t0, t1] portion, translated by d.
      const at = (t: number): Vec3 => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
      });
      const s0 = at(t0);
      const s1 = at(t1);
      let applied = false;
      for (const d of candidates) {
        // Probe the whole swept volume — displaced span PLUS the connector
        // stubs between original and displaced positions (union box, minus
        // the interior where the original run legitimately was).
        const span: Box = {
          minX: Math.min(s0.x, s1.x, s0.x + d.x, s1.x + d.x) - mover.halfW + (d.x > 0 ? 0.02 : 0),
          maxX: Math.max(s0.x, s1.x, s0.x + d.x, s1.x + d.x) + mover.halfW - (d.x < 0 ? 0.02 : 0),
          minY: Math.min(s0.y, s1.y, s0.y + d.y, s1.y + d.y) - mover.halfH,
          maxY: Math.max(s0.y, s1.y, s0.y + d.y, s1.y + d.y) + mover.halfH,
          minZ: Math.min(s0.z, s1.z, s0.z + d.z, s1.z + d.z) - mover.halfW + (d.z > 0 ? 0.02 : 0),
          maxZ: Math.max(s0.z, s1.z, s0.z + d.z, s1.z + d.z) + mover.halfW - (d.z < 0 ? 0.02 : 0),
        };
        if (occupied(span, mover.seg.id, other.seg.id, mover.seg.systemId)) continue;
        displaceSpan(mg, mover, t0, t1, d);
        handled.add(mover.seg.id);
        surgeryCount.set(base, (surgeryCount.get(base) ?? 0) + 1);
        surgeries += 1;
        applied = true;
        break;
      }
      if (!applied) {
        handled.add(mover.seg.id);
        failedPairs.add(pairKey);
      }
    }
  }
  return surgeries;
}

/** Slab soffit above elevation y, or null when outside the floor stack. */
function soffitAbove(ctx: MepBuildingContext, y: number): number | null {
  for (const f of ctx.floors) {
    if (y >= f.y - 0.5 && y < f.soffitY + 0.01) return f.soffitY;
  }
  return null;
}
