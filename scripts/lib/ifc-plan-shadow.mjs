// scripts/lib/ifc-plan-shadow.mjs
//
// Horizontal-projected areas of roofs and ground slabs, from tessellated
// element geometry — the two envelope figures a monthly or degree-day method
// needs that neither the wall walk (`ifc-face-area.mjs`, wall-only by
// construction) nor the space solids (`ifc-space-volume.mjs`) can supply.
//
// The measurement is the element's PLAN SHADOW: the union of every triangle
// of its mesh projected onto the plan, computed exactly with polygon-clipping.
// Not "Σ area × n_y over the upward faces", which is the obvious formula and
// is wrong on real files in a way no test on a box would find:
//
//   - The Clinic's five `Standing Seam Metal Roof` IfcRoof elements are
//     `IfcFaceBasedSurfaceModel`s whose top AND bottom sheets are both wound
//     upward (no triangle in any of them has n_y < 0), so the upward sum is
//     exactly 2.000× their plan boxes — 865.33 m² for roofs whose shadow is
//     432.67. A closed, consistently wound solid gives the same answer either
//     way; a surface model does not, and a file does not say which it is.
//   - A roof build-up modelled as several stacked slabs (deck, insulation,
//     finish) sums to several times its area; the shadow of the set counts
//     it once.
//
// The upward sum is still computed and reported beside the shadow as
// `upFacingProjectedSqm`, because the ratio between the two is what tells a
// reader the mesh presented its top face twice — a fact about the file worth
// keeping rather than silently normalising away.
//
// Frame: web-ifc's Y-up world, metres, the same frame the fabric GLB is
// written in. Plan axes are X and Z.

import polygonClipping from "polygon-clipping";

const DEGENERATE_SQM = 1e-9;

function triangleNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
  const nx = uy * wz - uz * wy;
  const ny = uz * wx - ux * wz;
  const nz = ux * wy - uy * wx;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return null;
  return { n: [nx / len, ny / len, nz / len], area: len / 2 };
}

/**
 * Snap grids tried in turn when polygon-clipping's sweep line loses a
 * segment. Its Martinez implementation is exact on clean input and throws
 * ("Unable to find segment … in SweepLine tree") on the near-degenerate
 * slivers a tessellator emits along a 47.94° wall, which Schependomlaan has
 * 88 of. Snapping vertices to 1 µm resolves almost all of them and moves
 * no published figure; the coarser grids exist so an element is measured
 * at a stated precision rather than not at all. The grid actually used is
 * returned, so a caller can say when it was not the first.
 */
const SNAP_LADDER_M = Object.freeze([1e-6, 1e-5, 1e-4, 1e-3]);

const snapTo = (value, grid) => Math.round(value / grid) * grid;

/**
 * Every triangle of a mesh dropped onto the plan as a counter-clockwise
 * polygon-clipping ring. Vertical faces project to a line and are skipped —
 * they have no shadow.
 */
function projectedRings(triangles, snapM) {
  const rings = [];
  for (const [a, b, c] of triangles) {
    const p = [snapTo(a[0], snapM), snapTo(a[2], snapM)];
    const q = [snapTo(b[0], snapM), snapTo(b[2], snapM)];
    const r = [snapTo(c[0], snapM), snapTo(c[2], snapM)];
    const twice = (q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1]);
    if (Math.abs(twice) < 2 * DEGENERATE_SQM) continue;
    rings.push([twice > 0 ? [p, q, r, p] : [p, r, q, p]]);
  }
  return rings;
}

/** Union with the snap ladder; returns the multipolygon and the grid that worked. */
function unionWithLadder(makeRings) {
  let lastError = null;
  for (const snapM of SNAP_LADDER_M) {
    const rings = makeRings(snapM);
    if (rings.length === 0) return { multiPolygon: [], snapM };
    try {
      return { multiPolygon: polygonClipping.union(...rings), snapM };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `polygon-clipping could not union the shadow at any snap grid up to ` +
      `${SNAP_LADDER_M[SNAP_LADDER_M.length - 1]} m: ${lastError?.message ?? "unknown"}`,
  );
}

function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return sum / 2;
}

function ringLength(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    sum += Math.hypot(ring[i + 1][0] - ring[i][0], ring[i + 1][1] - ring[i][1]);
  }
  return sum;
}

/**
 * Area and boundary length of a polygon-clipping MultiPolygon.
 *
 * `perimeterM` is EVERY ring, holes included. For a ground slab a hole is a
 * courtyard, and a courtyard edge is exposed perimeter in the ISO 13370
 * sense just as the outer edge is; a reader who wants the outer rings alone
 * has `outerPerimeterM`.
 */
export function measureMultiPolygon(multiPolygon) {
  let areaSqm = 0;
  let perimeterM = 0;
  let outerPerimeterM = 0;
  let holes = 0;
  for (const polygon of multiPolygon) {
    polygon.forEach((ring, index) => {
      const length = ringLength(ring);
      perimeterM += length;
      if (index === 0) {
        areaSqm += Math.abs(ringArea(ring));
        outerPerimeterM += length;
      } else {
        areaSqm -= Math.abs(ringArea(ring));
        holes += 1;
      }
    });
  }
  return { areaSqm, perimeterM, outerPerimeterM, polygons: multiPolygon.length, holes };
}

/**
 * The plan shadow of one element's world-space triangles.
 *
 * Returns the shadow as a polygon-clipping MultiPolygon (so shadows can be
 * unioned across elements) with its area, plus the two diagnostics a
 * reader needs to judge the mesh: the upward-face projected sum, and the
 * area-weighted tilt of the upward faces.
 */
export function planShadow(triangles) {
  const { multiPolygon, snapM } = unionWithLadder((grid) => projectedRings(triangles, grid));
  const measured = measureMultiPolygon(multiPolygon);

  let upFacingProjected = 0;
  let upFacingArea = 0;
  let downFacingProjected = 0;
  for (const [a, b, c] of triangles) {
    const t = triangleNormal(a, b, c);
    if (!t) continue;
    if (t.n[1] > 0) {
      upFacingProjected += t.area * t.n[1];
      upFacingArea += t.area;
    } else {
      downFacingProjected += t.area * -t.n[1];
    }
  }
  // Mean tilt of the upward faces, weighted by their true area. A flat slab
  // reads 0; a pitched roof reads its pitch; a barrel reads its mean slope.
  // Faces steeper than ~87° (edges, upstands) are excluded so a thick flat
  // slab's rim does not tilt it.
  let tiltNum = 0;
  let tiltDen = 0;
  for (const [a, b, c] of triangles) {
    const t = triangleNormal(a, b, c);
    if (!t || t.n[1] <= 0.05) continue;
    tiltNum += t.area * t.n[1];
    tiltDen += t.area;
  }
  const tiltDeg = tiltDen > 0 ? (Math.acos(Math.min(1, tiltNum / tiltDen)) * 180) / Math.PI : null;

  return {
    multiPolygon,
    projectedSqm: measured.areaSqm,
    perimeterM: measured.perimeterM,
    upFacingProjectedSqm: upFacingProjected,
    upFacingSqm: upFacingArea,
    downFacingProjectedSqm: downFacingProjected,
    tiltDeg,
    /** The vertex grid the union succeeded at; 1e-6 unless the mesh forced a coarser one. */
    snapM,
  };
}

const snapMultiPolygon = (multiPolygon, grid) =>
  multiPolygon.map((polygon) =>
    polygon.map((ring) => ring.map(([x, y]) => [snapTo(x, grid), snapTo(y, grid)])),
  );

/** Union of several shadows, measured. */
export function unionShadows(multiPolygons) {
  const nonEmpty = multiPolygons.filter((m) => m && m.length > 0);
  if (nonEmpty.length === 0) {
    return { multiPolygon: [], snapM: SNAP_LADDER_M[0], ...measureMultiPolygon([]) };
  }
  if (nonEmpty.length === 1) {
    return { multiPolygon: nonEmpty[0], snapM: SNAP_LADDER_M[0], ...measureMultiPolygon(nonEmpty[0]) };
  }
  const { multiPolygon, snapM } = unionWithLadder((grid) =>
    nonEmpty.map((m) => snapMultiPolygon(m, grid)),
  );
  return { multiPolygon, snapM, ...measureMultiPolygon(multiPolygon) };
}

/** Area shared by two shadows. */
export function overlapSqm(a, b) {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  return measureMultiPolygon(polygonClipping.intersection(a, b)).areaSqm;
}
