// src/lib/layers/__tests__/layer-13-safety-assets.test.ts
// Detailed Blender-asset paths added to the Safety layer (layer-13-safety.ts):
//   - safety-sprinkler / safety-smoke-detector ceiling grids
//   - safety-exit-sign at the stair/core positions the layer already computes
//   - safety-extinguisher / safety-hydrant near-core point placements
// All 5 are detailed-asset-only: no coarse fallback for these element kinds,
// and with an empty cache the pre-existing layer-13 output must be unchanged.

import { describe, it, expect, afterEach } from "vitest";
import * as THREE from "three";
import { SafetyLayer } from "../layer-13-safety";
import {
  __injectEquipmentAssetForTest,
  __resetEquipmentAssetsForTest,
} from "@/lib/equipment-assets";
import type { BuildingRecipe } from "@/lib/procedural/types";

function makeRecipe(): BuildingRecipe {
  return {
    footprintWidth: 12,
    footprintDepth: 10,
    floors: [
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 3.0, isGroundFloor: true },
      { floorNo: 2, label: "2F", type: "above", y: 3.0, height: 3.0, isGroundFloor: false },
      { floorNo: 3, label: "3F", type: "above", y: 6.0, height: 3.0, isGroundFloor: false },
    ],
    totalHeight: 9.0,
    wallThickness: 0.2,
    era: "2010-2019",
    strctCd: "21",
    mainPurpsCd: "02000",
    column: { spacing: 6, size: 0.4, inset: 1 },
    slab: { thickness: 0.2, overhang: 0 },
    facade: {
      windowWidth: 1.4,
      windowHeight: 1.6,
      sillHeight: 0.9,
      windowSpacing: 0.5,
      windowRatio: 0.6,
      mullionDepth: 0.06,
      mullionWidth: 0.05,
      glassInset: 0.04,
      solidPanelChance: 0.15,
      parapetHeight: 0.9,
      cornerInset: 0.2,
    },
    roof: { type: "flat", flatThickness: 0.15, gableHeight: 0, hipInset: 0 },
    siteWidth: 20,
    siteDepth: 18,
    buildingName: "Test Building",
    address: "Seoul, Korea",
    materials: {
      wall: { color: "#cccccc", roughness: 0.8, metalness: 0.1 },
      glass: { color: "#88aacc", roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.4 },
      mullion: { color: "#888888", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#aaaaaa", roughness: 0.9, metalness: 0.0 },
      column: { color: "#bbbbbb", roughness: 0.8, metalness: 0.1 },
      roof: { color: "#999999", roughness: 0.9, metalness: 0.0 },
      groundFloor: { color: "#dddddd", roughness: 0.9, metalness: 0.0 },
    },
  };
}

function makeFakeAsset(): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x123456 })
  );
  group.add(mesh);
  return group;
}

function findByType(group: THREE.Group, type: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  group.traverse((obj) => {
    if (!found && obj.userData?.type === type) found = obj;
  });
  return found;
}

function injectAllFive(): void {
  __injectEquipmentAssetForTest("sprinkler-head", makeFakeAsset());
  __injectEquipmentAssetForTest("smoke-detector", makeFakeAsset());
  __injectEquipmentAssetForTest("exit-sign", makeFakeAsset());
  __injectEquipmentAssetForTest("fire-extinguisher", makeFakeAsset());
  __injectEquipmentAssetForTest("hydrant-cabinet", makeFakeAsset());
}

afterEach(() => {
  __resetEquipmentAssetsForTest();
});

describe("SafetyLayer — pre-existing output (no assets)", () => {
  it("renders fire zones, stairwells, and the coarse sprinkler grid exactly as before", () => {
    const group = new SafetyLayer().generate(makeRecipe());

    let fireZones = 0;
    let stairwells = 0;
    group.traverse((o) => {
      if (o.userData?.type === "safety-fire-zone") fireZones++;
      if (o.userData?.type === "safety-stairwell") stairwells++;
    });
    expect(fireZones).toBe(3); // one per above floor
    expect(stairwells).toBe(2); // fixed 2-corner layout

    const coarseHead = findByType(group, "safety-sprinkler-head") as THREE.InstancedMesh;
    const coarseBulb = findByType(group, "safety-sprinkler-bulb") as THREE.InstancedMesh;
    expect(coarseHead).toBeDefined();
    expect(coarseBulb).toBeDefined();
    // colsX=floor(12/3)=4, colsZ=floor(10/3)=3 -> 12/floor * 3 floors = 36
    expect(coarseHead.count).toBe(36);
    expect(coarseBulb.count).toBe(36);
  });

  it("adds none of the 5 detailed safety-kit InstancedMeshes when the cache is empty", () => {
    const group = new SafetyLayer().generate(makeRecipe());
    expect(findByType(group, "safety-sprinkler")).toBeUndefined();
    expect(findByType(group, "safety-smoke-detector")).toBeUndefined();
    expect(findByType(group, "safety-exit-sign")).toBeUndefined();
    expect(findByType(group, "safety-extinguisher")).toBeUndefined();
    expect(findByType(group, "safety-hydrant")).toBeUndefined();
  });
});

describe("SafetyLayer — detailed asset kit (injected fakes)", () => {
  it("adds the sprinkler ceiling-grid InstancedMesh at half the lighting-grid density", () => {
    __injectEquipmentAssetForTest("sprinkler-head", makeFakeAsset());
    const group = new SafetyLayer().generate(makeRecipe());
    const im = findByType(group, "safety-sprinkler") as THREE.InstancedMesh;
    expect(im).toBeDefined();
    // spacing = max(3.0, 6.0/1.0) = 6.0 -> 2 cols (x: -5,1) x 2 rows (z: -4,2) = 4/floor * 3 floors
    expect(im.count).toBe(12);
    const mat = im.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0xd97706); // brass tint
    expect(mat.emissiveIntensity).toBeGreaterThanOrEqual(0.15);
    expect(mat.emissiveIntensity).toBeLessThanOrEqual(0.3);
  });

  it("adds the smoke-detector offset grid at 1/4 the sprinkler density", () => {
    __injectEquipmentAssetForTest("smoke-detector", makeFakeAsset());
    const group = new SafetyLayer().generate(makeRecipe());
    const im = findByType(group, "safety-smoke-detector") as THREE.InstancedMesh;
    expect(im).toBeDefined();
    // spacing = 12.0 -> 1 col x 1 row = 1/floor * 3 floors
    expect(im.count).toBe(3);
    const mat = im.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0xef4444);
  });

  it("adds sprinkler and smoke-detector independently (only smoke asset loaded)", () => {
    __injectEquipmentAssetForTest("smoke-detector", makeFakeAsset());
    const group = new SafetyLayer().generate(makeRecipe());
    expect(findByType(group, "safety-sprinkler")).toBeUndefined();
    expect(findByType(group, "safety-smoke-detector")).toBeDefined();
  });

  it("places 2 exit signs per floor at the layer's existing stair/core positions", () => {
    __injectEquipmentAssetForTest("exit-sign", makeFakeAsset());
    const group = new SafetyLayer().generate(makeRecipe());
    const im = findByType(group, "safety-exit-sign") as THREE.InstancedMesh;
    expect(im).toBeDefined();
    expect(im.count).toBe(6); // 2 per floor * 3 floors

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    im.getMatrixAt(0, mat4);
    mat4.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
    // stairPositions[0] = { x: -halfW + 2.5, z: halfD - 2.5 } = (-3.5, 2.5); y = floor.y + 2.2
    expect(pos.x).toBeCloseTo(-3.5, 5);
    expect(pos.z).toBeCloseTo(2.5, 5);
    expect(pos.y).toBeCloseTo(2.2, 5);
  });

  it("places 2 extinguishers per floor near core at (±1.2, floor.y+0.6, 0.6)", () => {
    __injectEquipmentAssetForTest("fire-extinguisher", makeFakeAsset());
    const group = new SafetyLayer().generate(makeRecipe());
    const im = findByType(group, "safety-extinguisher") as THREE.InstancedMesh;
    expect(im).toBeDefined();
    expect(im.count).toBe(6); // 2 per floor * 3 floors

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    im.getMatrixAt(0, mat4);
    mat4.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
    expect(pos.x).toBeCloseTo(1.2, 5);
    expect(pos.y).toBeCloseTo(0.6, 5);
    expect(pos.z).toBeCloseTo(0.6, 5);
  });

  it("places 1 hydrant cabinet per floor at (1.8, floor.y+0.75, 0.4)", () => {
    __injectEquipmentAssetForTest("hydrant-cabinet", makeFakeAsset());
    const group = new SafetyLayer().generate(makeRecipe());
    const im = findByType(group, "safety-hydrant") as THREE.InstancedMesh;
    expect(im).toBeDefined();
    expect(im.count).toBe(3); // 1 per floor * 3 floors

    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    im.getMatrixAt(1, mat4); // 2nd floor instance
    mat4.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
    expect(pos.x).toBeCloseTo(1.8, 5);
    expect(pos.y).toBeCloseTo(3.0 + 0.75, 5); // floor 2 y=3.0
    expect(pos.z).toBeCloseTo(0.4, 5);
  });

  it("renders all 5 detailed InstancedMeshes together and keeps the pre-existing content", () => {
    injectAllFive();
    const group = new SafetyLayer().generate(makeRecipe());

    expect(findByType(group, "safety-sprinkler")).toBeDefined();
    expect(findByType(group, "safety-smoke-detector")).toBeDefined();
    expect(findByType(group, "safety-exit-sign")).toBeDefined();
    expect(findByType(group, "safety-extinguisher")).toBeDefined();
    expect(findByType(group, "safety-hydrant")).toBeDefined();

    // Pre-existing fire zones / stairwells / coarse sprinkler grid still present
    let fireZones = 0;
    group.traverse((o) => {
      if (o.userData?.type === "safety-fire-zone") fireZones++;
    });
    expect(fireZones).toBe(3);
    expect(findByType(group, "safety-sprinkler-head")).toBeDefined();
  });
});

describe("SafetyLayer dispose()", () => {
  it("does not throw with the detailed asset kit present", () => {
    injectAllFive();
    const layer = new SafetyLayer();
    layer.generate(makeRecipe());
    expect(() => layer.dispose()).not.toThrow();
  });

  it("does not throw with an empty cache", () => {
    const layer = new SafetyLayer();
    layer.generate(makeRecipe());
    expect(() => layer.dispose()).not.toThrow();
  });
});
