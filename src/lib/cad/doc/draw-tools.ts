// src/lib/cad/doc/draw-tools.ts
// Pure reducer for the drafting tools. The overlay feeds it snapped clicks
// and keyboard events; it emits entity payloads (sans id/layer — the draft
// store assigns those).

import type { Vec2 } from "./types";
import { circlePoints } from "./tessellate";

export type DrawToolKind = "draw-line" | "draw-polyline" | "draw-rect" | "draw-circle";

export interface DrawState { tool: DrawToolKind; points: Vec2[] }

export type DrawEvent =
  | { type: "click"; point: Vec2 }
  | { type: "finish" }
  | { type: "close" }
  | { type: "cancel" };

export type NewEntity =
  | { kind: "line"; a: Vec2; b: Vec2 }
  | { kind: "polyline"; vertices: Vec2[]; bulges: number[]; closed: boolean }
  | { kind: "circle"; center: Vec2; radius: number };

const EPS = 1e-9;
const same = (a: Vec2, b: Vec2) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

export function startDraw(tool: DrawToolKind): DrawState {
  return { tool, points: [] };
}

export function reduceDraw(
  state: DrawState, ev: DrawEvent,
): { state: DrawState; created?: NewEntity } {
  const reset = { tool: state.tool, points: [] as Vec2[] };
  if (ev.type === "cancel") return { state: reset };

  const pts = state.points;
  switch (state.tool) {
    case "draw-line": {
      if (ev.type !== "click") return { state: reset };
      if (pts.length === 0) return { state: { ...state, points: [ev.point] } };
      return { state: reset, created: { kind: "line", a: pts[0], b: ev.point } };
    }
    case "draw-rect": {
      if (ev.type !== "click") return { state: reset };
      if (pts.length === 0) return { state: { ...state, points: [ev.point] } };
      const a = pts[0], b = ev.point;
      if (Math.abs(a.x - b.x) < EPS || Math.abs(a.y - b.y) < EPS) return { state };
      return {
        state: reset,
        created: {
          kind: "polyline", closed: true, bulges: [0, 0, 0, 0],
          vertices: [
            { x: a.x, y: a.y }, { x: b.x, y: a.y },
            { x: b.x, y: b.y }, { x: a.x, y: b.y },
          ],
        },
      };
    }
    case "draw-circle": {
      if (ev.type !== "click") return { state: reset };
      if (pts.length === 0) return { state: { ...state, points: [ev.point] } };
      const radius = Math.hypot(ev.point.x - pts[0].x, ev.point.y - pts[0].y);
      if (radius < EPS) return { state };
      return { state: reset, created: { kind: "circle", center: pts[0], radius } };
    }
    case "draw-polyline": {
      if (ev.type === "click") {
        if (pts.length >= 3 && same(ev.point, pts[0])) {
          return { state: reset, created: polyline(pts, true) };
        }
        return { state: { ...state, points: [...pts, ev.point] } };
      }
      if (ev.type === "close" && pts.length >= 3) {
        return { state: reset, created: polyline(pts, true) };
      }
      if (ev.type === "finish" && pts.length >= 2) {
        return { state: reset, created: polyline(pts, false) };
      }
      return { state: reset };
    }
  }
}

function polyline(vertices: Vec2[], closed: boolean): NewEntity {
  return { kind: "polyline", vertices, bulges: vertices.map(() => 0), closed };
}

/** Chains to render as a dashed live preview while the tool has points. */
export function previewChains(state: DrawState, hover: Vec2): Vec2[][] {
  const pts = state.points;
  if (pts.length === 0) return [];
  switch (state.tool) {
    case "draw-line":
      return [[pts[0], hover]];
    case "draw-rect": {
      const a = pts[0], b = hover;
      return [[
        { x: a.x, y: a.y }, { x: b.x, y: a.y },
        { x: b.x, y: b.y }, { x: a.x, y: b.y }, { x: a.x, y: a.y },
      ]];
    }
    case "draw-circle": {
      const radius = Math.hypot(hover.x - pts[0].x, hover.y - pts[0].y);
      if (radius < EPS) return [];
      const ring = circlePoints(pts[0], radius);
      return [[...ring, ring[0]]];
    }
    case "draw-polyline": {
      const chain = [...pts, hover];
      // Closing hint back to the first vertex once a ring is possible.
      return pts.length >= 2 ? [chain, [hover, pts[0]]] : [chain];
    }
  }
}
