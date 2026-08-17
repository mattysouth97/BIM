// src/lib/interior/transform.ts
//
// Transform composition, without importing three.
//
// This layer is pure data: it runs in vitest, in a worker, and on the server
// with no WebGL context anywhere. Composing the 16 numbers by hand keeps it
// that way, and the result matches
// `new THREE.Matrix4().compose(position, quaternionFromYaw, scale).elements`
// to the rounding below.

import type { Matrix4Elements } from "./types";

/** Micrometre precision: enough for a building, tight enough to be stable. */
export const round6 = (n: number): number => {
  const r = Number(n.toFixed(6));
  // `-0` and `0` stringify differently, and the determinism test compares strings.
  return r === 0 ? 0 : r;
};

export const roundTriple = (
  v: readonly [number, number, number],
): [number, number, number] => [round6(v[0]), round6(v[1]), round6(v[2])];

/**
 * T · Ry(θ) · S, in three.js `Matrix4.elements` COLUMN-major order.
 *
 * three.js `makeRotationY(θ)` sends local +X to world (cos θ, 0, −sin θ), so
 * pairing this with `headingYFromAxis` (= atan2(−dz, dx)) lays a unit box's
 * local +X exactly along start→end. See the convention note in walls.ts.
 */
export function composeTrs(
  position: readonly [number, number, number],
  rotationY: number,
  scale: readonly [number, number, number],
): Matrix4Elements {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const [sx, sy, sz] = scale;
  const [tx, ty, tz] = position;
  // Rounded like every other float this layer emits: at metre scale a 1e-6
  // residue is noise, and leaving it in makes the matrix of an axis-aligned
  // wall read as very slightly skewed.
  return [
    c * sx, 0, -s * sx, 0,
    0, sy, 0, 0,
    s * sz, 0, c * sz, 0,
    tx, ty, tz, 1,
  ].map(round6);
}
