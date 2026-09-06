// 리트로핏 — the section a desktop reader could not see until 2026-09-06.
//
// `SelectedMeasuresStrip` returns null unless the viewport is narrow, so on a
// laptop the "Retrofit" information was four numbers in the top rail with
// nothing underneath. These tests pin the two things that make this section an
// answer rather than a list: every candidate appears, and each one that is not
// selected says why in terms that reproduce its own figures.

import { describe, it, expect, beforeEach } from "vitest";
import { render, within, cleanup } from "@testing-library/react";
import {
  ReferenceRetrofitPanel,
  exclusionReason,
  retrofitBasisLines,
} from "../reference-retrofit";
import { RETROFIT_CATEGORY_ORDER } from "@/components/retrofit/measure-card";
import { referenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";
import { useMaterialStore } from "@/store/material-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useScenarioStore } from "@/store/scenario-store";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";
import {
  REFERENCE_BUILDING_IDS,
  type ReferenceBuildingId,
} from "@/lib/reference-buildings/manifest";

function measure(over: Partial<RetrofitMeasure> = {}): RetrofitMeasure {
  return {
    id: "m",
    name: "A measure",
    category: "envelope",
    estimatedCost: 10_000_000,
    annualEnergySaving: 1000,
    annualCostSaving: 100_000,
    co2Reduction: 0.1,
    paybackYears: 12,
    description: "d",
    lifetimeYears: 20,
    financials: {
      npv: 1_000_000,
      irr: 0.1,
      discountedPayback: 12,
      cashFlow: [],
      effectiveCapex: 10_000_000,
      subsidyValue: 0,
      resolvedFuel: "gas",
    },
    ...over,
  } as RetrofitMeasure;
}

describe("exclusionReason states the fact that actually excluded the measure", () => {
  const budget = 250_000_000;

  it("says nothing at all about a selected measure", () => {
    expect(exclusionReason(measure(), true, budget, false)).toBeNull();
  });

  it("names the negative NPV, and quotes it", () => {
    const m = measure({ financials: { ...measure().financials!, npv: -6_420_000 } });
    const reason = exclusionReason(m, false, budget, false)!;
    expect(reason).toContain("NPV is -₩642만");
    expect(reason).toContain("never repays the outlay");
  });

  it("distinguishes 'would pay, does not fit' from 'would not pay'", () => {
    // Positive NPV, cost over budget: a different sentence, because it is a
    // different answer — this one comes back if the budget moves.
    const m = measure({
      estimatedCost: 560_000_000,
      financials: {
        ...measure().financials!,
        npv: 520_000_000,
        effectiveCapex: 560_000_000,
      },
    });
    const reason = exclusionReason(m, false, budget, false)!;
    expect(reason).toContain("NPV is positive");
    expect(reason).toContain("exceeds the ₩2.5억 budget");
    expect(reason).not.toContain("never repays");
  });

  it("uses the POST-subsidy capex, which is the figure the knapsack budgeted", () => {
    const m = measure({
      estimatedCost: 500_000_000,
      // Halved by a public track: it now fits, so cost alone must not be the
      // reason given.
      financials: {
        ...measure().financials!,
        npv: 90_000_000,
        effectiveCapex: 200_000_000,
      },
    });
    const reason = exclusionReason(m, false, budget, false)!;
    expect(reason).not.toContain("exceeds");
    expect(reason).toContain("higher NPV");
  });

  it("names the alternative when the measure is one of a mutually-exclusive pair", () => {
    const m = measure({
      conflictGroup: "heating-plant",
      financials: { ...measure().financials!, npv: 0 },
    });
    // npv 0 is not < 0, capex is within budget, so the conflict branch wins.
    expect(exclusionReason(m, false, budget, false)).toContain("never additive");
  });
});

describe("retrofitBasisLines", () => {
  for (const id of REFERENCE_BUILDING_IDS) {
    it(`${id}: quotes the building's own roof reading, not a generic sentence`, () => {
      const energy = referenceBuildingEnergyInputs(id as ReferenceBuildingId)!;
      const lines = retrofitBasisLines(energy, false).join(" ");
      expect(lines).toContain(energy.roof!.read);
      expect(lines).toContain(`${energy.roof!.type}-roof utilisation factor`);
      expect(lines).not.toContain("states no roof typology");
    });
  }

  it("a building that states no roof typology says so rather than being called flat", () => {
    const energy = referenceBuildingEnergyInputs("bs-medical-dental-clinic")!;
    const withoutRoof = { ...energy, roof: undefined };
    const lines = retrofitBasisLines(withoutRoof, false).join(" ");
    expect(lines).toContain("states no roof typology");
    expect(lines).toContain("a stand-in, not a reading");
  });

  it("discloses the three things these measures do NOT do to the engine", () => {
    const energy = referenceBuildingEnergyInputs("schependomlaan")!;
    const lines = retrofitBasisLines(energy, false).join(" ");
    // Lighting/PV cannot move the grade; the HRV's saving is not the
    // engine's; window replacement claims no cooling change.
    expect(lines).toContain("cannot move kWh/m² or the grade");
    expect(lines).toContain("modelled loss goes UP");
    expect(lines).toContain("SHGC is left unchanged");
    // And the costing provenance the brief asks for.
    expect(lines).toContain("KICT 2024");
    expect(lines).toContain("ASHRAE");
    expect(lines).toContain("2026.1");
  });
});

describe("the section on a real building page", () => {
  beforeEach(() => {
    // Vitest is not running RTL's auto-cleanup here, and `screen` queries the
    // whole document — a leftover render from the previous case turns a
    // single-element lookup into "found multiple". Every query below is
    // scoped to its own `container` for the same reason.
    cleanup();
    useMaterialStore.setState({ properties: {} });
    useRecipeStore.setState({ baseRecipes: {}, overrides: {} });
    useScenarioStore.setState({ capexBudgetKrw: 250_000_000, programTrack: "none" });
  });

  function seed(id: ReferenceBuildingId) {
    const energy = referenceBuildingEnergyInputs(id)!;
    useMaterialStore.setState({ properties: { [energy.buildingPk]: energy.materials } });
    useRecipeStore.setState({ baseRecipes: { [energy.buildingPk]: energy.recipe } });
    return energy;
  }

  // Driven off the registry, not a hand-written list: the contract's whole
  // claim is that a NEW building renders the same section with the same rows
  // in the same order, and a list somebody has to remember to extend cannot
  // check that.
  for (const id of REFERENCE_BUILDING_IDS) {
    it(`${id}: renders EVERY candidate, not only the selected ones`, () => {
      const energy = seed(id as ReferenceBuildingId);
      const { container } = render(
        <ReferenceRetrofitPanel energy={energy} locale="en" />,
      );
      const cards = container.querySelectorAll(
        '[data-testid^="retrofit-measure-"]:not([data-testid$="-note"])',
      );
      expect(cards.length).toBeGreaterThan(0);

      // The summary sentence names a candidate count; it must be the number
      // of cards actually on screen, not the number selected.
      const summary = within(container).getByTestId(
        "reference-model-retrofit-summary",
      ).textContent!;
      const claimed = summary.match(/of (\d+) candidates/);
      expect(claimed).not.toBeNull();
      expect(Number(claimed![1])).toBe(cards.length);
    });

    it(`${id}: every unselected card carries a reason`, () => {
      const energy = seed(id as ReferenceBuildingId);
      const { container } = render(
        <ReferenceRetrofitPanel energy={energy} locale="en" />,
      );
      const cards = [
        ...container.querySelectorAll<HTMLElement>(
          '[data-testid^="retrofit-measure-"]:not([data-testid$="-note"])',
        ),
      ];
      for (const card of cards) {
        const selected = within(card).queryByText("예산 내") !== null;
        const note = card.querySelector('[data-testid$="-note"]');
        // Exactly one of the two: selected, or told why not.
        expect(selected || note !== null).toBe(true);
        if (selected) expect(note).toBeNull();
      }
    });

    it(`${id}: lists categories in the shared order`, () => {
      const energy = seed(id as ReferenceBuildingId);
      const { container } = render(
        <ReferenceRetrofitPanel energy={energy} locale="en" />,
      );
      const ids = [
        ...container.querySelectorAll<HTMLElement>(
          '[data-testid^="retrofit-measure-"]:not([data-testid$="-note"])',
        ),
      ].map((n) => n.dataset.testid!.replace("retrofit-measure-", ""));

      const rank = (measureId: string) => {
        if (measureId.startsWith("envelope-")) return RETROFIT_CATEGORY_ORDER.indexOf("envelope");
        if (measureId.startsWith("hvac-")) return RETROFIT_CATEGORY_ORDER.indexOf("hvac");
        if (measureId.startsWith("lighting-")) return RETROFIT_CATEGORY_ORDER.indexOf("lighting");
        return RETROFIT_CATEGORY_ORDER.indexOf("renewable");
      };
      const ranks = ids.map(rank);
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    });
  }

  it("the Clinic selects nothing at the default budget, and says so instead of showing an empty list", () => {
    const energy = seed("bs-medical-dental-clinic");
    const { container } = render(<ReferenceRetrofitPanel energy={energy} locale="en" />);

    expect(
      within(container).getByTestId("reference-model-retrofit-none-selected"),
    ).toBeTruthy();
    // Six cards under a "nothing selected" heading is the answer; zero cards
    // would read as a broken panel.
    expect(
      container.querySelectorAll(
        '[data-testid^="retrofit-measure-"]:not([data-testid$="-note"])',
      ).length,
    ).toBe(6);
    expect(within(container).queryByTestId("reference-model-retrofit-empty")).toBeNull();
  });
});
