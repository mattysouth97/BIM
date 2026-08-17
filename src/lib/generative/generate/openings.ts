// src/lib/generative/generate/openings.ts
//
// Openings are DERIVED, never authored.
//
// Two independent rule systems produce every hole in the model:
//
//   DOORS   come from CONNECTIVITY. A door exists because two spaces have to be
//           able to reach each other — either a room hangs off circulation, or
//           the program graph declares REQUIRES_ADJACENCY between them. Placing
//           doors "somewhere sensible" would produce a plan that looks right and
//           is topologically wrong; deriving them from the space graph means the
//           circulation diagram and the door schedule can never disagree.
//
//   WINDOWS come from FACADE RULES. Per elevation the spec states a module, a
//           window size, a sill/head band and a window-to-wall ratio. We tile
//           the module along the wall and then TRIM to the stated ratio, so the
//           geometry the viewer shows and the WWR the report quotes are the same
//           number rather than two independent guesses.
//
// Everything here is METRES in the engine's local XZ frame; spec values are
// millimetres and are divided by 1000 at the point of use.

import type { BuildingSpec, FacadeSide } from "../spec/building-spec";
import type { Rng } from "../rng";
import type { GeneratedOpening, GeneratedWall, PlacedSpace } from "./types";

/**
 * Clear reveal kept at each end of an exterior wall. A window that runs into the
 * corner has nowhere for the jamb, the return, or the column that is usually
 * sitting right there — so a module that cannot respect it is skipped entirely
 * rather than shuffled inwards (shuffling would break the module rhythm).
 */
const CORNER_CLEARANCE_M = 0.6;

/** Mullion/joint allowance either side of a curtain-wall vision panel. */
const CURTAIN_WALL_MULLION_M = 0.1;

/**
 * Minimum masonry pier between punched openings. Also the guard that keeps a
 * spec with `windowWidthMm > moduleMm` from emitting windows that overlap their
 * neighbours — an overlapping pair is not a facade, it is one bigger hole.
 */
const MIN_PIER_M = 0.05;

/** A door needs its host wall to be at least this much wider than the leaf. */
const DOOR_JAMB_ALLOWANCE_M = 0.4;

/** Floating-point slack so an exact-fit ratio is not rounded off by one window. */
const EPSILON = 1e-9;

export interface OpeningsInput {
  spec: BuildingSpec;
  floorNo: number;
  walls: GeneratedWall[];
  spaces: PlacedSpace[];
  /**
   * Present for signature symmetry with the other generators. Openings are
   * fully determined by connectivity and the facade rules, so there is nothing
   * to jitter — introducing randomness here would only make the door schedule
   * unstable between identical regenerations.
   */
  rng: Rng;
}

export function generateOpenings(input: OpeningsInput): GeneratedOpening[] {
  const { spec, floorNo, walls, spaces } = input;

  // Guard against being handed the whole building: an opening must only ever
  // host on a wall that exists on its own level.
  const levelWalls = walls.filter((wall) => wall.floorNo === floorNo);
  const spaceById = new Map(spaces.map((space) => [space.id, space]));

  return [
    ...generateDoors(spec, floorNo, levelWalls, spaceById),
    ...generateWindows(spec, floorNo, levelWalls),
  ];
}

/* ------------------------------------------------------------------ */
/* Doors                                                               */
/* ------------------------------------------------------------------ */

function generateDoors(
  spec: BuildingSpec,
  floorNo: number,
  walls: GeneratedWall[],
  spaceById: Map<string, PlacedSpace>,
): GeneratedOpening[] {
  const widthM = spec.dimensions.doorWidthMm.value / 1000;
  const heightM = spec.dimensions.doorHeightMm.value / 1000;
  const minWallM = widthM + DOOR_JAMB_ALLOWANCE_M;
  const requiredPairs = requiredAdjacencyPairs(spec);

  const doors: GeneratedOpening[] = [];

  for (const wall of walls) {
    // Exterior walls carry no doors yet. FOLLOW-UP: entrance doors belong to an
    // entrance pass that reads `orientation.primaryEntranceFacade` and the
    // ground-level lobby, not to this generic partition rule — inventing one
    // here would put a front door on every elevation of every storey.
    // Core walls are likewise deferred to the egress/core pass, which has to
    // reason about fire-rated leaves and stair discharge.
    if (wall.role !== "interior") continue;
    if (wall.boundsSpaceIds.length !== 2) continue;

    const [idA, idB] = wall.boundsSpaceIds;
    const a = spaceById.get(idA);
    const b = spaceById.get(idB);
    if (!a || !b || a.id === b.id) continue;

    // Rule 1: a room reaches circulation. Rule 2: the program graph demands the
    // two rooms touch, so the shared wall has to be openable. Corridor-to-
    // corridor is skipped — those are the same circulation loop, not a doorway.
    const circulationCount = Number(a.isCirculation) + Number(b.isCirculation);
    const connectsToCirculation = circulationCount === 1;
    const programRequires =
      circulationCount === 0 && requiredPairs.has(pairKey(a.programId, b.programId));
    if (!connectsToCirculation && !programRequires) continue;

    // A door that cannot physically fit its host is a drawing error, not a door.
    if (wallLength(wall) < minWallM) continue;

    const [sx, sz] = wall.start;
    const [ex, ez] = wall.end;

    doors.push({
      id: `DOOR-L${floorNo}-${String(doors.length).padStart(3, "0")}`,
      floorNo,
      hostWallId: wall.id,
      kind: "door",
      position: [(sx + ex) / 2, (sz + ez) / 2],
      widthM,
      heightM,
      sillM: 0,
      connectsSpaceIds: [a.id, b.id],
    });
  }

  return doors;
}

/**
 * Undirected set of program-id pairs the spec says MUST be adjacent. Declared on
 * either item is enough — "lab support next to labs" and "labs next to lab
 * support" are the same requirement, and only one of them is usually written.
 */
function requiredAdjacencyPairs(spec: BuildingSpec): Set<string> {
  const pairs = new Set<string>();
  for (const item of spec.program) {
    for (const link of item.adjacency) {
      if (link.kind !== "REQUIRES_ADJACENCY") continue;
      if (!link.targetId) continue;
      pairs.add(pairKey(item.id, link.targetId));
    }
  }
  return pairs;
}

/**
 * Order-independent key for a pair of program ids. The separator is a byte a
 * slug can never contain, so the pair ("a-b", "c") cannot collide with the
 * pair ("a", "b-c").
 */
const PAIR_SEPARATOR = "\u0000";

function pairKey(a: string, b: string): string {
  // Solver-created spaces carry an empty programId; two of those must not
  // collapse into a self-pair that then matches every declared requirement.
  if (!a || !b) return "";
  return a < b ? a + PAIR_SEPARATOR + b : b + PAIR_SEPARATOR + a;
}

/* ------------------------------------------------------------------ */
/* Windows                                                             */
/* ------------------------------------------------------------------ */

function generateWindows(
  spec: BuildingSpec,
  floorNo: number,
  walls: GeneratedWall[],
): GeneratedOpening[] {
  const windows: GeneratedOpening[] = [];

  for (const wall of walls) {
    // Only the envelope sees daylight. Interior partitions and core walls are
    // opaque by definition here; internal borrowed lights are a later feature.
    if (wall.role !== "exterior") continue;
    if (!wall.side) continue;

    const side = spec.facade.sides.find((entry) => entry.side === wall.side);
    if (!side) continue;
    // A solid elevation is a stated design decision, not a zero-width window.
    if (side.system === "solid") continue;

    for (const placed of windowsOnWall(side, wall)) {
      windows.push({
        id: `WIN-L${floorNo}-${String(windows.length).padStart(4, "0")}`,
        floorNo,
        hostWallId: wall.id,
        kind: "window",
        position: placed.position,
        widthM: placed.widthM,
        heightM: placed.heightM,
        sillM: placed.sillM,
      });
    }
  }

  return windows;
}

interface PlacedWindow {
  position: [number, number];
  widthM: number;
  heightM: number;
  sillM: number;
}

function windowsOnWall(side: FacadeSide, wall: GeneratedWall): PlacedWindow[] {
  const lengthM = wallLength(wall);
  const moduleM = side.moduleMm / 1000;
  if (moduleM <= 0 || lengthM <= 0) return [];

  const isCurtainWall = side.system === "curtain-wall";
  // A curtain wall is glass by default and solid by exception, so the panel
  // fills its module and starts at the floor. A punched window is a hole in a
  // wall, so it keeps its stated size and sill — but never so wide that it
  // swallows the pier to the next opening.
  const widthM = isCurtainWall
    ? Math.max(0, moduleM - CURTAIN_WALL_MULLION_M)
    : Math.min(side.windowWidthMm / 1000, moduleM - MIN_PIER_M);
  const sillM = isCurtainWall ? 0 : side.sillHeightMm / 1000;
  const heightM = side.headHeightMm / 1000 - sillM;
  if (widthM <= 0 || heightM <= 0) return [];

  const moduleCount = Math.floor(lengthM / moduleM);
  const usableStart = CORNER_CLEARANCE_M;
  const usableEnd = lengthM - CORNER_CLEARANCE_M;

  const placed: PlacedWindow[] = [];
  for (let i = 0; i < moduleCount; i += 1) {
    const centre = (i + 0.5) * moduleM;
    // Skip, do not nudge: a shifted window would break the module rhythm the
    // rest of the facade (mullions, panels, structure) is set out from.
    if (centre - widthM / 2 < usableStart - EPSILON) continue;
    if (centre + widthM / 2 > usableEnd + EPSILON) continue;
    placed.push({ position: pointAlongWall(wall, centre), widthM, heightM, sillM });
  }

  // Trim to the stated window-to-wall ratio. Without this the module tiling and
  // the reported WWR are two independent numbers that drift apart, and the
  // energy/daylight story stops matching the geometry. Trailing modules go
  // first so the elevation reads as a run that stops, not a random gap-toothed
  // pattern.
  const wallAreaSqm = lengthM * wall.heightM;
  const budgetSqm = wallAreaSqm * side.glazingRatio;
  const perWindowSqm = widthM * heightM;
  if (perWindowSqm <= 0) return [];
  const maxWindows = Math.floor(budgetSqm / perWindowSqm + EPSILON);

  return placed.slice(0, Math.max(0, maxWindows));
}

/* ------------------------------------------------------------------ */
/* Wall geometry                                                       */
/* ------------------------------------------------------------------ */

function wallLength(wall: GeneratedWall): number {
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
}

/** Point at `distanceM` measured from `wall.start` towards `wall.end`. */
function pointAlongWall(wall: GeneratedWall, distanceM: number): [number, number] {
  const length = wallLength(wall);
  if (length === 0) return [wall.start[0], wall.start[1]];
  const t = distanceM / length;
  return [
    wall.start[0] + (wall.end[0] - wall.start[0]) * t,
    wall.start[1] + (wall.end[1] - wall.start[1]) * t,
  ];
}
