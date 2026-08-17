// src/lib/interior/build.ts
//
// The whole solved interior of a BimModelSnapshot, grouped by storey.
//
// Composition only: walls.ts decides what a wall looks like, families.ts decides
// which GLB a door is, and this file decides nothing about geometry except the
// guard runs it derives from the stair shafts. What it DOES own is the census —
// every element in the snapshot ends up either drawn, in `stats.skipped` with a
// reason, or counted in `stats.outOfScope`. Nothing falls off the edge quietly.

import { authoringFamilyUrl } from "@/lib/bim/family-catalog";
import { headingYFromAxis } from "@/lib/bim/model/geometry";
import type { BimElement, BimModelSnapshot } from "@/lib/bim/model/types";

import {
  RAILING_FAMILY_ID,
  buildFamilyPoses,
  isPoseLaneElement,
  nativeDims,
} from "./families";
import {
  MIN_GEOMETRY_M,
  indexLevels,
  isAuthored,
  isExteriorWall,
  isOpening,
  levelOf,
  numberParam,
} from "./snapshot-read";
import { round6, roundTriple } from "./transform";
import { buildWallInstances, isWallLaneElement } from "./walls";
import type { InteriorBuildOptions, InteriorModel, RailingRun } from "./types";

export function buildInteriorModel(
  snapshot: BimModelSnapshot,
  options: InteriorBuildOptions = {},
): InteriorModel {
  const wallResult = buildWallInstances(snapshot, options);
  const poseResult = buildFamilyPoses(snapshot, options);
  const railings = buildRailingRuns(snapshot);

  const skipped = [...wallResult.skipped, ...poseResult.skipped].sort(
    (a, b) =>
      (a.elementId < b.elementId ? -1 : a.elementId > b.elementId ? 1 : 0) ||
      (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0),
  );

  const drawn = new Set([...wallResult.drawnElementIds, ...poseResult.drawnElementIds]);
  const logged = new Set(skipped.map((entry) => entry.elementId));

  const wallsByFloor = groupByFloor(wallResult.walls);
  const posesByFloor = groupByFloor(poseResult.poses);
  const railingsByFloor = groupByFloor(railings);

  const floors = [
    ...new Set([
      ...Object.keys(wallsByFloor),
      ...Object.keys(posesByFloor),
      ...Object.keys(railingsByFloor),
    ]),
  ]
    .map(Number)
    .sort((a, b) => a - b);

  return {
    floors,
    wallsByFloor,
    posesByFloor,
    railingsByFloor,
    stats: {
      wallCount: wallResult.walls.length,
      poseCount: poseResult.poses.length,
      railingCount: railings.length,
      skipped,
      outOfScope: census(snapshot, options, drawn, logged),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Railings                                                            */
/* ------------------------------------------------------------------ */

/**
 * A guard along the open edge of every stair shaft, per storey.
 *
 * This is the horizontal landing guard, not the raking rail that follows a
 * flight: `railing-guard-1m` is a flat 1 m module, and a raking run needs a
 * family that can be sloped or a per-riser chain — a follow-up, not something
 * to fake by tilting a guardrail into the floor.
 *
 * The edge is chosen geometrically (the long side of the shaft rect, on the
 * +cross-axis face) because the snapshot records no "open side": a stair
 * component is a rect and a level span, and inventing an approach direction
 * from nothing would be a guess dressed as data.
 */
export function buildRailingRuns(snapshot: BimModelSnapshot): RailingRun[] {
  const levels = indexLevels(snapshot);
  const dims = nativeDims(RAILING_FAMILY_ID);
  if (!dims) return [];

  const runs: RailingRun[] = [];
  for (const element of snapshot.elements) {
    if (element.kind !== "stair" || isAuthored(element) || element.visible === false) continue;
    const level = levelOf(levels, element);
    if (!level) continue;

    const widthM = numberParam(element, "widthM") ?? 0;
    const depthM = numberParam(element, "depthM") ?? 0;
    if (widthM < MIN_GEOMETRY_M || depthM < MIN_GEOMETRY_M) continue;

    const alongZ = depthM >= widthM;
    const lengthM = alongZ ? depthM : widthM;
    const cx = element.placement.x;
    const cz = element.placement.z;

    // Both runs finish at the shaft's (+x, +z) corner; only the end they start
    // from differs. `railing-guard-1m` has its origin at the start of the
    // module, on its base (catalog `origin: "start-base"`).
    const start: [number, number] = alongZ
      ? [round6(cx + widthM / 2), round6(cz - depthM / 2)]
      : [round6(cx - widthM / 2), round6(cz + depthM / 2)];
    const end: [number, number] = [round6(cx + widthM / 2), round6(cz + depthM / 2)];

    const rotationY = headingYFromAxis(
      { x: start[0], z: start[1] },
      { x: end[0], z: end[1] },
    );
    const position = roundTriple([start[0], level.elevation, start[1]]);

    runs.push({
      id: `${element.id}#r`,
      elementId: element.id,
      familyId: RAILING_FAMILY_ID,
      url: authoringFamilyUrl(RAILING_FAMILY_ID),
      floorNo: level.floorNo,
      start,
      end,
      lengthM: round6(lengthM),
      heightM: dims.heightM,
      position,
      rotationY: round6(rotationY),
      // The module is 1.04 m end to end, so this scale makes the run measure
      // `lengthM` including its end caps.
      scale: roundTriple([lengthM / dims.widthM, 1, 1]),
    });
  }

  runs.sort(
    (a, b) =>
      a.floorNo - b.floorNo ||
      (a.elementId < b.elementId ? -1 : a.elementId > b.elementId ? 1 : 0),
  );
  return runs;
}

/* ------------------------------------------------------------------ */
/* Census                                                              */
/* ------------------------------------------------------------------ */

/**
 * Everything neither drawn nor logged as a failure, counted by why. These are
 * scoping decisions, not defects: the massing shell draws slabs, columns and
 * beams; `AuthoringFamilyLayer` draws authored families; rooms are volumes of
 * air with no surface of their own.
 */
function census(
  snapshot: BimModelSnapshot,
  options: InteriorBuildOptions,
  drawn: ReadonlySet<string>,
  logged: ReadonlySet<string>,
): Record<string, number> {
  const byId = new Map(snapshot.elements.map((element) => [element.id, element]));
  const counts: Record<string, number> = {};
  const bump = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1;
  };

  for (const element of snapshot.elements) {
    if (drawn.has(element.id) || logged.has(element.id)) continue;
    bump(reasonFor(element, byId, options));
  }

  // Deterministic key order, whatever order the elements arrived in.
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
}

function reasonFor(
  element: BimElement,
  byId: ReadonlyMap<string, BimElement>,
  options: InteriorBuildOptions,
): string {
  if (isAuthored(element)) return "authored (drawn by the authoring layer)";
  if (element.visible === false) return "hidden (visible === false)";

  if (element.kind === "wall") {
    if (!options.includeExterior && isExteriorWall(element)) {
      return "exterior wall (includeExterior === false)";
    }
    if (isWallLaneElement(element, options)) return "wall entirely occupied by openings";
  }

  if (isOpening(element)) {
    const host = element.hostId ? byId.get(element.hostId) : undefined;
    if (host && !options.includeExterior && isExteriorWall(host)) {
      return "opening on an exterior wall (includeExterior === false)";
    }
  }

  if (isPoseLaneElement(element)) return `unrepresented ${element.kind}`;
  return `not an interior kind: ${element.kind}`;
}

/* ------------------------------------------------------------------ */
/* Grouping                                                            */
/* ------------------------------------------------------------------ */

function groupByFloor<T extends { floorNo: number }>(items: T[]): Record<number, T[]> {
  const out: Record<number, T[]> = {};
  for (const item of items) {
    const list = out[item.floorNo];
    if (list) list.push(item);
    else out[item.floorNo] = [item];
  }
  return out;
}
