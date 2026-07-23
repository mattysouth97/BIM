import { describe, it, expect } from "vitest";
import {
  storyCategoryFor,
  buildEquipmentStory,
} from "../equipment-story";
import { ENERGY_PRICES } from "../cost-database";
import type { RetrofitMeasure } from "../retrofit-types";

function makeMeasure(overrides: Partial<RetrofitMeasure> = {}): RetrofitMeasure {
  return {
    id: "hvac-boiler-upgrade",
    name: "고효율 보일러 교체",
    category: "hvac",
    estimatedCost: 50_000_000,
    annualEnergySaving: 20_000,
    annualCostSaving: 1_500_000,
    co2Reduction: 4,
    paybackYears: 8,
    description: "test",
    ...overrides,
  };
}

describe("storyCategoryFor", () => {
  it("maps HVAC-family component types to hvac", () => {
    expect(storyCategoryFor("cooling-branch")).toBe("hvac");
    expect(storyCategoryFor("heating-riser")).toBe("hvac");
    expect(storyCategoryFor("vent-duct")).toBe("hvac");
    expect(storyCategoryFor("dhw-tank")).toBe("hvac");
  });

  it("maps lighting to lighting and microgrid to renewable", () => {
    expect(storyCategoryFor("lighting-fixture")).toBe("lighting");
    expect(storyCategoryFor("microgrid-pv")).toBe("renewable");
  });

  it("returns null for electrical distribution and unknown types", () => {
    expect(storyCategoryFor("shell-panel")).toBeNull();
    expect(storyCategoryFor("mystery-thing")).toBeNull();
  });
});

describe("buildEquipmentStory", () => {
  const catalog: RetrofitMeasure[] = [
    makeMeasure({ id: "hvac-hrv", paybackYears: 12 }),
    makeMeasure({ id: "hvac-boiler-upgrade", paybackYears: 6 }),
    makeMeasure({ id: "hvac-heat-pump", paybackYears: 9 }),
    makeMeasure({ id: "lighting-led", category: "lighting", paybackYears: 3 }),
    makeMeasure({ id: "solar-pv", category: "renewable", paybackYears: 11 }),
    makeMeasure({ id: "envelope-wall", category: "envelope", paybackYears: 20 }),
  ];

  it("filters the catalog to the equipment's category, sorted by payback", () => {
    const story = buildEquipmentStory({
      componentType: "heating-riser",
      annualKwh: 10_000,
      heatingFuel: "gas",
      allMeasures: catalog,
    });
    expect(story.category).toBe("hvac");
    expect(story.upgrades.map((m) => m.id)).toEqual([
      "hvac-boiler-upgrade",
      "hvac-heat-pump",
      "hvac-hrv",
    ]);
  });

  it("caps upgrades at maxUpgrades", () => {
    const story = buildEquipmentStory({
      componentType: "cooling-branch",
      annualKwh: 5_000,
      heatingFuel: "gas",
      allMeasures: catalog,
      maxUpgrades: 2,
    });
    expect(story.upgrades).toHaveLength(2);
    expect(story.upgrades[0].id).toBe("hvac-boiler-upgrade");
  });

  it("prices heating/DHW at the building's heating fuel, others at electricity", () => {
    const heatStory = buildEquipmentStory({
      componentType: "heating-riser",
      annualKwh: 10_000,
      heatingFuel: "gas",
      allMeasures: [],
    });
    expect(heatStory.fuel).toBe("gas");
    expect(heatStory.currentAnnualCostKrw).toBe(
      Math.round(10_000 * ENERGY_PRICES.gas)
    );

    const coolStory = buildEquipmentStory({
      componentType: "cooling-branch",
      annualKwh: 10_000,
      heatingFuel: "gas",
      allMeasures: [],
    });
    expect(coolStory.fuel).toBe("electricity");
    expect(coolStory.currentAnnualCostKrw).toBe(
      Math.round(10_000 * ENERGY_PRICES.electricity)
    );

    const dhwStory = buildEquipmentStory({
      componentType: "dhw-tank",
      annualKwh: 2_000,
      heatingFuel: "districtHeating",
      allMeasures: [],
    });
    expect(dhwStory.fuel).toBe("districtHeating");
  });

  it("returns no upgrades for null-category equipment (electrical panel)", () => {
    const story = buildEquipmentStory({
      componentType: "shell-panel",
      annualKwh: 8_000,
      heatingFuel: "gas",
      allMeasures: catalog,
    });
    expect(story.category).toBeNull();
    expect(story.upgrades).toEqual([]);
    // Current operation is still priced (electricity)
    expect(story.currentAnnualCostKrw).toBe(
      Math.round(8_000 * ENERGY_PRICES.electricity)
    );
  });

  it("never leaks measures from other categories", () => {
    const story = buildEquipmentStory({
      componentType: "lighting-fixture",
      annualKwh: 3_000,
      heatingFuel: "gas",
      allMeasures: catalog,
    });
    expect(story.upgrades.map((m) => m.id)).toEqual(["lighting-led"]);
    expect(story.upgrades.every((m) => m.category === "lighting")).toBe(true);
  });

  it("empty catalog yields an upgrade-free story, not an error", () => {
    const story = buildEquipmentStory({
      componentType: "heating-riser",
      annualKwh: 10_000,
      heatingFuel: "gas",
      allMeasures: [],
    });
    expect(story.upgrades).toEqual([]);
  });
});
