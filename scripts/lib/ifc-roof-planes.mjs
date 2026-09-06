// scripts/lib/ifc-roof-planes.mjs
//
// Stage 1 of the PV placement methodology: a roof's PLANES, measured from its
// own triangles, not a bounding box around them.
//
// Why this exists is worth stating where the code is, because the thing it
// replaces looks reasonable until you read it. `analyzeUpwardFaces` in
// `reference-retrofit-visuals.tsx` takes every upward triangle of the roof
// set, blends their tilts into ONE area-weighted mean angle, and returns the
// set's XZ bounding box. A gable then reads as one plane where it has two
// facing opposite ways; an L-shaped roof gets modules over the notch; a roof
// with lower entrance pads gets modules above air. The area was always right
// and the geometry was never the roof's.
//
// A plane here is a CONNECTED patch of coplanar upward triangles. Connected
// matters: two parallel patches at different heights — the Duplex's main deck
// and its entrance pads — are the same plane in the algebraic sense and two
// different roofs in every sense that places a module, so the region grow
// walks shared edges and will not join them.

import { planShadow } from "./ifc-plan-shadow.mjs";

/** Upward-facing, as the extractor already defines it elsewhere: within 80°. */
const UP_COS = Math.cos((80 * Math.PI) / 180);
/** Two triangles are coplanar when their normals agree within 2°… */
const NORMAL_COS = Math.cos((2 * Math.PI) / 180);
/** …and their plane offsets (n·p) agree within 20 mm. */
const OFFSET_M = 0.02;
/** Vertex key grid for edge adjacency. Tighter than any real mesh gap. */
const VERTEX_GRID_M = 1e-4;
/** Outline simplification, per the methodology. */
const SIMPLIFY_M = 0.01;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function triangleFacts(tri) {
  const [a, b, c] = tri;
  const n = cross(sub(b, a), sub(c, a));
  const len = Math.hypot(n[0], n[1], n[2]);
  if (!(len > 0) || !Number.isFinite(len)) return null;
  const unit = [n[0] / len, n[1] / len, n[2] / len];
  return { unit, area: len / 2, offset: dot(unit, a), tri };
}

const vkey = (p) =>
  `${Math.round(p[0] / VERTEX_GRID_M)},${Math.round(p[1] / VERTEX_GRID_M)},${Math.round(p[2] / VERTEX_GRID_M)}`;
const ekey = (p, q) => {
  const [a, b] = [vkey(p), vkey(q)];
  return a < b ? `${a}|${b}` : `${b}|${a}`;
};

/**
 * Region-grow the upward triangles of one element into connected coplanar
 * patches.
 *
 * The pairwise test is against the NEIGHBOUR, not against the seed, which is
 * the ordinary trade of region growing: it follows a barrel or a shallow dome
 * around by 2° a step and reports it as one plane. That is the right answer
 * for a curved roof (it IS one surface) and the wrong one only if someone
 * later wants the curvature back — recorded here rather than guarded against,
 * because none of these four buildings has a curved roof and inventing a
 * global-plane test for a case that does not exist would be untested code.
 */
function clusterPlanes(triangles) {
  const facts = [];
  for (const tri of triangles) {
    const f = triangleFacts(tri);
    if (f && f.unit[1] > UP_COS) facts.push(f);
  }
  if (facts.length === 0) return [];

  const byEdge = new Map();
  facts.forEach((f, i) => {
    const [a, b, c] = f.tri;
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const k = ekey(p, q);
      if (!byEdge.has(k)) byEdge.set(k, []);
      byEdge.get(k).push(i);
    }
  });

  const coplanar = (x, y) =>
    dot(x.unit, y.unit) >= NORMAL_COS && Math.abs(x.offset - y.offset) <= OFFSET_M;

  const planeOf = new Array(facts.length).fill(-1);
  const clusters = [];
  for (let seed = 0; seed < facts.length; seed += 1) {
    if (planeOf[seed] !== -1) continue;
    const id = clusters.length;
    const members = [];
    const queue = [seed];
    planeOf[seed] = id;
    while (queue.length > 0) {
      const i = queue.pop();
      members.push(i);
      const [a, b, c] = facts[i].tri;
      for (const [p, q] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        for (const j of byEdge.get(ekey(p, q)) ?? []) {
          if (planeOf[j] !== -1) continue;
          if (!coplanar(facts[i], facts[j])) continue;
          planeOf[j] = id;
          queue.push(j);
        }
      }
    }
    clusters.push(members.map((i) => facts[i]));
  }
  return clusters;
}

/** Drop vertices that lie on the segment between their neighbours, within tol. */
function simplifyRing(ring, tolM) {
  if (ring.length < 4) return ring;
  const out = [];
  const n = ring.length - 1; // last repeats the first
  for (let i = 0; i < n; i += 1) {
    const prev = out.length > 0 ? out[out.length - 1] : ring[(i - 1 + n) % n];
    const cur = ring[i];
    const next = ring[(i + 1) % n];
    const ax = cur[0] - prev[0];
    const ay = cur[1] - prev[1];
    const bx = next[0] - prev[0];
    const by = next[1] - prev[1];
    const len = Math.hypot(bx, by);
    const dist = len > 0 ? Math.abs(ax * by - ay * bx) / len : Math.hypot(ax, ay);
    if (dist > tolM) out.push(cur);
  }
  if (out.length < 3) return ring;
  out.push(out[0]);
  return out;
}

const ringArea2 = (ring) => {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return s;
};

const r = (v, dp = 3) => {
  const f = 10 ** dp;
  const out = Math.round(v * f) / f;
  return Object.is(out, -0) ? 0 : out;
};

/**
 * Rings for one plane, outer counter-clockwise and holes clockwise.
 *
 * `polygon-clipping` returns each polygon as [outer, ...holes] but does not
 * promise a winding, so the orientation is imposed here from the signed area
 * rather than assumed — a hole handed to a layout library with the outer
 * ring's winding is a hole it will fill with modules.
 */
function outlineRings(multiPolygon) {
  const rings = [];
  for (const polygon of multiPolygon ?? []) {
    polygon.forEach((ring, index) => {
      const simplified = simplifyRing(
        ring.map(([x, y]) => [r(x), r(y)]),
        SIMPLIFY_M,
      );
      const wantPositive = index === 0; // outer CCW (positive shoelace), holes CW
      const oriented =
        ringArea2(simplified) >= 0 === wantPositive ? simplified : [...simplified].reverse();
      rings.push({ kind: index === 0 ? "outer" : "hole", points: oriented });
    });
  }
  return rings;
}

/**
 * Bearing of the downslope direction, degrees clockwise from project north.
 *
 * North is the model's −Z after web-ifc's Z-up to Y-up conversion, which is
 * the same convention `manifest.orientation` states and the same one the wall
 * split is binned by; `northAssumed` travels with it because on three of these
 * four buildings there is no stated true north at all. A flat plane has no
 * downslope and returns null rather than 0 — 0 would read as due north.
 */
function azimuthDeg(unit) {
  const dx = -unit[0];
  const dz = -unit[2];
  const len = Math.hypot(dx, dz);
  if (!(len > 1e-9)) return null;
  const deg = (Math.atan2(dx / len, -(dz / len)) * 180) / Math.PI;
  return r((deg + 360) % 360, 2);
}

/** One plane's measured record. */
function describePlane(row, facts) {
  let surface = 0;
  let projected = 0;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const f of facts) {
    surface += f.area;
    projected += f.area * f.unit[1];
    nx += f.unit[0] * f.area;
    ny += f.unit[1] * f.area;
    nz += f.unit[2] * f.area;
    for (const p of f.tri) {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
  }
  const len = Math.hypot(nx, ny, nz);
  const unit = len > 0 ? [nx / len, ny / len, nz / len] : [0, 1, 0];
  const shadow = planShadow(facts.map((f) => f.tri));
  return {
    elementName: row.name,
    elementType: row.typeName,
    elementRef: row.ref,
    family: row.family ?? null,
    storeyId: row.storeyId ?? null,
    normal: [r(unit[0], 6), r(unit[1], 6), r(unit[2], 6)],
    tiltDeg: r((Math.acos(Math.min(1, Math.max(-1, unit[1]))) * 180) / Math.PI, 2),
    azimuthDeg: azimuthDeg(unit),
    surfaceSqm: r(surface, 2),
    projectedSqm: r(projected, 2),
    minElevationM: r(minY),
    maxElevationM: r(maxY),
    triangleCount: facts.length,
    outline: outlineRings(shadow.multiPolygon),
    obstructions: [],
  };
}

/**
 * Every roof plane of a building, from its classified roof rows.
 *
 * Rows must carry `triangles`; `ifc-horizontal.mjs` computes them for the plan
 * shadow and used to discard them, which is the one change this needed
 * upstream. Planes are sorted largest-surface-first within an element so the
 * main deck of a roof is `planes[0]`, and elements keep the manifest's order.
 */
export function roofPlanes(roofRows, { minSurfaceSqm = 0.25 } = {}) {
  const planes = [];
  for (const row of roofRows) {
    if (!Array.isArray(row.triangles) || row.triangles.length === 0) continue;
    const clusters = clusterPlanes(row.triangles)
      .map((facts) => describePlane(row, facts))
      // A sliver is a tessellation artefact, not a plane a module can sit on.
      // Reported in the file's own note rather than silently dropped.
      .filter((p) => p.surfaceSqm >= minSurfaceSqm)
      .sort((a, b) => b.surfaceSqm - a.surfaceSqm);
    clusters.forEach((plane, index) => {
      planes.push({ id: `${row.id ?? `roof-${row.expressID}`}-plane-${index}`, ...plane });
    });
  }
  return planes;
}

export const ROOF_PLANE_CONSTANTS = Object.freeze({
  upwardWithinDeg: 80,
  normalToleranceDeg: 2,
  offsetToleranceM: OFFSET_M,
  simplifyM: SIMPLIFY_M,
});
