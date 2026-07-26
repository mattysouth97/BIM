// src/lib/cad/doc/__tests__/map-dxf-extended.test.ts
import { describe, it, expect } from "vitest";
import { mapDxfTextToDoc, stripMtextCodes } from "../map-dxf-to-doc";
import { makeDxf } from "./dxf-fixture";
import type { CadLine, CadText } from "../types";

describe("mapDxfTextToDoc — extended", () => {
  it("maps TEXT with height/rotation (degrees→radians)", () => {
    const doc = mapDxfTextToDoc(
      makeDxf({
        insunits: 4,
        entities: [
          "0", "TEXT", "8", "NOTES", "10", "500", "20", "500",
          "40", "250", "50", "90", "1", "Room 101",
        ],
      }),
      "t1",
    );
    const txt = doc.entities[0] as CadText;
    expect(txt.kind).toBe("text");
    expect(txt.text).toBe("Room 101");
    expect(txt.height).toBeCloseTo(0.25, 9);
    expect(txt.rotation).toBeCloseTo(Math.PI / 2, 6);
    expect(txt.position.x).toBeCloseTo(0.5, 9);
  });

  it("flattens INSERT with translation + rotation and tags fromBlock", () => {
    const doc = mapDxfTextToDoc(
      makeDxf({
        insunits: 6,
        blocks: [
          "0", "BLOCK", "8", "0", "2", "DOOR", "10", "0", "20", "0",
          "0", "LINE", "8", "DOORS", "10", "0", "20", "0", "11", "1", "21", "0",
          "0", "ENDBLK",
        ],
        entities: [
          "0", "INSERT", "8", "DOORS", "2", "DOOR",
          "10", "5", "20", "5", "50", "90",
        ],
      }),
      "t2",
    );
    expect(doc.entities).toHaveLength(1);
    const line = doc.entities[0] as CadLine;
    expect(line.kind).toBe("line");
    expect(line.fromBlock).toBe("DOOR");
    expect(line.a.x).toBeCloseTo(5, 6);
    expect(line.a.y).toBeCloseTo(5, 6);
    // (1,0) rotated 90° CCW → (0,1), translated → (5,6)
    expect(line.b.x).toBeCloseTo(5, 6);
    expect(line.b.y).toBeCloseTo(6, 6);
  });

  it("maps SPLINE as control-point polyline approximation", () => {
    const doc = mapDxfTextToDoc(
      makeDxf({
        insunits: 6,
        entities: [
          "0", "SPLINE", "8", "S", "70", "8", "71", "3", "73", "4",
          "10", "0", "20", "0", "10", "1", "20", "2", "10", "2", "20", "2", "10", "3", "20", "0",
        ],
      }),
      "t3",
    );
    expect(doc.entities).toHaveLength(1);
    expect(doc.entities[0].kind).toBe("polyline");
    expect(doc.warnings.some((w) => w.includes("SPLINE"))).toBe(true);
  });

  it("skips DIMENSION without a resolvable block, counts it", () => {
    const doc = mapDxfTextToDoc(
      makeDxf({
        insunits: 6,
        entities: ["0", "DIMENSION", "8", "DIMS", "2", "*D99", "10", "0", "20", "0"],
      }),
      "t4",
    );
    expect(doc.entities).toHaveLength(0);
    expect(doc.stats.skipped["DIMENSION"]).toBe(1);
  });
});

describe("stripMtextCodes", () => {
  it("converts \\P to newline and strips format groups", () => {
    expect(stripMtextCodes("Line1\\PLine2")).toBe("Line1\nLine2");
    expect(stripMtextCodes("{\\fArial|b0;Hello} World")).toBe("Hello World");
    expect(stripMtextCodes("\\H2.5x;Tall")).toBe("Tall");
  });
});
