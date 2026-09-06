// The grade badge renders a bare "1+++". This is the sentence that says what
// that is, and these tests check the sentence against the engine rather than
// checking that some words appear in it.
//
// Three claims a reader cannot infer from the frame: the grade is a KOREAN
// 건축물 에너지효율등급 on a US clinic and a Dutch apartment; it is struck on
// PRIMARY energy, not the site kWh/m² printed beside it; and it is read off
// the residential or non-residential threshold table, which on the apartment
// is the wrong one of the two.

import { describe, it, expect } from "vitest";
import { gradeBasisText } from "../reference-energy";
import { referenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { calculateHeatLoss } from "@/lib/energy/heat-loss";
import { calculateAnnualDemand } from "@/lib/energy/annual-demand";
import { getClimateData } from "@/lib/energy/climate-data";
import {
  deliveredFromDemand,
  buildingTypeFromMaterials,
} from "@/lib/energy/delivered-from-demand";
import { calculateEfficiencyRating } from "@/lib/compliance/efficiency-rating";
import type { ReferenceBuildingId } from "@/lib/reference-buildings/manifest";

function run(id: ReferenceBuildingId) {
  const energy = referenceBuildingEnergyInputs(id)!;
  const climate = getClimateData(energy.climate.sigunguCd);
  const heatLoss = calculateHeatLoss(energy.materials, energy.recipe, climate);
  const demand = calculateAnnualDemand(heatLoss, energy.materials, energy.recipe, climate);
  const q = envelopeQuantities(energy.recipe);
  const rating = calculateEfficiencyRating(
    deliveredFromDemand(demand),
    q.intensityFloorAreaSqm,
    buildingTypeFromMaterials(energy.materials),
  );
  const sentence = gradeBasisText(
    energy,
    rating.grade,
    rating.primaryEnergyPerArea,
    demand.demandPerSqm,
    false,
  );
  return { energy, demand, rating, sentence };
}

describe("the grade sentence reproduces the numbers it explains", () => {
  for (const id of ["bs-medical-dental-clinic", "schependomlaan"] as const) {
    it(`${id}: the primary and site figures it quotes are the engine's own`, () => {
      const { demand, rating, sentence } = run(id);

      const quotedGrade = sentence.match(/^Grade (\S+) is a Korean/);
      const quotedPrimary = sentence.match(/on ([\d,.]+) kWh\/m²·yr of PRIMARY energy/);
      const quotedSite = sentence.match(/not the ([\d,.]+) kWh\/m²·yr of site demand/);
      expect(quotedGrade).not.toBeNull();
      expect(quotedPrimary).not.toBeNull();
      expect(quotedSite).not.toBeNull();

      expect(quotedGrade![1]).toBe(rating.grade);
      expect(Number(quotedPrimary![1].replace(/,/g, ""))).toBeCloseTo(
        rating.primaryEnergyPerArea,
        1,
      );
      expect(Number(quotedSite![1].replace(/,/g, ""))).toBeCloseTo(demand.demandPerSqm, 1);

      // The whole point of the sentence: the two numbers are different, and
      // the badge sits beside the smaller one.
      expect(rating.primaryEnergyPerArea).not.toBeCloseTo(demand.demandPerSqm, 0);
    });

    it(`${id}: it names the assumed climate and cites the assumption`, () => {
      const { energy, sentence } = run(id);
      expect(sentence).toContain(`Climate is ${energy.climate.labelEn}`);
      expect(sentence).toContain(energy.climate.assumptionId);
      expect(energy.climate.assumptionId).toBe("A-CLIMATE");
      // Neither building is in Korea, and the grade is Korean.
      expect(sentence).toContain("Korean 건축물 에너지효율등급");
    });
  }

  it("the Clinic's threshold table agrees with its use code, and the sentence says so", () => {
    const { energy, sentence } = run("bs-medical-dental-clinic");
    // 09000 = 의료시설. A clinic really is non-residential.
    expect(energy.recipe.mainPurpsCd).toBe("09000");
    expect(sentence).toContain("agrees with its use code 09000");
    expect(sentence).not.toContain("one band lower");
  });

  it("the apartment's does NOT, and the sentence declares the band it costs", () => {
    const { energy, rating, sentence } = run("schependomlaan");
    // 02000 = 공동주택. A 10-dwelling apartment block.
    expect(energy.recipe.mainPurpsCd).toBe("02000");
    expect(buildingTypeFromMaterials(energy.materials)).toBe("non-residential");
    expect(sentence).toContain("which is residential");
    expect(sentence).toContain("one band lower");

    // And that claim is checkable: re-grade the same primary energy on the
    // residential table and confirm it really is a band worse. A sentence
    // that merely SAID "one band lower" would pass a substring test while
    // being false.
    const q = envelopeQuantities(energy.recipe);
    const climate = getClimateData(energy.climate.sigunguCd);
    const heatLoss = calculateHeatLoss(energy.materials, energy.recipe, climate);
    const demand = calculateAnnualDemand(heatLoss, energy.materials, energy.recipe, climate);
    const asResidential = calculateEfficiencyRating(
      deliveredFromDemand(demand),
      q.intensityFloorAreaSqm,
      "residential",
    );
    expect(rating.grade).toBe("1+++");
    expect(asResidential.grade).toBe("1++");
    expect(asResidential.primaryEnergyPerArea).toBeCloseTo(rating.primaryEnergyPerArea, 6);
  });

  it("the Korean sentence carries the same grade and the same two figures", () => {
    const energy = referenceBuildingEnergyInputs("schependomlaan")!;
    const { rating, demand } = run("schependomlaan");
    const ko = gradeBasisText(
      energy,
      rating.grade,
      rating.primaryEnergyPerArea,
      demand.demandPerSqm,
      true,
    );
    expect(ko).toContain(`${rating.grade} 등급`);
    expect(ko).toContain("대한민국 건축물 에너지효율등급");
    expect(ko).toContain(energy.climate.assumptionId);
    const primary = ko.match(/1차에너지 ([\d,.]+) kWh\/m²·yr/);
    expect(Number(primary![1].replace(/,/g, ""))).toBeCloseTo(rating.primaryEnergyPerArea, 1);
    expect(ko).toContain("한 등급 아래");
  });
});
