// src/lib/campus/campus-scene.ts — P2-28
// campus-scene passes measuredHeightM through to generateBuildingGeometry
// so campus heights use the ledger → measured → era chain.

import { describe, it, expect, vi } from "vitest";

// We stub generateBuildingGeometry to capture the opts arg
vi.mock("@/lib/building-geometry", () => ({
  generateBuildingGeometry: vi.fn().mockReturnValue({
    totalHeight: 30,
    aboveGroundFloors: 10,
    belowGroundFloors: 0,
    floorHeight: 3,
    basementFloorHeight: 3,
    buildingFootprint: 100,
    siteFootprint: 200,
    windowRatio: 0.3,
    era: "modern",
    useCategory: "office",
    floorGeometries: [],
    roofType: "flat",
    strctCd: "11",
    mainPurpsCd: "14000",
  }),
  toRecipe: vi.fn().mockReturnValue({ era: "modern" }),
}));

// Also stub THREE (campus-scene imports it for Vector3/Vector2)
vi.mock("three", () => {
  class Vector3 {
    x: number; y: number; z: number;
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  }
  class Vector2 {
    x: number; y: number;
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  }
  return { Vector3, Vector2 };
});

import { getCampusBuildingConfigs } from "../campus-scene";
import { generateBuildingGeometry } from "@/lib/building-geometry";
import type { SiteLayout } from "../site-layout";
import * as THREE from "three";

function makeLayout(measuredHeightM: number | undefined): SiteLayout {
  return {
    buildings: [
      {
        building: {
          building: {
            // Minimal BrTitleInfo — only fields used by generateBuildingGeometry
            mgmBldrgstPk: "pk-001",
            sigunguCd: "11010",
            bjdongCd: "1000000000",
            platGbCd: "0",
            bun: "0001",
            ji: "0000",
            mainPurpsCd: "14000",
            strctCd: "11",
            grndFlrCnt: "10",
            ugrndFlrCnt: "0",
            heit: "0",        // ledger height absent → measuredHeightM should fill in
            archArea: "500",
            platArea: "1000",
            pmsDay: "20100101",
            roofCd: "1",
          } as never,
          footprint: undefined,
          position: undefined,
          measuredHeightM,   // the new field on CampusBuilding
        },
        position: new THREE.Vector3(0, 0, 0),
        footprintVertices: undefined,
      },
    ],
    extents: { width: 100, depth: 100 },
    center: new THREE.Vector3(0, 0, 0),
  };
}

describe("getCampusBuildingConfigs — measuredHeightM passthrough (P2-28)", () => {
  it("passes measuredHeightM to generateBuildingGeometry when present", () => {
    const layout = makeLayout(43.5);
    getCampusBuildingConfigs(layout);

    expect(generateBuildingGeometry).toHaveBeenCalledWith(
      expect.anything(),   // title
      [],                  // floors (campus uses title-level only)
      { measuredHeightM: 43.5 }
    );
  });

  it("passes measuredHeightM: undefined to generateBuildingGeometry when absent", () => {
    const layout = makeLayout(undefined);
    getCampusBuildingConfigs(layout);

    // opts is either omitted or { measuredHeightM: undefined }
    const calls = vi.mocked(generateBuildingGeometry).mock.calls;
    const lastCall = calls[calls.length - 1];
    const opts = lastCall?.[2];
    // measuredHeightM must not be a positive number (undefined or null)
    expect(opts?.measuredHeightM == null || typeof opts?.measuredHeightM !== "number").toBe(true);
  });

  it("returns a config for each building in the layout", () => {
    const layout = makeLayout(20);
    const configs = getCampusBuildingConfigs(layout);
    expect(configs).toHaveLength(1);
    expect(configs[0].key).toBe("pk-001");
  });
});
