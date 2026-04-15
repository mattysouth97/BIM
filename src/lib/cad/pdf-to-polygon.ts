// src/lib/cad/pdf-to-polygon.ts
// Pure utilities for converting a user-traced polygon on a rendered PDF page
// into a world-space footprint polygon in meters.
//
// The PDF tracer component captures vertex clicks in canvas pixel coordinates.
// Canvas Y grows downward; world Z we want grows upward (matches our three.js
// convention of footprint in the XZ plane). Scale is calibrated from a single
// user-entered value: the approximate real-world width of the building in
// meters, which we map to the polygon's bounding-box X-extent in pixels.

import type { Polygon2D } from "./dxf-parser";

/** Pixel-space point from a canvas click. */
export interface PixelPoint {
  x: number;
  y: number;
}

export interface PdfToPolygonInput {
  /** Traced pixel-space vertices (in order). Minimum 3. */
  points: PixelPoint[];
  /**
   * Real-world width of the traced polygon's bounding box, in meters.
   * Legacy calibration path; mutually exclusive with `metersPerPixel`.
   */
  realWorldWidthMeters?: number;
  /**
   * Pre-computed scale from a two-point ruler. Overrides
   * `realWorldWidthMeters` when provided. Must be > 0.
   */
  metersPerPixel?: number;
}

export interface PdfToPolygonResult {
  /**
   * Polygon in world-meters, bbox-centered at origin. DXF-style `[x, z]`
   * pairs, same convention as dxf-parser.
   */
  polygon: Polygon2D;
  /** Derived scale in meters per pixel. */
  metersPerPixel: number;
  /** Polygon area in square meters. */
  areaSqm: number;
}

/**
 * Convert traced pixel-space polygon into a meter-space polygon suitable for
 * `recipe-store` `footprintPolygon` overrides.
 *
 * Returns `null` when the input is not a usable polygon (fewer than 3 points,
 * degenerate bbox, or non-positive scale).
 */
export function pdfToPolygon(input: PdfToPolygonInput): PdfToPolygonResult | null {
  const { points } = input;
  if (points.length < 3) return null;

  // Bounding box in pixel space.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const widthPx = maxX - minX;
  const heightPx = maxY - minY;
  if (widthPx <= 0 || heightPx <= 0) return null;

  // Resolve scale. metersPerPixel wins if both are provided.
  let metersPerPixel: number;
  if (typeof input.metersPerPixel === "number") {
    if (!(input.metersPerPixel > 0)) return null;
    metersPerPixel = input.metersPerPixel;
  } else if (typeof input.realWorldWidthMeters === "number") {
    if (!(input.realWorldWidthMeters > 0)) return null;
    metersPerPixel = input.realWorldWidthMeters / widthPx;
  } else {
    return null;
  }

  // Convert each point:
  //   world X = (p.x - centerX) * metersPerPixel
  //   world Z = (centerY - p.y) * metersPerPixel    (flip Y so up is up)
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const polygon: Polygon2D = points.map((p) => [
    (p.x - cx) * metersPerPixel,
    (cy - p.y) * metersPerPixel,
  ]);

  const areaSqm = Math.abs(signedArea(polygon));
  return { polygon, metersPerPixel, areaSqm };
}

// ---------------------------------------------------------------------------
// Helper (duplicated from dxf-parser to keep this module standalone)
// ---------------------------------------------------------------------------

function signedArea(ring: Polygon2D): number {
  let sum = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}
