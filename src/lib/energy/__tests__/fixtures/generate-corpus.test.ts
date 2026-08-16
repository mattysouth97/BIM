// src/lib/energy/__tests__/fixtures/generate-corpus.test.ts
// P2-05 — real smoke test of the golden-corpus generator (was a skipped
// file-emission script masquerading as a test). No filesystem side effects:
// it asserts the generator produces well-formed samples whose energy model
// runs, which is the behavior we actually care about in CI.
//
// To (re)emit the golden-corpus.json fixture, run the standalone script
// build-corpus.mts — not this test.

import { describe, it, expect } from "vitest";
import { generateGoldenCorpus } from "./golden-corpus-generator";
import { calculateHeatLoss } from "../../heat-loss";
import { calculateAnnualDemand } from "../../annual-demand";
import { SEOUL_CLIMATE } from "../../climate-data";

describe("generateGoldenCorpus (P2-05 smoke test)", () => {
  const samples = generateGoldenCorpus();

  it("produces a non-empty corpus of well-formed samples", () => {
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      expect(typeof s.name).toBe("string");
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.materials).toBeDefined();
      expect(s.recipe).toBeDefined();
    }
  });

  it("every sample runs through the energy model to a positive total demand", () => {
    for (const s of samples) {
      const heatLoss = calculateHeatLoss(s.materials, s.recipe, SEOUL_CLIMATE);
      const demand = calculateAnnualDemand(heatLoss, s.materials, s.recipe, SEOUL_CLIMATE);
      expect(heatLoss.totalHeatLoss).toBeGreaterThan(0);
      expect(demand.totalDemand).toBeGreaterThan(0);
      expect(Number.isFinite(demand.demandPerSqm)).toBe(true);
    }
  });
});
