// src/lib/cad/__tests__/accuracy-routing.test.ts
// P2-13 WP2 — explicit accuracy-path routing: IFC → DXF → VWorld → procedural
// Routing recorded in ingest provenance; badge reads it.

import { describe, it, expect } from "vitest";
import {
  ifcResult,
  dxfResult,
  dwgResult,
  pdfResult,
  resolveAccuracyPath,
  type FootprintIngestResult,
} from "../ingest-result";

// ─────────────────────────────────────────────────────────────────────────────
// WP2-A: ifcResult constructor
// ─────────────────────────────────────────────────────────────────────────────

describe("ifcResult — IFC ingest provenance", () => {
  it("source is 'ifc', confidence is 'measured'", () => {
    const r = ifcResult({ polygon: [[0, 0], [1, 0], [1, 1]], areaSqm: 1 });
    expect(r.source).toBe("ifc");
    expect(r.confidence).toBe("measured");
  });

  it("includes polygon and areaSqm", () => {
    const poly: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const r = ifcResult({ polygon: poly, areaSqm: 100 });
    expect(r.polygon).toEqual(poly);
    expect(r.areaSqm).toBe(100);
  });

  it("layer defaults to 'ifc-measured'", () => {
    const r = ifcResult({ polygon: [[0, 0], [1, 0], [1, 1]], areaSqm: 1 });
    expect(r.layer).toBe("ifc-measured");
  });

  it("warnings array is always defined (empty by default)", () => {
    const r = ifcResult({ polygon: [[0, 0], [1, 0], [1, 1]], areaSqm: 1 });
    expect(Array.isArray(r.warnings)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WP2-B: resolveAccuracyPath — precedence routing IFC > DXF/DWG > PDF > procedural
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveAccuracyPath — explicit precedence routing", () => {
  const ifcIngested: FootprintIngestResult = {
    polygon: [[0, 0], [5, 0], [5, 5]],
    areaSqm: 12.5,
    source: "ifc",
    confidence: "measured",
    layer: "ifc-measured",
    warnings: [],
  };
  const dxfIngested: FootprintIngestResult = {
    polygon: [[0, 0], [4, 0], [4, 4]],
    areaSqm: 16,
    source: "dxf",
    confidence: "exact",
    layer: "outline",
    warnings: [],
  };
  const pdfIngested: FootprintIngestResult = {
    polygon: [[0, 0], [3, 0], [3, 3]],
    areaSqm: 9,
    source: "pdf",
    confidence: "traced",
    layer: "pdf-trace",
    warnings: [],
  };

  it("IFC beats DXF when both present", () => {
    const result = resolveAccuracyPath([ifcIngested, dxfIngested]);
    expect(result.source).toBe("ifc");
  });

  it("IFC beats PDF when both present", () => {
    const result = resolveAccuracyPath([pdfIngested, ifcIngested]);
    expect(result.source).toBe("ifc");
  });

  it("DXF beats PDF when IFC not present", () => {
    const result = resolveAccuracyPath([pdfIngested, dxfIngested]);
    expect(result.source).toBe("dxf");
  });

  it("single IFC result selected directly", () => {
    const result = resolveAccuracyPath([ifcIngested]);
    expect(result.source).toBe("ifc");
    expect(result.confidence).toBe("measured");
  });

  it("returns null for empty array (no ingest results → procedural path)", () => {
    const result = resolveAccuracyPath([]);
    expect(result).toBeNull();
  });

  it("DWG (converted) selected over PDF (traced)", () => {
    const dwgIngested: FootprintIngestResult = {
      polygon: [[0, 0], [6, 0], [6, 6]],
      areaSqm: 36,
      source: "dwg",
      confidence: "converted",
      layer: "dwg-converted",
      warnings: [],
    };
    const result = resolveAccuracyPath([pdfIngested, dwgIngested]);
    expect(result!.source).toBe("dwg");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WP2-C: existing constructors not regressed
// ─────────────────────────────────────────────────────────────────────────────

describe("existing ingest result constructors not regressed", () => {
  it("dxfResult still produces source=dxf, confidence=exact", () => {
    const r = dxfResult({
      polygon: [[0, 0], [1, 0], [1, 1]],
      areaSqm: 0.5,
      layer: "outline",
    });
    expect(r.source).toBe("dxf");
    expect(r.confidence).toBe("exact");
  });

  it("dwgResult still produces source=dwg, confidence=converted", () => {
    const r = dwgResult({
      polygon: [[0, 0], [1, 0], [1, 1]],
      areaSqm: 0.5,
      layer: null,
    });
    expect(r.source).toBe("dwg");
    expect(r.confidence).toBe("converted");
  });

  it("pdfResult still produces source=pdf, confidence=traced", () => {
    const r = pdfResult({
      polygon: [[0, 0], [1, 0], [1, 1]],
      areaSqm: 0.5,
    });
    expect(r.source).toBe("pdf");
    expect(r.confidence).toBe("traced");
  });
});
