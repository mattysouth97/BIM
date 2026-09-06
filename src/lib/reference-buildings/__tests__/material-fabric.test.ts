import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Box3, InstancedMesh, Mesh } from "three";
import { GLTFLoader, MeshoptDecoder } from "three-stdlib";
import { describe, expect, it } from "vitest";
import { REFERENCE_BUILDING_IDS, type ReferenceBuildingManifest } from "../manifest";

const BUILDINGS = REFERENCE_BUILDING_IDS;
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

describe("published material fabric source associations", () => {
  for (const id of BUILDINGS) it(`${id}: source quantities, representative layers, payload and geometry reconcile`, async () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), "public/reference-buildings", id, file));
    const manifest = JSON.parse(read("manifest.json").toString()) as ReferenceBuildingManifest;
    const variant = manifest.materialFabric!;
    const glb = read(variant.file), indexBytes = read(variant.indexFile);
    const index = JSON.parse(indexBytes.toString()) as {
      buildingId: string; bindings: typeof variant.bindings;
      entities: { binding: string; ref: string; placedTriangles: number; relationRef: string | null; assignmentBasis: string | null }[];
    };
    expect(hash(glb)).toBe(variant.sha256);
    expect(hash(indexBytes)).toBe(variant.indexSha256);
    expect(glb.length).toBe(variant.byteLength);
    expect(glb.length).toBeLessThanOrEqual(20 * 1024 * 1024);
    expect(index.buildingId).toBe(id);
    expect(index.bindings).toEqual(variant.bindings);
    expect(index.entities).toHaveLength(variant.elements);
    expect(new Set(index.entities.map((row) => row.ref)).size).toBe(variant.elements);
    for (const binding of variant.bindings) {
      const entities = index.entities.filter((entity) => entity.binding === binding.key);
      expect(entities).toHaveLength(binding.elements);
      const assembly = manifest.assemblies?.find((entry) => entry.ref === binding.assemblyRef);
      if (assembly) {
        const thickest = assembly.layers.reduce((a, b) => a.thicknessM >= b.thicknessM ? a : b);
        expect(binding.representativeLayer).toEqual(thickest);
      } else expect(binding.representativeLayer).toBeNull();
      for (const entity of entities) {
        expect(entity.assignmentBasis).toBe(binding.basis);
        // Several occurrence relations can name one material set; each entity
        // retains its actual relation rather than inheriting the first one.
        if (binding.status === "layer_set" || binding.status === "single_material") expect(entity.relationRef).toMatch(/^ifc:\/\/.+#\d+$/);
      }
    }
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder());
    const [materialModel, baseModel] = await Promise.all([
      loader.parseAsync(Uint8Array.from(glb).buffer, ""),
      loader.parseAsync(Uint8Array.from(read(manifest.model.file)).buffer, ""),
    ]);
    let calls = 0, stored = 0, placed = 0;
    const keys = new Set(variant.bindings.map((binding) => binding.key));
    materialModel.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      calls += 1;
      const triangles = object.geometry.index!.count / 3;
      stored += triangles;
      placed += triangles * (object instanceof InstancedMesh ? object.count : 1);
      expect(Array.isArray(object.material)).toBe(false);
      if (!Array.isArray(object.material)) expect(keys.has(object.material.name)).toBe(true);
    });
    expect(calls).toBe(variant.drawCalls);
    expect(calls).toBeLessThanOrEqual(300);
    expect(stored).toBe(variant.triangleCount);
    expect(placed).toBe(variant.placedTriangleCount);
    expect(placed).toBe(index.entities.reduce((sum, entity) => sum + entity.placedTriangles, 0));
    const materialBounds = new Box3().setFromObject(materialModel.scene);
    const baseBounds = new Box3().setFromObject(baseModel.scene);
    for (const end of ["min", "max"] as const) for (const axis of ["x", "y", "z"] as const) expect(materialBounds[end][axis]).toBeCloseTo(baseBounds[end][axis], 3);
    expect(variant.appearanceBasis).toContain("not as the verified exterior finish");
  });
});
