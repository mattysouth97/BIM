import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Box3, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { REFERENCE_BUILDING_IDS } from "../manifest";
// The extraction pipeline is deliberately standalone Node ESM.
import { collectServiceInstances, assertTrsPlacement } from "../../../../scripts/lib/ifc-instances.mjs";
import { weldDetailVertices } from "../../../../scripts/lib/ifc-architectural-details.mjs";

type SourceRow = {
  role: string; fileName: string; sha256: string;
  types: { type: string; candidates: number; rendered: number; withoutRenderedMesh: number }[];
};
type Detail = {
  file: string; byteLength: number; sha256: string; triangleCount: number;
  placedTriangleCount: number; elements: number; drawCalls: number;
  materials: number; instancedShapes: number; instancedPlacements: number;
  sourceFiles: SourceRow[]; indexFile: string; indexSha256: string;
  appearance: string; note: string;
};
type Entity = {
  sourceRole: string; expressId: number; globalId: string; ifcType: string;
  ref: string; geometryParts: number; placedTriangles: number;
};
const bytes = (id: string, file: string) => readFileSync(path.join(process.cwd(), "public/reference-buildings", id, file));
const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const expectedCounts: Record<string, [number, number]> = {
  "bs-medical-dental-clinic": [1409, 1409],
  schependomlaan: [1262, 1214],
  "duplex-apartment": [93, 93],
  "fzk-haus": [6, 6],
  "kit-office": [267, 267],
  "klassiqua-office-1970": [68, 68],
  "taltech-maemaja": [985, 983],
};

describe("published source architectural detail", () => {
  for (const id of REFERENCE_BUILDING_IDS) {
    it(`${id}: decodes all placements and reconciles source claims with actual GLB`, async () => {
      const manifest = JSON.parse(bytes(id, "manifest.json").toString()) as {
        architecturalDetails: Detail;
        sourceFiles: { role: string; fileName: string; sha256: string }[];
      };
      const detail = manifest.architecturalDetails;
      expect(detail).toBeDefined();
      const glb = bytes(id, detail.file);
      const indexBytes = bytes(id, detail.indexFile);
      const index = JSON.parse(indexBytes.toString()) as { buildingId: string; sources: SourceRow[]; entities: Entity[] };
      expect(hash(glb)).toBe(detail.sha256);
      expect(hash(indexBytes)).toBe(detail.indexSha256);
      expect(glb.length).toBe(detail.byteLength);
      expect(glb.length).toBeLessThanOrEqual(20 * 1024 * 1024);
      expect(detail.drawCalls).toBeLessThanOrEqual(200);
      expect(index.buildingId).toBe(id);
      expect(index.sources).toEqual(detail.sourceFiles);
      expect(index.entities).toHaveLength(detail.elements);
      expect(new Set(index.entities.map((e) => `${e.sourceRole}:${e.expressId}`)).size).toBe(detail.elements);
      expect(detail.sourceFiles.flatMap((s) => s.types).reduce((sum, row) => sum + row.candidates, 0)).toBe(expectedCounts[id][0]);
      expect(detail.elements).toBe(expectedCounts[id][1]);
      for (const source of detail.sourceFiles) {
        expect(manifest.sourceFiles.find((s) => s.role === source.role)).toMatchObject({ fileName: source.fileName, sha256: source.sha256 });
        for (const row of source.types) {
          expect(index.entities.filter((e) => e.sourceRole === source.role && e.ifcType === row.type)).toHaveLength(row.rendered);
          expect(row.candidates - row.rendered).toBe(row.withoutRenderedMesh);
        }
      }
      for (const entity of index.entities) {
        const source = detail.sourceFiles.find((s) => s.role === entity.sourceRole)!;
        expect(entity.ref).toBe(`ifc://${source.fileName}#${entity.expressId}`);
        expect(entity.globalId).toHaveLength(22);
        expect(entity.geometryParts).toBeGreaterThan(0);
        expect(entity.placedTriangles).toBeGreaterThan(0);
      }
      const arrayBuffer = Uint8Array.from(glb).buffer;
      const model = await new GLTFLoader().parseAsync(arrayBuffer, "");
      let calls = 0, stored = 0, placed = 0, instanceShapes = 0, instancePlacements = 0;
      const materialNames = new Set<string>();
      model.scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        calls += 1;
        const triangles = object.geometry.index!.count / 3;
        stored += triangles;
        const count = object instanceof InstancedMesh ? object.count : 1;
        placed += triangles * count;
        // GLTFLoader clones materials for instanced/non-instanced shader
        // variants. Count the stored source styles, not runtime UUID clones.
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materialNames.add(material.name);
        if (object instanceof InstancedMesh) {
          instanceShapes += 1;
          instancePlacements += count;
          for (let i = 0; i < count; i += 1) {
            const matrix = new Matrix4();
            object.getMatrixAt(i, matrix);
            expect(matrix.determinant()).toBeGreaterThan(0);
          }
        }
        for (const name of ["position", "normal"]) {
          const attribute = object.geometry.getAttribute(name);
          expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
        }
      });
      expect(calls).toBe(detail.drawCalls);
      expect(stored).toBe(detail.triangleCount);
      expect(placed).toBe(detail.placedTriangleCount);
      expect(placed).toBe(index.entities.reduce((sum, e) => sum + e.placedTriangles, 0));
      expect(instanceShapes).toBe(detail.instancedShapes);
      expect(instancePlacements).toBe(detail.instancedPlacements);
      expect(materialNames.size).toBe(detail.materials);
      const bounds = new Box3().setFromObject(model.scene);
      expect(bounds.isEmpty()).toBe(false);
      expect(bounds.min.toArray().concat(bounds.max.toArray()).every(Number.isFinite)).toBe(true);
      expect(detail.appearance).toContain("possible default styles");
      expect(detail.appearance).toContain("renderer assumptions");
      expect(detail.note).toContain("Not a claim of complete");
    });
  }
});

function fixture(matrices: number[][]) {
  const verts = Float32Array.from([0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1]);
  const api = {
    StreamAllMeshes(_id: number, callback: (mesh: unknown) => void) {
      matrices.forEach((matrix, i) => callback({ expressID: i + 1, geometries: {
        size: () => 1, get: () => ({ geometryExpressID: 10, flatTransformation: matrix }),
      } }));
    },
    GetLine: (_id: number, id: number) => ({ expressID: id, type: 1 }),
    GetNameFromTypeCode: () => "IfcBeam",
    GetGeometry: () => ({ GetVertexData: () => 0, GetVertexDataSize: () => verts.length, GetIndexData: () => 0, GetIndexDataSize: () => 3 }),
    GetVertexArray: () => verts, GetIndexArray: () => Uint32Array.from([0, 1, 2]),
  };
  return { api, verts };
}

describe("lossless detail mesh batching", () => {
  it("bakes reflected geometry and winding while keeping positive instance transforms", () => {
    const matrices = [-2, -2, 2, 2].map((scale, i) => new Matrix4().compose(new Vector3(i * 10, 3, 2), new Quaternion(), new Vector3(scale, 3, 4)).toArray());
    const { api } = fixture(matrices);
    const result = collectServiceInstances(api, {}, 0, { serviceGroups: { beam: ["IfcBeam"] }, bakeMirrors: true, validateTrs: true });
    expect(result.instanced).toHaveLength(2);
    for (const shape of result.instanced) {
      for (const transform of shape.transforms) {
        expect(transform.scale.every((s: number) => s > 0)).toBe(true);
        const matrix = new Matrix4().compose(new Vector3(...transform.translation), new Quaternion(...transform.rotation), new Vector3(...transform.scale));
        const source = matrices[transform.translation[0] / 10];
        const actual = new Vector3().fromArray(shape.positions, 3).applyMatrix4(matrix);
        const expected = new Vector3(1, 0, 0).applyMatrix4(new Matrix4().fromArray(source));
        expect(actual.distanceTo(expected)).toBeLessThan(1e-8);
      }
      const a = new Vector3().fromArray(shape.positions, shape.indices[0] * 3);
      const b = new Vector3().fromArray(shape.positions, shape.indices[1] * 3);
      const c = new Vector3().fromArray(shape.positions, shape.indices[2] * 3);
      expect(b.sub(a).cross(c.sub(a)).z).toBeGreaterThan(0);
    }
  });

  it("rejects shear rather than silently changing the source shape", () => {
    const matrix = new Matrix4().toArray();
    matrix[4] = 0.2;
    expect(() => assertTrsPlacement(matrix)).toThrow("shear");
    matrix[4] = 0;
    matrix[0] = 0;
    expect(() => assertTrsPlacement(matrix)).toThrow("singular");
  });

  it("uses inverse-transpose normals for merged nonuniform placements", () => {
    const matrix = new Matrix4().makeScale(2, 3, 4).toArray();
    const { api, verts } = fixture([matrix]);
    for (let i = 0; i < verts.length; i += 6) {
      verts[i + 3] = Math.SQRT1_2;
      verts[i + 4] = Math.SQRT1_2;
      verts[i + 5] = 0;
    }
    const result = collectServiceInstances(api, {}, 0, { serviceGroups: { beam: ["IfcBeam"] }, validateTrs: true });
    const expected = new Vector3(1 / 2, 1 / 3, 0).normalize();
    const actual = new Vector3().fromArray(result.groups.get("beam").normals);
    expect(actual.distanceTo(expected)).toBeLessThan(1e-8);
  });

  it("welds identical vertices without merging a nearby point or a sharp normal", () => {
    const result = weldDetailVertices({
      positions: [0, 0, 0, 0, 0, 0, 0.000001, 0, 0, 0, 0, 0],
      normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1],
      indices: [0, 2, 3, 1, 2, 3], vertexCount: 4,
    });
    expect(result.vertexCount).toBe(3);
    expect(result.indices).toEqual([0, 1, 2, 0, 1, 2]);
    expect(result.positions[3]).toBe(Math.fround(0.000001));
  });
});
