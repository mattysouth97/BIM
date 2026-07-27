// src/lib/cad/doc/build-geometry.ts
// CadDocument → renderable per-layer line-segment buffers + text labels.
// Pure module — the R3F viewer consumes these outputs verbatim.
// Tessellation itself lives in entity-geometry.ts (shared with hit-testing).

import type { CadDocument, Vec2 } from "./types";
import { entityToChains } from "./entity-geometry";

export interface LayerGeometry {
  layer: string;
  /** xyz triples, 2 points per segment: [x1,y1,0, x2,y2,0, ...] — ready for BufferAttribute. */
  positions: Float32Array;
  segmentCount: number;
}

export interface TextLabel {
  entityId: string; text: string; position: Vec2;
  height: number; rotation: number; layer: string; colorIndex?: number;
}

export function buildLayerGeometries(
  doc: CadDocument,
): { layers: LayerGeometry[]; texts: TextLabel[] } {
  const segsByLayer = new Map<string, number[]>();
  const texts: TextLabel[] = [];

  for (const e of doc.entities) {
    if (e.kind === "text") {
      texts.push({
        entityId: e.id, text: e.text, position: e.position,
        height: e.height, rotation: e.rotation, layer: e.layer, colorIndex: e.colorIndex,
      });
      continue;
    }
    let arr = segsByLayer.get(e.layer);
    if (!arr) segsByLayer.set(e.layer, (arr = []));
    for (const chain of entityToChains(e)) {
      for (let i = 0; i < chain.length - 1; i++) {
        arr.push(chain[i].x, chain[i].y, 0, chain[i + 1].x, chain[i + 1].y, 0);
      }
    }
  }

  const layers: LayerGeometry[] = [...segsByLayer.entries()].map(([layer, arr]) => ({
    layer,
    positions: new Float32Array(arr),
    segmentCount: arr.length / 6,
  }));
  return { layers, texts };
}
