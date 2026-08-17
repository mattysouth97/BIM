// src/lib/generative/blueprint/segment-curves.ts
//
// CurveSegment (blueprint-spec's wire format: line/polyline/bezier/arc, mm,
// centre+endpoints+sweep for arcs) → PlanCurve (geom's tessellation format:
// centre+radius+signed angles for arcs). Both `compile.ts` and
// `validate-blueprint.ts` need this exact reading — the compiler to turn a
// loop into the ring it builds geometry from, the validator to turn the same
// loop into the ring it checks for closure and self-intersection — and they
// must tessellate IDENTICALLY. A blueprint that validates clean has to
// compile to the same ring the validator inspected, and a second, subtly
// different implementation of "what curve does this segment describe" could
// put the two on opposite sides of a tolerance: a loop that passes validation
// and then fails to compile, or compiles fine after being reported broken, on
// input neither module actually got wrong. So the adapter lives here once,
// and both import it.

import { arc, bezier, line, polyline, type PlanCurve, type Vec2 } from "../geom";
import type { CurveSegment, PointMm } from "./blueprint-spec";

/**
 * Chord tolerance for turning curved boundary segments into rings, in
 * millimetres. 50 mm is a twentieth of a typical drawn wall thickness — far
 * below anything a plan reader could have resolved, and coarse enough that a
 * traced arc does not explode into hundreds of vertices.
 */
export const TESSELLATION_TOLERANCE_MM = 50;

const pointVec = (p: PointMm): Vec2 => [p.xMm, p.zMm];

/**
 * Blueprint arcs store centre + endpoints + sweep; `geom`'s arc stores centre +
 * radius + start/end angle, where the SIGNED difference carries the direction.
 * The angles are derived from the centre↔endpoint vectors, exactly as
 * blueprint-spec.ts promises, and the sweep is unwrapped into the requested
 * direction so a half-turn is never mistaken for its complement.
 */
function arcCurve(segment: Extract<CurveSegment, { kind: "arc" }>): PlanCurve {
  const centre = pointVec(segment.centerMm);
  const start = pointVec(segment.startMm);
  const end = pointVec(segment.endMm);
  const radius = Math.hypot(start[0] - centre[0], start[1] - centre[1]);
  const a0 = Math.atan2(start[1] - centre[1], start[0] - centre[0]);
  let a1 = Math.atan2(end[1] - centre[1], end[0] - centre[0]);
  const TAU = Math.PI * 2;
  if (segment.sweep === "ccw") {
    while (a1 <= a0) a1 += TAU;
  } else {
    while (a1 >= a0) a1 -= TAU;
  }
  return arc(centre, radius, a0, a1);
}

/** A blueprint's own curve segment as the `PlanCurve` `geom/` tessellates. */
export function segmentToCurve(segment: CurveSegment): PlanCurve {
  switch (segment.kind) {
    case "line":
      return line(pointVec(segment.startMm), pointVec(segment.endMm));
    case "polyline":
      return polyline(segment.pointsMm.map(pointVec), false);
    case "bezier":
      return bezier(
        pointVec(segment.startMm),
        pointVec(segment.control1Mm),
        pointVec(segment.control2Mm),
        pointVec(segment.endMm),
      );
    case "arc":
      return arcCurve(segment);
  }
}
