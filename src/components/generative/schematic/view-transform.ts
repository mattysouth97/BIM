// src/components/generative/schematic/view-transform.ts
//
// The one place that converts between the schematic's world (millimetres, XZ
// plane, +Z forward) and the SVG canvas (pixels, +Y down).
//
// Kept pure and separate from the components so panning, zooming and fitting
// are testable arithmetic rather than something you can only check by looking.
//
// Z maps to screen Y directly: plan north stays at the top of the canvas, which
// is what a plan reader expects, and it matches how the plan overlay draws the
// generated model.

import type { PointMm } from "@/lib/generative/blueprint";

export interface ViewTransform {
  /** Pixels per millimetre. */
  scale: number;
  /** Screen position, in pixels, of world (0, 0). */
  offsetX: number;
  offsetY: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface BoundsMm {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** 1 px = 20 mm — a 40 m plan fits a 2000 px canvas at this scale. */
export const DEFAULT_SCALE = 1 / 20;

export function toScreen(view: ViewTransform, point: PointMm): ScreenPoint {
  return {
    x: point.xMm * view.scale + view.offsetX,
    y: point.zMm * view.scale + view.offsetY,
  };
}

export function toWorld(view: ViewTransform, point: ScreenPoint): PointMm {
  return {
    xMm: (point.x - view.offsetX) / view.scale,
    zMm: (point.y - view.offsetY) / view.scale,
  };
}

/** Zoom about a fixed screen point, so the pixel under the cursor stays put. */
export function zoomAt(
  view: ViewTransform,
  factor: number,
  anchor: ScreenPoint,
  limits: { min: number; max: number } = { min: 1 / 4_000, max: 1 },
): ViewTransform {
  const scale = Math.max(limits.min, Math.min(limits.max, view.scale * factor));
  if (scale === view.scale) return view;
  const world = toWorld(view, anchor);
  return {
    scale,
    offsetX: anchor.x - world.xMm * scale,
    offsetY: anchor.y - world.zMm * scale,
  };
}

export function panBy(view: ViewTransform, dx: number, dy: number): ViewTransform {
  return { ...view, offsetX: view.offsetX + dx, offsetY: view.offsetY + dy };
}

export function centreOn(
  bounds: BoundsMm,
  width: number,
  height: number,
  scale: number,
): ViewTransform {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  return { scale, offsetX: width / 2 - cx * scale, offsetY: height / 2 - cz * scale };
}

/**
 * Fit the given extent into the viewport with a pixel margin. A degenerate
 * extent (one point, or nothing drawn yet) keeps the default scale rather than
 * dividing by zero and zooming to infinity.
 */
export function fitTransform(
  bounds: BoundsMm | null,
  width: number,
  height: number,
  paddingPx = 48,
): ViewTransform {
  if (!bounds || width <= 0 || height <= 0) {
    return centreOn(
      bounds ?? { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
      Math.max(width, 0),
      Math.max(height, 0),
      DEFAULT_SCALE,
    );
  }

  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  const usableX = Math.max(width - paddingPx * 2, 1);
  const usableZ = Math.max(height - paddingPx * 2, 1);
  const scale =
    spanX <= 0 && spanZ <= 0
      ? DEFAULT_SCALE
      : Math.min(
          spanX > 0 ? usableX / spanX : Number.POSITIVE_INFINITY,
          spanZ > 0 ? usableZ / spanZ : Number.POSITIVE_INFINITY,
        );

  return centreOn(bounds, width, height, scale);
}

export function mergeBounds(a: BoundsMm | null, b: BoundsMm | null): BoundsMm | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

export function boundsOfPoints(points: readonly PointMm[]): BoundsMm | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.xMm);
    maxX = Math.max(maxX, point.xMm);
    minZ = Math.min(minZ, point.zMm);
    maxZ = Math.max(maxZ, point.zMm);
  }
  return { minX, maxX, minZ, maxZ };
}
