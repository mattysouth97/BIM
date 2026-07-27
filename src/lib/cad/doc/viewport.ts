// src/lib/cad/doc/viewport.ts
// Pure 2D viewport math shared by the R3F camera and the SVG markup overlay.
// Screen coords: CSS pixels, origin top-left, +y down. World: meters, +y up.

import type { CadDocument, Vec2 } from "./types";

export interface ViewState { center: Vec2; /** world meters per CSS pixel */ scale: number }

export function computeFitView(
  extents: CadDocument["extents"], widthPx: number, heightPx: number,
  paddingFrac = 0.05,
): ViewState {
  const w = extents.max.x - extents.min.x;
  const h = extents.max.y - extents.min.y;
  const center = {
    x: (extents.min.x + extents.max.x) / 2,
    y: (extents.min.y + extents.max.y) / 2,
  };
  const usableW = widthPx * (1 - paddingFrac * 2);
  const usableH = heightPx * (1 - paddingFrac * 2);
  if (w <= 0 && h <= 0) return { center, scale: 0.01 }; // 1cm/px default
  const scale = Math.max(w / Math.max(usableW, 1), h / Math.max(usableH, 1));
  return { center, scale: scale > 0 ? scale : 0.01 };
}

export function worldToScreen(
  p: Vec2, view: ViewState, widthPx: number, heightPx: number,
): Vec2 {
  return {
    x: widthPx / 2 + (p.x - view.center.x) / view.scale,
    y: heightPx / 2 - (p.y - view.center.y) / view.scale,
  };
}

export function screenToWorld(
  p: Vec2, view: ViewState, widthPx: number, heightPx: number,
): Vec2 {
  return {
    x: view.center.x + (p.x - widthPx / 2) * view.scale,
    y: view.center.y - (p.y - heightPx / 2) * view.scale,
  };
}
