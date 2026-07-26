// src/lib/cad/doc/hit-test.ts
// Boundary hit-testing for closed polylines (footprint picking in the viewer).

import type { CadDocument, CadPolyline, Vec2 } from "./types";
import { bulgeArcPoints } from "./tessellate";

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 :
    Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function findClosedPolylineAt(
  doc: CadDocument, cursor: Vec2, tolerance: number,
): CadPolyline | null {
  let best: CadPolyline | null = null;
  let bestD = tolerance;
  for (const e of doc.entities) {
    if (e.kind !== "polyline" || !e.closed) continue;
    const n = e.vertices.length;
    for (let i = 0; i < n; i++) {
      const a = e.vertices[i], b = e.vertices[(i + 1) % n];
      const chain = e.bulges[i] ? bulgeArcPoints(a, b, e.bulges[i]) : [a, b];
      for (let j = 0; j < chain.length - 1; j++) {
        const d = distToSegment(cursor, chain[j], chain[j + 1]);
        if (d <= bestD) { best = e; bestD = d; }
      }
    }
  }
  return best;
}
