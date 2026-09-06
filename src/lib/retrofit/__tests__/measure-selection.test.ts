import { describe, it, expect } from "vitest";
import type { RetrofitMeasure } from "../retrofit-types";
import {
  toggleMeasure,
  conflictsWith,
  alternativesTo,
} from "../measure-selection";

function measure(
  id: string,
  extra: Partial<RetrofitMeasure> = {},
): RetrofitMeasure {
  return {
    id,
    name: id,
    category: "envelope",
    description: id,
    estimatedCost: 1_000_000,
    annualEnergySaving: 1_000,
    annualCostSaving: 100_000,
    co2Reduction: 0.2,
    paybackYears: 10,
    ...extra,
  };
}

/** The catalogue order the chip row renders in. */
const ALL: RetrofitMeasure[] = [
  measure("envelope-wall-insulation"),
  measure("envelope-window-replacement"),
  measure("hvac-boiler-upgrade", {
    category: "hvac",
    conflictGroup: "heating-plant",
  }),
  measure("hvac-heat-pump", {
    category: "hvac",
    conflictGroup: "heating-plant",
  }),
  measure("lighting-led", { category: "lighting" }),
];

describe("toggleMeasure", () => {
  it("switches a measure on", () => {
    const r = toggleMeasure([], "envelope-wall-insulation", ALL);
    expect(r.next).toEqual(["envelope-wall-insulation"]);
    expect(r.evicted).toEqual([]);
  });

  it("switches a measure off, evicting nothing", () => {
    const r = toggleMeasure(
      ["envelope-wall-insulation", "lighting-led"],
      "envelope-wall-insulation",
      ALL,
    );
    expect(r.next).toEqual(["lighting-led"]);
    expect(r.evicted).toEqual([]);
  });

  it("evicts the conflicting sibling, and says which", () => {
    // A building gets a condensing boiler OR a heat pump, never both — the
    // rule the knapsack has always applied, now enforced at click time.
    const r = toggleMeasure(
      ["envelope-wall-insulation", "hvac-boiler-upgrade"],
      "hvac-heat-pump",
      ALL,
    );
    expect(r.next).toEqual(["envelope-wall-insulation", "hvac-heat-pump"]);
    expect(r.evicted.map((m) => m.id)).toEqual(["hvac-boiler-upgrade"]);
  });

  it("never leaves two members of one exclusion group in the set", () => {
    let ids: string[] = [];
    for (const id of ["hvac-boiler-upgrade", "hvac-heat-pump", "hvac-boiler-upgrade"]) {
      ids = toggleMeasure(ids, id, ALL).next;
      const plant = ids.filter((i) => i.startsWith("hvac-"));
      expect(plant.length).toBeLessThanOrEqual(1);
    }
    expect(ids).toEqual(["hvac-boiler-upgrade"]);
  });

  it("orders the set by the catalogue, not by click order", () => {
    // Otherwise the same chosen work would produce a different id array
    // depending on the order it was clicked, and every memo keyed on it
    // would churn.
    const clickedBackwards = toggleMeasure(
      toggleMeasure([], "lighting-led", ALL).next,
      "envelope-wall-insulation",
      ALL,
    );
    expect(clickedBackwards.next).toEqual([
      "envelope-wall-insulation",
      "lighting-led",
    ]);
  });

  it("ignores an id the generators did not produce", () => {
    // Adding it would put a measure in the set that nothing can price.
    const r = toggleMeasure(["lighting-led"], "dhw-solar-thermal", ALL);
    expect(r.next).toEqual(["lighting-led"]);
    expect(r.evicted).toEqual([]);
  });

  it("does not mutate the set it was given", () => {
    const current = ["hvac-boiler-upgrade"];
    toggleMeasure(current, "hvac-heat-pump", ALL);
    expect(current).toEqual(["hvac-boiler-upgrade"]);
  });
});

describe("conflictsWith", () => {
  it("reports what a click WOULD evict, before the click", () => {
    expect(
      conflictsWith("hvac-heat-pump", ["hvac-boiler-upgrade"], ALL).map((m) => m.id),
    ).toEqual(["hvac-boiler-upgrade"]);
  });

  it("reports nothing for a measure already chosen — switching off evicts nothing", () => {
    expect(
      conflictsWith("hvac-heat-pump", ["hvac-heat-pump"], ALL),
    ).toEqual([]);
  });

  it("reports nothing for a measure in no exclusion group", () => {
    expect(conflictsWith("lighting-led", ["hvac-boiler-upgrade"], ALL)).toEqual([]);
  });
});

describe("alternativesTo", () => {
  it("names the siblings whether or not they are chosen", () => {
    expect(alternativesTo("hvac-boiler-upgrade", ALL).map((m) => m.id)).toEqual([
      "hvac-heat-pump",
    ]);
    expect(alternativesTo("envelope-wall-insulation", ALL)).toEqual([]);
  });
});
