import { describe, it, expect } from "vitest";
import {
  AUTHORING_FAMILIES,
  AUTHORING_FAMILY_IDS,
  AUTHORING_TOOLS,
  defaultFamilyForTool,
  familiesForTool,
  familyIdentityLabel,
  getAuthoringFamily,
} from "../family-catalog";

describe("family catalog", () => {
  it("covers every Architecture-tab building tool", () => {
    expect(AUTHORING_TOOLS.map((t) => t.id)).toEqual([
      "wall",
      "door",
      "window",
      "column",
      "beam",
      "foundation",
      "floor",
      "roof",
      "ceiling",
      "stair",
      "railing",
      "lighting",
      "furniture",
      "plumbing",
      "electrical",
      "fire",
      "equipment",
      "planting",
      "site",
    ]);
  });

  it("keeps authored families with unique ids", () => {
    expect(AUTHORING_FAMILIES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(AUTHORING_FAMILY_IDS).size).toBe(AUTHORING_FAMILIES.length);
  });

  it("groups doors and defaults to Generic 910mm", () => {
    expect(familiesForTool("door").map((f) => f.id)).toContain("door-single-flush-910");
    expect(defaultFamilyForTool("door").id).toBe("door-single-flush-910");
    expect(getAuthoringFamily("door-single-flush-910")?.tool).toBe("door");
  });

  it("prints Category : Family : Type identity", () => {
    const door = getAuthoringFamily("door-single-flush-910");
    expect(door).toBeDefined();
    expect(familyIdentityLabel(door!, "en")).toBe(
      "Doors : Single-Flush : Generic 910mm"
    );
  });
});
