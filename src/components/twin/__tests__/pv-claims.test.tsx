import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MeasureChipRow } from "../measure-chip-row";
import { RetrofitDeltaStrip } from "../retrofit-delta-strip";
import { referenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";
import { REFERENCE_BUILDING_IDS } from "@/lib/reference-buildings/manifest";
import { layoutRoofPlanes, type RoofPlaneSet } from "@/lib/retrofit/pv-layout";
import { calculateSolarPotential } from "@/lib/retrofit/solar-potential";
import { DEFAULT_ECONOMIC_ASSUMPTIONS } from "@/lib/retrofit/cost-database";
import { useAppStore } from "@/store/app-store";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useScenarioStore } from "@/store/scenario-store";
import { useActiveBuildingStore } from "@/store/active-building-store";

afterEach(cleanup);

describe("PV claims on the work chip and before/after strip", () => {
  for (const id of REFERENCE_BUILDING_IDS) {
    for (const lang of ["ko", "en"] as const) {
      it(`${id} / ${lang}: capacity and panel surface area match the placed modules`, () => {
        const energy = referenceBuildingEnergyInputs(id)!;
        const planes = JSON.parse(readFileSync(join(process.cwd(), "public/reference-buildings", id, "roof-planes.json"), "utf8")) as RoofPlaneSet;
        const layout = layoutRoofPlanes(planes);
        const count = layout.planes.reduce((sum, plane) => sum + plane.modules.length, 0);
        const measure = calculateSolarPotential(1, energy.roof!.type, "seoul", 130, undefined, count * 0.4);
        useAppStore.setState({ language: lang });
        useActiveBuildingStore.setState({ buildingPk: energy.buildingPk, sigunguCd: energy.climate.sigunguCd });
        useMaterialStore.setState({ properties: { [energy.buildingPk]: energy.materials } });
        useRecipeStore.setState({ baseRecipes: { [energy.buildingPk]: energy.recipe }, overrides: {} });
        useScenarioStore.setState({
          roofPlanes: planes, appliedMeasureIds: [measure.id], selectedMeasureIds: [measure.id],
          buildingInputs: { buildingPk: energy.buildingPk, totalFloorArea: 1, footprintArea: 1, roofType: energy.roof!.type, sidoPrefix: "11" },
        });
        const { container } = render(<>
          <MeasureChipRow measures={[measure]} recommendedIds={[measure.id]} totalFloorAreaSqm={1} assumptions={DEFAULT_ECONOMIC_ASSUMPTIONS} />
          <RetrofitDeltaStrip />
        </>);
        const claim = container.querySelector('[data-measure-claim]')!.textContent!;
        const strip = container.querySelector('[data-retrofit-delta-strip]')!.textContent!;
        const capacityPattern = /→ ([\d.]+) kWp/;
        expect(Number(claim.match(capacityPattern)?.[1])).toBeCloseTo(count * 0.4, 8);
        expect(Number(strip.match(capacityPattern)?.[1])).toBeCloseTo(count * 0.4, 8);
        const areaPattern = lang === "ko" ? /모듈 표면적[^→]*→ ([\d,]+) m²/ : /Module surface area[^→]*→ ([\d,]+) m²/;
        expect(Number(strip.match(areaPattern)?.[1].replaceAll(",", ""))).toBe(Math.round(count * 1.7));
        const chipArea = claim.match(/ · ([\d,]+) m²/);
        expect(Number(chipArea?.[1].replaceAll(",", ""))).toBe(Math.round(count * 1.7));
      });
    }
  }
});
