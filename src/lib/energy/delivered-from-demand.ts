// src/lib/energy/delivered-from-demand.ts
// P1-05 — the single shared fuel-split and building-type derivations.
// Previously report-stage, properties-panel, and (implicitly) the grade path
// each derived these independently; this module is now the only source.
//
// Phase 01 (Honest Physics), D-05/D-06/D-07 — the fuel split above (kept
// verbatim in this comment's history for the record) was a flat share of
// total: electric = cooling + 15% of total, gas = heating + 10% of total,
// district heat/cool and renewables fixed at 0. Because the lighting share
// was a ratio of HVAC and renewable was a literal zero, no lighting or PV
// measure could move the grade however real its own savings formula was.
// `deliveredFromDemand` now takes `EndUseLoads` (end-uses.ts) — four named,
// fuel-declaring end uses plus on-site generation — and does nothing but sum
// each end use's kWh into the fuel bucket its OWN `fuel` field declares. No
// share-of-total arithmetic is possible from this shape: a reviewer sees
// that from the signature alone (D-05).
// Pure functions — no React, no stores.

import type { MaterialProperties } from "@/lib/material-types";
import type { DeliveredEnergy } from "@/lib/energy/primary-energy";
import type { EndUseLoads } from "@/lib/energy/end-uses";
import { ledgerUseCategory } from "@/lib/ledger/floor-rows";

/**
 * D-07 — sum each end use's kWh into the fuel bucket its own `fuel` field
 * declares, and set `renewable` from `onSiteGeneration.kwh`. No share-of-total
 * multiplier: every kWh here traces to a named end use that already knows
 * which fuel it burns (D-06).
 */
export function deliveredFromDemand(loads: EndUseLoads): DeliveredEnergy {
  const fueled = [
    loads.hvac.heating,
    loads.hvac.cooling,
    loads.lighting,
    loads.dhw,
    loads.plug,
  ];

  const totals: DeliveredEnergy = {
    electric: 0,
    gas: 0,
    districtHeating: 0,
    districtCooling: 0,
    renewable: loads.onSiteGeneration.kwh,
  };

  for (const load of fueled) {
    switch (load.fuel) {
      case "electric":
        totals.electric += load.kwh;
        break;
      case "gas":
        totals.gas += load.kwh;
        break;
      case "districtHeating":
        totals.districtHeating += load.kwh;
        break;
      case "districtCooling":
        totals.districtCooling += load.kwh;
        break;
    }
  }

  return totals;
}

/**
 * Residential detection used across all panels: occupancy density above
 * 0.1 persons/m² reads as residential. One implementation — the three
 * divergent copies were removed by P1-05.
 */
export function isResidentialOccupancy(
  materials: MaterialProperties | undefined
): boolean {
  const density = materials?.occupancy?.occupancyDensity;
  return density !== undefined && density > 0.1;
}

/**
 * Which official threshold table the efficiency grade is read off.
 *
 * **The use code decides it wherever there is one**, because that is what the
 * question actually is: 건축물 에너지효율등급 has a 주거용 table and a
 * 비주거용 table, and 주용도코드 is the field that says which a building is.
 *
 * It was decided by occupant density alone until 2026-09-06 — above 0.1
 * persons/m² read as residential — and that test is backwards for dwellings,
 * which are the least densely occupied buildings there are. An office runs at
 * 0.05-0.1 p/m² and an apartment at 0.02-0.04, so the heuristic called dense
 * offices residential and real housing not. Three of the four published
 * reference buildings are dwellings (`mainPurpsCd` 02000, 02000, 01000) and
 * all three were graded on the 비주거용 table, whose 1+++ band is 80
 * kWh/m²·yr against the 주거용 60 — so each read one band better than its use
 * type earns.
 *
 * The fallback is unchanged and still matters: a generated design or an
 * authored model with no 주용도코드 has only its occupancy to go on, and the
 * pages that show a grade on that basis say so.
 *
 * @param mainPurpsCd 주용도코드 from the recipe. A code this app cannot
 *   classify (`ledgerUseCategory` → "default", e.g. 09000 의료시설) is not a
 *   decision either way and falls through to occupancy rather than being
 *   silently read as non-residential.
 */
export function buildingTypeForGrade(
  materials: MaterialProperties | undefined,
  mainPurpsCd?: string,
): "residential" | "non-residential" {
  if (mainPurpsCd) {
    const category = ledgerUseCategory(mainPurpsCd);
    if (category === "residential") return "residential";
    // 업무 / 공장 / 판매 are definitely not dwellings. "default" is not a
    // statement about the building, so it does not get to be one here.
    if (category !== "default") return "non-residential";
  }
  return isResidentialOccupancy(materials) ? "residential" : "non-residential";
}

/**
 * True when the grade's threshold table was chosen by occupancy density
 * because no usable 주용도코드 reached it — the case the page has to disclose,
 * since the density heuristic is the one that can be wrong about a dwelling.
 */
export function gradeTableIsFromOccupancy(mainPurpsCd?: string): boolean {
  return !mainPurpsCd || ledgerUseCategory(mainPurpsCd) === "default";
}
