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

import polygonClipping from "polygon-clipping";
import { planShadow, measureMultiPolygon } from "./ifc-plan-shadow.mjs";

/** Upward-facing, as the extractor already defines it elsewhere: within 80°. */
const UP_COS = Math.cos((80 * Math.PI) / 180);
/** Two triangles are coplanar when their normals agree within 2°… */
const NORMAL_COS = Math.cos((2 * Math.PI) / 180);
/** …and their plane offsets (n·p) agree within 20 mm. */
const OFFSET_M = 0.02;
/**
 * Second pass, between patches of ONE element: two edge-disconnected patches
 * with the same normal (2°), plane offsets within 150 mm, and plan bounding
 * boxes that touch within 50 mm are one roof surface modelled as strips.
 *
 * Measured, not supposed: the Clinic's standing-seam roof is 244 separate pan
 * solids of ~1.5 m² each, one per rib bay, offset from their neighbours by
 * the rib height. Shared-edge growing can never join them (no shared edge
 * exists) and the 20 mm offset test would not either. The first build of this
 * file reported 244 planes for a roof a person sees as five. 150 mm is a rib,
 * not a storey — the Duplex's deck and pads stay apart because their boxes do
 * not touch, and two parallel decks a storey apart fail the offset test.
 */
const MERGE_OFFSET_M = 0.15;
const MERGE_GAP_M = 0.05;
/** Below this tilt a plane is flat and carries no azimuth (sin 0.5°). */
const FLAT_SIN = Math.sin((0.5 * Math.PI) / 180);
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
  return mergeStrips(clusters);
}

function clusterSummary(facts) {
  let area = 0;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let offset = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const f of facts) {
    area += f.area;
    nx += f.unit[0] * f.area;
    ny += f.unit[1] * f.area;
    nz += f.unit[2] * f.area;
    offset += f.offset * f.area;
    for (const p of f.tri) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[2] < minZ) minZ = p[2];
      if (p[2] > maxZ) maxZ = p[2];
    }
  }
  const len = Math.hypot(nx, ny, nz);
  return {
    unit: len > 0 ? [nx / len, ny / len, nz / len] : [0, 1, 0],
    offset: area > 0 ? offset / area : 0,
    minX,
    maxX,
    minZ,
    maxZ,
  };
}

/** Union-find merge of same-plane strips — see `MERGE_OFFSET_M`. */
function mergeStrips(clusters) {
  if (clusters.length < 2) return clusters;
  const summaries = clusters.map(clusterSummary);
  const parent = clusters.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < clusters.length; i += 1) {
    for (let j = i + 1; j < clusters.length; j += 1) {
      const a = summaries[i];
      const b = summaries[j];
      if (dot(a.unit, b.unit) < NORMAL_COS) continue;
      if (Math.abs(a.offset - b.offset) > MERGE_OFFSET_M) continue;
      const touch =
        a.minX <= b.maxX + MERGE_GAP_M &&
        b.minX <= a.maxX + MERGE_GAP_M &&
        a.minZ <= b.maxZ + MERGE_GAP_M &&
        b.minZ <= a.maxZ + MERGE_GAP_M;
      if (!touch) continue;
      parent[find(i)] = find(j);
    }
  }
  const merged = new Map();
  clusters.forEach((facts, i) => {
    const root = find(i);
    if (!merged.has(root)) merged.set(root, []);
    merged.get(root).push(...facts);
  });
  return [...merged.values()];
}

/**
 * What the sky sees. Planes sorted highest first; each keeps only the part of
 * its plan shadow not already covered by a higher plane, and is dropped when
 * that part is below the sliver threshold.
 *
 * Without this, every LAYER of a roof reports an upward face — the apartment's
 * tiles, the deck under them, the insulation under that, the ceiling under
 * that — and the plane sum read 2.5× the plan coverage. A module sits on the
 * top layer; heat crosses all of them, which is why the manifest's
 * `roofSurfaceSqm` keeps them and this file does not. `occludedSqm` records
 * what each surviving plane lost, so the two figures can be reconciled.
 */
function occludeBySky(planes, minSurfaceSqm) {
  const ordered = planes
    .map((p, index) => ({ p, index }))
    .sort(
      (a, b) =>
        b.p.maxElevationM - a.p.maxElevationM ||
        b.p.surfaceSqm - a.p.surfaceSqm ||
        a.index - b.index,
    );
  let sky = [];
  const kept = [];
  let occludedPlanes = 0;
  for (const { p, index } of ordered) {
    const shadow = p.shadowMultiPolygon;
    const visible = sky.length === 0 ? shadow : polygonClipping.difference(shadow, sky);
    const visibleSqm = measureMultiPolygon(visible).areaSqm;
    const fullSqm = measureMultiPolygon(shadow).areaSqm;
    sky = sky.length === 0 ? shadow : polygonClipping.union(sky, shadow);
    if (visibleSqm < minSurfaceSqm) {
      occludedPlanes += 1;
      continue;
    }
    const ratio = fullSqm > 0 ? visibleSqm / fullSqm : 1;
    kept.push({
      index,
      plane: {
        ...p,
        surfaceSqm: r(p.surfaceSqm * ratio, 2),
        projectedSqm: r(visibleSqm, 2),
        occludedSqm: r(Math.max(0, fullSqm - visibleSqm), 2),
        outline: outlineRings(visible),
      },
    });
  }
  kept.sort((a, b) => a.index - b.index);
  return { planes: kept.map((k) => k.plane), occludedPlanes };
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
    // A polygon whose outer ring encloses under 0.05 m² is a clipping sliver
    // (a zero-width strip the sky difference left behind), not a piece of
    // roof. Found on the apartment's deck, where such a sliver was listed as
    // the FIRST outer and a consumer that took the first outer laid the
    // whole deck out on it. Dropped here so the file never states a roof
    // piece that no module could ever sit on.
    if (Math.abs(ringArea2(polygon[0] ?? [])) / 2 < 0.05) continue;
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
  // A plane tilted under half a degree is flat, and its horizontal normal
  // component is tessellation noise, not a slope: no bearing rather than a
  // confident 270 read off a 0.3° lean. Same threshold `tiltDeg` rounds at.
  if (!(len > FLAT_SIN)) return null;
  const deg = (Math.atan2(dx / len, -(dz / len)) * 180) / Math.PI;
  return r((deg + 360) % 360, 2);
}

const slugFamily = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "roof";

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
    // Internal: the full shadow the sky pass subtracts from. Deleted before
    // the plane is written.
    shadowMultiPolygon: shadow.multiPolygon,
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
  // Per element: connected coplanar patches, strips of one element merged.
  // Then per FAMILY across elements: the apartment's tiles are one IfcSlab
  // per rafter bay (124 `sporenkap` rows) and the Clinic's standing seam is
  // five IfcRoof elements meeting at ridges; a module does not care which
  // element it sits on, only that the surface is one plane. The same
  // normal/offset/touch test joins bays of one pitch and leaves the other
  // pitch, a storey-higher deck, and a detached wing apart. A merged plane
  // names its largest element and counts the rest in `mergedElements`.
  const byFamily = new Map();
  for (const row of roofRows) {
    if (!Array.isArray(row.triangles) || row.triangles.length === 0) continue;
    const key = row.family ?? row.name ?? String(row.expressID);
    if (!byFamily.has(key)) byFamily.set(key, []);
    for (const facts of clusterPlanes(row.triangles)) {
      byFamily.get(key).push({ row, facts });
    }
  }
  const planes = [];
  for (const [family, patches] of byFamily) {
    const merged = mergeStrips(patches.map((p) => p.facts.map((f) => ({ ...f, row: p.row }))));
    const described = merged
      .map((facts) => {
        // The element with the most surface in the merged patch names it.
        const byRow = new Map();
        for (const f of facts) byRow.set(f.row, (byRow.get(f.row) ?? 0) + f.area);
        const [row] = [...byRow.entries()].sort((a, b) => b[1] - a[1])[0];
        return { ...describePlane(row, facts), mergedElements: byRow.size };
      })
      // A sliver is a tessellation artefact, not a plane a module can sit on.
      // Reported in the file's own note rather than silently dropped.
      .filter((p) => p.surfaceSqm >= minSurfaceSqm)
      .sort((a, b) => b.surfaceSqm - a.surfaceSqm);
    described.forEach((plane, index) => {
      planes.push({ id: `${slugFamily(family)}-plane-${index}`, ...plane });
    });
  }
  const sky = occludeBySky(planes, minSurfaceSqm);
  return {
    planes: sky.planes.map(({ shadowMultiPolygon: _shadow, ...plane }) => plane),
    occludedPlanes: sky.occludedPlanes,
    skyUnionSqm: r(
      measureMultiPolygon(
        planes.length > 0
          ? polygonClipping.union(...planes.map((p) => p.shadowMultiPolygon))
          : [],
      ).areaSqm,
      2,
    ),
  };
}

/**
 * A plan-view drawing of the planes, to scale, so a person can see the roof
 * the modules will be laid on — the check the bounding box failed and no
 * test caught. Outer rings filled by tilt, holes cut, each plane labelled with
 * its tilt and azimuth. Stage 3 draws the modules onto the same drawing.
 */
export function roofPlanesSvg(planes, { id, title = "" } = {}) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of planes) {
    for (const ring of p.outline) {
      for (const [x, z] of ring.points) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }
  }
  if (!Number.isFinite(minX)) return "";
  const pad = 2;
  const w = maxX - minX + 2 * pad;
  const h = maxZ - minZ + 2 * pad;
  const scale = 20; // px per metre
  const tx = (x) => ((x - minX + pad) * scale).toFixed(1);
  const tz = (z) => ((z - minZ + pad) * scale).toFixed(1);
  const fill = (tilt) => {
    if (tilt < 10) return "#cbd5e1";
    if (tilt <= 60) return "#86efac";
    return "#fca5a5";
  };
  const paths = planes
    .map((p) => {
      const d = p.outline
        .map((ring) => ring.points.map(([x, z], i) => `${i === 0 ? "M" : "L"}${tx(x)} ${tz(z)}`).join(" ") + " Z")
        .join(" ");
      const outer = p.outline.find((r0) => r0.kind === "outer")?.points ?? [];
      const cx = outer.reduce((s, q) => s + q[0], 0) / Math.max(1, outer.length);
      const cz = outer.reduce((s, q) => s + q[1], 0) / Math.max(1, outer.length);
      const label = `${p.tiltDeg.toFixed(0)}°${p.azimuthDeg == null ? "" : ` az ${p.azimuthDeg.toFixed(0)}`} · ${p.projectedSqm} m²`;
      return (
        `<path d="${d}" fill="${fill(p.tiltDeg)}" fill-rule="evenodd" stroke="#1f2937" stroke-width="1"><title>${p.id} ${p.elementName}</title></path>` +
        `<text x="${tx(cx)}" y="${tz(cz)}" font-size="9" text-anchor="middle" fill="#111827">${label}</text>`
      );
    })
    .join("\n");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${(w * scale).toFixed(0)}" height="${(h * scale).toFixed(0)}" viewBox="0 0 ${(w * scale).toFixed(0)} ${(h * scale).toFixed(0)}" font-family="monospace">\n` +
    `<rect width="100%" height="100%" fill="#f8fafc"/>\n` +
    `<text x="8" y="14" font-size="11" fill="#111827">${id ?? ""} ${title} — roof planes, plan view, ${scale} px/m; grey flat, green pitched ≤ 60°, red steeper; north is −z (up)</text>\n` +
    `${paths}\n</svg>\n`
  );
}

export const ROOF_PLANE_CONSTANTS = Object.freeze({
  upwardWithinDeg: 80,
  normalToleranceDeg: 2,
  offsetToleranceM: OFFSET_M,
  mergeOffsetM: MERGE_OFFSET_M,
  mergeGapM: MERGE_GAP_M,
  simplifyM: SIMPLIFY_M,
});
