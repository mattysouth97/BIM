// Linear BIM geometry in the twin XZ plane (Y is elevation).

export interface Xz {
  x: number;
  z: number;
}

export interface WallAxis {
  start: Xz;
  end: Xz;
  length: number;
  headingY: number;
}

/** Align local +X (wall length) with start→end in world XZ. */
export function headingYFromAxis(start: Xz, end: Xz): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  return Math.atan2(-dz, dx);
}

export function wallAxis(start: Xz, end: Xz): WallAxis {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  return { start, end, length, headingY: headingYFromAxis(start, end) };
}

export function projectOnSegment(point: Xz, start: Xz, end: Xz): {
  point: Xz;
  t: number;
  distance: number;
} {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-8) {
    return { point: start, t: 0, distance: Math.hypot(point.x - start.x, point.z - start.z) };
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / len2));
  const proj = { x: start.x + dx * t, z: start.z + dz * t };
  return {
    point: proj,
    t,
    distance: Math.hypot(point.x - proj.x, point.z - proj.z),
  };
}

export function segmentIntersection(a0: Xz, a1: Xz, b0: Xz, b1: Xz): Xz | null {
  const dax = a1.x - a0.x;
  const daz = a1.z - a0.z;
  const dbx = b1.x - b0.x;
  const dbz = b1.z - b0.z;
  const den = dax * dbz - daz * dbx;
  if (Math.abs(den) < 1e-10) return null;
  const t = ((b0.x - a0.x) * dbz - (b0.z - a0.z) * dbx) / den;
  const u = ((b0.x - a0.x) * daz - (b0.z - a0.z) * dax) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a0.x + t * dax, z: a0.z + t * daz };
}

export function rectangleFromCorners(a: Xz, b: Xz): { min: Xz; max: Xz; width: number; depth: number; area: number } {
  const min = { x: Math.min(a.x, b.x), z: Math.min(a.z, b.z) };
  const max = { x: Math.max(a.x, b.x), z: Math.max(a.z, b.z) };
  const width = max.x - min.x;
  const depth = max.z - min.z;
  return { min, max, width, depth, area: width * depth };
}
