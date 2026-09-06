// src/lib/retrofit/measure-claim.ts
// The one line a measure chip carries: what this work does to THIS building.
//
//   외벽 U 0.58 → 0.15 W/m²·K · 340 m² · ₩4,100만
//
// Three facts, in the order a person asks them: what changes, over how much of
// the building, for how much money. Pure — no React, no store.
//
// Every part is read from something that already exists rather than restated:
//
//  - the change comes from `computeRetrofitDelta`'s per-measure effect, i.e.
//    from `applyPhaseToMaterials`, the one before/after seam;
//  - the area is the area the ENGINE priced, off `engineEnvelopeAreasFrom`
//    (heat-loss elements), never a footprint standing in for a roof;
//  - the cost is `financials.effectiveCapex`, so it already carries the
//    chosen 지원 재원 — switching financing visibly re-prices the same work.
//
// The line must reproduce its own numbers: `measure-claim.test.ts` parses each
// rendered line back and checks each part against the source it came from.
// A chip that says "0.58 → 0.15" beside a measure whose delta says otherwise
// is the exact failure AGENTS.md describes, and a test that merely asserted
// the words appeared would not see it.

import type { RetrofitMeasure } from "./retrofit-types";
import type { RetrofitMeasureEffect } from "./retrofit-delta";
import { formatKrw } from "@/lib/twin-formatters";

/** Areas the engine priced, as `engineEnvelopeAreasFrom` reports them. */
export interface ClaimEnvelopeAreas {
  opaqueWallSqm: number;
  windowSqm: number;
  roofSqm: number;
  groundFloorSqm: number;
}

export interface MeasureClaimInput {
  measure: RetrofitMeasure;
  /** This measure's solo effect, from `computeRetrofitDelta().measures`. */
  effect?: RetrofitMeasureEffect;
  /** Engine envelope areas; omitted where the frame has no engine answer yet. */
  areas?: ClaimEnvelopeAreas;
  /** Conditioned floor area (m²) — what plant and lighting work is priced on. */
  totalFloorAreaSqm: number;
  lang: "ko" | "en";
}

export interface MeasureClaim {
  measureId: string;
  /** "외벽 U 0.58 → 0.15 W/m²·K", or undefined when no field moved. */
  change?: string;
  /** The quantity of building this work covers (m²), or undefined if unknown. */
  areaSqm?: number;
  /** Effective CAPEX under the chosen financing (KRW). */
  costKrw: number;
  /** The three parts joined — what the chip renders. */
  line: string;
  /**
   * True when the degree-day run prices this measure. False for LED and PV:
   * `deliveredFromDemand` fixes lighting at 15 % of total and hard-codes
   * `renewable: 0`, so they move NPV and the 3D model but not kWh/m². The chip
   * must say so rather than let the line imply an intensity movement.
   */
  pricedByEngine: boolean;
}

const SEP = " · ";

/**
 * Which engine area this measure is priced over. Plant and lighting act on the
 * whole conditioned floor area — that IS their sizing basis in
 * `hvac-retrofits.ts` and `lighting-retrofits.ts`, not a stand-in.
 */
export function claimAreaSqm(
  measureId: string,
  areas: ClaimEnvelopeAreas | undefined,
  totalFloorAreaSqm: number,
  effect?: RetrofitMeasureEffect,
): number | undefined {
  switch (measureId) {
    case "envelope-wall-insulation":
      return areas?.opaqueWallSqm;
    case "envelope-window-replacement":
      return areas?.windowSqm;
    case "envelope-roof-insulation":
      return areas?.roofSqm;
    case "envelope-floor-insulation":
      return areas?.groundFloorSqm;
    default:
      break;
  }
  if (measureId.startsWith("solar-pv-")) {
    // The panelled area, not the roof: a flat roof yields 70 % of its surface.
    // Read off the same sizing the economics used, via the delta's change row.
    const areaChange = effect?.changes.find((c) => c.field === "renewable.solarPV.area");
    const parsed = areaChange ? Number(areaChange.after) : NaN;
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (measureId.startsWith("hvac-") || measureId.startsWith("lighting-")) {
    return totalFloorAreaSqm > 0 ? totalFloorAreaSqm : undefined;
  }
  return undefined;
}

/**
 * The physical change to lead the line with. The first PRICED change wins, so
 * a window replacement leads with its U-value rather than with "double/low-e →
 * triple/low-e"; where nothing is priced (LED, PV) the first change is used,
 * because the work is still real even when this engine cannot price it.
 */
function leadChange(
  effect: RetrofitMeasureEffect | undefined,
  lang: "ko" | "en",
): string | undefined {
  if (!effect || effect.changes.length === 0) return undefined;
  const priced = effect.changes.find((c) => c.pricedByEngine);
  const chosen = priced ?? effect.changes[0];
  return lang === "ko" ? chosen.summaryKo : chosen.summaryEn;
}

function formatArea(areaSqm: number): string {
  return `${Math.round(areaSqm).toLocaleString("en-US")} m²`;
}

export function buildMeasureClaim(input: MeasureClaimInput): MeasureClaim {
  const { measure, effect, areas, totalFloorAreaSqm, lang } = input;

  const change = leadChange(effect, lang);
  const areaSqm = claimAreaSqm(measure.id, areas, totalFloorAreaSqm, effect);
  // Effective CAPEX carries the subsidy; estimatedCost is the unsubsidised
  // fallback for a frame whose financials have not been computed yet.
  const costKrw = measure.financials?.effectiveCapex ?? measure.estimatedCost;

  const parts: string[] = [];
  if (change) parts.push(change);
  if (areaSqm !== undefined && areaSqm > 0) parts.push(formatArea(areaSqm));
  parts.push(formatKrw(costKrw, lang));

  return {
    measureId: measure.id,
    change,
    areaSqm,
    costKrw,
    line: parts.join(SEP),
    pricedByEngine: effect?.pricedByEngine ?? false,
  };
}

/**
 * Split a rendered line back into its parts. Exists for the test that checks a
 * chip reproduces its own numbers, and for any caller that needs the pieces
 * without rebuilding them.
 */
export function splitMeasureClaimLine(line: string): string[] {
  return line.split(SEP);
}
