import { describe, it, expect } from "vitest";
import { createDefaultGxSheet } from "../default-sheet";
import type { ViewDefinition } from "@/lib/bim/views/view-definition";

const views: ViewDefinition[] = [
  {
    id: "plan-1",
    name: "Plan — 1F",
    kind: "plan",
    cameraState: {
      kind: "ortho",
      position: [0, 10, 0],
      target: [0, 1, 0],
      zoom: 12,
      near: 0.1,
      far: 100,
    },
    levelElevation: 0,
    levelHeight: 3.5,
    levelId: "1",
  },
  {
    id: "elev-front",
    name: "South Elevation",
    kind: "elevation",
    side: "front",
    cameraState: {
      kind: "ortho",
      position: [0, 5, 20],
      target: [0, 5, 0],
      zoom: 10,
      near: 0.1,
      far: 80,
    },
  },
];

describe("createDefaultGxSheet", () => {
  it("creates an A3 landscape sheet with plan, elevation, and schedule viewports", () => {
    const sheet = createDefaultGxSheet({
      buildingName: "Test Hall",
      views,
      locale: "ko",
    });
    expect(sheet.pageSize).toBe("A3");
    expect(sheet.orientation).toBe("landscape");
    expect(sheet.viewports).toHaveLength(3);
    expect(sheet.viewports.filter((v) => v.kind === "view")).toHaveLength(2);
    expect(sheet.viewports.some((v) => v.kind === "schedule")).toBe(true);
    expect(sheet.titleBlock.buildingName).toBe("Test Hall");
    expect(sheet.titleBlock.sheetNumber).toBe("A-001");
    expect(sheet.titleBlock.locale).toBe("ko");
  });
});
