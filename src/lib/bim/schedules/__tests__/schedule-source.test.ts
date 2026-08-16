import { describe, it, expect } from "vitest";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { PBRMaterialConfig } from "@/lib/pbr-materials";
import {
  collectScheduleElements,
  elementsForCategory,
  runBuildingSchedule,
} from "../schedule-source";
import { wallSchedule, windowDoorSchedule } from "../schedule-definitions";

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
      windowSpacing: 2.4,
      windowRatio: 0.35,
      mullionDepth: 0.08,
      mullionWidth: 0.06,
      glassInset: 0.05,
      solidPanelChance: 0.2,
      parapetHeight: 1,
      cornerInset: 0,
    },
    slab: { thickness: 0.2, overhang: 0.1 },
    column: { spacing: 6, size: 0.5, inset: 0.3 },
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

describe("collectScheduleElements", () => {
  it("emits four walls per floor", () => {
    const bag = collectScheduleElements("PK-1", makeRecipe());
    expect(bag.walls).toHaveLength(8);
    expect(bag.walls[0].thickness).toBe(0.2);
    expect(bag.walls[0].length).toBe(20);
  });

  it("adds windows per floor and one ground-floor door", () => {
    const bag = collectScheduleElements("PK-1", makeRecipe());
    expect(bag.openings.filter((o) => o.type === "window")).toHaveLength(2);
    expect(bag.openings.filter((o) => o.type === "door")).toHaveLength(1);
  });

  it("emits one room per floor and plant MEP", () => {
    const bag = collectScheduleElements("PK-1", makeRecipe());
    expect(bag.rooms).toHaveLength(2);
    expect(bag.mep.map((m) => m.equipmentType)).toEqual(
      expect.arrayContaining(["chiller", "boiler", "ahu", "dhw"])
    );
  });
});

describe("runBuildingSchedule", () => {
  it("runs the wall schedule against derived walls", () => {
    const bag = collectScheduleElements("PK-1", makeRecipe());
    const result = runBuildingSchedule(wallSchedule, bag);
    expect(result.rowCount).toBe(8);
    expect(result.rows[0]).toHaveProperty("thickness");
  });

  it("filters window-only rows for the window/door schedule", () => {
    const bag = collectScheduleElements("PK-1", makeRecipe());
    expect(elementsForCategory(bag, "window")).toHaveLength(2);
    const result = runBuildingSchedule(windowDoorSchedule, bag);
    expect(result.rowCount).toBe(2);
  });
});
