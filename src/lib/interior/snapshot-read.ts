// src/lib/interior/snapshot-read.ts
//
// The only place this layer reads a BimModelSnapshot. Pure reading, no
// recomputation — the same contract `src/components/generative/schematic/
// plan-model.ts` holds for the 2D reader: if the interior looks wrong, the
// MODEL is wrong, and this file cannot flatter it.
//
// Every field read here is cited to where it is written:
//   walls    — src/lib/generative/graph/emit.ts, `/* --- walls --- */`
//   openings — same file, `/* --- openings, hosted on their wall --- */`
//   core     — same file, `/* --- core components --- */`
//   levels   — `levelsOf()` in the same file (elevation/height, metres)

import { headingYFromAxis, type Xz } from "@/lib/bim/model/geometry";
import { resolveParameter } from "@/lib/bim/model/parameters";
import {
  parseFloorNoFromLevelId,
  type BimElement,
  type BimLevel,
  type BimModelSnapshot,
} from "@/lib/bim/model/types";

/** Under this, a length is a rounding artefact rather than geometry. */
export const MIN_GEOMETRY_M = 1e-3;

/* ------------------------------------------------------------------ */
/* Parameters                                                          */
/* ------------------------------------------------------------------ */

export function numberParam(element: BimElement, key: string): number | null {
  const value = element.instanceParameters[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function stringParam(element: BimElement, key: string): string | null {
  const value = element.instanceParameters[key];
  return typeof value === "string" ? value : null;
}

/**
 * Instance parameter, falling back to the element's TYPE parameter — the
 * Revit rule, and the reason a generated window (whose `generated-window` type
 * carries no dimensions) and an authored one both resolve `widthMm`.
 */
export function typedNumber(
  snapshot: BimModelSnapshot,
  element: BimElement,
  key: string,
): number | null {
  const value = resolveParameter(snapshot.types[element.typeId], element.instanceParameters, key);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/* ------------------------------------------------------------------ */
/* Levels                                                              */
/* ------------------------------------------------------------------ */

export interface LevelIndex {
  byId: Map<string, BimLevel>;
  byFloorNo: Map<number, BimLevel>;
}

export function indexLevels(snapshot: BimModelSnapshot): LevelIndex {
  const byId = new Map<string, BimLevel>();
  const byFloorNo = new Map<number, BimLevel>();
  for (const level of snapshot.levels) {
    byId.set(level.id, level);
    byFloorNo.set(level.floorNo, level);
  }
  return { byId, byFloorNo };
}

/**
 * The level an element stands on.
 *
 * Generated elements carry `placement.y === 0` (emit.ts writes 0 for every wall
 * and every core component; an opening's `placement.y` is its SILL above the
 * finished floor, not a world height). World Y therefore comes from
 * `BimLevel.elevation` and nowhere else.
 */
export function levelOf(index: LevelIndex, element: BimElement): BimLevel | null {
  if (!element.levelId) return null;
  const direct = index.byId.get(element.levelId);
  if (direct) return direct;
  const floorNo = parseFloorNoFromLevelId(element.levelId);
  return floorNo === null ? null : (index.byFloorNo.get(floorNo) ?? null);
}

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

/**
 * Authored elements are ALREADY drawn by `AuthoringFamilyLayer` (it filters
 * `origin === "authored"`). Drawing them here too would double every hand-placed
 * family, so this layer covers exactly the complement: generated elements, plus
 * generated elements a human has since edited (`MODIFIED` keeps
 * `origin: "generated"` — see `mergeGenerated` in emit.ts).
 */
export function isAuthored(element: BimElement): boolean {
  return element.origin === "authored" || element.generationSource?.type === "AUTHORED";
}

/* ------------------------------------------------------------------ */
/* Wall axis + classification                                          */
/* ------------------------------------------------------------------ */

export interface WallAxisRead {
  start: Xz;
  end: Xz;
  lengthM: number;
  /**
   * three.js yaw, derived from the endpoints via `headingYFromAxis`
   * (= atan2(−dz, dx)).
   *
   * NOT `placement.rotationY`: emit.ts stores `atan2(ez − sz, ex − sx)` there,
   * which is the PLAN angle (the 2D reader's convention) and has the opposite
   * sign to a three.js Y rotation. `createWall` in bim/model/commands.ts stores
   * the yaw form for authored walls. Endpoints are the one representation both
   * paths agree on, so this layer reads those and derives the yaw itself.
   */
  headingY: number;
}

export function wallAxisOf(element: BimElement): WallAxisRead | null {
  const sx = numberParam(element, "startX");
  const sz = numberParam(element, "startZ");
  const ex = numberParam(element, "endX");
  const ez = numberParam(element, "endZ");
  if (sx === null || sz === null || ex === null || ez === null) return null;
  const start = { x: sx, z: sz };
  const end = { x: ex, z: ez };
  return {
    start,
    end,
    lengthM: Math.hypot(ex - sx, ez - sz),
    headingY: headingYFromAxis(start, end),
  };
}

/** Signed distance along the axis, and perpendicular offset, of a world point. */
export function projectOnAxis(
  axis: WallAxisRead,
  point: Xz,
): { alongM: number; offsetM: number } {
  if (axis.lengthM < MIN_GEOMETRY_M) return { alongM: 0, offsetM: 0 };
  const dx = (axis.end.x - axis.start.x) / axis.lengthM;
  const dz = (axis.end.z - axis.start.z) / axis.lengthM;
  const px = point.x - axis.start.x;
  const pz = point.z - axis.start.z;
  return { alongM: px * dx + pz * dz, offsetM: Math.abs(px * -dz + pz * dx) };
}

/** World XZ at `alongM` metres from the wall start. */
export function pointAlongAxis(axis: WallAxisRead, alongM: number): [number, number] {
  if (axis.lengthM < MIN_GEOMETRY_M) return [axis.start.x, axis.start.z];
  const t = alongM / axis.lengthM;
  return [
    axis.start.x + (axis.end.x - axis.start.x) * t,
    axis.start.z + (axis.end.z - axis.start.z) * t,
  ];
}

/**
 * Core evidence, in the order emit.ts provides it:
 *   1. `system === "core"` — set for `wall.role === "core"` (and every core
 *      component), the semantic answer.
 *   2. `instanceParameters.role === "core"` — the generator's own word.
 */
export function isCoreWall(element: BimElement): boolean {
  return element.system === "core" || stringParam(element, "role") === "core";
}

/**
 * Exterior evidence:
 *   1. `instanceParameters.exterior === true` — emit.ts writes it explicitly.
 *   2. `system === "envelope"` — set for `wall.role === "exterior"`.
 *   3. category "Curtain Walls" — a curtain-walled elevation is envelope by
 *      construction (emit.ts routes `side.system === "curtain-wall"` there).
 */
export function isExteriorWall(element: BimElement): boolean {
  return (
    element.instanceParameters.exterior === true ||
    element.system === "envelope" ||
    element.category === "Curtain Walls"
  );
}

export function isCurtainWall(element: BimElement): boolean {
  return element.category === "Curtain Walls";
}

/* ------------------------------------------------------------------ */
/* Hosted openings                                                     */
/* ------------------------------------------------------------------ */

export function isOpening(element: BimElement): boolean {
  return element.kind === "door" || element.kind === "window";
}

/**
 * Openings grouped by the wall they are hosted on. Only generated openings —
 * an authored door is the authoring layer's to draw, but it still has to punch
 * its host, so it is NOT filtered here; `buildWallInstances` decides.
 */
export function openingsByHost(snapshot: BimModelSnapshot): Map<string, BimElement[]> {
  const byHost = new Map<string, BimElement[]>();
  for (const element of snapshot.elements) {
    if (!isOpening(element) || !element.hostId) continue;
    const list = byHost.get(element.hostId);
    if (list) list.push(element);
    else byHost.set(element.hostId, [element]);
  }
  return byHost;
}

export function elementsById(snapshot: BimModelSnapshot): Map<string, BimElement> {
  return new Map(snapshot.elements.map((element) => [element.id, element]));
}
