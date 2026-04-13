"use client";

import type { Polygon2D } from "@/lib/cad/dxf-parser";

interface FootprintPreviewProps {
  polygon: Polygon2D;
  /** Rendered square size in pixels (width = height). */
  size?: number;
  className?: string;
}

/**
 * 2D SVG preview of a polygon ring, auto-scaled to fit a square viewport.
 * Polygon coordinates are already in meters, bbox-centered at origin.
 */
export function FootprintPreview({
  polygon,
  size = 240,
  className,
}: FootprintPreviewProps) {
  if (polygon.length < 3) return null;

  // Bounding box of the polygon (already centered at 0,0 by parser, but
  // recompute so this component works with any input).
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const w = maxX - minX;
  const h = maxY - minY;
  const pad = Math.max(w, h) * 0.05;
  const vbW = w + pad * 2;
  const vbH = h + pad * 2;

  // SVG Y grows downward; flip so the building's +Z (plan "up") reads as up.
  const points = polygon
    .map(([x, y]) => `${x - minX + pad},${vbH - (y - minY + pad)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Footprint polygon preview"
    >
      <polygon
        points={points}
        fill="currentColor"
        fillOpacity={0.15}
        stroke="currentColor"
        strokeWidth={Math.max(vbW, vbH) * 0.004}
      />
    </svg>
  );
}
