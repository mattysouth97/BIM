// src/lib/interior/walls.ts
//
// Wall elements → oriented boxes, punched by their hosted openings.
//
// NO CSG. A door in a wall is not a boolean subtraction here; it is a wall
// drawn as several boxes that stop where the opening starts and resume where it
// ends, plus the bands under the sill and over the head. Three boxes and an
// interval sweep instead of a BSP tree: deterministic, allocation-free, and it
// survives a wall being edited without re-meshing anything.
//
//   plan (along the wall axis)          section (at an opening)
//   ┌────────┬──────────┬────────┐      ┌──────────┐  ← wall top
//   │  pier  │ OPENING  │  pier  │      │  header  │
//   └────────┴──────────┴────────┘      ├──────────┤  ← head
//                                       │ (opening)│
//                                       ├──────────┤  ← sill
//                                       │   sill   │
//                                       └──────────┘  ← finished floor
//
// Metres, Y-up, world XZ. Y comes from `BimLevel.elevation` — generated walls
// carry `placement.y === 0` (emit.ts), so the placement is no help.

import type { BimElement, BimModelSnapshot } from "@/lib/bim/model/types";

import {
  MIN_GEOMETRY_M,
  indexLevels,
  isAuthored,
  isCoreWall,
  isCurtainWall,
  isExteriorWall,
  levelOf,
  numberParam,
  openingsByHost,
  pointAlongAxis,
  projectOnAxis,
  typedNumber,
  wallAxisOf,
  type LevelIndex,
  type WallAxisRead,
} from "./snapshot-read";
import { composeTrs, round6, roundTriple } from "./transform";
import type {
  InteriorBuildOptions,
  SkippedElement,
  WallInstance,
  WallSegmentRole,
} from "./types";

/**
 * Used only when neither the instance nor the type states a thickness. Matches
 * the catalog's `wall-basic-generic-200`, the repo's generic wall.
 */
const DEFAULT_THICKNESS_M = 0.2;

/** Used only when neither the instance nor the level states a height. */
const DEFAULT_HEIGHT_M = 3;

export interface WallBuildResult {
  walls: WallInstance[];
  skipped: SkippedElement[];
  /** Element ids that produced at least one box. */
  drawnElementIds: Set<string>;
}

/** Is this element one this layer draws as wall boxes? */
export function isWallLaneElement(
  element: BimElement,
  options: InteriorBuildOptions = {},
): boolean {
  if (element.kind !== "wall") return false;
  if (isAuthored(element)) return false;
  if (element.visible === false) return false;
  if (!options.includeExterior && isExteriorWall(element)) return false;
  return true;
}

/**
 * Every wall of the snapshot, as unit-box transforms.
 *
 * Deterministic: output is sorted by (floorNo, elementId, segment index), so it
 * does not inherit `snapshot.elements` ordering.
 */
export function buildWallInstances(
  snapshot: BimModelSnapshot,
  options: InteriorBuildOptions = {},
): WallBuildResult {
  const levels = indexLevels(snapshot);
  const byHost = openingsByHost(snapshot);
  const walls: WallInstance[] = [];
  const skipped: SkippedElement[] = [];
  const drawnElementIds = new Set<string>();

  for (const element of snapshot.elements) {
    if (!isWallLaneElement(element, options)) continue;

    const axis = wallAxisOf(element);
    if (!axis) {
      skipped.push(skip(element, "no-axis", "no startX/startZ/endX/endZ parameters"));
      continue;
    }
    if (axis.lengthM < MIN_GEOMETRY_M) {
      skipped.push(skip(element, "zero-geometry", `length ${axis.lengthM.toFixed(4)} m`));
      continue;
    }

    const level = levelOf(levels, element);
    if (!level) {
      skipped.push(skip(element, "no-level", `levelId ${element.levelId ?? "null"}`));
      continue;
    }

    const boxes = splitWall({
      snapshot,
      element,
      axis,
      floorNo: level.floorNo,
      baseY: level.elevation,
      heightM: wallHeightM(element, levels),
      thicknessM: wallThicknessM(snapshot, element),
      openings: byHost.get(element.id) ?? [],
    });
    if (boxes.length > 0) drawnElementIds.add(element.id);
    walls.push(...boxes);
  }

  walls.sort(
    (a, b) =>
      a.floorNo - b.floorNo ||
      (a.elementId < b.elementId ? -1 : a.elementId > b.elementId ? 1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return { walls, skipped, drawnElementIds };
}

/* ------------------------------------------------------------------ */
/* Dimensions                                                          */
/* ------------------------------------------------------------------ */

export function wallThicknessM(snapshot: BimModelSnapshot, element: BimElement): number {
  const mm = typedNumber(snapshot, element, "thicknessMm");
  return mm !== null && mm > 0 ? mm / 1000 : DEFAULT_THICKNESS_M;
}

// Height, unlike thickness, is read from the INSTANCE only: `unconnectedHeightM`
// is an instance parameter, and a wall that states none takes its storey's
// height rather than a type default. Hence no snapshot parameter here.
export function wallHeightM(element: BimElement, levels: LevelIndex): number {
  const stated = numberParam(element, "unconnectedHeightM");
  if (stated !== null && stated > 0) return stated;
  const level = levelOf(levels, element);
  if (level && level.height > 0) return level.height;
  return DEFAULT_HEIGHT_M;
}

/* ------------------------------------------------------------------ */
/* The split                                                           */
/* ------------------------------------------------------------------ */

interface OpeningCut {
  /** Distance from wall start to the opening's near jamb, metres. */
  fromM: number;
  toM: number;
  sillM: number;
  headM: number;
}

/**
 * Where an opening sits along its host, from the element's own parameters.
 *
 *   `placement.x/z` — the opening CENTRE in world XZ (emit.ts), which
 *   `generateOpenings` puts exactly on the host's centreline.
 *   `widthMm` / `heightMm` / `sillHeightMm` — the hole.
 *
 * Returns null when the opening carries no usable width — such an opening is
 * still a real element (families.ts poses it or logs it); it simply cuts
 * nothing.
 */
function cutFor(
  snapshot: BimModelSnapshot,
  opening: BimElement,
  axis: WallAxisRead,
  wallHeight: number,
): OpeningCut | null {
  const widthMm = typedNumber(snapshot, opening, "widthMm");
  const heightMm = typedNumber(snapshot, opening, "heightMm");
  if (widthMm === null || widthMm <= 0) return null;
  const widthM = widthMm / 1000;
  const heightM = heightMm !== null && heightMm > 0 ? heightMm / 1000 : wallHeight;

  const sillMm = typedNumber(snapshot, opening, "sillHeightMm");
  const sillM = sillMm !== null && sillMm > 0 ? sillMm / 1000 : 0;

  const { alongM } = projectOnAxis(axis, { x: opening.placement.x, z: opening.placement.z });
  const fromM = Math.max(0, Math.min(axis.lengthM, alongM - widthM / 2));
  const toM = Math.max(0, Math.min(axis.lengthM, alongM + widthM / 2));
  if (toM - fromM < MIN_GEOMETRY_M) return null;

  return {
    fromM,
    toM,
    sillM: Math.max(0, Math.min(wallHeight, sillM)),
    headM: Math.max(0, Math.min(wallHeight, sillM + heightM)),
  };
}

function splitWall(input: {
  snapshot: BimModelSnapshot;
  element: BimElement;
  axis: WallAxisRead;
  floorNo: number;
  baseY: number;
  heightM: number;
  thicknessM: number;
  openings: BimElement[];
}): WallInstance[] {
  const { snapshot, element, axis, floorNo, baseY, heightM, thicknessM } = input;

  const cuts = input.openings
    // Sorted by id first so an equal-position pair resolves the same way every
    // build, whatever order the snapshot happens to list them in.
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((opening) => cutFor(snapshot, opening, axis, heightM))
    .filter((cut): cut is OpeningCut => cut !== null)
    .sort((a, b) => a.fromM - b.fromM || a.toM - b.toM);

  const out: WallInstance[] = [];
  const emit = (fromM: number, toM: number, loY: number, hiY: number, role: WallSegmentRole) => {
    const lengthM = toM - fromM;
    const boxHeight = hiY - loY;
    if (lengthM < MIN_GEOMETRY_M || boxHeight < MIN_GEOMETRY_M) return;
    const [cx, cz] = pointAlongAxis(axis, (fromM + toM) / 2);
    const position = roundTriple([cx, baseY + (loY + hiY) / 2, cz]);
    const rotationY = round6(axis.headingY);
    const scale = roundTriple([lengthM, boxHeight, thicknessM]);
    out.push({
      id: `${element.id}#s${out.length}`,
      elementId: element.id,
      floorNo,
      role,
      position,
      rotationY,
      scale,
      matrix: composeTrs(position, rotationY, scale),
      isCore: isCoreWall(element),
      isExterior: isExteriorWall(element),
      isCurtainWall: isCurtainWall(element),
    });
  };

  let cursor = 0;
  for (const cut of cuts) {
    // Overlapping openings (two doors sharing a jamb) must not produce a
    // negative-length pier or a doubled band: the later one starts at the
    // cursor, and collapses to nothing if it is fully swallowed.
    const fromM = Math.max(cursor, cut.fromM);
    const toM = Math.max(fromM, cut.toM);
    if (fromM > cursor) emit(cursor, fromM, 0, heightM, "pier");
    if (toM - fromM >= MIN_GEOMETRY_M) {
      if (cut.sillM > 0) emit(fromM, toM, 0, cut.sillM, "sill");
      if (cut.headM < heightM) emit(fromM, toM, cut.headM, heightM, "header");
    }
    cursor = Math.max(cursor, toM);
  }
  if (cursor < axis.lengthM) {
    emit(cursor, axis.lengthM, 0, heightM, cuts.length === 0 ? "full" : "pier");
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function skip(
  element: BimElement,
  reason: SkippedElement["reason"],
  detail: string,
): SkippedElement {
  return {
    elementId: element.id,
    kind: element.kind,
    category: element.category,
    reason,
    detail,
  };
}
