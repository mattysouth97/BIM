// src/lib/generative/compile/spec-to-recipe.ts
//
// BuildingSpec (mm, parametric intent) → BuildingRecipe (m, geometry engine).
//
// This is the ONLY place millimetres become metres. It is also the seam that
// lets a generated building reuse the entire existing geometry stack —
// `ProceduralBuilding`, the R3F viewer, `hydrateBimModel`, schedules, views —
// without rewriting any of it. Keeping this file thin is the whole point: if
// generation needs a new geometric capability, it belongs in the engine, not
// in a second parallel renderer.

import { getRecipe } from "@/lib/procedural/recipe";
import type {
  BuildingRecipe,
  FloorSpec,
  RoofConfig,
} from "@/lib/procedural/types";
import type { BuildingEra } from "@/lib/material-types";

import type { BuildingSpec, BuildingUse } from "../spec/building-spec";
import { generateMassing, type MassingResult } from "../generate/massing";

const mmToM = (mm: number) => mm / 1000;

/**
 * Generated buildings are new construction, so they take the newest material
 * era. Era drives PBR material selection in the existing pipeline (clean
 * concrete/glass rather than weathered), which is exactly right here.
 */
export const GENERATED_ERA: BuildingEra = "2020+";

/**
 * Internal material/structure taxonomy used by the existing PBR and facade
 * pipelines. These are NOT a building-registry lookup — no external data source
 * is consulted — they are the enum the geometry engine already speaks. Mapping
 * to them is what lets a generated building reuse that engine unchanged.
 *
 * Exported because the energy seed (`../energy/seed-from-design`) must produce
 * the SAME codes this compiler stamps on the recipe. Two copies of these tables
 * would let the material inference and the geometry disagree about what the
 * building is made of.
 */
export const STRUCTURE_TO_CODE: Record<string, string> = {
  "rc-frame": "11",
  "bearing-wall": "21",
  "steel-frame": "31",
  hybrid: "41",
};

export const USE_TO_CODE: Record<BuildingUse, string> = {
  office: "14000",
  residential: "02000",
  retail: "07000",
  research: "10000",
  education: "10000",
  industrial: "17000",
  healthcare: "09000",
  hospitality: "15000",
  civic: "12000",
  "mixed-use": "14000",
};

export interface CompiledBuilding {
  recipe: BuildingRecipe;
  massing: MassingResult;
  /** Derived, never stored on the spec — levels are the single source of truth. */
  totalHeightM: number;
  /** Sum of per-level plate areas above and below grade, m². */
  grossAreaSqm: number;
  /** Notes the UI should surface as approximations rather than hide. */
  approximations: string[];
}

/** Level stack → engine floor specs, accumulating elevation as we climb. */
function compileFloors(spec: BuildingSpec): {
  floors: FloorSpec[];
  totalHeightM: number;
} {
  const sorted = [...spec.levels].sort((a, b) => a.floorNo - b.floorNo);

  const below = sorted.filter((l) => l.floorNo < 0);
  const above = sorted.filter((l) => l.floorNo > 0);

  const floors: FloorSpec[] = [];

  // Basements descend from grade: B1's slab sits one storey height below 0.
  let y = 0;
  for (let i = below.length - 1; i >= 0; i -= 1) {
    const level = below[i];
    y -= mmToM(level.floorToFloorMm);
    floors.push({
      floorNo: level.floorNo,
      label: level.name,
      type: "below",
      y,
      height: mmToM(level.floorToFloorMm),
      isGroundFloor: false,
      useCode: USE_TO_CODE[spec.project.use],
    });
  }

  // Above grade stacks upward from 0.
  y = 0;
  for (const level of above) {
    floors.push({
      floorNo: level.floorNo,
      label: level.name,
      type: "above",
      y,
      height: mmToM(level.floorToFloorMm),
      isGroundFloor: level.floorNo === 1,
      useCode: USE_TO_CODE[spec.project.use],
    });
    y += mmToM(level.floorToFloorMm);
  }

  floors.sort((a, b) => a.floorNo - b.floorNo);

  // Nothing may vanish between the spec and the engine. The schema forbids
  // storey 0, but if that guard is ever loosened this turns a silently missing
  // floor into a loud failure instead of a building that is quietly one storey
  // short of what the user asked for.
  if (floors.length !== sorted.length) {
    const emitted = new Set(floors.map((f) => f.floorNo));
    const dropped = sorted.filter((l) => !emitted.has(l.floorNo)).map((l) => l.floorNo);
    throw new Error(
      `compileSpecToRecipe dropped level(s) ${dropped.join(", ")}: a level must be above (>0) or below (<0) grade.`,
    );
  }

  return { floors, totalHeightM: y };
}

function compileRoof(spec: BuildingSpec): RoofConfig["type"] {
  switch (spec.roof.type.value) {
    case "flat":
    case "terrace":
      return "flat";
    case "gable":
      return "gable";
    case "hip":
      return "hip";
    case "sawtooth":
      return "sawtooth";
    case "shed":
      return "other";
    default:
      return "flat";
  }
}

export function compileSpecToRecipe(spec: BuildingSpec): CompiledBuilding {
  const approximations: string[] = [];

  const massing = generateMassing(spec);
  const { floors, totalHeightM } = compileFloors(spec);

  const strctCd = STRUCTURE_TO_CODE[spec.structure.system.value] ?? "11";
  const mainPurpsCd = USE_TO_CODE[spec.project.use];
  const isLarge = massing.widthM * massing.depthM > 500;

  // Reuse the engine's era/use-aware facade, slab, column, roof and material
  // defaults, then override with everything the spec states explicitly.
  const defaults = getRecipe(strctCd, GENERATED_ERA, mainPurpsCd, isLarge);

  // The facade side facing the primary entrance drives the shared single-facade
  // config the engine renders. Per-side systems are preserved on the spec and
  // are what the BIM window/curtain-wall elements are generated from.
  const primarySide =
    spec.facade.sides.find((s) => s.side === spec.orientation.primaryEntranceFacade) ??
    spec.facade.sides[0];

  if (new Set(spec.facade.sides.map((s) => s.system)).size > 1) {
    approximations.push(
      `The 3D shell renders one facade system (${primarySide.system}); per-elevation systems are preserved as BIM data.`,
    );
  }

  if (massing.variesByLevel) {
    approximations.push(
      `${spec.massing.strategy.value} massing varies by level; the shell uses the largest plate while per-level plates drive areas and slabs.`,
    );
  }

  const roofType = compileRoof(spec);

  const recipe: BuildingRecipe = {
    footprintWidth: massing.widthM,
    footprintDepth: massing.depthM,
    footprintPolygon: massing.primary,
    floors,
    totalHeight: totalHeightM,
    wallThickness: mmToM(spec.dimensions.exteriorWallMm.value),
    era: GENERATED_ERA,
    strctCd,
    mainPurpsCd,
    facade: {
      ...defaults.facade,
      windowWidth: mmToM(primarySide.windowWidthMm),
      windowHeight: Math.max(
        0.3,
        mmToM(primarySide.headHeightMm - primarySide.sillHeightMm),
      ),
      sillHeight: mmToM(primarySide.sillHeightMm),
      windowSpacing: mmToM(primarySide.moduleMm),
      windowRatio: primarySide.glazingRatio,
      parapetHeight: mmToM(spec.roof.parapetMm),
    },
    slab: {
      ...defaults.slab,
      thickness: mmToM(spec.structure.slabThicknessMm.value),
    },
    column: {
      ...defaults.column,
      spacing: mmToM(spec.structure.gridXMm.value),
      size: mmToM(spec.structure.columnMm.value),
      inset:
        mmToM(spec.dimensions.exteriorWallMm.value) +
        mmToM(spec.structure.columnMm.value) / 2 +
        0.05,
    },
    roof: {
      ...defaults.roof,
      type: roofType,
      flatThickness: mmToM(spec.structure.slabThicknessMm.value),
    },
    materials: defaults.materials,
    siteWidth: mmToM(spec.site.widthMm.value),
    siteDepth: mmToM(spec.site.depthMm.value),
    buildingName: spec.project.name,
    // Generated buildings have no address until a site is supplied. Empty is
    // honest; a placeholder address would be a fabricated fact.
    address: "",
    // `getRecipe` returns a union; only the office branch carries a curtain-wall
    // config, so narrow with `in` rather than assuming the property exists.
    ...(primarySide.system === "curtain-wall" &&
    "curtainWall" in defaults &&
    defaults.curtainWall
      ? { curtainWall: defaults.curtainWall }
      : {}),
  };

  const grossAreaSqm = massing.plates.reduce((sum, plate) => sum + plate.areaSqm, 0);

  return { recipe, massing, totalHeightM, grossAreaSqm, approximations };
}
