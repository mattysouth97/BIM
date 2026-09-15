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
  buildingTypeForGrade,
  gradeTableIsFromOccupancy,
  isResidentialOccupancy,
} from "@/lib/energy/delivered-from-demand";
import { buildEndUseLoads } from "@/lib/energy/end-uses";
import { calculateSystemBreakdown } from "@/lib/energy/system-breakdown";
import { calculateEfficiencyRating } from "@/lib/compliance/efficiency-rating";
import {
  REFERENCE_BUILDING_IDS,
  type ReferenceBuildingId,
} from "@/lib/reference-buildings/manifest";

function run(id: ReferenceBuildingId) {
  const energy = referenceBuildingEnergyInputs(id)!;
  const climate = getClimateData(energy.climate.sigunguCd);
  const heatLoss = calculateHeatLoss(energy.materials, energy.recipe, climate);
  const demand = calculateAnnualDemand(heatLoss, energy.materials, energy.recipe, climate);
  const q = envelopeQuantities(energy.recipe);
  const sitePerSqm = calculateSystemBreakdown(energy.materials, energy.recipe, climate).total / q.intensityFloorAreaSqm;
  const rating = calculateEfficiencyRating(
    deliveredFromDemand(buildEndUseLoads({ demand, materials: energy.materials, recipe: energy.recipe })),
    q.intensityFloorAreaSqm,
    buildingTypeForGrade(energy.materials, energy.recipe.mainPurpsCd),
  );
  const sentence = gradeBasisText(
    energy,
    rating.grade,
    rating.primaryEnergyPerArea,
    sitePerSqm,
    false,
  );
  return { energy, demand, rating, sentence, sitePerSqm };
}

describe("the grade sentence reproduces the numbers it explains", () => {
  it.each(REFERENCE_BUILDING_IDS)("%s: independently re-derives the primary total by end use", (id) => {
    const { energy, demand, rating } = run(id);
    const code = energy.recipe.mainPurpsCd;
    const area = envelopeQuantities(energy.recipe).intensityFloorAreaSqm;
    // These seven source models use residential, office, or generic ratios.
    // Pin the assumptions explicitly: no call to the production split builder
    // in this expected calculation can accidentally validate its own mistake.
    const dwelling = code === "01000" || code === "02000";
    const office = code === "14000";
    const hours = dwelling ? 2920 : office ? 4380 : 3500;
    const auxToHvac = dwelling ? (0.25 + 0.18) / 0.50 : office ? (0.10 + 0.10) / 0.55 : (0.12 + 0.18) / 0.42;
    const lighting = energy.materials.lighting.lightingPowerDensity * area * hours / 1000;
    const fuel = energy.materials.hvac.heating.fuelType;
    const heatingFactor = fuel === "district-heat" ? 0.728 : fuel === "electric" || fuel === "heat-pump" ? 2.75 : 1.1;
    const coolingFactor = energy.materials.hvac.cooling.systemType === "district" ? 0.937 : 2.75;
    const expected = (demand.heatingDemand * heatingFactor + demand.coolingDemand * coolingFactor
      + (lighting + demand.totalDemand * auxToHvac) * 2.75) / area;
    expect(rating.primaryEnergyPerArea).toBeCloseTo(expected, 8);
  });
  for (const id of ["bs-medical-dental-clinic", "schependomlaan"] as const) {
    it(`${id}: the primary and site figures it quotes are the engine's own`, () => {
      const { sitePerSqm, rating, sentence } = run(id);

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
      expect(Number(quotedSite![1].replace(/,/g, ""))).toBeCloseTo(sitePerSqm, 1);

      // The whole point of the sentence: the two numbers are different, and
      // the badge sits beside the smaller one.
      expect(rating.primaryEnergyPerArea).not.toBeCloseTo(sitePerSqm, 0);
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

  it("the Clinic falls back to occupancy, because 09000 is a code this app cannot classify", () => {
    const { energy, sentence } = run("bs-medical-dental-clinic");
    // 의료시설. Genuinely non-residential, but `ledgerUseCategory` returns
    // "default" for it, so the use code is not a decision and the density
    // heuristic still picks the table — which is the one case left to
    // disclose now that the mismatch itself is fixed.
    expect(energy.recipe.mainPurpsCd).toBe("09000");
    expect(gradeTableIsFromOccupancy(energy.recipe.mainPurpsCd)).toBe(true);
    expect(sentence).toContain("does not classify");
    expect(sentence).toContain("picked by density, not by use");
  });

  it("every dwelling is scored on the residential table its use code names", () => {
    // Three of the four published buildings are dwellings and all three were
    // graded on the 비주거용 table until 2026-09-06, each reading one band
    // better than its use earns.
    for (const id of REFERENCE_BUILDING_IDS) {
      const energy = referenceBuildingEnergyInputs(id as ReferenceBuildingId)!;
      const code = energy.recipe.mainPurpsCd;
      if (code !== "01000" && code !== "02000") continue;

      expect(buildingTypeForGrade(energy.materials, code)).toBe("residential");
      // And not by luck: its density alone would still say non-residential.
      expect(isResidentialOccupancy(energy.materials)).toBe(false);

      const { sentence } = run(id as ReferenceBuildingId);
      expect(sentence).toContain(`chosen by its use code ${code}`);
      expect(sentence).toContain("scored on the residential table");
      // The disclosure it used to carry is gone, because the thing it
      // disclosed no longer happens.
      expect(sentence).not.toContain("one band lower");
      expect(sentence).not.toContain("picked by density");
    }
  });

  it("grades include explicit lighting and electric DHW/plug loads", () => {
    // The old split added 15% HVAC to electricity and 10% to gas.
    // It omitted much of the DHW/plug electricity now scaled from the HVAC
    // profile, and never read LPD. The added electricity carries factor 2.75;
    // the independently reconstructed primary totals below explain the bands.
    expect(run("schependomlaan").rating.grade).toBe("2");
    expect(run("duplex-apartment").rating.grade).toBe("7");
    expect(run("fzk-haus").rating.grade).toBe("7");
    expect(run("bs-medical-dental-clinic").rating.grade).toBe("4");
  });

  it("the Korean sentence carries the same grade and the same two figures", () => {
    const energy = referenceBuildingEnergyInputs("schependomlaan")!;
    const { rating, sitePerSqm } = run("schependomlaan");
    const ko = gradeBasisText(
      energy,
      rating.grade,
      rating.primaryEnergyPerArea,
      sitePerSqm,
      true,
    );
    expect(ko).toContain(`${rating.grade} 등급`);
    expect(ko).toContain("대한민국 건축물 에너지효율등급");
    expect(ko).toContain(energy.climate.assumptionId);
    const primary = ko.match(/1차에너지 ([\d,.]+) kWh\/m²·yr/);
    expect(Number(primary![1].replace(/,/g, ""))).toBeCloseTo(rating.primaryEnergyPerArea, 1);
    expect(ko).toContain("주용도코드 02000 기준 주거용 기준표");
  });
});
