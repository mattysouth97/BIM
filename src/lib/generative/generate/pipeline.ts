// src/lib/generative/generate/pipeline.ts
//
// The deterministic generation pipeline. Given a validated BuildingSpec it
// produces a complete GeneratedBuilding — no network, no model, no randomness
// beyond the seed.
//
// Ordering follows the brief's generative principle (§94): building → massing →
// levels → systems → zones → spaces → elements → detail. Each stage only reads
// what earlier stages produced, which is what makes partial regeneration
// tractable later.
//
// Stages report progress so the UI can show the building forming rather than a
// spinner (§52, §70).

import type { BuildingSpec } from "../spec/building-spec";
import { createRng } from "../rng";
import { generateMassing, polygonArea, polygonBounds } from "./massing";
import { resolveCirculation } from "./circulation";
import { generateCore } from "./core";
import { solveFloorPlan } from "./space-plan";
import { generateGrid, generateStructure } from "./structure";
import { generateWalls } from "./partitions";
import { generateOpenings } from "./openings";
import {
  rectArea,
  type BuildingMetrics,
  type GeneratedBuilding,
  type GeneratedLevel,
  type GeneratedOpening,
  type GeneratedWall,
  type PlacedSpace,
  type Rect,
} from "./types";

export type GenerationStage =
  | "massing"
  | "levels"
  | "grid"
  | "core"
  | "spaces"
  | "circulation"
  | "walls"
  | "openings"
  | "structure"
  | "metrics";

export const STAGE_LABEL: Record<GenerationStage, string> = {
  massing: "Generating massing",
  levels: "Creating levels",
  grid: "Generating structural grid",
  core: "Creating building core",
  spaces: "Solving floor layouts",
  circulation: "Creating circulation",
  walls: "Creating walls",
  openings: "Placing doors and windows",
  structure: "Creating structure",
  metrics: "Calculating metrics",
};

export interface StageProgress {
  stage: GenerationStage;
  label: string;
  index: number;
  total: number;
  /** Human-readable detail, e.g. "Level 03". */
  detail?: string;
}

export type ProgressFn = (progress: StageProgress) => void;

const STAGES: GenerationStage[] = [
  "massing",
  "levels",
  "grid",
  "core",
  "spaces",
  "circulation",
  "walls",
  "openings",
  "structure",
  "metrics",
];

function boundsToRect(polygon: ReturnType<typeof generateMassing>["primary"]): Rect {
  const b = polygonBounds(polygon);
  return { minX: b.minX, minZ: b.minZ, maxX: b.maxX, maxZ: b.maxZ };
}

/**
 * The largest SOLID rectangle of a plate, for siting the core.
 *
 * A courtyard or atrium plate is a ring: its bounding box is mostly void. Siting
 * the core on that box centres it in the void — a core standing in open air,
 * connected to nothing. So when the plate has holes, cut the ring into the four
 * bands around the void and hand back the biggest one.
 *
 * Only the first hole is considered: the massing generator emits at most one,
 * and quietly mis-siting the core on a hypothetical second is worse than the
 * obvious behaviour of ignoring it.
 */
function solidPlateForCore(
  polygon: ReturnType<typeof generateMassing>["primary"],
): Rect {
  const plate = boundsToRect(polygon);
  const [, ...holes] = polygon;
  if (holes.length === 0) return plate;

  const h = polygonBounds([holes[0]]);
  const bands: Rect[] = [
    { minX: plate.minX, maxX: h.minX, minZ: plate.minZ, maxZ: plate.maxZ }, // west
    { minX: h.maxX, maxX: plate.maxX, minZ: plate.minZ, maxZ: plate.maxZ }, // east
    { minX: plate.minX, maxX: plate.maxX, minZ: plate.minZ, maxZ: h.minZ }, // south
    { minX: plate.minX, maxX: plate.maxX, minZ: h.maxZ, maxZ: plate.maxZ }, // north
  ].filter((b) => b.maxX - b.minX > 0.1 && b.maxZ - b.minZ > 0.1);

  if (bands.length === 0) return plate;
  return bands.reduce((best, band) => (rectArea(band) > rectArea(best) ? band : best));
}

/* ------------------------------------------------------------------ */
/* Metrics                                                             */
/* ------------------------------------------------------------------ */

function computeMetrics(input: {
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
    // Ratio is against NET, matching how architects quote it.
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

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

export function generateBuildingFromSpec(
  spec: BuildingSpec,
  onProgress?: ProgressFn,
): GeneratedBuilding {
  const rng = createRng(spec.generationSeed);
  const report = (stage: GenerationStage, detail?: string) =>
    onProgress?.({
      stage,
      label: STAGE_LABEL[stage],
      index: STAGES.indexOf(stage),
      total: STAGES.length,
      detail,
    });

  /* --- massing --- */
  report("massing");
  const massing = generateMassing(spec);
  const plate = boundsToRect(massing.primary);

  /* --- levels --- */
  report("levels");
  const sortedSpec = [...spec.levels].sort((a, b) => a.floorNo - b.floorNo);
  const plateByFloor = new Map(massing.plates.map((p) => [p.floorNo, p]));

  const levels: GeneratedLevel[] = [];
  let elevation = 0;
  // Basements descend from grade, so walk them downward first.
  const below = sortedSpec.filter((l) => l.floorNo < 0);
  for (let i = below.length - 1; i >= 0; i -= 1) {
    const level = below[i];
    elevation -= level.floorToFloorMm / 1000;
    const plateForLevel = plateByFloor.get(level.floorNo);
    levels.push({
      floorNo: level.floorNo,
      name: level.name,
      elevationM: elevation,
      heightM: level.floorToFloorMm / 1000,
      usage: level.usage,
      polygon: plateForLevel?.polygon ?? massing.primary,
      plateAreaSqm: plateForLevel?.areaSqm ?? polygonArea(massing.primary),
    });
  }

  elevation = 0;
  for (const level of sortedSpec.filter((l) => l.floorNo > 0)) {
    const plateForLevel = plateByFloor.get(level.floorNo);
    levels.push({
      floorNo: level.floorNo,
      name: level.name,
      elevationM: elevation,
      heightM: level.floorToFloorMm / 1000,
      usage: level.usage,
      polygon: plateForLevel?.polygon ?? massing.primary,
      plateAreaSqm: plateForLevel?.areaSqm ?? polygonArea(massing.primary),
    });
    elevation += level.floorToFloorMm / 1000;
  }
  levels.sort((a, b) => a.floorNo - b.floorNo);

  const floorNos = levels.map((l) => l.floorNo);

  /* --- grid --- */
  report("grid");
  const grids = generateGrid({ spec, plate });

  /* --- core --- */
  report("core");
  // Site the core on solid floor, not on the bounding box — see solidPlateForCore.
  const core = generateCore({ spec, plate: solidPlateForCore(massing.primary), floorNos });

  /* --- spaces, per level --- */
  report("spaces");
  const spaces: PlacedSpace[] = [];
  for (const level of levels) {
    // Basements, plant and the roof are not space-planned; they read as a
    // single undivided plate, which is honest rather than inventing offices in
    // a car park or laying out rooms on a roof deck.
    if (
      level.floorNo < 0 ||
      level.usage === "mechanical" ||
      level.usage === "parking" ||
      level.usage === "roof"
    ) {
      continue;
    }
    report("spaces", level.name);
    const levelPlate = boundsToRect(level.polygon);
    spaces.push(
      ...solveFloorPlan({
        spec,
        floorNo: level.floorNo,
        plate: levelPlate,
        core,
        rng: rng.fork(`level-${level.floorNo}`),
      }),
    );
  }

  /* --- walls (needed before openings, which are hosted on them) --- */
  report("walls");
  const walls: GeneratedWall[] = [];
  for (const level of levels) {
    const levelSpaces = spaces.filter((s) => s.floorNo === level.floorNo);
    walls.push(
      ...generateWalls({
        spec,
        floorNo: level.floorNo,
        levelHeightM: level.heightM,
        plate: boundsToRect(level.polygon),
        platePolygon: level.polygon,
        core,
        spaces: levelSpaces,
      }),
    );
  }

  /* --- openings --- */
  report("openings");
  const openings: GeneratedOpening[] = [];
  for (const level of levels) {
    openings.push(
      ...generateOpenings({
        spec,
        floorNo: level.floorNo,
        walls: walls.filter((w) => w.floorNo === level.floorNo),
        spaces: spaces.filter((s) => s.floorNo === level.floorNo),
        rng: rng.fork(`openings-${level.floorNo}`),
      }),
    );
  }

  /* --- circulation: resolve reachability once doors exist --- */
  report("circulation");
  const circulation = resolveCirculation({ spaces, openings, core, floorNos });

  /* --- structure --- */
  report("structure");
  const { columns, beams, slabs } = generateStructure({ spec, levels, grids, plate });

  /* --- metrics --- */
  report("metrics");
  const metrics = computeMetrics({
    levels,
    spaces: circulation.spaces,
    walls,
    openings,
    columnCount: columns.length,
    coreAreaSqm: rectArea(core.rect),
  });

  return {
    levels,
    grids,
    core,
    spaces: circulation.spaces,
    walls,
    openings,
    columns,
    beams,
    slabs,
    metrics,
  };
}
