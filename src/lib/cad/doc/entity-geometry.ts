// src/lib/cad/doc/entity-geometry.ts
// Single tessellation authority: entity → polyline chains. Shared by the
// geometry builder, hit-testing, and selection highlighting so all three
// agree on what an entity's curve looks like.

import type { CadEntity, Vec2 } from "./types";
import { arcPoints, bulgeArcPoints, circlePoints, ellipsePoints } from "./tessellate";

/** Half-size of the cross drawn for POINT entities, meters. */
export const POINT_CROSS_HALF = 0.05;

export function entityToChains(e: CadEntity): Vec2[][] {
  switch (e.kind) {
    case "line":
      return [[{ ...e.a }, { ...e.b }]];
    case "polyline": {
      const n = e.vertices.length;
      if (n < 2) return [];
      const chain: Vec2[] = [{ ...e.vertices[0] }];
      const last = e.closed ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const a = e.vertices[i], b = e.vertices[(i + 1) % n];
        if (e.bulges[i]) chain.push(...bulgeArcPoints(a, b, e.bulges[i]).slice(1));
        else chain.push({ ...b });
      }
      return [chain];
    }
    case "arc":
      return [arcPoints(e.center, e.radius, e.startAngle, e.endAngle)];
    case "circle": {
      const ring = circlePoints(e.center, e.radius);
      return [[...ring, { ...ring[0] }]];
    }
    case "ellipse":
      return [ellipsePoints(e.center, e.majorAxis, e.ratio, e.startParam, e.endParam)];
    case "text":
      return [];
    case "point": {
      const p = e.position, h = POINT_CROSS_HALF;
      return [
        [{ x: p.x - h, y: p.y }, { x: p.x + h, y: p.y }],
        [{ x: p.x, y: p.y - h }, { x: p.x, y: p.y + h }],
      ];
    }
  }
}
