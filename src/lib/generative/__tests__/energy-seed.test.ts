// Contract tests for the design → energy seed adapter.
//
// The adapter's whole value is that it produces the SAME thing the ledger path
// produces, so the tests below check the seam rather than the physics: what the
// synthetic title says, what the solved geometry is allowed to override, and
// what stays honestly unavailable. The physics itself runs end-to-end in
// energy-seed-physics.test.ts.

import { describe, expect, it } from "vitest";

import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { classifyEra } from "@/lib/material-types";

import { compileSpecToRecipe, GENERATED_ERA } from "../compile/spec-to-recipe";
import { generateBuildingFromSpec } from "../generate/pipeline";
import type { BuildingMetrics } from "../generate/types";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { seedFromPrompt } from "../rng";
import type { BuildingSpec } from "../spec/building-spec";
import {
  DEFAULT_GENERATED_SIGUNGU_CD,
  GENERATED_PERMIT_DAY,
  scenarioInputsFromSeed,
  seedBuildingFromGeneratedDesign,
  syntheticTitleForGeneratedDesign,
} from "../energy/seed-from-design";

const provider = new HeuristicReasoningProvider();

async function design(prompt: string, generationId = "GEN-0001") {
  const { data: spec } = await provider.generateBuilding({
    prompt,
    seed: seedFromPrompt(prompt),
  });
  const building = generateBuildingFromSpec(spec);
  const { recipe } = compileSpecToRecipe(spec);
  return { spec, recipe, metrics: building.metrics, generationId };
}

const OFFICE_PROMPT =
  "Design a six-storey office building of about 7,200 m² with one basement.";

describe("seedBuildingFromGeneratedDesign — era contract", () => {
  it("stamps a permit date that resolves to the recipe compiler's era", () => {
    // If these drift, the materials describe a different building from the
    // geometry: 2020+ glass on 1990s U-values, or the reverse.
    expect(classifyEra(GENERATED_PERMIT_DAY)).toBe(GENERATED_ERA);
  });

  it("gives the synthetic title the same era the recipe carries", async () => {
    const built = await design(OFFICE_PROMPT);
    const title = syntheticTitleForGeneratedDesign(
      built.spec,
      built.metrics,
      "11",
    );
    expect(classifyEra(title.pmsDay)).toBe(built.recipe.era);
  });
});

describe("seedBuildingFromGeneratedDesign — synthetic title", () => {
  it("mirrors the spec's use, structure and level stack", async () => {
    const built = await design(OFFICE_PROMPT);
    const title = syntheticTitleForGeneratedDesign(built.spec, built.metrics, "11");

    // Same codes the recipe compiler stamped — one taxonomy, not two.
    expect(title.mainPurpsCd).toBe(built.recipe.mainPurpsCd);
    expect(title.strctCd).toBe(built.recipe.strctCd);

    const above = built.spec.levels.filter((l) => l.floorNo > 0).length;
    const below = built.spec.levels.filter((l) => l.floorNo < 0).length;
    expect(title.grndFlrCnt).toBe(above);
    expect(title.ugrndFlrCnt).toBe(below);
    expect(above).toBeGreaterThan(0);
    expect(below).toBeGreaterThan(0);

    // Measured gross area, not an era estimate.
    expect(title.totArea).toBe(built.metrics.grossAreaSqm);
  });

  it("leaves the ledger key empty rather than inventing one", async () => {
    const built = await design(OFFICE_PROMPT);
    const title = syntheticTitleForGeneratedDesign(built.spec, built.metrics, "11");

    // A generated building has no 건축물대장 entry. Consumption / official-grade
    // APIs must find nothing here, not a plausible-looking fake.
    expect(title.mgmBldrgstPk).toBe("");
    // Unmeasured ledger figures stay at the "unavailable" sentinel (AFF-6).
    expect(title.archArea).toBe(0);
    expect(title.platArea).toBe(0);
    expect(title.useAprDay).toBe("");
  });
});

describe("seedBuildingFromGeneratedDesign — seed shape", () => {
  it("keys the seed on the generation id so two designs cannot collide", async () => {
    const a = await design(OFFICE_PROMPT, "GEN-0042");
    const b = await design(OFFICE_PROMPT, "GEN-0042.1");

    expect(seedBuildingFromGeneratedDesign(a).pk).toBe("GEN-0042");
    expect(seedBuildingFromGeneratedDesign(b).pk).toBe("GEN-0042.1");
  });

  it("defaults climate to Seoul when the spec names no site", async () => {
    const built = await design(OFFICE_PROMPT);
    expect(built.spec.site.region).toBeUndefined();
    expect(seedBuildingFromGeneratedDesign(built).sigunguCd).toBe(
      DEFAULT_GENERATED_SIGUNGU_CD,
    );
  });

  it("uses the spec's site region when the prompt named a place", async () => {
    const built = await design(
      "Design a six-storey office building in Gangwon of about 7,200 m².",
    );
    expect(built.spec.site.region?.value.sigunguCd).toBe("51");
    expect(built.spec.site.region?.source).toBe("USER_PROVIDED");
    expect(seedBuildingFromGeneratedDesign(built).sigunguCd).toBe("51");
  });

  it("is deterministic — same design in, identical seed out", async () => {
    const built = await design(OFFICE_PROMPT);
    expect(seedBuildingFromGeneratedDesign(built)).toEqual(
      seedBuildingFromGeneratedDesign(built),
    );
  });

  it("keeps the materials labelled as estimates", async () => {
    const built = await design(OFFICE_PROMPT);
    const seed = seedBuildingFromGeneratedDesign(built);

    // Solved geometry does not upgrade code-table U-values into measurements.
    expect(seed.materials.source).toBe("code-estimate");
    expect(seed.materials.confidence).toBe("estimated");
    expect(seed.materials.envelope.airtightness.testMethod).toBe("estimated");
  });
});

describe("seedBuildingFromGeneratedDesign — solved-geometry overrides", () => {
  it("replaces the era-table WWR with the solved ratio on every orientation", async () => {
    const built = await design(OFFICE_PROMPT);
    const seed = seedBuildingFromGeneratedDesign(built);
    const wwr = seed.materials.envelope.windows.windowToWallRatio;

    expect(built.metrics.windowToWallRatio).toBeGreaterThan(0);
    for (const side of [wwr.N, wwr.S, wwr.E, wwr.W]) {
      expect(side).toBeCloseTo(built.metrics.windowToWallRatio, 10);
    }
  });

  it("publishes the solved facade area across the four wall assemblies", async () => {
    const built = await design(OFFICE_PROMPT);
    const seed = seedBuildingFromGeneratedDesign(built);

    const total = seed.materials.envelope.walls.reduce(
      (sum, w) => sum + w.surfaceArea,
      0,
    );
    expect(total).toBeCloseTo(built.metrics.facadeAreaSqm, 6);
  });

  it("clamps a degenerate window-to-wall ratio away from a negative wall area", async () => {
    const built = await design(OFFICE_PROMPT);
    const broken: BuildingMetrics = { ...built.metrics, windowToWallRatio: 1.4 };
    const seed = seedBuildingFromGeneratedDesign({ ...built, metrics: broken });

    expect(seed.materials.envelope.windows.windowToWallRatio.S).toBeLessThan(1);
  });

  it("keeps the estimate when there is no facade to measure", async () => {
    const built = await design(OFFICE_PROMPT);
    const estimated = seedBuildingFromGeneratedDesign({
      ...built,
      metrics: { ...built.metrics, facadeAreaSqm: 0, windowToWallRatio: 0 },
    });

    // 0 m² of facade is missing data, not a windowless building.
    expect(
      estimated.materials.envelope.windows.windowToWallRatio.S,
    ).toBeGreaterThan(0);
  });

  it("makes the solved gross area the intensity denominator", async () => {
    const built = await design(OFFICE_PROMPT);
    const seed = seedBuildingFromGeneratedDesign(built);

    expect(seed.recipe.officialFloorAreaSqm).toBe(built.metrics.grossAreaSqm);
    expect(envelopeQuantities(seed.recipe).intensityFloorAreaSqm).toBe(
      built.metrics.grossAreaSqm,
    );
    // Everything else about the recipe is the compiler's, untouched.
    expect(seed.recipe.footprintPolygon).toBe(built.recipe.footprintPolygon);
    expect(seed.recipe.floors).toBe(built.recipe.floors);
  });

  it("prefers solved gross area over plate × floor count on varying massing", async () => {
    const built = await design(
      "Design a ten-storey office tower on a two-storey podium, about 12,000 m².",
    );
    expect(built.spec.massing.strategy.value).toBe("podium-tower");

    const seed = seedBuildingFromGeneratedDesign(built);
    const q = envelopeQuantities(seed.recipe);

    // The podium plate is larger than the tower plate, so plate × floors
    // over-counts; the solved sum is the honest denominator.
    expect(q.derivedFloorAreaSqm).toBeGreaterThan(q.intensityFloorAreaSqm);
    expect(q.intensityFloorAreaSqm).toBe(built.metrics.grossAreaSqm);
  });
});

describe("scenarioInputsFromSeed", () => {
  it("derives retrofit-engine inputs from the seed and solved metrics", async () => {
    const built = await design(OFFICE_PROMPT);
    const seed = seedBuildingFromGeneratedDesign(built);
    const inputs = scenarioInputsFromSeed(seed, built.metrics);

    expect(inputs.totalFloorArea).toBe(built.metrics.grossAreaSqm);
    expect(inputs.footprintArea).toBeCloseTo(
      envelopeQuantities(seed.recipe).planAreaSqm,
      10,
    );
    expect(inputs.footprintArea).toBeGreaterThan(0);
    expect(inputs.roofType).toBe("flat");
    expect(inputs.sidoPrefix).toBe("11");
  });

  it("takes footprint area from the real polygon, not the bounding box", async () => {
    const built = await design(
      "Design a five-storey office building around a courtyard, about 6,000 m².",
    );
    expect(built.spec.massing.strategy.value).toBe("courtyard");

    const seed = seedBuildingFromGeneratedDesign(built);
    const inputs = scenarioInputsFromSeed(seed, built.metrics);

    // The courtyard void is not roof and is not floor.
    expect(inputs.footprintArea).toBeLessThan(
      seed.recipe.footprintWidth * seed.recipe.footprintDepth,
    );
  });

  it("carries the regional prefix through to the HDD lookup", async () => {
    const built = await design(
      "Design a six-storey office building in Busan of about 7,200 m².",
    );
    const seed = seedBuildingFromGeneratedDesign(built);
    expect(scenarioInputsFromSeed(seed, built.metrics).sidoPrefix).toBe("26");
  });
});

describe("site region detection", () => {
  it("does not invent a region from a prompt that names no place", async () => {
    const bare = await design("Create a four-storey research building.");
    expect(bare.spec.site.region).toBeUndefined();
  });

  it("accepts Korean place names", async () => {
    const { data: spec }: { data: BuildingSpec } =
      await provider.generateBuilding({
        prompt: "제주에 5층 오피스 건물을 설계해줘. office, five storeys.",
        seed: seedFromPrompt("jeju office"),
      });
    expect(spec.site.region?.value.sigunguCd).toBe("50");
    expect(spec.site.region?.value.label).toBe("제주");
  });
});
