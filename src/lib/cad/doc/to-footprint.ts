// src/lib/cad/doc/to-footprint.ts
// Closed CadPolyline → footprint polygon in the app-wide convention:
// meters, bbox-centered at origin, [x, y] pairs (== [x, z] world).

import type { Polygon2D } from "@/lib/cad/dxf-parser";
import type { CadPolyline, Vec2 } from "./types";
import { bulgeArcPoints } from "./tessellate";

const MIN_AREA_SQM = 1;

export function polylineToFootprint(
  pl: CadPolyline,
): { polygon: Polygon2D; areaSqm: number } | null {
  if (!pl.closed || pl.vertices.length < 3) return null;

  const pts: Vec2[] = [];
  const n = pl.vertices.length;
  for (let i = 0; i < n; i++) {
    const a = pl.vertices[i], b = pl.vertices[(i + 1) % n];
    if (pl.bulges[i]) {
      const arc = bulgeArcPoints(a, b, pl.bulges[i]);
      pts.push(...arc.slice(0, -1)); // drop shared endpoint
    } else {
      pts.push(a);
    }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const polygon: Polygon2D = pts.map((p) => [p.x - cx, p.y - cy]);

  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    sum += x1 * y2 - x2 * y1;
  }
  const areaSqm = Math.abs(sum / 2);
  if (areaSqm < MIN_AREA_SQM) return null;
  return { polygon, areaSqm };
}
