// scripts/lib/ifc-space-volume.mjs
//
// Volume and plan extent of every IfcSpace, from its own solid.
//
// The Clinic's only element quantity is `GSA BIM Area`, so no volume is
// stated anywhere in the file, and the conditioned volume — which the
// ventilation term multiplies directly — had been carried as a range
// (Σ floor × floor-to-floor = 19,610 m³ up to slab × roof datum = 24,240 m³)
// with the concourse void somewhere between. The spaces are closed solids in
// the file, so the volume is measurable rather than bracketed: the divergence
// theorem over each tessellated triangle gives the signed volume of a closed
// mesh exactly, and the storey-height guess drops out.
//
// "Closed" is the premise, and web-ifc does not always deliver it. On the
// Duplex, five of 37 room solids came back with a NEGATIVE signed volume
// larger than their own bounding box — a 10 m² hallway at 128 m³ — which no
// consistently wound closed mesh can produce; the concave outlines had been
// triangulated with flipped faces. Every simple box was exact. So each
// space carries a `closed` verdict, from two facts a correct measurement
// cannot violate: the signed volume has the sign the placement's handedness
// predicts, and it does not exceed the bounding box. A space that fails is
// reported with its bounding box and height so the caller can fall back to
// area × height and SAY so, rather than ship 128 m³ for a corridor.

/**
 * @returns Map<expressID, {
 *   volumeM3,        // Σ signed part volumes, sign-corrected for mirrored placements
 *   absVolumeM3,     // Σ |part volume| — equals volumeM3 when every part is wound the same way
 *   bboxVolumeM3,
 *   closed,          // true when volumeM3 > 0, ≤ bbox, and no part was wound against the rest
 *   minX, maxX, minY, maxY, minZ, maxZ, parts
 * }>
 *   Coordinates are web-ifc's Y-up frame, metres — the same frame the fabric
 *   GLB is written in, so `x`/`z` are plan axes and `y` is height.
 */
export function measureSpaceMeshes(api, webIfc, modelId) {
  const out = new Map();

  api.StreamAllMeshesWithTypes(modelId, [webIfc.IFCSPACE], (mesh) => {
    let record = out.get(mesh.expressID);
    if (!record) {
      record = {
        volumeM3: 0,
        absVolumeM3: 0,
        bboxVolumeM3: 0,
        closed: false,
        minX: Infinity, maxX: -Infinity,
        minY: Infinity, maxY: -Infinity,
        minZ: Infinity, maxZ: -Infinity,
        parts: 0,
      };
      out.set(mesh.expressID, record);
    }

    const placed = mesh.geometries;
    for (let i = 0; i < placed.size(); i += 1) {
      const part = placed.get(i);
      const geometry = api.GetGeometry(modelId, part.geometryExpressID);
      const verts = api.GetVertexArray(
        geometry.GetVertexData(),
        geometry.GetVertexDataSize(),
      );
      const idx = api.GetIndexArray(
        geometry.GetIndexData(),
        geometry.GetIndexDataSize(),
      );
      const m = part.flatTransformation; // column-major 4x4

      // World-space positions, stride 3 (the source stride is 6: xyz + normal).
      const n = verts.length / 6;
      const pos = new Float64Array(n * 3);
      for (let v = 0; v < n; v += 1) {
        const x = verts[v * 6], y = verts[v * 6 + 1], z = verts[v * 6 + 2];
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
        const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        pos[v * 3] = wx; pos[v * 3 + 1] = wy; pos[v * 3 + 2] = wz;
        if (wx < record.minX) record.minX = wx;
        if (wx > record.maxX) record.maxX = wx;
        if (wy < record.minY) record.minY = wy;
        if (wy > record.maxY) record.maxY = wy;
        if (wz < record.minZ) record.minZ = wz;
        if (wz > record.maxZ) record.maxZ = wz;
      }

      // Σ over triangles of (a · (b × c)) / 6 — the signed volume of the
      // tetrahedron each face makes with the origin. Closed mesh ⇒ exact.
      let six = 0;
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
        const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
        const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
        const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
        six +=
          ax * (by * cz - bz * cy) -
          ay * (bx * cz - bz * cx) +
          az * (bx * cy - by * cx);
      }
      // A mirrored placement (negative determinant) reverses every face's
      // winding, so its signed volume comes out negative for a correct mesh.
      // Correct for that here; what is left is the mesh's own orientation.
      const det =
        m[0] * (m[5] * m[10] - m[6] * m[9]) -
        m[4] * (m[1] * m[10] - m[2] * m[9]) +
        m[8] * (m[1] * m[6] - m[2] * m[5]);
      const signed = (six / 6) * (det < 0 ? -1 : 1);
      record.volumeM3 += signed;
      record.absVolumeM3 += Math.abs(signed);
      record.parts += 1;
      geometry.delete();
    }

    record.bboxVolumeM3 =
      (record.maxX - record.minX) * (record.maxY - record.minY) * (record.maxZ - record.minZ);
    record.closed =
      record.volumeM3 > 0 &&
      record.volumeM3 <= record.bboxVolumeM3 * 1.001 &&
      Math.abs(record.absVolumeM3 - record.volumeM3) <= record.absVolumeM3 * 1e-6;
  });

  return out;
}
