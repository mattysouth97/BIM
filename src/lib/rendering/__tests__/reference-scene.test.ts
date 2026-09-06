import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { referenceCameraPose, referenceDepthRange, setReferenceShadows } from "../reference-scene";

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

describe("thin-layer depth precision", () => {
  const depth = (z: number, near: number, far: number) => far / (far - near) - far * near / ((far - near) * z);
  it.each([[40, 10], [160, 50], [30, 8]])("resolves a 0.1mm separation at distance %sm", (distance, radius) => {
    const range = referenceDepthRange(radius, distance);
    const steps = (near: number, far: number) => Math.abs(depth(distance + 0.0001, near, far) - depth(distance, near, far)) * (2 ** 24 - 1);
    const oldSteps = steps(Math.max(0.1, distance / 800), distance * 12);
    expect(oldSteps).toBeLessThan(1);
    expect(steps(range.near, range.far)).toBeGreaterThan(2);
    expect(steps(range.near, range.far) / oldSteps).toBeGreaterThan(100);
    expect(range.near).toBeLessThan(distance - radius);
    expect(range.far).toBeGreaterThan(distance + radius);
  });
  it("keeps the whole measured box inside clipping planes across orbit and dolly", () => {
    const size = new THREE.Vector3(50, 15, 24);
    const radius = size.length() / 2;
    for (const distance of [radius * 1.2, radius * 2, radius * 20]) {
      for (const azimuth of [0, 0.3, 1.7, 3.4, 5.9]) {
        const camera = new THREE.PerspectiveCamera(40, 1);
        camera.position.set(Math.cos(azimuth), 0.6, Math.sin(azimuth)).normalize().multiplyScalar(distance);
        camera.lookAt(0, 0, 0);
        const range = referenceDepthRange(radius, distance);
        camera.near = range.near; camera.far = range.far;
        camera.updateProjectionMatrix(); camera.updateMatrixWorld();
        for (const x of [-25, 25]) for (const y of [-7.5, 7.5]) for (const z of [-12, 12]) {
          const projected = new THREE.Vector3(x, y, z).project(camera);
          expect(projected.z).toBeGreaterThan(-1);
          expect(projected.z).toBeLessThan(1);
        }
      }
    }
  });
  it("preserves a small near plane when inspecting inside the model bounds", () => {
    expect(referenceDepthRange(20, 5).near).toBe(0.02);
    expect(referenceDepthRange(20, -5).far).toBeGreaterThan(0.02);
  });
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
