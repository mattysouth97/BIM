// src/lib/generative/geom/frame.ts
//
// LocalFrame: the rotated coordinate system a wing, podium or imported sheet
// lives in, and the conversions between it and the engine's world XZ.
//
// UNITS metres, PLANE XZ, angles in RADIANS.
//
// CONVENTION `toWorld` rotates by `+rotationRad` about the frame origin and then
// translates; `toLocal` is its exact inverse. A positive rotation carries +X
// towards +Z, which is the same sense that makes a counter-clockwise ring have
// positive signed area in `polygon.ts`. Keeping one sense throughout is what
// lets a rotated wing's rings stay valid without a winding repair.
//
// A rect is only a rect in ONE frame. `rectToWorldRing` gives the exact rotated
// quad; `rectToWorldBounds` gives the conservative world AABB around it. There
// is deliberately no `rectToWorldRect` — it would have to lie.

import {
  ensureWinding,
  ringBounds,
  vecCross,
  vecDistance,
  type Polygon,
  type Rect,
  type Ring,
  type Vec2,
} from "./polygon";

export interface LocalFrame {
  originX: number;
  originZ: number;
  rotationRad: number;
}

export const IDENTITY_FRAME: LocalFrame = { originX: 0, originZ: 0, rotationRad: 0 };

export const makeFrame = (originX: number, originZ: number, rotationRad: number): LocalFrame => ({
  originX,
  originZ,
  rotationRad,
});

/* ------------------------------------------------------------------ */
/* Rotation                                                            */
/* ------------------------------------------------------------------ */

/** Rotate a point about `about` (the origin by default) by `rotationRad`. */
export function rotatePoint(
  point: Vec2,
  rotationRad: number,
  about: Vec2 = [0, 0],
): Vec2 {
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  const x = point[0] - about[0];
  const z = point[1] - about[1];
  return [about[0] + x * cos - z * sin, about[1] + x * sin + z * cos];
}

/** Rotation preserves signed area, so the ring's winding is unchanged. */
export const rotateRing = (ring: Ring, rotationRad: number, about: Vec2 = [0, 0]): Ring =>
  ring.map((point) => rotatePoint(point, rotationRad, about));

export const rotatePolygon = (
  polygon: Polygon,
  rotationRad: number,
  about: Vec2 = [0, 0],
): Polygon => polygon.map((ring) => rotateRing(ring, rotationRad, about));

/* ------------------------------------------------------------------ */
/* Frame conversions                                                   */
/* ------------------------------------------------------------------ */

export function toWorldPoint(frame: LocalFrame, point: Vec2): Vec2 {
  const cos = Math.cos(frame.rotationRad);
  const sin = Math.sin(frame.rotationRad);
  return [
    frame.originX + point[0] * cos - point[1] * sin,
    frame.originZ + point[0] * sin + point[1] * cos,
  ];
}

export function toLocalPoint(frame: LocalFrame, point: Vec2): Vec2 {
  const cos = Math.cos(frame.rotationRad);
  const sin = Math.sin(frame.rotationRad);
  const x = point[0] - frame.originX;
  const z = point[1] - frame.originZ;
  return [x * cos + z * sin, -x * sin + z * cos];
}

/** Directions carry rotation only — no translation. Use for tangents and normals. */
export function toWorldDirection(frame: LocalFrame, direction: Vec2): Vec2 {
  const cos = Math.cos(frame.rotationRad);
  const sin = Math.sin(frame.rotationRad);
  return [direction[0] * cos - direction[1] * sin, direction[0] * sin + direction[1] * cos];
}

export function toLocalDirection(frame: LocalFrame, direction: Vec2): Vec2 {
  const cos = Math.cos(frame.rotationRad);
  const sin = Math.sin(frame.rotationRad);
  return [direction[0] * cos + direction[1] * sin, -direction[0] * sin + direction[1] * cos];
}

export const toWorldRing = (frame: LocalFrame, ring: Ring): Ring =>
  ring.map((point) => toWorldPoint(frame, point));

export const toLocalRing = (frame: LocalFrame, ring: Ring): Ring =>
  ring.map((point) => toLocalPoint(frame, point));

export const toWorldPolygon = (frame: LocalFrame, polygon: Polygon): Polygon =>
  polygon.map((ring) => toWorldRing(frame, ring));

export const toLocalPolygon = (frame: LocalFrame, polygon: Polygon): Polygon =>
  polygon.map((ring) => toLocalRing(frame, ring));

/** Exact: the four corners of a local rect, in world, counter-clockwise. */
export const rectToWorldRing = (frame: LocalFrame, rect: Rect): Ring =>
  ensureWinding(
    [
      toWorldPoint(frame, [rect.minX, rect.minZ]),
      toWorldPoint(frame, [rect.maxX, rect.minZ]),
      toWorldPoint(frame, [rect.maxX, rect.maxZ]),
      toWorldPoint(frame, [rect.minX, rect.maxZ]),
    ],
    true,
  );

export const rectToLocalRing = (frame: LocalFrame, rect: Rect): Ring =>
  ensureWinding(
    [
      toLocalPoint(frame, [rect.minX, rect.minZ]),
      toLocalPoint(frame, [rect.maxX, rect.minZ]),
      toLocalPoint(frame, [rect.maxX, rect.maxZ]),
      toLocalPoint(frame, [rect.minX, rect.maxZ]),
    ],
    true,
  );

/**
 * World AABB enclosing the rotated rect. CONSERVATIVE — equal to the rect only
 * when the frame's rotation is a multiple of 90°. Use `rectToWorldRing` when the
 * exact shape matters.
 */
export function rectToWorldBounds(frame: LocalFrame, rect: Rect): Rect {
  const bounds = ringBounds(rectToWorldRing(frame, rect));
  // Four corners always produce bounds; the null branch is unreachable.
  return bounds ?? { ...rect };
}

export function rectToLocalBounds(frame: LocalFrame, rect: Rect): Rect {
  const bounds = ringBounds(rectToLocalRing(frame, rect));
  return bounds ?? { ...rect };
}

/* ------------------------------------------------------------------ */
/* Frame algebra                                                       */
/* ------------------------------------------------------------------ */

/** The frame that undoes `frame`: `toWorld(invert(f), toWorld(f, p)) === p`. */
export function invertFrame(frame: LocalFrame): LocalFrame {
  const cos = Math.cos(frame.rotationRad);
  const sin = Math.sin(frame.rotationRad);
  return {
    originX: -(frame.originX * cos + frame.originZ * sin),
    originZ: -(-frame.originX * sin + frame.originZ * cos),
    rotationRad: -frame.rotationRad,
  };
}

/**
 * `inner` expressed in `outer`'s parent: applying the result is the same as
 * applying `inner` then `outer`. This is how a nested wing inside a rotated
 * podium gets one transform instead of two.
 */
export function composeFrames(outer: LocalFrame, inner: LocalFrame): LocalFrame {
  const origin = toWorldPoint(outer, [inner.originX, inner.originZ]);
  return {
    originX: origin[0],
    originZ: origin[1],
    rotationRad: outer.rotationRad + inner.rotationRad,
  };
}

/* ------------------------------------------------------------------ */
/* Oriented bounding boxes                                             */
/* ------------------------------------------------------------------ */

export interface OrientedBox {
  centreX: number;
  centreZ: number;
  /** Full extents along the box's own axes, not half-extents. */
  widthM: number;
  depthM: number;
  rotationRad: number;
}

export const orientedBoxArea = (box: OrientedBox): number => box.widthM * box.depthM;

/**
 * The tightest box around `ring` whose axes sit at `rotationRad`. Measure the
 * ring in that frame, then carry the local centre back out to world.
 */
export function obbOfRing(ring: Ring, rotationRad: number): OrientedBox | null {
  if (ring.length === 0) return null;
  const local = rotateRing(ring, -rotationRad);
  const bounds = ringBounds(local);
  if (bounds === null) return null;
  const centre = rotatePoint(
    [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2],
    rotationRad,
  );
  return {
    centreX: centre[0],
    centreZ: centre[1],
    widthM: bounds.maxX - bounds.minX,
    depthM: bounds.maxZ - bounds.minZ,
    rotationRad,
  };
}

/** Corners of the box in world, counter-clockwise. */
export function obbCorners(box: OrientedBox): Ring {
  const hw = box.widthM / 2;
  const hd = box.depthM / 2;
  const frame: LocalFrame = {
    originX: box.centreX,
    originZ: box.centreZ,
    rotationRad: box.rotationRad,
  };
  return rectToWorldRing(frame, { minX: -hw, maxX: hw, minZ: -hd, maxZ: hd });
}

/** The frame the box's own coordinates are expressed in, origin at its centre. */
export const obbFrame = (box: OrientedBox): LocalFrame => ({
  originX: box.centreX,
  originZ: box.centreZ,
  rotationRad: box.rotationRad,
});

/**
 * Monotone-chain convex hull, counter-clockwise, no collinear interior points.
 * Fewer than three distinct points yields those points unchanged.
 */
export function convexHull(points: Vec2[], toleranceM = 0): Vec2[] {
  const sorted = points
    .map((p): Vec2 => [p[0], p[1]])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1]);
  if (sorted.length < 3) return sorted;

  const build = (pts: Vec2[]): Vec2[] => {
    const chain: Vec2[] = [];
    for (const p of pts) {
      while (chain.length >= 2) {
        const cross = vecCross(
          [chain[chain.length - 1][0] - chain[chain.length - 2][0], chain[chain.length - 1][1] - chain[chain.length - 2][1]],
          [p[0] - chain[chain.length - 2][0], p[1] - chain[chain.length - 2][1]],
        );
        if (cross > toleranceM) break;
        chain.pop();
      }
      chain.push(p);
    }
    return chain;
  };

  const lower = build(sorted);
  const upper = build(sorted.slice().reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Minimum-area oriented bounding box, by rotating calipers: the optimum always
 * has a side flush with a convex-hull edge, so trying every hull edge direction
 * is exact rather than a search. Ties break towards the SMALLEST rotation, so
 * the answer does not depend on vertex order.
 */
export function minimumAreaObbOfRing(ring: Ring): OrientedBox | null {
  const hull = convexHull(ring);
  if (hull.length === 0) return null;
  if (hull.length < 3) return obbOfRing(ring, 0);

  let best: OrientedBox | null = null;
  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    if (vecDistance(a, b) === 0) continue;
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const box = obbOfRing(hull, angle);
    if (box === null) continue;
    if (
      best === null ||
      orientedBoxArea(box) < orientedBoxArea(best) - 1e-12 ||
      (Math.abs(orientedBoxArea(box) - orientedBoxArea(best)) <= 1e-12 &&
        Math.abs(box.rotationRad) < Math.abs(best.rotationRad))
    ) {
      best = box;
    }
  }
  return best;
}
