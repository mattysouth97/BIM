// Snap engine for authoring: grid, endpoints, midpoints, intersections, ortho.

import { projectOnSegment, segmentIntersection, type Xz } from "./geometry";
import type { BimElement, BimGrid } from "./types";

export type SnapKind = "grid" | "endpoint" | "midpoint" | "intersection" | "ortho" | "none";

export interface SnapResult {
  point: Xz;
  kind: SnapKind;
  distance: number;
}

export interface SnapContext {
  grids?: BimGrid[];
  walls?: BimElement[];
  spacing?: number;
  orthoFrom?: Xz | null;
  maxDistance?: number;
}

function wallEnds(el: BimElement): { start: Xz; end: Xz } | null {
  const x0 = el.instanceParameters.startX;
  const z0 = el.instanceParameters.startZ;
  const x1 = el.instanceParameters.endX;
  const z1 = el.instanceParameters.endZ;
  if (typeof x0 !== "number" || typeof z0 !== "number" || typeof x1 !== "number" || typeof z1 !== "number") {
    return null;
  }
  return { start: { x: x0, z: z0 }, end: { x: x1, z: z1 } };
}

export function snapPoint(raw: Xz, ctx: SnapContext = {}): SnapResult {
  const max = ctx.maxDistance ?? 0.35;
  let best: SnapResult = { point: raw, kind: "none", distance: Infinity };

  const consider = (point: Xz, kind: SnapKind) => {
    const distance = Math.hypot(point.x - raw.x, point.z - raw.z);
    if (distance <= max && distance < best.distance) best = { point, kind, distance };
  };

  const spacing = ctx.spacing ?? 1;
  consider(
    { x: Math.round(raw.x / spacing) * spacing, z: Math.round(raw.z / spacing) * spacing },
    "grid",
  );

  for (const grid of ctx.grids ?? []) {
    if (grid.axis === "x") consider({ x: grid.offset, z: raw.z }, "grid");
    else consider({ x: raw.x, z: grid.offset }, "grid");
  }

  const walls = (ctx.walls ?? []).filter((w) => w.kind === "wall");
  const axes = walls.map(wallEnds).filter((a): a is { start: Xz; end: Xz } => a !== null);
  for (const axis of axes) {
    consider(axis.start, "endpoint");
    consider(axis.end, "endpoint");
    consider(
      { x: (axis.start.x + axis.end.x) / 2, z: (axis.start.z + axis.end.z) / 2 },
      "midpoint",
    );
  }
  for (let i = 0; i < axes.length; i++) {
    for (let j = i + 1; j < axes.length; j++) {
      const hit = segmentIntersection(axes[i].start, axes[i].end, axes[j].start, axes[j].end);
      if (hit) consider(hit, "intersection");
    }
  }

  if (ctx.orthoFrom) {
    const dx = Math.abs(raw.x - ctx.orthoFrom.x);
    const dz = Math.abs(raw.z - ctx.orthoFrom.z);
    if (dx >= dz) consider({ x: raw.x, z: ctx.orthoFrom.z }, "ortho");
    else consider({ x: ctx.orthoFrom.x, z: raw.z }, "ortho");
  }

  if (best.kind === "none") return { point: raw, kind: "none", distance: 0 };
  return best;
}

export function nearestWall(
  point: Xz,
  walls: BimElement[],
  maxDistance = 1.2,
): { wall: BimElement; t: number; point: Xz; distance: number } | null {
  let best: { wall: BimElement; t: number; point: Xz; distance: number } | null = null;
  for (const wall of walls) {
    if (wall.kind !== "wall") continue;
    const axis = wallEnds(wall);
    if (!axis) continue;
    const hit = projectOnSegment(point, axis.start, axis.end);
    if (hit.distance > maxDistance) continue;
    if (!best || hit.distance < best.distance) {
      best = { wall, t: hit.t, point: hit.point, distance: hit.distance };
    }
  }
  return best;
}
