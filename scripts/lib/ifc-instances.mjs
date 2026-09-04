// scripts/lib/ifc-instances.mjs
//
// Service components at their real geometry, by shipping each shape once and
// placing it many times.
//
// The first version of this pipeline reduced every fitting, valve and terminal
// to its bounding box, because keeping their real meshes meant 294 MB — the
// plumbing model alone tessellates to 3,184,148 triangles. That number was
// measured correctly and the conclusion drawn from it was wrong: it counts the
// same geometry over and over. A building's services are catalogue parts, so
// the model places a few hundred distinct shapes thousands of times.
//
// Measured on the Clinic, unique geometry as a share of the merged total:
//
//   Plumbing    3,184,148 -> 340,774 triangles   (10.7%)
//   Electrical    400,199 ->  27,805 triangles   ( 6.9%)
//   HVAC          472,770 -> 188,446 triangles   (39.9%)
//
// One electrical geometry is placed 958 times; one HVAC diffuser 437 times.
// So the boxes were never buying what they appeared to buy, and the components
// can have their real shapes back.
//
// HYBRID, because instancing is not free. An instanced mesh costs one draw
// call and one copy of its geometry; a merged copy costs no extra draw call
// and one copy per placement. Ducts and pipes are unique extrusions with no
// reuse at all — instancing those would trade a single merged draw call for
// 1,548 of them. So a shape placed once is merged, and anything placed twice
// or more is instanced.
//
// That split needs no tuning, which is the point: a shape used once cannot
// benefit from instancing by definition, and every shape used more than once
// benefits immediately. A first attempt merged anything under four placements
// on the theory that it would hold draw calls down; it cost 70,003 extra
// triangles and 5.3 MB across the three layers to save 131 draw calls, which
// is the wrong side of that trade in both directions.

/**
 * Placed fewer times than this and a shape is merged instead of instanced.
 *
 * Two, and it should stay two — see the note above.
 */
export const INSTANCE_MIN_USES = 2;

/**
 * Split a 4x4 column-major transform into translation, rotation and scale.
 *
 * `EXT_mesh_gpu_instancing` takes TRS, not matrices, so every placement has to
 * survive this. Mirrored placements are ordinary in an authoring tool's export
 * and give a negative determinant, which is representable only by folding the
 * flip into one scale axis — the same thing three's `Matrix4.decompose` does.
 * Without it a mirrored component silently turns inside out.
 */
export function decompose(m) {
  let sx = Math.hypot(m[0], m[1], m[2]);
  const sy = Math.hypot(m[4], m[5], m[6]);
  const sz = Math.hypot(m[8], m[9], m[10]);

  // 3x3 determinant of the rotation/scale part.
  const det =
    m[0] * (m[5] * m[10] - m[6] * m[9]) -
    m[4] * (m[1] * m[10] - m[2] * m[9]) +
    m[8] * (m[1] * m[6] - m[2] * m[5]);
  if (det < 0) sx = -sx;

  const translation = [m[12], m[13], m[14]];
  const scale = [sx, sy, sz];

  // Strip scale, then read the quaternion off the pure rotation.
  const ix = sx === 0 ? 0 : 1 / sx;
  const iy = sy === 0 ? 0 : 1 / sy;
  const iz = sz === 0 ? 0 : 1 / sz;
  const r00 = m[0] * ix, r01 = m[4] * iy, r02 = m[8] * iz;
  const r10 = m[1] * ix, r11 = m[5] * iy, r12 = m[9] * iz;
  const r20 = m[2] * ix, r21 = m[6] * iy, r22 = m[10] * iz;

  const trace = r00 + r11 + r22;
  let x, y, z, w;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    w = 0.25 / s;
    x = (r21 - r12) * s;
    y = (r02 - r20) * s;
    z = (r10 - r01) * s;
  } else if (r00 > r11 && r00 > r22) {
    const s = 2.0 * Math.sqrt(1.0 + r00 - r11 - r22);
    w = (r21 - r12) / s;
    x = 0.25 * s;
    y = (r01 + r10) / s;
    z = (r02 + r20) / s;
  } else if (r11 > r22) {
    const s = 2.0 * Math.sqrt(1.0 + r11 - r00 - r22);
    w = (r02 - r20) / s;
    x = (r01 + r10) / s;
    y = 0.25 * s;
    z = (r12 + r21) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + r22 - r00 - r11);
    w = (r10 - r01) / s;
    x = (r02 + r20) / s;
    y = (r12 + r21) / s;
    z = 0.25 * s;
  }
  return { translation, rotation: [x, y, z, w], scale };
}

/**
 * Collect one discipline's services as merged buckets plus instanced shapes.
 *
 * Returns `{ groups, instanced, stats }` — `groups` in the same shape
 * `writeGlb` already merges, `instanced` a list of one-geometry-many-places
 * entries.
 */
export function collectServiceInstances(
  api,
  webIfc,
  modelID,
  { serviceGroups, minUses = INSTANCE_MIN_USES },
) {
  // One pass, and it has to be one pass: `StreamAllMeshes` frees a geometry
  // once its callback returns, so `GetGeometry` afterwards hands back an empty
  // buffer rather than an error. A two-pass version — collect ids, then read
  // each distinct geometry once — looked cleaner, ran without a single
  // warning, and produced three 0-byte GLBs. So the shapes are copied out of
  // WASM memory here, the first time each one is seen.
  const placements = new Map(); // group:geometryExpressID -> { geometry, matrices[] }
  const skipped = new Map();
  let elements = 0;

  api.StreamAllMeshes(modelID, (mesh) => {
    const line = api.GetLine(modelID, mesh.expressID, false);
    const typeName = line ? api.GetNameFromTypeCode(line.type) : null;
    let group = null;
    for (const [name, types] of Object.entries(serviceGroups)) {
      if (typeName && types.includes(typeName)) group = name;
    }
    if (!group) {
      if (typeName) skipped.set(typeName, (skipped.get(typeName) ?? 0) + 1);
      return;
    }
    elements += 1;
    const placed = mesh.geometries;
    for (let i = 0; i < placed.size(); i += 1) {
      const part = placed.get(i);
      const key = `${group}:${part.geometryExpressID}`;
      let record = placements.get(key);
      if (!record) {
        const geometry = api.GetGeometry(modelID, part.geometryExpressID);
        const verts = api.GetVertexArray(
          geometry.GetVertexData(),
          geometry.GetVertexDataSize(),
        );
        const idx = api.GetIndexArray(
          geometry.GetIndexData(),
          geometry.GetIndexDataSize(),
        );
        record = {
          group,
          // Copies, not views: both arrays are windows into WASM memory that
          // is reused by the next mesh.
          verts: Float32Array.from(verts),
          idx: Uint32Array.from(idx),
          matrices: [],
        };
        placements.set(key, record);
      }
      // Likewise a live view, so copy rather than reference.
      record.matrices.push(Array.from(part.flatTransformation));
    }
  });

  // Pass 2: read each distinct geometry exactly once.
  const groups = new Map();
  const instanced = [];
  let instancedTriangles = 0;
  let mergedTriangles = 0;

  for (const record of placements.values()) {
    const { verts, idx } = record;
    const vertexCount = verts.length / 6;
    if (vertexCount === 0 || idx.length === 0) continue;

    if (record.matrices.length >= minUses) {
      // One copy, in its own frame, placed by TRS attributes.
      const positions = new Float32Array(vertexCount * 3);
      const normals = new Float32Array(vertexCount * 3);
      for (let v = 0, o = 0; v < verts.length; v += 6, o += 3) {
        positions[o] = verts[v];
        positions[o + 1] = verts[v + 1];
        positions[o + 2] = verts[v + 2];
        normals[o] = verts[v + 3];
        normals[o + 1] = verts[v + 4];
        normals[o + 2] = verts[v + 5];
      }
      instanced.push({
        group: record.group,
        positions,
        normals,
        indices: Array.from(idx),
        vertexCount,
        transforms: record.matrices.map(decompose),
      });
      instancedTriangles += idx.length / 3;
      continue;
    }

    // Merged, exactly as before: transform every vertex to world and append.
    let bucket = groups.get(record.group);
    if (!bucket) {
      bucket = { positions: [], normals: [], indices: [], vertexCount: 0 };
      groups.set(record.group, bucket);
    }
    for (const m of record.matrices) {
      const base = bucket.vertexCount;
      for (let v = 0; v < verts.length; v += 6) {
        const x = verts[v], y = verts[v + 1], z = verts[v + 2];
        bucket.positions.push(
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14],
        );
        const nx = verts[v + 3], ny = verts[v + 4], nz = verts[v + 5];
        const rx = m[0] * nx + m[4] * ny + m[8] * nz;
        const ry = m[1] * nx + m[5] * ny + m[9] * nz;
        const rz = m[2] * nx + m[6] * ny + m[10] * nz;
        const len = Math.hypot(rx, ry, rz) || 1;
        bucket.normals.push(rx / len, ry / len, rz / len);
        bucket.vertexCount += 1;
      }
      for (let t = 0; t < idx.length; t += 3) {
        bucket.indices.push(base + idx[t], base + idx[t + 1], base + idx[t + 2]);
      }
      mergedTriangles += idx.length / 3;
    }
  }

  return {
    groups,
    instanced,
    skipped,
    stats: {
      elements,
      distinctGeometries: placements.size,
      instancedGeometries: instanced.length,
      instancedPlacements: instanced.reduce((s, e) => s + e.transforms.length, 0),
      instancedTriangles,
      mergedTriangles,
    },
  };
}
