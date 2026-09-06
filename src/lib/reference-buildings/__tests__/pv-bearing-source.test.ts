import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { roofAzimuthDeg } from "../../../../scripts/lib/ifc-roof-planes.mjs";
import { layoutRoofPlanes, type RoofPlaneSet } from "@/lib/retrofit/pv-layout";
import { createPvModuleVisual } from "@/lib/rendering/pv-module-visual";
import { REFERENCE_BUILDING_IDS } from "../manifest";

const read = (id: string, name: string) => readFileSync(`public/reference-buildings/${id}/${name}`);
const roofSet = (id: string): RoofPlaneSet => JSON.parse(read(id, "roof-planes.json").toString());

describe("PV directions in the actual IFC coordinate frame", () => {
  it("web-ifc maps an IFC +Y north displacement to world -Z", () => {
    const raw = execFileSync(process.execPath, ["scripts/verify-ifc-north-axis.mjs"], { encoding: "utf8" });
    const result = JSON.parse(raw.trim().split(/\r?\n/).at(-1)!);
    expect(result.ifcCentre).toEqual([0, 10, 1]);
    expect(result.worldCentre).toEqual([0, 1, -10]);
  });

  it.each(REFERENCE_BUILDING_IDS)("%s bearings agree with descending height and independently rotated compass axes", (id) => {
    const data = roofSet(id);
    const rotation = (data.trueNorthDeg ?? 0) * Math.PI / 180;
    const north = new THREE.Vector3(Math.sin(rotation), 0, -Math.cos(rotation));
    const east = new THREE.Vector3(Math.cos(rotation), 0, Math.sin(rotation));
    for (const plane of data.planes) {
      const [nx, ny, nz] = plane.normal;
      const horizontal = new THREE.Vector3(nx, 0, nz);
      if (horizontal.length() < Math.sin(0.5 * Math.PI / 180)) {
        expect(plane.azimuthDeg).toBeNull();
        continue;
      }
      // Move one metre along horizontal normal: plane-equation height MUST fall.
      horizontal.normalize();
      expect(-(nx * horizontal.x + nz * horizontal.z) / ny).toBeLessThan(0);
      const independentlyRead = (Math.atan2(horizontal.dot(east), horizontal.dot(north)) * 180 / Math.PI + 360) % 360;
      const error = Math.abs(((plane.azimuthDeg! - independentlyRead + 540) % 360) - 180);
      expect(error, `${id}/${plane.id}`).toBeLessThanOrEqual(0.00501);
      expect(roofAzimuthDeg(plane.normal, data.trueNorthDeg ?? 0)).toBe(plane.azimuthDeg);
    }
  });

  it.each([0, 50, -35])("flat-rack actual cell normal faces south with true-north rotation %s°", (trueNorthDeg) => {
    const set: RoofPlaneSet = { kind: "bimfit_reference_building_roof_planes", buildingId: "rack", northAssumed: false, trueNorthDeg,
      planes: [{ id: "deck", elementName: "Deck", elementType: "Fixture", normal: [0, 1, 0], tiltDeg: 0, azimuthDeg: null,
        surfaceSqm: 400, projectedSqm: 400, minElevationM: 10, maxElevationM: 10, outline: [[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]] }] };
    const modules = layoutRoofPlanes(set).planes[0].modules;
    expect(modules.length).toBeGreaterThan(0);
    const visual = createPvModuleVisual(modules)!;
    try {
      const face = visual.group.getObjectByName("pv-module-cells") as THREE.InstancedMesh;
      const matrix = new THREE.Matrix4(); face.getMatrixAt(0, matrix);
      const actualNormal = new THREE.Vector3().fromBufferAttribute(face.geometry.attributes.normal, 0).transformDirection(matrix);
      const angle = trueNorthDeg * Math.PI / 180;
      const north = new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle));
      expect(actualNormal.clone().setY(0).normalize().dot(north)).toBeCloseTo(-1, 6);
      expect(actualNormal.y).toBeCloseTo(Math.cos(Math.PI / 6), 6);
    } finally { visual.dispose(); }
  });

  it("FZK's source TrueNorth vectors and source-mesh roof normals give 130° / 310°", async () => {
    // Actual IFC #60/#372 DirectionRatios, not an angle copied from the output.
    const sourceNorth = new THREE.Vector3(0.766044443119, 0, -0.642787609687).normalize();
    const sourceEast = new THREE.Vector3(-sourceNorth.z, 0, sourceNorth.x);
    const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(read("fzk-haus", "model.glb")).buffer, "");
    scene.updateMatrixWorld(true);
    const bearingReadings = [];
    for (const z of [-7.75, -2.25]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(6, 20, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(scene, true)[0];
      expect(hit).toBeDefined();
      const normal = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld).setY(0).normalize();
      bearingReadings.push((Math.atan2(normal.dot(sourceEast), normal.dot(sourceNorth)) * 180 / Math.PI + 360) % 360);
    }
    expect(bearingReadings[0]).toBeCloseTo(310, 5);
    expect(bearingReadings[1]).toBeCloseTo(130, 5);
    expect(roofSet("fzk-haus").planes.map((p) => p.azimuthDeg)).toEqual([310, 130]);
    // Existing policy excludes only within 45° of north: NW310 is outside it.
    const layout = layoutRoofPlanes(roofSet("fzk-haus"));
    expect(layout.planes.map((p) => p.excludedReason)).toEqual([null, null]);
    expect(layout.planes.map((p) => p.moduleCount)).toEqual([22, 22]);
  });
});

describe("actual cell faces stay above source building meshes", () => {
  it.each(REFERENCE_BUILDING_IDS)("%s: actual PV clears source roofs, or produces no visual when none fits", async (id) => {
    const layout = layoutRoofPlanes(roofSet(id));
    const modules = layout.planes.flatMap((p) => p.modules);
    if (id === "kit-office") {
      expect(modules).toHaveLength(0);
      expect(createPvModuleVisual(modules)).toBeNull();
      return;
    }
    expect(modules.length).toBeGreaterThan(0);
    const visual = createPvModuleVisual(modules)!;
    const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(read(id, "model.glb")).buffer, "");
    scene.updateMatrixWorld(true);
    scene.traverse((object) => { if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.side = THREE.DoubleSide;
    });
    const ray = new THREE.Raycaster();
    try {
      const face = visual.group.getObjectByName("pv-module-cells") as THREE.InstancedMesh;
      face.geometry.computeBoundingBox();
      const faceY = face.geometry.boundingBox!.min.y;
      const matrix = new THREE.Matrix4();
      for (let index = 0; index < modules.length; index++) {
        face.getMatrixAt(index, matrix);
        for (const [x, z] of [[0, 0], [-0.8, -0.46], [0.8, -0.46], [0.8, 0.46], [-0.8, 0.46]]) {
          const point = new THREE.Vector3(x, faceY, z).applyMatrix4(matrix);
          ray.set(new THREE.Vector3(point.x, 100, point.z), new THREE.Vector3(0, -1, 0));
          const hit = ray.intersectObject(scene, true)[0];
          expect(hit, `${id} module ${index}: roof below cell`).toBeDefined();
          expect(point.y - hit.point.y, `${id} module ${index}: cell clearance`).toBeGreaterThan(0.001);
        }
      }
    } finally { visual.dispose(); }
  }, 60000);
});
