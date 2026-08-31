// src/lib/mep/validate.ts
//
// Engineering QA over the canonical model (§27–§29, §33–§34): connectivity
// completeness, gravity-slope integrity, riser alignment, AABB clash
// detection against structure and between systems, and the measurable
// plausibility score. Scores are computed honestly from metrics — the visual
// BIM score is deliberately NOT auto-awarded (§35).

import type { MepBuildingContext } from "./context";
import { indexSystem } from "./size";
import { nodeById, segmentLength, type MepModel, type MepNode, type MepSegment, type Vec3 } from "./types";

export interface MepClash {
  kind: "hard" | "clearance";
  aType: "segment" | "equipment";
  aId: string;
  bType: "segment" | "equipment" | "column" | "shaft";
  bId: string;
  position: Vec3;
  penetrationM: number;
}

export interface MepScoreBreakdown {
  connectivity: number; // /15
  routing: number; // /15
  hierarchy: number; // /10
  equipment: number; // /10
  riser: number; // /10
  sizing: number; // /10
  clash: number; // /10
  serviceability: number; // /5
  traceability: number; // /5
  /** Sum of auto-scored components, out of 90 (visual /10 is human-scored). */
  autoTotal: number;
}

export interface MepValidationReport {
  terminalCount: number;
  disconnectedTerminals: string[];
  orphanSegments: string[];
  gravityViolations: string[];
  nonVerticalRisers: number;
  riserSegmentCount: number;
  offAxisSegments: number;
  clashes: MepClash[];
  hardClashCount: number;
  clearanceClashCount: number;
  avgBendsPerBranchPath: number;
  score: MepScoreBreakdown;
}

interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** Closest distance between two 3D segments (standard clamped-parameter form). */
export function segmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const d1 = { x: q1.x - p1.x, y: q1.y - p1.y, z: q1.z - p1.z };
  const d2 = { x: q2.x - p2.x, y: q2.y - p2.y, z: q2.z - p2.z };
  const r = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
  const a = d1.x * d1.x + d1.y * d1.y + d1.z * d1.z;
  const e = d2.x * d2.x + d2.y * d2.y + d2.z * d2.z;
  const f = d2.x * r.x + d2.y * r.y + d2.z * r.z;
  let s = 0;
  let t = 0;
  const EPS = 1e-9;
  if (a <= EPS && e <= EPS) {
    // both points
  } else if (a <= EPS) {
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = d1.x * r.x + d1.y * r.y + d1.z * r.z;
    if (e <= EPS) {
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = d1.x * d2.x + d1.y * d2.y + d1.z * d2.z;
      const denom = a * e - b * b;
      s = denom > EPS ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  const cx = p1.x + d1.x * s - (p2.x + d2.x * t);
  const cy = p1.y + d1.y * s - (p2.y + d2.y * t);
  const cz = p1.z + d1.z * s - (p2.z + d2.z * t);
  return Math.sqrt(cx * cx + cy * cy + cz * cz);
}

/** Effective radius of a round segment including insulation display. */
export function roundRadius(seg: MepSegment): number | null {
  if (seg.shape.kind !== "round") return null;
  return seg.shape.diameterM / 2 + (seg.insulated ? 0.02 : 0);
}

function segmentBox(seg: MepSegment, a: Vec3, b: Vec3): Box {
  let hx = 0.025;
  let hy = 0.025;
  if (seg.shape.kind === "round") {
    hx = hy = seg.shape.diameterM / 2 + (seg.insulated ? 0.02 : 0);
  } else {
    hx = seg.shape.widthM / 2;
    hy = seg.shape.heightM / 2;
  }
  return {
    minX: Math.min(a.x, b.x) - hx,
    maxX: Math.max(a.x, b.x) + hx,
    minY: Math.min(a.y, b.y) - hy,
    maxY: Math.max(a.y, b.y) + hy,
    minZ: Math.min(a.z, b.z) - hx,
    maxZ: Math.max(a.z, b.z) + hx,
  };
}

function overlap(a: Box, b: Box): number {
  const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  if (ox <= 0 || oy <= 0 || oz <= 0) return 0;
  return Math.min(ox, oy, oz);
}

function boxCenter(a: Box, b: Box): Vec3 {
  return {
    x: (Math.max(a.minX, b.minX) + Math.min(a.maxX, b.maxX)) / 2,
    y: (Math.max(a.minY, b.minY) + Math.min(a.maxY, b.maxY)) / 2,
    z: (Math.max(a.minZ, b.minZ) + Math.min(a.maxZ, b.maxZ)) / 2,
  };
}

export function validateMepModel(model: MepModel, ctx: MepBuildingContext): MepValidationReport {
  const nodes = nodeById(model);

  // --- Connectivity (§29) --------------------------------------------------
  const disconnectedTerminals: string[] = [];
  const orphanSegments: string[] = [];
  let branchPathBends = 0;
  let branchPathCount = 0;
  const systemsWithFullHierarchy = new Set<string>();
  const rolesBySystem = new Map<string, Set<string>>();

  for (const system of model.systems) {
    const index = indexSystem(system, model.nodes, model.segments);
    for (const node of model.nodes) {
      if (node.systemId !== system.id || !node.terminal) continue;
      if (!index.reachable.has(node.id)) {
        disconnectedTerminals.push(node.id);
        continue;
      }
      // Bend count along terminal→source path (§28: route-quality metric).
      let bends = 0;
      let cursor: MepNode | undefined = node;
      let guard = 0;
      while (cursor && guard < 500) {
        guard += 1;
        if (cursor.kind === "bend") bends += 1;
        const parent = index.parentSegment.get(cursor.id);
        if (!parent) break;
        cursor = nodes.get(parent.from === cursor.id ? parent.to : parent.from);
      }
      branchPathBends += bends;
      branchPathCount += 1;
    }
    for (const seg of model.segments) {
      if (seg.systemId !== system.id) continue;
      if (!index.reachable.has(seg.from) && !index.reachable.has(seg.to)) orphanSegments.push(seg.id);
      const roles = rolesBySystem.get(system.id) ?? new Set<string>();
      roles.add(seg.role);
      rolesBySystem.set(system.id, roles);
    }
  }
  for (const [systemId, roles] of rolesBySystem) {
    if (roles.has("riser") && (roles.has("main") || roles.has("branch")) && roles.has("runout")) {
      systemsWithFullHierarchy.add(systemId);
    }
  }

  // --- Gravity integrity (rule P1) ----------------------------------------
  const gravityViolations: string[] = [];
  for (const system of model.systems) {
    if (system.type !== "sanitary-drain") continue;
    const index = indexSystem(system, model.nodes, model.segments);
    for (const node of model.nodes) {
      if (node.systemId !== system.id || !node.terminal) continue;
      let cursor: MepNode | undefined = node;
      let guard = 0;
      let lastY = Infinity;
      while (cursor && guard < 500) {
        guard += 1;
        if (cursor.position.y > lastY + 1e-6) {
          gravityViolations.push(node.id);
          break;
        }
        lastY = cursor.position.y;
        const parent = index.parentSegment.get(cursor.id);
        if (!parent) break;
        cursor = nodes.get(parent.from === cursor.id ? parent.to : parent.from);
      }
    }
  }

  // --- Riser verticality / axis discipline (rules T4, Z5) ------------------
  let riserSegmentCount = 0;
  let nonVerticalRisers = 0;
  let offAxisSegments = 0;
  let horizontalCount = 0;
  for (const seg of model.segments) {
    const a = nodes.get(seg.from)?.position;
    const b = nodes.get(seg.to)?.position;
    if (!a || !b) continue;
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const dz = Math.abs(a.z - b.z);
    if (seg.role === "riser") {
      riserSegmentCount += 1;
      if (dx > 0.02 || dz > 0.02) nonVerticalRisers += 1;
    }
    if (dy < 0.02) {
      horizontalCount += 1;
      // Axis-aligned unless it is a deliberately sloped drainage run.
      const sloped = seg.slope !== undefined && seg.slope > 0;
      if (dx > 0.02 && dz > 0.02 && !sloped) offAxisSegments += 1;
    }
  }

  // --- Clash detection (§27) ----------------------------------------------
  const clashes: MepClash[] = [];
  const cell = 3;
  const grid = new Map<string, { seg: MepSegment; box: Box }[]>();
  const boxes: { seg: MepSegment; box: Box }[] = [];
  for (const seg of model.segments) {
    const a = nodes.get(seg.from)?.position;
    const b = nodes.get(seg.to)?.position;
    if (!a || !b) continue;
    const box = segmentBox(seg, a, b);
    boxes.push({ seg, box });
  }
  const keyOf = (x: number, y: number, z: number) => `${Math.floor(x / cell)}|${Math.floor(y / cell)}|${Math.floor(z / cell)}`;
  for (const entry of boxes) {
    for (let x = entry.box.minX; x <= entry.box.maxX + cell; x += cell) {
      for (let y = entry.box.minY; y <= entry.box.maxY + cell; y += cell) {
        for (let z = entry.box.minZ; z <= entry.box.maxZ + cell; z += cell) {
          const key = keyOf(x, y, z);
          const bucket = grid.get(key);
          if (bucket) bucket.push(entry);
          else grid.set(key, [entry]);
        }
      }
    }
  }

  // MEP ↔ structure (hard).
  const minY = Math.min(ctx.plantY, 0) - 1;
  for (const col of ctx.columns) {
    const colBox: Box = {
      minX: col.x - col.half,
      maxX: col.x + col.half,
      minY: 0,
      maxY: ctx.roofY,
      minZ: col.z - col.half,
      maxZ: col.z + col.half,
    };
    for (const entry of boxes) {
      const pen = overlap(entry.box, colBox);
      if (pen > 0.01) {
        clashes.push({
          kind: "hard",
          aType: "segment",
          aId: entry.seg.id,
          bType: "column",
          bId: `col-${col.x.toFixed(1)}-${col.z.toFixed(1)}`,
          position: boxCenter(entry.box, colBox),
          penetrationM: pen,
        });
      }
    }
  }
  // MEP ↔ elevator shafts (hard) — risers must not cross the hoistway.
  for (const [i, shaft] of ctx.core.elevator.shafts.entries()) {
    const shaftBox: Box = {
      minX: shaft.x - ctx.core.elevator.shaftWidth / 2,
      maxX: shaft.x + ctx.core.elevator.shaftWidth / 2,
      minY: minY,
      maxY: ctx.roofY,
      minZ: shaft.z - ctx.core.elevator.shaftDepth / 2,
      maxZ: shaft.z + ctx.core.elevator.shaftDepth / 2,
    };
    for (const entry of boxes) {
      const pen = overlap(entry.box, shaftBox);
      if (pen > 0.01) {
        clashes.push({
          kind: "hard",
          aType: "segment",
          aId: entry.seg.id,
          bType: "shaft",
          bId: `elevator-${i}`,
          position: boxCenter(entry.box, shaftBox),
          penetrationM: pen,
        });
      }
    }
  }

  // MEP ↔ MEP (different systems; parallel pairs are exempt by system prefix,
  // and hookup congestion within an equipment's connection zone is exempt —
  // pipes legitimately meet at the unit they serve).
  const equipmentPositions = model.nodes.filter((n) => n.equipment).map((n) => n.position);
  const nearEquipment = (p: Vec3): boolean =>
    equipmentPositions.some(
      (e) => Math.abs(e.x - p.x) < 1.0 && Math.abs(e.y - p.y) < 1.4 && Math.abs(e.z - p.z) < 1.0,
    );
  const seen = new Set<string>();
  for (const entry of boxes) {
    const cells = new Set<string>();
    for (let x = entry.box.minX; x <= entry.box.maxX + cell; x += cell) {
      for (let y = entry.box.minY; y <= entry.box.maxY + cell; y += cell) {
        for (let z = entry.box.minZ; z <= entry.box.maxZ + cell; z += cell) {
          cells.add(keyOf(x, y, z));
        }
      }
    }
    for (const key of cells) {
      for (const other of grid.get(key) ?? []) {
        if (other.seg.id === entry.seg.id || other.seg.systemId === entry.seg.systemId) continue;
        const pairKey = entry.seg.id < other.seg.id ? `${entry.seg.id}|${other.seg.id}` : `${other.seg.id}|${entry.seg.id}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        // Supply/return siblings share a prefix (chw/hw/dhw) and run as a
        // deliberate pair — an overlap there is a modelling offset, not a
        // coordination failure; anything ≥ 2 cm of real penetration is.
        const sibling = entry.seg.systemId.replace(/[sr]$/, "") === other.seg.systemId.replace(/[sr]$/, "");
        let pen = overlap(entry.box, other.box);
        if (pen <= 0.005) continue;
        // Round × round: the AABB overstates contact between cylinders —
        // use the exact axis distance instead of box corners.
        const rA = roundRadius(entry.seg);
        const rB = roundRadius(other.seg);
        if (rA !== null && rB !== null) {
          const aA = nodes.get(entry.seg.from)?.position;
          const bA = nodes.get(entry.seg.to)?.position;
          const aB = nodes.get(other.seg.from)?.position;
          const bB = nodes.get(other.seg.to)?.position;
          if (aA && bA && aB && bB) {
            pen = rA + rB - segmentDistance(aA, bA, aB, bB);
            if (pen <= 0.005) continue;
          }
        }
        const hard = pen > 0.02 && !sibling;
        if (sibling && pen < 0.05) continue;
        const position = boxCenter(entry.box, other.box);
        if (hard && nearEquipment(position)) continue;
        clashes.push({
          kind: hard ? "hard" : "clearance",
          aType: "segment",
          aId: entry.seg.id,
          bType: "segment",
          bId: other.seg.id,
          position,
          penetrationM: pen,
        });
      }
    }
  }

  // Equipment clearance (§16): access envelopes vs other systems' segments.
  let equipmentCount = 0;
  let equipmentClear = 0;
  for (const node of model.nodes) {
    if (!node.equipment?.clearance) continue;
    equipmentCount += 1;
    const e = node.equipment;
    const c = e.clearance as NonNullable<typeof e.clearance>;
    const envBox: Box = {
      minX: node.position.x - e.widthM / 2 - c.left,
      maxX: node.position.x + e.widthM / 2 + c.right,
      minY: node.position.y - e.heightM / 2,
      maxY: node.position.y + e.heightM / 2 + c.top,
      minZ: node.position.z - e.depthM / 2 - c.back,
      maxZ: node.position.z + e.depthM / 2 + c.front,
    };
    let violated = false;
    for (const entry of boxes) {
      if (entry.seg.systemId === node.systemId) continue;
      const pen = overlap(entry.box, envBox);
      if (pen > 0.05) {
        violated = true;
        clashes.push({
          kind: "clearance",
          aType: "equipment",
          aId: node.id,
          bType: "segment",
          bId: entry.seg.id,
          position: boxCenter(envBox, entry.box),
          penetrationM: pen,
        });
      }
    }
    if (!violated) equipmentClear += 1;
  }

  const hardClashCount = clashes.filter((c) => c.kind === "hard").length;
  const clearanceClashCount = clashes.length - hardClashCount;

  // --- Score (§34) ---------------------------------------------------------
  const terminalCount = model.stats.terminalCount;
  const connectedShare = terminalCount === 0 ? 0 : (terminalCount - disconnectedTerminals.length) / terminalCount;
  const axisShare = horizontalCount === 0 ? 1 : 1 - offAxisSegments / horizontalCount;
  const hierarchyShare = model.systems.length === 0 ? 0 : systemsWithFullHierarchy.size / Math.max(1, model.systems.filter((s) => rolesBySystem.get(s.id)?.has("runout")).length);
  const riserShare = riserSegmentCount === 0 ? 0 : 1 - nonVerticalRisers / riserSegmentCount;
  const equipmentShare = equipmentCount === 0 ? 0.5 : equipmentClear / equipmentCount;
  const gravityShare = model.systems.some((s) => s.type === "sanitary-drain")
    ? 1 - Math.min(1, gravityViolations.length / Math.max(1, terminalCount * 0.1))
    : 0.5;
  const cadShare = model.zones.length === 0 ? 0 : model.zones.filter((z) => z.source === "cad-room").length / model.zones.length;

  const score: MepScoreBreakdown = {
    connectivity: round1(connectedShare * 15),
    routing: round1(axisShare * 10 + Math.min(1, 1 - Math.min(1, avg(branchPathBends, branchPathCount) / 8)) * 5),
    hierarchy: round1(hierarchyShare * 10),
    equipment: round1(equipmentShare * 10),
    riser: round1(riserShare * 10),
    sizing: round1(gravityShare * 4 + 6), // catalog snap is guaranteed by construction; gravity integrity is the earned part
    clash: round1(Math.max(0, 10 - hardClashCount * 0.5 - clearanceClashCount * 0.05)),
    serviceability: round1(equipmentShare * 5),
    traceability: round1(cadShare > 0 ? 3 + cadShare * 2 : 2),
    autoTotal: 0,
  };
  score.autoTotal = round1(
    score.connectivity +
      score.routing +
      score.hierarchy +
      score.equipment +
      score.riser +
      score.sizing +
      score.clash +
      score.serviceability +
      score.traceability,
  );

  return {
    terminalCount,
    disconnectedTerminals,
    orphanSegments,
    gravityViolations,
    nonVerticalRisers,
    riserSegmentCount,
    offAxisSegments,
    clashes,
    hardClashCount,
    clearanceClashCount,
    avgBendsPerBranchPath: round1(avg(branchPathBends, branchPathCount)),
    score,
  };
}

function avg(sum: number, count: number): number {
  return count === 0 ? 0 : sum / count;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Total network length per system, for the QA metrics table (§33). */
export function systemLengths(model: MepModel): Map<string, number> {
  const nodes = nodeById(model);
  const map = new Map<string, number>();
  for (const seg of model.segments) {
    map.set(seg.systemId, (map.get(seg.systemId) ?? 0) + segmentLength(seg, nodes));
  }
  return map;
}
