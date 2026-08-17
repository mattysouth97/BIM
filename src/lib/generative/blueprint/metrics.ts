// src/lib/generative/blueprint/metrics.ts
//
// Fidelity metrics: how much of the blueprint survived generation, MEASURED.
//
//   BlueprintSpec (what was asked for) → [engine] → GeneratedBuilding (what was
//   built) → [HERE] → a per-dimension report of the difference.
//
// The blueprint is design authority. `preservationPlan()` in fidelity.ts states
// what the engine INTENDS to keep before it runs; this module states what it
// ACTUALLY kept afterwards, by comparing geometry to geometry. The two answer
// different questions and a promise is not evidence, which is why this exists
// as a separate pass rather than as a confidence number stamped on the spec.
//
// NO BLENDED SCORE
// ----------------
// There is deliberately no single "fidelity score". A courtyard that got built
// over and a core that shifted 300 mm are not commensurable, and averaging them
// would produce a number that reads as precise while meaning nothing. Every
// dimension is reported on its own, in its own units, and a caller that needs a
// headline picks the one its user cares about.
//
// HONESTY OVER COVERAGE
// ---------------------
// Anything the generated model carries no comparable feature for is reported as
// NOT MEASURED with a reason, never as a zero or a default. A "0.0 m
// displacement" for an anchor nothing was compared against would be a lie in
// exactly the format a reader trusts most.
//
// UNITS
// -----
// The blueprint is integer MILLIMETRES in its own drawing coordinates. The
// generated building is METRES in the engine's frame, whose origin is the
// centre of the largest plate's bounding box. So:
//
//     engine_mm = blueprint_mm + shift        (shift from `blueprintPlateFrame`)
//     engine_m  = engine_mm / 1000
//
// Every number this module REPORTS is metres, square metres, or a unitless
// ratio — millimetres exist only inside the transform. The shift is read from
// `blueprintPlateFrame` rather than re-derived, so a compiler change moves the
// measurement with it instead of silently invalidating it.
//
// DETERMINISM
// -----------
// Pure function of (blueprint, building). No `Math.random`, no `Date.now`, no
// mutation of either argument; declaration order is preserved everywhere, so a
// report is byte-identical for byte-identical inputs.

import {
  multiPolygonArea,
  polygonArea,
  polygonIntersection,
  polygonXor,
  rectToPolygon,
  unionAll,
  type MultiPolygon,
  type Polygon,
  type Vec2,
} from "../geom";
import type {
  GeneratedBuilding,
  GeneratedLevel,
  PlacedSpace,
  Rect,
} from "../generate/types";
import type { SpaceType } from "../spec/building-spec";
import type {
  AnchorKind,
  BlueprintSpec,
  BoundaryLoop,
  Hold,
  Region,
  RelationshipKind,
} from "./blueprint-spec";
import {
  blueprintLoopIndex,
  blueprintPlateFrame,
  blueprintRegionToPolygonMm,
  deriveZoneSpecId,
} from "./compile";

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

/** One thing that could not be compared, and why. Never silently dropped. */
export interface NotMeasured {
  subject: "boundary" | "void" | "core" | "zone";
  /** Blueprint id of the object, or the level label for a boundary. */
  id: string;
  reason: string;
}

export interface LevelBoundaryFidelity {
  floorNo: number;
  blueprintAreaSqm: number;
  generatedAreaSqm: number;
  /** |generated − blueprint| / blueprint. Blind to shape: 0 for a rotated plate. */
  areaDeviationRatio: number;
  /**
   * area(blueprint XOR generated) / area(blueprint) — the one that catches a
   * plate that kept its area while changing its outline.
   */
  symmetricDifferenceRatio: number;
}

export interface BoundaryFidelity {
  /** One entry per level the blueprint and the building BOTH name. */
  levels: LevelBoundaryFidelity[];
  /** Levels the blueprint drew that the building has no plate for. */
  blueprintOnlyFloorNos: number[];
  /** Levels the building built that the blueprint never drew. */
  generatedOnlyFloorNos: number[];
  /** null when no level was comparable — never 0, which would read as perfect. */
  meanAreaDeviationRatio: number | null;
  worstAreaDeviationRatio: number | null;
  meanSymmetricDifferenceRatio: number | null;
  worstSymmetricDifferenceRatio: number | null;
}

export interface VoidFidelity {
  voidId: string;
  kind: "atrium" | "courtyard" | "shaft";
  floorNo: number;
  voidAreaSqm: number;
  /** How much of the void the generated plate covered over. */
  builtOverAreaSqm: number;
  /** 1 − builtOver/void. 1 = the hole survived; 0 = it was filled in. */
  retainedRatio: number;
}

export interface CoreFidelity {
  coreId: string;
  /** The author's hold, so a caller can see whether a HARD core moved. */
  hold: Hold;
  /**
   * False for every core after the first: `compileBlueprintToSpec` reads
   * `blueprint.cores[0]` and the spec carries exactly one core, so a second
   * drawn core is measured against a core it never influenced.
   */
  compiled: boolean;
  blueprintCentreM: Vec2;
  generatedCentreM: Vec2;
  displacementM: number;
}

export type AnchorFidelity =
  | {
      anchorId: string;
      kind: AnchorKind;
      hold: Hold;
      measured: true;
      /** Which generated feature the anchor was compared against. */
      comparedWith: "core-centre" | "exterior-door";
      blueprintPositionM: Vec2;
      generatedPositionM: Vec2;
      displacementM: number;
    }
  | {
      anchorId: string;
      kind: AnchorKind;
      hold: Hold;
      measured: false;
      reason: string;
    };

export interface ZoneFloorFidelity {
  floorNo: number;
  placedSpaceCount: number;
  overlapRatio: number;
}

export interface ZoneFidelity {
  zoneId: string;
  /** The `ProgramItem.id` the compiler derived from this zone. */
  programId: string;
  program: SpaceType;
  zoneAreaSqm: number;
  /**
   * area(zone ∩ ∪ spaces carrying this zone's programId, over the zone's
   * floors) / area(zone). The union is taken across floors, as the spec
   * defines it; `floors` breaks the same measurement down per level, which is
   * what tells a stacked zone that drifted apart from one that did not.
   */
  overlapRatio: number;
  floors: ZoneFloorFidelity[];
  placedSpaceCount: number;
}

export type RelationshipOutcome = "satisfied" | "violated" | "not-measurable";

export interface RelationshipFidelity {
  relationshipId: string;
  kind: RelationshipKind;
  fromId: string;
  toId: string | null;
  weight: number;
  outcome: RelationshipOutcome;
  /** Always present when the outcome is "not-measurable". */
  reason?: string;
}

export interface TopologyFidelity {
  relationships: RelationshipFidelity[];
  counts: { satisfied: number; violated: number; notMeasurable: number };
  /**
   * satisfied / (satisfied + violated) — over MEASURABLE relationships only, so
   * a blueprint full of alignment intent the engine cannot express does not get
   * a flattering denominator. null when nothing was measurable.
   */
  satisfiedRatio: number | null;
}

export interface BlueprintFidelityReport {
  blueprintId: string;
  /** Levels the boundary comparison actually ran on, ascending. */
  measuredFloorNos: number[];
  boundary: BoundaryFidelity;
  voids: VoidFidelity[];
  cores: CoreFidelity[];
  anchors: AnchorFidelity[];
  zones: ZoneFidelity[];
  topology: TopologyFidelity;
  notMeasured: NotMeasured[];
}

/* ------------------------------------------------------------------ */
/* Numeric helpers                                                     */
/* ------------------------------------------------------------------ */

const MM_PER_M = 1_000;

/**
 * A ring of a few square millimetres is tessellation noise, not a region. Below
 * this an area is treated as absent rather than divided by.
 */
const AREA_EPS_SQM = 1e-9;

/** Reports read as numbers, not as float exhaust. 1e-6 is a micrometre / a ppm. */
const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

const worst = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => Math.max(a, b), 0);

const roundOrNull = (value: number | null): number | null =>
  value === null ? null : round6(value);

const rectCentreOf = (rect: Rect): Vec2 => [
  (rect.minX + rect.maxX) / 2,
  (rect.minZ + rect.maxZ) / 2,
];

const distance = (a: Vec2, b: Vec2): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * Area-weighted centroid of `[outer, ...holes]`. Holes are wound clockwise, so
 * their signed area is negative and they pull the centroid out of themselves
 * without any special-casing — which is what makes a doughnut-shaped core
 * report its true centre rather than the centre of its solid part.
 */
function polygonCentroid(polygon: Polygon): Vec2 | null {
  let areaSum = 0;
  let momentX = 0;
  let momentZ = 0;

  for (const ring of polygon) {
    if (ring.length < 3) continue;
    let signedArea = 0;
    let ringX = 0;
    let ringZ = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const [x1, z1] = ring[i];
      const [x2, z2] = ring[(i + 1) % ring.length];
      const cross = x1 * z2 - x2 * z1;
      signedArea += cross;
      ringX += (x1 + x2) * cross;
      ringZ += (z1 + z2) * cross;
    }
    signedArea /= 2;
    if (Math.abs(signedArea) < AREA_EPS_SQM) continue;
    areaSum += signedArea;
    // ringX / 6 === signedArea × centroidX, so the division by the total area
    // happens once at the end and every ring contributes by its own weight.
    momentX += ringX / 6;
    momentZ += ringZ / 6;
  }

  if (Math.abs(areaSum) < AREA_EPS_SQM) return null;
  return [momentX / areaSum, momentZ / areaSum];
}

/**
 * Area of `subject ∩ parts` where `parts` came out of a union and are therefore
 * disjoint — so summing the pairwise intersections double-counts nothing.
 */
function intersectionAreaWith(subject: Polygon, parts: MultiPolygon): number {
  let total = 0;
  for (const part of parts) {
    total += multiPolygonArea(polygonIntersection(subject, part));
  }
  return total;
}

/* ------------------------------------------------------------------ */
/* Blueprint → engine frame                                            */
/* ------------------------------------------------------------------ */

/** Millimetres in the engine's frame → metres. One place, one division. */
const mmPolygonToMetres = (polygonMm: Polygon): Polygon =>
  polygonMm.map((ring) => ring.map(([x, z]): Vec2 => [x / MM_PER_M, z / MM_PER_M]));

interface EngineTransform {
  shiftXMm: number;
  shiftZMm: number;
}

/** A blueprint-space mm polygon as engine-space metres. */
const toEngineMetres = (polygonMm: Polygon, t: EngineTransform): Polygon =>
  polygonMm.map((ring) =>
    ring.map(([x, z]): Vec2 => [
      (x + t.shiftXMm) / MM_PER_M,
      (z + t.shiftZMm) / MM_PER_M,
    ]),
  );

const pointToEngineMetres = (xMm: number, zMm: number, t: EngineTransform): Vec2 => [
  (xMm + t.shiftXMm) / MM_PER_M,
  (zMm + t.shiftZMm) / MM_PER_M,
];

/**
 * A region as engine-space metres, resolved exactly the way the compiler
 * resolves it (loop / loopRef / rotated rect) — so a zone that measures badly
 * measures badly because of the ENGINE, not because two readers of the same
 * rectangle disagreed about its corners.
 */
function regionToEngineMetres(
  blueprint: BlueprintSpec,
  region: Region,
  loops: Map<string, BoundaryLoop>,
  transform: EngineTransform,
): Polygon | null {
  const polygonMm = blueprintRegionToPolygonMm(blueprint, region, loops);
  if (polygonMm === null) return null;
  return toEngineMetres(polygonMm, transform);
}

/* ------------------------------------------------------------------ */
/* Zone id → ProgramItem id                                            */
/* ------------------------------------------------------------------ */

/**
 * `compileBlueprintToSpec` does not use a zone's id verbatim: it truncates to
 * 48 characters, de-duplicates collisions with a counter, and keeps only the
 * first 56 zones that resolve to a region. `PlacedSpace.programId` is that
 * derived id, so finding a zone's spaces means replaying the derivation rather
 * than matching on `zone.id` and quietly measuring nothing. The derivation
 * itself is `deriveZoneSpecId`, imported from the compiler so the replay
 * cannot drift from the original.
 *
 * Zones that never became a program item are simply absent from the map, which
 * is how the caller learns to report them as not measured.
 */
function zoneProgramIds(
  blueprint: BlueprintSpec,
  loops: Map<string, BoundaryLoop>,
): Map<string, string> {
  const out = new Map<string, string>();
  const usedIds = new Set<string>();
  let compiledCount = 0;

  for (const zone of blueprint.zones) {
    if (blueprintRegionToPolygonMm(blueprint, zone.region, loops) === null) continue;
    if (new Set(zone.floorNos).size === 0) continue;

    const id = deriveZoneSpecId(zone.id, usedIds);

    // compile.ts: `zoneFacts.slice(0, 56)` — the 57th zone and beyond are
    // dropped before they reach the program.
    compiledCount += 1;
    if (compiledCount <= 56) out.set(zone.id, id);
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Topology                                                            */
/* ------------------------------------------------------------------ */

/** Why a relationship kind carries no geometric test against this model. */
const UNMEASURABLE_KIND_REASON: Partial<Record<RelationshipKind, string>> = {
  FACES:
    "FACES names a direction of outlook; the generated model carries no view or orientation per space to compare it against.",
  ALIGNED_WITH:
    "ALIGNED_WITH names a shared alignment axis, which the space solver's axis-aligned rects cannot distinguish from coincidence.",
  CENTERED_ON:
    "CENTERED_ON names a centring the solver neither records nor is asked to hold.",
  STACKED_WITH:
    "STACKED_WITH names a vertical correspondence; spaces are solved per level with no stacking identity to test.",
  CONTAINS:
    "CONTAINS names a containment between blueprint objects, not between placed spaces.",
  INSIDE:
    "INSIDE names a containment between blueprint objects, not between placed spaces.",
};

const ADJACENCY_KINDS: RelationshipKind[] = [
  "REQUIRES_ADJACENCY",
  "ADJACENT_TO",
  "PREFER_ADJACENCY",
];

const CONNECTION_KINDS: RelationshipKind[] = ["CONNECTED_TO", "OPENS_TO"];

/** Do any two of these spaces share a wall of usable length? */
function anyAdjacent(a: PlacedSpace[], b: PlacedSpace[]): boolean {
  const bIds = new Set(b.map((space) => space.id));
  return a.some((space) => space.adjacentSpaceIds.some((id) => bIds.has(id)));
}

/** Is there a door whose two spaces straddle the pair? */
function anyDoorBetween(
  a: PlacedSpace[],
  b: PlacedSpace[],
  building: GeneratedBuilding,
): boolean {
  const aIds = new Set(a.map((space) => space.id));
  const bIds = new Set(b.map((space) => space.id));
  return building.openings.some((opening) => {
    if (opening.kind !== "door") return false;
    const pair = opening.connectsSpaceIds;
    if (pair === undefined) return false;
    return (
      (aIds.has(pair[0]) && bIds.has(pair[1])) || (aIds.has(pair[1]) && bIds.has(pair[0]))
    );
  });
}

function measureTopology(
  blueprint: BlueprintSpec,
  building: GeneratedBuilding,
  programIdOfZone: Map<string, string>,
): TopologyFidelity {
  const spacesByProgramId = new Map<string, PlacedSpace[]>();
  for (const space of building.spaces) {
    if (space.programId === "") continue;
    const bucket = spacesByProgramId.get(space.programId);
    if (bucket === undefined) spacesByProgramId.set(space.programId, [space]);
    else bucket.push(space);
  }

  const spacesOfZone = (zoneId: string): PlacedSpace[] | null => {
    const programId = programIdOfZone.get(zoneId);
    if (programId === undefined) return null;
    return spacesByProgramId.get(programId) ?? [];
  };

  const relationships: RelationshipFidelity[] = [];

  for (const relationship of blueprint.relationships) {
    const base = {
      relationshipId: relationship.id,
      kind: relationship.kind,
      fromId: relationship.fromId,
      toId: relationship.toId ?? null,
      weight: relationship.weight,
    };
    const unmeasurable = (reason: string): RelationshipFidelity => ({
      ...base,
      outcome: "not-measurable",
      reason,
    });
    const verdict = (satisfied: boolean): RelationshipFidelity => ({
      ...base,
      outcome: satisfied ? "satisfied" : "violated",
    });

    const kindReason = UNMEASURABLE_KIND_REASON[relationship.kind];
    if (kindReason !== undefined) {
      relationships.push(unmeasurable(kindReason));
      continue;
    }

    const from = spacesOfZone(relationship.fromId);
    if (from === null) {
      relationships.push(
        unmeasurable(
          `"${relationship.fromId}" is not a zone that became a program item, and only those map to generated spaces.`,
        ),
      );
      continue;
    }
    if (from.length === 0) {
      relationships.push(
        unmeasurable(`Zone "${relationship.fromId}" placed no spaces to measure.`),
      );
      continue;
    }

    if (relationship.kind === "REQUIRES_EXTERIOR") {
      relationships.push(verdict(from.some((space) => space.hasExteriorWall)));
      continue;
    }

    if (relationship.toId === undefined) {
      relationships.push(
        unmeasurable(`${relationship.kind} needs a target, and this one names none.`),
      );
      continue;
    }
    const to = spacesOfZone(relationship.toId);
    if (to === null) {
      relationships.push(
        unmeasurable(
          `"${relationship.toId}" is not a zone that became a program item, and only those map to generated spaces.`,
        ),
      );
      continue;
    }
    if (to.length === 0) {
      relationships.push(
        unmeasurable(`Zone "${relationship.toId}" placed no spaces to measure.`),
      );
      continue;
    }

    const adjacent = anyAdjacent(from, to);
    if (ADJACENCY_KINDS.includes(relationship.kind)) {
      relationships.push(verdict(adjacent));
    } else if (relationship.kind === "AVOID_ADJACENCY") {
      relationships.push(verdict(!adjacent));
    } else if (CONNECTION_KINDS.includes(relationship.kind)) {
      relationships.push(verdict(adjacent || anyDoorBetween(from, to, building)));
    } else {
      relationships.push(
        unmeasurable(`${relationship.kind} has no geometric test in this model.`),
      );
    }
  }

  const satisfied = relationships.filter((r) => r.outcome === "satisfied").length;
  const violated = relationships.filter((r) => r.outcome === "violated").length;
  const notMeasurable = relationships.filter(
    (r) => r.outcome === "not-measurable",
  ).length;
  const measurable = satisfied + violated;

  return {
    relationships,
    counts: { satisfied, violated, notMeasurable },
    satisfiedRatio: measurable === 0 ? null : round6(satisfied / measurable),
  };
}

/* ------------------------------------------------------------------ */
/* The measurement                                                     */
/* ------------------------------------------------------------------ */

const EMPTY_BOUNDARY: BoundaryFidelity = {
  levels: [],
  blueprintOnlyFloorNos: [],
  generatedOnlyFloorNos: [],
  meanAreaDeviationRatio: null,
  worstAreaDeviationRatio: null,
  meanSymmetricDifferenceRatio: null,
  worstSymmetricDifferenceRatio: null,
};

/**
 * Measure a generated building against the blueprint that asked for it.
 *
 * Both arguments are read-only. Nothing here can fail on well-formed input: an
 * unresolvable region, a level the building does not have, an anchor with no
 * counterpart all land in `notMeasured` or in a `measured: false` entry, which
 * is the honest reading and the one a reviewer can act on.
 */
export function measureBlueprintFidelity(
  blueprint: BlueprintSpec,
  building: GeneratedBuilding,
): BlueprintFidelityReport {
  const loops = blueprintLoopIndex(blueprint);
  const frame = blueprintPlateFrame(blueprint, loops);
  const notMeasured: NotMeasured[] = [];

  const programIdOfZone = zoneProgramIds(blueprint, loops);
  const topology = measureTopology(blueprint, building, programIdOfZone);

  if (frame === null) {
    // No boundary encloses anything, so there is no transform and no plate to
    // compare. Topology still measured — it never needed the geometry.
    notMeasured.push({
      subject: "boundary",
      id: blueprint.id,
      reason:
        "The blueprint has no boundary that encloses an area, so there is no plate and no blueprint→engine transform to measure against.",
    });
    return {
      blueprintId: blueprint.id,
      measuredFloorNos: [],
      boundary: EMPTY_BOUNDARY,
      voids: [],
      cores: [],
      anchors: [],
      zones: [],
      topology,
      notMeasured,
    };
  }

  const transform: EngineTransform = {
    shiftXMm: frame.shiftXMm,
    shiftZMm: frame.shiftZMm,
  };

  /* --- boundary --- */

  const levelByFloorNo = new Map<number, GeneratedLevel>();
  for (const level of building.levels) levelByFloorNo.set(level.floorNo, level);

  const plateFloorNos = new Set(frame.plates.map((plate) => plate.floorNo));
  const levels: LevelBoundaryFidelity[] = [];
  const blueprintOnlyFloorNos: number[] = [];

  for (const plate of frame.plates) {
    const level = levelByFloorNo.get(plate.floorNo);
    if (level === undefined) {
      blueprintOnlyFloorNos.push(plate.floorNo);
      notMeasured.push({
        subject: "boundary",
        id: `level:${plate.floorNo}`,
        reason: `The blueprint drew a plate on level ${plate.floorNo}, which the generated building has no level for.`,
      });
      continue;
    }

    const blueprintPolygon = mmPolygonToMetres(plate.polygonMm);
    const blueprintAreaSqm = polygonArea(blueprintPolygon);
    if (blueprintAreaSqm <= AREA_EPS_SQM) {
      notMeasured.push({
        subject: "boundary",
        id: `level:${plate.floorNo}`,
        reason: `The blueprint plate on level ${plate.floorNo} encloses no area, so a deviation ratio would divide by zero.`,
      });
      continue;
    }

    const generatedAreaSqm = polygonArea(level.polygon);
    const xorAreaSqm = multiPolygonArea(polygonXor(blueprintPolygon, level.polygon));

    levels.push({
      floorNo: plate.floorNo,
      blueprintAreaSqm: round6(blueprintAreaSqm),
      generatedAreaSqm: round6(generatedAreaSqm),
      areaDeviationRatio: round6(
        Math.abs(generatedAreaSqm - blueprintAreaSqm) / blueprintAreaSqm,
      ),
      symmetricDifferenceRatio: round6(xorAreaSqm / blueprintAreaSqm),
    });
  }

  const generatedOnlyFloorNos = building.levels
    .map((level) => level.floorNo)
    .filter((floorNo) => !plateFloorNos.has(floorNo));

  const boundary: BoundaryFidelity = {
    levels,
    blueprintOnlyFloorNos,
    generatedOnlyFloorNos,
    meanAreaDeviationRatio: roundOrNull(mean(levels.map((l) => l.areaDeviationRatio))),
    worstAreaDeviationRatio: roundOrNull(worst(levels.map((l) => l.areaDeviationRatio))),
    meanSymmetricDifferenceRatio: roundOrNull(
      mean(levels.map((l) => l.symmetricDifferenceRatio)),
    ),
    worstSymmetricDifferenceRatio: roundOrNull(
      worst(levels.map((l) => l.symmetricDifferenceRatio)),
    ),
  };

  /* --- voids --- */

  const voids: VoidFidelity[] = [];
  for (const item of blueprint.voids) {
    const region = regionToEngineMetres(blueprint, item.region, loops, transform);
    if (region === null) {
      notMeasured.push({
        subject: "void",
        id: item.id,
        reason: `Void "${item.id}" names a region that does not resolve to a polygon.`,
      });
      continue;
    }
    const voidAreaSqm = polygonArea(region);
    if (voidAreaSqm <= AREA_EPS_SQM) {
      notMeasured.push({
        subject: "void",
        id: item.id,
        reason: `Void "${item.id}" encloses no area.`,
      });
      continue;
    }

    for (const floorNo of [...new Set(item.floorNos)].sort((a, b) => a - b)) {
      const level = levelByFloorNo.get(floorNo);
      if (level === undefined) {
        notMeasured.push({
          subject: "void",
          id: item.id,
          reason: `Void "${item.id}" spans level ${floorNo}, which the generated building has no level for.`,
        });
        continue;
      }
      // A void that survived is a HOLE in the plate, so the plate's polygon —
      // holes respected — barely intersects it at all.
      const builtOverAreaSqm = multiPolygonArea(
        polygonIntersection(region, level.polygon),
      );
      voids.push({
        voidId: item.id,
        kind: item.kind.value,
        floorNo,
        voidAreaSqm: round6(voidAreaSqm),
        builtOverAreaSqm: round6(builtOverAreaSqm),
        retainedRatio: round6(clamp01(1 - builtOverAreaSqm / voidAreaSqm)),
      });
    }
  }

  /* --- cores --- */

  const generatedCoreCentre = rectCentreOf(building.core.rect);
  const cores: CoreFidelity[] = [];
  blueprint.cores.forEach((item, index) => {
    const region = regionToEngineMetres(blueprint, item.region, loops, transform);
    const centre = region === null ? null : polygonCentroid(region);
    if (centre === null) {
      notMeasured.push({
        subject: "core",
        id: item.id,
        reason: `Core "${item.id}" names a region with no resolvable centroid.`,
      });
      return;
    }
    cores.push({
      coreId: item.id,
      hold: item.hold,
      compiled: index === 0,
      blueprintCentreM: [round6(centre[0]), round6(centre[1])],
      generatedCentreM: [round6(generatedCoreCentre[0]), round6(generatedCoreCentre[1])],
      displacementM: round6(distance(centre, generatedCoreCentre)),
    });
  });

  /* --- anchors --- */

  const exteriorWallIds = new Set(
    building.walls.filter((wall) => wall.role === "exterior").map((wall) => wall.id),
  );
  const exteriorDoorPositions: Vec2[] = building.openings
    .filter(
      (opening) => opening.kind === "door" && exteriorWallIds.has(opening.hostWallId),
    )
    .map((opening) => opening.position);

  const anchors: AnchorFidelity[] = blueprint.anchors.map((anchor): AnchorFidelity => {
    const kind = anchor.kind.value;
    const head = { anchorId: anchor.id, kind, hold: anchor.hold };
    const position = pointToEngineMetres(
      anchor.positionMm.xMm,
      anchor.positionMm.zMm,
      transform,
    );

    if (kind === "core") {
      return {
        ...head,
        measured: true,
        comparedWith: "core-centre",
        blueprintPositionM: [round6(position[0]), round6(position[1])],
        generatedPositionM: [
          round6(generatedCoreCentre[0]),
          round6(generatedCoreCentre[1]),
        ],
        displacementM: round6(distance(position, generatedCoreCentre)),
      };
    }

    if (kind === "entrance") {
      if (exteriorDoorPositions.length === 0) {
        return {
          ...head,
          measured: false,
          reason:
            "The building generated no door on an exterior wall, so there is no entrance to measure this anchor against.",
        };
      }
      let nearest = exteriorDoorPositions[0];
      let nearestDistance = distance(position, nearest);
      for (const candidate of exteriorDoorPositions) {
        const d = distance(position, candidate);
        if (d < nearestDistance) {
          nearestDistance = d;
          nearest = candidate;
        }
      }
      return {
        ...head,
        measured: true,
        comparedWith: "exterior-door",
        blueprintPositionM: [round6(position[0]), round6(position[1])],
        generatedPositionM: [round6(nearest[0]), round6(nearest[1])],
        displacementM: round6(nearestDistance),
      };
    }

    return {
      ...head,
      measured: false,
      reason: `A "${kind}" anchor has no comparable feature in the generated model; only core and entrance anchors do.`,
    };
  });

  /* --- zones --- */

  const spacesByProgramId = new Map<string, PlacedSpace[]>();
  for (const space of building.spaces) {
    if (space.programId === "") continue;
    const bucket = spacesByProgramId.get(space.programId);
    if (bucket === undefined) spacesByProgramId.set(space.programId, [space]);
    else bucket.push(space);
  }

  const zones: ZoneFidelity[] = [];
  for (const zone of blueprint.zones) {
    const programId = programIdOfZone.get(zone.id);
    if (programId === undefined) {
      notMeasured.push({
        subject: "zone",
        id: zone.id,
        reason: `Zone "${zone.id}" never became a program item, so no generated space carries its id.`,
      });
      continue;
    }
    const region = regionToEngineMetres(blueprint, zone.region, loops, transform);
    if (region === null) {
      notMeasured.push({
        subject: "zone",
        id: zone.id,
        reason: `Zone "${zone.id}" names a region that does not resolve to a polygon.`,
      });
      continue;
    }
    const zoneAreaSqm = polygonArea(region);
    if (zoneAreaSqm <= AREA_EPS_SQM) {
      notMeasured.push({
        subject: "zone",
        id: zone.id,
        reason: `Zone "${zone.id}" encloses no area.`,
      });
      continue;
    }

    const floorNos = [...new Set(zone.floorNos)].sort((a, b) => a - b);
    const onFloors = floorNos.map((floorNo) => ({
      floorNo,
      spaces: (spacesByProgramId.get(programId) ?? []).filter(
        (space) => space.floorNo === floorNo,
      ),
    }));

    const floors: ZoneFloorFidelity[] = onFloors.map(({ floorNo, spaces }) => ({
      floorNo,
      placedSpaceCount: spaces.length,
      overlapRatio: round6(
        clamp01(
          intersectionAreaWith(region, unionAll(spaces.map((s) => rectToPolygon(s.rect)))) /
            zoneAreaSqm,
        ),
      ),
    }));

    const allRects = onFloors.flatMap(({ spaces }) =>
      spaces.map((space) => rectToPolygon(space.rect)),
    );

    zones.push({
      zoneId: zone.id,
      programId,
      program: zone.program.value,
      zoneAreaSqm: round6(zoneAreaSqm),
      overlapRatio: round6(
        clamp01(intersectionAreaWith(region, unionAll(allRects)) / zoneAreaSqm),
      ),
      floors,
      placedSpaceCount: allRects.length,
    });
  }

  return {
    blueprintId: blueprint.id,
    measuredFloorNos: levels.map((level) => level.floorNo),
    boundary,
    voids,
    cores,
    anchors,
    zones,
    topology,
    notMeasured,
  };
}
