// src/lib/cad/doc/hit-test.ts
// Boundary hit-testing: closed polylines (footprint picking) and generic
// entities (drafting selection).

import type { CadDocument, CadEntity, CadPolyline, Vec2 } from "./types";
import { bulgeArcPoints } from "./tessellate";
import { entityToChains } from "./entity-geometry";

function pointInRing(p: Vec2, vertices: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i], b = vertices[j];
    if ((a.y > p.y) !== (b.y > p.y)) {
      const xAt = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (p.x < xAt) inside = !inside;
    }
  }
  return inside;
}

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
    if (e.kind === "polyline" && e.closed && e.vertices.length >= 3 && pointInRing(cursor, e.vertices)) {
      // Interior of a closed outline is a hit (draw-then-pick footprint).
      if (0 < bestD || best === null) { best = e; bestD = 0; }
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
  let bestD = Infinity;
  for (const e of doc.entities) {
    if (e.kind !== "polyline" || !e.closed || e.vertices.length < 3) continue;
    const n = e.vertices.length;
    let edgeD = Infinity;
    for (let i = 0; i < n; i++) {
      const a = e.vertices[i], b = e.vertices[(i + 1) % n];
      const chain = e.bulges[i] ? bulgeArcPoints(a, b, e.bulges[i]) : [a, b];
      for (let j = 0; j < chain.length - 1; j++) {
        const d = distToSegment(cursor, chain[j], chain[j + 1]);
        if (d < edgeD) edgeD = d;
      }
    }
    const inside = pointInRing(cursor, e.vertices);
    if (!inside && edgeD > tolerance) continue;
    // Rank by edge distance so an interior click on two nested/overlapping
    // rings still picks the nearer outline.
    if (edgeD <= bestD) { best = e; bestD = edgeD; }
  }
  return best;
}
