import { describe, it, expect } from "vitest";
import { parseDxfText } from "../dxf-parser";

// ---------------------------------------------------------------------------
// Minimal DXF fixture builder
// A valid ASCII DXF is just a series of group-code / value pairs, two lines
// per pair. We build small documents inline so tests stay self-contained.
// ---------------------------------------------------------------------------

/** Quote-safe DXF builder. Each entry is [code, value]. */
function dxf(entries: Array<[number, string | number]>): string {
  const lines: string[] = [];
  for (const [code, value] of entries) {
    lines.push(String(code));
    lines.push(String(value));
  }
  return lines.join("\n") + "\n";
}

interface RectFixtureOpts {
  /** DXF $INSUNITS code: 4=mm, 5=cm, 6=m, 1=in, 2=ft, 0=unitless */
  insUnits: number;
  /** Rectangle width in raw DXF units */
  width: number;
  /** Rectangle height in raw DXF units */
  height: number;
  /** DXF layer name */
  layer: string;
}

function buildRectFixture(opts: RectFixtureOpts): string {
  const { insUnits, width: w, height: h, layer } = opts;
  return dxf([
    [0, "SECTION"], [2, "HEADER"],
    [9, "$INSUNITS"], [70, insUnits],
    [0, "ENDSEC"],
    [0, "SECTION"], [2, "ENTITIES"],
    [0, "LWPOLYLINE"],
    [8, layer],
    [90, 4],   // vertex count
    [70, 1],   // flag: bit 1 = closed
    [10, 0], [20, 0],
    [10, w], [20, 0],
    [10, w], [20, h],
    [10, 0], [20, h],
    [0, "ENDSEC"],
    [0, "EOF"],
  ]);
}

function buildMultiLayerFixture(): string {
  // Three closed LWPOLYLINE rectangles on three layers with different sizes
  // so the parser must sort by area.
  return dxf([
    [0, "SECTION"], [2, "HEADER"],
    [9, "$INSUNITS"], [70, 6], // meters
    [0, "ENDSEC"],
    [0, "SECTION"], [2, "ENTITIES"],
    // Largest — 30m × 20m = 600 m²
    [0, "LWPOLYLINE"],
    [8, "OUTLINE"],
    [90, 4], [70, 1],
    [10, 0],   [20, 0],
    [10, 30],  [20, 0],
    [10, 30],  [20, 20],
    [10, 0],   [20, 20],
    // Medium — 15m × 10m = 150 m²
    [0, "LWPOLYLINE"],
    [8, "INNER"],
    [90, 4], [70, 1],
    [10, 50],  [20, 50],
    [10, 65],  [20, 50],
    [10, 65],  [20, 60],
    [10, 50],  [20, 60],
    // Smallest — 5m × 4m = 20 m²
    [0, "LWPOLYLINE"],
    [8, "CORE"],
    [90, 4], [70, 1],
    [10, 100], [20, 100],
    [10, 105], [20, 100],
    [10, 105], [20, 104],
    [10, 100], [20, 104],
    [0, "ENDSEC"],
    [0, "EOF"],
  ]);
}

function buildOpenPolylineFixture(): string {
  // Same shape as buildRectFixture but flag=0 (open) — must be filtered out.
  return dxf([
    [0, "SECTION"], [2, "HEADER"],
    [9, "$INSUNITS"], [70, 6],
    [0, "ENDSEC"],
    [0, "SECTION"], [2, "ENTITIES"],
    [0, "LWPOLYLINE"],
    [8, "OPEN"],
    [90, 4], [70, 0],
    [10, 0], [20, 0],
    [10, 10], [20, 0],
    [10, 10], [20, 10],
    [10, 0], [20, 10],
    [0, "ENDSEC"],
    [0, "EOF"],
  ]);
}

function buildEmptyDxf(): string {
  return dxf([
    [0, "SECTION"], [2, "HEADER"], [0, "ENDSEC"],
    [0, "SECTION"], [2, "ENTITIES"], [0, "ENDSEC"],
    [0, "EOF"],
  ]);
}

function buildTinyShapeFixture(): string {
  // 2m × 2m rectangle = 4 m² — below MIN_AREA_SQM (10), should be filtered.
  return dxf([
    [0, "SECTION"], [2, "HEADER"],
    [9, "$INSUNITS"], [70, 6],
    [0, "ENDSEC"],
    [0, "SECTION"], [2, "ENTITIES"],
    [0, "LWPOLYLINE"],
    [8, "TINY"],
    [90, 4], [70, 1],
    [10, 0], [20, 0],
    [10, 2], [20, 0],
    [10, 2], [20, 2],
    [10, 0], [20, 2],
    [0, "ENDSEC"],
    [0, "EOF"],
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseDxfText — unit conversion", () => {
  it("mm rectangle 10000×8000 yields one candidate at 80 m²", () => {
    const text = buildRectFixture({
      insUnits: 4,
      width: 10000,
      height: 8000,
      layer: "FOOTPRINT",
    });
    const result = parseDxfText(text);
    expect(result.unitScaleToMeters).toBe(0.001);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].areaSqm).toBeCloseTo(80, 3);
    expect(result.candidates[0].layer).toBe("FOOTPRINT");
    expect(result.candidates[0].vertexCount).toBe(4);
  });

  it("cm rectangle 1000×800 yields 80 m²", () => {
    const text = buildRectFixture({
      insUnits: 5,
      width: 1000,
      height: 800,
      layer: "A",
    });
    const result = parseDxfText(text);
    expect(result.unitScaleToMeters).toBe(0.01);
    expect(result.candidates[0].areaSqm).toBeCloseTo(80, 3);
  });

  it("meter rectangle 10×8 yields 80 m²", () => {
    const text = buildRectFixture({
      insUnits: 6,
      width: 10,
      height: 8,
      layer: "A",
    });
    const result = parseDxfText(text);
    expect(result.unitScaleToMeters).toBe(1);
    expect(result.candidates[0].areaSqm).toBeCloseTo(80, 3);
  });

  it("inches rectangle 393.7×314.96 yields ~80 m²", () => {
    // 393.7 in × 0.0254 m/in = 10.000 m ; 314.96 in × 0.0254 = 8.000 m
    const text = buildRectFixture({
      insUnits: 1,
      width: 393.7,
      height: 314.96,
      layer: "A",
    });
    const result = parseDxfText(text);
    expect(result.unitScaleToMeters).toBe(0.0254);
    expect(result.candidates[0].areaSqm).toBeCloseTo(80, 0);
  });

  it("feet rectangle 32.808×26.247 yields ~80 m²", () => {
    // 32.808 ft × 0.3048 m/ft = 10.000 m ; 26.247 ft × 0.3048 = 8.000 m
    const text = buildRectFixture({
      insUnits: 2,
      width: 32.808,
      height: 26.247,
      layer: "A",
    });
    const result = parseDxfText(text);
    expect(result.unitScaleToMeters).toBe(0.3048);
    expect(result.candidates[0].areaSqm).toBeCloseTo(80, 0);
  });

  it("unitless DXF emits a warning and assumes meters", () => {
    const text = buildRectFixture({
      insUnits: 0,
      width: 10,
      height: 8,
      layer: "A",
    });
    const result = parseDxfText(text);
    expect(result.unitScaleToMeters).toBe(1);
    expect(result.warnings.some((w) => w.includes("Unitless"))).toBe(true);
    expect(result.candidates[0].areaSqm).toBeCloseTo(80, 3);
  });
});

describe("parseDxfText — candidate ranking", () => {
  it("sorts multiple closed polylines by area descending", () => {
    const text = buildMultiLayerFixture();
    const result = parseDxfText(text);
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0].layer).toBe("OUTLINE");
    expect(result.candidates[0].areaSqm).toBeCloseTo(600, 3);
    expect(result.candidates[1].layer).toBe("INNER");
    expect(result.candidates[1].areaSqm).toBeCloseTo(150, 3);
    expect(result.candidates[2].layer).toBe("CORE");
    expect(result.candidates[2].areaSqm).toBeCloseTo(20, 3);
  });
});

describe("parseDxfText — geometry conventions", () => {
  it("polygons are centered at bbox origin", () => {
    const text = buildRectFixture({
      insUnits: 6,
      width: 10,
      height: 8,
      layer: "A",
    });
    const result = parseDxfText(text);
    const poly = result.candidates[0].polygon;
    // Rectangle from (0,0) to (10,8) centers at (5,4), so ring coords become
    // (-5,-4), (5,-4), (5,4), (-5,4).
    const xs = poly.map(([x]) => x);
    const ys = poly.map(([, y]) => y);
    expect(Math.min(...xs)).toBeCloseTo(-5, 6);
    expect(Math.max(...xs)).toBeCloseTo(5, 6);
    expect(Math.min(...ys)).toBeCloseTo(-4, 6);
    expect(Math.max(...ys)).toBeCloseTo(4, 6);
  });

  it("returns [x, z] tuples (DXF Y mapped to world Z)", () => {
    const text = buildRectFixture({
      insUnits: 6,
      width: 10,
      height: 8,
      layer: "A",
    });
    const result = parseDxfText(text);
    const poly = result.candidates[0].polygon;
    for (const p of poly) {
      expect(p).toHaveLength(2);
      expect(typeof p[0]).toBe("number");
      expect(typeof p[1]).toBe("number");
    }
  });
});

describe("parseDxfText — edge cases", () => {
  it("empty DXF yields no candidates", () => {
    const text = buildEmptyDxf();
    const result = parseDxfText(text);
    expect(result.candidates).toEqual([]);
  });

  it("open LWPOLYLINE is filtered out", () => {
    const text = buildOpenPolylineFixture();
    const result = parseDxfText(text);
    expect(result.candidates).toEqual([]);
  });

  it("sub-10 m² polylines are filtered as noise", () => {
    const text = buildTinyShapeFixture();
    const result = parseDxfText(text);
    expect(result.candidates).toEqual([]);
  });

  it("malformed DXF returns empty candidates with a warning (no throw)", () => {
    const result = parseDxfText("garbage\nthat\nis\nnot\nDXF");
    expect(result.candidates).toEqual([]);
    // Either a parse warning or silently returned null DXF handling — accept either.
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("parseDxfText — BIM_OUTLINE layer priority", () => {
  function buildBimOutlinePriorityFixture(outlineLayerName: string): string {
    // Two closed LWPOLYLINE rectangles — the BIM_OUTLINE one is SMALLER so
    // area-ranking alone would pick the other. BIM_OUTLINE must still win.
    return dxf([
      [0, "SECTION"], [2, "HEADER"],
      [9, "$INSUNITS"], [70, 6], // meters
      [0, "ENDSEC"],
      [0, "SECTION"], [2, "ENTITIES"],
      // Larger ring on a non-BIM layer (40 × 30 = 1200 m²)
      [0, "LWPOLYLINE"],
      [8, "RANDOM"],
      [90, 4], [70, 1],
      [10, 0],  [20, 0],
      [10, 40], [20, 0],
      [10, 40], [20, 30],
      [10, 0],  [20, 30],
      // BIM_OUTLINE ring (15 × 10 = 150 m² — smaller than the decoy)
      [0, "LWPOLYLINE"],
      [8, outlineLayerName],
      [90, 4], [70, 1],
      [10, 100], [20, 100],
      [10, 115], [20, 100],
      [10, 115], [20, 110],
      [10, 100], [20, 110],
      [0, "ENDSEC"],
      [0, "EOF"],
    ]);
  }

  it("ranks BIM_OUTLINE first even when another ring has a larger area", () => {
    const text = buildBimOutlinePriorityFixture("BIM_OUTLINE");
    const result = parseDxfText(text);
    expect(result.candidates[0].layer).toBe("BIM_OUTLINE");
    expect(result.candidates[0].areaSqm).toBeCloseTo(150, 3);
    expect(result.candidates[1].layer).toBe("RANDOM");
  });

  it("matches BIM_OUTLINE case-insensitively", () => {
    const text = buildBimOutlinePriorityFixture("bim_outline");
    const result = parseDxfText(text);
    expect(result.candidates[0].layer.toLowerCase()).toBe("bim_outline");
  });

  it("also matches hyphenated BIM-OUTLINE", () => {
    const text = buildBimOutlinePriorityFixture("BIM-OUTLINE");
    const result = parseDxfText(text);
    expect(result.candidates[0].layer).toBe("BIM-OUTLINE");
  });

  it("falls back to area ranking when BIM_OUTLINE layer is absent", () => {
    const text = buildBimOutlinePriorityFixture("FOOTPRINT");
    const result = parseDxfText(text);
    // RANDOM (1200 m²) is larger than FOOTPRINT (150 m²) and should win.
    expect(result.candidates[0].layer).toBe("RANDOM");
  });

  it("rejects under-threshold BIM_OUTLINE rings like any other (no special bypass)", () => {
    // A 2×2 BIM_OUTLINE ring = 4 m², below MIN_AREA_SQM=10, must be filtered.
    const text = dxf([
      [0, "SECTION"], [2, "HEADER"],
      [9, "$INSUNITS"], [70, 6],
      [0, "ENDSEC"],
      [0, "SECTION"], [2, "ENTITIES"],
      [0, "LWPOLYLINE"],
      [8, "BIM_OUTLINE"],
      [90, 4], [70, 1],
      [10, 0], [20, 0],
      [10, 2], [20, 0],
      [10, 2], [20, 2],
      [10, 0], [20, 2],
      [0, "ENDSEC"],
      [0, "EOF"],
    ]);
    const result = parseDxfText(text);
    expect(result.candidates).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Shipped QA fixture — docs/samples/sample-footprint.dxf must always parse.
// ---------------------------------------------------------------------------

describe("docs/samples/sample-footprint.dxf", () => {
  it("parses to a single 20×12m BIM_OUTLINE candidate", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const text = await readFile(
      join(process.cwd(), "docs", "samples", "sample-footprint.dxf"),
      "utf8",
    );
    const result = parseDxfText(text);
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.layer).toBe("BIM_OUTLINE");
    expect(candidate.areaSqm).toBeCloseTo(240, 0);
  });
});
