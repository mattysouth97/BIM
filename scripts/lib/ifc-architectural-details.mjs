import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256, str } from "./ifc-reader.mjs";
import { collectServiceInstances } from "./ifc-instances.mjs";
import { mergeFabric, writeGlb } from "./ifc-glb.mjs";

// These are source entity classes omitted from collectFabric. Keep policies
// explicit per source: Schependomlaan already renders supplier steel/railings
// separately, so its architectural copies are deliberately not added again.
export const ARCHITECTURAL_DETAIL_SOURCES = Object.freeze({
  "bs-medical-dental-clinic": {
    architectural: ["IfcFurnishingElement", "IfcCovering", "IfcRailing"],
    structural: ["IfcBeam", "IfcColumn", "IfcFooting", "IfcRailing"],
  },
  schependomlaan: { architectural: ["IfcCovering"] },
  "duplex-apartment": {
    architectural: ["IfcFurnishingElement", "IfcCovering", "IfcRailing", "IfcBeam", "IfcFooting"],
  },
  "fzk-haus": { architectural: ["IfcBeam", "IfcRailing"] },
  "kit-office": { architectural: ["IfcFurnishingElement", "IfcRailing", "IfcColumn"] },
});

const GROUP = {
  IfcFurnishingElement: "furnishing",
  IfcCovering: "covering",
  IfcRailing: "railing",
  IfcBeam: "beam",
  IfcColumn: "column",
  IfcFooting: "footing",
};

function colourForPart(part) {
  const c = [part.color?.x, part.color?.y, part.color?.z, part.color?.w];
  // web-ifc may supply its own default colour when the author states none.
  // Preserve the tessellator's RGBA without pretending it is a material test.
  return c.every((x) => Number.isFinite(x) && x >= 0 && x <= 1)
    ? c
    : [0.8, 0.8, 0.8, 1];
}

/** Reuse identical position+normal vertices at the GLB's Float32 precision.
 * No triangle is removed and no tolerance merges neighbouring positions.
 */
export function weldDetailVertices(geometry) {
  const positions = [];
  const normals = [];
  const remap = [];
  const seen = new Map();
  for (let i = 0; i < geometry.positions.length; i += 3) {
    const values = [
      ...geometry.positions.slice(i, i + 3),
      ...geometry.normals.slice(i, i + 3),
    ].map(Math.fround);
    const key = values.join(",");
    let index = seen.get(key);
    if (index === undefined) {
      index = positions.length / 3;
      seen.set(key, index);
      positions.push(...values.slice(0, 3));
      normals.push(...values.slice(3));
    }
    remap.push(index);
  }
  return {
    ...geometry,
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: geometry.indices.map((index) => remap[index]),
    vertexCount: positions.length / 3,
  };
}

export async function buildSourceElementLayer({
  buildingId, api, webIfc, byRole, sources, outDir, generator,
  selection = ARCHITECTURAL_DETAIL_SOURCES[buildingId],
  groupByType = GROUP,
  layer = {
    id: "details", ko: "건축 상세", en: "Architectural details",
    stem: "architectural-details", kind: "bimfit_reference_architectural_details",
    note: "Selected source IFC entity classes omitted from the core fabric layer. Original tessellated geometry and placements; repeated shapes use GPU instancing. Not a claim of complete architectural or fabrication detail. Existing services remain separate.",
  },
}) {
  const policy = selection;
  if (!policy) throw new Error(`No architectural detail policy for ${buildingId}`);
  const groups = new Map();
  const instanced = [];
  const colours = {};
  const sourceRows = [];
  const entities = [];
  let distinctGeometries = 0;

  for (const [role, types] of Object.entries(policy)) {
    const file = byRole.get(role);
    const source = sources.find((entry) => entry.role === role);
    if (!file || !source) throw new Error(`${buildingId}: missing details source ${role}`);
    const rows = [];
    const counts = types.map((type) => ({
      type,
      candidates: file.byType(webIfc[type.toUpperCase()]).length,
      rendered: 0,
    }));
    const part = collectServiceInstances(api, webIfc, file.modelId, {
      serviceGroups: Object.fromEntries(types.map((type) => [groupByType[type], [type]])),
      bakeMirrors: true,
      deduplicateGeometry: true,
      // Tiny subparts (often one flange per beam) cost more in glTF metadata
      // and draw calls than they save. Merge them by source colour; instance
      // shapes only when doing so saves at least 512 source vertices.
      minimumSavedVertices: 512,
      validateTrs: true,
      partGroup(group, placed) {
        const colour = colourForPart(placed);
        // Do not quantise the source RGBA. Exact equal values share materials;
        // different styles remain different even on one repeated shape.
        const key = `${group}:${colour.join(",")}`;
        colours[key] = colour;
        return key;
      },
      onElement({ line, typeName, group, emittedParts, placedTriangles }) {
        if (emittedParts === 0) return;
        counts.find((row) => row.type === typeName).rendered += 1;
        rows.push({
          expressId: line.expressID,
          globalId: str(line.GlobalId),
          ifcType: typeName,
          group,
          name: str(line.Name),
          ref: file.ref(line),
          geometryParts: emittedParts,
          placedTriangles,
        });
      },
    });
    mergeFabric(groups, part.groups);
    instanced.push(...part.instanced);
    distinctGeometries += part.stats.distinctGeometries;
    rows.sort((a, b) => a.expressId - b.expressId);
    entities.push(...rows.map((row) => ({ sourceRole: role, ...row })));
    sourceRows.push({
      role,
      fileName: source.fileName,
      sha256: source.sha256,
      types: counts.map((row) => ({ ...row, withoutRenderedMesh: row.candidates - row.rendered })),
    });
  }
  if (entities.length === 0) throw new Error(`${buildingId}: no architectural detail geometry`);

  for (const [name, geometry] of groups) groups.set(name, weldDetailVertices(geometry));
  for (let i = 0; i < instanced.length; i += 1) instanced[i] = weldDetailVertices(instanced[i]);

  const fileName = `${layer.stem}.glb`;
  const result = await writeGlb(path.join(outDir, fileName), groups, {
    generator, colours, instanced,
  });
  // Both budgets fail loudly; no decimation, dropped entities or boxes hide
  // an expensive extraction. Increase only after checking the actual viewer.
  if (result.byteLength > 20 * 1024 * 1024 || result.drawCalls > 200) {
    throw new Error(`${buildingId}: details exceed 20 MiB / 200 draw-call budget: ${JSON.stringify(result)}`);
  }
  const indexFile = `${layer.stem}-index.json`;
  const index = {
    kind: layer.kind,
    schemaVersion: 1,
    buildingId,
    coordinateSystem: "metres, Y-up; original web-ifc model placements",
    sources: sourceRows,
    entities,
  };
  const indexBytes = Buffer.from(`${JSON.stringify(index, null, 2)}\n`);
  await writeFile(path.join(outDir, indexFile), indexBytes);
  const detailBytes = await readFile(path.join(outDir, fileName));
  return {
    id: layer.id,
    ko: layer.ko,
    en: layer.en,
    file: fileName,
    byteLength: result.byteLength,
    sha256: sha256(detailBytes),
    triangleCount: result.triangleCount,
    placedTriangleCount: entities.reduce((sum, row) => sum + row.placedTriangles, 0),
    triangleCountBasis: "triangleCount stores each instanced shape once; placedTriangleCount includes every placement",
    groups: [...new Set(entities.map((row) => row.group))],
    elements: entities.length,
    distinctGeometries,
    instancedShapes: result.instancedShapes,
    instancedPlacements: result.instancedPlacements,
    drawCalls: result.drawCalls,
    materials: new Set([...groups.keys(), ...instanced.map((shape) => shape.group)]).size,
    sourceFiles: sourceRows,
    indexFile,
    indexSha256: sha256(indexBytes),
    appearance: "web-ifc tessellator RGBA, including possible default styles; no inferred finish textures. Metalness 0 and roughness 0.85 are renderer assumptions, not measured material properties.",
    note: layer.note,
    ...(layer.id === "details" && buildingId === "schependomlaan" ? {
      selectionNote: "Architectural IfcCovering only; supplier steel, precast and railing layers already carry their own source models. Architectural beam, column and railing copies are excluded to avoid overlapping those layers.",
    } : {}),
  };
}

export const buildArchitecturalDetails = (options) => buildSourceElementLayer(options);
