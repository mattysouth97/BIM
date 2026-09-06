import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { openIfcFiles, sha256, str } from "./lib/ifc-reader.mjs";
import { FABRIC_GROUPS, mergeFabric, writeGlb } from "./lib/ifc-glb.mjs";
import { collectServiceInstances } from "./lib/ifc-instances.mjs";
import { weldDetailVertices } from "./lib/ifc-architectural-details.mjs";
import { materialAssignments } from "./lib/ifc-material-bindings.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = path.join(os.tmpdir(), "bimfit-reference-buildings");
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))).flat();
}

export async function buildReferenceMaterials(buildingId) {
  const outDir = path.join(repo, "public/reference-buildings", buildingId);
  const manifestPath = path.join(outDir, "manifest.json");
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  const sources = manifest.sourceFiles.filter((source) => ["architectural", "structural"].includes(source.role));
  const cached = await walk(cache);
  const paths = [];
  for (const source of sources) {
    const candidates = cached.filter((entry) => path.basename(entry) === source.fileName);
    let verified = null;
    for (const candidate of candidates) if (sha256(await readFile(candidate)) === source.sha256) { verified = candidate; break; }
    if (!verified) throw new Error(`Verified cached source missing: ${source.fileName}. Run the source builder first.`);
    paths.push(verified);
  }
  const { api, files, webIfc } = await openIfcFiles(paths, { wasmDir: path.join(repo, "node_modules/web-ifc") + path.sep });
  const groups = new Map();
  const instanced = [];
  const colours = {};
  const bindings = new Map();
  const entities = [];
  const assemblyByRef = new Map((manifest.assemblies ?? []).map((entry) => [entry.ref, entry]));
  try {
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex];
      const source = sources[fileIndex];
      const assignmentFor = materialAssignments(file, webIfc);
      const assignmentCache = new Map();
      const resolve = (line) => {
        if (!assignmentCache.has(line.expressID)) assignmentCache.set(line.expressID, assignmentFor(line));
        return assignmentCache.get(line.expressID);
      };
      // Klassiqua's opaque curtain-wall cladding lives in architectural details,
      // not the base fabric's glazing bucket. Match its explicit source policy.
      const fabricGroups = buildingId === "klassiqua-office-1970"
        ? { ...FABRIC_GROUPS, glazing: FABRIC_GROUPS.glazing.filter((type) => type !== "IfcCurtainWall") }
        : FABRIC_GROUPS;
      const part = collectServiceInstances(api, webIfc, file.modelId, {
        serviceGroups: fabricGroups, bakeMirrors: true, deduplicateGeometry: true,
        minimumSavedVertices: 512, validateTrs: true,
        partGroup(group, _placed, line) {
          const assignment = resolve(line);
          // One layer set can be attached directly to some occurrences and
          // inherited from a type by others. Keep those claim scopes distinct.
          const key = `${group}__${source.role}_${(assignment.assemblyRef ?? assignment.materialRef ?? assignment.status).split("#").at(-1)}_${assignment.basis ?? "none"}`;
          if (!bindings.has(key)) {
            const assembly = assemblyByRef.get(assignment.assemblyRef);
            const representativeLayer = assembly?.layers.reduce((thickest, layer) => !thickest || layer.thicknessM > thickest.thicknessM ? layer : thickest, null) ?? null;
            bindings.set(key, { key, group, sourceRole: source.role, ...assignment, assemblyName: assembly?.name ?? null, representativeLayer, elements: 0 });
            colours[key] = group === "glazing" ? [0.55, 0.72, 0.82, 0.45] : [0.8, 0.8, 0.78, 1];
          }
          return key;
        },
        onElement({ line, typeName, emittedParts, placedTriangles }) {
          if (!emittedParts) return;
          const assignment = resolve(line);
          const group = Object.entries(fabricGroups).find(([, types]) => types.includes(typeName))[0];
          const key = `${group}__${source.role}_${(assignment.assemblyRef ?? assignment.materialRef ?? assignment.status).split("#").at(-1)}_${assignment.basis ?? "none"}`;
          bindings.get(key).elements++;
          entities.push({ sourceRole: source.role, expressId: line.expressID, ref: file.ref(line), globalId: str(line.GlobalId), name: str(line.Name), ifcType: typeName, binding: key, relationRef: assignment.relationRef, assignmentBasis: assignment.basis, placedTriangles });
        },
      });
      mergeFabric(groups, part.groups);
      instanced.push(...part.instanced);
    }
  } finally { files.forEach((file) => file.close()); }
  for (const [key, geometry] of groups) groups.set(key, weldDetailVertices(geometry));
  for (let i = 0; i < instanced.length; i++) instanced[i] = weldDetailVertices(instanced[i]);
  const file = "material-fabric.glb";
  const result = await writeGlb(path.join(outDir, file), groups, { generator: "BIMFIT source material associations", colours, instanced });
  if (result.byteLength > 20 * 1024 * 1024 || result.drawCalls > 300) throw new Error(`Material fabric exceeds 20 MiB / 300 draw calls: ${JSON.stringify(result)}`);
  const indexFile = "material-fabric-index.json";
  const rows = [...bindings.values()];
  const index = { kind: "bimfit_source_material_bindings", schemaVersion: 1, buildingId, sources, bindings: rows, entities };
  const bytes = Buffer.from(`${JSON.stringify(index, null, 2)}\n`);
  await writeFile(path.join(outDir, indexFile), bytes);
  const materialFabric = {
    file, byteLength: result.byteLength, sha256: sha256(await readFile(path.join(outDir, file))),
    indexFile, indexSha256: sha256(bytes), elements: entities.length,
    triangleCount: result.triangleCount, placedTriangleCount: entities.reduce((sum, entity) => sum + entity.placedTriangles, 0), drawCalls: result.drawCalls,
    bindings: rows,
    appearanceBasis: "IFC occurrence or type material association. For a layer set, the thickest stated layer is used as an illustrative representative, not as the verified exterior finish. Source layer order does not establish installation direction. Unreviewed material names remain neutral. Glazing retains its base role appearance.",
  };
  const newline = manifestText.includes("\r\n") ? "\r\n" : "\n";
  await writeFile(manifestPath, `${JSON.stringify({ ...manifest, materialFabric }, null, 2)}\n`.replaceAll("\n", newline));
  console.log(JSON.stringify({ buildingId, elements: entities.length, bindings: rows.length, assigned: entities.filter((entry) => bindings.get(entry.binding).status === "layer_set").length, ...result }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const building = process.argv[process.argv.indexOf("--building") + 1];
  if (!building || building === process.argv[0]) throw new Error("Pass --building <published-building-id>");
  await buildReferenceMaterials(building);
}
