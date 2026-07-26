// src/lib/cad/doc/snap.ts
// Endpoint/midpoint snapping over segment buffers via a uniform grid hash.

import type { Vec2 } from "./types";
import type { LayerGeometry } from "./build-geometry";

export interface SnapHit { point: Vec2; kind: "endpoint" | "midpoint" }

interface SnapCandidate { x: number; y: number; kind: SnapHit["kind"] }

export interface SnapIndex {
  cellSize: number;
  cells: Map<string, SnapCandidate[]>;
}

const CELL_SIZE = 1; // meters — fine for building-scale drawings

const key = (cx: number, cy: number) => `${cx},${cy}`;

export function buildSnapIndex(
  layers: LayerGeometry[], visibleLayers: ReadonlySet<string>,
): SnapIndex {
  const cells = new Map<string, SnapCandidate[]>();
  const add = (x: number, y: number, kind: SnapHit["kind"]) => {
    const k = key(Math.floor(x / CELL_SIZE), Math.floor(y / CELL_SIZE));
    let arr = cells.get(k);
    if (!arr) cells.set(k, (arr = []));
    arr.push({ x, y, kind });
  };
  for (const lg of layers) {
    if (!visibleLayers.has(lg.layer)) continue;
    const p = lg.positions;
    for (let i = 0; i < lg.segmentCount; i++) {
      const x1 = p[i * 6], y1 = p[i * 6 + 1], x2 = p[i * 6 + 3], y2 = p[i * 6 + 4];
      add(x1, y1, "endpoint");
      add(x2, y2, "endpoint");
      add((x1 + x2) / 2, (y1 + y2) / 2, "midpoint");
    }
  }
  return { cellSize: CELL_SIZE, cells };
}

export function findSnap(index: SnapIndex, cursor: Vec2, radius: number): SnapHit | null {
  const r = Math.max(0, radius);
  const minCx = Math.floor((cursor.x - r) / index.cellSize);
  const maxCx = Math.floor((cursor.x + r) / index.cellSize);
  const minCy = Math.floor((cursor.y - r) / index.cellSize);
  const maxCy = Math.floor((cursor.y + r) / index.cellSize);
  let best: SnapCandidate | null = null;
  let bestD = r;
  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (const c of index.cells.get(key(cx, cy)) ?? []) {
        const d = Math.hypot(c.x - cursor.x, c.y - cursor.y);
        if (d > r) continue;
        // Strictly-better distance, or tie broken in favor of endpoints.
        if (
          best === null || d < bestD ||
          (d === bestD && best.kind === "midpoint" && c.kind === "endpoint")
        ) {
          best = c; bestD = d;
        }
      }
    }
  }
  return best ? { point: { x: best.x, y: best.y }, kind: best.kind } : null;
}
