import { describe, it, expect } from "vitest";
import { loadCalibration, resolveBuildingId } from "../building-calibration-loader";

describe("loadCalibration", () => {
  it("returns null for an unknown buildingId", () => {
    expect(loadCalibration("does-not-exist")).toBeNull();
  });

  it("returns a parsed calibration for a registered buildingId", () => {
    const calibration = loadCalibration("_test-fixture");
    expect(calibration).not.toBeNull();
    expect(calibration?.buildingId).toBe("_test-fixture");
    expect(calibration?.geometricLOD).toBe("L3");
    expect(calibration?.overrides).toHaveLength(1);
    expect(calibration?.overrides[0]).toMatchObject({
      field: "walls.uValue",
      inferredValue: 0.47,
      overrideValue: 0.28,
      source: "permit-drawing-A3 sheet 4 insulation schedule",
    });
  });
});

describe("resolveBuildingId", () => {
  it("defaults buildingId to the PNU", () => {
    expect(resolveBuildingId("1111010100100010000")).toBe("1111010100100010000");
  });
});
