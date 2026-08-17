// src/lib/generative/blueprint/compile.ts
//
// BlueprintSpec → BuildingSpec. The step that turns design authority into
// something the deterministic engine can build:
//
//   schematic input → BlueprintSpec → [HERE] → BuildingSpec → BIMGraph → geometry
//
// The blueprint says WHERE the outline runs and WHAT is fixed; it says almost
// nothing about storey heights, structural sections, facades or program areas.
// So this module PRESERVES every piece of geometry it is given and INFERS the
// rest from `spec/defaults.ts`, marking which is which in `Provenanced` values
// and in `spec.assumptions`. It never silently replaces drawn geometry with a
// parametric approximation — that is the whole point of the ingestion path.
//
// UNITS
// -----
// MILLIMETRES throughout, integers, XZ plane — the blueprint's units and
// BuildingSpec's units are the same, so this module performs NO unit
// conversion. `geom/` is documented in metres, but every function in it is pure
// arithmetic that takes its tolerance as an argument; calling it in mm-space is
// the same geometry with a mm-space tolerance, and that is what happens here.
// Tessellation therefore runs in mm at `TESSELLATION_TOLERANCE_MM`, and the
// only division by 1000 anywhere below is mm² → m² for program areas (areas are
// m² in BuildingSpec by contract).
//
// ORIGIN
// ------
// A blueprint may be drawn anywhere in its own coordinate space; the engine's
// frame has its origin at the footprint centre (`generate/massing.ts`). One
// translation — the centre of the largest plate's bounding box — is applied to
// EVERY piece of geometry this module emits (plates, core offsets, grid
// origins), so the blueprint's internal relationships survive exactly while the
// result lands where the engine expects it.
//
// DETERMINISM
// -----------
// Pure function of (blueprint, options). No `Math.random`, no `Date.now`; the
// seed is carried into the spec for the stages that do use an RNG.

import {
  arc,
  bezier,
  ensurePolygonWinding,
  largestInscribedAxisAlignedRect,
  largestPolygon,
  line,
  makeFrame,
  minimumAreaObbOfRing,
  polygonArea,
  polygonDifference,
  polyline,
  rectToWorldRing,
  ringBounds,
  unionAll,
  curveLoopToRing,
  type PlanCurve,
  type Polygon,
  type Rect,
  type Ring,
  type Vec2,
} from "../geom";
import {
  beamDepthMm,
  coreFromPlate,
  columnSizeMm,
  DIMENSION_DEFAULTS,
  MIN_AREA_SQM,
  PREFERRED_ASPECT,
  recommendElevators,
  recommendStairs,
  slabThicknessMm,
  USE_PROFILES,
  type UseProfile,
} from "../spec/defaults";
import {
  BuildingSpecSchema,
  type BuildingSpec,
  type BuildingUse,
  type CustomPlate,
  type LocalGrid,
  type ProgramItem,
  type Provenanced,
  type SpaceType,
  type ValueSource,
} from "../spec/building-spec";
import type {
  BlueprintSpec,
  BoundaryLoop,
  CurveSegment,
  PointMm,
  Region,
} from "./blueprint-spec";
import { resolveFidelity } from "./fidelity";

/* ------------------------------------------------------------------ */
/* Options + result                                                    */
/* ------------------------------------------------------------------ */

export interface CompileDefaults {
  /** Overrides the use inferred from zone programs. */
  use?: BuildingUse;
  floorToFloorMm?: number;
  groundFloorToFloorMm?: number;
  gridMm?: number;
}

export interface CompileOptions {
  /** The user's words, if there were any. Becomes `designIntent.summary`. */
  prompt?: string;
  seed: number;
  defaults?: CompileDefaults;
}

export interface CompiledBlueprint {
  spec: BuildingSpec;
  /**
   * Lock tokens for everything the blueprint declared "exact", in the grammar
   * `session/locks.ts` parses (`system:<name>` / `level:<n>` / `element:<id>`).
   * Returned ALONGSIDE the spec rather than written into it: a lock is session
   * state, and a compiler that mutated the lock set would make "regenerate from
   * this blueprint" quietly destructive.
   */
  locks: string[];
}

/**
 * Chord tolerance for turning curved boundary segments into rings, in
 * millimetres. 50 mm is a twentieth of a typical drawn wall thickness — far
 * below anything a plan reader could have resolved, and coarse enough that a
 * traced arc does not explode into hundreds of vertices.
 */
export const TESSELLATION_TOLERANCE_MM = 50;

/** Endpoints closer than this are one point when a loop is chained. */
const JOIN_TOLERANCE_MM = 1;

/* ------------------------------------------------------------------ */
/* Curves → rings (millimetre space)                                   */
/* ------------------------------------------------------------------ */

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

function segmentToCurve(segment: CurveSegment): PlanCurve {
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

/** Counter-clockwise ring in millimetres, or null for a loop that encloses nothing. */
export function loopToRingMm(loop: BoundaryLoop): Ring | null {
  return curveLoopToRing(loop.segments.map(segmentToCurve), TESSELLATION_TOLERANCE_MM, {
    ccw: true,
    joinToleranceM: JOIN_TOLERANCE_MM,
  });
}

function regionToPolygonMm(
  region: Region,
  loops: Map<string, BoundaryLoop>,
): Polygon | null {
  switch (region.kind) {
    case "loop": {
      const ring = loopToRingMm(region.loop);
      return ring === null ? null : [ring];
    }
    case "loopRef": {
      const loop = loops.get(region.loopId);
      if (loop === undefined) return null;
      const ring = loopToRingMm(loop);
      return ring === null ? null : [ring];
    }
    case "rect": {
      const frame = makeFrame(
        region.originMm.xMm,
        region.originMm.zMm,
        region.rotationRad,
      );
      const half: Rect = {
        minX: -region.widthMm / 2,
        maxX: region.widthMm / 2,
        minZ: -region.depthMm / 2,
        maxZ: region.depthMm / 2,
      };
      return [rectToWorldRing(frame, half)];
    }
  }
}

/** Every loop the blueprint can name, boundaries and inline region loops alike. */
function loopIndex(blueprint: BlueprintSpec): Map<string, BoundaryLoop> {
  const map = new Map<string, BoundaryLoop>();
  const add = (loop: BoundaryLoop) => {
    if (!map.has(loop.id)) map.set(loop.id, loop);
  };
  for (const boundary of blueprint.boundaries) add(boundary.loop);
  for (const item of [...blueprint.voids, ...blueprint.cores, ...blueprint.zones]) {
    if (item.region.kind === "loop") add(item.region.loop);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Plates                                                              */
/* ------------------------------------------------------------------ */

interface PlateMm {
  floorNo: number;
  polygon: Polygon;
  areaMm2: number;
}

/**
 * One plate per level named by a boundary.
 *
 * Two boundaries on the same level are UNIONED, which is how a two-wing plan
 * arrives: each wing is its own traced loop, and the union preserves both sets
 * of edge directions instead of collapsing them into a bounding box. Voids
 * whose level span includes the level are then subtracted, which is what turns
 * a courtyard into a real hole rather than a decorative annotation.
 *
 * LIMITATION: a boolean that yields several disjoint pieces keeps only the
 * largest. `LevelPlate.polygon` is one `[outer, ...holes]` polygon by contract,
 * so a plan whose wings do not touch loses the smaller wing here rather than
 * further downstream where the loss would be harder to see.
 */
function platesFor(blueprint: BlueprintSpec, loops: Map<string, BoundaryLoop>): PlateMm[] {
  const floorNos = [
    ...new Set(blueprint.boundaries.flatMap((boundary) => boundary.floorNos)),
  ].sort((a, b) => a - b);

  const plates: PlateMm[] = [];
  for (const floorNo of floorNos) {
    const parts: Polygon[] = [];
    for (const boundary of blueprint.boundaries) {
      if (!boundary.floorNos.includes(floorNo)) continue;
      const ring = loopToRingMm(boundary.loop);
      if (ring !== null) parts.push([ring]);
    }
    if (parts.length === 0) continue;

    let polygon = parts.length === 1 ? ensurePolygonWinding(parts[0]) : largestPolygon(unionAll(parts));
    if (polygon === null) continue;

    for (const item of blueprint.voids) {
      if (!item.floorNos.includes(floorNo)) continue;
      const hole = regionToPolygonMm(item.region, loops);
      if (hole === null) continue;
      const cut = largestPolygon(polygonDifference(polygon, hole));
      // A void that swallowed the plate is a blueprint error, not an
      // instruction to delete the level; keep the uncut plate and let
      // `validateBlueprint` report VOID_OUTSIDE_BOUNDARY.
      if (cut !== null) polygon = cut;
    }

    plates.push({ floorNo, polygon, areaMm2: polygonArea(polygon) });
  }

  return plates;
}

const translatePolygon = (polygon: Polygon, dx: number, dz: number): Polygon =>
  polygon.map((ring) =>
    ring.map(([x, z]): Vec2 => [Math.round(x + dx), Math.round(z + dz)]),
  );

/** `[outer, ...holes]` as the integer-mm tuples `CustomPlateSchema` accepts. */
const toPolygonMm = (polygon: Polygon): [number, number][][] =>
  polygon.map((ring) => ring.map(([x, z]): [number, number] => [x, z]));

/* ------------------------------------------------------------------ */
/* The blueprint → engine transform, in one place                      */
/* ------------------------------------------------------------------ */

export interface BlueprintPlateFrame {
  /**
   * One plate per level a boundary names, ALREADY IN THE ENGINE'S FRAME:
   * integer millimetres, `[outer, ...holes]`, voids subtracted, translated so
   * the largest plate's bounding box is centred on the origin.
   */
  plates: Array<{ floorNo: number; polygonMm: Polygon }>;
  /**
   * The translation that was applied, millimetres. Any OTHER piece of blueprint
   * geometry — a core region, a zone, an anchor point — becomes engine geometry
   * by adding this and then dividing by 1000. Exposed rather than hidden so a
   * caller that measures the result against the blueprint uses the SAME
   * transform the compiler used, instead of re-deriving one that nearly matches.
   */
  shiftXMm: number;
  shiftZMm: number;
}

/**
 * Blueprint drawing coordinates → the engine's frame.
 *
 * `compileBlueprintToSpec` is the only consumer that matters, but it is not the
 * only one: measuring what the engine built against what the blueprint asked
 * for (`metrics.ts`) needs the identical plates and the identical shift, and a
 * second implementation of "the centre of the largest plate's bounding box"
 * would drift from this one the first time either changed. So the transform
 * lives here once and both callers read it.
 *
 * Returns null — rather than throwing or inventing a footprint — when no
 * boundary encloses anything, because "there is nothing to build" is a fact the
 * caller has to phrase for itself.
 */
export function blueprintPlateFrame(
  blueprint: BlueprintSpec,
  loops: Map<string, BoundaryLoop> = loopIndex(blueprint),
): BlueprintPlateFrame | null {
  const rawPlates = platesFor(blueprint, loops);
  if (rawPlates.length === 0) return null;

  const primaryRaw = rawPlates.reduce((a, b) => (b.areaMm2 > a.areaMm2 ? b : a));
  const primaryBounds = ringBounds(primaryRaw.polygon[0]);
  const shiftXMm =
    primaryBounds === null ? 0 : -(primaryBounds.minX + primaryBounds.maxX) / 2;
  const shiftZMm =
    primaryBounds === null ? 0 : -(primaryBounds.minZ + primaryBounds.maxZ) / 2;

  return {
    plates: rawPlates.map((plate) => ({
      floorNo: plate.floorNo,
      polygonMm: translatePolygon(plate.polygon, shiftXMm, shiftZMm),
    })),
    shiftXMm,
    shiftZMm,
  };
}

/** The loop table a blueprint's regions resolve against, built once per caller. */
export function blueprintLoopIndex(blueprint: BlueprintSpec): Map<string, BoundaryLoop> {
  return loopIndex(blueprint);
}

/**
 * A region as a millimetre polygon in the blueprint's OWN coordinates — the
 * same reading the compiler takes of a void, a core or a zone. Add
 * `BlueprintPlateFrame.shift*Mm` to put it in the engine's frame.
 */
export function blueprintRegionToPolygonMm(
  blueprint: BlueprintSpec,
  region: Region,
  loops: Map<string, BoundaryLoop> = loopIndex(blueprint),
): Polygon | null {
  return regionToPolygonMm(region, loops);
}

/**
 * The `ProgramItem` id a blueprint zone compiles to: the zone id truncated to
 * 48 chars, suffixed on collision. Exported because `metrics.ts` must REPLAY
 * this derivation to find a zone's placed spaces — a second copy of the rule
 * would let the metric drift from the compiler and quietly measure nothing.
 *
 * The suffix carries its own attempt counter. Deriving it from `usedIds.size`
 * — the previous form — had a reachable fixed point: the size never changes
 * inside the loop, so three schema-valid ids sharing a 48-char prefix could
 * recompute the same taken candidate forever and pin the server on
 * attacker-choosable JSON. A counter makes every retry a NEW string, so the
 * loop is bounded by the number of ids already taken. Worst case stays within
 * the 48-char cap: 44 + "-" + 3 digits (zones are capped at 128 by schema).
 *
 * MUTATES `usedIds` by adding the returned id — claiming and deriving are one
 * step on purpose, so no caller can derive without claiming.
 */
export function deriveZoneSpecId(rawId: string, usedIds: Set<string>): string {
  let id = rawId.slice(0, 48);
  for (let attempt = 2; usedIds.has(id); attempt += 1) {
    id = `${rawId.slice(0, 44)}-${attempt}`;
  }
  usedIds.add(id);
  return id;
}

/* ------------------------------------------------------------------ */
/* Use + program                                                       */
/* ------------------------------------------------------------------ */

/**
 * Which occupancy a programmed space implies. Shared spaces (lobby, corridor,
 * restroom, plant) map to nothing on purpose — every use has them, so they
 * carry no evidence about what the building IS.
 */
const USE_OF_SPACE: Partial<Record<SpaceType, BuildingUse>> = {
  "office-open": "office",
  "office-cellular": "office",
  meeting: "office",
  reception: "office",
  laboratory: "research",
  classroom: "education",
  retail: "retail",
  "residential-unit": "residential",
};

function inferUse(
  zones: Array<{ type: SpaceType; areaSqm: number }>,
): BuildingUse | null {
  const byUse = new Map<BuildingUse, number>();
  for (const zone of zones) {
    const use = USE_OF_SPACE[zone.type];
    if (use === undefined) continue;
    byUse.set(use, (byUse.get(use) ?? 0) + zone.areaSqm);
  }
  let best: BuildingUse | null = null;
  let bestArea = 0;
  // Declaration order breaks ties, so the answer never depends on Map ordering
  // of equal areas.
  for (const [use, area] of byUse) {
    if (area > bestArea) {
      bestArea = area;
      best = use;
    }
  }
  return best;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const roundClamp = (value: number, min: number, max: number): number =>
  Math.round(clamp(value, min, max));

/* ------------------------------------------------------------------ */
/* Compile                                                             */
/* ------------------------------------------------------------------ */

export function compileBlueprintToSpec(
  blueprint: BlueprintSpec,
  options: CompileOptions,
): CompiledBlueprint {
  const loops = loopIndex(blueprint);

  /* --- origin: everything moves with the largest plate's centre --- */
  const frame = blueprintPlateFrame(blueprint, loops);
  if (frame === null) {
    throw new Error(
      "compileBlueprintToSpec: the blueprint has no usable boundary, so there is no footprint to build. Add a closed boundary loop first.",
    );
  }

  const { shiftXMm: shiftX, shiftZMm: shiftZ } = frame;
  const shiftPolygon = (polygon: Polygon) => translatePolygon(polygon, shiftX, shiftZ);

  const plates = frame.plates.map((plate) => ({
    floorNo: plate.floorNo,
    polygon: plate.polygonMm,
  }));
  const primary = plates.reduce(
    (a, b) => (polygonArea(b.polygon) > polygonArea(a.polygon) ? b : a),
  );
  const primaryArea = polygonArea(primary.polygon);
  const bounds = ringBounds(primary.polygon[0]) ?? { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  const widthMm = roundClamp(bounds.maxX - bounds.minX, 6_000, 400_000);
  const depthMm = roundClamp(bounds.maxZ - bounds.minZ, 6_000, 400_000);
  const plateAreaSqm = primaryArea / 1_000_000;

  /* --- customPlates: one entry per distinct outline --- */
  const byOutline = new Map<string, CustomPlate>();
  for (const plate of plates) {
    const key = JSON.stringify(plate.polygon);
    const existing = byOutline.get(key);
    if (existing) {
      existing.floorNos.push(plate.floorNo);
      continue;
    }
    byOutline.set(key, {
      floorNos: [plate.floorNo],
      polygonMm: toPolygonMm(plate.polygon),
    });
  }
  const customPlates = [...byOutline.values()];

  /* --- provenance stamps --- */
  const nativelyDrawn = blueprint.source === "native-editor";
  const geometrySource: ValueSource = nativelyDrawn ? "USER_PROVIDED" : "INFERRED";
  const geometryConfidence = nativelyDrawn
    ? 1
    : blueprint.coordinateSystem.calibrationConfidence;
  const geometryReason = nativelyDrawn
    ? "Drawn by the user in the schematic editor."
    : `Read from a ${blueprint.source} schematic, scale by ${blueprint.coordinateSystem.method}.`;

  const geometry = <T,>(value: T): Provenanced<T> => ({
    value,
    source: geometrySource,
    confidence: geometryConfidence,
    reason: geometryReason,
  });
  const P = <T,>(
    value: T,
    source: ValueSource,
    confidence: number,
    reason: string,
  ): Provenanced<T> => ({ value, source, confidence, reason });

  const assumptions: BuildingSpec["assumptions"] = [];
  const note = (
    id: string,
    label: string,
    statement: string,
    source: ValueSource,
    confidence: number,
  ) => {
    if (source === "USER_PROVIDED") return;
    assumptions.push({ id, label, statement, source, confidence });
  };

  /* --- zones → program, and the use they imply --- */
  interface ZoneFacts {
    id: string;
    type: SpaceType;
    label: string;
    levels: number[];
    areaSqm: number;
  }
  const zoneFacts: ZoneFacts[] = [];
  const usedIds = new Set<string>();
  for (const zone of blueprint.zones) {
    const polygon = regionToPolygonMm(zone.region, loops);
    if (polygon === null) continue;
    const levels = [...new Set(zone.floorNos)].sort((a, b) => a - b);
    if (levels.length === 0) continue;
    const id = deriveZoneSpecId(zone.id, usedIds);
    zoneFacts.push({
      id,
      type: zone.program.value,
      label: (zone.label ?? zone.id).slice(0, 60),
      levels,
      // The region is one level's footprint, so its area is already the
      // per-level target `ProgramItemSchema` asks for. Multiplying by the level
      // count here would double-count it against every level it lands on.
      areaSqm: polygonArea(polygon) / 1_000_000,
    });
  }

  const inferredUse = inferUse(zoneFacts);
  const use: BuildingUse = options.defaults?.use ?? inferredUse ?? "office";
  const useSource: ValueSource = options.defaults?.use
    ? "USER_PROVIDED"
    : inferredUse
      ? "INFERRED"
      : "DEFAULT";
  note(
    "use",
    "Building use",
    inferredUse
      ? `${use} occupancy inferred from the blueprint's zone programs.`
      : `No programmed zone implied an occupancy; generic ${use} assumed.`,
    useSource,
    inferredUse ? 0.7 : 0.5,
  );
  const profile: UseProfile = USE_PROFILES[use];

  /* --- levels --- */
  const floorNos = plates.map((plate) => plate.floorNo).sort((a, b) => a - b);
  const aboveGrade = floorNos.filter((n) => n > 0);
  const f2f = options.defaults?.floorToFloorMm ?? profile.floorToFloorMm;
  const groundF2f = options.defaults?.groundFloorToFloorMm ?? profile.groundFloorToFloorMm;
  const lowestAbove = aboveGrade.length > 0 ? aboveGrade[0] : null;

  const levels: BuildingSpec["levels"] = floorNos.map((floorNo) => {
    const isGround = floorNo === lowestAbove;
    if (floorNo < 0) {
      return {
        floorNo,
        name: `B${-floorNo}`,
        floorToFloorMm: roundClamp(Math.max(2_800, f2f - 300), 2_200, 12_000),
        usage: "parking" as const,
      };
    }
    return {
      floorNo,
      name: `L${String(floorNo).padStart(2, "0")}`,
      floorToFloorMm: roundClamp(isGround ? Math.max(f2f, groundF2f) : f2f, 2_200, 12_000),
      usage: isGround ? ("lobby" as const) : ("occupied" as const),
    };
  });
  note(
    "levels",
    "Storey heights",
    `${levels.length} level(s) taken from the blueprint's boundary coverage; heights from the ${use} profile (${f2f} mm typical, ${groundF2f} mm at grade).`,
    options.defaults?.floorToFloorMm ? "USER_PROVIDED" : "DEFAULT",
    0.8,
  );

  /* --- grids --- */
  const firstGrid = blueprint.gridSystems[0];
  const gridXMm = options.defaults?.gridMm
    ? roundClamp(options.defaults.gridMm, 3_000, 20_000)
    : firstGrid
      ? roundClamp(firstGrid.xSpacingsMm[0], 3_000, 20_000)
      : profile.gridMm;
  const gridZMm = options.defaults?.gridMm
    ? roundClamp(options.defaults.gridMm, 3_000, 20_000)
    : firstGrid
      ? roundClamp(firstGrid.zSpacingsMm[0], 3_000, 20_000)
      : profile.gridMm;
  note(
    "grid",
    "Structural grid",
    firstGrid
      ? `Primary bays read from grid "${firstGrid.id}" (${gridXMm} × ${gridZMm} mm).`
      : `No grid was drawn; the ${use} default of ${gridXMm} mm bays is used.`,
    firstGrid ? "USER_PROVIDED" : "DEFAULT",
    firstGrid ? 1 : 0.7,
  );

  const localGrids: LocalGrid[] = blueprint.gridSystems.map((grid) => {
    const regionLoop = grid.regionLoopId === undefined ? undefined : loops.get(grid.regionLoopId);
    const regionRing = regionLoop ? loopToRingMm(regionLoop) : null;
    return {
      id: grid.id.slice(0, 48),
      ...(regionRing ? { regionPolygonMm: toPolygonMm(shiftPolygon([regionRing])) } : {}),
      originMm: {
        x: Math.round(grid.originMm.xMm + shiftX),
        z: Math.round(grid.originMm.zMm + shiftZ),
      },
      rotationRad: grid.rotationRad,
      xSpacingsMm: grid.xSpacingsMm.map((s) => roundClamp(s, 600, 200_000)),
      zSpacingsMm: grid.zSpacingsMm.map((s) => roundClamp(s, 600, 200_000)),
    };
  });

  /* --- core --- */
  const coreIntent = blueprint.cores[0];
  const corePolygon = coreIntent ? regionToPolygonMm(coreIntent.region, loops) : null;
  const coreRect = corePolygon === null ? null : coreRectFor(shiftPolygon(corePolygon));
  const fallbackCore = coreFromPlate({
    plateWidthMm: widthMm,
    plateDepthMm: depthMm,
    profile,
  });
  const coreWidthMm = roundClamp(
    coreRect ? coreRect.widthMm : fallbackCore.widthMm,
    3_000,
    60_000,
  );
  const coreDepthMm = roundClamp(
    coreRect ? coreRect.depthMm : fallbackCore.depthMm,
    3_000,
    60_000,
  );
  note(
    "core",
    "Core",
    coreRect
      ? `Core sized and sited from the blueprint core "${coreIntent!.id}"; its rotation is dropped because the spec's core is axis-aligned.`
      : `No core was drawn; a ${coreWidthMm} × ${coreDepthMm} mm central core sized from the ${use} core ratio is assumed.`,
    coreRect ? geometrySource : "DERIVED",
    coreRect ? geometryConfidence : 0.6,
  );

  /* --- program --- */
  const program: ProgramItem[] = [];
  for (const zone of zoneFacts.slice(0, 56)) {
    const target = clamp(Number(zone.areaSqm.toFixed(1)), 1, 20_000);
    program.push({
      id: zone.id,
      type: zone.type,
      label: zone.label,
      levels: zone.levels,
      targetAreaSqmPerLevel: target,
      countPerLevel: 1,
      minAreaSqm: clamp(Math.min(MIN_AREA_SQM[zone.type], target), 1, 20_000),
      preferredAspectRatio: PREFERRED_ASPECT[zone.type],
      adjacency:
        zone.type === "corridor" || zone.type === "circulation"
          ? [{ kind: "REQUIRES_CORE" as const }]
          : [{ kind: "REQUIRES_CORRIDOR" as const }],
      priority: "P1",
    });
  }

  // The heuristic provider always emits circulation, and the solver needs
  // something to hang rooms off; restrooms are P0 in every template. A
  // blueprint that drew neither still has to produce a habitable building.
  const occupiedLevels = levels.filter((l) => l.floorNo > 0).map((l) => l.floorNo);
  const programLevels = occupiedLevels.length > 0 ? occupiedLevels : [levels[0].floorNo];
  const programmable = Math.max(1, plateAreaSqm - (coreWidthMm / 1_000) * (coreDepthMm / 1_000));

  if (!program.some((item) => item.type === "corridor" || item.type === "circulation")) {
    program.push({
      id: "circulation",
      type: "corridor",
      label: "Corridor",
      levels: programLevels,
      targetAreaSqmPerLevel: clamp(
        Number((programmable * profile.circulationRatio).toFixed(1)),
        1,
        20_000,
      ),
      countPerLevel: 1,
      minAreaSqm: MIN_AREA_SQM.corridor,
      preferredAspectRatio: PREFERRED_ASPECT.corridor,
      adjacency: [{ kind: "REQUIRES_CORE" }],
      priority: "P0",
    });
    note(
      "circulation",
      "Circulation",
      "The blueprint drew no circulation zone; a corridor sized from the use profile was added so every room can be reached.",
      "INFERRED",
      0.6,
    );
  }

  if (!program.some((item) => item.type === "restroom")) {
    program.push({
      id: "restroom",
      type: "restroom",
      label: "Restrooms",
      levels: programLevels,
      targetAreaSqmPerLevel: clamp(
        Number(Math.max(MIN_AREA_SQM.restroom * 2, programmable * 0.06).toFixed(1)),
        1,
        20_000,
      ),
      countPerLevel: 2,
      minAreaSqm: MIN_AREA_SQM.restroom,
      preferredAspectRatio: PREFERRED_ASPECT.restroom,
      adjacency: [{ kind: "REQUIRES_CORE" }],
      priority: "P0",
    });
    note(
      "restroom",
      "Restrooms",
      "The blueprint drew no restroom zone; two per occupied level were added against the core.",
      "INFERRED",
      0.6,
    );
  }

  /* --- the rest, from the standards library --- */
  const grossAreaSqm = plateAreaSqm * Math.max(1, levels.length);
  const elevators = recommendElevators(grossAreaSqm, Math.max(1, aboveGrade.length));
  const stairs = recommendStairs(grossAreaSqm, Math.max(1, aboveGrade.length));
  const headHeightMm = roundClamp(
    Math.min(DIMENSION_DEFAULTS.headHeightMm, f2f - 400),
    1_200,
    6_000,
  );
  const sides = (["north", "south", "east", "west"] as const).map((side) => ({
    side,
    system: "punched-window" as const,
    glazingRatio: Number(profile.defaultGlazingRatio.toFixed(2)),
    moduleMm: DIMENSION_DEFAULTS.facadeModuleMm,
    windowWidthMm: 1_200,
    sillHeightMm: DIMENSION_DEFAULTS.sillHeightMm,
    headHeightMm,
  }));
  note(
    "facade",
    "Facade system",
    `Punched windows at ${Math.round(profile.defaultGlazingRatio * 100)}% glazing assumed; the blueprint carries facade intent per edge, which the spec's four-side facade cannot yet express.`,
    "DEFAULT",
    0.5,
  );

  /* --- entrance: the drawn entrance anchor decides the front door --- */
  //
  // A blueprint may carry several entrance anchors; `OrientationSchema` carries
  // exactly one primary entrance, so ONE anchor has to win. A hard hold is a
  // decision and a soft hold is a preference (`blueprint-spec.ts` HoldSchema),
  // so the first HARD entrance anchor wins even if a soft one was drawn first,
  // and blueprint order breaks the remaining ties — never plate proximity,
  // which would make the answer wobble as the footprint is edited. Any further
  // entrance anchors stay in the blueprint untouched and are reported below;
  // multi-entrance buildings are not modelled by the spec yet, and silently
  // dropping the extras would hide that.
  //
  // `primaryEntranceFacade` is a bare enum rather than a `Provenanced` value,
  // so provenance rides on `assumptions` exactly as the core's does: nothing is
  // filed when the user drew the anchor themselves, a traced blueprint files it
  // as INFERRED at the tracing's own confidence, and the "south" fallback is
  // filed as DEFAULT so the Assumptions panel can offer to change it.
  const entranceAnchors = blueprint.anchors.filter(
    (anchor) => anchor.kind.value === "entrance",
  );
  const entranceAnchor =
    entranceAnchors.find((anchor) => anchor.hold.mode === "hard") ?? entranceAnchors[0];
  const entranceFacade: CompassFacade =
    entranceAnchor === undefined
      ? "south"
      : facadeNearestPoint(entranceAnchor.positionMm, shiftX, shiftZ, bounds);
  note(
    "entrance",
    "Primary entrance",
    entranceAnchor
      ? `The ${entranceFacade} elevation carries the entrance, from the drawn anchor "${entranceAnchor.id}".`
      : "No entrance anchor was drawn; the south elevation is assumed to carry the entrance.",
    entranceAnchor ? geometrySource : "DEFAULT",
    entranceAnchor ? geometryConfidence : 0.5,
  );
  if (entranceAnchors.length > 1) {
    note(
      "entrance-secondary",
      "Secondary entrances",
      `${entranceAnchors.length - 1} further entrance anchor(s) were drawn. The spec carries one primary entrance, so they are preserved in the blueprint but do not yet shape geometry.`,
      "INFERRED",
      0.5,
    );
  }

  const description =
    `${levels.length}-level ${use} building compiled from the blueprint "${blueprint.name}". ` +
    `The footprint follows ${customPlates.length} drawn plate outline(s) on a ` +
    `${Math.round(widthMm / 1000)} × ${Math.round(depthMm / 1000)} m envelope.`;

  const spec: BuildingSpec = {
    schemaVersion: 1,
    units: "mm",
    generationSeed: options.seed,
    project: {
      name: blueprint.name.slice(0, 120),
      use,
      description: description.slice(0, 600),
    },
    designIntent: {
      summary: (
        options.prompt ?? `Build the schematic "${blueprint.name}" as drawn.`
      ).slice(0, 600),
      priorities: [
        { goal: "maximize_usable_area", weight: 0.7 },
        { goal: "structural_regularity", weight: 0.6 },
      ],
    },
    orientation: {
      northAngleDeg: P(
        0,
        "DEFAULT",
        0.5,
        "The blueprint carries no north point; its own frame is used unrotated.",
      ),
      primaryEntranceFacade: entranceFacade,
    },
    site: {
      widthMm: P(
        roundClamp(widthMm * 1.6, 5_000, 1_000_000),
        "DERIVED",
        0.5,
        "Site sized to give the drawn footprint a reasonable setback.",
      ),
      depthMm: P(
        roundClamp(depthMm * 1.6, 5_000, 1_000_000),
        "DERIVED",
        0.5,
        "Site sized to give the drawn footprint a reasonable setback.",
      ),
    },
    massing: {
      strategy: geometry("custom" as const),
      widthMm: P(
        widthMm,
        "DERIVED",
        geometryConfidence,
        "Bounding box of the largest drawn plate.",
      ),
      depthMm: P(
        depthMm,
        "DERIVED",
        geometryConfidence,
        "Bounding box of the largest drawn plate.",
      ),
      parameters: {},
      customPlates: geometry(customPlates),
    },
    levels,
    structure: {
      system: P(
        profile.structuralSystem,
        "DEFAULT",
        0.7,
        `${profile.structuralSystem} suits this use and span.`,
      ),
      gridXMm: P(
        gridXMm,
        firstGrid ? geometrySource : "DEFAULT",
        firstGrid ? geometryConfidence : 0.7,
        firstGrid ? `First bay of grid "${firstGrid.id}".` : "Use-profile bay size.",
      ),
      gridZMm: P(
        gridZMm,
        firstGrid ? geometrySource : "DEFAULT",
        firstGrid ? geometryConfidence : 0.7,
        firstGrid ? `First bay of grid "${firstGrid.id}".` : "Use-profile bay size.",
      ),
      columnMm: P(
        columnSizeMm(gridXMm, Math.max(1, aboveGrade.length)),
        "DERIVED",
        0.7,
        "Column section scaled to span and floors above.",
      ),
      slabThicknessMm: P(
        slabThicknessMm(gridXMm),
        "DERIVED",
        0.75,
        "Slab depth from the governing span.",
      ),
      beamDepthMm: P(
        beamDepthMm(gridXMm),
        "DERIVED",
        0.7,
        "Beam depth approximated as span/12.",
      ),
      ...(localGrids.length > 0 ? { localGrids: geometry(localGrids) } : {}),
    },
    core: {
      strategy: P(
        coreRect ? ("offset" as const) : ("central" as const),
        coreRect ? geometrySource : "DEFAULT",
        coreRect ? geometryConfidence : 0.6,
        coreRect
          ? "Core position comes from the blueprint, so it is not assumed central."
          : "No core was drawn; a central core keeps the perimeter free.",
      ),
      widthMm: P(
        coreWidthMm,
        coreRect ? geometrySource : "DERIVED",
        coreRect ? geometryConfidence : 0.7,
        coreRect ? "Measured off the drawn core." : "Sized from the per-use core ratio.",
      ),
      depthMm: P(
        coreDepthMm,
        coreRect ? geometrySource : "DERIVED",
        coreRect ? geometryConfidence : 0.7,
        coreRect ? "Measured off the drawn core." : "Sized from the per-use core ratio.",
      ),
      offsetXMm: coreRect ? roundClamp(coreRect.centreXMm, -200_000, 200_000) : 0,
      offsetZMm: coreRect ? roundClamp(coreRect.centreZMm, -200_000, 200_000) : 0,
      elevators: P(elevators, "DERIVED", 0.7, "One car per ~5,000 m² served."),
      stairs: P(stairs, "DERIVED", 0.8, "Two egress stairs for a multi-storey building."),
      shafts: ["mechanical", "electrical", "plumbing"],
    },
    program,
    facade: { sides, spandrelMm: DIMENSION_DEFAULTS.spandrelMm },
    roof: {
      type: P("flat" as const, "DEFAULT", 0.8, "Flat roof is the economical default."),
      parapetMm: DIMENSION_DEFAULTS.parapetMm,
      pitchDeg: 0,
    },
    dimensions: {
      exteriorWallMm: P(
        DIMENSION_DEFAULTS.exteriorWallMm,
        "DEFAULT",
        0.85,
        "Standard insulated exterior wall.",
      ),
      interiorWallMm: P(
        DIMENSION_DEFAULTS.interiorWallMm,
        "DEFAULT",
        0.85,
        "Standard stud partition.",
      ),
      doorWidthMm: P(DIMENSION_DEFAULTS.doorWidthMm, "DEFAULT", 0.9, "Standard single leaf."),
      doorHeightMm: P(
        DIMENSION_DEFAULTS.doorHeightMm,
        "DEFAULT",
        0.9,
        "Standard door height.",
      ),
      corridorWidthMm: P(
        DIMENSION_DEFAULTS.corridorWidthMm,
        "DEFAULT",
        0.8,
        "Two-way circulation width.",
      ),
    },
    mep: {
      strategy: use === "residential" ? "distributed-vrf" : "central-ahu",
      mechanicalLevels: aboveGrade.length > 0 ? [aboveGrade[aboveGrade.length - 1]] : [],
      ceilingPlenumMm: DIMENSION_DEFAULTS.ceilingPlenumMm,
    },
    constraints: [
      {
        id: "circulation-budget",
        priority: "P2",
        statement: `Circulation should stay under ${Math.round(profile.circulationRatio * 100 + 4)}% of net area.`,
        rule: {
          kind: "max_circulation_ratio",
          numeric: Number((profile.circulationRatio + 0.04).toFixed(2)),
        },
      },
      {
        id: "core-continuous",
        priority: "P0",
        statement: "The vertical core must align across all levels.",
      },
    ],
    assumptions,
  };

  // Parse rather than cast: a compiled blueprint has to satisfy exactly the
  // contract the reasoning layer does, so schema drift breaks here first.
  return { spec: BuildingSpecSchema.parse(spec), locks: locksFor(blueprint) };
}

/* ------------------------------------------------------------------ */
/* Core rect                                                           */
/* ------------------------------------------------------------------ */

interface CoreRectMm {
  widthMm: number;
  depthMm: number;
  centreXMm: number;
  centreZMm: number;
}

/**
 * A rectangle for a drawn core region. The spec's core is axis-aligned by
 * construction (`CoreSchema` has extents and an offset, no rotation), so the
 * choice is which rectangle to report, not whether to rotate one:
 *
 *   • a region that IS essentially a rectangle (its area fills ≥90% of its
 *     minimum-area oriented box) reports that box's extents — right for a core
 *     drawn on a rotated wing, whose sides are the numbers the author meant.
 *   • anything more irregular reports the largest inscribed axis-aligned rect,
 *     because an oriented box around an L-shaped core would claim floor area
 *     the core does not occupy.
 */
function coreRectFor(polygon: Polygon): CoreRectMm | null {
  const ring = polygon[0];
  if (ring === undefined || ring.length < 3) return null;
  const box = minimumAreaObbOfRing(ring);
  if (box === null) return null;

  const boxArea = box.widthM * box.depthM;
  const area = polygonArea(polygon);
  if (boxArea > 0 && area / boxArea >= 0.9) {
    return {
      widthMm: box.widthM,
      depthMm: box.depthM,
      centreXMm: box.centreX,
      centreZMm: box.centreZ,
    };
  }

  const step = Math.max(50, Math.min(box.widthM, box.depthM) / 16);
  const inscribed = largestInscribedAxisAlignedRect(polygon, step);
  if (inscribed === null) {
    return {
      widthMm: box.widthM,
      depthMm: box.depthM,
      centreXMm: box.centreX,
      centreZMm: box.centreZ,
    };
  }
  return {
    widthMm: inscribed.maxX - inscribed.minX,
    depthMm: inscribed.maxZ - inscribed.minZ,
    centreXMm: (inscribed.minX + inscribed.maxX) / 2,
    centreZMm: (inscribed.minZ + inscribed.maxZ) / 2,
  };
}

/* ------------------------------------------------------------------ */
/* Entrance anchor → facade                                            */
/* ------------------------------------------------------------------ */

type CompassFacade = BuildingSpec["orientation"]["primaryEntranceFacade"];

/**
 * Which elevation of the footprint an anchor was drawn against.
 *
 * The anchor is in the blueprint's own coordinates and `bounds` is the largest
 * plate's bounding box in the ENGINE's frame, so the same `shift` the compiler
 * applied to every other piece of geometry is applied here rather than a second
 * translation derived independently.
 *
 * The engine's frame is +Z north (`generate/partitions.ts`), so the high-Z edge
 * is the north elevation and the low-Z edge the south one. Each distance is
 * measured perpendicular to one edge and is NEGATIVE for a point outside the
 * box — which is the normal case, because a door marker is usually dropped just
 * outside the wall line; the most negative distance still names the edge it was
 * drawn against, so no clamping is wanted here.
 *
 * A point equidistant from two edges resolves to the Z axis, the same tie-break
 * `partitions.ts` applies to a 45° wall.
 */
function facadeNearestPoint(
  positionMm: PointMm,
  shiftXMm: number,
  shiftZMm: number,
  bounds: Rect,
): CompassFacade {
  const x = positionMm.xMm + shiftXMm;
  const z = positionMm.zMm + shiftZMm;
  const candidates: Array<[CompassFacade, number]> = [
    ["north", bounds.maxZ - z],
    ["south", z - bounds.minZ],
    ["east", bounds.maxX - x],
    ["west", x - bounds.minX],
  ];
  let best = candidates[0];
  // Strictly less-than, so a tie keeps the earlier (north/south) candidate.
  for (const candidate of candidates) {
    if (candidate[1] < best[1]) best = candidate;
  }
  return best[0];
}

/* ------------------------------------------------------------------ */
/* Fidelity → locks                                                    */
/* ------------------------------------------------------------------ */

/**
 * "Exact" means the geometry may not move, and the only mechanism that actually
 * prevents a move is the SPEC-level lock in `session/locks.ts`: it refuses
 * patch operations against the spec paths a system is generated from. So an
 * exact boundary or void locks `massing` (which owns "/massing", "/site",
 * "/orientation") and an exact core locks `core`.
 *
 * The tokens are literals rather than an import of `systemLock()` on purpose:
 * this module is a pure blueprint→spec function and must not depend on session
 * state. The grammar is `system:<BimSystem>` and is asserted by the tests.
 */
function locksFor(blueprint: BlueprintSpec): string[] {
  const locks = new Set<string>();

  for (const boundary of blueprint.boundaries) {
    if (resolveFidelity(blueprint, boundary.loop.id) === "exact") locks.add("system:massing");
  }
  for (const item of blueprint.voids) {
    if (resolveFidelity(blueprint, item.id) === "exact") locks.add("system:massing");
  }
  for (const item of blueprint.cores) {
    if (resolveFidelity(blueprint, item.id) === "exact") locks.add("system:core");
  }
  for (const item of blueprint.gridSystems) {
    if (resolveFidelity(blueprint, item.id) === "exact") locks.add("system:structure");
  }

  return [...locks].sort();
}
