// The measures are sized on the areas the engine priced.
//
// Every envelope measure's cost AND saving is linear in its area
// (`envelope-retrofits.ts`), so an area the engine never used produces a
// number that cannot be reconciled with the W/K on the same frame. Until
// 2026-09-06 the roof and floor measures were both sized at `footprintArea`
// — the GROUND slab — and the wall and window measures applied the ratio to
// the NET wall instead of the gross the engine multiplies.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRetrofitScenario } from "../use-retrofit-scenario";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { referenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import { calculateHeatLoss, meanWindowToWallRatio } from "@/lib/energy/heat-loss";
import { calculateAnnualDemand } from "@/lib/energy/annual-demand";
import { getClimateData } from "@/lib/energy/climate-data";
import { RETROFIT_COSTS } from "@/lib/retrofit/cost-database";
import {
  REFERENCE_BUILDING_IDS,
  type ReferenceBuildingId,
} from "@/lib/reference-buildings/manifest";

const PK = "TEST-PK-MEASURE-AREAS";

function engineFor(id: ReferenceBuildingId) {
  const energy = referenceBuildingEnergyInputs(id)!;
  const climate = getClimateData(energy.climate.sigunguCd);
  const heatLoss = calculateHeatLoss(energy.materials, energy.recipe, climate);
  const demand = calculateAnnualDemand(heatLoss, energy.materials, energy.recipe, climate);
  const q = envelopeQuantities(energy.recipe);
  const area = (name: string) => heatLoss.elements.find((e) => e.element === name)!.area;
  const engineEnvelopeAreas = {
    opaqueWallSqm: area("Walls") - (energy.exteriorDoorSqm ?? 0),
    windowSqm: area("Windows"),
    roofSqm: area("Roof"),
    groundFloorSqm: area("Ground Floor"),
  };
  return { energy, climate, heatLoss, demand, q, engineEnvelopeAreas };
}

function render(id: ReferenceBuildingId, withAreas: boolean) {
  const { energy, demand, q, engineEnvelopeAreas } = engineFor(id);
  useMaterialStore.setState({ properties: { [PK]: energy.materials } });
  useRecipeStore.setState({ baseRecipes: { [PK]: energy.recipe } });
  return renderHook(() =>
    useRetrofitScenario({
      buildingPk: PK,
      capexBudgetKrw: 250_000_000,
      totalFloorArea: q.intensityFloorAreaSqm,
      footprintArea: q.planAreaSqm,
      roofType: energy.roof?.type ?? "flat",
      sidoPrefix: energy.climate.sigunguCd.slice(0, 2),
      engineDemand: demand,
      ...(withAreas ? { engineEnvelopeAreas } : {}),
    }),
  ).result.current;
}

describe("the envelope measures cover the areas the engine priced", () => {
  beforeEach(() => {
    useMaterialStore.setState({ properties: {} });
    useRecipeStore.setState({ baseRecipes: {}, overrides: {} });
  });

  for (const id of REFERENCE_BUILDING_IDS) {
    it(`${id}: each measure's cost divides back to the engine's own area`, () => {
      const { engineEnvelopeAreas } = engineFor(id as ReferenceBuildingId);
      const scenario = render(id as ReferenceBuildingId, true);
      const byId = new Map(scenario.allMeasures.map((m) => [m.id, m]));

      // Cost is area × unit rate, so the rendered cost divides back to the
      // area — this reads the number the page will show and recovers the
      // area from it, rather than trusting the input went where it was sent.
      //
      // A measure only exists where the element is worse than the 2020
      // target, so each check is conditional and at least one must fire. The
      // apartment has no floor measure at all: its insulated hollow-core
      // slab is already at or below the 0.18 W/m²K target.
      let checked = 0;
      const check = (measureId: string, perM2: number, expected: number) => {
        const measure = byId.get(measureId);
        if (!measure) return;
        checked += 1;
        expect(measure.estimatedCost / perM2).toBeCloseTo(expected, 6);
      };

      check("envelope-roof-insulation", RETROFIT_COSTS.roofInsulation.perM2, engineEnvelopeAreas.roofSqm);
      check("envelope-floor-insulation", RETROFIT_COSTS.floorInsulation.perM2, engineEnvelopeAreas.groundFloorSqm);
      check("envelope-window-replacement", RETROFIT_COSTS.windowReplacement.perM2, engineEnvelopeAreas.windowSqm);
      check("envelope-wall-insulation", RETROFIT_COSTS.wallInsulation.perM2, engineEnvelopeAreas.opaqueWallSqm);
      expect(checked).toBeGreaterThanOrEqual(3);
    });

    it(`${id}: the window measure covers the aperture the file measured`, () => {
      const { energy, q, engineEnvelopeAreas } = engineFor(id as ReferenceBuildingId);
      // gross × the engine's own mean ratio IS the building's aperture.
      const aperture =
        q.grossWallAreaSqm * meanWindowToWallRatio(energy.materials);
      expect(engineEnvelopeAreas.windowSqm).toBeCloseTo(aperture, 6);
    });

    it(`${id}: the wall measure is gross − aperture − doors, and excludes the doors`, () => {
      const { energy, q, engineEnvelopeAreas } = engineFor(id as ReferenceBuildingId);
      const doors = energy.exteriorDoorSqm!;
      expect(doors).toBeGreaterThan(0);

      const aperture =
        q.grossWallAreaSqm * meanWindowToWallRatio(energy.materials);
      expect(engineEnvelopeAreas.opaqueWallSqm).toBeCloseTo(
        q.grossWallAreaSqm - aperture - doors,
        6,
      );
      // And that is the measured opaque wall the file states per orientation
      // — to 0.01 m², which is the rounding carried by the per-sector
      // constants themselves (the Clinic's four sum to 2,150.31 against a
      // gross-minus-openings 2,150.30).
      const opaqueFromFile = (["N", "E", "S", "W"] as const).reduce(
        (sum, o) => sum + energy.wallByOrientationSqm[o],
        0,
      );
      expect(engineEnvelopeAreas.opaqueWallSqm).toBeCloseTo(opaqueFromFile, 1);
    });
  }

  it("the apartment's roof measure stops being sized at its footprint", () => {
    const { q, engineEnvelopeAreas } = engineFor("schependomlaan");
    // 542.96 m² of measured roof surface over a 345.81 m² ground slab: the
    // old sizing was 36 % short, and on a building whose roof is the thing
    // being insulated that is not a rounding difference.
    expect(q.planAreaSqm).toBeCloseTo(345.81, 2);
    expect(engineEnvelopeAreas.roofSqm).toBeCloseTo(542.96, 2);
    expect(1 - q.planAreaSqm / engineEnvelopeAreas.roofSqm).toBeCloseTo(0.363, 2);

    const before = render("schependomlaan", false);
    const after = render("schependomlaan", true);
    const cost = (s: typeof before, id: string) =>
      s.allMeasures.find((m) => m.id === id)!.estimatedCost;
    expect(cost(after, "envelope-roof-insulation")).toBeGreaterThan(
      cost(before, "envelope-roof-insulation"),
    );
  });
});

describe("roof typology reaches the measure that renders it", () => {
  beforeEach(() => {
    useMaterialStore.setState({ properties: {} });
    useRecipeStore.setState({ baseRecipes: {}, overrides: {} });
  });

  it("the apartment's PV measure no longer calls its tiled pitched roof flat", () => {
    const energy = referenceBuildingEnergyInputs("schependomlaan")!;
    expect(energy.roof?.type).toBe("gable");

    const scenario = render("schependomlaan", true);
    const pv = scenario.allMeasures.find((m) => m.category === "renewable")!;
    // The name is user-visible text about the building. Assert what it
    // CLAIMS, not that a string is present.
    expect(pv.name).toContain("gable roof");
    expect(pv.name).not.toContain("flat roof");
    expect(pv.id).toBe("solar-pv-gable");
  });

  it("the Clinic stays flat, because 83 % of its roof surface is deck at 0.0°", () => {
    const energy = referenceBuildingEnergyInputs("bs-medical-dental-clinic")!;
    expect(energy.roof?.type).toBe("flat");

    const scenario = render("bs-medical-dental-clinic", true);
    const pv = scenario.allMeasures.find((m) => m.category === "renewable")!;
    expect(pv.name).toContain("flat roof");
  });

  for (const id of REFERENCE_BUILDING_IDS) {
    it(`${id}: the roof \`read\` reproduces the tilt it claims`, () => {
      const roof = referenceBuildingEnergyInputs(id as ReferenceBuildingId)!.roof;
      if (id === "kit-office") {
        // Curved roof strips have no supported flat/gable/hip/sawtooth label.
        // Their real per-plane slopes are checked in kit-office-energy.test.
        expect(roof).toBeUndefined();
        return;
      }
      expect(roof).toBeDefined();
      // The explanation is parsed back and its arithmetic checked, rather
      // than the test asserting that some words appear. Every constituent
      // states its own tilt, so nothing has to be inferred.
      const parts = [...roof!.read.matchAll(/([\d,]+\.\d\d) m² at ([\d.]+)°/g)].map((m) => ({
        area: Number(m[1].replace(/,/g, "")),
        tilt: Number(m[2]),
      }));
      const claimedMean = roof!.read.match(/area-weighted ([\d.]+)°/);
      const claimedTotal = roof!.read.match(/over the ([\d,]+\.\d\d) m²/);

      // One constituent is a legitimate roof (the Duplex has a single flat
      // row); the arithmetic below still has to reproduce the claim. The
      // message names the shape, because "expected 0 to be >= 1" sends the
      // next reader looking for a missing roof rather than a mis-shaped
      // sentence — which is what FZK Haus's first string actually was.
      expect(
        parts.length,
        `roof.read for ${id} states no parseable constituent. Expected one or more ` +
          `"<name> <area with 2 decimals> m² at <tilt>°" terms, then ` +
          `"→ area-weighted <tilt>° over the <total> m² priced". ` +
          `Areas must be each roof's SURFACE (roofs[].surfaceSqm), since that is ` +
          `what sums to the priced total. Got: ${roof!.read}`,
      ).toBeGreaterThanOrEqual(1);
      expect(claimedMean, `roof.read for ${id} states no "area-weighted N°"`).not.toBeNull();
      expect(claimedTotal, `roof.read for ${id} states no "over the N m²"`).not.toBeNull();

      const totalArea = parts.reduce((s, p) => s + p.area, 0);
      const claimed = Number(claimedTotal![1].replace(/,/g, ""));
      // Each constituent is a 2-dp figure and the total is rounded
      // independently of them, so summing n of them can drift by at most
      // n × 0.005. FZK's two 85.56 m² pitches sum to 171.12 against a stated
      // 171.13. Anything wider than that is a real disagreement, not
      // rounding — which is why the tolerance is derived from the count
      // rather than picked.
      const roundingSlack = parts.length * 0.005;
      expect(
        Math.abs(totalArea - claimed),
        `roof.read for ${id}: constituents sum to ${totalArea.toFixed(2)} but the ` +
          `sentence says it is over ${claimed.toFixed(2)} — a gap of ` +
          `${Math.abs(totalArea - claimed).toFixed(2)} m², wider than the ` +
          `${roundingSlack.toFixed(3)} m² that rounding ${parts.length} two-decimal ` +
          `figures can produce.`,
      ).toBeLessThanOrEqual(roundingSlack);

      // And they produce the mean tilt it claims.
      const mean = parts.reduce((s, p) => s + p.area * p.tilt, 0) / totalArea;
      expect(mean).toBeCloseTo(Number(claimedMean![1]), 2);
    });
  }
});
