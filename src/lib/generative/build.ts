// src/lib/generative/build.ts
//
// Spec → building. The deterministic half of the system, in one place.
//
// Generate, modify and repair all end the same way: solve the spec into
// geometry, compile a recipe for the renderer, emit the semantic BIM graph,
// validate it, and derive an honest status. Only the FIRST step differs between
// them (what produced the spec), so that is the only thing the routes own.
//
// No model is called from here and nothing in here is random — given a spec,
// this is a pure function. That is what makes an edit reviewable: the user is
// comparing two deterministic builds, not two rolls of the dice.

import { parseFloorNoFromLevelId, type BimElement } from "@/lib/bim/model/types";

import { compileSpecToRecipe } from "./compile/spec-to-recipe";
import { generateBuildingFromSpec } from "./generate/pipeline";
import type { ProgressFn } from "./generate/pipeline";
import { rectArea, type GeneratedBuilding } from "./generate/types";
import { emitSnapshot } from "./graph/emit";
import { buildBimSummary } from "./graph/summary";
import { applyLocksToElements, type LockToken } from "./session/locks";
import { deriveDesignStatus } from "./spec/status";
import type { BuildingPatch, BuildingSpec } from "./spec/building-spec";
import { validateBuilding } from "./validate/rules";
import type { BimSummary } from "./provider/types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { BimModelSnapshot } from "@/lib/bim/model/types";
import type { ValidationReport } from "./validate/rules";
import type { DesignStatus } from "./spec/status";
import type {
  BuildingMetrics,
  GeneratedLevel,
  GeneratedOpening,
  GeneratedWall,
  PlacedSpace,
} from "./generate/types";

export interface BuiltDesign {
  generationId: string;
  recipe: BuildingRecipe;
  snapshot: BimModelSnapshot;
  metrics: BuildingMetrics;
  validation: ValidationReport;
  status: DesignStatus;
  approximations: string[];
  /** Compact digest for the reasoning layer. Never the element list (§49). */
  summary: BimSummary;
  /**
   * Server-side only. Full solver output — thousands of objects. Routes use it
   * for validation and summarisation and must not put it in the response.
   */
  building: GeneratedBuilding;
  /**
   * Present only when the build went through `buildDesignPartial`. Absent means
   * "this was an ordinary full build", which is what every generate route does.
   */
  partialRegeneration?: PartialRegenerationNote;
}

export function buildDesign(input: {
  spec: BuildingSpec;
  buildingPk: string;
  generationId: string;
  /** Locks stamp `locked: true` so the next regeneration preserves them (§42). */
  locks?: Iterable<LockToken>;
  /** Human-authored elements carried across the rebuild. */
  authoredElements?: BimElement[];
  onStage?: ProgressFn;
}): BuiltDesign {
  const building = generateBuildingFromSpec(input.spec, input.onStage);
  const compiled = compileSpecToRecipe(input.spec);

  const snapshot = emitSnapshot({
    buildingPk: input.buildingPk,
    generationId: input.generationId,
    spec: input.spec,
    building,
    authoredElements: input.authoredElements,
  });
  snapshot.elements = applyLocksToElements(snapshot.elements, input.locks ?? []);

  const validation = validateBuilding(building, input.spec);

  const status = deriveDesignStatus({
    hasGeometry: snapshot.elements.length > 0,
    criticalViolations: validation.counts.critical,
    warningViolations: validation.counts.warning,
    // No jurisdictional ruleset is supplied anywhere in this pipeline, so a
    // build can never be promoted past GEOMETRICALLY_VALIDATED (§10).
    jurisdictionRulesetId: null,
  });

  const summary = buildBimSummary({
    buildingPk: input.buildingPk,
    spec: input.spec,
    building,
    elements: snapshot.elements,
    violations: validation.violations,
  });

  return {
    generationId: input.generationId,
    recipe: compiled.recipe,
    snapshot,
    metrics: building.metrics,
    validation,
    status,
    approximations: compiled.approximations,
    summary,
    building,
  };
}

/**
 * Ids read as a lineage: `GEN-0042` is the first build of seed 42, `GEN-0042.3`
 * its third revision. Elements carry this, so an element's provenance says which
 * edit produced it rather than merely "generated".
 */
export function generationIdFor(seed: number, revision: number): string {
  const base = `GEN-${String(seed % 10_000).padStart(4, "0")}`;
  return revision > 0 ? `${base}.${revision}` : base;
}

/* ================================================================== */
/* Partial regeneration, floor granularity                             */
/* ================================================================== */

// Every BuildingPatch already declares `scope` and `affectedFloorNos` (§39/§40).
// Until now nothing read them: an edit re-solved the whole building and the
// stability of the storeys the user did not touch was EMERGENT — a side effect
// of the pipeline being deterministic. That holds right up to the moment the
// patch perturbs a global input (a program area target, a corridor budget), at
// which point the solver legitimately re-bands every plate and rooms shuffle on
// storeys the user never mentioned. "I moved the meeting rooms on level 3 and
// level 5 changed" is the failure this closes.
//
// What this is NOT: a speed optimisation. The solver has no floor-scoped entry
// point — `generateBuildingFromSpec` is all-or-nothing — so the fresh build
// still runs in full and the carry-over happens afterwards. What it buys is
// STABILITY: the declared scope becomes a promise the engine keeps, rather than
// a hint it happens to satisfy.
//
// The contract, stated plainly:
//
//   • Elements on a floor the patch did NOT declare are the previous design's
//     element records, object-for-object. Not regenerated-and-identical —
//     literally the same records, provenance and all.
//   • Elements on a declared floor come from the fresh build.
//   • Everything a floor cannot own on its own — the storey set, the grid, the
//     core, the element types — must be unchanged, or nothing is carried.
//   • TRUST BUT VERIFY: the merged model is validated like any other. A patch
//     that under-declared its blast radius produces critical violations the
//     full rebuild does not have, and the full rebuild wins. The fallback is
//     recorded, never silent.
//
// Wing-level (same-floor) regeneration is deliberately out of scope; see
// `acceptance-locks-and-stability.test.ts` for the sentinel that pins it.

export interface PartialRegenerationNote {
  /** Floors the patch declared it would touch. */
  affectedFloorNos: number[];
  /** Floors whose element records were carried over from the previous design. */
  carriedFloorNos: number[];
  /** How many element records were carried rather than re-emitted. */
  carriedElementCount: number;
  /**
   * Null when the carry-over stood. Otherwise why the engine threw it away and
   * shipped the full rebuild instead. A safety net nobody can see is
   * indistinguishable from no safety net.
   */
  fallbackReason: string | null;
}

/** Structural equality over plain JSON geometry. The solver emits nothing else. */
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Which floors may be carried, or null when the patch is not floor-scoped.
 *
 * `scope: "building"` and an empty `affectedFloorNos` both mean "everything",
 * and both take the full-rebuild path unchanged.
 */
export function partialFloorScope(
  patch: Pick<BuildingPatch, "scope" | "affectedFloorNos">,
): number[] | null {
  if (patch.scope === "building") return null;
  const declared = patch.affectedFloorNos ?? [];
  if (declared.length === 0) return null;
  return [...new Set(declared)].sort((a, b) => a - b);
}

/**
 * Metrics for a building this module assembled rather than the pipeline solved.
 *
 * `generate/pipeline.ts` owns the same arithmetic in a private `computeMetrics`;
 * a merged building never passes through it, and reporting the fresh build's
 * metrics against merged geometry would be a straightforward lie — net area,
 * room count and circulation ratio all describe rooms the user is not looking
 * at. So the arithmetic is repeated here, and pinned: when nothing is carried
 * the merged building IS the fresh building, and `partial-regen-floors.test.ts`
 * asserts the two metric objects are identical. Exporting `computeMetrics` from
 * the pipeline would delete this function outright.
 */
function metricsOfMergedBuilding(input: {
  levels: GeneratedLevel[];
  spaces: PlacedSpace[];
  walls: GeneratedWall[];
  openings: GeneratedOpening[];
  columnCount: number;
  coreAreaSqm: number;
}): BuildingMetrics {
  const { levels, spaces, walls, openings } = input;

  const grossAreaSqm = levels.reduce((sum, l) => sum + l.plateAreaSqm, 0);
  const netAreaSqm = spaces.reduce((sum, s) => sum + s.areaSqm, 0);
  const circulationAreaSqm = spaces
    .filter((s) => s.isCirculation)
    .reduce((sum, s) => sum + s.areaSqm, 0);

  const exteriorWalls = walls.filter((w) => w.role === "exterior");
  const facadeAreaSqm = exteriorWalls.reduce((sum, w) => {
    const length = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);
    return sum + length * w.heightM;
  }, 0);

  const windows = openings.filter((o) => o.kind === "window");
  const windowAreaSqm = windows.reduce((sum, o) => sum + o.widthM * o.heightM, 0);

  const spaceAreaByType: Record<string, number> = {};
  const spaceCountByType: Record<string, number> = {};
  for (const space of spaces) {
    spaceAreaByType[space.type] = (spaceAreaByType[space.type] ?? 0) + space.areaSqm;
    spaceCountByType[space.type] = (spaceCountByType[space.type] ?? 0) + 1;
  }

  const aboveGrade = levels.filter((l) => l.floorNo > 0);
  const buildingHeightM = aboveGrade.reduce((sum, l) => sum + l.heightM, 0);

  return {
    floorCount: aboveGrade.length,
    buildingHeightM: Number(buildingHeightM.toFixed(3)),
    grossAreaSqm: Number(grossAreaSqm.toFixed(2)),
    netAreaSqm: Number(netAreaSqm.toFixed(2)),
    circulationAreaSqm: Number(circulationAreaSqm.toFixed(2)),
    circulationRatio:
      netAreaSqm > 0 ? Number((circulationAreaSqm / netAreaSqm).toFixed(4)) : 0,
    coreAreaSqm: Number(input.coreAreaSqm.toFixed(2)),
    coreRatio:
      grossAreaSqm > 0
        ? Number(((input.coreAreaSqm * levels.length) / grossAreaSqm).toFixed(4))
        : 0,
    facadeAreaSqm: Number(facadeAreaSqm.toFixed(2)),
    windowAreaSqm: Number(windowAreaSqm.toFixed(2)),
    windowToWallRatio:
      facadeAreaSqm > 0 ? Number((windowAreaSqm / facadeAreaSqm).toFixed(4)) : 0,
    roomCount: spaces.filter((s) => !s.isCirculation).length,
    doorCount: openings.filter((o) => o.kind === "door").length,
    windowCount: windows.length,
    columnCount: input.columnCount,
    spaceAreaByType,
    spaceCountByType,
  };
}

/**
 * Why this carry-over must not happen, or null when it may.
 *
 * A floor can only be carried forward if everything it does NOT own by itself
 * still agrees between the two builds. The storey set, the structural grid, the
 * core and the element type catalogue are all building-wide: a patch that moved
 * any of them changed every floor whether it said so or not, and pasting the
 * previous storeys back would leave shafts that no longer line up, columns off
 * the grid, or walls whose own type says a thickness they do not have.
 *
 * This runs BEFORE the merge because it is cheap and because its failures are
 * the informative ones — "the patch changed the storey count" reads better in a
 * history entry than the LEVEL_STACK_GAP it would have caused.
 */
function carryOverBlocker(input: {
  previous: GeneratedBuilding;
  next: GeneratedBuilding;
  previousTypes: BimModelSnapshot["types"];
  nextTypes: BimModelSnapshot["types"];
  carried: Set<number>;
}): string | null {
  const previousFloors = input.previous.levels.map((level) => level.floorNo);
  const nextFloors = input.next.levels.map((level) => level.floorNo);
  if (!sameJson(previousFloors, nextFloors)) {
    return `the patch changed the storey set (${previousFloors.length} → ${nextFloors.length} levels)`;
  }
  if (!sameJson(input.previous.grids, input.next.grids)) {
    return "the patch moved the structural grid";
  }
  if (!sameJson(input.previous.core, input.next.core)) {
    return "the patch moved the core";
  }
  if (!sameJson(input.previousTypes, input.nextTypes)) {
    return "the patch changed building-wide element types";
  }

  const previousByFloor = new Map(
    input.previous.levels.map((level) => [level.floorNo, level]),
  );
  for (const level of input.next.levels) {
    if (!input.carried.has(level.floorNo)) continue;
    if (!sameJson(previousByFloor.get(level.floorNo), level)) {
      return `level ${level.floorNo} moved although the patch did not declare it`;
    }
  }
  return null;
}

/** Previous geometry on the carried floors, fresh geometry everywhere else. */
function mergeBuildingByFloor(
  previous: GeneratedBuilding,
  next: GeneratedBuilding,
  carried: Set<number>,
): GeneratedBuilding {
  // Fresh first, carried appended: with an empty carry set this is `next`'s own
  // array, element for element and in its own order, which is what lets the
  // metric arithmetic above be compared against the pipeline's bit for bit.
  const pick = <T extends { floorNo: number }>(from: T[], to: T[]): T[] => [
    ...to.filter((item) => !carried.has(item.floorNo)),
    ...from.filter((item) => carried.has(item.floorNo)),
  ];

  // `carryOverBlocker` has already established that the carried levels, the
  // grid and the core are identical in both builds, so taking them from the
  // fresh build is not a choice between two answers — there is only one.
  const levels = next.levels;
  const spaces = pick(previous.spaces, next.spaces);
  const walls = pick(previous.walls, next.walls);
  const openings = pick(previous.openings, next.openings);
  const columns = pick(previous.columns, next.columns);
  const beams = pick(previous.beams, next.beams);
  const slabs = pick(previous.slabs, next.slabs);

  return {
    levels,
    grids: next.grids,
    core: next.core,
    spaces,
    walls,
    openings,
    columns,
    beams,
    slabs,
    metrics: metricsOfMergedBuilding({
      levels,
      spaces,
      walls,
      openings,
      columnCount: columns.length,
      coreAreaSqm: rectArea(next.core.rect),
    }),
  };
}

/**
 * The same swap at the BIM graph level, and the reason the feature is worth
 * anything: a carried element is the PREVIOUS RECORD, not a fresh one that
 * happens to compare equal. Its `generationSource` still names the build that
 * made it, so an element's provenance keeps telling the truth about which edit
 * last touched it.
 */
function mergeElementsByFloor(
  previous: BimElement[],
  next: BimElement[],
  carried: Set<number>,
): { elements: BimElement[]; carriedIds: string[] } {
  const onCarriedFloor = (element: BimElement): boolean => {
    if (element.levelId === null) return false;
    const floorNo = parseFloorNoFromLevelId(element.levelId);
    return floorNo !== null && carried.has(floorNo);
  };

  // A carried floor's slice is the previous design's own subsequence, in its own
  // order, so filtering the merged snapshot by level reproduces the previous
  // snapshot exactly rather than the same records shuffled. Elements with no
  // level (authored, building-wide) belong to no floor and always come fresh —
  // `mergeGenerated` has already preserved them inside the fresh build.
  const fresh = next.filter((element) => !onCarriedFloor(element));
  const freshIds = new Set(fresh.map((element) => element.id));
  const kept = previous.filter(
    // An id in both halves would mean the element changed storey between the two
    // builds. Generated ids embed their level, so this cannot happen today; if
    // it ever does, the floor actually being regenerated owns the id.
    (element) => onCarriedFloor(element) && !freshIds.has(element.id),
  );

  return {
    elements: [...fresh, ...kept],
    carriedIds: kept.map((element) => element.id),
  };
}

/**
 * Build the next design, honouring the patch's declared floor scope.
 *
 * Falls back to — and is otherwise byte-for-byte identical with — `buildDesign`
 * whenever the patch is not floor-scoped, whenever the carry-over is unsafe, and
 * whenever the merged model validates worse than the full rebuild.
 */
export function buildDesignPartial(input: {
  /** The design the user is looking at, built from the PRE-patch spec. */
  previous: BuiltDesign;
  patch: Pick<BuildingPatch, "scope" | "affectedFloorNos">;
  spec: BuildingSpec;
  buildingPk: string;
  generationId: string;
  locks?: Iterable<LockToken>;
  authoredElements?: BimElement[];
  onStage?: ProgressFn;
}): BuiltDesign {
  const full = buildDesign({
    spec: input.spec,
    buildingPk: input.buildingPk,
    generationId: input.generationId,
    locks: input.locks,
    authoredElements: input.authoredElements,
    onStage: input.onStage,
  });

  const scope = partialFloorScope(input.patch);
  if (scope === null) return full;

  const affected = new Set(scope);
  const carried = new Set(
    full.building.levels
      .map((level) => level.floorNo)
      .filter((floorNo) => !affected.has(floorNo)),
  );

  const note = (
    carriedFloorNos: number[],
    carriedElementCount: number,
    fallbackReason: string | null,
  ): PartialRegenerationNote => ({
    affectedFloorNos: scope,
    carriedFloorNos,
    carriedElementCount,
    fallbackReason,
  });

  const blocker = carryOverBlocker({
    previous: input.previous.building,
    next: full.building,
    previousTypes: input.previous.snapshot.types,
    nextTypes: full.snapshot.types,
    carried,
  });
  if (blocker !== null) {
    return { ...full, partialRegeneration: note([], 0, blocker) };
  }

  const building = mergeBuildingByFloor(input.previous.building, full.building, carried);
  const validation = validateBuilding(building, input.spec);

  // TRUST BUT VERIFY. Pre-existing criticals are not the carry-over's fault, so
  // the test is "did merging make it worse", not "is it clean" — otherwise a
  // building that was already broken could never be edited through this path.
  if (validation.counts.critical > full.validation.counts.critical) {
    const before = new Set(
      full.validation.violations
        .filter((v) => v.severity === "critical")
        .map((v) => v.code),
    );
    const introduced = [
      ...new Set(
        validation.violations
          .filter((v) => v.severity === "critical" && !before.has(v.code))
          .map((v) => v.code),
      ),
    ];
    const codes = introduced.length > 0 ? ` (${introduced.join(", ")})` : "";
    return {
      ...full,
      partialRegeneration: note(
        [],
        0,
        `carrying levels ${[...carried].sort((a, b) => a - b).join(", ")} forward introduced ${
          validation.counts.critical - full.validation.counts.critical
        } critical violation(s)${codes}, so the patch under-declared its scope`,
      ),
    };
  }

  const merged = mergeElementsByFloor(
    input.previous.snapshot.elements,
    full.snapshot.elements,
    carried,
  );
  // The token set is the source of truth for `locked`, so a carried element that
  // was locked under the previous session and is not under this one comes back
  // un-stamped. `applyLocksToElements` returns its input untouched when nothing
  // moved, which is what preserves byte-identity in the ordinary case.
  const elements = applyLocksToElements(merged.elements, input.locks ?? []);
  const snapshot: BimModelSnapshot = { ...full.snapshot, elements };

  return {
    generationId: input.generationId,
    recipe: full.recipe,
    snapshot,
    metrics: building.metrics,
    validation,
    status: deriveDesignStatus({
      hasGeometry: elements.length > 0,
      criticalViolations: validation.counts.critical,
      warningViolations: validation.counts.warning,
      jurisdictionRulesetId: null,
    }),
    approximations: full.approximations,
    summary: buildBimSummary({
      buildingPk: input.buildingPk,
      spec: input.spec,
      building,
      elements,
      violations: validation.violations,
    }),
    building,
    partialRegeneration: note(
      [...carried].sort((a, b) => a - b),
      merged.carriedIds.length,
      null,
    ),
  };
}
