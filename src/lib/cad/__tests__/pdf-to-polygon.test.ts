import { describe, it, expect } from "vitest";
import { pdfToPolygon } from "../pdf-to-polygon";

describe("pdfToPolygon", () => {
  it("returns null for fewer than 3 points", () => {
    expect(
      pdfToPolygon({ points: [], realWorldWidthMeters: 10 })
    ).toBeNull();
    expect(
      pdfToPolygon({
        points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
        realWorldWidthMeters: 10,
      })
    ).toBeNull();
  });

  it("returns null when real-world width is not positive", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ];
    expect(pdfToPolygon({ points: pts, realWorldWidthMeters: 0 })).toBeNull();
    expect(pdfToPolygon({ points: pts, realWorldWidthMeters: -5 })).toBeNull();
  });

  it("returns null for a degenerate bbox (all points collinear on one axis)", () => {
    const collinear = [
      { x: 0, y: 50 },
      { x: 50, y: 50 },
      { x: 100, y: 50 },
    ];
    expect(
      pdfToPolygon({ points: collinear, realWorldWidthMeters: 10 })
    ).toBeNull();
  });

  it("scales a 100×80 pixel rectangle to a 10×8 m polygon when widthPx=100, realWidth=10", () => {
    const result = pdfToPolygon({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
        { x: 0, y: 80 },
      ],
      realWorldWidthMeters: 10,
    })!;
    expect(result).not.toBeNull();
    expect(result.metersPerPixel).toBeCloseTo(0.1, 6);
    expect(result.areaSqm).toBeCloseTo(80, 3);
  });

  it("centers polygon at bbox origin", () => {
    const result = pdfToPolygon({
      points: [
        { x: 50, y: 50 },
        { x: 150, y: 50 },
        { x: 150, y: 130 },
        { x: 50, y: 130 },
      ],
      realWorldWidthMeters: 10,
    })!;
    const xs = result.polygon.map(([x]) => x);
    const zs = result.polygon.map(([, z]) => z);
    expect(Math.min(...xs)).toBeCloseTo(-5, 6);
    expect(Math.max(...xs)).toBeCloseTo(5, 6);
    expect(Math.min(...zs)).toBeCloseTo(-4, 6);
    expect(Math.max(...zs)).toBeCloseTo(4, 6);
  });

  it("flips canvas Y so world Z grows upward", () => {
    // A point at (50,0) (canvas TOP-LEFT quadrant) should map to +Z (north).
    const result = pdfToPolygon({
      points: [
        { x: 50, y: 0 },
        { x: 150, y: 0 },
        { x: 150, y: 100 },
        { x: 50, y: 100 },
      ],
      realWorldWidthMeters: 10,
    })!;
    // First vertex was top-left in canvas — after Y-flip it becomes +Z max.
    const [, firstZ] = result.polygon[0];
    const [, thirdZ] = result.polygon[2];
    expect(firstZ).toBeGreaterThan(thirdZ);
  });

  it("L-shaped 6-vertex polygon produces 6 world vertices and correct area", () => {
    // Inside a 100×100 pixel box (real-world 10m wide → 1 px = 0.1 m):
    //   L-shape: (0,0) (60,0) (60,60) (100,60) (100,100) (0,100)
    //   Area = full 100×100 minus the (60–100)×(0–60) notch
    //        = 10000 − 2400 = 7600 px² = 76 m²
    const result = pdfToPolygon({
      points: [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 60 },
        { x: 100, y: 60 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      realWorldWidthMeters: 10,
    })!;
    expect(result.polygon).toHaveLength(6);
    expect(result.areaSqm).toBeCloseTo(76, 1);
  });
});

describe("pdfToPolygon — metersPerPixel calibration (two-point ruler)", () => {
  it("accepts metersPerPixel directly and scales the polygon", () => {
    // 100×80 pixel rectangle with metersPerPixel=0.1 → 10×8 m = 80 m²
    const result = pdfToPolygon({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
        { x: 0, y: 80 },
      ],
      metersPerPixel: 0.1,
    })!;
    expect(result).not.toBeNull();
    expect(result.metersPerPixel).toBeCloseTo(0.1, 9);
    expect(result.areaSqm).toBeCloseTo(80, 3);
  });

  it("returns null when metersPerPixel is not positive", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ];
    expect(pdfToPolygon({ points: pts, metersPerPixel: 0 })).toBeNull();
    expect(pdfToPolygon({ points: pts, metersPerPixel: -0.1 })).toBeNull();
  });

  it("centers polygon at bbox origin in the metersPerPixel path", () => {
    const result = pdfToPolygon({
      points: [
        { x: 50, y: 50 },
        { x: 150, y: 50 },
        { x: 150, y: 130 },
        { x: 50, y: 130 },
      ],
      metersPerPixel: 0.1,
    })!;
    const xs = result.polygon.map(([x]) => x);
    const zs = result.polygon.map(([, z]) => z);
    expect(Math.min(...xs)).toBeCloseTo(-5, 6);
    expect(Math.max(...xs)).toBeCloseTo(5, 6);
    expect(Math.min(...zs)).toBeCloseTo(-4, 6);
    expect(Math.max(...zs)).toBeCloseTo(4, 6);
  });
});
