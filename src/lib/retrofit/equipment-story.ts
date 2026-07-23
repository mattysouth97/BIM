// src/lib/retrofit/equipment-story.ts
// Object-story bridge: a clicked MEP mesh → "how is it operated now" (priced
// estimated consumption) + "what would upgrading it return" (the retrofit
// measures from the SAME engine the Twin scenario UI uses, filtered to the
// clicked equipment's system category).
//
// Pure and synchronous — no React, no stores. The caller supplies the
// financially-enriched measure list from useRetrofitScenario so the numbers
// shown on the object are byte-identical to the scenario rail's.

import type { RetrofitMeasure } from "./retrofit-types";
import type { Fuel } from "./economic-model";
import { ENERGY_PRICES } from "./cost-database";

/** Retrofit catalog category a clicked component maps onto. */
export type StoryCategory = "hvac" | "lighting" | "renewable";

/**
 * Map a MEP mesh componentType (e.g. "cooling-branch", "lighting-fixture")
 * onto the retrofit measure category that would upgrade it. `null` means the
 * catalog has no direct measure for this system (e.g. electrical
 * distribution panels) — the story then honestly says so instead of showing
 * unrelated measures.
 */
export function storyCategoryFor(componentType: string): StoryCategory | null {
  switch (componentType.split("-")[0]) {
    case "cooling":
    case "heating":
    case "vent":
    case "dhw":
      return "hvac";
    case "lighting":
      return "lighting";
    // Clicking the existing PV/BESS shows solar expansion potential.
    case "microgrid":
      return "renewable";
    default:
      return null; // shell / unknown
  }
}

export interface EquipmentStory {
  /** Measure category this equipment maps to; null = no direct catalog. */
  category: StoryCategory | null;
  /** Fuel the CURRENT operation is priced at. */
  fuel: Fuel;
  /** Estimated current consumption (from EquipmentSpec inference). */
  currentAnnualKwh: number;
  /** currentAnnualKwh × ENERGY_PRICES[fuel] — estimated annual spend, KRW. */
  currentAnnualCostKrw: number;
  /** Applicable upgrades, cheapest-payback first, capped at maxUpgrades. */
  upgrades: RetrofitMeasure[];
}

/**
 * Build the story for one clicked equipment item.
 *
 * Fuel rule: heating and DHW burn the building's heating fuel; everything
 * else (cooling, ventilation fans, lighting, panels, PV) is electricity.
 */
export function buildEquipmentStory(params: {
  componentType: string;
  annualKwh: number;
  heatingFuel: Fuel;
  /** Financially-enriched measures from useRetrofitScenario().allMeasures. */
  allMeasures: RetrofitMeasure[];
  maxUpgrades?: number;
}): EquipmentStory {
  const { componentType, annualKwh, heatingFuel, allMeasures, maxUpgrades = 3 } = params;

  const category = storyCategoryFor(componentType);

  const prefix = componentType.split("-")[0];
  const fuel: Fuel =
    prefix === "heating" || prefix === "dhw" ? heatingFuel : "electricity";

  const upgrades =
    category === null
      ? []
      : allMeasures
          .filter((m) => m.category === category)
          .slice()
          .sort((a, b) => a.paybackYears - b.paybackYears)
          .slice(0, maxUpgrades);

  return {
    category,
    fuel,
    currentAnnualKwh: annualKwh,
    currentAnnualCostKrw: Math.round(annualKwh * ENERGY_PRICES[fuel]),
    upgrades,
  };
}
