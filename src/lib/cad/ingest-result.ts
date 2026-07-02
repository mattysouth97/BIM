// src/lib/cad/ingest-result.ts
// Shared output contract for all CAD ingest paths (DXF, DWG, PDF).
// Downstream code reads `source` + `confidence` to reason about reliability
// without caring which parser produced the polygon.

import type { Polygon2D } from "./dxf-parser";

export type IngestSource = "dxf" | "dwg" | "pdf";
export type IngestConfidence = "exact" | "converted" | "traced";

export interface FootprintIngestResult {
  polygon: Polygon2D;
  areaSqm: number;
  source: IngestSource;
  confidence: IngestConfidence;
  /** DXF layer name, or a synthetic tag for non-DXF sources. */
  layer: string;
  warnings: string[];
}

interface DxfInput {
  polygon: Polygon2D;
  areaSqm: number;
  layer: string;
  warnings?: string[];
}

interface DwgInput {
  polygon: Polygon2D;
  areaSqm: number;
  /** DXF layer name from the converted DXF, or `null` if unavailable. */
  layer: string | null;
  warnings?: string[];
}

interface PdfInput {
  polygon: Polygon2D;
  areaSqm: number;
  warnings?: string[];
}

export function dxfResult(input: DxfInput): FootprintIngestResult {
  return {
    polygon: input.polygon,
    areaSqm: input.areaSqm,
    source: "dxf",
    confidence: "exact",
    layer: input.layer,
    warnings: input.warnings ?? [],
  };
}

export function dwgResult(input: DwgInput): FootprintIngestResult {
  return {
    polygon: input.polygon,
    areaSqm: input.areaSqm,
    source: "dwg",
    confidence: "converted",
    layer: input.layer ?? "dwg-converted",
    warnings: input.warnings ?? [],
  };
}

export function pdfResult(input: PdfInput): FootprintIngestResult {
  return {
    polygon: input.polygon,
    areaSqm: input.areaSqm,
    source: "pdf",
    confidence: "traced",
    layer: "pdf-trace",
    warnings: input.warnings ?? [],
  };
}
