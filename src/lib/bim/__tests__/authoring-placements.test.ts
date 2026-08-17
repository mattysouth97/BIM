import { describe, it, expect } from "vitest";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { PBRMaterialConfig } from "@/lib/pbr-materials";
import { planAuthoringInstances } from "../authoring-placements";

const MAT: PBRMaterialConfig = { color: "#ccc", roughness: 0.8, metalness: 0 };

function makeRecipe(): BuildingRecipe {
  return {
    footprintWidth: 20,
    footprintDepth: 12,
    floors: [
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 3.5, isGroundFloor: true },
      { floorNo: 2, label: "2F", type: "above", y: 3.5, height: 3.2, isGroundFloor: false },
    ],
    totalHeight: 6.7,
    wallThickness: 0.2,
    era: "2010-2019",
    strctCd: "11",
    mainPurpsCd: "02000",
    facade: {
      windowWidth: 1.5,
      windowHeight: 1.8,
      sillHeight: 0.9,
      windowSpacing: 4,
      windowRatio: 0.35,
      mullionDepth: 0.08,
      mullionWidth: 0.06,
      glassInset: 0.05,
      solidPanelChance: 0.2,
      parapetHeight: 1,
      cornerInset: 0,
    },
    slab: { thickness: 0.2, overhang: 0.1 },
    column: { spacing: 6, size: 0.5, inset: 1.5 },
    roof: { type: "flat", flatThickness: 0.25, gableHeight: 0, hipInset: 0 },
    materials: {
      wall: MAT,
      glass: MAT,
      mullion: MAT,
      slab: MAT,
      column: MAT,
      roof: MAT,
      groundFloor: MAT,
    },
    siteWidth: 30,
    siteDepth: 20,
    buildingName: "Test Building",
    address: "Seoul",
  };
}

describe("planAuthoringInstances", () => {
  it("does not scatter a sample family set onto the live twin", () => {
    const poses = planAuthoringInstances(makeRecipe());
    expect(poses).toEqual([]);
  });

  it("parks the selected type on a preview pad beside the building", () => {
    const poses = planAuthoringInstances(makeRecipe(), "door-glass-storefront");
    expect(poses).toHaveLength(1);
    expect(poses[0]?.id).toBe("preview:door-glass-storefront");
    expect(poses[0]?.url).toBe("/models/authoring/door-glass-storefront.glb");
    expect(poses[0]?.position[0]).toBeGreaterThan(10);
  });

  it("uses the same pad for walls instead of wrapping the facade", () => {
    const poses = planAuthoringInstances(makeRecipe(), "wall-exterior-brick-on-cmu");
    expect(poses).toHaveLength(1);
    expect(poses[0]?.id).toBe("preview:wall-exterior-brick-on-cmu");
    expect(poses.some((p) => p.id.startsWith("wall:"))).toBe(false);
  });

  it("adds a preview pad pose for furniture and other components", () => {
    const poses = planAuthoringInstances(makeRecipe(), "furniture-desk");
    const preview = poses.find((p) => p.id === "preview:furniture-desk");
    expect(preview?.url).toBe("/models/authoring/furniture-desk.glb");
    expect(preview?.position[0]).toBeGreaterThan(10);
  });
});
