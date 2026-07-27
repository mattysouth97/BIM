// src/lib/cad/doc/grid.ts
// Grid snap + ortho lock for the drafting tools. Pure math.

import type { Vec2 } from "./types";

export function snapToGrid(p: Vec2, step: number): Vec2 {
  if (step <= 0) return { ...p };
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
}

/** Lock p to the dominant axis relative to anchor (|dx| ≥ |dy| → horizontal). */
export function applyOrtho(anchor: Vec2, p: Vec2): Vec2 {
  return Math.abs(p.x - anchor.x) >= Math.abs(p.y - anchor.y)
    ? { x: p.x, y: anchor.y }
    : { x: anchor.x, y: p.y };
}
