import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ReferenceRetrofitPanel, retrofitBasisLines } from "../reference-retrofit";
import { referenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";
import { REFERENCE_BUILDING_IDS, type ReferenceBuildingId } from "@/lib/reference-buildings/manifest";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useScenarioStore } from "@/store/scenario-store";
import { useAppStore } from "@/store/app-store";
import { measureDisplayName } from "@/lib/retrofit/measure-claim";
import type { RoofPlaneSet } from "@/lib/retrofit/pv-layout";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";

beforeEach(() => {
  cleanup();
  useAppStore.setState({ language: "en" });
  useMaterialStore.setState({ properties: {} });
  useRecipeStore.setState({ baseRecipes: {}, overrides: {} });
  useScenarioStore.setState({ capexBudgetKrw: null, roofPlanes: null, appliedMeasureIds: [], selectedMeasureIds: [], buildingInputs: null });
});
function seed(id: ReferenceBuildingId) {
  const energy = referenceBuildingEnergyInputs(id)!;
  useMaterialStore.setState({ properties: { [energy.buildingPk]: energy.materials } });
  useRecipeStore.setState({ baseRecipes: { [energy.buildingPk]: energy.recipe } });
  const path = join(process.cwd(), "public/reference-buildings", id, "roof-planes.json");
  useScenarioStore.setState({ roofPlanes: existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as RoofPlaneSet : null });
  const quantities = envelopeQuantities(energy.recipe);
  useScenarioStore.getState().setBuildingInputs({ buildingPk: energy.buildingPk, totalFloorArea: quantities.intensityFloorAreaSqm, footprintArea: quantities.planAreaSqm, roofType: energy.roof?.type ?? "flat", sidoPrefix: energy.climate.sigunguCd });
  useScenarioStore.setState({ appliedMeasureIds: [], selectedMeasureIds: [] });
  return energy;
}

describe("reference retrofit selection and evidence", () => {
  for (const id of REFERENCE_BUILDING_IDS) {
    const energyInputs = referenceBuildingEnergyInputs(id);
    if (!energyInputs) continue; // A model without validated energy inputs has no retrofit panel.
    it(`${id}: candidate count, chosen work and paired values agree`, () => {
      const energy = seed(id);
      const { container } = render(<ReferenceRetrofitPanel energy={energy} locale="en" />);
      const chips = container.querySelectorAll<HTMLElement>("[data-measure-chip]");
      const summary = within(container).getByTestId("reference-model-retrofit-summary").textContent!;
      expect(Number(summary.match(/of (\d+) candidates/)![1])).toBe(chips.length);
      expect(summary).toContain("0 chosen");
      const before = within(container).getByTestId("retrofit-site-before").textContent;
      expect(within(container).getByTestId("retrofit-site-after").textContent).toBe(before);
      if (chips.length === 0) {
        expect(within(container).getByTestId("reference-model-retrofit-empty").textContent).toContain("No retrofit candidates can be evaluated");
        return;
      }
      fireEvent.click(chips[0]);
      expect(useScenarioStore.getState().appliedMeasureIds).toEqual([chips[0].dataset.measureChip]);
      expect(chips[0].getAttribute("aria-pressed")).toBe("true");
      expect(within(container).getByTestId("reference-model-retrofit-summary").textContent).toContain("1 chosen");
      expect(container.textContent).not.toMatch(/NPV|IRR|CAPEX → ROI/);
    });
    it(`${id}: retains building-specific evidence, caveats and the unavailable corpus slot`, () => {
      const energy = seed(id);
      const { container } = render(<ReferenceRetrofitPanel energy={energy} locale="en" />);
      const evidence = within(container).getByTestId("retrofit-verification").textContent!;
      for (const assumption of energy.assumptions) expect(evidence).toContain(assumption.assumes);
      expect(evidence).toContain("not been calibrated to bills");
      expect(within(container).getByTestId("retrofit-corpus-position").getAttribute("data-status")).toBe("unavailable");
      expect(within(container).getByTestId("retrofit-capital-verification").textContent).toContain("installation quotes");
      const lines = retrofitBasisLines(energy, false).join(" ");
      if (energy.roof) expect(lines).toContain(energy.roof.read);
      expect(lines).toContain("Isolated measure savings are not summed");
      expect(lines).toContain("capped at annual electric demand");
      expect(lines).toContain("SHGC is left unchanged");
    });
  }
  it("with no roof data generates no new PV capacity", () => {
    const energy = seed("bs-medical-dental-clinic");
    useScenarioStore.setState({ roofPlanes: null });
    const { container } = render(<ReferenceRetrofitPanel energy={energy} locale="en" />);
    expect(container.querySelector('[data-measure-chip^="solar-pv"]')).toBeNull();
    expect(within(container).getByTestId("reference-pv-unavailable").textContent).toContain("no PV capacity is priced");
  });
  it("uses localized names and chosen state on Korean pages", () => {
    useAppStore.setState({ language: "ko" });
    const energy = seed("bs-medical-dental-clinic");
    const { container } = render(<ReferenceRetrofitPanel energy={energy} locale="ko" />);
    for (const chip of container.querySelectorAll<HTMLElement>("[data-measure-chip]")) {
      expect(chip.textContent).toContain(measureDisplayName(chip.dataset.measureChip!, "ko", ""));
    }
    expect(within(container).getByTestId("retrofit-corpus-position").textContent).toContain("아직 제공되지 않습니다");
  });
});
