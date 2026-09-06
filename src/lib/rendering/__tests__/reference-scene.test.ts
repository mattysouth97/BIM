import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { referenceCameraPose, setReferenceShadows } from "../reference-scene";

describe("reference model camera", () => {
  for (const aspect of [0.45, 1, 2.2]) for (const view of ["roof", "exterior"] as const) {
    it(`fits measured corners in ${view} at aspect ${aspect}`, () => {
      const size = new THREE.Vector3(50, 15, 24);
      for (const inspection of [false, true]) {
        const pose = referenceCameraPose(size, aspect, 40, view, inspection);
        const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 2000);
        camera.position.copy(pose.position);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
          const point = new THREE.Vector3(x * 25, y * 7.5, z * 12).project(camera);
          expect(Math.abs(point.x)).toBeLessThanOrEqual(0.860001);
          expect(Math.abs(point.y)).toBeLessThanOrEqual(inspection ? 0.860001 : 0.550001);
          expect(point.z).toBeGreaterThan(-1);
          expect(point.z).toBeLessThan(1);
        }
      }
    });
  }
});

describe("reference model shadows", () => {
  it("shadows opaque fabric, avoids opaque glass silhouettes, and restores cached flags", () => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    const wallMaterial = new THREE.MeshStandardMaterial();
    const glassMaterial = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3 });
    const wall = new THREE.Mesh(geometry, wallMaterial);
    const glass = new THREE.Mesh(geometry, glassMaterial);
    group.add(wall, glass);
    const release = setReferenceShadows(group);
    expect([wall.castShadow, wall.receiveShadow]).toEqual([true, true]);
    expect([glass.castShadow, glass.receiveShadow]).toEqual([false, false]);
    release();
    expect([wall.castShadow, wall.receiveShadow]).toEqual([false, false]);
    const releaseGhost = setReferenceShadows(group, true);
    expect([wall.castShadow, wall.receiveShadow]).toEqual([false, false]);
    releaseGhost();
    geometry.dispose(); wallMaterial.dispose(); glassMaterial.dispose();
  });
});
