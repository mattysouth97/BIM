// src/lib/generative/generate/core.ts
//
// Vertical core: where it sits on the plate, and what is packed inside it.
//
// METRES, local XZ, origin at the footprint centre. The spec is in millimetres,
// so every spec read here divides by 1000 — nothing leaves this file in mm.
//
// Two rules drive the whole file:
//
//   1. The core may never escape the plate. A core hanging off the edge is the
//      single most common way this engine produces nonsense: the space solver,
//      the circulation graph, the wall pass and the egress check all inherit
//      the error, and the result is a building with a lift shaft floating
//      outside the facade. So the strategy is only a SUGGESTION and the clamp
//      in `placeCoreRect` is the law.
//   2. Components never overlap. Two hoistways sharing a rect is not something
//      the emitter can turn into real elements, so the packer would rather emit
//      FEWER components than colliding ones — and it never quietly grows the
//      core to make them fit, because the core area feeds the efficiency
//      metrics the user is shown.
//
// Nothing here is stochastic: same spec + plate ⇒ same layout, so no Rng is
// threaded through. If that ever changes, fork from `spec.generationSeed`.

import type { BuildingSpec } from "../spec/building-spec";
import type { CoreComponent, CoreLayout, Rect } from "./types";
import { rectCentre, rectDepth, rectWidth } from "./types";

/** Floor that must survive around the core on every side, metres. */
const MIN_PERIMETER_M = 1.5;

/**
 * Comparison slack. Small enough that a component can never visibly escape the
 * core, large enough to absorb the mm→m division.
 */
const EPS = 1e-9;

interface Size {
  w: number;
  d: number;
}

/**
 * Per-kind plan sizes in metres. `min` is the hard floor stated by the layout
 * contract; `preferred` is what the component is actually built at once shaft
 * walls, landings and door swings are counted. The packer tries `preferred`
 * first and only drops to `min` when the core genuinely cannot hold it.
 */
const COMPONENT_SIZES: Record<CoreComponent["kind"], { min: Size; preferred: Size }> = {
  // A two-flight scissor-free egress stair with landings.
  stair: { min: { w: 2.5, d: 5.0 }, preferred: { w: 2.8, d: 5.6 } },
  // Passenger car plus hoistway wall.
  elevator: { min: { w: 2.0, d: 2.2 }, preferred: { w: 2.3, d: 2.6 } },
  // Riser large enough to stand a duct or a stack in.
  shaft: { min: { w: 0.8, d: 0.8 }, preferred: { w: 1.2, d: 1.0 } },
};

/** Nominal wall between two packed components. Dropped when space runs out. */
const COMPONENT_GAP_M = 0.15;

/**
 * How much a placed component is worth when the core cannot hold everything.
 * Egress is P0, so one stair outranks every lift and riser combined — the
 * weights are spaced so no count within the schema's limits can invert that.
 */
const PACK_SCORE_WEIGHT: Record<CoreComponent["kind"], number> = {
  stair: 1_000,
  elevator: 10,
  shaft: 1,
};

interface PackItem {
  id: string;
  kind: CoreComponent["kind"];
  subKind?: string;
  min: Size;
  preferred: Size;
}

interface PackConfig {
  /** Fall back to the minimum legal size instead of the preferred one. */
  minimal: boolean;
  gapM: number;
  /** "x" runs shelves along X; "z" transposes the frame and runs them along Z. */
  axis: "x" | "z";
  /** Turn the whole bank 90° — a lift bank often only fits side-on. */
  rotate: boolean;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export function generateCore(input: {
  spec: BuildingSpec;
  /**
   * The region the core must stand in, metres. Usually the level plate bounds;
   * the pipeline narrows it to the largest SOLID rectangle when the plate has
   * voids, because a core over a courtyard is not a core.
   */
  plate: Rect;
  /**
   * The point `spec.core.offsetXMm/offsetZMm` are measured from, metres.
   * Defaults to the centre of `plate`. Pass it whenever `plate` is NOT the
   * footprint the offsets were written against — see `placeCoreRect`.
   */
  offsetOrigin?: readonly [number, number];
  /** Every level the core must serve, sorted ascending. */
  floorNos: number[];
}): CoreLayout {
  const { spec, plate, offsetOrigin, floorNos } = input;

  const rect = placeCoreRect(spec, plate, offsetOrigin);

  // The core is one continuous shaft, so every component spans the full served
  // range. Reduced rather than trusting the caller's sort — an unsorted list
  // would otherwise produce a core that runs downwards.
  const fromFloorNo = floorNos.length ? floorNos.reduce((a, b) => Math.min(a, b)) : 1;
  const toFloorNo = floorNos.length ? floorNos.reduce((a, b) => Math.max(a, b)) : fromFloorNo;

  const items = coreItems(spec.core);
  const placements = packBest(rect, items);

  const components: CoreComponent[] = [];
  for (const item of items) {
    const placed = placements.get(item.id);
    // Dropped rather than overlapped: a component with no honest rect is worse
    // than a missing one, because the emitter would build it anyway.
    if (!placed) continue;
    components.push({
      id: item.id,
      kind: item.kind,
      subKind: item.subKind,
      rect: placed,
      fromFloorNo,
      // `toFloorNo` is the topmost served level, which is exactly where the
      // stairs have to land for roof access — the rest of the core rides the
      // same span because a discontinuous riser is not buildable.
      toFloorNo,
    });
  }

  return { rect, components };
}

/* ------------------------------------------------------------------ */
/* Placement                                                           */
/* ------------------------------------------------------------------ */

/**
 * THE TWO FRAMES, because getting them confused put cores in the wrong wing.
 *
 * `plate` is the region the core must END UP in: the caller's honest answer to
 * "where is there floor to stand on". Everything positional except the offset
 * reads from it — `end` pins to its +Z edge, `perimeter-split` to its -X edge,
 * `central` to its centre, and the final clamp keeps the 1.5 m ring inside it.
 * That is right: those are all statements ABOUT the available floor.
 *
 * `spec.core.offsetXMm/offsetZMm` are not. They are a displacement from the
 * FOOTPRINT's centre — "Footprint-local offset from the plate centre", per
 * `spec/building-spec.ts` — and every producer writes them in that one frame:
 *
 *   • `provider/heuristic-provider.ts` emits `0.22 × massing.widthMm`, i.e. a
 *     fraction of the footprint measured from its centre;
 *   • `blueprint/compile.ts` emits the drawn core's centre in the engine frame,
 *     whose origin IS the footprint's bounding-box centre (`blueprintPlate-
 *     Frame` shifts every piece of blueprint geometry by exactly that, and
 *     `generate/massing.ts` builds every parametric plate centred on the
 *     origin too). Same number, same frame.
 *
 * So when `plate` is not the footprint — the pipeline narrows it to the largest
 * solid rect on a plate with courtyards — measuring the offset from its centre
 * counts that narrowing twice and slides the core off by the difference (21.5 m
 * on the fixture in `__tests__/core-offset-frame.test.ts`). `offsetOrigin` is
 * that difference made explicit: the caller states which point the offsets were
 * authored against, and only the offset uses it. Omitted, it degrades to the
 * plate centre, which is exactly right when `plate` IS the footprint.
 */
function placeCoreRect(
  spec: BuildingSpec,
  plate: Rect,
  offsetOrigin?: readonly [number, number],
): Rect {
  const [plateCx, plateCz] = rectCentre(plate);
  const [originX, originZ] = offsetOrigin ?? [plateCx, plateCz];
  const marginX = marginFor(rectWidth(plate));
  const marginZ = marginFor(rectDepth(plate));

  // Requested size first, then clamped to whatever the plate can hold with its
  // habitable ring intact. Shrinking the core is always preferable to letting
  // it overhang — an oversized core is a spec error, an escaped one is a bug.
  const widthM = Math.max(0, Math.min(spec.core.widthMm.value / 1000, rectWidth(plate) - 2 * marginX));
  const depthM = Math.max(0, Math.min(spec.core.depthMm.value / 1000, rectDepth(plate) - 2 * marginZ));

  let cx = plateCx;
  let cz = plateCz;

  switch (spec.core.strategy.value) {
    case "offset":
      cx = originX + spec.core.offsetXMm / 1000;
      // offsetZMm is part of the same displacement; ignoring half of a stated
      // offset would silently contradict the spec the user can see.
      cz = originZ + spec.core.offsetZMm / 1000;
      break;
    case "end":
      // Pushed hard against the +Z end; the clamp decides exactly how far,
      // which keeps the result correct for any plate depth.
      cz = plate.maxZ;
      break;
    case "perimeter-split":
      // One half of a split core, pinned to the -X edge. The caller places the
      // opposite half — see the `dual` note below.
      cx = plate.minX;
      break;
    case "dual":
      // Deliberately treated as central. A dual core is TWO calls to this
      // function from upstream with different offsets; inventing a second rect
      // in here would put geometry somewhere the caller cannot see or move.
      break;
    case "central":
    default:
      break;
  }

  const halfW = widthM / 2;
  const halfD = depthM / 2;
  cx = clamp(cx, plate.minX + marginX + halfW, plate.maxX - marginX - halfW);
  cz = clamp(cz, plate.minZ + marginZ + halfD, plate.maxZ - marginZ - halfD);

  return { minX: cx - halfW, minZ: cz - halfD, maxX: cx + halfW, maxZ: cz + halfD };
}

/**
 * A plate under 4×MIN_PERIMETER across cannot give 1.5 m on both sides AND a
 * core worth having. Rather than emit a zero-width core, the ring degrades
 * proportionally. The massing schema cannot produce a plate that small, so this
 * is a guard against a hand-built Rect, not a policy.
 */
function marginFor(extentM: number): number {
  return Math.min(MIN_PERIMETER_M, Math.max(0, extentM) / 4);
}

function clamp(value: number, min: number, max: number): number {
  // A degenerate window means the core exactly fills its allowance; centring it
  // is the only answer that keeps both margins symmetrical.
  if (max < min) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
}

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */

function coreItems(core: BuildingSpec["core"]): PackItem[] {
  const items: PackItem[] = [];

  // Order is priority order: egress first, then lifts, then risers. It is also
  // biggest-first, which is what makes shelf packing behave.
  for (let i = 1; i <= core.stairs.value; i += 1) {
    items.push({ id: `CORE-STAIR-${i}`, kind: "stair", ...COMPONENT_SIZES.stair });
  }
  for (let i = 1; i <= core.elevators.value; i += 1) {
    items.push({ id: `CORE-ELEV-${i}`, kind: "elevator", ...COMPONENT_SIZES.elevator });
  }

  // Numbered per subKind, so two mechanical risers read as MECHANICAL-1/-2
  // rather than sharing an id with the electrical one.
  const seen = new Map<string, number>();
  for (const subKind of core.shafts) {
    const ordinal = (seen.get(subKind) ?? 0) + 1;
    seen.set(subKind, ordinal);
    items.push({
      id: `CORE-SHAFT-${subKind.toUpperCase()}-${ordinal}`,
      kind: "shaft",
      subKind,
      ...COMPONENT_SIZES.shaft,
    });
  }

  return items;
}

/* ------------------------------------------------------------------ */
/* Packing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Try the configurations in descending order of quality and take the first that
 * places EVERYTHING. Quality here means generous sizes before minimum ones and
 * a real wall gap before none; axis and rotation are free choices, so they vary
 * innermost. If nothing fits completely, keep the attempt that placed the most
 * valuable set — ties resolve to the earlier (higher quality) attempt because
 * the score must strictly improve to win.
 */
function packBest(core: Rect, items: PackItem[]): Map<string, Rect> {
  let best = new Map<string, Rect>();
  let bestScore = -1;

  for (const minimal of [false, true]) {
    for (const gapM of [COMPONENT_GAP_M, 0]) {
      for (const axis of ["x", "z"] as const) {
        for (const rotate of [false, true]) {
          const placed = packShelves(core, items, { minimal, gapM, axis, rotate });
          if (placed.size === items.length) return placed;
          const score = scoreOf(items, placed);
          if (score > bestScore) {
            bestScore = score;
            best = placed;
          }
        }
      }
    }
  }

  return best;
}

/**
 * Shelf (row) packing. Items fill the current shelf along the frame's X until
 * one no longer fits, then a new shelf opens above the deepest item on the
 * previous one. An item that fits nowhere is skipped rather than aborting the
 * run — a stair too deep for the core should not cost the building its risers.
 */
function packShelves(core: Rect, items: PackItem[], config: PackConfig): Map<string, Rect> {
  const frame = config.axis === "z" ? transpose(core) : core;
  const usableW = rectWidth(frame);
  const usableD = rectDepth(frame);
  const placed = new Map<string, Rect>();

  let shelfZ = 0;
  let shelfDepth = 0;
  let cursorX = 0;
  let shelfOccupied = false;

  for (const item of items) {
    const size = sizeFor(item, config);
    if (size.w > usableW + EPS) continue; // no shelf is ever this wide

    let x = shelfOccupied ? cursorX + config.gapM : 0;
    const grownDepth = Math.max(shelfDepth, size.d);
    const fitsOnShelf = x + size.w <= usableW + EPS && shelfZ + grownDepth <= usableD + EPS;

    if (!fitsOnShelf) {
      const nextZ = shelfOccupied ? shelfZ + shelfDepth + config.gapM : shelfZ;
      if (nextZ + size.d > usableD + EPS) continue; // out of depth; a smaller item may still fit
      shelfZ = nextZ;
      shelfDepth = 0;
      shelfOccupied = false;
      x = 0;
    }

    const rect: Rect = {
      minX: frame.minX + x,
      minZ: frame.minZ + shelfZ,
      maxX: frame.minX + x + size.w,
      maxZ: frame.minZ + shelfZ + size.d,
    };
    placed.set(item.id, config.axis === "z" ? transpose(rect) : rect);

    cursorX = x + size.w;
    shelfDepth = Math.max(shelfDepth, size.d);
    shelfOccupied = true;
  }

  return placed;
}

/**
 * `rotate` turns the item 90°; `axis === "z"` re-expresses it in the transposed
 * frame. Both are w/d swaps, so an even number of them cancels out.
 */
function sizeFor(item: PackItem, config: PackConfig): Size {
  const base = config.minimal ? item.min : item.preferred;
  const swaps = (config.rotate ? 1 : 0) + (config.axis === "z" ? 1 : 0);
  return swaps % 2 === 1 ? { w: base.d, d: base.w } : { w: base.w, d: base.d };
}

/** Swap the X and Z axes. Its own inverse, which is why one packer covers both. */
function transpose(rect: Rect): Rect {
  return { minX: rect.minZ, minZ: rect.minX, maxX: rect.maxZ, maxZ: rect.maxX };
}

function scoreOf(items: PackItem[], placed: Map<string, Rect>): number {
  return items.reduce(
    (sum, item) => sum + (placed.has(item.id) ? PACK_SCORE_WEIGHT[item.kind] : 0),
    0,
  );
}
