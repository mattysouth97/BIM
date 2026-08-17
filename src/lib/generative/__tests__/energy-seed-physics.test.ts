// End-to-end proof that the EXISTING energy engine runs on a generated design.
//
// prompt → BuildingSpec → solved geometry + recipe (buildDesign) → seed →
// calculateHeatLoss → calculateAnnualDemand → official efficiency rating, all
// with the real pure functions and no store, hook or component in between. If
// this passes, a generated building is energy-modellable by exactly the code
// path a ledger building uses.
//
// The plausibility band is NOT folklore. It is derived inside the test from
// what the ledger path (`seedBuildingFromLedger` → same physics) produces for a
// 2020+ office of the same floor area, storey count and climate: the two are
// the same building described two ways, so they must land in the same
// neighbourhood, and any hardcoded "offices use N kWh/m²" number would be a
// claim this repo has no source for.

import { describe, expect, it } from "vitest";

import { seedBuildingFromLedger } from "@/lib/building-seed";
import { calculateEfficiencyRating } from "@/lib/compliance/efficiency-rating";
import { calculateAnnualDemand } from "@/lib/energy/annual-demand";
import { SEOUL_CLIMATE } from "@/lib/energy/climate-data";
import {
  buildingTypeFromMaterials,
  deliveredFromDemand,
} from "@/lib/energy/delivered-from-demand";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { calculateHeatLoss } from "@/lib/energy/heat-loss";
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { BrTitleInfo } from "@/lib/types";

import { buildDesign } from "../build";
import type { BuildingMetrics } from "../generate/types";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { seedFromPrompt } from "../rng";
import {
  GENERATED_PERMIT_DAY,
  scenarioInputsFromSeed,
  seedBuildingFromGeneratedDesign,
} from "../energy/seed-from-design";

const provider = new HeuristicReasoningProvider();

const PROMPT =
  "Design a six-storey office building of about 7,200 m² with one basement.";

async function generatedSeed(prompt = PROMPT, generationId = "GEN-0001") {
  const { data: spec } = await provider.generateBuilding({
    prompt,
    seed: seedFromPrompt(prompt),
  });
  const built = buildDesign({ spec, buildingPk: generationId, generationId });
  const design = {
    spec,
    recipe: built.recipe,
    metrics: built.metrics,
    generationId,
  };
  return { design, seed: seedBuildingFromGeneratedDesign(design) };
}

/** The whole engine, called exactly as `useEnergyMetrics` calls it. */
function runEngine(materials: MaterialProperties, recipe: BuildingRecipe) {
  const totalFloorArea = envelopeQuantities(recipe).intensityFloorAreaSqm;
  const heatLoss = calculateHeatLoss(materials, recipe, SEOUL_CLIMATE);
  const demand = calculateAnnualDemand(
    heatLoss,
    materials,
    recipe,
    SEOUL_CLIMATE,
  );
  const rating = calculateEfficiencyRating(
    deliveredFromDemand(demand),
    totalFloorArea,
    buildingTypeFromMaterials(materials),
  );
  return { totalFloorArea, heatLoss, demand, rating };
}

/**
 * The comparator: the same building as a ledger record. A 2020+ office with
 * the design's floor area, storey counts and plate area, run through
 * `seedBuildingFromLedger` — the production ledger path, untouched.
 */
function ledgerReference(metrics: BuildingMetrics, planAreaSqm: number) {
  const title: BrTitleInfo = {
    mgmBldrgstPk: "REF-2020-OFFICE",
    bldNm: "Reference Office",
    platPlcNm: "",
    newPlatPlc: "",
    sigunguCd: "11",
    bjdongCd: "",
    platGbCd: "",
    bun: "",
    ji: "",
    mainPurpsCd: "14000",
    mainPurpsCdNm: "업무시설",
    etcPurps: "",
    strctCd: "11",
    strctCdNm: "철근콘크리트구조",
    etcStrct: "",
    grndFlrCnt: metrics.floorCount,
    ugrndFlrCnt: 1,
    totArea: metrics.grossAreaSqm,
    archArea: planAreaSqm,
    platArea: planAreaSqm * 2,
    bcRat: 0,
    vlRat: 0,
    useAprDay: "",
    pmsDay: GENERATED_PERMIT_DAY,
    stcnsDay: "",
    roofCd: "1",
    roofCdNm: "평지붕",
    heit: metrics.buildingHeightM,
    regstrGbCd: "",
    regstrGbCdNm: "",
    regstrKindCd: "",
    regstrKindCdNm: "",
  };

  const seeded = seedBuildingFromLedger(title, []);
  if (!seeded) throw new Error("ledger reference failed to seed");
  return runEngine(seeded.materials, seeded.recipe);
}

describe("generated design → existing energy engine", () => {
  it("produces finite, positive physics through the untouched engine", async () => {
    const { seed } = await generatedSeed();
    const { totalFloorArea, heatLoss, demand, rating } = runEngine(
      seed.materials,
      seed.recipe,
    );

    expect(totalFloorArea).toBeGreaterThan(0);

    for (const element of heatLoss.elements) {
      expect(Number.isFinite(element.hCoefficient)).toBe(true);
      expect(element.hCoefficient).toBeGreaterThanOrEqual(0);
      expect(element.area).toBeGreaterThan(0);
    }
    // Every envelope path the engine models is present — nothing silently 0'd.
    expect(heatLoss.elements.map((e) => e.element)).toEqual([
      "Walls",
      "Windows",
      "Roof",
      "Ground Floor",
      "Infiltration/Ventilation",
    ]);
    expect(heatLoss.totalHeatLoss).toBeGreaterThan(0);
    expect(heatLoss.totalHeatLossPerSqm).toBeGreaterThan(0);

    expect(demand.heatingDemand).toBeGreaterThan(0);
    expect(demand.coolingDemand).toBeGreaterThan(0);
    expect(Number.isFinite(demand.demandPerSqm)).toBe(true);
    expect(demand.demandPerSqm).toBeGreaterThan(0);

    // The official grade table, not an invented scale.
    expect(rating.primaryEnergyPerArea).toBeGreaterThan(0);
    expect([
      "1+++", "1++", "1+", "1", "2", "3", "4", "5", "6", "7",
    ]).toContain(rating.grade);
    // Office occupancy density must not be read as residential.
    expect(buildingTypeFromMaterials(seed.materials)).toBe("non-residential");
  });

  it("lands in the same band as the ledger path for an equivalent building", async () => {
    const { design, seed } = await generatedSeed();
    const generated = runEngine(seed.materials, seed.recipe);
    const reference = ledgerReference(
      design.metrics,
      envelopeQuantities(seed.recipe).planAreaSqm,
    );

    expect(reference.demand.demandPerSqm).toBeGreaterThan(0);

    // Same era, use, area and climate described two ways: the differences that
    // remain are real (solved facade and WWR vs era tables, polygon vs
    // estimated footprint), so a factor-of-two band is the honest tolerance —
    // wide enough not to encode either path's quirks, tight enough that a unit
    // error or a lost denominator fails it.
    const ratio = generated.demand.demandPerSqm / reference.demand.demandPerSqm;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2);

    // Design heat loss intensity likewise.
    const lossRatio =
      generated.heatLoss.totalHeatLossPerSqm /
      reference.heatLoss.totalHeatLossPerSqm;
    expect(lossRatio).toBeGreaterThan(0.5);
    expect(lossRatio).toBeLessThan(2);
  });

  it("is deterministic end to end", async () => {
    const first = await generatedSeed();
    const second = await generatedSeed();

    const a = runEngine(first.seed.materials, first.seed.recipe);
    const b = runEngine(second.seed.materials, second.seed.recipe);

    expect(a.demand).toEqual(b.demand);
    expect(a.heatLoss).toEqual(b.heatLoss);
    expect(a.rating.grade).toBe(b.rating.grade);
  });
});

describe("solved geometry actually reaches the physics", () => {
  it("moves window heat loss when the solved WWR changes", async () => {
    const { design } = await generatedSeed();

    const lowWwr = seedBuildingFromGeneratedDesign({
      ...design,
      metrics: { ...design.metrics, windowToWallRatio: 0.2 },
    });
    const highWwr = seedBuildingFromGeneratedDesign({
      ...design,
      metrics: { ...design.metrics, windowToWallRatio: 0.6 },
    });

    const low = runEngine(lowWwr.materials, lowWwr.recipe);
    const high = runEngine(highWwr.materials, highWwr.recipe);

    const windowLoss = (r: ReturnType<typeof runEngine>) =>
      r.heatLoss.elements.find((e) => e.element === "Windows")!;

    // Windows are the worst-insulated surface: more glass, more loss, and the
    // opaque wall it displaced loses less.
    expect(windowLoss(high).area).toBeGreaterThan(windowLoss(low).area * 2.5);
    expect(windowLoss(high).heatLoss).toBeGreaterThan(windowLoss(low).heatLoss);
    expect(high.heatLoss.totalHeatLoss).toBeGreaterThan(
      low.heatLoss.totalHeatLoss,
    );
    // And it carries all the way to the annual bill and the grade denominator.
    expect(high.demand.totalDemand).toBeGreaterThan(low.demand.totalDemand);
    expect(high.rating.primaryEnergyPerArea).toBeGreaterThan(
      low.rating.primaryEnergyPerArea,
    );
  });

  it("moves the whole model when the solved gross area changes", async () => {
    const { design } = await generatedSeed();
    const bigger = seedBuildingFromGeneratedDesign({
      ...design,
      metrics: { ...design.metrics, grossAreaSqm: design.metrics.grossAreaSqm * 2 },
    });

    const base = runEngine(
      seedBuildingFromGeneratedDesign(design).materials,
      seedBuildingFromGeneratedDesign(design).recipe,
    );
    const doubled = runEngine(bigger.materials, bigger.recipe);

    // Same envelope over twice the floor area ⇒ roughly half the intensity.
    expect(doubled.totalFloorArea).toBeCloseTo(base.totalFloorArea * 2, 6);
    expect(doubled.demand.demandPerSqm).toBeLessThan(base.demand.demandPerSqm);
  });

  it("feeds the retrofit engine the same floor area the physics used", async () => {
    const { design, seed } = await generatedSeed();
    const { totalFloorArea } = runEngine(seed.materials, seed.recipe);
    const inputs = scenarioInputsFromSeed(seed, design.metrics);

    // A retrofit payback computed against a different area than the baseline
    // demand would be quietly wrong; one number, both engines.
    expect(inputs.totalFloorArea).toBeCloseTo(totalFloorArea, 6);
    expect(inputs.footprintArea).toBeGreaterThan(0);
    expect(inputs.footprintArea).toBeLessThanOrEqual(inputs.totalFloorArea);

    // The wall area the retrofit cost model bills for is the solved facade.
    const wallArea = seed.materials.envelope.walls.reduce(
      (sum, w) => sum + w.surfaceArea,
      0,
    );
    expect(wallArea).toBeCloseTo(design.metrics.facadeAreaSqm, 6);
  });
});

describe("honest gaps", () => {
  it("carries no ledger key, so measured-consumption surfaces stay empty", async () => {
    const { seed } = await generatedSeed("Create a four-storey civic building.");

    // The pk is the design id, which no 건축물대장 API will ever match — the
    // actual-consumption and official-grade hooks null-guard on that.
    expect(seed.pk).toBe("GEN-0001");
    expect(seed.pk).not.toMatch(/^\d/);
  });

  it("discloses the Seoul climate default rather than inventing a site", async () => {
    const { design, seed } = await generatedSeed();

    expect(design.spec.site.region).toBeUndefined();
    expect(seed.sigunguCd).toBe("11");
    expect(scenarioInputsFromSeed(seed, design.metrics).sidoPrefix).toBe("11");
  });
});
