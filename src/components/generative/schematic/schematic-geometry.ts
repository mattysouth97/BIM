// src/components/generative/schematic/schematic-geometry.ts
//
// BlueprintSpec → drawable outlines, in millimetres.
//
// Display tessellation only: the numbers here decide how a curve LOOKS on a
// 600 px canvas, never what gets built. The build path tessellates
// independently in `blueprint/compile.ts` at its own tolerance, so a coarse
// preview can never coarsen a footprint.

import type {
  BlueprintSpec,
  BoundaryLoop,
  CurveSegment,
  PointMm,
  Region,
} from "@/lib/generative/blueprint";

import { boundsOfPoints, mergeBounds, type BoundsMm } from "./view-transform";

/** Display-only sampling of an arc or Bézier. */
const CURVE_STEPS = 24;

const point = (xMm: number, zMm: number): PointMm => ({ xMm, zMm });

function sampleArc(segment: Extract<CurveSegment, { kind: "arc" }>): PointMm[] {
  const cx = segment.centerMm.xMm;
  const cz = segment.centerMm.zMm;
  const radius = Math.hypot(segment.startMm.xMm - cx, segment.startMm.zMm - cz);
  const a0 = Math.atan2(segment.startMm.zMm - cz, segment.startMm.xMm - cx);
  let a1 = Math.atan2(segment.endMm.zMm - cz, segment.endMm.xMm - cx);
  const TAU = Math.PI * 2;
  if (segment.sweep === "ccw") {
    while (a1 <= a0) a1 += TAU;
  } else {
    while (a1 >= a0) a1 -= TAU;
  }
  const out: PointMm[] = [];
  for (let i = 0; i <= CURVE_STEPS; i += 1) {
    const angle = a0 + ((a1 - a0) * i) / CURVE_STEPS;
    out.push(point(cx + radius * Math.cos(angle), cz + radius * Math.sin(angle)));
  }
  return out;
}

function sampleBezier(segment: Extract<CurveSegment, { kind: "bezier" }>): PointMm[] {
  const out: PointMm[] = [];
  for (let i = 0; i <= CURVE_STEPS; i += 1) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    out.push(
      point(
        w0 * segment.startMm.xMm +
          w1 * segment.control1Mm.xMm +
          w2 * segment.control2Mm.xMm +
          w3 * segment.endMm.xMm,
        w0 * segment.startMm.zMm +
          w1 * segment.control1Mm.zMm +
          w2 * segment.control2Mm.zMm +
          w3 * segment.endMm.zMm,
      ),
    );
  }
  return out;
}

function segmentPoints(segment: CurveSegment): PointMm[] {
  switch (segment.kind) {
    case "line":
      return [segment.startMm, segment.endMm];
    case "polyline":
      return [...segment.pointsMm];
    case "arc":
      return sampleArc(segment);
    case "bezier":
      return sampleBezier(segment);
  }
}

/** Vertices of a loop, without repeating the closing point. */
export function loopPoints(loop: BoundaryLoop): PointMm[] {
  const out: PointMm[] = [];
  for (const segment of loop.segments) {
    for (const p of segmentPoints(segment)) {
      const last = out[out.length - 1];
      if (last && last.xMm === p.xMm && last.zMm === p.zMm) continue;
      out.push(p);
    }
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && first && last && first.xMm === last.xMm && first.zMm === last.zMm) {
    out.pop();
  }
  return out;
}

export function loopIndexOf(spec: BlueprintSpec): Map<string, BoundaryLoop> {
  const map = new Map<string, BoundaryLoop>();
  const add = (loop: BoundaryLoop) => {
    if (!map.has(loop.id)) map.set(loop.id, loop);
  };
  for (const boundary of spec.boundaries) add(boundary.loop);
  for (const item of [...spec.voids, ...spec.cores, ...spec.zones]) {
    if (item.region.kind === "loop") add(item.region.loop);
  }
  return map;
}

export function regionPoints(
  region: Region,
  loops: Map<string, BoundaryLoop>,
): PointMm[] {
  switch (region.kind) {
    case "loop":
      return loopPoints(region.loop);
    case "loopRef": {
      const loop = loops.get(region.loopId);
      return loop ? loopPoints(loop) : [];
    }
    case "rect": {
      const hw = region.widthMm / 2;
      const hd = region.depthMm / 2;
      const cos = Math.cos(region.rotationRad);
      const sin = Math.sin(region.rotationRad);
      return (
        [
          [-hw, -hd],
          [hw, -hd],
          [hw, hd],
          [-hw, hd],
        ] as const
      ).map(([lx, lz]) =>
        point(
          region.originMm.xMm + lx * cos - lz * sin,
          region.originMm.zMm + lx * sin + lz * cos,
        ),
      );
    }
  }
}

export type SchematicShapeKind = "boundary" | "void" | "core" | "zone";

export interface SchematicShape {
  id: string;
  kind: SchematicShapeKind;
  pointsMm: PointMm[];
  label: string;
  floorNos: number[];
  /** Void kind or zone program — what the fill is meant to say. */
  detail?: string;
}

/** Everything with an outline, in draw order: boundary, void, core, zone. */
export function schematicShapes(spec: BlueprintSpec): SchematicShape[] {
  const loops = loopIndexOf(spec);
  const out: SchematicShape[] = [];

  for (const boundary of spec.boundaries) {
    out.push({
      id: boundary.loop.id,
      kind: "boundary",
      pointsMm: loopPoints(boundary.loop),
      label: boundary.loop.id,
      floorNos: boundary.floorNos,
      detail: boundary.role,
    });
  }
  for (const item of spec.voids) {
    out.push({
      id: item.id,
      kind: "void",
      pointsMm: regionPoints(item.region, loops),
      label: item.label ?? item.id,
      floorNos: item.floorNos,
      detail: item.kind.value,
    });
  }
  for (const item of spec.cores) {
    out.push({
      id: item.id,
      kind: "core",
      pointsMm: regionPoints(item.region, loops),
      label: item.label ?? item.id,
      floorNos: item.floorNos,
      detail: item.contents.join(" + ") || "core",
    });
  }
  for (const item of spec.zones) {
    out.push({
      id: item.id,
      kind: "zone",
      pointsMm: regionPoints(item.region, loops),
      label: item.label ?? item.id,
      floorNos: item.floorNos,
      detail: item.program.value,
    });
  }

  return out;
}

/** Extent of everything drawn, including anchors and circulation nodes. */
export function blueprintBounds(spec: BlueprintSpec): BoundsMm | null {
  let bounds: BoundsMm | null = null;
  for (const shape of schematicShapes(spec)) {
    bounds = mergeBounds(bounds, boundsOfPoints(shape.pointsMm));
  }
  bounds = mergeBounds(bounds, boundsOfPoints(spec.anchors.map((a) => a.positionMm)));
  bounds = mergeBounds(
    bounds,
    boundsOfPoints(spec.circulation.nodes.map((n) => n.positionMm)),
  );
  return bounds;
}

/** Bounds of the boundary loops that cover a level — the plate outline. */
export function boundaryBoundsForFloor(
  spec: BlueprintSpec,
  floorNo: number,
): BoundsMm | null {
  let bounds: BoundsMm | null = null;
  for (const boundary of spec.boundaries) {
    if (!boundary.floorNos.includes(floorNo)) continue;
    bounds = mergeBounds(bounds, boundsOfPoints(loopPoints(boundary.loop)));
  }
  return bounds;
}

/** An SVG path `d` for a closed ring of world points, already projected. */
export function pathOf(points: readonly { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  return `${points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")} Z`;
}
