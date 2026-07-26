// src/lib/procedural/__tests__/structural-kit.test.ts
// Structural Blender-kit integration: column geometry swap, the new beam
// grid, roof furniture gating, and facade mullion/panel swaps.

import { describe, it, expect, afterEach } from "vitest";
import * as THREE from "three";
import {
  generateColumns,
  generateBeams,
  generateRoofFurniture,
} from "../structure-generator";
import { generateFacade } from "../facade-generator";
import {
  __injectEquipmentAssetForTest,
  __resetEquipmentAssetsForTest,
} from "@/lib/equipment-assets";
import type { BuildingRecipe } from "../types";

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

function makeFakeAsset(vertCountHint = 1): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < vertCountHint; i++) {
    group.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x888888 })
      )
    );
  }
  return group;
}

afterEach(() => {
  __resetEquipmentAssetsForTest();
});

describe("generateColumns", () => {
  it("falls back to the unit box (24 verts) without assets", () => {
    const im = generateColumns(makeRecipe());
    expect(im.geometry.getAttribute("position").count).toBe(24);
  });

  it("swaps in the detailed column module when loaded", () => {
    __injectEquipmentAssetForTest("column", makeFakeAsset(3)); // 72 verts
    const im = generateColumns(makeRecipe());
    expect(im.geometry.getAttribute("position").count).toBe(72);
    expect(im.userData.type).toBe("column");
  });
});

describe("generateBeams", () => {
  it("spans the column grid on every floor", () => {
    const beams = generateBeams(makeRecipe())!;
    expect(beams).not.toBeNull();
    expect(beams.userData.type).toBe("beam");
    // Grid 12×10, spacing 6, inset 1 → colsX=3, colsZ=2
    // per floor: (3-1)×2 X-beams + 3×(2-1) Z-beams = 7; 3 floors → 21
    expect(beams.count).toBe(21);
  });

  it("returns null when the footprint has no structural bay", () => {
    const recipe = makeRecipe();
    recipe.footprintWidth = 4;
    recipe.footprintDepth = 4;
    expect(generateBeams(recipe)).toBeNull();
  });

  it("returns null for cadastral polygon footprints", () => {
    const recipe = makeRecipe();
    recipe.footprintPolygon = [
      [
        [0, 0],
        [10, 0],
        [10, 8],
        [0, 8],
        [0, 0],
      ],
    ];
    expect(generateBeams(recipe)).toBeNull();
  });

  it("beam tops sit flush under the slab above", () => {
    const beams = generateBeams(makeRecipe())!;
    const mat4 = new THREE.Matrix4();
    beams.getMatrixAt(0, mat4);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    mat4.decompose(pos, quat, scl);
    // Floor 1: y = 0 + 3.0 − beamDepth/2, beamDepth = min(0.5, 0.2×2+0.1) = 0.5
    expect(pos.y).toBeCloseTo(3.0 - 0.25, 5);
  });
});

describe("generateRoofFurniture", () => {
  it("returns null without the asset", () => {
    expect(generateRoofFurniture(makeRecipe())).toBeNull();
  });

  it("returns null for non-flat roofs", () => {
    __injectEquipmentAssetForTest("roof-furniture", makeFakeAsset());
    const recipe = makeRecipe();
    recipe.roof = { type: "gable", flatThickness: 0, gableHeight: 2, hipInset: 0 };
    expect(generateRoofFurniture(recipe)).toBeNull();
  });

  it("seats the furniture on the flat-roof top surface", () => {
    __injectEquipmentAssetForTest("roof-furniture", makeFakeAsset());
    const furniture = generateRoofFurniture(makeRecipe())!;
    expect(furniture).not.toBeNull();
    expect(furniture.position.y).toBeCloseTo(9.15, 5);
  });
});

describe("generateFacade with detailed kit", () => {
  it("keeps the 4-InstancedMesh structure with swapped geometries", () => {
    __injectEquipmentAssetForTest("mullion", makeFakeAsset(2)); // 48 verts
    __injectEquipmentAssetForTest("facade-panel", makeFakeAsset(3)); // 72 verts
    const facade = generateFacade(makeRecipe());
    expect(facade.children).toHaveLength(4);
    const [glass, solid, hMullions, vMullions] = facade.children as THREE.InstancedMesh[];
    expect(glass.userData.type).toBe("glass");
    expect(solid.geometry.getAttribute("position").count).toBe(72);
    expect(hMullions.geometry.getAttribute("position").count).toBe(48);
    expect(vMullions.geometry.getAttribute("position").count).toBe(48);
  });
});
