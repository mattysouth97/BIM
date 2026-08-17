import { describe, expect, it } from "vitest";

import { AUTHORING_FAMILIES } from "@/lib/bim/family-catalog";

import { architectureSymbols } from "../library/architecture";
import { electricalSymbols } from "../library/electrical";
import { energyBemsSymbols } from "../library/energy-bems";
import { furnitureSiteSymbols } from "../library/furniture-site";
import { ALL_LIBRARY_SYMBOLS } from "../library/index";
import { mechanicalSymbols } from "../library/mechanical";
import { plumbingFireSymbols } from "../library/plumbing-fire";
import { structureSymbols } from "../library/structure";

// The authoring pass is complete: all seven section files are filled in
// (see sections.ts for the family-count-per-section split), so this no
// longer asserts the pre-authoring "still empty" scaffolding state — it
// asserts the finished invariant instead: every section file is non-empty,
// and the merged table covers every one of the 102 AUTHORING_FAMILIES with
// no stray keys.
describe("library scaffolding", () => {
  it("every one of the seven section files is non-empty, post authoring pass", () => {
    for (const symbols of [
      architectureSymbols,
      structureSymbols,
      mechanicalSymbols,
      electricalSymbols,
      plumbingFireSymbols,
      energyBemsSymbols,
      furnitureSiteSymbols,
    ]) {
      expect(Object.keys(symbols).length).toBeGreaterThan(0);
    }
  });

  it("merges all seven section files into one table covering every AuthoringFamily id, with no strays", () => {
    const familyIds = new Set(AUTHORING_FAMILIES.map((f) => f.id));
    const graphIds = new Set(Object.keys(ALL_LIBRARY_SYMBOLS));

    expect(graphIds.size).toBe(AUTHORING_FAMILIES.length);
    for (const id of familyIds) {
      expect(graphIds.has(id)).toBe(true);
    }
    for (const id of graphIds) {
      expect(familyIds.has(id)).toBe(true);
    }
  });
});
