// src/lib/generative/generate/partitions.ts
//
// Walls for one level: the exterior envelope, the core enclosure, and the
// interior partitions implied by the spaces the layout pass placed.
//
// METRES throughout, engine-local XZ, origin at the footprint centre, +Z north
// — the frame `generate/types.ts` defines. The spec is millimetres, so the two
// thicknesses read off `spec.dimensions` are the only conversions in this file.
//
// The rule that shapes the whole module: a wall is emitted ONCE. Two coincident
// walls on the same line are a validation failure downstream — they double
// facade area, z-fight in the viewer, and give a door two candidate hosts — so
// every segment passes through a seen-set keyed on its rounded endpoints, and
// every pair of spaces is visited exactly once in a stable order.

import type { BuildingSpec } from "../spec/building-spec";
import type { Polygon, Ring } from "./massing";
import {
  rectDepth,
  rectWidth,
  type CoreLayout,
  type GeneratedWall,
  type PlacedSpace,
  type Rect,
} from "./types";

/** Coordinates arriving from different generators agree to about a millimetre. */
const TOUCH_TOLERANCE_M = 1e-3;

/**
 * Shortest wall worth emitting. 0.9 m is the adjacency threshold the solver
 * uses for "these two rooms really share a boundary", and it reads correctly
 * the other way round too: a 0.4 m stub is an artefact of the subdivision, not
 * a room boundary anyone would build.
 */
const MIN_WALL_LENGTH_M = 0.9;

/**
 * How far inside an OBLIQUE wall its bounded spaces are probed for.
 *
 * Half the shallowest room the space solver will emit (MIN_ROOM_DIM_M is 2 m),
 * so the probe lands inside the space that owns the wall rather than past it.
 */
const OBLIQUE_PROBE_INSET_M = 1.0;

/** Probed at three points, not one: a wall may bound a different space per run. */
const OBLIQUE_PROBE_FRACTIONS = [0.25, 0.5, 0.75];

type Point = [number, number];

/** A wall before it has an id — ids are positional, so they are assigned last. */
type WallDraft = Omit<GeneratedWall, "id">;

/**
 * An axis-aligned segment as an interval on a line: `axis: "x"` is a line of
 * constant X running along Z, `axis: "z"` a line of constant Z running along X.
 * Everything this module compares — shared edges, perimeter coverage, core
 * faces — is orthogonal, and intervals compare far more cheaply and exactly
 * than general 2D segments do.
 */
interface AxisSpan {
  axis: "x" | "z";
  at: number;
  from: number;
  to: number;
}

/** A rect side, plus which way the outside of that rect lies along `axis`. */
interface RectEdge extends AxisSpan {
  outward: -1 | 1;
}

/**
 * Every wall on one level.
 *
 * `spaces` must already be the spaces placed on `floorNo`; this pass treats
 * them as a non-overlapping tiling and does not re-filter them.
 */
export function generateWalls(input: {
  spec: BuildingSpec;
  floorNo: number;
  levelHeightM: number;
  plate: Rect;
  platePolygon: Polygon;
  core: CoreLayout;
  spaces: PlacedSpace[];
}): GeneratedWall[] {
  const { spec, floorNo, levelHeightM, plate, platePolygon, core, spaces } = input;

  const exteriorThicknessM = spec.dimensions.exteriorWallMm.value / 1000;
  const interiorThicknessM = spec.dimensions.interiorWallMm.value / 1000;

  // Space order drives both the pair walk and the resulting id sequence.
  // Sorting by id rather than trusting array order keeps output stable even if
  // an upstream pass reorders its results.
  const ordered = [...spaces].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const outer = outerRing(platePolygon, plate);
  const outerClockwise = isClockwise(outer);
  const perimeterSpans = ringSpans(outer);

  // Whether the core is a solid to build around, or a bare centre line that
  // space-plan.ts fell back to. Step 2 reads this to decide whether to wall the
  // shaft, and step 4 to decide whether the shaft counts as enclosure. The two
  // must agree: a core that is never walled must never be treated as a wall, or
  // a room whose edge lies on the line loses that stretch of its own partition
  // to a neighbour that was never built.
  const coreHasFootprint =
    rectWidth(core.rect) > MIN_WALL_LENGTH_M && rectDepth(core.rect) > MIN_WALL_LENGTH_M;
  const coreEdges = coreHasFootprint ? rectEdges(core.rect) : [];

  const drafts: WallDraft[] = [];
  const seen = new Set<string>();

  // One net for every category, not one per category: an "end" core can push a
  // core face onto the plate edge, and that must resolve to a single wall.
  //
  // The same choke point enforces non-zero length, so no pass can produce a
  // ZERO_LENGTH_WALL (P0 in validate/rules.ts) however it is fed. Each pass does
  // already guard itself — steps 3 and 4 clear MIN_WALL_LENGTH_M, step 1 strips
  // repeated ring vertices, step 2 skips a core with no footprint — but a wall
  // whose start equals its end hosts no opening and draws nothing, and one
  // structural check here is cheaper than trusting four call sites to stay
  // correct as they change.
  const emit = (draft: WallDraft): void => {
    if (samePoint(draft.start, draft.end)) return;
    const key = segmentKey(draft.start, draft.end);
    if (seen.has(key)) return;
    seen.add(key);
    drafts.push(draft);
  };

  /* --- 1. exterior: one wall per segment of the plate's OUTER ring --- */
  // Holes (courtyard / atrium voids) are deliberately not walled here. Walling
  // a void reads as an exterior condition but needs its own compass mapping and
  // glazing rules — a follow-up. Until then a room facing the void gets an
  // interior enclosure wall from step 4 rather than nothing at all.
  for (let i = 0; i < outer.length; i += 1) {
    const start = outer[i];
    const end = outer[(i + 1) % outer.length];
    emit({
      floorNo,
      start: [start[0], start[1]],
      end: [end[0], end[1]],
      thicknessM: exteriorThicknessM,
      heightM: levelHeightM,
      role: "exterior",
      boundsSpaceIds: spacesBoundedBySegment(start, end, outerClockwise, ordered),
      side: compassSide(start, end, outerClockwise),
    });
  }

  /* --- 2. core: the shaft enclosure, built as heavily as the envelope --- */
  //
  // A degenerate core (zero width or depth) is legitimate — space-plan.ts falls
  // back to a centre LINE when the core misses this plate, so a tower level can
  // still be laid out. Walling that line would emit four walls, two of them
  // zero-length, which the validator correctly rejects as P0 ZERO_LENGTH_WALL.
  // There is no enclosure to build around a line, so build none.
  if (coreHasFootprint) {
    const coreRing = ringFromRect(core.rect);
    for (let i = 0; i < coreRing.length; i += 1) {
      const start = coreRing[i];
      const end = coreRing[(i + 1) % coreRing.length];
      emit({
        floorNo,
        start: [start[0], start[1]],
        end: [end[0], end[1]],
        thicknessM: exteriorThicknessM,
        heightM: levelHeightM,
        role: "core",
        boundsSpaceIds: spacesTouching(spanFromSegment(start, end), ordered),
      });
    }
  }

  /* --- 3. interior partitions between adjacent spaces --- */
  // i < j over a sorted array visits each pair once, so the shared edge can
  // only be produced once; the seen-set is the belt to that pair-walk's braces.
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const shared = sharedEdge(ordered[i].rect, ordered[j].rect);
      if (!shared || shared.to - shared.from <= MIN_WALL_LENGTH_M) continue;
      const [start, end] = spanToSegment(shared);
      emit({
        floorNo,
        start,
        end,
        thicknessM: interiorThicknessM,
        heightM: levelHeightM,
        role: "interior",
        boundsSpaceIds: [ordered[i].id, ordered[j].id],
      });
    }
  }

  /* --- 4. free edges: the parts of a room not enclosed by anything else --- */
  // A room bounded on three sides is still an open box. Whatever length of its
  // perimeter abuts no neighbour, no plate edge and no core face gets its own
  // partition, so every space ends up genuinely enclosed.
  for (const space of ordered) {
    for (const edge of rectEdges(space.rect)) {
      const covered: Array<[number, number]> = [];

      for (const other of ordered) {
        if (other === space) continue;
        for (const otherEdge of rectEdges(other.rect)) {
          // Only a rect on the far side of the line abuts this edge; two rooms
          // whose faces point the same way are parallel, not adjacent.
          if (otherEdge.outward !== -edge.outward) continue;
          const overlap = spanOverlap(edge, otherEdge);
          if (overlap) covered.push(overlap);
        }
      }
      // Perimeter and core are solids either side of the line, so direction
      // does not matter: if the room's edge lies on one, it is already walled.
      for (const span of perimeterSpans) {
        const overlap = spanOverlap(edge, span);
        if (overlap) covered.push(overlap);
      }
      for (const coreEdge of coreEdges) {
        const overlap = spanOverlap(edge, coreEdge);
        if (overlap) covered.push(overlap);
      }

      for (const [from, to] of uncoveredIntervals(edge, covered)) {
        const [start, end] = spanToSegment({ ...edge, from, to });
        emit({
          floorNo,
          start,
          end,
          thicknessM: interiorThicknessM,
          heightM: levelHeightM,
          role: "interior",
          boundsSpaceIds: [space.id],
        });
      }
    }
  }

  return drafts.map((draft, index) => ({
    id: `WALL-L${floorNo}-${String(index).padStart(4, "0")}`,
    ...draft,
  }));
}

/* ------------------------------------------------------------------ */
/* Rings                                                               */
/* ------------------------------------------------------------------ */

function outerRing(polygon: Polygon, plate: Rect): Ring {
  const raw = polygon[0] ?? [];

  // Rings are closed by convention, not by a repeated vertex. Strip any the
  // caller added, plus any consecutive duplicate: either would emit a wall of
  // zero length, which nothing downstream can host or draw.
  const ring: Ring = [];
  for (const point of raw) {
    const previous = ring[ring.length - 1];
    if (previous && samePoint(previous, [point[0], point[1]])) continue;
    ring.push([point[0], point[1]]);
  }
  if (ring.length > 1 && samePoint(ring[0], ring[ring.length - 1])) ring.pop();

  // A missing or degenerate plate polygon still deserves an envelope; the
  // bounding rect the caller passed is the honest fallback.
  return ring.length >= 3 ? ring : ringFromRect(plate);
}

/** Counter-clockwise, matching `rectRing` in massing.ts. */
function ringFromRect(rect: Rect): Ring {
  return [
    [rect.minX, rect.minZ],
    [rect.maxX, rect.minZ],
    [rect.maxX, rect.maxZ],
    [rect.minX, rect.maxZ],
  ];
}

/** Shoelace sign. Negative means the ring runs clockwise in the XZ frame. */
function isClockwise(ring: Ring): boolean {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    sum += x1 * z2 - x2 * z1;
  }
  return sum < 0;
}

function ringSpans(ring: Ring): AxisSpan[] {
  const spans: AxisSpan[] = [];
  for (let i = 0; i < ring.length; i += 1) {
    const span = spanFromSegment(ring[i], ring[(i + 1) % ring.length]);
    if (span) spans.push(span);
  }
  return spans;
}

/**
 * Which compass face a plate edge sits on.
 *
 * The outward normal of edge `d = (dx, dz)` on a counter-clockwise ring is
 * `(dz, -dx)`; a clockwise ring flips it, so the compass never inverts on a
 * differently wound footprint. Engine convention is +Z north, so the south edge
 * of a rectangle — running west→east along its low-Z side — normals to -Z.
 * A 45° edge is a tie and resolves to north/south by convention.
 */
function compassSide(start: Point, end: Point, clockwise: boolean): GeneratedWall["side"] {
  const sign = clockwise ? -1 : 1;
  const normalX = sign * (end[1] - start[1]);
  const normalZ = sign * -(end[0] - start[0]);
  if (Math.abs(normalZ) >= Math.abs(normalX)) return normalZ >= 0 ? "north" : "south";
  return normalX >= 0 ? "east" : "west";
}

/* ------------------------------------------------------------------ */
/* Spans                                                               */
/* ------------------------------------------------------------------ */

function rectEdges(rect: Rect): RectEdge[] {
  return [
    { axis: "x", at: rect.minX, from: rect.minZ, to: rect.maxZ, outward: -1 },
    { axis: "x", at: rect.maxX, from: rect.minZ, to: rect.maxZ, outward: 1 },
    { axis: "z", at: rect.minZ, from: rect.minX, to: rect.maxX, outward: -1 },
    { axis: "z", at: rect.maxZ, from: rect.minX, to: rect.maxX, outward: 1 },
  ];
}

/**
 * Interval form of a segment, or null when it is oblique. Every massing ring in
 * the library is orthogonal today; a diagonal plate edge reports no bounded
 * spaces rather than guessing at them.
 */
function spanFromSegment(a: Point, b: Point): AxisSpan | null {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  if (Math.abs(dx) <= TOUCH_TOLERANCE_M && Math.abs(dz) > TOUCH_TOLERANCE_M) {
    return {
      axis: "x",
      at: (a[0] + b[0]) / 2,
      from: Math.min(a[1], b[1]),
      to: Math.max(a[1], b[1]),
    };
  }
  if (Math.abs(dz) <= TOUCH_TOLERANCE_M && Math.abs(dx) > TOUCH_TOLERANCE_M) {
    return {
      axis: "z",
      at: (a[1] + b[1]) / 2,
      from: Math.min(a[0], b[0]),
      to: Math.max(a[0], b[0]),
    };
  }
  return null;
}

function spanToSegment(span: AxisSpan): [Point, Point] {
  return span.axis === "x"
    ? [
        [span.at, span.from],
        [span.at, span.to],
      ]
    : [
        [span.from, span.at],
        [span.to, span.at],
      ];
}

/** Overlapping length of two collinear spans, or null when they miss. */
function spanOverlap(a: AxisSpan, b: AxisSpan): [number, number] | null {
  if (a.axis !== b.axis) return null;
  if (Math.abs(a.at - b.at) > TOUCH_TOLERANCE_M) return null;
  const from = Math.max(a.from, b.from);
  const to = Math.min(a.to, b.to);
  return to - from > TOUCH_TOLERANCE_M ? [from, to] : null;
}

/**
 * The segment two rects share, if any. This is the geometry-returning sibling
 * of `sharedEdgeLength` in types.ts and uses the same precedence: a vertical
 * contact is tested before a horizontal one, so a pair touching only at a
 * corner falls out on the zero-overlap check rather than producing a sliver.
 */
function sharedEdge(a: Rect, b: Rect): AxisSpan | null {
  const verticalAt =
    Math.abs(a.maxX - b.minX) <= TOUCH_TOLERANCE_M
      ? (a.maxX + b.minX) / 2
      : Math.abs(b.maxX - a.minX) <= TOUCH_TOLERANCE_M
        ? (b.maxX + a.minX) / 2
        : null;
  if (verticalAt !== null) {
    const from = Math.max(a.minZ, b.minZ);
    const to = Math.min(a.maxZ, b.maxZ);
    if (to - from > TOUCH_TOLERANCE_M) return { axis: "x", at: verticalAt, from, to };
  }

  const horizontalAt =
    Math.abs(a.maxZ - b.minZ) <= TOUCH_TOLERANCE_M
      ? (a.maxZ + b.minZ) / 2
      : Math.abs(b.maxZ - a.minZ) <= TOUCH_TOLERANCE_M
        ? (b.maxZ + a.minZ) / 2
        : null;
  if (horizontalAt !== null) {
    const from = Math.max(a.minX, b.minX);
    const to = Math.min(a.maxX, b.maxX);
    if (to - from > TOUCH_TOLERANCE_M) return { axis: "z", at: horizontalAt, from, to };
  }

  return null;
}

/** Which spaces have a face on this line — the wall's `boundsSpaceIds`. */
function spacesTouching(span: AxisSpan | null, spaces: PlacedSpace[]): string[] {
  if (!span) return [];
  return spaces
    .filter((space) => rectEdges(space.rect).some((edge) => spanOverlap(span, edge) !== null))
    .map((space) => space.id);
}

const pointInRect = (x: number, z: number, rect: Rect): boolean =>
  x >= rect.minX - TOUCH_TOLERANCE_M &&
  x <= rect.maxX + TOUCH_TOLERANCE_M &&
  z >= rect.minZ - TOUCH_TOLERANCE_M &&
  z <= rect.maxZ + TOUCH_TOLERANCE_M;

/**
 * The spaces a plate-ring segment bounds.
 *
 * Orthogonal edges keep the interval path: it is exact, and it is what every
 * massing ring in the library produces today. An OBLIQUE edge has no interval
 * form, and reporting nothing for it is not neutral — a wall with no bounded
 * spaces gets no door, contributes no adjacency, and leaves the rooms behind it
 * looking unreachable to the circulation pass. So probe instead: step inward
 * along the edge's own normal and take whichever space rects contain the probe.
 *
 * Approximate by construction, and only ever consulted for an edge the exact
 * path cannot describe. Rooms are still world-axis-aligned rects (see the
 * limitation noted in space-plan.ts), so a probe is the honest answer until they
 * are not.
 */
function spacesBoundedBySegment(
  start: Point,
  end: Point,
  clockwise: boolean,
  spaces: PlacedSpace[],
): string[] {
  const span = spanFromSegment(start, end);
  if (span) return spacesTouching(span, spaces);

  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz);
  if (length <= TOUCH_TOLERANCE_M) return [];

  // Outward normal of a counter-clockwise ring edge is (dz, -dx) — the same
  // derivation `compassSide` uses — so inward is its negative.
  const sign = clockwise ? -1 : 1;
  const inwardX = (-sign * dz) / length;
  const inwardZ = (sign * dx) / length;

  const hits = new Set<string>();
  for (const t of OBLIQUE_PROBE_FRACTIONS) {
    const px = start[0] + dx * t + inwardX * OBLIQUE_PROBE_INSET_M;
    const pz = start[1] + dz * t + inwardZ * OBLIQUE_PROBE_INSET_M;
    for (const space of spaces) {
      if (pointInRect(px, pz, space.rect)) hits.add(space.id);
    }
  }
  // Filtered over `spaces` rather than emitted from the set, so the order is the
  // caller's stable one and not insertion order.
  return spaces.filter((space) => hits.has(space.id)).map((space) => space.id);
}

/**
 * What is left of a span once the covered stretches are removed. Slivers below
 * the minimum wall length are dropped: an edge covered to within 200 mm is
 * enclosed for every practical purpose, and a 200 mm wall is noise in the model.
 */
function uncoveredIntervals(
  span: AxisSpan,
  covered: Array<[number, number]>,
): Array<[number, number]> {
  const sorted = [...covered].sort((a, b) => a[0] - b[0]);
  const gaps: Array<[number, number]> = [];
  let cursor = span.from;

  for (const [from, to] of sorted) {
    if (to <= cursor) continue;
    if (from > cursor) gaps.push([cursor, Math.min(from, span.to)]);
    cursor = Math.max(cursor, to);
    if (cursor >= span.to) break;
  }
  if (cursor < span.to) gaps.push([cursor, span.to]);

  return gaps.filter(([from, to]) => to - from > MIN_WALL_LENGTH_M);
}

/* ------------------------------------------------------------------ */
/* Keys                                                                */
/* ------------------------------------------------------------------ */

/** Order-independent key at 1 mm resolution — the dedup net for every wall. */
function segmentKey(start: Point, end: Point): string {
  const a = pointKey(start);
  const b = pointKey(end);
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

function pointKey(point: Point): string {
  // `Math.round` can return -0, which stringifies to "0", so a coordinate
  // approaching zero from either side lands on the same key.
  return `${Math.round(point[0] / TOUCH_TOLERANCE_M)},${Math.round(point[1] / TOUCH_TOLERANCE_M)}`;
}

function samePoint(a: Point, b: Point): boolean {
  return (
    Math.abs(a[0] - b[0]) <= TOUCH_TOLERANCE_M && Math.abs(a[1] - b[1]) <= TOUCH_TOLERANCE_M
  );
}
