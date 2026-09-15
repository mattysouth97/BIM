import { resolveClimateRegion } from "@/lib/energy/climate-region";
import { describe, expect, it } from "vitest";
import { inferMaterialProperties } from "../material-inference";
import type { BrTitleInfo } from "../types";
import { LIGHTING_DEFAULTS } from "../korean-building-codes";
import { modeledLightingLoad } from "../energy/lighting-load";
import { buildEndUseLoads, endUseAssumptions } from "../energy/end-uses";
import { referenceBuildingEnergyInputs } from "../reference-buildings/energy-inputs";
import { calculateAnnualDemand } from "../energy/annual-demand";
import { calculateHeatLoss } from "../energy/heat-loss";
import { SEOUL_CLIMATE } from "../energy/climate-data";
import { applyPhaseToMaterials } from "../bim/phases/apply-phase";
import { useMaterialStore } from "@/store/material-store";

describe("inferred lighting provenance", () => {
  it.each(["14000", "02000", "unknown", ""])("%s: the assumption reproduces the applied LPD", (mainPurpsCd) => {
    const materials = inferMaterialProperties({ mainPurpsCd, pmsDay: "20000101" } as BrTitleInfo, []);
    const provenance = materials.lighting.lpdProvenance!;
    expect(provenance.source).toBe("use_code_default");
    if (provenance.source !== "use_code_default") throw new Error("missing default provenance");
    const useCode = LIGHTING_DEFAULTS[mainPurpsCd] ? mainPurpsCd : "default";
    expect(provenance.useCode).toBe(useCode);
    const quoted = /조명전력밀도 ([\d.]+) W\/m²/.exec(provenance.assumption);
    expect(Number(quoted![1])).toBe(materials.lighting.lightingPowerDensity);
    expect(materials.lighting.lightingPowerDensity).toBe(LIGHTING_DEFAULTS[useCode].lpd);
    const load = modeledLightingLoad({ materials, conditionedFloorAreaSqm: 100, mainPurpsCd });
    expect(load.provenance.lpdProvenance).toEqual(provenance);
  });

  it("carries LPD and missing operating hours as separate end-use assumptions", () => {
    const materials = inferMaterialProperties({ mainPurpsCd: "unknown", pmsDay: "20000101" } as BrTitleInfo, []);
    const recipe = { ...referenceBuildingEnergyInputs("fzk-haus")!.recipe, mainPurpsCd: "unknown" };
    const demand = calculateAnnualDemand(calculateHeatLoss(materials, recipe, SEOUL_CLIMATE), materials, recipe, SEOUL_CLIMATE);
    const assumptions = endUseAssumptions(buildEndUseLoads({ climateRegion: resolveClimateRegion({ sigunguCd: "11" }), materials, recipe, demand }));
    expect(assumptions.find((a) => a.assumptionId === "A-LIGHTING-LPD-DEFAULT")?.assumption)
      .toBe(materials.lighting.lpdProvenance!.source === "use_code_default" ? materials.lighting.lpdProvenance!.assumption : "");
    expect(assumptions.some((a) => a.assumptionId === "A-LIGHTING-HOURS-DEFAULT")).toBe(true);
  });

  it("an LPD edit replaces its provenance, while an unrelated edit preserves it", () => {
    const pk = "lpd-provenance-test";
    const materials = inferMaterialProperties({ mainPurpsCd: "14000", pmsDay: "20000101" } as BrTitleInfo, []);
    useMaterialStore.getState().setProperties(pk, materials);
    useMaterialStore.getState().overrideProperty(pk, "envelope.roof.uValue", 0.2);
    expect(useMaterialStore.getState().properties[pk].lighting.lpdProvenance).toEqual(materials.lighting.lpdProvenance);
    useMaterialStore.getState().overrideProperty(pk, "lighting.lightingPowerDensity", 7);
    expect(useMaterialStore.getState().properties[pk].lighting.lpdProvenance).toEqual({ source: "user_input" });
  });

  it("a retrofit target does not retain the old default or claim user-entered measurements", () => {
    const materials = inferMaterialProperties({ mainPurpsCd: "14000", pmsDay: "20000101" } as BrTitleInfo, []);
    const after = applyPhaseToMaterials(materials, "retrofit", ["lighting-led-smart"]);
    const provenance = after.lighting.lpdProvenance!;
    expect(provenance.source).toBe("retrofit_target");
    if (provenance.source !== "retrofit_target") throw new Error("missing target provenance");
    expect(Number(/조명전력밀도 ([\d.]+) W\/m²/.exec(provenance.assumption)![1])).toBe(after.lighting.lightingPowerDensity);
  });
});
