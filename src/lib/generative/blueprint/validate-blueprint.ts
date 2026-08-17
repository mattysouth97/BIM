// src/lib/generative/blueprint/validate-blueprint.ts
//
// Deterministic validation of a BlueprintSpec. Same discipline as
// `validate/rules.ts`: arithmetic and graph traversal only, no model consulted,
// no judgement. A blueprint that fails here is not "probably wrong" — it is
// unusable as design authority, because generation would have to invent the
// part that does not resolve.
//
// Priorities follow the constraint system:
//   P0 impossible to violate — loop validity, reference integrity
//   P1 required             — containment, connectivity, level coverage
//   P2 strong preference
//   P3 optimisation / advisory

import {
  segmentEnd,
  segmentStart,
  type BlueprintSpec,
  type BoundaryLoop,
  type CurveSegment,
  type Region,
} from "./blueprint-spec";

export type BlueprintViolationPriority = "P0" | "P1" | "P2" | "P3";
export type BlueprintViolationSeverity = "critical" | "warning" | "advisory";

export interface BlueprintViolation {
  code: string;
  priority: BlueprintViolationPriority;
  severity: BlueprintViolationSeverity;
  message: string;
  /** Blueprint object ids the UI should select and zoom to. */
  elementIds: string[];
  floorNo?: number;
  /** Deterministic repair hint, when one exists. */
  suggestion?: string;
}

export interface BlueprintValidationReport {
  violations: BlueprintViolation[];
  counts: { critical: number; warning: number; advisory: number };
  /** True when nothing at P0/P1 is outstanding. */
  blueprintValid: boolean;
}

const SEVERITY_OF: Record<BlueprintViolationPriority, BlueprintViolationSeverity> = {
  P0: "critical",
  P1: "critical",
  P2: "warning",
  P3: "advisory",
};

function violation(
  code: string,
  priority: BlueprintViolationPriority,
  message: string,
  elementIds: string[] = [],
  extra: { floorNo?: number; suggestion?: string } = {},
): BlueprintViolation {
  return {
    code,
    priority,
    severity: SEVERITY_OF[priority],
    message,
    elementIds,
    ...extra,
  };
}

/* ------------------------------------------------------------------ */
/* Local tessellation                                                  */
/* ------------------------------------------------------------------ */

// TODO(geom): replace local tessellation with geom/curves once that module
// lands. Everything below is deliberately coarse — it exists to answer "is this
// loop closed and does it cross itself", not to produce render geometry.

interface Pt {
  x: number;
  z: number;
}

const ARC_SAMPLES = 24;
const BEZIER_SAMPLES = 24;
/** Endpoints closer than this are considered chained. */
export const CHAIN_TOLERANCE_MM = 1;
const DEDUPE_TOLERANCE_MM = 1e-6;
const CROSS_EPSILON = 1e-9;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);

function tessellateArc(
  start: Pt,
  end: Pt,
  center: Pt,
  sweep: "cw" | "ccw",
): Pt[] {
  const radius = dist(center, start);
  if (radius === 0) return [start, end];

  const a0 = Math.atan2(start.z - center.z, start.x - center.x);
  const a1 = Math.atan2(end.z - center.z, end.x - center.x);
  const TAU = Math.PI * 2;

  let delta = a1 - a0;
  if (sweep === "ccw") {
    while (delta <= 0) delta += TAU;
  } else {
    while (delta >= 0) delta -= TAU;
  }

  const out: Pt[] = [start];
  for (let i = 1; i <= ARC_SAMPLES; i += 1) {
    const angle = a0 + (delta * i) / ARC_SAMPLES;
    out.push({
      x: center.x + radius * Math.cos(angle),
      z: center.z + radius * Math.sin(angle),
    });
  }
  // Land exactly on the declared endpoint; the sampled last point is only
  // as accurate as the stored centre.
  out[out.length - 1] = end;
  return out;
}

function tessellateBezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt): Pt[] {
  const out: Pt[] = [p0];
  for (let i = 1; i <= BEZIER_SAMPLES; i += 1) {
    const t = i / BEZIER_SAMPLES;
    const u = 1 - t;
    const b0 = u * u * u;
    const b1 = 3 * u * u * t;
    const b2 = 3 * u * t * t;
    const b3 = t * t * t;
    out.push({
      x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
      z: b0 * p0.z + b1 * p1.z + b2 * p2.z + b3 * p3.z,
    });
  }
  return out;
}

export function tessellateSegment(segment: CurveSegment): Pt[] {
  switch (segment.kind) {
    case "line":
      return [
        { x: segment.startMm.xMm, z: segment.startMm.zMm },
        { x: segment.endMm.xMm, z: segment.endMm.zMm },
      ];
    case "polyline":
      return segment.pointsMm.map((p) => ({ x: p.xMm, z: p.zMm }));
    case "arc":
      return tessellateArc(
        { x: segment.startMm.xMm, z: segment.startMm.zMm },
        { x: segment.endMm.xMm, z: segment.endMm.zMm },
        { x: segment.centerMm.xMm, z: segment.centerMm.zMm },
        segment.sweep,
      );
    case "bezier":
      return tessellateBezier(
        { x: segment.startMm.xMm, z: segment.startMm.zMm },
        { x: segment.control1Mm.xMm, z: segment.control1Mm.zMm },
        { x: segment.control2Mm.xMm, z: segment.control2Mm.zMm },
        { x: segment.endMm.xMm, z: segment.endMm.zMm },
      );
  }
}

/** Closed ring of points, consecutive duplicates removed. */
export function tessellateLoop(loop: BoundaryLoop): Pt[] {
  const ring: Pt[] = [];
  for (const segment of loop.segments) {
    for (const point of tessellateSegment(segment)) {
      const last = ring[ring.length - 1];
      if (last && dist(last, point) <= DEDUPE_TOLERANCE_MM) continue;
      ring.push(point);
    }
  }
  while (ring.length > 1 && dist(ring[0], ring[ring.length - 1]) <= DEDUPE_TOLERANCE_MM) {
    ring.pop();
  }
  return ring;
}

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function boundsOfPoints(points: Pt[]): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

function mergeBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

const boundsInside = (inner: Bounds, outer: Bounds, tolerance = CHAIN_TOLERANCE_MM) =>
  inner.minX >= outer.minX - tolerance &&
  inner.maxX <= outer.maxX + tolerance &&
  inner.minZ >= outer.minZ - tolerance &&
  inner.maxZ <= outer.maxZ + tolerance;

function regionBounds(region: Region, loops: Map<string, BoundaryLoop>): Bounds | null {
  switch (region.kind) {
    case "loop":
      return boundsOfPoints(tessellateLoop(region.loop));
    case "loopRef": {
      const loop = loops.get(region.loopId);
      return loop ? boundsOfPoints(tessellateLoop(loop)) : null;
    }
    case "rect": {
      const hw = region.widthMm / 2;
      const hd = region.depthMm / 2;
      const cos = Math.cos(region.rotationRad);
      const sin = Math.sin(region.rotationRad);
      const corners: Pt[] = [
        [-hw, -hd],
        [hw, -hd],
        [hw, hd],
        [-hw, hd],
      ].map(([x, z]) => ({
        x: region.originMm.xMm + x * cos - z * sin,
        z: region.originMm.zMm + x * sin + z * cos,
      }));
      return boundsOfPoints(corners);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Loop registry                                                       */
/* ------------------------------------------------------------------ */

/** Every loop reachable in the spec, including loops inlined inside regions. */
export function collectLoops(spec: BlueprintSpec): BoundaryLoop[] {
  const out: BoundaryLoop[] = [];
  for (const boundary of spec.boundaries) out.push(boundary.loop);
  const fromRegion = (region: Region) => {
    if (region.kind === "loop") out.push(region.loop);
  };
  for (const item of spec.voids) fromRegion(item.region);
  for (const item of spec.cores) fromRegion(item.region);
  for (const item of spec.zones) fromRegion(item.region);
  return out;
}

function loopIndex(spec: BlueprintSpec): Map<string, BoundaryLoop> {
  const map = new Map<string, BoundaryLoop>();
  for (const loop of collectLoops(spec)) {
    if (!map.has(loop.id)) map.set(loop.id, loop);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

function checkIdentity(spec: BlueprintSpec): {
  violations: BlueprintViolation[];
  ids: Set<string>;
} {
  const violations: BlueprintViolation[] = [];
  const ids = new Set<string>();

  const declare = (id: string, what: string) => {
    if (ids.has(id)) {
      violations.push(
        violation(
          "DUPLICATE_ID",
          "P0",
          `${what} reuses id "${id}", which is already taken.`,
          [id],
          { suggestion: "Ids must be unique across the whole blueprint." },
        ),
      );
      return;
    }
    ids.add(id);
  };

  const declareRegion = (region: Region, what: string) => {
    if (region.kind === "loop") declare(region.loop.id, `${what} loop`);
  };

  for (const boundary of spec.boundaries) declare(boundary.loop.id, "Boundary");
  for (const item of spec.voids) {
    declare(item.id, "Void");
    declareRegion(item.region, "Void");
  }
  for (const item of spec.cores) {
    declare(item.id, "Core");
    declareRegion(item.region, "Core");
  }
  for (const item of spec.anchors) declare(item.id, "Anchor");
  for (const item of spec.axes) declare(item.id, "Axis");
  for (const item of spec.circulation.nodes) declare(item.id, "Circulation node");
  for (const item of spec.circulation.edges) declare(item.id, "Circulation edge");
  for (const item of spec.zones) {
    declare(item.id, "Zone");
    declareRegion(item.region, "Zone");
  }
  for (const item of spec.gridSystems) declare(item.id, "Grid system");
  for (const item of spec.verticalRules) declare(item.id, "Vertical rule");
  for (const item of spec.facadeRules) declare(item.id, "Facade rule");
  for (const item of spec.relationships) declare(item.id, "Relationship");
  for (const item of spec.dimensions) declare(item.id, "Dimension");

  return { violations, ids };
}

/* ------------------------------------------------------------------ */
/* Boundary geometry                                                   */
/* ------------------------------------------------------------------ */

const sign = (v: number) => (v > CROSS_EPSILON ? 1 : v < -CROSS_EPSILON ? -1 : 0);

const cross = (a: Pt, b: Pt, c: Pt) =>
  (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

/** Proper (interior) crossing only — shared endpoints are excluded by index. */
function properIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1 = sign(cross(p3, p4, p1));
  const d2 = sign(cross(p3, p4, p2));
  const d3 = sign(cross(p1, p2, p3));
  const d4 = sign(cross(p1, p2, p4));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function checkLoops(spec: BlueprintSpec): BlueprintViolation[] {
  const out: BlueprintViolation[] = [];

  for (const loop of collectLoops(spec)) {
    // Chaining: each segment must start where the previous one ended, and the
    // last must return to the first.
    for (let i = 0; i < loop.segments.length; i += 1) {
      const next = loop.segments[(i + 1) % loop.segments.length];
      const end = segmentEnd(loop.segments[i]);
      const start = segmentStart(next);
      const gap = Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm);
      if (gap > CHAIN_TOLERANCE_MM) {
        out.push(
          violation(
            "BOUNDARY_NOT_CLOSED",
            "P0",
            `Loop "${loop.id}" has a ${gap.toFixed(1)} mm gap between segment ${i} and segment ${(i + 1) % loop.segments.length}.`,
            [loop.id],
            { suggestion: "Snap the segment endpoints together." },
          ),
        );
      }
    }

    const ring = tessellateLoop(loop);
    if (ring.length < 3) {
      out.push(
        violation(
          "BOUNDARY_NOT_CLOSED",
          "P0",
          `Loop "${loop.id}" encloses no area — it tessellates to ${ring.length} distinct point(s).`,
          [loop.id],
        ),
      );
      continue;
    }

    // O(n²) over the tessellated ring. Ring sizes here are tens to low
    // hundreds of points, so this is cheaper than any sweep-line setup.
    const n = ring.length;
    let reported = false;
    for (let i = 0; i < n && !reported; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const adjacent = j === i + 1 || (i === 0 && j === n - 1);
        if (adjacent) continue;
        if (
          properIntersect(
            ring[i],
            ring[(i + 1) % n],
            ring[j],
            ring[(j + 1) % n],
          )
        ) {
          out.push(
            violation(
              "BOUNDARY_SELF_INTERSECTS",
              "P0",
              `Loop "${loop.id}" crosses itself.`,
              [loop.id],
              { suggestion: "Untangle the outline; a boundary must be simple." },
            ),
          );
          reported = true;
          break;
        }
      }
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Voids                                                               */
/* ------------------------------------------------------------------ */

function checkVoids(spec: BlueprintSpec): BlueprintViolation[] {
  const out: BlueprintViolation[] = [];
  const loops = loopIndex(spec);

  for (const item of spec.voids) {
    const inner = regionBounds(item.region, loops);
    if (!inner) continue;

    // Bounding-box containment only, and deliberately so at this stage: a void
    // whose bbox escapes the plate is definitely wrong, and exact polygon
    // containment waits for geom/.
    let outer: Bounds | null = null;
    for (const boundary of spec.boundaries) {
      if (!boundary.floorNos.some((f) => item.floorNos.includes(f))) continue;
      const b = boundsOfPoints(tessellateLoop(boundary.loop));
      if (!b) continue;
      outer = outer ? mergeBounds(outer, b) : b;
    }
    if (!outer) continue;

    if (!boundsInside(inner, outer)) {
      out.push(
        violation(
          "VOID_OUTSIDE_BOUNDARY",
          "P1",
          `Void "${item.id}" extends beyond the floor plate on levels ${item.floorNos.join(", ")}.`,
          [item.id],
          {
            floorNo: item.floorNos[0],
            suggestion: "Move the void inside the boundary or enlarge the plate.",
          },
        ),
      );
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* References                                                          */
/* ------------------------------------------------------------------ */

function checkReferences(spec: BlueprintSpec, ids: Set<string>): BlueprintViolation[] {
  const out: BlueprintViolation[] = [];
  const loops = loopIndex(spec);
  const nodeIds = new Set(spec.circulation.nodes.map((n) => n.id));

  const ref = (targetId: string | undefined, ownerId: string, what: string) => {
    if (targetId === undefined) return;
    if (ids.has(targetId)) return;
    out.push(
      violation(
        "DANGLING_REF",
        "P0",
        `${what} on "${ownerId}" points at "${targetId}", which does not exist.`,
        [ownerId],
        { suggestion: "Remove the reference or add the missing object." },
      ),
    );
  };

  const loopRef = (loopId: string, ownerId: string, what: string) => {
    if (loops.has(loopId)) return;
    out.push(
      violation(
        "DANGLING_REF",
        "P0",
        `${what} on "${ownerId}" points at loop "${loopId}", which does not exist.`,
        [ownerId],
      ),
    );
  };

  const edgeRef = (
    edge: { loopId: string; segmentIndex: number },
    ownerId: string,
    what: string,
  ) => {
    const loop = loops.get(edge.loopId);
    if (!loop) {
      loopRef(edge.loopId, ownerId, what);
      return;
    }
    if (edge.segmentIndex >= loop.segments.length) {
      out.push(
        violation(
          "DANGLING_REF",
          "P0",
          `${what} on "${ownerId}" names segment ${edge.segmentIndex} of loop "${edge.loopId}", which has ${loop.segments.length}.`,
          [ownerId],
        ),
      );
    }
  };

  const regionRef = (region: Region, ownerId: string, what: string) => {
    if (region.kind === "loopRef") loopRef(region.loopId, ownerId, what);
  };

  for (const item of spec.voids) regionRef(item.region, item.id, "Void region");
  for (const item of spec.cores) regionRef(item.region, item.id, "Core region");
  for (const item of spec.zones) {
    regionRef(item.region, item.id, "Zone region");
    for (const memberId of item.memberIds) ref(memberId, item.id, "Zone member");
  }

  for (const item of spec.gridSystems) {
    if (item.regionLoopId !== undefined) {
      loopRef(item.regionLoopId, item.id, "Grid region");
    }
  }

  for (const edge of spec.circulation.edges) {
    for (const [nodeId, role] of [
      [edge.fromNodeId, "Edge start"],
      [edge.toNodeId, "Edge end"],
    ] as const) {
      if (!nodeIds.has(nodeId)) {
        out.push(
          violation(
            "DANGLING_REF",
            "P0",
            `${role} on "${edge.id}" points at node "${nodeId}", which does not exist.`,
            [edge.id],
          ),
        );
      }
    }
  }

  for (const rule of spec.verticalRules) {
    switch (rule.kind) {
      case "atrium-span":
        ref(rule.voidId, rule.id, "Atrium span target");
        break;
      case "setback":
        edgeRef(rule.edge, rule.id, "Setback edge");
        break;
      case "double-height":
        ref(rule.targetId, rule.id, "Double-height target");
        break;
      case "podium-tower":
        loopRef(rule.podiumLoopId, rule.id, "Podium loop");
        loopRef(rule.towerLoopId, rule.id, "Tower loop");
        break;
    }
  }

  for (const rule of spec.facadeRules) edgeRef(rule.edge, rule.id, "Facade edge");

  for (const rel of spec.relationships) {
    ref(rel.fromId, rel.id, "Relationship source");
    ref(rel.toId, rel.id, "Relationship target");
  }

  for (const dim of spec.dimensions) {
    if (dim.subject.mode === "between") {
      ref(dim.subject.fromId, dim.id, "Dimension source");
      ref(dim.subject.toId, dim.id, "Dimension target");
    } else {
      ref(dim.subject.targetId, dim.id, "Dimension target");
    }
  }

  for (const override of spec.fidelityOverrides) {
    ref(override.targetId, override.targetId, "Fidelity override");
  }
  for (const item of spec.uncertainty) {
    ref(item.targetId, item.targetId, "Uncertainty");
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Circulation connectivity                                            */
/* ------------------------------------------------------------------ */

function checkCirculation(spec: BlueprintSpec): BlueprintViolation[] {
  const nodes = spec.circulation.nodes;
  if (nodes.length < 2) return [];

  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of spec.circulation.edges) {
    const from = adjacency.get(edge.fromNodeId);
    const to = adjacency.get(edge.toNodeId);
    if (!from || !to) continue; // dangling edges are reported separately
    from.push(edge.toNodeId);
    to.push(edge.fromNodeId);
  }

  // Seed from the first declared node so the result is order-stable.
  const seen = new Set<string>([nodes[0].id]);
  const queue = [nodes[0].id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }

  const stranded = nodes.filter((n) => !seen.has(n.id));
  if (stranded.length === 0) return [];

  return [
    violation(
      "CIRCULATION_DISCONNECTED",
      "P1",
      `${stranded.length} circulation node(s) cannot be reached from "${nodes[0].id}".`,
      stranded.map((n) => n.id),
      { suggestion: "Add an edge linking the stranded nodes to the main route." },
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* Grids                                                               */
/* ------------------------------------------------------------------ */

/** Outside this range a "bay" is a drafting error, not a structural decision. */
const MIN_BAY_MM = 600;
const MAX_BAY_MM = 30_000;

function checkGrids(spec: BlueprintSpec): BlueprintViolation[] {
  const out: BlueprintViolation[] = [];

  for (const grid of spec.gridSystems) {
    for (const [axis, spacings] of [
      ["X", grid.xSpacingsMm],
      ["Z", grid.zSpacingsMm],
    ] as const) {
      for (const spacing of spacings) {
        if (spacing < MIN_BAY_MM || spacing > MAX_BAY_MM) {
          out.push(
            violation(
              "GRID_SPACING_INVALID",
              "P1",
              `Grid "${grid.id}" has a ${spacing} mm bay along ${axis}; usable bays run ${MIN_BAY_MM}–${MAX_BAY_MM} mm.`,
              [grid.id],
              { suggestion: "Re-check the drawing scale, then the bay spacing." },
            ),
          );
        }
      }
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Level coverage                                                      */
/* ------------------------------------------------------------------ */

function checkLevelMapping(spec: BlueprintSpec): BlueprintViolation[] {
  const out: BlueprintViolation[] = [];

  const covered = new Set<number>();
  for (const boundary of spec.boundaries) {
    for (const floorNo of boundary.floorNos) covered.add(floorNo);
  }

  // Objects that assume a plate exists under them.
  const referenced = new Map<number, string[]>();
  const note = (floorNos: number[], id: string) => {
    for (const floorNo of floorNos) {
      const list = referenced.get(floorNo) ?? [];
      list.push(id);
      referenced.set(floorNo, list);
    }
  };
  for (const item of spec.voids) note(item.floorNos, item.id);
  for (const item of spec.cores) note(item.floorNos, item.id);
  for (const item of spec.zones) note(item.floorNos, item.id);

  const missing = new Map<number, string[]>();
  for (const [floorNo, owners] of referenced) {
    if (covered.has(floorNo)) continue;
    missing.set(floorNo, owners);
  }

  // Interior holes in the boundary run: level 3 absent between 2 and 4 is a
  // gap, not a design decision.
  if (covered.size > 0) {
    const floors = [...covered].sort((a, b) => a - b);
    for (let floorNo = floors[0]; floorNo <= floors[floors.length - 1]; floorNo += 1) {
      if (floorNo === 0 || covered.has(floorNo)) continue;
      if (!missing.has(floorNo)) missing.set(floorNo, []);
    }
  }

  for (const floorNo of [...missing.keys()].sort((a, b) => a - b)) {
    const owners = missing.get(floorNo)!;
    const because =
      owners.length > 0
        ? ` but ${owners.length} object(s) rely on it`
        : " inside the described range";
    out.push(
      violation(
        "LEVEL_MAPPING_GAP",
        "P1",
        `Level ${floorNo} has no boundary${because}.`,
        owners,
        { floorNo, suggestion: "Map an existing plan loop onto this level." },
      ),
    );
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Scale                                                               */
/* ------------------------------------------------------------------ */

/** Below this, treat the calibration as a guess rather than a measurement. */
const CALIBRATION_CONFIDENCE_FLOOR = 0.5;

function checkScale(spec: BlueprintSpec): BlueprintViolation[] {
  const { calibrated, calibrationConfidence, method } = spec.coordinateSystem;

  if (!calibrated) {
    return [
      violation(
        "SCALE_UNCALIBRATED",
        "P3",
        `Scale was never calibrated (method: ${method}); dimensions are proportional, not absolute.`,
        [spec.id],
        { suggestion: "Give one known dimension to lock the drawing scale." },
      ),
    ];
  }

  if (calibrationConfidence < CALIBRATION_CONFIDENCE_FLOOR) {
    return [
      violation(
        "SCALE_UNCALIBRATED",
        "P3",
        `Scale calibration confidence is ${calibrationConfidence.toFixed(2)} (method: ${method}).`,
        [spec.id],
        { suggestion: "Confirm the scale against a dimension you trust." },
      ),
    ];
  }

  return [];
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export function validateBlueprint(spec: BlueprintSpec): BlueprintValidationReport {
  const identity = checkIdentity(spec);

  const violations = [
    ...identity.violations,
    ...checkLoops(spec),
    ...checkVoids(spec),
    ...checkReferences(spec, identity.ids),
    ...checkCirculation(spec),
    ...checkGrids(spec),
    ...checkLevelMapping(spec),
    ...checkScale(spec),
  ];

  const counts = {
    critical: violations.filter((v) => v.severity === "critical").length,
    warning: violations.filter((v) => v.severity === "warning").length,
    advisory: violations.filter((v) => v.severity === "advisory").length,
  };

  // Sort worst-first so the Issues panel needs no further ordering.
  const order: Record<BlueprintViolationPriority, number> = {
    P0: 0,
    P1: 1,
    P2: 2,
    P3: 3,
  };
  violations.sort((a, b) => order[a.priority] - order[b.priority]);

  return { violations, counts, blueprintValid: counts.critical === 0 };
}
