// src/lib/__tests__/equipment-assets.test.ts
// Unit tests for the Blender GLB equipment-asset cache: deep-clone handout
// (dispose safety), merged-geometry path, userData tagging, test injection.

import { describe, it, expect, afterEach } from "vitest";
import * as THREE from "three";
import {
  __injectEquipmentAssetForTest,
  __resetEquipmentAssetsForTest,
  areEquipmentAssetsReady,
  getEquipmentGeometryClone,
  getEquipmentMaterialClone,
  getEquipmentObjectClone,
  isEquipmentAssetReady,
  tagEquipmentObject,
} from "../equipment-assets";

function makeFakeAsset(): THREE.Group {
  const group = new THREE.Group();
  const matA = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matA);
  const matB = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  const meshB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), matB);
  meshB.position.set(0, 5, 0);
  group.add(meshA, meshB);
  return group;
}

afterEach(() => {
  __resetEquipmentAssetsForTest();
});

describe("equipment-assets cache", () => {
  it("is empty until an asset is injected/loaded", () => {
    expect(areEquipmentAssetsReady()).toBe(false);
    expect(isEquipmentAssetReady("chiller")).toBe(false);
    expect(getEquipmentObjectClone("chiller")).toBeNull();
    expect(getEquipmentGeometryClone("chiller")).toBeNull();
    expect(getEquipmentMaterialClone("chiller")).toBeNull();
  });

  it("injection makes the asset ready", () => {
    __injectEquipmentAssetForTest("chiller", makeFakeAsset());
    expect(isEquipmentAssetReady("chiller")).toBe(true);
    expect(areEquipmentAssetsReady()).toBe(true);
    expect(isEquipmentAssetReady("boiler")).toBe(false);
  });

  it("object clones are deep: geometries and materials are per-clone", () => {
    __injectEquipmentAssetForTest("chiller", makeFakeAsset());
    const a = getEquipmentObjectClone("chiller")!;
    const b = getEquipmentObjectClone("chiller")!;

    const geosA: string[] = [];
    const geosB: string[] = [];
    const matsA: string[] = [];
    const matsB: string[] = [];
    a.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        geosA.push(m.geometry.uuid);
        matsA.push((m.material as THREE.Material).uuid);
      }
    });
    b.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        geosB.push(m.geometry.uuid);
        matsB.push((m.material as THREE.Material).uuid);
      }
    });

    expect(geosA).toHaveLength(2);
    // No shared geometry or material uuids between the two clones —
    // disposing one clone (as building-layers.tsx does on regeneration)
    // cannot corrupt the other or the cached template.
    expect(geosA.filter((g) => geosB.includes(g))).toHaveLength(0);
    expect(matsA.filter((m) => matsB.includes(m))).toHaveLength(0);
  });

  it("merged geometry bakes child transforms", () => {
    __injectEquipmentAssetForTest("vrf-outdoor", makeFakeAsset());
    const merged = getEquipmentGeometryClone("vrf-outdoor")!;
    merged.computeBoundingBox();
    // meshB sits at y=5 — its vertices must appear in the merged geometry
    expect(merged.boundingBox!.max.y).toBeGreaterThan(4);
    // 24 vertices per box × 2 boxes
    expect(merged.getAttribute("position").count).toBe(48);
  });

  it("tagEquipmentObject tags root AND every descendant mesh", () => {
    const asset = makeFakeAsset();
    tagEquipmentObject(asset, { type: "cooling-plant" }, { castShadow: true });
    expect(asset.userData.type).toBe("cooling-plant");
    let meshCount = 0;
    asset.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        meshCount++;
        expect(m.userData.type).toBe("cooling-plant");
        expect(m.castShadow).toBe(true);
      }
    });
    expect(meshCount).toBe(2);
  });

  it("reset clears everything", () => {
    __injectEquipmentAssetForTest("chiller", makeFakeAsset());
    __resetEquipmentAssetsForTest();
    expect(areEquipmentAssetsReady()).toBe(false);
    expect(getEquipmentObjectClone("chiller")).toBeNull();
  });
});
