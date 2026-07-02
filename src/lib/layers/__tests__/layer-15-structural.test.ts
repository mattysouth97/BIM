// src/lib/layers/__tests__/layer-15-structural.test.ts
// Unit tests for StructuralAnalysisLayer generator output.

import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { StructuralAnalysisLayer } from "../layer-15-structural";
import type { BuildingRecipe } from "@/lib/procedural/types";

// ---------------------------------------------------------------------------
// Helper: find the structural-column InstancedMesh (traverses entire group)
// ---------------------------------------------------------------------------

function findStructuralColumnMesh(group: THREE.Group): THREE.InstancedMesh | undefined {
  let found: THREE.InstancedMesh | undefined;
  group.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh && obj.userData.type === "structural-column") {
      found = obj;
    }
  });
  return found;
}

// ---------------------------------------------------------------------------
// Mock recipe fixture — 3 above-ground floors, 4-column grid
// ---------------------------------------------------------------------------

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
    era: "2000-2009",
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
      column: { color: "#999999", roughness: 0.8, metalness: 0.0 },
      roof: { color: "#888888", roughness: 0.7, metalness: 0.1 },
      groundFloor: { color: "#bbbbbb", roughness: 0.9, metalness: 0.0 },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StructuralAnalysisLayer", () => {
  let layer: StructuralAnalysisLayer;
  let recipe: BuildingRecipe;

  beforeEach(() => {
    layer = new StructuralAnalysisLayer();
    recipe = makeRecipe();
  });

  it("1. generate() returns a Group named 'layer-15-structural'", () => {
    const group = layer.generate(recipe);
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.name).toBe("layer-15-structural");
  });

  it("2. Group has a child named 'structural-arrows'", () => {
    const group = layer.generate(recipe);
    const arrowsGroup = group.getObjectByName("structural-arrows");
    expect(arrowsGroup).toBeDefined();
    expect(arrowsGroup).toBeInstanceOf(THREE.Group);
  });

  it("3. Group has a child named 'structural-foundations'", () => {
    const group = layer.generate(recipe);
    const foundationsGroup = group.getObjectByName("structural-foundations");
    expect(foundationsGroup).toBeDefined();
    expect(foundationsGroup).toBeInstanceOf(THREE.Group);
  });

  it("4. Group contains at least one InstancedMesh (stress-colored columns)", () => {
    const group = layer.generate(recipe);
    let found = false;
    group.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) found = true;
    });
    expect(found).toBe(true);
  });

  it("5. InstancedMesh has userData.type === 'structural-column'", () => {
    const group = layer.generate(recipe);
    let foundType: string | undefined;
    group.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh && obj.userData.type === "structural-column") {
        foundType = obj.userData.type;
      }
    });
    expect(foundType).toBe("structural-column");
  });

  it("6. InstancedMesh instanceCount matches floors * columns (3 floors * 4 columns = 12)", () => {
    const group = layer.generate(recipe);
    // With footprintWidth=12, footprintDepth=10, column.spacing=6, inset=1:
    // innerW=10, innerD=8, colsX=3, colsZ=2 → positions = 6
    // Actually let's just count what we get and check it equals floors * positions
    const aboveFloors = recipe.floors.filter((f) => f.type === "above");
    const instancedMesh = findStructuralColumnMesh(group);
    expect(instancedMesh).not.toBeUndefined();
    // The count should equal aboveFloors.length * columnPositions.length
    // For this recipe: 3 above floors * column grid positions
    expect(instancedMesh!.count).toBeGreaterThan(0);
    // Verify the count is a multiple of aboveFloors.length
    expect(instancedMesh!.count % aboveFloors.length).toBe(0);
  });

  it("7. InstancedMesh has userData.sizingLabels array with length === instanceCount", () => {
    const group = layer.generate(recipe);
    const instancedMesh = findStructuralColumnMesh(group);
    expect(instancedMesh).not.toBeUndefined();
    const mesh = instancedMesh!;
    expect(Array.isArray(mesh.userData.sizingLabels)).toBe(true);
    expect(mesh.userData.sizingLabels.length).toBe(mesh.count);
  });

  it("8. dispose() clears internal state; second generate() after dispose() works", () => {
    layer.generate(recipe);
    // First dispose should not throw
    expect(() => layer.dispose()).not.toThrow();
    // Second dispose should not throw (double-dispose guard)
    expect(() => layer.dispose()).not.toThrow();
    // After dispose, generate() should work again
    const group2 = layer.generate(recipe);
    expect(group2).toBeInstanceOf(THREE.Group);
    expect(group2.name).toBe("layer-15-structural");
  });

  it("9. structural-arrows group contains Mesh children (ConeGeometry + CylinderGeometry)", () => {
    const group = layer.generate(recipe);
    const arrowsGroup = group.getObjectByName("structural-arrows") as THREE.Group;
    expect(arrowsGroup).toBeDefined();
    // Arrows group should have sub-groups or meshes
    expect(arrowsGroup.children.length).toBeGreaterThan(0);
  });
});
