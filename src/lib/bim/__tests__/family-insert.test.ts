import { describe, expect, it } from "vitest";
import { familySillLocalY, hostedInsertY } from "../family-insert";

describe("familySillLocalY after LOD3 rebuild", () => {
  it("keeps course-kit windows centred on the opening", () => {
    expect(familySillLocalY("window-fixed-1200x1500")).toBeCloseTo(-0.75, 1);
    expect(familySillLocalY("window-casement-900x1200")).toBeCloseTo(-0.6, 1);
  });

  it("treats rebuilt LOD3 windows as sill-origin (head at +height)", () => {
    expect(familySillLocalY("window-double-hung-900x1500")).toBe(0);
    expect(familySillLocalY("window-louvre-1200x1200")).toBe(0);
    expect(familySillLocalY("window-double-casement-1500x1200")).toBe(0);
    expect(familySillLocalY("window-industrial-1800x900")).toBe(0);
  });

  it("keeps doors on the floor", () => {
    expect(familySillLocalY("door-sliding-1800")).toBe(0);
    expect(familySillLocalY("door-fire-single-900")).toBe(0);
  });
});

describe("hostedInsertY", () => {
  it("lifts a course-kit window to opening centre", () => {
    expect(
      hostedInsertY({
        typeId: "window-fixed-1200x1500",
        kind: "window",
        levelElevation: 4,
        sillHeightMm: 900,
      }),
    ).toBeCloseTo(4 + 0.9 + 0.75, 1);
  });

  it("sits a rebuilt LOD3 window on the sill, not the floor", () => {
    expect(
      hostedInsertY({
        typeId: "window-double-hung-900x1500",
        kind: "window",
        levelElevation: 4,
        sillHeightMm: 900,
      }),
    ).toBeCloseTo(4.9, 5);
  });

  it("leaves doors on the level", () => {
    expect(
      hostedInsertY({
        typeId: "door-sliding-1800",
        kind: "door",
        levelElevation: 4,
      }),
    ).toBeCloseTo(4, 5);
  });
});
