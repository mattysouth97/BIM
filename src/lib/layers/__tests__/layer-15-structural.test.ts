import { beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";

import { StructuralAnalysisLayer } from "../layer-15-structural";
import type { BuildingRecipe } from "@/lib/procedural/types";

function makeRecipe(): BuildingRecipe {
  return {
    footprintWidth: 12,
    footprintDepth: 10,
    floors: [
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 3, isGroundFloor: true },
      { floorNo: 2, label: "2F", type: "above", y: 3, height: 3, isGroundFloor: false },
      { floorNo: 3, label: "3F", type: "above", y: 6, height: 3, isGroundFloor: false },
    ],
    totalHeight: 9,
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
      glass: { color: "#88aacc", roughness: 0.1, metalness: 0, transparent: true, opacity: 0.4 },
      mullion: { color: "#888888", roughness: 0.4, metalness: 0.6 },
      slab: { color: "#aaaaaa", roughness: 0.9, metalness: 0 },
      column: { color: "#999999", roughness: 0.8, metalness: 0 },
      roof: { color: "#888888", roughness: 0.7, metalness: 0.1 },
      groundFloor: { color: "#bbbbbb", roughness: 0.9, metalness: 0 },
    },
  };
}

describe("StructuralAnalysisLayer", () => {
  let layer: StructuralAnalysisLayer;
  let recipe: BuildingRecipe;

  beforeEach(() => {
    layer = new StructuralAnalysisLayer();
    recipe = makeRecipe();
  });

  it("returns the named analysis group", () => {
    const group = layer.generate(recipe);
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.name).toBe("layer-15-structural");
  });

  it("contains load-path and foundation annotation groups", () => {
    const group = layer.generate(recipe);
    expect(group.getObjectByName("structural-arrows")).toBeInstanceOf(THREE.Group);
    expect(group.getObjectByName("structural-foundations")).toBeInstanceOf(THREE.Group);
  });

  it("does not duplicate the physical structural column volume", () => {
    const group = layer.generate(recipe);
    let duplicates = 0;
    group.traverse((object) => {
      if (object instanceof THREE.InstancedMesh && object.userData.type === "structural-column") {
        duplicates++;
      }
    });
    expect(duplicates).toBe(0);
  });

  it("creates load arrows and one or more foundation markers", () => {
    const group = layer.generate(recipe);
    let arrowCount = 0;
    let foundationCount = 0;
    let foundationY = 0;
    group.traverse((object) => {
      if (object.userData.type === "load-path-arrow") arrowCount++;
      if (object.userData.type === "structural-foundation") {
        foundationCount++;
        foundationY = object.position.y;
      }
    });
    expect(arrowCount).toBeGreaterThan(0);
    expect(foundationCount).toBeGreaterThan(0);
    expect(foundationY).toBeGreaterThan(recipe.slab.thickness);
  });

  it("places load arrows beside columns and fully above the slab", () => {
    const group = layer.generate(recipe);
    const arrows = group.getObjectByName("structural-arrows") as THREE.Group;
    const first = arrows.children[0] as THREE.Group;
    const anchor = first.userData.columnAnchor as { x: number; z: number };
    const head = first.children.find(
      (child) => child instanceof THREE.Mesh && child.geometry.type === "ConeGeometry",
    ) as THREE.Mesh<THREE.ConeGeometry>;
    const horizontalDistance = Math.hypot(
      head.position.x - anchor.x,
      head.position.z - anchor.z,
    );
    const headBottom = head.position.y - head.geometry.parameters.height / 2;

    expect(horizontalDistance).toBeGreaterThan(recipe.column.size / 2 + 0.12);
    expect(headBottom).toBeGreaterThan(recipe.slab.thickness);
  });

  it("dispose is idempotent and generate works again", () => {
    layer.generate(recipe);
    expect(() => layer.dispose()).not.toThrow();
    expect(() => layer.dispose()).not.toThrow();
    expect(layer.generate(recipe).name).toBe("layer-15-structural");
  });
});
