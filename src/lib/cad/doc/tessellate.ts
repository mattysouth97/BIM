// src/lib/cad/doc/tessellate.ts
// Curve → polyline tessellation. Pure math, no deps.

import type { Vec2 } from "./types";

export const DEFAULT_MAX_SEG_ANGLE = Math.PI / 24; // 7.5°

const TAU = Math.PI * 2;

/** Normalize sweep so end > start (CCW), wrapping once if needed. */
function ccwSweep(start: number, end: number): number {
  let sweep = end - start;
  while (sweep <= 0) sweep += TAU;
  return sweep;
}

export function arcPoints(
  center: Vec2, radius: number, startAngle: number, endAngle: number,
  maxSegAngle = DEFAULT_MAX_SEG_ANGLE,
): Vec2[] {
  const sweep = ccwSweep(startAngle, endAngle);
  const n = Math.max(1, Math.ceil(sweep / maxSegAngle));
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = startAngle + (sweep * i) / n;
    pts.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return pts;
}

export function circlePoints(
  center: Vec2, radius: number, maxSegAngle = DEFAULT_MAX_SEG_ANGLE,
): Vec2[] {
  const n = Math.max(8, Math.ceil(TAU / maxSegAngle));
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (TAU * i) / n;
    pts.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return pts;
}

/**
 * DXF bulge arc between two vertices. bulge = tan(includedAngle / 4);
 * positive bulges CCW (left of a→b).
 */
export function bulgeArcPoints(
  a: Vec2, b: Vec2, bulge: number, maxSegAngle = DEFAULT_MAX_SEG_ANGLE,
): Vec2[] {
  if (bulge === 0) return [{ ...a }, { ...b }];

  const theta = 4 * Math.atan(bulge); // signed included angle
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  if (chord < 1e-12) return [{ ...a }, { ...b }];
  const radius = chord / (2 * Math.sin(Math.abs(theta) / 2));

  // Center: perpendicular offset from chord midpoint.
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const d = Math.sqrt(Math.max(0, radius * radius - (chord / 2) ** 2));
  // Unit perpendicular (left of a→b).
  const ux = -(b.y - a.y) / chord, uy = (b.x - a.x) / chord;
  // |theta| < π: center is on the opposite side of the bulge apex.
  const side = (bulge > 0 ? -1 : 1) * (Math.abs(theta) > Math.PI ? -1 : 1);
  const cx = mx + side * d * ux, cy = my + side * d * uy;

  const startAngle = Math.atan2(a.y - cy, a.x - cx);
  const endAngle = Math.atan2(b.y - cy, b.x - cx);

  const pts = bulge > 0
    ? arcPoints({ x: cx, y: cy }, radius, startAngle, endAngle, maxSegAngle)
    : arcPoints({ x: cx, y: cy }, radius, endAngle, startAngle, maxSegAngle).reverse();

  // Pin exact endpoints (tessellation drift).
  pts[0] = { ...a };
  pts[pts.length - 1] = { ...b };
  return pts;
}

export function ellipsePoints(
  center: Vec2, majorAxis: Vec2, ratio: number,
  startParam: number, endParam: number,
  maxSegAngle = DEFAULT_MAX_SEG_ANGLE,
): Vec2[] {
  const sweep = endParam - startParam >= TAU - 1e-9
    ? TAU
    : ccwSweep(startParam, endParam);
  const n = Math.max(8, Math.ceil(sweep / maxSegAngle));
  const a = Math.hypot(majorAxis.x, majorAxis.y); // semi-major length
  const b = a * ratio;
  const rot = Math.atan2(majorAxis.y, majorAxis.x);
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = startParam + (sweep * i) / n;
    const ex = a * Math.cos(t), ey = b * Math.sin(t);
    pts.push({
      x: center.x + ex * cosR - ey * sinR,
      y: center.y + ex * sinR + ey * cosR,
    });
  }
  return pts;
}
