import { resolveClimateRegion } from "@/lib/energy/climate-region";
// The threshold table moved for dwellings, and must not have moved for
// anything else. These are the before/after rows quoted in the commit,
// asserted end-to-end through the real engine so the claim cannot rot.

import { describe, it, expect } from "vitest";
import { envelopeQuantities } from "../envelope-quantities";
import { calculateHeatLoss } from "../heat-loss";
import { calculateAnnualDemand } from "../annual-demand";
import { getClimateData } from "../climate-data";
import { deliveredFromDemand, buildingTypeForGrade } from "../delivered-from-demand";
import { buildEndUseLoads } from "../end-uses";
import { calculateEfficiencyRating } from "@/lib/compliance/efficiency-rating";
import { makeMaterials, makeRecipe } from "@/hooks/__tests__/test-fixtures";
import { referenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";
import type { ReferenceBuildingId } from "@/lib/reference-buildings/manifest";
import type { MaterialProperties } from "@/lib/material-types";
import type { BuildingRecipe } from "@/lib/procedural/types";

function grades(materials: MaterialProperties, recipe: BuildingRecipe, sigunguCd: string) {
  const climate = getClimateData(sigunguCd);
  const heatLoss = calculateHeatLoss(materials, recipe, climate);
  const demand = calculateAnnualDemand(heatLoss, materials, recipe, climate);
  const area = envelopeQuantities(recipe).intensityFloorAreaSqm;
  // Phase 01 (D-05/D-07): deliveredFromDemand now takes EndUseLoads.
  const delivered = deliveredFromDemand(buildEndUseLoads({ climateRegion: resolveClimateRegion({ sigunguCd: "11" }), demand, materials, recipe }));
  const rate = (t: "residential" | "non-residential") =>
    calculateEfficiencyRating(delivered, area, t);
  return {
    demandPerSqm: demand.demandPerSqm,
    // What the density heuristic alone produced, i.e. the old answer.
    before: rate("non-residential").grade,
    after: rate(buildingTypeForGrade(materials, recipe.mainPurpsCd)).grade,
  };
}

const ledger = (mainPurpsCd: string) =>
  grades(makeMaterials(), { ...makeRecipe(), mainPurpsCd }, "1111000000");

describe("a 건축물대장 row whose register says it is housing", () => {
  it("공동주택 02000 and 단독주택 01000 both move, and identically", () => {
    // Same building, same physics, same primary energy — only the table
    // changes, so this isolates the table from everything else.
    //
    // Phase 01 (D-01/D-05/D-07): both grades moved from "1"/"4" to "6"/"7".
    // `deliveredFromDemand` no longer flattens lighting/DHW/plug into a
    // 15%/10% share of the HVAC total — it now sums the SAME four end uses
    // `calculateSystemBreakdown` reports (real LPD-based lighting, and DHW/
    // plug scaled off SYSTEM_RATIOS' implied total, which is much larger
    // than the flat 25% the old split allowed). The fixture's real DHW+plug
    // load was previously undercounted; correcting that raises primary
    // energy from ~254 to ~540 kWh/m²·yr for this fixture, past both
    // tables' worst named band into "6"/"7" — a worse-not-better swing is
    // the expected direction of a correction that had been flattering every
    // building (AGENTS.md, grade-table-by-use.test.ts's own prior history).
    for (const code of ["02000", "01000"]) {
      const r = ledger(code);
      expect(r.before).toBe("6");
      expect(r.after).toBe("7");
    }
  });

  it("업무시설 14000 does NOT move", () => {
    // Phase 01: grade moved "1"→"4" (both before and after identical, since
    // 14000 reads as non-residential either way) — same physical-total
    // correction as above, applied to the fixture under the office table.
    const r = ledger("14000");
    expect(r.before).toBe("4");
    expect(r.after).toBe("4");
  });

  it("the demand itself never moves — the table is a scale, not a physics change", () => {
    const office = ledger("14000");
    const housing = ledger("02000");
    expect(housing.demandPerSqm).toBeCloseTo(office.demandPerSqm, 12);
  });
});

describe("the four published reference buildings", () => {
  // Phase 01 (D-01/D-05/D-07): every value below moved for the SAME reason
  // as the ledger fixture above — deliveredFromDemand now sums real,
  // LPD-based lighting plus SYSTEM_RATIOS-scaled DHW/plug loads instead of a
  // flat 15%/10% share of HVAC. Each building's DHW+plug load was
  // undercounted before; correcting it raises primary energy and moves every
  // grade at least one band worse (never better — see the monotonicity
  // check below).
  const expected: Record<string, { before: string; after: string }> = {
    // 09000 의료시설 — not a dwelling, and a code this app cannot classify,
    // so it keeps the occupancy fallback and its grade is unchanged
    // (before === after, as it always was; only the shared value moved).
    "bs-medical-dental-clinic": { before: "4", after: "4" },
    schependomlaan: { before: "1+", after: "2" },
    "duplex-apartment": { before: "6", after: "7" },
    "fzk-haus": { before: "3", after: "7" },
  };

  for (const [id, want] of Object.entries(expected)) {
    it(`${id}: ${want.before} → ${want.after}`, () => {
      const energy = referenceBuildingEnergyInputs(id as ReferenceBuildingId)!;
      const r = grades(energy.materials, energy.recipe, energy.climate.sigunguCd);
      expect(r.before).toBe(want.before);
      expect(r.after).toBe(want.after);
    });
  }

  it("every dwelling here got worse, which is the point", () => {
    // The correction cannot flatter: the residential bands are tighter at
    // every grade, so a building that moves can only move down. If one ever
    // moves up, the table mapping is inverted.
    const order = ["1+++", "1++", "1+", "1", "2", "3", "4", "5", "6", "7"];
    for (const [id, want] of Object.entries(expected)) {
      expect(order.indexOf(want.after), id).toBeGreaterThanOrEqual(
        order.indexOf(want.before),
      );
    }
  });
});
