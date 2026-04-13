// src/lib/energy/__tests__/fixtures/build-corpus.mts
// Run with: npx tsx src/lib/energy/__tests__/fixtures/build-corpus.mts
// Computes golden outputs for all 20 corpus samples and writes golden-corpus.json.
// This script is intentionally NOT imported by the test suite — it is only run
// when you need to regenerate the corpus (e.g., after a deliberate engine change).

import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

// -- path aliases not available in tsx without extra config; use relative imports --
import { generateGoldenCorpus } from "./golden-corpus-generator.js";
import { calculateHeatLoss } from "../../heat-loss.js";
import { calculateAnnualDemand } from "../../annual-demand.js";
import { SEOUL_CLIMATE } from "../../climate-data.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const samples = generateGoldenCorpus();

const corpus = samples.map((s) => {
  const heatLoss = calculateHeatLoss(s.materials, s.recipe, SEOUL_CLIMATE);
  const demand = calculateAnnualDemand(heatLoss, s.materials, s.recipe, SEOUL_CLIMATE);

  return {
    name: s.name,
    category: s.category,
    recipe: s.recipe,
    expected: {
      totalHeatLoss:   heatLoss.totalHeatLoss,
      heatingDemand:   demand.heatingDemand,
      coolingDemand:   demand.coolingDemand,
      totalDemand:     demand.totalDemand,
    },
  };
});

const outPath = join(__dirname, "golden-corpus.json");
writeFileSync(outPath, JSON.stringify(corpus, null, 2), "utf8");

console.log(`Wrote ${corpus.length} samples to ${outPath}`);
corpus.forEach((c) => {
  console.log(
    `  ${c.name.padEnd(30)} totalDemand=${c.expected.totalDemand.toFixed(0).padStart(8)} kWh/yr  heatLoss=${c.expected.totalHeatLoss.toFixed(0).padStart(7)} W`
  );
});
