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
 * Bilingual chip names, keyed by measure id.
 *
 * The generators name in whichever language their author wrote in —
 * `envelope-retrofits.ts` is English ("Wall Insulation Upgrade"),
 * `hvac-retrofits.ts` and `lighting-retrofits.ts` are Korean ("고효율 보일러
 * 교체"). Rendering `measure.name` therefore produced a row that was half
 * English on the Korean page, with Korean claim lines underneath it. Found on
 * /models/duplex-apartment.
 *
 * The Korean strings below are the generators' own, copied verbatim where they
 * exist, so the chip and the side panel name one thing one way. The English
 * ones are glosses, not machine translations (P2-06). Solar drops the
 * generator's "(flat roof, 18.6 kWp)" suffix because the claim line already
 * carries the capacity — nothing is lost, and the chip stops restating it.
 */
const MEASURE_NAMES: Record<string, { ko: string; en: string }> = {
  "envelope-wall-insulation": { ko: "외벽 단열 보강", en: "Wall insulation" },
  "envelope-window-replacement": {
    ko: "고성능 창호 교체",
    en: "High-performance windows",
  },
  "envelope-roof-insulation": { ko: "지붕 단열 보강", en: "Roof insulation" },
  "envelope-floor-insulation": {
    ko: "최하층 바닥 단열 보강",
    en: "Ground floor insulation",
  },
  // Korean verbatim from hvac-retrofits.ts / lighting-retrofits.ts.
  "hvac-boiler-upgrade": { ko: "고효율 보일러 교체", en: "Condensing boiler" },
  "hvac-heat-pump": { ko: "히트펌프 시스템 전환", en: "Heat-pump conversion" },
  "hvac-hrv": {
    ko: "열회수환기장치(HRV) 설치",
    en: "Heat-recovery ventilation (HRV)",
  },
  "lighting-led": { ko: "LED 조명 교체", en: "LED lighting" },
  "lighting-led-smart": {
    ko: "LED 조명 + 스마트 제어 시스템",
    en: "LED + smart controls",
  },
};

/** Shown for any `solar-pv-<roofType>`; the kWp lives in the claim line. */
const SOLAR_PV_NAME = { ko: "태양광 발전(PV)", en: "Solar PV" };

/**
 * The chip's name in the reader's language.
 *
 * Falls back to the generator's own `name` for an id with no entry — a new
 * measure should appear under its real name rather than vanish or render an
 * id, and the missing entry is then visible on screen rather than silent.
 */
export function measureDisplayName(
  measureId: string,
  lang: "ko" | "en",
  fallback: string,
): string {
  if (measureId.startsWith("solar-pv-")) return SOLAR_PV_NAME[lang];
  return MEASURE_NAMES[measureId]?.[lang] ?? fallback;
}

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
    // Module surface area from the same sizing the economics used, via the
    // delta's change row. Geometric arrays use module count × module area.
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
