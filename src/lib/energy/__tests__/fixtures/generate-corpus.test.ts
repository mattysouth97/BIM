// src/lib/energy/__tests__/fixtures/generate-corpus.test.ts
// One-shot corpus generator — run once to write golden-corpus.json.
// NOT part of the normal CI test suite (excluded by vitest config pattern).
// Run manually: pnpm vitest run src/lib/energy/__tests__/fixtures/generate-corpus.test.ts

import { describe, it } from "vitest";
import { writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

import { generateGoldenCorpus } from "./golden-corpus-generator";
import { calculateHeatLoss } from "../../heat-loss";
import { calculateAnnualDemand } from "../../annual-demand";
import { SEOUL_CLIMATE } from "../../climate-data";

describe("golden corpus generator (run once to emit JSON)", () => {
  it("generates golden-corpus.json with 20 samples", () => {
    const samples = generateGoldenCorpus();

    const corpus = samples.map((s) => {
      const heatLoss = calculateHeatLoss(s.materials, s.recipe, SEOUL_CLIMATE);
      const demand = calculateAnnualDemand(heatLoss, s.materials, s.recipe, SEOUL_CLIMATE);

      return {
        name: s.name,
        category: s.category,
        recipe: s.recipe,
        expected: {
          totalHeatLoss: heatLoss.totalHeatLoss,
          heatingDemand: demand.heatingDemand,
          coolingDemand: demand.coolingDemand,
          totalDemand: demand.totalDemand,
        },
      };
    });

    const outPath = join(
      fileURLToPath(new URL(".", import.meta.url)),
      "golden-corpus.json"
    );
    writeFileSync(outPath, JSON.stringify(corpus, null, 2), "utf8");

    console.log(`\nWrote ${corpus.length} samples to golden-corpus.json`);
    corpus.forEach((c) => {
      console.log(
        `  ${c.name.padEnd(32)} totalDemand=${String(Math.round(c.expected.totalDemand)).padStart(9)} kWh/yr  heatLoss=${String(Math.round(c.expected.totalHeatLoss)).padStart(8)} W`
      );
    });
  });
});
