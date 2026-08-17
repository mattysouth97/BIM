// src/lib/generative/energy/seed-from-design.ts
//
// Generated design → the exact seed shape a ledger building produces.
//
// `seedBuildingFromLedger` (src/lib/building-seed.ts) turns 건축물대장 rows into
// { pk, materials, recipe }; every energy, retrofit and scenario surface then
// keys on that pk alone and never asks where the building came from. This file
// is the same door for a generated design, so the whole physics stack — heat
// loss, annual demand, efficiency rating, CO2, retrofit knapsack — runs on a
// design that has no ledger entry at all, without a single change downstream.
//
// HONESTY BOUNDARIES (these are the point, not caveats):
//   • A generated building has no `mgmBldrgstPk`, so the measured-consumption
//     and official-grade APIs have nothing to fetch. The synthetic title below
//     carries an EMPTY pk — never a plausible-looking fake — so those hooks
//     null-guard exactly as they do for an unmatched ledger building.
//   • U-values, HVAC efficiencies, lighting and occupancy are code-table
//     estimates for the era, identical in kind to what any pre-retrofit ledger
//     building gets. `materials.confidence` stays "estimated"; the UI must keep
//     labelling these as 추정 / estimated.
//   • Climate defaults to Seoul unless the spec carries a site region, which is
//     the engine's own documented fallback (`getClimateData`).
// What IS measured is the geometry: gross area, facade area and window-to-wall
// ratio come from the solved building, not from an era table, and those
// override the inferred values below.

import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { inferMaterialProperties } from "@/lib/material-inference";
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { BrTitleInfo } from "@/lib/types";

import {
  GENERATED_ERA,
  STRUCTURE_TO_CODE,
  USE_TO_CODE,
} from "../compile/spec-to-recipe";
import type { BuildingMetrics } from "../generate/types";
import type { BuildingSpec } from "../spec/building-spec";

/**
 * Climate fallback when the spec names no site. Seoul, matching
 * `getClimateData`'s own default — the UI must disclose it as a default rather
 * than present it as the project's climate.
 */
export const DEFAULT_GENERATED_SIGUNGU_CD = "11";

/**
 * Permit date stamped on the synthetic title purely to select the material era.
 * It is the FIRST DAY OF `GENERATED_ERA`, not a date anyone applied for
 * anything on: a generated design is new construction, so it is evaluated
 * against the current-era code tables. Fixed, never `Date.now()` — the seed is
 * deterministic and a design must not silently change era overnight.
 *
 * Invariant, asserted in energy-seed.test.ts: `classifyEra(GENERATED_PERMIT_DAY)`
 * must equal `GENERATED_ERA`, the era the recipe compiler stamps. If the two
 * drift, the materials describe a different building from the geometry.
 */
export const GENERATED_PERMIT_DAY = "20200101";

/**
 * Upper bound on the window-to-wall ratio handed to the physics. Mirrors the
 * cap `inferMaterialProperties` already applies to IFC-derived ratios: heat
 * loss computes opaque wall area as gross × (1 − WWR), which a degenerate
 * ratio ≥ 1 would drive negative.
 */
const MAX_WWR = 0.95;

/**
 * The seed a generated design hands to the stores. Field-for-field the ledger
 * seed plus the region the energy hooks need — `SeededBuilding` carries no
 * sigunguCd because a ledger title already has one.
 */
export interface GeneratedBuildingSeed {
  /** Store key for every energy/retrofit surface. The design's generationId. */
  pk: string;
  materials: MaterialProperties;
  recipe: BuildingRecipe;
  /** 시군구 code (or 시도 prefix) for climate lookup. Seoul default. */
  sigunguCd: string;
}

export interface GeneratedDesignInput {
  spec: BuildingSpec;
  recipe: BuildingRecipe;
  metrics: BuildingMetrics;
  generationId: string;
}

/* ------------------------------------------------------------------ */
/* Synthetic title                                                     */
/* ------------------------------------------------------------------ */

/**
 * `inferMaterialProperties` reads exactly seven fields off a title:
 * `pmsDay`, `mainPurpsCd`, `strctCd`, `sigunguCd`, `totArea`, `grndFlrCnt`,
 * `ugrndFlrCnt`. Those seven are the only ones given a real value here.
 *
 * The rest exist because `BrTitleInfo` is a closed record, and they are filled
 * with the ledger's own "unavailable" values — "" and 0 — rather than
 * invented plausible ones (AFF-6: a zero means no data, not a measurement). If
 * a future reader starts consulting one of them it will read "unavailable",
 * which is true, instead of a fabrication.
 */
export function syntheticTitleForGeneratedDesign(
  spec: BuildingSpec,
  metrics: BuildingMetrics,
  sigunguCd: string,
): BrTitleInfo {
  const aboveGrade = spec.levels.filter((l) => l.floorNo > 0).length;
  const belowGrade = spec.levels.filter((l) => l.floorNo < 0).length;

  return {
    // No 건축물대장 entry exists for a design. Empty, so consumption/grade
    // lookups keyed on this pk find nothing and say so.
    mgmBldrgstPk: "",
    bldNm: spec.project.name,
    platPlcNm: "",
    newPlatPlc: "",
    sigunguCd,
    bjdongCd: "",
    platGbCd: "",
    bun: "",
    ji: "",
    mainPurpsCd: USE_TO_CODE[spec.project.use],
    mainPurpsCdNm: spec.project.use,
    etcPurps: "",
    strctCd: STRUCTURE_TO_CODE[spec.structure.system.value] ?? "11",
    strctCdNm: spec.structure.system.value,
    etcStrct: "",
    grndFlrCnt: aboveGrade,
    ugrndFlrCnt: belowGrade,
    // Solved plate areas summed by the geometry pass — measured, not estimated.
    totArea: metrics.grossAreaSqm,
    archArea: 0,
    platArea: 0,
    bcRat: 0,
    vlRat: 0,
    useAprDay: "",
    pmsDay: GENERATED_PERMIT_DAY,
    stcnsDay: "",
    roofCd: "",
    roofCdNm: "",
    heit: metrics.buildingHeightM,
    regstrGbCd: "",
    regstrGbCdNm: "",
    regstrKindCd: "",
    regstrKindCdNm: "",
  };
}

/* ------------------------------------------------------------------ */
/* Solved-geometry overrides                                           */
/* ------------------------------------------------------------------ */

/**
 * Replace the era-table geometry guesses with the building that was actually
 * solved. Only two fields on `MaterialProperties` describe envelope geometry —
 * `walls[].surfaceArea` and `windows.windowToWallRatio` — and both are strictly
 * better known here than any table can state them. Nothing else is touched:
 * the U-values, systems and schedules remain code estimates, and `source` /
 * `confidence` stay "code-estimate" / "estimated" to say so.
 *
 * The ratio is applied uniformly to all four orientations because the solved
 * metrics carry ONE whole-building ratio. The physics averages the four
 * (heat-loss.ts) so the average is exactly the measured ratio, whereas the
 * table's N×0.8 / S×1.2 profile would be a fabricated orientation split.
 */
function withSolvedEnvelopeGeometry(
  materials: MaterialProperties,
  metrics: BuildingMetrics,
): MaterialProperties {
  // A zero facade area means the geometry pass produced no exterior walls to
  // measure — not a windowless building. Keep the estimate rather than
  // overwrite it with a measurement that does not exist.
  if (!(metrics.facadeAreaSqm > 0)) return materials;

  const wwr = Math.min(Math.max(metrics.windowToWallRatio, 0), MAX_WWR);
  const areaPerOrientation = metrics.facadeAreaSqm / 4;

  return {
    ...materials,
    envelope: {
      ...materials.envelope,
      walls: materials.envelope.walls.map((wall) => ({
        ...wall,
        surfaceArea: areaPerOrientation,
      })),
      windows: {
        ...materials.envelope.windows,
        windowToWallRatio: { N: wwr, S: wwr, E: wwr, W: wwr },
      },
    },
  };
}

/**
 * The recipe the energy stack sees, with the solved gross floor area as its
 * intensity denominator.
 *
 * `envelopeQuantities` otherwise falls back to plan area × floor count, which
 * is only right for a prismatic building — a stepped or podium-tower massing
 * would be billed for its largest plate on every level, inflating floor area
 * and flattering kWh/m² and the grade. `metrics.grossAreaSqm` is the sum of the
 * real per-level plates. The field is named for the ledger's 연면적 because
 * that is the ledger's source for it; here the more accurate measured value
 * takes the same role, and it is the only consumer of the field.
 */
function recipeWithSolvedFloorArea(
  recipe: BuildingRecipe,
  metrics: BuildingMetrics,
): BuildingRecipe {
  if (!(metrics.grossAreaSqm > 0)) return recipe;
  return { ...recipe, officialFloorAreaSqm: metrics.grossAreaSqm };
}

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

/**
 * Generated design → store seed. Pure, deterministic, client-safe.
 *
 * `pk` is the generationId so each design owns its own materials/recipe/
 * scenario state; two designs open at once must not overwrite each other.
 */
export function seedBuildingFromGeneratedDesign(
  design: GeneratedDesignInput,
): GeneratedBuildingSeed {
  const { spec, metrics, generationId } = design;

  const sigunguCd =
    spec.site.region?.value.sigunguCd ?? DEFAULT_GENERATED_SIGUNGU_CD;

  const title = syntheticTitleForGeneratedDesign(spec, metrics, sigunguCd);

  // The existing inference engine, called — not reimplemented. No floor rows
  // exist for a design (그 층별개요 comes from the ledger), and the function
  // ignores them anyway.
  const inferred = inferMaterialProperties(title, []);

  return {
    pk: generationId,
    materials: withSolvedEnvelopeGeometry(inferred, metrics),
    recipe: recipeWithSolvedFloorArea(design.recipe, metrics),
    sigunguCd,
  };
}

/* ------------------------------------------------------------------ */
/* Scenario inputs                                                     */
/* ------------------------------------------------------------------ */

/**
 * Shape of `ScenarioBuildingInputs` minus `buildingPk` (the caller pairs it
 * with `seed.pk`). Structurally declared rather than imported so this module
 * stays free of the client store.
 */
export interface GeneratedScenarioInputs {
  totalFloorArea: number;
  footprintArea: number;
  roofType: "flat" | "gable" | "hip" | "sawtooth";
  sidoPrefix: string;
}

/**
 * The scenario store's taxonomy has no shed/mono-pitch entry. A shed roof is
 * single-pitched, so it takes the pitched utilisation factor: calling it flat
 * would claim the full horizontal PV yield of a roof that does not have it.
 */
function scenarioRoofType(
  type: BuildingRecipe["roof"]["type"],
): GeneratedScenarioInputs["roofType"] {
  return type === "other" ? "gable" : type;
}

/**
 * Retrofit/CAPEX engine inputs for a generated design — the one call the UI
 * needs between the seed and `useRetrofitScenario` / `setBuildingInputs`.
 */
export function scenarioInputsFromSeed(
  seed: GeneratedBuildingSeed,
  metrics: BuildingMetrics,
): GeneratedScenarioInputs {
  const quantities = envelopeQuantities(seed.recipe);

  return {
    // Equal to `quantities.intensityFloorAreaSqm` by construction — the seed
    // publishes the solved gross area as the recipe's denominator — so the
    // retrofit engine and the energy engine divide by the same number. The
    // fallback covers a recipe that reached here from elsewhere.
    totalFloorArea:
      metrics.grossAreaSqm > 0
        ? metrics.grossAreaSqm
        : quantities.intensityFloorAreaSqm,
    // Real polygon area (outer ring minus courtyards), not the bounding box.
    footprintArea: quantities.planAreaSqm,
    roofType: scenarioRoofType(seed.recipe.roof.type),
    sidoPrefix: seed.sigunguCd.slice(0, 2),
  };
}

/**
 * The era the synthetic permit date resolves to. Exported so the era contract
 * between this file and the recipe compiler is asserted, not assumed.
 */
export { GENERATED_ERA };
