// src/lib/cad/ingest-result.ts
// Shared output contract for all CAD ingest paths (DXF, DWG, PDF, IFC).
// Downstream code reads `source` + `confidence` to reason about reliability
// without caring which parser produced the polygon.
//
// Accuracy-path precedence (P2-13): IFC > DXF/DWG > PDF > procedural rectangle.
// Use resolveAccuracyPath() to pick the best available ingest result.

import type { Polygon2D } from "./dxf-parser";

export type IngestSource = "ifc" | "dxf" | "dwg" | "pdf";
export type IngestConfidence = "measured" | "exact" | "converted" | "traced";

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

interface IfcInput {
  polygon: Polygon2D;
  areaSqm: number;
  warnings?: string[];
}

/**
 * P2-13 WP2 — IFC measured footprint result.
 * Confidence "measured" indicates a BIM-sourced geometry (highest accuracy tier).
 */
export function ifcResult(input: IfcInput): FootprintIngestResult {
  return {
    polygon: input.polygon,
    areaSqm: input.areaSqm,
    source: "ifc",
    confidence: "measured",
    layer: "ifc-measured",
    warnings: input.warnings ?? [],
  };
}

/**
 * P2-13 WP2 — Explicit accuracy-path routing.
 *
 * Returns the highest-accuracy ingest result from the provided list, following
 * the explicit precedence: IFC (measured) > DXF (exact) > DWG (converted) > PDF (traced).
 *
 * Returns null when the list is empty (caller falls through to procedural rectangle).
 */
export function resolveAccuracyPath(
  results: FootprintIngestResult[],
): FootprintIngestResult | null {
  if (results.length === 0) return null;

  const CONFIDENCE_RANK: Record<IngestConfidence, number> = {
    measured: 4,
    exact: 3,
    converted: 2,
    traced: 1,
  };

  return results.reduce((best, candidate) => {
    const bestRank = CONFIDENCE_RANK[best.confidence] ?? 0;
    const candidateRank = CONFIDENCE_RANK[candidate.confidence] ?? 0;
    return candidateRank > bestRank ? candidate : best;
  });
}
