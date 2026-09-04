// src/lib/cad-reconstruction/outline-regularize.ts
//
// Squares up a surveyed outline into a schematic plan.
//
// A GIS or OSM building ring is a *trace*: its corners carry digitising noise
// of a few hundred millimetres, so no two walls are exactly parallel and no
// corner is exactly 90°. Drawn as-is that reads as a building with dozens of
// tiny splays, and every wall length, facade area and orientation derived from
// it inherits the wobble.
//
// This module recovers the building's own axis and snaps walls to it. Two rules
// keep that from becoming fabrication:
//
//   1. It only fires on outlines that are ALREADY mostly orthogonal. A round,
//      splayed or triangular building is left exactly as traced — the point is
//      to remove noise, never to impose a rectangle on a shape that isn't one.
//   2. Every result is checked before it is returned: it must not self-
//      intersect, must not move a corner further than the shift limit, and must
//      not change the enclosed area beyond the drift limit. A result that fails
//      any check is discarded and the input comes back untouched, with a reason.
//
// So the caller gets either a defensibly squared ring or the original. It never
// gets a ring that quietly became a different building. Units: millimetres.

import { areaSqm, centroid, isSelfIntersecting, perimeterMm } from "./geometry";
import type { PointMm, RingMm } from "./types";

/** Edges within this angle of the building axis are treated as wall lines. */
const ANGLE_TOL_DEG = 12;
/** Parallel neighbouring walls closer than this are one wall with a wobble. */
const MERGE_TOL_MM = 300;
/** A corner may not be dragged further than this to square it up. */
const MAX_SHIFT_MM = 1200;
/** Squaring up may not change the enclosed area by more than this. */
const MAX_AREA_DRIFT_PCT = 3;
/**
 * Share of the perimeter that must already sit on the building axis before
 * squaring is meaningful. Below this the outline is genuinely not orthogonal.
 */
const MIN_ORTHOGONALITY = 0.7;

export interface RegularizeOptions {
  angleTolDeg?: number;
  mergeTolMm?: number;
  maxShiftMm?: number;
  maxAreaDriftPct?: number;
  minOrthogonality?: number;
}

export interface RegularizeResult {
  /** The squared ring, or the input unchanged when `applied` is false. */
  ring: RingMm;
  applied: boolean;
  /** Building axis, degrees counter-clockwise from +X, folded into [0, 90). */
  rotationDeg: number;
  /** Furthest any original corner sits from the returned outline. */
  maxShiftMm: number;
  /** Signed area change against the input, as a percentage. */
  areaDeltaPct: number;
  /** Share of the input perimeter that lay on the building axis, 0…1. */
  orthogonality: number;
  /** Why the result was accepted or refused — carried into the ledger. */
  reason: string;
}

/**
 * The building's own axis, in degrees CCW from +X, folded into [0, 90).
 *
 * Edge directions are summed as unit vectors at four times their angle, which
 * makes directions 90° apart identical — the four walls of a rectangle then
 * reinforce one estimate instead of cancelling out. Weighting by edge length
 * means a long street wall sets the axis and a 1 m chamfer does not.
 */
export function dominantAxisDeg(ring: RingMm): number {
  if (ring.length < 3) return 0;

  let sx = 0;
  let sy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const a = Math.atan2(dy, dx) * 4;
    sx += len * Math.cos(a);
    sy += len * Math.sin(a);
  }
  if (sx === 0 && sy === 0) return 0;

  const deg = ((Math.atan2(sy, sx) * 180) / Math.PI) / 4;
  return ((deg % 90) + 90) % 90;
}

function rotatePoint([x, y]: PointMm, cos: number, sin: number, origin: PointMm): PointMm {
  const dx = x - origin[0];
  const dy = y - origin[1];
  return [origin[0] + dx * cos - dy * sin, origin[1] + dx * sin + dy * cos];
}

/** Distance from a point to a segment. */
function pointToSegmentMm(p: PointMm, a: PointMm, b: PointMm): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * How far the outline actually moved: the furthest any original corner sits
 * from the new boundary. Comparing corner-to-corner would be meaningless once
 * a wobble has been merged away and the corner counts differ.
 */
function maxDeviationMm(original: RingMm, result: RingMm): number {
  if (result.length < 2) return Infinity;
  let worst = 0;
  for (const p of original) {
    let best = Infinity;
    for (let i = 0; i < result.length; i++) {
      const d = pointToSegmentMm(p, result[i], result[(i + 1) % result.length]);
      if (d < best) best = d;
    }
    if (best > worst) worst = best;
  }
  return worst;
}

/** One wall, as an infinite line, in the building's own frame. */
interface WallLine {
  kind: "h" | "v" | "free";
  /** y for a horizontal wall, x for a vertical one; unused when free. */
  offset: number;
  a: PointMm;
  b: PointMm;
  lengthMm: number;
}

function intersect(p: WallLine, q: WallLine, fallback: PointMm): PointMm {
  const p1 = p.a;
  const p2 = p.b;
  const q1 = q.a;
  const q2 = q.b;
  const d1x = p2[0] - p1[0];
  const d1y = p2[1] - p1[1];
  const d2x = q2[0] - q1[0];
  const d2y = q2[1] - q1[1];
  const det = d1x * d2y - d1y * d2x;
  // Parallel walls have no corner between them; keeping the traced corner is
  // the honest answer, and the guards below still judge the result.
  if (Math.abs(det) < 1e-9) return fallback;
  const t = ((q1[0] - p1[0]) * d2y - (q1[1] - p1[1]) * d2x) / det;
  return [p1[0] + t * d1x, p1[1] + t * d1y];
}

export function regularizeRing(
  ring: RingMm,
  options: RegularizeOptions = {},
): RegularizeResult {
  const angleTol = options.angleTolDeg ?? ANGLE_TOL_DEG;
  const mergeTol = options.mergeTolMm ?? MERGE_TOL_MM;
  const maxShift = options.maxShiftMm ?? MAX_SHIFT_MM;
  const maxDrift = options.maxAreaDriftPct ?? MAX_AREA_DRIFT_PCT;
  const minOrtho = options.minOrthogonality ?? MIN_ORTHOGONALITY;

  const refuse = (reason: string, rotationDeg = 0, orthogonality = 0): RegularizeResult => ({
    ring,
    applied: false,
    rotationDeg,
    maxShiftMm: 0,
    areaDeltaPct: 0,
    orthogonality,
    reason,
  });

  if (ring.length < 3) {
    return refuse("정점이 3개 미만이라 외곽선으로 볼 수 없습니다");
  }

  const rotationDeg = dominantAxisDeg(ring);
  const rad = (rotationDeg * Math.PI) / 180;
  const pivot = centroid(ring);
  // Into the building's own frame, where its walls run along X and Y.
  const local = ring.map((p) => rotatePoint(p, Math.cos(-rad), Math.sin(-rad), pivot));

  const inputArea = areaSqm(ring);
  const inputPerimeter = perimeterMm(ring);
  if (inputArea <= 0 || inputPerimeter <= 0) {
    return refuse("면적이 0인 축퇴 외곽선입니다", rotationDeg);
  }

  const walls: WallLine[] = [];
  let alignedLength = 0;
  for (let i = 0; i < local.length; i++) {
    const a = local[i];
    const b = local[(i + 1) % local.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthMm = Math.hypot(dx, dy);
    if (lengthMm < 1) continue;

    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const folded = (((deg % 180) + 180) % 180);
    const nearH = Math.min(folded, 180 - folded) <= angleTol;
    const nearV = Math.abs(folded - 90) <= angleTol;

    if (nearH) {
      alignedLength += lengthMm;
      walls.push({ kind: "h", offset: (a[1] + b[1]) / 2, a, b, lengthMm });
    } else if (nearV) {
      alignedLength += lengthMm;
      walls.push({ kind: "v", offset: (a[0] + b[0]) / 2, a, b, lengthMm });
    } else {
      walls.push({ kind: "free", offset: 0, a, b, lengthMm });
    }
  }

  if (walls.length < 3) {
    return refuse("유효한 변이 3개 미만입니다", rotationDeg);
  }

  const orthogonality = alignedLength / inputPerimeter;
  if (orthogonality < minOrtho) {
    return refuse(
      `둘레의 ${(orthogonality * 100).toFixed(0)}%만 직각 축에 놓여 있어 정형화하지 않았습니다 — 실제로 사각형이 아닌 평면입니다`,
      rotationDeg,
      orthogonality,
    );
  }

  // Merge neighbouring parallel walls that share an offset: that pair is one
  // wall with a digitising wobble between them, not a step in the building.
  const merged: WallLine[] = [];
  for (const wall of walls) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.kind === wall.kind &&
      wall.kind !== "free" &&
      Math.abs(prev.offset - wall.offset) <= mergeTol
    ) {
      const total = prev.lengthMm + wall.lengthMm;
      prev.offset = (prev.offset * prev.lengthMm + wall.offset * wall.lengthMm) / total;
      prev.lengthMm = total;
      prev.b = wall.b;
      continue;
    }
    merged.push({ ...wall });
  }
  // The list is cyclic, so the last and first walls can be the same wall too.
  while (
    merged.length > 3 &&
    merged[0].kind === merged[merged.length - 1].kind &&
    merged[0].kind !== "free" &&
    Math.abs(merged[0].offset - merged[merged.length - 1].offset) <= mergeTol
  ) {
    const last = merged.pop()!;
    const first = merged[0];
    const total = first.lengthMm + last.lengthMm;
    first.offset = (first.offset * first.lengthMm + last.offset * last.lengthMm) / total;
    first.lengthMm = total;
    first.a = last.a;
  }

  if (merged.length < 3) {
    return refuse("정형화하면 변이 3개 미만으로 줄어듭니다", rotationDeg, orthogonality);
  }

  // Pin each aligned wall to exactly its axis, then let the corners fall out of
  // the intersections. Free walls keep the line they were traced on.
  const pinned: WallLine[] = merged.map((w) => {
    if (w.kind === "h") {
      return { ...w, a: [w.a[0], w.offset] as PointMm, b: [w.b[0], w.offset] as PointMm };
    }
    if (w.kind === "v") {
      return { ...w, a: [w.offset, w.a[1]] as PointMm, b: [w.offset, w.b[1]] as PointMm };
    }
    return w;
  });

  const localOut: RingMm = [];
  for (let i = 0; i < pinned.length; i++) {
    const prev = pinned[(i - 1 + pinned.length) % pinned.length];
    localOut.push(intersect(prev, pinned[i], pinned[i].a));
  }

  const out: RingMm = localOut
    .map((p) => rotatePoint(p, Math.cos(rad), Math.sin(rad), pivot))
    .map(([x, y]) => [Math.round(x), Math.round(y)] as PointMm);

  if (isSelfIntersecting(out)) {
    return refuse("정형화 결과가 자기교차하여 폐기했습니다", rotationDeg, orthogonality);
  }

  const outArea = areaSqm(out);
  const areaDeltaPct = ((outArea - inputArea) / inputArea) * 100;
  if (Math.abs(areaDeltaPct) > maxDrift) {
    return refuse(
      `정형화가 면적을 ${areaDeltaPct.toFixed(1)}% 변화시켜 폐기했습니다 (허용 ${maxDrift}%)`,
      rotationDeg,
      orthogonality,
    );
  }

  const maxShiftMm = maxDeviationMm(ring, out);
  if (maxShiftMm > maxShift) {
    return refuse(
      `모서리가 최대 ${Math.round(maxShiftMm)} mm 이동해야 하여 폐기했습니다 (허용 ${maxShift} mm)`,
      rotationDeg,
      orthogonality,
    );
  }

  return {
    ring: out,
    applied: true,
    rotationDeg,
    maxShiftMm,
    areaDeltaPct,
    orthogonality,
    reason:
      `건물 축 ${rotationDeg.toFixed(1)}°에 맞춰 벽면을 직각으로 정리했습니다 ` +
      `(둘레의 ${(orthogonality * 100).toFixed(0)}%가 축상, 최대 ${Math.round(maxShiftMm)} mm 이동, 면적 ${areaDeltaPct >= 0 ? "+" : ""}${areaDeltaPct.toFixed(2)}%)`,
  };
}
