// src/lib/generative/geom/index.ts
//
// The 2D geometry kernel the generative engine is built on. One place that owns
// "what is a ring", so massing, the space solver, the CAD ingest and the wall
// generator cannot each answer it slightly differently.
//
// ─── Conventions, binding on every function in this directory ───────────────
//
// UNITS    METRES. Millimetres exist only in `spec/` and are converted in
//          `massing.ts` / `spec-to-recipe.ts`; nothing here ever sees one.
//
// PLANE    XZ, with a point written `[x, z]`. This is the plan plane of
//          `BuildingRecipe.footprintPolygon` and of everything in `generate/`.
//          Y (height) is not this kernel's business.
//
// ANGLES   RADIANS, increasing from +X towards +Z. A positive rotation and a
//          counter-clockwise ring share that sense, so rotating a valid ring can
//          never invalidate its winding.
//
// RINGS    `Ring = [x, z][]`, OPEN: the edge from the last vertex back to the
//          first is implied and never stored. A closed ring handed in is
//          normalised, not rejected.
//
// WINDING  `Polygon = [outer, ...holes]` with the OUTER ring COUNTER-CLOCKWISE
//          (positive shoelace area) and every HOLE CLOCKWISE — earcut's
//          expectation, and what `generate/massing.ts` already emits. Boolean
//          results are re-wound to this convention before they are returned.
//
// PARTS    Boolean operations return a `MultiPolygon`, because an intersection
//          or a difference is genuinely allowed to be several disjoint pieces.
//          Callers that need one shape take `largestPolygon`.
//
// TOLERANCE is an argument, never a hidden constant. `GEOM_EPS_M` and
//          `DEFAULT_CURVE_TOLERANCE_M` are exported defaults, not private ones.
//
// PURITY   No `Math.random`, no `Date.now`, no mutation of arguments. Every
//          function is a pure function of its inputs; identical inputs give
//          byte-identical outputs, which is what the whole engine's determinism
//          contract rests on.
//
// `Ring` and `Polygon` here are structurally identical to the ones exported by
// `generate/massing.ts`, so values cross between the two without conversion.
//
// Booleans are delegated to `polygon-clipping` (Martinez sweep-line, MIT) and
// wrapped so its closed-ring format never reaches a caller.

export {
  /* types */
  type Vec2,
  type Ring,
  type Polygon,
  type MultiPolygon,
  type Rect,
  type OffsetOptions,
  type InscribedRectOptions,
  /* constants */
  GEOM_EPS_M,
  /* vectors */
  vecAdd,
  vecSub,
  vecScale,
  vecDot,
  vecCross,
  vecLength,
  vecDistance,
  vecNormalize,
  vecLerp,
  vecEquals,
  /* winding + area */
  signedRingArea,
  ringArea,
  polygonArea,
  multiPolygonArea,
  isRingCCW,
  ensureWinding,
  ensurePolygonWinding,
  largestPolygon,
  dedupeRing,
  /* bounds */
  ringBounds,
  polygonBounds,
  polygonBoundsRotated,
  /* rects */
  rectWidth,
  rectDepth,
  rectArea,
  rectCentre,
  rectToRing,
  rectToPolygon,
  /* point predicates */
  distanceToSegment,
  pointOnRing,
  pointInRing,
  pointInPolygon,
  /* segments */
  segmentIntersection,
  segmentsOverlapCollinear,
  ringSelfIntersects,
  /* booleans */
  normalisePolygon,
  polygonUnion,
  polygonIntersection,
  polygonDifference,
  polygonXor,
  unionAll,
  intersectAll,
  differenceAll,
  /* offset */
  offsetRing,
  offsetPolygon,
  /* rect ↔ polygon, for the space solver */
  clipRectToPolygon,
  rectPolygonOverlap,
  rectPolygonIntersection,
  largestInscribedAxisAlignedRect,
} from "./polygon";

export {
  /* types */
  type PlanCurve,
  type LineCurve,
  type ArcCurve,
  type PolylineCurve,
  type BezierCurve,
  type SplineCurve,
  type CurveLoopOptions,
  /* constants */
  DEFAULT_CURVE_TOLERANCE_M,
  /* constructors */
  line,
  arc,
  polyline,
  bezier,
  spline,
  /* evaluation */
  curveStart,
  curveEnd,
  curveLength,
  evaluateCurve,
  curveTangent,
  curvePointAtDistance,
  /* tessellation */
  arcSegmentCount,
  tessellateCurve,
  curveLoopToRing,
} from "./curves";

export {
  /* types */
  type LocalFrame,
  type OrientedBox,
  /* constants */
  IDENTITY_FRAME,
  makeFrame,
  /* rotation */
  rotatePoint,
  rotateRing,
  rotatePolygon,
  /* frame conversions */
  toWorldPoint,
  toLocalPoint,
  toWorldDirection,
  toLocalDirection,
  toWorldRing,
  toLocalRing,
  toWorldPolygon,
  toLocalPolygon,
  rectToWorldRing,
  rectToLocalRing,
  rectToWorldBounds,
  rectToLocalBounds,
  /* frame algebra */
  invertFrame,
  composeFrames,
  /* oriented boxes */
  obbOfRing,
  obbCorners,
  obbFrame,
  orientedBoxArea,
  convexHull,
  minimumAreaObbOfRing,
} from "./frame";

export {
  /* types */
  type Segment,
  type LoopOptions,
  type CleanupOptions,
  /* segment repair */
  segmentLength,
  snapEndpoints,
  removeZeroLength,
  removeDuplicateSegments,
  closeSmallGaps,
  planarizeSegments,
  cleanupSegments,
  /* collinear */
  mergeCollinear,
  mergeCollinearPolyline,
  mergeCollinearSegments,
  /* loops */
  detectClosedLoops,
} from "./cleanup";
