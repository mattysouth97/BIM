// scripts/lib/ifc-face-area.mjs
//
// Net envelope areas from tessellated element geometry.
//
// This replaces the space-boundary route, which measured room-height strips
// gross of openings and was wrong by roughly a third — see the retraction in
// `ifc-envelope.mjs`. The insight that makes this work is that web-ifc's
// tessellation is the FINAL solid: openings are already voided out of it and
// boolean clips are already applied, so a wall's mesh is the wall as built. No
// separate opening subtraction, and no pre-clip approximation for the walls a
// roof plane trims.
//
// Cross-validated three ways at 2,150.30 m² for this model's exterior walls:
// this method, an adversarial agent's independent sweep (2,150.3), and a
// separate session's mesh implementation (2,102.57, differing only because it
// matched 72 IfcWallStandardCase and missed 8 IfcWall of the same wall type).

/** Faces whose normal is within ~26° of the thin axis count as the two faces. */
const FACE_ALIGNMENT = 0.9;

/**
 * The part of a triangle lying within a height band, as a polygon area.
 *
 * Binning whole triangles by their centroid is the obvious shortcut and it is
 * wrong by a measurable amount: on this model's exterior walls it moved 73 m²
 * across the roof line, 3.4% of the total, because a single tessellated
 * triangle can span several metres of a wall's height. Since the split is what
 * separates envelope enclosing conditioned space from parapet and penthouse
 * above it, that error lands directly on the number the physics consumes.
 *
 * Sutherland–Hodgman against two half-spaces, then the shoelace-equivalent
 * cross-product sum. Exact for the planar polygon a clipped triangle becomes.
 */
function clippedArea(tri, fromY, toY) {
  let poly = tri;
  for (const [keepAbove, limit] of [[true, fromY], [false, toY]]) {
    if (limit === null || !Number.isFinite(limit)) continue;
    const out = [];
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const aIn = keepAbove ? a[1] >= limit : a[1] <= limit;
      const bIn = keepAbove ? b[1] >= limit : b[1] <= limit;
      if (aIn) out.push(a);
      if (aIn !== bIn) {
        const t = (limit - a[1]) / (b[1] - a[1]);
        out.push([a[0] + (b[0] - a[0]) * t, limit, a[2] + (b[2] - a[2]) * t]);
      }
    }
    poly = out;
    if (poly.length < 3) return 0;
  }
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    nx += a[1] * b[2] - a[2] * b[1];
    ny += a[2] * b[0] - a[0] * b[2];
    nz += a[0] * b[1] - a[1] * b[0];
  }
  return Math.hypot(nx, ny, nz) / 2;
}

function triangleNormalAndArea(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
  const nx = uy * wz - uz * wy;
  const ny = uz * wx - ux * wz;
  const nz = ux * wy - uy * wx;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return null;
  return { n: [nx / len, ny / len, nz / len], area: len / 2 };
}

/** World-space triangles of one element, placement applied. */
export function elementTriangles(api, modelID, mesh) {
  const triangles = [];
  const placed = mesh.geometries;
  for (let i = 0; i < placed.size(); i += 1) {
    const part = placed.get(i);
    const geometry = api.GetGeometry(modelID, part.geometryExpressID);
    const verts = api.GetVertexArray(
      geometry.GetVertexData(),
      geometry.GetVertexDataSize(),
    );
    const idx = api.GetIndexArray(
      geometry.GetIndexData(),
      geometry.GetIndexDataSize(),
    );
    const m = part.flatTransformation;
    const points = [];
    for (let v = 0; v < verts.length; v += 6) {
      const x = verts[v], y = verts[v + 1], z = verts[v + 2];
      points.push([
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      ]);
    }
    for (let t = 0; t < idx.length; t += 3) {
      triangles.push([points[idx[t]], points[idx[t + 1]], points[idx[t + 2]]]);
    }
  }
  return triangles;
}

/**
 * Net area of ONE face of a plate-like element (a wall, a slab, a roof).
 *
 * The thin axis is taken from the element's OWN world bounding box rather than
 * assumed to be a global axis. That matters: a wall running at 30° to the grid
 * has no thin world axis in the naive sense, and filtering on a global "up"
 * silently discards most of its surface. A neighbouring session hit exactly
 * that and measured 91% low on a validation wall before finding it.
 *
 * Halving the aligned area gives one face, because a closed solid presents both
 * of them. Openings are already absent from the mesh, so this is net.
 *
 * `heightSplitM` splits the result by world height, separating wall that
 * encloses conditioned space (below the main roof) from parapet and penthouse
 * above it — envelope for a different volume, which must not be pooled with it.
 * The split clips triangles against the plane rather than binning them by
 * centroid; on this model that distinction is worth 73 m², 3.4% of the total.
 *
 * Validated against an independently derived split: total 2150.30, below-roof
 * 1909.56, above-roof 240.73, all three to the centimetre.
 */
export function netFaceArea(triangles, options = {}) {
  const { heightSplitM = null } = options;
  if (triangles.length === 0) return null;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const tri of triangles) {
    for (const p of tri) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
      if (p[2] < minZ) minZ = p[2];
      if (p[2] > maxZ) maxZ = p[2];
    }
  }
  const spans = [maxX - minX, maxY - minY, maxZ - minZ];
  // Y is height in web-ifc's world frame; a WALL's thin axis is X or Z, so
  // this deliberately never picks Y.
  //
  // That makes the function wall-only, and silently wrong on anything
  // horizontal: a slab's thin axis IS Y, so its top and bottom faces can never
  // be selected and it returns a clean, plausible 0.00. bim-bf hit exactly
  // that on 48 elements of another model. `thinAxisForced` says when the
  // restriction actually bound, so a caller measuring the wrong thing finds
  // out instead of receiving a zero.
  const thin = spans[0] <= spans[2] ? 0 : 2;
  const thinAxisForced = spans[1] < spans[0] && spans[1] < spans[2];

  let aligned = 0;
  let alignedBelow = 0;
  let alignedAbove = 0;
  let total = 0;
  // The two faces of the element, kept apart rather than summed.
  //
  // A wall has a front and a back with opposite normals, and summing them
  // cancels to zero — so an orientation taken from the sum would be noise.
  // Splitting by the sign of the thin-axis normal gives the two candidate
  // outward directions, and only the caller, which knows where the rest of
  // the building is, can say which of the two faces the weather is on.
  let areaPos = 0;
  let areaNeg = 0;
  const centroidPos = [0, 0, 0];
  const centroidNeg = [0, 0, 0];
  const split = heightSplitM;
  const floorY = options.heightFloorM ?? null;
  for (const tri of triangles) {
    const t = triangleNormalAndArea(tri[0], tri[1], tri[2]);
    if (!t) continue;
    total += t.area;
    if (Math.abs(t.n[thin]) <= FACE_ALIGNMENT) continue;
    aligned += t.area;
    const mid = [
      (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
      (tri[0][1] + tri[1][1] + tri[2][1]) / 3,
      (tri[0][2] + tri[1][2] + tri[2][2]) / 3,
    ];
    if (t.n[thin] > 0) {
      areaPos += t.area;
      for (let a = 0; a < 3; a += 1) centroidPos[a] += mid[a] * t.area;
    } else {
      areaNeg += t.area;
      for (let a = 0; a < 3; a += 1) centroidNeg[a] += mid[a] * t.area;
    }
    if (split !== null) {
      alignedBelow += clippedArea(tri, floorY, split);
      alignedAbove += clippedArea(tri, split, null);
    }
  }

  const netFaceAreaSqm = aligned / 2;

  /**
   * The area this element's own bounding box can physically hold.
   *
   * Halving the aligned area assumes the element is ONE solid, so its front
   * and back faces are the same face counted twice. A multi-skin element —
   * several solids stacked through the thickness, which authoring tools emit
   * as several `mesh.geometries` parts — gives 2N faces, and halving once
   * leaves N times the real area.
   *
   * A net area cannot exceed its own gross face; openings only ever remove
   * area. So `exceedsBounds` catches that class without needing to know how
   * the element was modelled, and without a tolerance argument to tune.
   * bim-bf found 26 such elements on a Dutch werktekening, one measuring
   * 5.91 m² against a 2.06 m² face.
   *
   * The Clinic has none — 0 of 80 exterior walls exceed their bounds, and its
   * 33 two-part walls average a LOWER fill ratio (0.821) than its 47 one-part
   * walls (0.966), which is what co-planar pieces look like rather than
   * stacked skins. That is why 2,150.3 m² stands. The flag exists so the next
   * model is checked rather than assumed.
   */
  const grossFaceSqm = spans[1] * spans[thin === 0 ? 2 : 0];

  return {
    netFaceAreaSqm,
    netFaceAreaBelowSplitSqm: split === null ? null : alignedBelow / 2,
    netFaceAreaAboveSplitSqm: split === null ? null : alignedAbove / 2,
    totalSurfaceAreaSqm: total,
    thinAxis: thin === 0 ? "x" : "z",
    thicknessM: spans[thin],
    heightM: spans[1],
    grossFaceSqm,
    /** Net area as a share of the gross face. Above 1 is impossible. */
    fillRatio: grossFaceSqm > 0 ? netFaceAreaSqm / grossFaceSqm : null,
    /**
     * The element's two faces, for the caller to orient.
     *
     * `axisIndex` is 0 for X and 2 for Z — Y is never the thin axis here.
     * `centroid` is area-weighted, so a caller can decide which face looks
     * outward by comparing it with the building's own centre.
     */
    faces: {
      axisIndex: thin,
      positive: {
        areaSqm: areaPos,
        centroid: areaPos > 0 ? centroidPos.map((v) => v / areaPos) : null,
      },
      negative: {
        areaSqm: areaNeg,
        centroid: areaNeg > 0 ? centroidNeg.map((v) => v / areaNeg) : null,
      },
    },
    exceedsBounds: grossFaceSqm > 0 && netFaceAreaSqm > grossFaceSqm * 1.001,
    /** True when the element is flatter than it is wide — not a wall. */
    thinAxisForced,
    boundsMin: [minX, minY, minZ],
    boundsMax: [maxX, maxY, maxZ],
  };
}

/**
 * Net face areas for every element matching `accept`, keyed by expressID.
 *
 * `accept(typeName, name, line)` decides membership, so the caller owns the
 * definition of "exterior wall" rather than this module guessing it. For this
 * model the correct predicate matches BOTH `IfcWallStandardCase` and `IfcWall`
 * on the exterior wall type name: there are 80 such walls, and matching only
 * the 72 standard-case ones loses 47.7 m² without any error.
 */
export function netFaceAreasByElement(api, modelID, accept, options = {}) {
  const results = new Map();
  api.StreamAllMeshes(modelID, (mesh) => {
    const line = api.GetLine(modelID, mesh.expressID, false);
    if (!line) return;
    const typeName = api.GetNameFromTypeCode(line.type);
    const name =
      line.Name && typeof line.Name === "object" && "value" in line.Name
        ? line.Name.value
        : (line.Name ?? "");
    if (!accept(typeName, String(name ?? ""), line)) return;
    const measured = netFaceArea(elementTriangles(api, modelID, mesh), options);
    if (measured) {
      results.set(mesh.expressID, { expressID: mesh.expressID, typeName, name: String(name ?? ""), ...measured });
    }
  });
  return results;
}

/** Compass sectors, 45° wide, centred on the named bearing. */
const SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/**
 * Which way each wall faces, and how much area faces that way.
 *
 * This exists because a monthly method needs it and a degree-day one does
 * not. ISO 13790 computes solar gain per orientation per month, so a single
 * envelope total — which is all this pipeline produced until now — cannot
 * feed it. 2,150.3 m² of wall is the same number whether it all faces north
 * or all faces south, and those are very different buildings.
 *
 * Two things here are inferences and are labelled as such rather than
 * presented as read from the file:
 *
 * 1. **Which face is outward.** A wall has two, and the model does not say
 *    which one the weather is on. The outward face is taken to be the one
 *    whose centroid sits further from the building's own centre along the
 *    wall's thin axis. That is right for a convex plan and can be wrong on a
 *    re-entrant corner, so `outwardConfidence` reports how decisive the
 *    comparison was and the caller can see the weak ones.
 * 2. **Where north is.** web-ifc converts IFC's Z-up frame to a Y-up one, so
 *    IFC's plan north (+Y) becomes world −Z. `trueNorthDeg`, when the file
 *    states one, rotates that; when it does not, project north is assumed and
 *    `northAssumed` says so.
 */
export function orientWalls(walls, { trueNorthDeg = null } = {}) {
  const entries = [...walls.entries()];
  if (entries.length === 0) return { byOrientation: {}, walls: [], northAssumed: true };

  // Building centre from every wall's bounds, so one outlier cannot drag it.
  const centre = [0, 0, 0];
  for (const [, w] of entries) {
    for (let a = 0; a < 3; a += 1) {
      centre[a] += (w.boundsMin[a] + w.boundsMax[a]) / 2;
    }
  }
  for (let a = 0; a < 3; a += 1) centre[a] /= entries.length;

  // The building's own plan extent, so "close to the centre line" scales with
  // the building rather than being a fixed number of metres.
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const [, w] of entries) {
    for (let a = 0; a < 3; a += 1) {
      if (w.boundsMin[a] < lo[a]) lo[a] = w.boundsMin[a];
      if (w.boundsMax[a] > hi[a]) hi[a] = w.boundsMax[a];
    }
  }
  const extent = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];

  const rotation = ((trueNorthDeg ?? 0) * Math.PI) / 180;
  const byOrientation = Object.fromEntries(SECTORS.map((s) => [s, 0]));
  const oriented = [];

  for (const [id, wall] of entries) {
    const axis = wall.faces.axisIndex;
    const pos = wall.faces.positive;
    const neg = wall.faces.negative;

    // A wall whose mesh presents only ONE aligned face needs no comparison:
    // that face's own normal is the outward direction. Skipping these dropped
    // 7 of the Clinic's 80 walls and 30.97 m² out of the oriented total while
    // the headline figure stayed 2,150.3 — a silent 1.4% disagreement between
    // two numbers on the same page.
    if (!pos.centroid || !neg.centroid) {
      const sign = pos.centroid ? 1 : -1;
      const nx1 = axis === 0 ? sign : 0;
      const nz1 = axis === 2 ? sign : 0;
      let az = (Math.atan2(nx1, -nz1) - rotation) * (180 / Math.PI);
      az = ((az % 360) + 360) % 360;
      const sec = SECTORS[Math.round(az / 45) % 8];
      byOrientation[sec] += wall.netFaceAreaSqm;
      oriented.push({
        id,
        azimuthDeg: Math.round(az * 10) / 10,
        sector: sec,
        netFaceAreaSqm: wall.netFaceAreaSqm,
        outwardConfidence: "single-faced",
      });
      continue;
    }

    // Which SIDE of the building the wall sits on, not which of its own two
    // faces sits further out.
    //
    // The first version compared the two face centroids against the centre and
    // took the larger. That is always the positive face — they are the two
    // faces of one wall, so pos.centroid[axis] exceeds neg.centroid[axis] by
    // the wall thickness every time, whatever side of the building it is on.
    // Every wall came out facing +X or +Z, and the Clinic reported 969 m²
    // east, 1,150 m² south and zero north and west. A closed building cannot
    // do that, which is the only reason it was caught — no test failed.
    const wallCentre = (pos.centroid[axis] + neg.centroid[axis]) / 2;
    const offset = wallCentre - centre[axis];
    const outwardIsPositive = offset > 0;
    const separation = Math.abs(offset);

    const sign = outwardIsPositive ? 1 : -1;
    const nx = axis === 0 ? sign : 0;
    const nz = axis === 2 ? sign : 0;

    // Clockwise from north, where north is world -Z. Checked at the four
    // cardinals: (0,0,-1)->0, (1,0,0)->90, (0,0,1)->180, (-1,0,0)->270.
    let azimuth =
      (Math.atan2(nx, -nz) - rotation) * (180 / Math.PI);
    azimuth = ((azimuth % 360) + 360) % 360;
    const sector = SECTORS[Math.round(azimuth / 45) % 8];

    byOrientation[sector] += wall.netFaceAreaSqm;
    oriented.push({
      id,
      azimuthDeg: Math.round(azimuth * 10) / 10,
      sector,
      netFaceAreaSqm: wall.netFaceAreaSqm,
      // A wall sitting almost on the building's centre line gives no signal
      // about which way it faces, so the choice there is close to a coin toss.
      // Scaled off the building's own extent rather than a fixed metre value,
      // so it means the same thing on a small building and a large one.
      outwardConfidence: separation > extent[axis] * 0.05 ? "clear" : "weak",
    });
  }

  return {
    byOrientation: Object.fromEntries(
      Object.entries(byOrientation).map(([k, v]) => [k, Math.round(v * 100) / 100]),
    ),
    walls: oriented,
    weakOutward: oriented.filter((w) => w.outwardConfidence === "weak").length,
    northAssumed: trueNorthDeg === null,
    buildingCentre: centre.map((v) => Math.round(v * 1000) / 1000),
  };
}
