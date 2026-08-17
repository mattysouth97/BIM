import { describe, expect, it } from "vitest";

import { catalogFootprintMm } from "../catalog-dims";
import type { SymbolGraph } from "../graph-types";
import { familiesForSection } from "../sections";
import { validateSection } from "./library-harness";

// energy-bems is the smallest section (4 families: energy-smart-meter,
// ess-pcs, bems-temp-sensor, bems-co2-sensor) — cheap to fully author here
// as a fixture for exercising the harness itself.
const ENERGY_BEMS_IDS = familiesForSection("energy-bems").map((f) => f.id);

function rectGraphMatchingCatalog(familyId: string): SymbolGraph {
  const dims = catalogFootprintMm(familyId)!;
  return {
    id: familyId,
    nodes: [{ op: "rect", weight: "symbol", cx: 0, cz: 0, widthMm: dims.widthMm, depthMm: dims.depthMm }],
  };
}

function fullEnergyBemsEntries(): Record<string, SymbolGraph> {
  const entries: Record<string, SymbolGraph> = {};
  for (const id of ENERGY_BEMS_IDS) entries[id] = rectGraphMatchingCatalog(id);
  return entries;
}

describe("library-harness: validateSection", () => {
  it("has exactly four energy-bems families in this fixture (sanity check on the fixture itself)", () => {
    expect(ENERGY_BEMS_IDS).toHaveLength(4);
  });

  it("passes clean when every family in the section has a well-fit graph", () => {
    const result = validateSection("energy-bems", fullEnergyBemsEntries());
    expect(result.errors).toEqual([]);
    expect(result.familyCount).toBe(4);
  });

  it("flags a missing family by id", () => {
    const entries = fullEnergyBemsEntries();
    const [missingId] = ENERGY_BEMS_IDS;
    delete entries[missingId];
    const result = validateSection("energy-bems", entries);
    expect(result.errors.some((e) => e.includes(missingId) && e.includes("missing"))).toBe(true);
  });

  it("flags an entry for a family that belongs to a different section", () => {
    const entries = fullEnergyBemsEntries();
    entries["column-struct-round-450"] = rectGraphMatchingCatalog("column-struct-round-450");
    const result = validateSection("energy-bems", entries);
    expect(result.errors.some((e) => e.includes("column-struct-round-450") && e.includes("not a member"))).toBe(
      true,
    );
  });

  it("flags a graph that evaluates to zero strokes", () => {
    const entries = fullEnergyBemsEntries();
    const [id] = ENERGY_BEMS_IDS;
    entries[id] = { id, nodes: [] };
    const result = validateSection("energy-bems", entries);
    expect(result.errors.some((e) => e.includes(id))).toBe(true);
  });

  it("flags a graph whose bounds are wildly off the family's real footprint", () => {
    const entries = fullEnergyBemsEntries();
    const [id] = ENERGY_BEMS_IDS;
    entries[id] = { id, nodes: [{ op: "rect", weight: "symbol", cx: 0, cz: 0, widthMm: 50_000, depthMm: 50_000 }] };
    const result = validateSection("energy-bems", entries);
    expect(result.errors.some((e) => e.includes(id) && e.includes("footprint"))).toBe(true);
  });

  it("flags a graph that throws during evaluation", () => {
    const entries = fullEnergyBemsEntries();
    const [id] = ENERGY_BEMS_IDS;
    entries[id] = { id, nodes: [{ op: "circle", weight: "symbol", cx: 0, cz: 0, radius: 0 }] };
    const result = validateSection("energy-bems", entries);
    expect(result.errors.some((e) => e.includes(id) && e.includes("threw"))).toBe(true);
  });

  it("names the section's real family count even for an entirely empty library (the day-one state)", () => {
    const result = validateSection("energy-bems", {});
    expect(result.familyCount).toBe(4);
    expect(result.errors).toHaveLength(4);
  });
});
