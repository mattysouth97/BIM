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
  it("instances columns, a door, windows, roof MEP, and lights from slot GLBs", () => {
    const poses = planAuthoringInstances(makeRecipe());
    expect(poses.some((p) => p.id.startsWith("col:"))).toBe(true);
    expect(poses.some((p) => p.id === "door:entry")).toBe(true);
    expect(poses.filter((p) => p.id.startsWith("win:")).length).toBeGreaterThan(0);
    expect(poses.map((p) => p.id)).toEqual(
      expect.arrayContaining(["mep:chiller", "mep:boiler", "mep:dhw", "mep:ahu"])
    );
    expect(poses.every((p) => p.url.endsWith(".glb"))).toBe(true);
  });

  it("adds a preview pad pose for a selected library family", () => {
    const poses = planAuthoringInstances(makeRecipe(), "door-single-flush-910");
    const preview = poses.find((p) => p.id === "preview:door-single-flush-910");
    expect(preview?.url).toBe("/models/authoring/door-single-flush-910.glb");
    expect(preview?.position[0]).toBeGreaterThan(10);
  });
});
