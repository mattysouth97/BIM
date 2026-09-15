import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENERGY_DATASET_LIMITATIONS, ENERGY_DATASET_SCHEMA_VERSION, referenceDatasetCatalogueCsv } from "../energy-dataset";
import { loadReferenceEnergyCatalogue } from "../energy-dataset-server";
import { referenceBuildingEnergyInputs } from "../energy-inputs";
import { runEnergyEngine } from "@/lib/retrofit/retrofit-delta";
import { climateFromRegion } from "@/lib/energy/climate-data";
import { resolveClimateRegion } from "@/lib/energy/climate-region";
import type { ReferenceBuildingId } from "../manifest";

const changelog = readFileSync("public/reference-buildings/CHANGELOG.md", "utf8");
const evidence = changelog.split(/\r?\n/).filter(line => /^\| (bs-medical|schependomlaan|duplex|fzk|kit|klassiqua|taltech)/.test(line))
  .map(line => line.split("|").slice(1, -1).map(cell => cell.trim()));

describe("published physics evidence", () => {
  it("reproduces every original baseline after figure recorded in the public changelog", async () => {
    const { datasets } = await loadReferenceEnergyCatalogue();
    expect(evidence).toHaveLength(7);
    expect(new Set(evidence.map(row => row[0])).size).toBe(7);
    for (const row of evidence) {
      const dataset = datasets.find(item => item.id === row[0]);
      expect(dataset, row[0]).toBeDefined();
      const modeled = dataset!.modeledEnergy!;
      expect(modeled.comparisonRating.grade).toBe(row[2]);
      expect(modeled.comparisonRating.primaryKWhPerM2Year.toFixed(6)).toBe(row[4]);
      expect((modeled.estimatedWholeBuilding.totalKWhPerYear / dataset!.modelInputs!.engineEnvelope.intensityFloorAreaSqm).toFixed(6)).toBe(row[6]);
      expect(modeled.comparisonRating.limitationIds).toEqual(["L-GRADE-SHARES", "L-SCREENING"]);
      expect(modeled.estimatedWholeBuilding.limitationIds).toEqual(["L-SITE-TOTAL"]);
      const inputs = referenceBuildingEnergyInputs(dataset!.id as ReferenceBuildingId)!;
      const region = resolveClimateRegion({ sigunguCd: inputs.climate.sigunguCd })!;
      const run = runEnergyEngine(inputs.materials, inputs.recipe, climateFromRegion(region), region);
      expect(modeled.wholeBuildingEmissions.totalTonnesCO2PerYear).toBe(run.co2.totalCO2);
      expect(modeled.wholeBuildingEmissions.kgCO2PerM2Year).toBe(run.co2.co2PerSqm);
    }
    expect(evidence.some(row => row[3] !== row[4])).toBe(true);
    for (const dataset of datasets) {
      expect(dataset.schemaVersion).toBe("2.0.0");
      expect(dataset.schemaVersion).toBe(ENERGY_DATASET_SCHEMA_VERSION);
      expect(dataset.changelogUrl).toBe("/reference-buildings/CHANGELOG.md");
    }
    expect(referenceDatasetCatalogueCsv(datasets)).toContain("/reference-buildings/CHANGELOG.md");
  });

  it("describes the retained estimates and annual PV boundary without retired fuel shares", () => {
    const limitations = Object.fromEntries(ENERGY_DATASET_LIMITATIONS.map(item => [item.id, item.text]));
    for (const id of ["L-GRADE-SHARES", "L-SITE-TOTAL", "L-CLIMATE"]) {
      expect(limitations[id]).not.toMatch(/adds 15% of HVAC total|sets district energy and renewable contribution to zero|does not read lighting power density/);
    }
    expect(limitations["L-SITE-TOTAL"]).toContain("ratio-estimated domestic hot water and plug loads");
    expect(limitations["L-GRADE-SHARES"]).toContain("capped at annual electric demand");
    expect(limitations["L-CLIMATE"]).toContain("Seoul fallback");
  });
});
