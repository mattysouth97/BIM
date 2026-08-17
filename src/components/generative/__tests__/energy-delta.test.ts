// src/components/generative/__tests__/energy-delta.test.ts
//
// The studio's design-vs-design energy comparison.
//
// The delta strip is the one number in the panel that is not a level, so it
// gets its own pure test: both sides must come from the same engine, the sign
// must mean "current minus previous", and a comparison with a missing half must
// refuse rather than half-report.

import { describe, it, expect, beforeAll } from "vitest";

import {
  designEnergyDelta,
  designEnergySummary,
  formatSignedDelta,
} from "../energy-delta";
import { buildDesign } from "@/lib/generative/build";
import { seedBuildingFromGeneratedDesign } from "@/lib/generative/energy/seed-from-design";
import { HeuristicReasoningProvider } from "@/lib/generative/provider/heuristic-provider";
import type { GeneratedBuildingSeed } from "@/lib/generative/energy/seed-from-design";

const provider = new HeuristicReasoningProvider();

async function seedFor(prompt: string, seed: number, generationId: string) {
  const { data: spec } = await provider.generateBuilding({ prompt, seed });
  const built = buildDesign({ spec, buildingPk: "generated", generationId });
  return seedBuildingFromGeneratedDesign({
    spec,
    recipe: built.recipe,
    metrics: built.metrics,
    generationId,
  });
}

let small: GeneratedBuildingSeed;
let tall: GeneratedBuildingSeed;

beforeAll(async () => {
  small = await seedFor(
    "Create a three-story office building, approximately 2,000 m2, with a central core.",
    4242,
    "GEN-4242",
  );
  tall = await seedFor(
    "Create a nine-story office building, approximately 12,000 m2, with a central core.",
    4242,
    "GEN-4242.1",
  );
}, 120_000);

describe("designEnergySummary", () => {
  it("returns the engine's own demand for a seeded design", () => {
    const summary = designEnergySummary(small);
    expect(summary).not.toBeNull();
    if (!summary) return;

    expect(summary.floorAreaSqm).toBeGreaterThan(0);
    expect(summary.heatLossW).toBeGreaterThan(0);
    expect(summary.totalDemandKwh).toBeGreaterThan(0);
    // The engine's intensity, not a re-derived one.
    expect(summary.euiKwhPerSqm).toBeCloseTo(
      summary.totalDemandKwh / summary.floorAreaSqm,
      6,
    );
    expect(summary.heatingDemandKwh + summary.coolingDemandKwh).toBeCloseTo(
      summary.totalDemandKwh,
      6,
    );
  });

  it("is deterministic — the same design gives the same numbers", () => {
    expect(designEnergySummary(small)).toEqual(designEnergySummary(small));
  });

  it("refuses a design with no floor area rather than inventing an intensity", () => {
    const empty = {
      materials: small.materials,
      recipe: {
        ...small.recipe,
        officialFloorAreaSqm: 0,
        floors: [],
        footprintWidth: 0,
        footprintDepth: 0,
        footprintPolygon: undefined,
      },
    };
    expect(designEnergySummary(empty)).toBeNull();
  });
});

describe("designEnergyDelta", () => {
  it("reports current minus previous", () => {
    const delta = designEnergyDelta(small, tall);
    expect(delta).not.toBeNull();
    if (!delta) return;

    expect(delta.totalDemandKwh).toBeCloseTo(
      delta.current.totalDemandKwh - delta.previous.totalDemandKwh,
      6,
    );
    expect(delta.euiKwhPerSqm).toBeCloseTo(
      delta.current.euiKwhPerSqm - delta.previous.euiKwhPerSqm,
      6,
    );
    // The taller design is the bigger building: total demand grew.
    expect(delta.floorAreaSqm).toBeGreaterThan(0);
    expect(delta.totalDemandKwh).toBeGreaterThan(0);
  });

  it("is antisymmetric — swapping the sides flips every sign", () => {
    const forward = designEnergyDelta(small, tall);
    const backward = designEnergyDelta(tall, small);
    if (!forward || !backward) throw new Error("both comparisons should exist");

    expect(backward.totalDemandKwh).toBeCloseTo(-forward.totalDemandKwh, 6);
    expect(backward.euiKwhPerSqm).toBeCloseTo(-forward.euiKwhPerSqm, 6);
    expect(backward.heatingDemandKwh).toBeCloseTo(-forward.heatingDemandKwh, 6);
  });

  it("reports a flat zero when nothing changed", () => {
    const delta = designEnergyDelta(small, small);
    if (!delta) throw new Error("a design should compare against itself");

    expect(delta.totalDemandKwh).toBe(0);
    expect(delta.euiKwhPerSqm).toBe(0);
    expect(delta.euiFraction).toBe(0);
  });

  it("expresses the EUI change as a fraction of the predecessor", () => {
    const delta = designEnergyDelta(small, tall);
    if (!delta) throw new Error("expected a delta");
    expect(delta.euiFraction).toBeCloseTo(
      delta.euiKwhPerSqm / delta.previous.euiKwhPerSqm,
      6,
    );
  });

  it("returns null when either side is missing or unmodellable", () => {
    expect(designEnergyDelta(null, tall)).toBeNull();
    expect(designEnergyDelta(small, null)).toBeNull();
    expect(
      designEnergyDelta(small, {
        materials: tall.materials,
        recipe: {
          ...tall.recipe,
          officialFloorAreaSqm: 0,
          floors: [],
          footprintWidth: 0,
          footprintDepth: 0,
          footprintPolygon: undefined,
        },
      }),
    ).toBeNull();
  });
});

describe("formatSignedDelta", () => {
  it("always carries a sign so a delta never reads as a level", () => {
    expect(formatSignedDelta(12.34)).toBe("+12.3");
    expect(formatSignedDelta(-4)).toBe("−4.0");
    expect(formatSignedDelta(0)).toBe("±0.0");
    expect(formatSignedDelta(0.04)).toBe("±0.0");
    expect(formatSignedDelta(-1234, 0)).toBe("−1234");
  });
});
