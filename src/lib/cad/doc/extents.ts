// src/lib/cad/doc/extents.ts
// Curve-aware bounding box over entities. Used by the mapper at load time
// and by the draft store after every mutation.

import type { CadEntity, Vec2 } from "./types";
import { entityToChains } from "./entity-geometry";

export function computeExtents(entities: CadEntity[]): { min: Vec2; max: Vec2 } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const eat = (p: Vec2) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  for (const e of entities) {
    if (e.kind === "text") { eat(e.position); continue; }
    for (const chain of entityToChains(e)) chain.forEach(eat);
  }
  if (minX === Infinity) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}
