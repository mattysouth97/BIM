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
// Each placed part is taken by absolute value on its own, because a
// `flatTransformation` with a negative determinant (a mirrored placement)
// flips the sign of the whole part, and summing a mirrored part against an
// unmirrored one would cancel real volume.

/**
 * @returns Map<expressID, { volumeM3, minX, maxX, minY, maxY, minZ, maxZ, parts }>
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
      record.volumeM3 += Math.abs(six) / 6;
      record.parts += 1;
      geometry.delete();
    }
  });

  return out;
}
