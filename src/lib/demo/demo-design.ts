// src/lib/demo/demo-design.ts
//
// The demo door's BIM model. The ledger fixture (demo-building.ts) is the
// 표제부 — name, floors, 연면적, 2008 RC office. This file is the building
// INSIDE that stamp: a solved floor plan (lobby + 휴게음식점 on 1F, open
// office / meeting / pantry above, parking below) so 데모 건물 둘러보기 is
// a complete example, not a hollow massing.
//
// Geometry is locked to the ledger plate (34 × 24 m, 4.15 m typical storeys,
// 3.0 m basements) so the interior sits inside the same shell the recipe
// already draws. Deterministic: same seed, same snapshot.

import { generateBuildingGeometry, toRecipe } from "@/lib/building-geometry";
import { DEMO_BUILDING_PK } from "@/lib/constants";
import { compileSpecToRecipe } from "@/lib/generative/compile/spec-to-recipe";
import { emitSnapshot } from "@/lib/generative/graph/emit";
import { generateBuildingFromSpec } from "@/lib/generative/generate/pipeline";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { demoFloors, demoTitle } from "./demo-building";
import {
  beamDepthMm,
  coreFromPlate,
  DIMENSION_DEFAULTS,
  MIN_AREA_SQM,
  PREFERRED_ASPECT,
  slabThicknessMm,
  USE_PROFILES,
} from "@/lib/generative/spec/defaults";
import {
  BuildingSpecSchema,
  type BuildingSpec,
  type ProgramItem,
  type ValueSource,
} from "@/lib/generative/spec/building-spec";
import type { BimModelSnapshot } from "@/lib/bim/model/types";

/** Same plate the ledger 건축면적 is built from. */
export const DEMO_PLATE_WIDTH_MM = 34_000;
export const DEMO_PLATE_DEPTH_MM = 24_000;
/** Ledger heit 41.5 m / 10 floors. */
export const DEMO_STOREY_HEIGHT_MM = 4_150;
/** Matches generateBuildingGeometry's basement stack (3.0 m). */
export const DEMO_BASEMENT_HEIGHT_MM = 3_000;
export const DEMO_DESIGN_SEED = 20_081_124;

const UPPER_FLOORS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const OCCUPIED_FLOORS = [1, ...UPPER_FLOORS] as const;

function P<T>(
  value: T,
  source: ValueSource,
  confidence: number,
  reason: string,
) {
  return { value, source, confidence, reason };
}

function item(
  partial: Omit<ProgramItem, "minAreaSqm" | "preferredAspectRatio">,
): ProgramItem {
  return {
    ...partial,
    minAreaSqm: MIN_AREA_SQM[partial.type],
    preferredAspectRatio: PREFERRED_ASPECT[partial.type],
  };
}

function demoProgram(): ProgramItem[] {
  return [
    item({
      id: "lobby",
      type: "lobby",
      label: "로비",
      levels: [1],
      targetAreaSqmPerLevel: 180,
      countPerLevel: 1,
      adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORE" }],
      priority: "P1",
    }),
    item({
      id: "cafe",
      type: "retail",
      label: "휴게음식점",
      levels: [1],
      targetAreaSqmPerLevel: 90,
      countPerLevel: 1,
      adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORRIDOR" }],
      priority: "P1",
    }),
    item({
      id: "reception",
      type: "reception",
      label: "안내",
      levels: [1],
      targetAreaSqmPerLevel: 40,
      countPerLevel: 1,
      adjacency: [{ kind: "REQUIRES_ADJACENCY", targetId: "lobby" }],
      priority: "P2",
    }),
    item({
      id: "open-office",
      type: "office-open",
      label: "오픈오피스",
      levels: [...UPPER_FLOORS],
      targetAreaSqmPerLevel: 280,
      countPerLevel: 2,
      adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORRIDOR" }],
      priority: "P1",
    }),
    item({
      id: "cellular",
      type: "office-cellular",
      label: "임원실",
      levels: [...UPPER_FLOORS],
      targetAreaSqmPerLevel: 36,
      countPerLevel: 2,
      adjacency: [{ kind: "REQUIRES_EXTERIOR" }, { kind: "REQUIRES_CORRIDOR" }],
      priority: "P2",
    }),
    item({
      id: "meeting",
      type: "meeting",
      label: "회의실",
      levels: [...UPPER_FLOORS],
      targetAreaSqmPerLevel: 72,
      countPerLevel: 3,
      adjacency: [{ kind: "REQUIRES_CORE" }, { kind: "REQUIRES_CORRIDOR" }],
      priority: "P1",
    }),
    item({
      id: "pantry",
      type: "pantry",
      label: "탕비실",
      levels: [...UPPER_FLOORS],
      targetAreaSqmPerLevel: 16,
      countPerLevel: 1,
      adjacency: [{ kind: "REQUIRES_CORRIDOR" }],
      priority: "P2",
    }),
    item({
      id: "restroom",
      type: "restroom",
      label: "화장실",
      levels: [...OCCUPIED_FLOORS],
      targetAreaSqmPerLevel: 24,
      countPerLevel: 2,
      adjacency: [{ kind: "REQUIRES_CORE" }],
      priority: "P0",
    }),
    item({
      id: "storage",
      type: "storage",
      label: "창고",
      levels: [...OCCUPIED_FLOORS],
      targetAreaSqmPerLevel: 12,
      countPerLevel: 1,
      adjacency: [{ kind: "REQUIRES_CORRIDOR" }],
      priority: "P3",
    }),
    item({
      id: "electrical",
      type: "electrical",
      label: "전기실",
      levels: [...OCCUPIED_FLOORS],
      targetAreaSqmPerLevel: 10,
      countPerLevel: 1,
      adjacency: [{ kind: "REQUIRES_CORE" }],
      priority: "P1",
    }),
    item({
      id: "circulation",
      type: "corridor",
      label: "복도",
      levels: [...OCCUPIED_FLOORS],
      targetAreaSqmPerLevel: 90,
      countPerLevel: 1,
      adjacency: [{ kind: "REQUIRES_CORE" }],
      priority: "P0",
    }),
  ];
}

/** The BuildingSpec the demo snapshot is compiled from. */
export function buildDemoOfficeSpec(): BuildingSpec {
  const profile = USE_PROFILES.office;
  const gridMm = 6_000;
  const core = coreFromPlate({
    plateWidthMm: DEMO_PLATE_WIDTH_MM,
    plateDepthMm: DEMO_PLATE_DEPTH_MM,
    profile,
  });

  const levels: BuildingSpec["levels"] = [
    { floorNo: -2, name: "B2", floorToFloorMm: DEMO_BASEMENT_HEIGHT_MM, usage: "parking" },
    { floorNo: -1, name: "B1", floorToFloorMm: DEMO_BASEMENT_HEIGHT_MM, usage: "parking" },
    { floorNo: 1, name: "L01", floorToFloorMm: DEMO_STOREY_HEIGHT_MM, usage: "lobby" },
    ...UPPER_FLOORS.map((n) => ({
      floorNo: n,
      name: `L${String(n).padStart(2, "0")}`,
      floorToFloorMm: DEMO_STOREY_HEIGHT_MM,
      usage: "occupied" as const,
    })),
  ];

  return BuildingSpecSchema.parse({
    schemaVersion: 1,
    units: "mm",
    generationSeed: DEMO_DESIGN_SEED,
    project: {
      name: "데모 오피스 타워",
      use: "office",
      description:
        "2008 Gangnam RC office, 10 floors above a 2-level basement car park. " +
        "Ground floor is lobby and café; typical floors are open office, " +
        "meeting rooms and cellular rooms around a central core.",
    },
    designIntent: {
      summary:
        "A complete mid-rise office the visitor can rotate, cut, and take an energy answer from — without an API key.",
      priorities: [
        { goal: "maximize_usable_area", weight: 0.75 },
        { goal: "daylight_access", weight: 0.7 },
        { goal: "minimize_circulation", weight: 0.6 },
        { goal: "structural_regularity", weight: 0.65 },
      ],
    },
    orientation: {
      northAngleDeg: P(0, "DEFAULT", 0.5, "Aligned to the demo parcel north."),
      primaryEntranceFacade: "south",
    },
    site: {
      widthMm: P(40_000, "USER_PROVIDED", 1, "Parcel wider than the 34 m plate."),
      depthMm: P(30_000, "USER_PROVIDED", 1, "Parcel deeper than the 24 m plate."),
      region: P(
        { sigunguCd: "11680", label: "서울특별시 강남구 역삼동" },
        "USER_PROVIDED",
        1,
        "The demo address is 역삼동; climate follows Gangnam.",
      ),
    },
    massing: {
      strategy: P("rectangle", "USER_PROVIDED", 1, "Matches the bundled demo footprint."),
      widthMm: P(DEMO_PLATE_WIDTH_MM, "USER_PROVIDED", 1, "34 m east–west, same as 건축면적."),
      depthMm: P(DEMO_PLATE_DEPTH_MM, "USER_PROVIDED", 1, "24 m north–south, same as 건축면적."),
      parameters: {},
    },
    levels,
    structure: {
      system: P("rc-frame", "USER_PROVIDED", 1, "철근콘크리트구조 on the 표제부."),
      gridXMm: P(gridMm, "USER_PROVIDED", 1, "6 m bays, same as the demo recipe."),
      gridZMm: P(gridMm, "USER_PROVIDED", 1, "6 m bays, same as the demo recipe."),
      columnMm: P(600, "USER_PROVIDED", 1, "Matches the large-RC recipe column."),
      slabThicknessMm: P(slabThicknessMm(gridMm), "DERIVED", 0.75, "Slab depth from span."),
      beamDepthMm: P(beamDepthMm(gridMm), "DERIVED", 0.7, "Beam depth from span/12."),
    },
    core: {
      strategy: P("central", "INFERRED", 0.85, "A 10-storey office keeps the perimeter free."),
      widthMm: P(core.widthMm, "DERIVED", 0.7, "Core sized from the office core ratio."),
      depthMm: P(core.depthMm, "DERIVED", 0.7, "Core sized from the office core ratio."),
      offsetXMm: 0,
      offsetZMm: 0,
      elevators: P(3, "DERIVED", 0.75, "Three cars for ~10,000 m² served."),
      stairs: P(2, "DERIVED", 0.85, "Two egress stairs."),
      shafts: ["mechanical", "electrical", "plumbing"],
    },
    program: demoProgram(),
    facade: {
      sides: (["north", "south", "east", "west"] as const).map((side) => ({
        side,
        system: "curtain-wall" as const,
        glazingRatio: side === "south" ? 0.55 : 0.45,
        moduleMm: 1_500,
        windowWidthMm: 1_400,
        sillHeightMm: 0,
        headHeightMm: DEMO_STOREY_HEIGHT_MM - 400,
      })),
      spandrelMm: DIMENSION_DEFAULTS.spandrelMm,
    },
    roof: {
      type: P("flat", "USER_PROVIDED", 1, "평지붕 on the 표제부."),
      parapetMm: DIMENSION_DEFAULTS.parapetMm,
      pitchDeg: 0,
    },
    dimensions: {
      exteriorWallMm: P(DIMENSION_DEFAULTS.exteriorWallMm, "DEFAULT", 0.85, "Insulated exterior wall."),
      interiorWallMm: P(DIMENSION_DEFAULTS.interiorWallMm, "DEFAULT", 0.85, "Stud partition."),
      doorWidthMm: P(DIMENSION_DEFAULTS.doorWidthMm, "DEFAULT", 0.9, "Standard leaf."),
      doorHeightMm: P(DIMENSION_DEFAULTS.doorHeightMm, "DEFAULT", 0.9, "Standard door height."),
      corridorWidthMm: P(DIMENSION_DEFAULTS.corridorWidthMm, "DEFAULT", 0.8, "Two-way corridor."),
    },
    mep: {
      strategy: "central-ahu",
      mechanicalLevels: [-2],
      ceilingPlenumMm: DIMENSION_DEFAULTS.ceilingPlenumMm,
    },
    constraints: [
      {
        id: "core-continuous",
        priority: "P0",
        statement: "The vertical core must align across all levels.",
      },
      {
        id: "rooms-accessible",
        priority: "P1",
        statement: "Every enclosed space must connect to circulation.",
      },
    ],
    assumptions: [
      {
        id: "plate",
        label: "Floor plate",
        statement: "34 × 24 m rectangle taken from the demo 건축면적.",
        source: "USER_PROVIDED",
        confidence: 1,
      },
      {
        id: "storey",
        label: "Storey height",
        statement: "4.15 m above grade (41.5 m / 10), 3.0 m basement.",
        source: "DERIVED",
        confidence: 1,
      },
    ],
  });
}

let cachedSnapshot: BimModelSnapshot | null = null;
let cachedRecipe: BuildingRecipe | null = null;

/**
 * The 3D envelope recipe locked to the same 34 × 24 m schematic plate the
 * BIM snapshot is solved on. Ledger era/materials stay (2008 RC office);
 * footprint, storeys and core come from the spec so walls / floors / roof
 * sit on the schematic instead of the 35 × 23.3 m area-estimate box.
 */
export function getDemoRecipe(): BuildingRecipe {
  if (cachedRecipe) return cachedRecipe;
  const compiled = compileSpecToRecipe(buildDemoOfficeSpec());
  const ledger = toRecipe(generateBuildingGeometry(demoTitle, demoFloors));
  cachedRecipe = {
    ...compiled.recipe,
    era: ledger.era,
    materials: ledger.materials,
    buildingName: ledger.buildingName,
    address: ledger.address,
    officialFloorAreaSqm: ledger.officialFloorAreaSqm ?? demoTitle.totArea,
    facade: {
      ...ledger.facade,
      windowWidth: compiled.recipe.facade.windowWidth,
      windowHeight: compiled.recipe.facade.windowHeight,
      sillHeight: compiled.recipe.facade.sillHeight,
      windowSpacing: compiled.recipe.facade.windowSpacing,
      windowRatio: compiled.recipe.facade.windowRatio,
      parapetHeight: compiled.recipe.facade.parapetHeight,
    },
    curtainWall: compiled.recipe.curtainWall ?? ledger.curtainWall,
  };
  return cachedRecipe;
}

/** Solved BIM graph for the demo office. Built once per process. */
export function getDemoBimSnapshot(): BimModelSnapshot {
  if (cachedSnapshot) return cachedSnapshot;
  const spec = buildDemoOfficeSpec();
  const building = generateBuildingFromSpec(spec);
  cachedSnapshot = emitSnapshot({
    buildingPk: DEMO_BUILDING_PK,
    generationId: DEMO_BUILDING_PK,
    spec,
    building,
  });
  return cachedSnapshot;
}

/** Test-only: drop the memo so a later call rebuilds. */
export function __resetDemoBimSnapshotForTest(): void {
  cachedSnapshot = null;
  cachedRecipe = null;
}
