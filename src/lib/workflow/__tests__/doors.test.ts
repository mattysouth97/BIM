import { describe, expect, it } from "vitest";
import { STAGE_ORDER } from "../stages";
import { WORKFLOW_DOORS, doorStage } from "../doors";

describe("workflow doors", () => {
  it("maps the demo door to the twin so the first verb shows the building", () => {
    expect(WORKFLOW_DOORS.demo).toBe("twin");
    expect(doorStage("demo")).toBe("twin");
  });

  it("maps the CAD door to upload", () => {
    expect(WORKFLOW_DOORS.cad).toBe("upload");
    expect(doorStage("cad")).toBe("upload");
  });

  it("only promises stages that exist", () => {
    for (const stage of Object.values(WORKFLOW_DOORS)) {
      expect(STAGE_ORDER).toContain(stage);
    }
  });
});
