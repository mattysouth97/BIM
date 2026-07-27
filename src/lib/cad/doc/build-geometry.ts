// src/lib/cad/doc/build-geometry.ts
// CadDocument → renderable per-layer line-segment buffers + text labels.
// Pure module — the R3F viewer consumes these outputs verbatim.

import type { CadDocument, CadEntity, Vec2 } from "./types";
import { arcPoints, bulgeArcPoints, circlePoints, ellipsePoints } from "./tessellate";

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

/** Point-size cross for POINT entities, in meters. */
const POINT_CROSS_HALF = 0.05;

export function buildLayerGeometries(
  doc: CadDocument,
): { layers: LayerGeometry[]; texts: TextLabel[] } {
  const segsByLayer = new Map<string, number[]>();
  const texts: TextLabel[] = [];

  const push = (layer: string, a: Vec2, b: Vec2) => {
    let arr = segsByLayer.get(layer);
    if (!arr) segsByLayer.set(layer, (arr = []));
    arr.push(a.x, a.y, 0, b.x, b.y, 0);
  };
  const pushChain = (layer: string, pts: Vec2[], close = false) => {
    for (let i = 0; i < pts.length - 1; i++) push(layer, pts[i], pts[i + 1]);
    if (close && pts.length > 2) push(layer, pts[pts.length - 1], pts[0]);
  };

  for (const e of doc.entities) emit(e, push, pushChain, texts);

  const layers: LayerGeometry[] = [...segsByLayer.entries()].map(([layer, arr]) => ({
    layer,
    positions: new Float32Array(arr),
    segmentCount: arr.length / 6,
  }));
  return { layers, texts };
}

function emit(
  e: CadEntity,
  push: (layer: string, a: Vec2, b: Vec2) => void,
  pushChain: (layer: string, pts: Vec2[], close?: boolean) => void,
  texts: TextLabel[],
): void {
  switch (e.kind) {
    case "line": push(e.layer, e.a, e.b); return;
    case "polyline": {
      const n = e.vertices.length;
      const last = e.closed ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const a = e.vertices[i], b = e.vertices[(i + 1) % n];
        if (e.bulges[i]) pushChain(e.layer, bulgeArcPoints(a, b, e.bulges[i]));
        else push(e.layer, a, b);
      }
      return;
    }
    case "arc": pushChain(e.layer, arcPoints(e.center, e.radius, e.startAngle, e.endAngle)); return;
    case "circle": pushChain(e.layer, circlePoints(e.center, e.radius), true); return;
    case "ellipse":
      pushChain(e.layer, ellipsePoints(e.center, e.majorAxis, e.ratio, e.startParam, e.endParam));
      return;
    case "text":
      texts.push({
        entityId: e.id, text: e.text, position: e.position,
        height: e.height, rotation: e.rotation, layer: e.layer, colorIndex: e.colorIndex,
      });
      return;
    case "point": {
      const p = e.position, h = POINT_CROSS_HALF;
      push(e.layer, { x: p.x - h, y: p.y }, { x: p.x + h, y: p.y });
      push(e.layer, { x: p.x, y: p.y - h }, { x: p.x, y: p.y + h });
      return;
    }
  }
}
