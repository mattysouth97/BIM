import { describe, expect, it } from "vitest";
import { STAGE_ORDER } from "../stages";
import { WORKFLOW_DOORS, doorStage } from "../doors";
import { DRAWING_BUILDING_ID, DEMO_BUILDING_ID } from "@/lib/constants";

describe("workflow doors", () => {
  it("maps the demo door to the twin so the first verb shows the building", () => {
    expect(WORKFLOW_DOORS.demo).toBe("twin");
    expect(doorStage("demo")).toBe("twin");
  });

  it("maps the CAD door to upload", () => {
    expect(WORKFLOW_DOORS.cad).toBe("upload");
    expect(doorStage("cad")).toBe("upload");
  });

  it("keeps the CAD door off the demo slug", () => {
    expect(DRAWING_BUILDING_ID).not.toBe(DEMO_BUILDING_ID);
    expect(DRAWING_BUILDING_ID).toBe("drawing");
  });

  it("only promises stages that exist", () => {
    for (const stage of Object.values(WORKFLOW_DOORS)) {
      expect(STAGE_ORDER).toContain(stage);
    }
  });
});
