import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createPvModuleVisual } from "../pv-module-visual";
import { PV_MODULE_LENGTH_M, PV_MODULE_WIDTH_M, type PvModuleInstance } from "@/lib/retrofit/pv-layout";

function moduleAt(centre: [number, number, number], quaternion = new THREE.Quaternion()): PvModuleInstance {
  return {
    planeId: "test-roof",
    centre,
    quaternion: quaternion.toArray(),
    tiltDeg: 40,
    azimuthDeg: 125,
  };
}

describe("PV module visual geometry", () => {
  it("allocates nothing for an empty layout", () => {
    expect(createPvModuleVisual([])).toBeNull();
  });

  it("keeps two instanced draws and the layout's poses for every module", () => {
    const modules = Array.from({ length: 150 }, (_, i) => moduleAt([i * 2, 12, 4]));
    const visual = createPvModuleVisual(modules)!;
    try {
      expect(visual.group.children).toHaveLength(2);
      for (const object of visual.group.children) {
        expect(object).toBeInstanceOf(THREE.InstancedMesh);
        const mesh = object as THREE.InstancedMesh;
        expect(mesh.count).toBe(modules.length);
        expect(Array.isArray(mesh.material)).toBe(false);
        const matrix = new THREE.Matrix4();
        modules.forEach((module, index) => {
          mesh.getMatrixAt(index, matrix);
          expect(new THREE.Vector3().setFromMatrixPosition(matrix).toArray()).toEqual(module.centre);
        });
        expect(mesh.boundingSphere?.radius).toBeGreaterThan(0);
      }
    } finally {
      visual.dispose();
    }
  });

  it("keeps the nominal footprint and all thickness above the pitched underside", () => {
    // Both pitch and a non-cardinal yaw expose world-Y offsets that appear
    // correct on a flat roof, and a face facing -Y instead of out of the roof.
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.65, 0.8, -0.2));
    const panel = moduleAt([7, 13, -4], quaternion);
    const visual = createPvModuleVisual([panel])!;
    try {
      const [frame, face] = visual.group.children as THREE.InstancedMesh[];
      frame.geometry.computeBoundingBox();
      const bounds = frame.geometry.boundingBox!;
      expect(bounds.max.x - bounds.min.x).toBeCloseTo(PV_MODULE_LENGTH_M, 6);
      expect(bounds.max.z - bounds.min.z).toBeCloseTo(PV_MODULE_WIDTH_M, 6);
      expect(bounds.min.y).toBeCloseTo(0, 7);

      const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
      const centre = new THREE.Vector3().fromArray(panel.centre);
      const matrix = new THREE.Matrix4();
      for (const mesh of [frame, face]) {
        mesh.getMatrixAt(0, matrix);
        const positions = mesh.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          const local = new THREE.Vector3().fromBufferAttribute(positions, i);
          const world = local.clone().applyMatrix4(matrix);
          const offset = world.clone().sub(centre);
          expect(offset.dot(normal)).toBeCloseTo(local.y, 5);
          expect(offset.dot(normal)).toBeGreaterThanOrEqual(-1e-6);
          const recovered = offset.applyQuaternion(quaternion.clone().invert());
          expect(recovered.x).toBeCloseTo(local.x, 5);
          expect(recovered.z).toBeCloseTo(local.z, 5);
        }
      }

      face.geometry.computeBoundingBox();
      const faceBounds = face.geometry.boundingBox!;
      expect(faceBounds.min.y).toBeGreaterThan(bounds.max.y);
      expect(faceBounds.max.x).toBeLessThan(bounds.max.x);
      expect(faceBounds.max.z).toBeLessThan(bounds.max.z);
      const faceNormal = new THREE.Vector3().fromBufferAttribute(face.geometry.getAttribute("normal"), 0);
      expect(faceNormal.applyQuaternion(quaternion).dot(normal)).toBeCloseTo(1, 7);
    } finally {
      visual.dispose();
    }
  });

  it("releases both instance buffers, geometries, materials and the shared texture", () => {
    const visual = createPvModuleVisual([moduleAt([0, 0, 0])])!;
    const [frame, face] = visual.group.children as THREE.InstancedMesh[];
    const faceMaterial = face.material as THREE.MeshPhysicalMaterial;
    const texture = faceMaterial.map!;
    const resources = [frame, face, frame.geometry, face.geometry, frame.material as THREE.Material, faceMaterial, texture];
    const disposeEvents = resources.map((resource) => vi.spyOn(resource, "dispose"));
    visual.dispose();
    for (const event of disposeEvents) expect(event).toHaveBeenCalledOnce();
  });
});
