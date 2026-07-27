// src/lib/cad/doc/hit-test.ts
// Boundary hit-testing: closed polylines (footprint picking) and generic
// entities (drafting selection).

import type { CadDocument, CadEntity, CadPolyline, Vec2 } from "./types";
import { bulgeArcPoints } from "./tessellate";
import { entityToChains } from "./entity-geometry";

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 :
    Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Nearest entity of any kind whose curve passes within tolerance. Text hits
 *  inside a rough label box (4×height wide, rotation ignored in v1). */
export function findEntityAt(
  doc: CadDocument, cursor: Vec2, tolerance: number,
): CadEntity | null {
  let best: CadEntity | null = null;
  let bestD = tolerance;
  for (const e of doc.entities) {
    if (e.kind === "text") {
      const inBox =
        cursor.x >= e.position.x && cursor.x <= e.position.x + e.height * 4 &&
        cursor.y >= e.position.y && cursor.y <= e.position.y + e.height;
      if (inBox && bestD >= 0) { best = e; bestD = 0; }
      continue;
    }
    for (const chain of entityToChains(e)) {
      for (let j = 0; j < chain.length - 1; j++) {
        const d = distToSegment(cursor, chain[j], chain[j + 1]);
        if (d < bestD || (d === bestD && best === null)) { best = e; bestD = d; }
      }
    }
  }
  return best;
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
