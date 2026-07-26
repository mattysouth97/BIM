// src/lib/cad/doc/__tests__/map-dxf-to-doc.test.ts
import { describe, it, expect } from "vitest";
import { mapDxfTextToDoc } from "../map-dxf-to-doc";
import { makeDxf, LINE_MM } from "./dxf-fixture";
import type { CadArc, CadLine, CadPolyline } from "../types";

describe("mapDxfTextToDoc — core", () => {
  it("maps LINE with mm→m unit scaling", () => {
    const doc = mapDxfTextToDoc(makeDxf({ insunits: 4, entities: LINE_MM }), "d1");
    expect(doc.entities).toHaveLength(1);
    const line = doc.entities[0] as CadLine;
    expect(line.kind).toBe("line");
    expect(line.layer).toBe("WALLS");
    expect(line.a).toEqual({ x: 0, y: 0 });
    expect(line.b.x).toBeCloseTo(1, 9);
    expect(line.b.y).toBeCloseTo(2, 9);
    expect(doc.unitScaleToMeters).toBe(0.001);
  });

  it("maps closed LWPOLYLINE with bulge passthrough", () => {
    const doc = mapDxfTextToDoc(
      makeDxf({
        insunits: 6,
        entities: [
          "0", "LWPOLYLINE", "8", "OUTLINE", "90", "3", "70", "1",
          "10", "0", "20", "0", "42", "0.5",
          "10", "10", "20", "0",
          "10", "10", "20", "8",
        ],
      }),
      "d2",
    );
    const pl = doc.entities[0] as CadPolyline;
    expect(pl.kind).toBe("polyline");
    expect(pl.closed).toBe(true);
    expect(pl.vertices).toHaveLength(3);
    expect(pl.bulges[0]).toBeCloseTo(0.5, 9);
    expect(pl.bulges[1]).toBe(0);
  });

  it("maps ARC (angles already radians from dxf-parser)", () => {
    const doc = mapDxfTextToDoc(
      makeDxf({
        insunits: 6,
        entities: ["0", "ARC", "8", "A", "10", "5", "20", "5", "40", "2", "50", "0", "51", "90"],
      }),
      "d3",
    );
    const arc = doc.entities[0] as CadArc;
    expect(arc.kind).toBe("arc");
    expect(arc.center).toEqual({ x: 5, y: 5 });
    expect(arc.radius).toBe(2);
    expect(arc.startAngle).toBeCloseTo(0, 9);
    expect(arc.endAngle).toBeCloseTo(Math.PI / 2, 9);
  });

  it("extracts layer table colors and computes curve-aware extents", () => {
    const doc = mapDxfTextToDoc(
      makeDxf({
        insunits: 6,
        tables: [
          "0", "TABLE", "2", "LAYER",
          "0", "LAYER", "2", "WALLS", "62", "1",
          "0", "ENDTAB",
        ],
        entities: [
          ...["0", "CIRCLE", "8", "WALLS", "10", "0", "20", "0", "40", "3"],
        ],
      }),
      "d4",
    );
    const walls = doc.layers.find((l) => l.name === "WALLS");
    expect(walls?.colorIndex).toBe(1);
    expect(walls?.visible).toBe(true);
    expect(doc.extents.min.x).toBeCloseTo(-3, 6);
    expect(doc.extents.max.y).toBeCloseTo(3, 6);
  });

  it("counts unmapped entity types in stats.skipped, never throws on garbage", () => {
    const doc = mapDxfTextToDoc(
      makeDxf({ insunits: 6, entities: ["0", "SOLID", "8", "X", "10", "0", "20", "0"] }),
      "d5",
    );
    expect(doc.stats.skipped["SOLID"]).toBe(1);
    const bad = mapDxfTextToDoc("not a dxf at all", "d6");
    expect(bad.entities).toHaveLength(0);
    expect(bad.warnings.length).toBeGreaterThan(0);
  });
});
