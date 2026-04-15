import { describe, it, expect } from "vitest";
import {
  dxfResult,
  dwgResult,
  pdfResult,
  type FootprintIngestResult,
} from "../ingest-result";

const samplePolygon: [number, number][] = [
  [-5, -4],
  [5, -4],
  [5, 4],
  [-5, 4],
];

describe("ingest-result builders", () => {
  it("dxfResult sets source=dxf, confidence=exact, preserves layer + warnings", () => {
    const result: FootprintIngestResult = dxfResult({
      polygon: samplePolygon,
      areaSqm: 80,
      layer: "FOOTPRINT",
      warnings: ["something"],
    });
    expect(result.source).toBe("dxf");
    expect(result.confidence).toBe("exact");
    expect(result.layer).toBe("FOOTPRINT");
    expect(result.polygon).toBe(samplePolygon);
    expect(result.areaSqm).toBe(80);
    expect(result.warnings).toEqual(["something"]);
  });

  it("dwgResult sets source=dwg, confidence=converted, uses DXF layer when present", () => {
    const result = dwgResult({
      polygon: samplePolygon,
      areaSqm: 80,
      layer: "OUTLINE",
      warnings: [],
    });
    expect(result.source).toBe("dwg");
    expect(result.confidence).toBe("converted");
    expect(result.layer).toBe("OUTLINE");
  });

  it("dwgResult falls back to 'dwg-converted' when no DXF layer is available", () => {
    const result = dwgResult({
      polygon: samplePolygon,
      areaSqm: 80,
      layer: null,
      warnings: [],
    });
    expect(result.layer).toBe("dwg-converted");
  });

  it("pdfResult sets source=pdf, confidence=traced, layer=pdf-trace", () => {
    const result = pdfResult({
      polygon: samplePolygon,
      areaSqm: 80,
      warnings: [],
    });
    expect(result.source).toBe("pdf");
    expect(result.confidence).toBe("traced");
    expect(result.layer).toBe("pdf-trace");
  });

  it("all builders default warnings to [] when omitted", () => {
    expect(dxfResult({ polygon: samplePolygon, areaSqm: 80, layer: "A" }).warnings).toEqual([]);
    expect(dwgResult({ polygon: samplePolygon, areaSqm: 80, layer: null }).warnings).toEqual([]);
    expect(pdfResult({ polygon: samplePolygon, areaSqm: 80 }).warnings).toEqual([]);
  });
});
