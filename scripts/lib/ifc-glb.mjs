// scripts/lib/ifc-glb.mjs
//
// Tessellate an IFC model and write a glTF-binary (.glb) of the building
// FABRIC, for the viewer to display when someone opens a reference building.
//
// Why a GLB and not the IFC: the app already loads 173 GLBs through an existing
// pipeline, whereas shipping IFC would mean putting a WASM parser and tens of
// megabytes of source model in the browser. Tessellation is deterministic and
// belongs at build time, exactly like the extraction beside it.
//
// Why fabric only: 58% of this model's 174,381 triangles are not the building —
// IfcFlowTerminal (sanitary fixtures) is 59,488 on its own, IfcRailing 22,303,
// IfcFurnishingElement 19,808. Furniture and toilet pans are irrelevant to an
// energy tool, and carrying them triples the payload behind a card click. The
// filter is an explicit allowlist rather than a denylist so that an unfamiliar
// element type is left OUT and noticed, rather than silently inflating the file.

import { writeFile } from "node:fs/promises";

/**
 * Element types that make up the building fabric.
 *
 * Grouped because glTF wants few, large meshes: one primitive per group keeps
 * draw calls low and lets the viewer colour by role without a material per
 * element.
 */
export const FABRIC_GROUPS = Object.freeze({
  wall: ["IfcWall", "IfcWallStandardCase"],
  slab: ["IfcSlab", "IfcRoof"],
  glazing: ["IfcWindow", "IfcPlate", "IfcCurtainWall"],
  /** Curtain-wall mullions — part of the facade, so kept by default. */
  mullion: ["IfcMember"],
  door: ["IfcDoor"],
  stair: ["IfcStair", "IfcStairFlight", "IfcRamp", "IfcRampFlight"],
});

/**
 * Structure, off by default — and the reason is size, measured not guessed.
 *
 * `IfcBeam` alone tessellates to 350,412 triangles here: 738 steel sections
 * modelled in full 3D, 77% of everything both files contain. Every one is
 * buried inside a floor build-up, and footings are underground. Including them
 * takes the payload from a few MB to 24.7 MB for geometry nobody can see from
 * outside the building.
 *
 * Kept as an option rather than deleted because a structural view is a
 * legitimate thing to want later, and the filter should record that choice
 * rather than pretend the data was not there.
 */
export const STRUCTURE_GROUPS = Object.freeze({
  column: ["IfcColumn"],
  beam: ["IfcBeam"],
  footing: ["IfcFooting"],
});

/** Base colours per group — muted, so the geometry reads before the palette. */
const GROUP_COLOUR = Object.freeze({
  wall: [0.82, 0.80, 0.76, 1],
  slab: [0.72, 0.70, 0.67, 1],
  glazing: [0.55, 0.72, 0.82, 0.45],
  mullion: [0.45, 0.46, 0.48, 1],
  door: [0.62, 0.52, 0.42, 1],
  stair: [0.66, 0.65, 0.63, 1],
  column: [0.50, 0.50, 0.52, 1],
  beam: [0.50, 0.50, 0.52, 1],
  footing: [0.58, 0.57, 0.55, 1],
});

function groupFor(typeName, includeStructure) {
  for (const [group, types] of Object.entries(FABRIC_GROUPS)) {
    if (types.includes(typeName)) return group;
  }
  if (includeStructure) {
    for (const [group, types] of Object.entries(STRUCTURE_GROUPS)) {
      if (types.includes(typeName)) return group;
    }
  }
  return null;
}

/**
 * Collect transformed fabric geometry, grouped.
 *
 * web-ifc hands back positions and normals interleaved as
 * [px,py,pz,nx,ny,nz], in the element's own frame, with a 4x4 column-major
 * `flatTransformation` to world.
 *
 * That world frame is ALREADY Y-up, which is the opposite of what the IFC
 * schema would lead you to expect, and applying the textbook Z-up -> Y-up swap
 * on top of it lays the building on its side. Verified by measurement rather
 * than assumption: world Y spans -1.2..13.5 m here, matching the storey range
 * exactly (footing -1.0, roof 9.25, penthouse 12.65), while X and Z span 52.7
 * and 66.1 m in plan. The swapped version reported a 77 m "height" for a
 * two-storey clinic — which is the useful kind of wrong, because it is
 * obviously wrong. A 20% error in the same place would have shipped.
 */
export function collectFabric(api, webIfc, modelID, { includeStructure = false } = {}) {
  const groups = new Map();
  const skipped = new Map();

  api.StreamAllMeshes(modelID, (mesh) => {
    const line = api.GetLine(modelID, mesh.expressID, false);
    const typeName = line ? api.GetNameFromTypeCode(line.type) : null;
    const group = typeName ? groupFor(typeName, includeStructure) : null;
    if (!group) {
      if (typeName) skipped.set(typeName, (skipped.get(typeName) ?? 0) + 1);
      return;
    }
    let bucket = groups.get(group);
    if (!bucket) {
      bucket = { positions: [], normals: [], indices: [], vertexCount: 0 };
      groups.set(group, bucket);
    }

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
      const m = part.flatTransformation; // column-major 4x4
      const base = bucket.vertexCount;

      for (let v = 0; v < verts.length; v += 6) {
        const x = verts[v], y = verts[v + 1], z = verts[v + 2];
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
        const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        // No axis swap. web-ifc's flatTransformation already returns a Y-up
        // frame: measured on this model, world Y spans -1.2..13.5 m, which is
        // exactly the storey range (footing -1.0, roof 9.25, penthouse 12.65),
        // while X and Z span 52.7 and 66.1 m in plan. Applying the textbook
        // IFC Z-up -> glTF Y-up swap on top of that laid the building on its
        // side and reported a 77 m "height" for a two-storey clinic.
        bucket.positions.push(wx, wy, wz);

        const nx = verts[v + 3], ny = verts[v + 4], nz = verts[v + 5];
        // Rotation part only; IFC placements are rigid so no inverse-transpose.
        const rx = m[0] * nx + m[4] * ny + m[8] * nz;
        const ry = m[1] * nx + m[5] * ny + m[9] * nz;
        const rz = m[2] * nx + m[6] * ny + m[10] * nz;
        const len = Math.hypot(rx, ry, rz) || 1;
        bucket.normals.push(rx / len, ry / len, rz / len);
        bucket.vertexCount += 1;
      }
      // Winding is preserved: with no axis swap there is no mirror to undo.
      for (let t = 0; t < idx.length; t += 3) {
        bucket.indices.push(base + idx[t], base + idx[t + 1], base + idx[t + 2]);
      }
    }
  });

  return { groups, skipped };
}

/**
 * Merge one model's fabric groups into an accumulator, re-basing indices.
 *
 * A building's fabric spans discipline models — the Clinic's roofs, floor slabs
 * and frame live in the structural file while its walls and glazing live in the
 * architectural one — so the viewer needs them combined.
 *
 * Appends with a loop rather than `push(...arr)`: these arrays run to hundreds
 * of thousands of entries and spreading them blows the call stack. That failure
 * is loud, but the same shape appears in `concat` chains where it is merely
 * quadratic and silent.
 */
export function mergeFabric(target, source) {
  for (const [group, bucket] of source) {
    let existing = target.get(group);
    if (!existing) {
      target.set(group, bucket);
      continue;
    }
    const base = existing.vertexCount;
    for (const value of bucket.positions) existing.positions.push(value);
    for (const value of bucket.normals) existing.normals.push(value);
    for (const index of bucket.indices) existing.indices.push(index + base);
    existing.vertexCount += bucket.vertexCount;
  }
  return target;
}

const pad4 = (n) => (n + 3) & ~3;

/**
 * Write a minimal, valid glTF 2.0 binary.
 *
 * Hand-written rather than via three's GLTFExporter because that expects a DOM
 * and a live scene graph; this needs neither, and a deterministic byte-for-byte
 * output matters for a committed artifact whose hash is asserted.
 */
export async function writeGlb(outPath, groups, { generator }) {
  const bin = [];
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const materials = [];
  const nodes = [];

  const pushView = (typedArray, target) => {
    const bytes = Buffer.from(
      typedArray.buffer,
      typedArray.byteOffset,
      typedArray.byteLength,
    );
    const padded = pad4(bytes.length);
    const view = { buffer: 0, byteOffset: offset, byteLength: bytes.length };
    if (target) view.target = target;
    bufferViews.push(view);
    bin.push(bytes);
    if (padded > bytes.length) bin.push(Buffer.alloc(padded - bytes.length));
    offset += padded;
    return bufferViews.length - 1;
  };

  for (const [group, bucket] of groups) {
    if (bucket.indices.length === 0) continue;
    const positions = new Float32Array(bucket.positions);
    const normals = new Float32Array(bucket.normals);
    const use32 = bucket.vertexCount > 65535;
    const indices = use32
      ? new Uint32Array(bucket.indices)
      : new Uint16Array(bucket.indices);

    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let a = 0; a < 3; a += 1) {
        if (positions[i + a] < min[a]) min[a] = positions[i + a];
        if (positions[i + a] > max[a]) max[a] = positions[i + a];
      }
    }

    const posView = pushView(positions, 34962);
    const nrmView = pushView(normals, 34962);
    const idxView = pushView(indices, 34963);

    const posAcc = accessors.push({
      bufferView: posView, componentType: 5126, count: bucket.vertexCount,
      type: "VEC3", min, max,
    }) - 1;
    const nrmAcc = accessors.push({
      bufferView: nrmView, componentType: 5126, count: bucket.vertexCount,
      type: "VEC3",
    }) - 1;
    const idxAcc = accessors.push({
      bufferView: idxView, componentType: use32 ? 5125 : 5123,
      count: indices.length, type: "SCALAR",
    }) - 1;

    const colour = GROUP_COLOUR[group] ?? [0.8, 0.8, 0.8, 1];
    const materialIndex = materials.push({
      name: group,
      pbrMetallicRoughness: {
        baseColorFactor: colour,
        metallicFactor: 0,
        roughnessFactor: group === "glazing" ? 0.15 : 0.85,
      },
      ...(colour[3] < 1 ? { alphaMode: "BLEND", doubleSided: true } : {}),
    }) - 1;

    const meshIndex = meshes.push({
      name: group,
      primitives: [{
        attributes: { POSITION: posAcc, NORMAL: nrmAcc },
        indices: idxAcc, material: materialIndex,
      }],
    }) - 1;
    nodes.push({ name: group, mesh: meshIndex });
  }

  const json = {
    asset: { version: "2.0", generator },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };

  const jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = Buffer.alloc(pad4(jsonBuf.length) - jsonBuf.length, 0x20);
  const binBuf = Buffer.concat(bin);

  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(
    12 + 8 + jsonBuf.length + jsonPad.length + 8 + binBuf.length,
    8,
  );
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuf.length + jsonPad.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binBuf.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  const glb = Buffer.concat([
    header, jsonHeader, jsonBuf, jsonPad, binHeader, binBuf,
  ]);
  await writeFile(outPath, glb);

  return {
    byteLength: glb.length,
    groups: nodes.map((n) => n.name),
    triangleCount: accessors
      .filter((a) => a.type === "SCALAR")
      .reduce((sum, a) => sum + a.count / 3, 0),
    vertexCount: meshes.length
      ? accessors.filter((a) => a.type === "VEC3" && a.min).reduce((s, a) => s + a.count, 0)
      : 0,
  };
}
