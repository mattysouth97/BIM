// src/lib/generative/generate/space-plan.ts
//
// The space planning solver: guillotine subdivision around the core, then
// rectangular packing of the declared program into the resulting bands.
//
// Everything here is METRES in the engine's local XZ frame (see types.ts).
// The spec is millimetres, so every value read off it is divided by 1000.
//
// WHY grid-aligned recursive subdivision rather than a general packer or an
// optimiser: it is deterministic, it can never emit overlapping or non-convex
// rooms, and its cuts land parallel to the orthogonal structural grid the rest
// of the engine assumes. A stochastic packer would produce a prettier plan on
// its best run and an unbuildable one on its worst; this produces the same
// honest plan every time.
//
// WHY rooms are only ever sliced ACROSS a corridor rather than in two rows:
// a room that does not touch circulation is not a room, it is a void. Slicing
// perpendicular to the corridor makes "every room opens onto a corridor" true
// by construction instead of true by later repair.
//
// POLYGON PLATES. The guillotine still cuts the plate's BOUNDING BOX into four
// bands, because band orientation is what gives corridors their relationship to
// the core. What changed is that a band is no longer assumed to be floor: it is
// decomposed into `solidCells` — axis-aligned rectangles that lie WHOLLY inside
// the real plate polygon, holes respected — and each cell is laid out
// independently. Every strip, every corridor and every room is a sub-rect of a
// verified cell, so "no space escapes the plate" is structural rather than
// checked after the fact. On a plain rectangle a band decomposes to itself, so
// that path is unchanged to the last bit.
//
// LIMITATION: rooms remain world-axis-aligned. A rotated wing needs the solve to
// run in that wing's LocalFrame (geom/frame.ts) and the result rotated back;
// that is a later phase and is deliberately not attempted here.

import type { Rng } from "../rng";
import type { BuildingSpec, ProgramItem, SpaceType } from "../spec/building-spec";
import { MIN_AREA_SQM } from "../spec/defaults";
import { clipRectToPolygon, rectToPolygon, GEOM_EPS_M } from "../geom";
import type { Polygon } from "./massing";
import {
  rectArea,
  rectDepth,
  rectWidth,
  sharedEdgeLength,
  type CoreLayout,
  type PlacedSpace,
  type Rect,
} from "./types";

/* ------------------------------------------------------------------ */
/* Tuning                                                              */
/* ------------------------------------------------------------------ */

const EPS = 1e-6;
/** Bands thinner than this are not floor area, they are construction slop. */
const MIN_BAND_M = 2.0;
/** No room may be thinner than this in EITHER direction — area alone is not
 *  enough to keep a 0.4 m × 30 m "office" out of the model. */
const MIN_ROOM_DIM_M = 2.0;
/** types.ts: a shared wall shorter than this cannot host a door. */
const ADJACENT_EDGE_M = 0.9;
/** "Touches the perimeter" tolerance, per the PlacedSpace contract. */
const PERIMETER_TOL_M = 1e-3;
/** Leftover band length is shared out, but a room never grows past this
 *  multiple of its target — otherwise one storeroom eats a whole wing. */
const STRETCH_CAP = 1.75;
const STRETCH_ROUNDS = 3;

const PRIORITY_RANK: Record<ProgramItem["priority"], number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

type Axis = "x" | "z";

/* ------------------------------------------------------------------ */
/* Rect helpers                                                        */
/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function intersect(a: Rect, b: Rect): Rect {
  return {
    minX: Math.max(a.minX, b.minX),
    minZ: Math.max(a.minZ, b.minZ),
    maxX: Math.min(a.maxX, b.maxX),
    maxZ: Math.min(a.maxZ, b.maxZ),
  };
}

/**
 * Does this rect have a face on the building envelope?
 *
 * The bounding-box test is kept as the fast path AND as the compatibility path:
 * on a rectangular plate it is exactly the ring test. The ring test is what a
 * non-convex plate needs — a room on the inside face of an L's notch touches the
 * real perimeter while sitting nowhere near the bbox edge.
 *
 * `outerOnly` is the outer ring WITHOUT holes on purpose: partitions.ts does not
 * wall a courtyard void yet, so a room facing one has no exterior wall to host a
 * window on, and claiming otherwise would make the model lie.
 */
function touchesPerimeter(rect: Rect, plate: Rect, outerOnly: Polygon): boolean {
  if (
    Math.abs(rect.minX - plate.minX) < PERIMETER_TOL_M ||
    Math.abs(rect.maxX - plate.maxX) < PERIMETER_TOL_M ||
    Math.abs(rect.minZ - plate.minZ) < PERIMETER_TOL_M ||
    Math.abs(rect.maxZ - plate.maxZ) < PERIMETER_TOL_M
  ) {
    return true;
  }
  // Grown by the same tolerance: if the enlarged rect no longer fits the ring,
  // the original had a face on it.
  const grown: Rect = {
    minX: rect.minX - PERIMETER_TOL_M,
    maxX: rect.maxX + PERIMETER_TOL_M,
    minZ: rect.minZ - PERIMETER_TOL_M,
    maxZ: rect.maxZ + PERIMETER_TOL_M,
  };
  return !clipRectToPolygon(grown, outerOnly, GEOM_EPS_M);
}

const otherAxis = (axis: Axis): Axis => (axis === "x" ? "z" : "x");

/**
 * Build a rect from band-local coordinates: `out` runs from the core face to
 * the perimeter, `along` runs parallel to the core face.
 */
function fromBandCoords(
  outAxis: Axis,
  outMin: number,
  outMax: number,
  alongMin: number,
  alongMax: number,
): Rect {
  return outAxis === "x"
    ? { minX: outMin, maxX: outMax, minZ: alongMin, maxZ: alongMax }
    : { minX: alongMin, maxX: alongMax, minZ: outMin, maxZ: outMax };
}

/* ------------------------------------------------------------------ */
/* Solid decomposition                                                 */
/* ------------------------------------------------------------------ */

/**
 * How far inside a slab the inside-test is sampled. Small enough that no real
 * plate feature is stepped over, large enough that a sample never lands exactly
 * on a vertex — which is the one input the even-odd crossing rule cannot answer.
 */
const SLAB_SAMPLE_INSET_M = 1e-4;

type ZInterval = [number, number];

/**
 * The z-intervals the vertical line `x` spends inside the polygon, even-odd over
 * every ring at once — which is exactly right for `[outer, ...holes]`, since a
 * hole adds a second pair of crossings and so subtracts its own interior.
 *
 * `x` must not coincide with a vertex; callers sample strictly inside a slab.
 */
function verticalInsideIntervals(polygon: Polygon, x: number): ZInterval[] {
  const crossings: number[] = [];
  for (const ring of polygon) {
    const n = ring.length;
    if (n < 3) continue;
    for (let i = 0; i < n; i += 1) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % n];
      if (ax === bx) continue;
      // Half-open in x, so a vertex shared by two edges is counted once.
      if (x < Math.min(ax, bx) || x >= Math.max(ax, bx)) continue;
      crossings.push(az + ((x - ax) / (bx - ax)) * (bz - az));
    }
  }
  crossings.sort((a, b) => a - b);

  const intervals: ZInterval[] = [];
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    if (crossings[i + 1] - crossings[i] > EPS) {
      intervals.push([crossings[i], crossings[i + 1]]);
    }
  }
  return intervals;
}

/** Both lists are sorted and disjoint, so one linear walk suffices. */
function intersectIntervals(a: ZInterval[], b: ZInterval[]): ZInterval[] {
  const out: ZInterval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]);
    const hi = Math.min(a[i][1], b[j][1]);
    if (hi - lo > EPS) out.push([lo, hi]);
    if (a[i][1] < b[j][1]) i += 1;
    else j += 1;
  }
  return out;
}

function sameIntervals(a: ZInterval[], b: ZInterval[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (interval, i) =>
      Math.abs(interval[0] - b[i][0]) <= EPS && Math.abs(interval[1] - b[i][1]) <= EPS,
  );
}

/**
 * `region ∩ polygon`, expressed as axis-aligned rectangles that are each WHOLLY
 * inside the polygon.
 *
 * Vertical-slab decomposition: cut at every polygon vertex x inside the region,
 * then take the inside-intervals of each slab. For a rectilinear plate — every
 * massing strategy in the library — this is EXACT, and a slab whose intervals
 * match its neighbour's is merged back, so a plain rectangle decomposes to
 * itself rather than to a row of pieces. For an oblique edge the three samples
 * per slab make the answer a conservative UNDER-estimate: floor is lost near the
 * diagonal, none is invented. Either way every cell is verified with
 * `clipRectToPolygon` before it is returned, which is what lets the packing
 * below treat "inside the plate" as structural.
 */
function solidCells(region: Rect, polygon: Polygon): Rect[] {
  if (rectWidth(region) <= EPS || rectDepth(region) <= EPS) return [];

  const cuts = [region.minX, region.maxX];
  for (const ring of polygon) {
    for (const [x] of ring) {
      if (x > region.minX + EPS && x < region.maxX - EPS) cuts.push(x);
    }
  }
  cuts.sort((a, b) => a - b);

  const slabs: Array<{ minX: number; maxX: number; intervals: ZInterval[] }> = [];
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const x0 = cuts[i];
    const x1 = cuts[i + 1];
    if (x1 - x0 <= EPS) continue;

    const inset = Math.min(SLAB_SAMPLE_INSET_M, (x1 - x0) / 4);
    let intervals = verticalInsideIntervals(polygon, x0 + inset);
    for (const x of [(x0 + x1) / 2, x1 - inset]) {
      if (intervals.length === 0) break;
      intervals = intersectIntervals(intervals, verticalInsideIntervals(polygon, x));
    }

    const clipped = intervals
      .map(([lo, hi]): ZInterval => [Math.max(lo, region.minZ), Math.min(hi, region.maxZ)])
      .filter(([lo, hi]) => hi - lo > EPS);
    if (clipped.length === 0) continue;

    const previous = slabs[slabs.length - 1];
    if (
      previous &&
      Math.abs(previous.maxX - x0) <= EPS &&
      sameIntervals(previous.intervals, clipped)
    ) {
      previous.maxX = x1;
      continue;
    }
    slabs.push({ minX: x0, maxX: x1, intervals: clipped });
  }

  const cells: Rect[] = [];
  for (const slab of slabs) {
    for (const [minZ, maxZ] of slab.intervals) {
      const cell: Rect = { minX: slab.minX, maxX: slab.maxX, minZ, maxZ };
      if (clipRectToPolygon(cell, polygon, GEOM_EPS_M)) cells.push(cell);
    }
  }
  return cells;
}

/** A usable plate polygon, or the bounding rect when the caller supplied none. */
function platePolygonOf(plate: Rect, supplied: Polygon | undefined): Polygon {
  if (supplied && supplied.length > 0 && (supplied[0]?.length ?? 0) >= 3) return supplied;
  return rectToPolygon(plate);
}

/* ------------------------------------------------------------------ */
/* Bands and strips                                                    */
/* ------------------------------------------------------------------ */

/** One of the four guillotine remainders left when the core is cut out. */
interface Band {
  rect: Rect;
  /** Axis running from the core face out towards the perimeter. */
  outAxis: Axis;
  /** -1 when the band sits on the negative side of the core along `outAxis`. */
  outSign: 1 | -1;
}

/**
 * A run of floor that gets sliced into rooms. `u` is a band-local coordinate
 * measured from `originU` in direction `dirU`, so both "slice along the core
 * face" and "slice outward from the core" share one packing routine.
 */
interface Strip {
  corridorIndex: number;
  /** The axis `u` advances along. The fixed extent is on the other axis. */
  axis: Axis;
  originU: number;
  dirU: 1 | -1;
  lengthU: number;
  fixedMin: number;
  fixedMax: number;
  /** Room dimension perpendicular to the slicing axis — constant for a strip. */
  depthM: number;
  cursorU: number;
  placements: Placement[];
}

interface Placement {
  item: ProgramItem;
  /** 1-based index of this room within its program item on this level. */
  ordinal: number;
  targetAreaSqm: number;
  thicknessU: number;
  offsetU: number;
}

function stripRect(strip: Strip, u0: number, u1: number): Rect {
  // Clamping here is what makes "every space is inside the plate" exact rather
  // than exact-up-to-accumulated-float-error.
  const a = strip.originU + strip.dirU * clamp(u0, 0, strip.lengthU);
  const b = strip.originU + strip.dirU * clamp(u1, 0, strip.lengthU);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return strip.axis === "x"
    ? { minX: lo, maxX: hi, minZ: strip.fixedMin, maxZ: strip.fixedMax }
    : { minX: strip.fixedMin, maxX: strip.fixedMax, minZ: lo, maxZ: hi };
}

/**
 * Clip the core to the plate. When the core misses this plate entirely (a
 * tower level a shifted core no longer reaches, say) fall back to a degenerate
 * centre line, which turns the decomposition below into an ordinary
 * double-loaded corridor down the plate's long axis instead of nothing at all.
 */
function coreFootprint(plate: Rect, core: Rect): Rect {
  const clip = intersect(plate, core);
  if (rectWidth(clip) > EPS && rectDepth(clip) > EPS) return clip;

  const centreX = (plate.minX + plate.maxX) / 2;
  const centreZ = (plate.minZ + plate.maxZ) / 2;
  return rectWidth(plate) >= rectDepth(plate)
    ? { minX: plate.minX, maxX: plate.maxX, minZ: centreZ, maxZ: centreZ }
    : { minX: centreX, maxX: centreX, minZ: plate.minZ, maxZ: plate.maxZ };
}

/**
 * Guillotine decomposition of plate − core into four non-overlapping bands:
 * two full-depth side bands and two end bands spanning only the core's width.
 * Together they tile the remainder exactly, which is what keeps the no-overlap
 * invariant structural rather than checked.
 */
function bandsAroundCore(plate: Rect, core: Rect): Band[] {
  const bands: Band[] = [
    {
      rect: { minX: plate.minX, maxX: core.minX, minZ: plate.minZ, maxZ: plate.maxZ },
      outAxis: "x",
      outSign: -1,
    },
    {
      rect: { minX: core.maxX, maxX: plate.maxX, minZ: plate.minZ, maxZ: plate.maxZ },
      outAxis: "x",
      outSign: 1,
    },
    {
      rect: { minX: core.minX, maxX: core.maxX, minZ: plate.minZ, maxZ: core.minZ },
      outAxis: "z",
      outSign: -1,
    },
    {
      rect: { minX: core.minX, maxX: core.maxX, minZ: core.maxZ, maxZ: plate.maxZ },
      outAxis: "z",
      outSign: 1,
    },
  ];
  return bands.filter((b) => rectWidth(b.rect) > EPS && rectDepth(b.rect) > EPS);
}

/**
 * Reserve this band's circulation and hand back the room strips it serves.
 *
 * Two arrangements, chosen by which one lands nearer the target room depth:
 *
 *   single-loaded — corridor hugs the core face, one row of rooms outboard.
 *                   Cheap, but a deep band gives absurdly deep rooms.
 *   double-loaded — a spine runs from the core face out to the perimeter with
 *                   a row of rooms either side. Costs more corridor, but turns
 *                   a 27 m deep band into two 7 m deep ones.
 *
 * Either way the corridor touches the core, so the circulation pass always has
 * a sound seed at the lift lobby.
 */
function layoutBand(
  band: Band,
  core: Rect,
  corridorWidthM: number,
  targetRoomDepthM: number,
  corridors: Rect[],
  strips: Strip[],
): void {
  const { rect, outAxis, outSign } = band;
  const alongAxis = otherAxis(outAxis);
  const outMin = outAxis === "x" ? rect.minX : rect.minZ;
  const outMax = outAxis === "x" ? rect.maxX : rect.maxZ;
  const alongMin = alongAxis === "x" ? rect.minX : rect.minZ;
  const alongMax = alongAxis === "x" ? rect.maxX : rect.maxZ;

  const depthM = outMax - outMin;
  const lengthM = alongMax - alongMin;
  if (Math.min(depthM, lengthM) < MIN_BAND_M) return;

  const singleDepth = depthM - corridorWidthM;
  const doubleDepth = (lengthM - corridorWidthM) / 2;
  const singleOk = singleDepth >= MIN_ROOM_DIM_M && lengthM >= MIN_ROOM_DIM_M;
  const doubleOk = doubleDepth >= MIN_ROOM_DIM_M && depthM >= MIN_ROOM_DIM_M;

  if (!singleOk && !doubleOk) {
    // Too tight to hold a corridor AND a room. It is still floor you can walk
    // through, so declare it circulation rather than pretending it is a room.
    if (rectArea(rect) >= MIN_AREA_SQM.corridor) corridors.push(rect);
    return;
  }

  const useDouble =
    doubleOk &&
    (!singleOk ||
      Math.abs(doubleDepth - targetRoomDepthM) <
        Math.abs(singleDepth - targetRoomDepthM));

  if (!useDouble) {
    const coreSide = outSign === -1;
    const corridorOutMin = coreSide ? outMax - corridorWidthM : outMin;
    const corridorOutMax = coreSide ? outMax : outMin + corridorWidthM;
    corridors.push(
      fromBandCoords(outAxis, corridorOutMin, corridorOutMax, alongMin, alongMax),
    );

    const roomOutMin = coreSide ? outMin : outMin + corridorWidthM;
    const roomOutMax = coreSide ? outMax - corridorWidthM : outMax;
    strips.push({
      corridorIndex: corridors.length - 1,
      axis: alongAxis,
      originU: alongMin,
      dirU: 1,
      lengthU: lengthM,
      fixedMin: roomOutMin,
      fixedMax: roomOutMax,
      depthM: roomOutMax - roomOutMin,
      cursorU: 0,
      placements: [],
    });
    return;
  }

  // The spine is centred on the CORE, not on the band: an offset or end core
  // would otherwise leave the spine opening onto a room instead of the lobby.
  const coreAlongCentre =
    alongAxis === "x" ? (core.minX + core.maxX) / 2 : (core.minZ + core.maxZ) / 2;
  const spineCentre = clamp(
    coreAlongCentre,
    alongMin + corridorWidthM / 2,
    alongMax - corridorWidthM / 2,
  );
  const spineMin = spineCentre - corridorWidthM / 2;
  const spineMax = spineCentre + corridorWidthM / 2;
  corridors.push(fromBandCoords(outAxis, outMin, outMax, spineMin, spineMax));
  const corridorIndex = corridors.length - 1;

  // Rooms run from the core face outward, so the first room in a strip is the
  // one a REQUIRES_CORE program can actually be given.
  const originU = outSign === -1 ? outMax : outMin;
  const dirU: 1 | -1 = outSign === -1 ? -1 : 1;
  for (const [a0, a1] of [
    [alongMin, spineMin],
    [spineMax, alongMax],
  ]) {
    if (a1 - a0 < MIN_ROOM_DIM_M) continue;
    strips.push({
      corridorIndex,
      axis: outAxis,
      originU,
      dirU,
      lengthU: depthM,
      fixedMin: a0,
      fixedMax: a1,
      depthM: a1 - a0,
      cursorU: 0,
      placements: [],
    });
  }
}

/* ------------------------------------------------------------------ */
/* Packing                                                             */
/* ------------------------------------------------------------------ */

function isCirculationType(type: SpaceType): boolean {
  return type === "corridor" || type === "circulation";
}

function wants(item: ProgramItem, kind: string): boolean {
  return item.adjacency.some((a) => a.kind === kind);
}

interface Candidate {
  strip: Strip;
  thicknessU: number;
  score: number;
}

/**
 * Greedy strip choice. Deliberately NOT a constraint solver: it scores fit
 * (area, proportion) and the two adjacency intents that are cheap to honour,
 * takes the best, and moves on. A wrong-but-legal placement is recoverable by
 * the user; an overlapping one is not.
 */
function chooseStrip(
  strips: Strip[],
  item: ProgramItem,
  targetAreaSqm: number,
  plate: Rect,
  outerOnly: Polygon,
  core: Rect,
  rng: Rng,
  /**
   * Drop the declared `minAreaSqm` floor, keeping only the hard geometric one.
   *
   * Used as a second pass when an item would otherwise be placed ZERO times.
   * A large declared minimum ("an open office floor is not an open office floor
   * below 300 m²") is architecturally correct, but on a plate whose strips are
   * all shorter than that it rejected every candidate and the dominant space in
   * the building silently vanished. A smaller-than-asked room that the
   * validator reports as SPACE_BELOW_TARGET_AREA is far more useful than a
   * missing one — the shortfall stays visible either way, but the building
   * still has its offices in it.
   */
  relaxed = false,
): Candidate | null {
  let best: Candidate | null = null;

  for (const strip of strips) {
    const remaining = strip.lengthU - strip.cursorU;
    // MIN_ROOM_DIM_M is never relaxed: it is what stops a sliver, and a sliver
    // is not a cheaper room, it is a defect.
    const minThickness = relaxed
      ? MIN_ROOM_DIM_M
      : Math.max(item.minAreaSqm / strip.depthM, MIN_ROOM_DIM_M);
    // Jitter is drawn for every candidate, not only the winner, so the draw
    // order stays a pure function of the strip list.
    const jitter = rng.next() * 0.02;
    if (minThickness > remaining) continue;

    const thicknessU = clamp(targetAreaSqm / strip.depthM, minThickness, remaining);
    const areaSqm = thicknessU * strip.depthM;
    if (!relaxed && areaSqm < item.minAreaSqm - EPS) continue;

    const rect = stripRect(strip, strip.cursorU, strip.cursorU + thicknessU);
    const aspect =
      Math.max(thicknessU, strip.depthM) / Math.min(thicknessU, strip.depthM);
    const aspectErr = Math.abs(Math.log(aspect / item.preferredAspectRatio));
    const areaErr = Math.abs(areaSqm - targetAreaSqm) / Math.max(1, targetAreaSqm);

    let penalty = 0;
    if (wants(item, "REQUIRES_EXTERIOR") && !touchesPerimeter(rect, plate, outerOnly)) {
      penalty += 1;
    }
    if (wants(item, "REQUIRES_CORE") && sharedEdgeLength(rect, core) < ADJACENT_EDGE_M) {
      penalty += 1;
    }

    const score = 1.5 * areaErr + aspectErr + 2 * penalty + jitter;
    if (best === null || score < best.score) best = { strip, thicknessU, score };
  }

  return best;
}

/**
 * Hand leftover run length back to the rooms already in the strip so the plate
 * is used rather than left as unexplained slack — capped, because a room three
 * times its brief is as dishonest as a room a third of it.
 */
function stretchStrip(strip: Strip): void {
  if (strip.placements.length === 0) return;

  const capFor = (p: Placement) =>
    Math.max(p.thicknessU, (p.targetAreaSqm * STRETCH_CAP) / strip.depthM);

  let slack =
    strip.lengthU - strip.placements.reduce((sum, p) => sum + p.thicknessU, 0);

  for (let round = 0; round < STRETCH_ROUNDS && slack > EPS; round += 1) {
    const growable = strip.placements.filter((p) => capFor(p) - p.thicknessU > EPS);
    if (growable.length === 0) break;

    const total = growable.reduce((sum, p) => sum + p.thicknessU, 0);
    if (total <= EPS) break;

    let used = 0;
    for (const p of growable) {
      const share = slack * (p.thicknessU / total);
      const headroom = capFor(p) - p.thicknessU;
      const grow = Math.min(share, headroom);
      p.thicknessU += grow;
      used += grow;
    }
    slack -= used;
  }

  let cursor = 0;
  for (const p of strip.placements) {
    p.offsetU = cursor;
    cursor += p.thicknessU;
  }
  strip.cursorU = cursor;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export function solveFloorPlan(input: {
  spec: BuildingSpec;
  floorNo: number;
  /** Usable plate bounds for THIS level, metres. */
  plate: Rect;
  /**
   * The level's REAL outline, `[outer, ...holes]`. Omitted means "the plate is
   * its own bounding box", which keeps every rectangular caller and test exact;
   * supplied, it is what every placed space is held inside.
   */
  platePolygon?: Polygon;
  core: CoreLayout;
  rng: Rng;
}): PlacedSpace[] {
  const { spec, floorNo, plate, core, rng } = input;
  if (rectWidth(plate) <= EPS || rectDepth(plate) <= EPS) return [];

  const polygon = platePolygonOf(plate, input.platePolygon);
  const outerOnly: Polygon = [polygon[0]];

  const corridorWidthM = spec.dimensions.corridorWidthMm.value / 1000;
  // Room depth is judged against one structural bay: that is the depth the
  // frame was sized for, so rooms that match it need no transfer structure.
  const targetRoomDepthM = clamp(
    (spec.structure.gridXMm.value + spec.structure.gridZMm.value) / 2000,
    4,
    12,
  );

  const coreRect = coreFootprint(plate, core.rect);

  /* --- 1. circulation first, then the strips it serves --- */
  const corridorRects: Rect[] = [];
  const strips: Strip[] = [];
  for (const band of bandsAroundCore(plate, coreRect)) {
    // A band is a bounding-box remainder, so on a non-convex plate part of it
    // may be notch or void. Lay out only the solid cells it actually covers;
    // on a rectangle that is the band itself, unchanged.
    for (const cell of solidCells(band.rect, polygon)) {
      layoutBand(
        { rect: cell, outAxis: band.outAxis, outSign: band.outSign },
        coreRect,
        corridorWidthM,
        targetRoomDepthM,
        corridorRects,
        strips,
      );
    }
  }

  /* --- 2. pack the program --- */
  const onThisLevel = spec.program.filter((p) => p.levels.includes(floorNo));
  const circulationItem = onThisLevel.find((p) => isCirculationType(p.type));
  const roomItems = onThisLevel
    .filter((p) => !isCirculationType(p.type))
    .slice()
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        b.targetAreaSqmPerLevel - a.targetAreaSqmPerLevel ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );

  for (const item of roomItems) {
    const perRoomTarget = Math.max(
      item.minAreaSqm,
      item.targetAreaSqmPerLevel / item.countPerLevel,
    );
    let placedForItem = 0;
    for (let n = 1; n <= item.countPerLevel; n += 1) {
      let chosen = chooseStrip(strips, item, perRoomTarget, plate, outerOnly, coreRect, rng);

      // Placing an item FEWER times than asked is a reportable shortfall.
      // Placing it ZERO times deletes a requirement from the building, and for
      // the dominant item that means a five-storey office with no offices in
      // it. So if nothing has been placed yet, try again without the declared
      // area floor before giving up.
      if (chosen === null && placedForItem === 0) {
        chosen = chooseStrip(
          strips,
          item,
          perRoomTarget,
          plate,
          outerOnly,
          coreRect,
          rng,
          true,
        );
      }

      // Nothing can take a room this size, so nothing can take the next one
      // either. Dropping the remainder is honest; a sliver room is not.
      if (chosen === null) break;
      placedForItem += 1;

      chosen.strip.placements.push({
        item,
        ordinal: n,
        targetAreaSqm: perRoomTarget,
        thicknessU: chosen.thicknessU,
        offsetU: chosen.strip.cursorU,
      });
      chosen.strip.cursorU += chosen.thicknessU;
    }
  }

  for (const strip of strips) stretchStrip(strip);

  /* --- 3. emit --- */
  const roomCount = strips.reduce((sum, s) => sum + s.placements.length, 0);
  const servedCorridors = new Set(
    strips.filter((s) => s.placements.length > 0).map((s) => s.corridorIndex),
  );
  const strippedCorridors = new Set(strips.map((s) => s.corridorIndex));

  const spaces: PlacedSpace[] = [];
  const emit = (space: Omit<PlacedSpace, "id" | "adjacentSpaceIds">) => {
    spaces.push({
      ...space,
      id: `SPACE-L${floorNo}-${String(spaces.length).padStart(3, "0")}`,
      adjacentSpaceIds: [],
    });
  };

  const keptCorridors = corridorRects.filter(
    (_, index) =>
      servedCorridors.has(index) ||
      // A passage-only band (no rooms of its own) still earns its place while
      // the level has rooms somewhere; on an empty level it is just slack.
      (!strippedCorridors.has(index) && roomCount > 0),
  );

  keptCorridors.forEach((rect, index) => {
    emit({
      // Attribute solver-created corridors to the declared circulation item
      // when there is one. Their size comes from corridor width and band
      // geometry rather than the item's target area — but leaving this blank
      // made the validator report PROGRAM_NOT_PLACED for circulation that had
      // demonstrably been placed. Under-delivered area is reported honestly by
      // SPACE_BELOW_TARGET_AREA instead, which is the accurate signal.
      programId: circulationItem?.id ?? "",
      type: "corridor",
      label:
        keptCorridors.length > 1
          ? `${circulationItem?.label ?? "Corridor"} ${index + 1}`
          : (circulationItem?.label ?? "Corridor"),
      floorNo,
      rect,
      areaSqm: rectArea(rect),
      isCirculation: true,
      hasExteriorWall: touchesPerimeter(rect, plate, outerOnly),
      reachable: false,
    });
  });

  for (const strip of strips) {
    for (const p of strip.placements) {
      const rect = stripRect(strip, p.offsetU, p.offsetU + p.thicknessU);
      emit({
        programId: p.item.id,
        type: p.item.type,
        label: p.item.countPerLevel > 1 ? `${p.item.label} ${p.ordinal}` : p.item.label,
        floorNo,
        rect,
        areaSqm: rectArea(rect),
        isCirculation: false,
        hasExteriorWall: touchesPerimeter(rect, plate, outerOnly),
        reachable: false,
      });
    }
  }

  /* --- 4. adjacency graph --- */
  for (let i = 0; i < spaces.length; i += 1) {
    for (let j = i + 1; j < spaces.length; j += 1) {
      if (sharedEdgeLength(spaces[i].rect, spaces[j].rect) > ADJACENT_EDGE_M) {
        spaces[i].adjacentSpaceIds.push(spaces[j].id);
        spaces[j].adjacentSpaceIds.push(spaces[i].id);
      }
    }
  }

  return spaces;
}
