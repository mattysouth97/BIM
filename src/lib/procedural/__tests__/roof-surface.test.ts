import { describe, expect, it } from "vitest";
import {
  finishedRoofTopY,
  rooftopPvSeatY,
  tiltedBoxClearance,
} from "../roof-surface";

const flat = {
  totalHeight: 9,
  floors: [
    { type: "above", y: 0, height: 3 },
    { type: "above", y: 3, height: 3 },
    { type: "above", y: 6, height: 3 },
  ],
  roof: { type: "flat" as const, flatThickness: 0.15, gableHeight: 0 },
};

describe("finishedRoofTopY", () => {
  it("sits on the last floor plus flat-roof thickness", () => {
    expect(finishedRoofTopY(flat)).toBeCloseTo(9.15, 5);
  });

  it("uses the thicker of totalHeight and the last floor top", () => {
    expect(
      finishedRoofTopY({
        totalHeight: 8,
        floors: [{ type: "above", y: 0, height: 9 }],
        roof: { type: "flat", flatThickness: 0.3, gableHeight: 0 },
      }),
    ).toBeCloseTo(9.3, 5);
  });

  it("clears a gable ridge so a flat array does not cut the slope", () => {
    expect(
      finishedRoofTopY({
        totalHeight: 9,
        floors: [{ type: "above", y: 0, height: 9 }],
        roof: { type: "gable", flatThickness: 0.3, gableHeight: 2.5 },
      }),
    ).toBeCloseTo(11.5, 5);
  });
});

describe("tiltedBoxClearance", () => {
  it("is half-height when the box is not tilted", () => {
    expect(tiltedBoxClearance(0.5, 0.025, 0)).toBeCloseTo(0.025, 5);
  });

  it("drops the trailing edge below the origin on a 15° pitch", () => {
    const lift = tiltedBoxClearance(0.5, 0.025, 0.26);
    expect(lift).toBeGreaterThan(0.12);
    expect(lift).toBeLessThan(0.2);
  });
});

describe("rooftopPvSeatY", () => {
  it("keeps the lowest point of the tilted rack on or above the roof top", () => {
    const seat = rooftopPvSeatY(flat);
    expect(seat.roofTopY).toBeCloseTo(9.15, 5);
    expect(seat.rackY).toBeGreaterThan(seat.roofTopY);
    expect(seat.panelY).toBeGreaterThan(seat.rackY);
    const rackLowest =
      seat.rackY - tiltedBoxClearance(1.04 / 2, 0.16 / 2, 0.26);
    expect(rackLowest).toBeGreaterThanOrEqual(seat.roofTopY - 1e-9);
  });
});
