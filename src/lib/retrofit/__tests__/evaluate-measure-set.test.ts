// `evaluateMeasureSet` prices the work the USER chose. It is the tail the
// knapsack now ends with, so a hand-picked set and the optimum are one
// computation — these tests pin the half the knapsack never exercised: an
// arbitrary set, under each 그린리모델링 financing preset.
//
// The question they settle, raised from a Playwright run where clicking
// 공공 지자체 left the whole rail byte-identical on four buildings: do the
// public CAPEX presets reach the pricing at all, or is a chosen set simply
// made of measures those presets do not subsidise? The presets key on
// `measure.category`, and `renewable` is deliberately absent from them — solar
// is routed to the separate 신재생에너지 보급사업 — so a PV-only selection is
// genuinely unmoved by a 70 % track while an HVAC one is not. Those are very
// different facts to see on screen, and only one of them is a bug.

import { describe, it, expect } from "vitest";
import type { RetrofitMeasure } from "../retrofit-types";
import { evaluateMeasureSet } from "../economic-model";
import { KOREAN_GR_PRESETS } from "../cost-database";

function measure(
  id: string,
  category: RetrofitMeasure["category"],
  estimatedCost: number,
): RetrofitMeasure {
  return {
    id,
    name: id,
    category,
    description: id,
    estimatedCost,
    annualEnergySaving: 5_000,
    annualCostSaving: 500_000,
    co2Reduction: 1,
    paybackYears: 8,
  };
}

const HRV = measure("hvac-hrv", "hvac", 5_000_000);
const PV = measure("solar-pv-flat", "renewable", 20_000_000);
const WALL = measure("envelope-wall-insulation", "envelope", 10_000_000);

const NONE = KOREAN_GR_PRESETS.none;
const LOCAL = KOREAN_GR_PRESETS["public-local"]; // CAPEX 70 %
const SEOUL = KOREAN_GR_PRESETS["public-seoul-or-central"]; // CAPEX 50 %

describe("evaluateMeasureSet — the public CAPEX presets do reach the pricing", () => {
  it("prices an HVAC measure at 30 % under the 70 % track", () => {
    expect(evaluateMeasureSet([HRV], NONE).effectiveCapex).toBeCloseTo(5_000_000, 6);
    expect(evaluateMeasureSet([HRV], LOCAL).effectiveCapex).toBeCloseTo(1_500_000, 6);
  });

  it("prices an envelope measure at 50 % under the 50 % track", () => {
    expect(evaluateMeasureSet([WALL], SEOUL).effectiveCapex).toBeCloseTo(5_000_000, 6);
  });

  it("leaves a RENEWABLE measure untouched by either public track", () => {
    // Not a bug: `subsidyByCategory` omits `renewable` on purpose, because PV
    // is funded by 신재생에너지 보급사업, a different programme. A PV-only
    // selection under a "CAPEX 70%" chip is therefore genuinely unchanged.
    for (const preset of [LOCAL, SEOUL]) {
      expect(evaluateMeasureSet([PV], preset).effectiveCapex).toBeCloseTo(
        20_000_000,
        6,
      );
    }
  });

  it("subsidises only the eligible part of a mixed set", () => {
    // HRV + PV, the shape that made a rail look frozen: 5M → 1.5M on the HRV,
    // 20M untouched on the PV, so the total moves by exactly ₩350만 — small
    // against 25M, and easy to read as "nothing happened" on screen.
    const before = evaluateMeasureSet([HRV, PV], NONE).effectiveCapex;
    const after = evaluateMeasureSet([HRV, PV], LOCAL).effectiveCapex;
    expect(before).toBeCloseTo(25_000_000, 6);
    expect(after).toBeCloseTo(21_500_000, 6);
    expect(before - after).toBeCloseTo(3_500_000, 6);
  });

  it("is genuinely unmoved when the whole chosen set is renewable", () => {
    // The case a financing chip must not imply it changed something.
    const before = evaluateMeasureSet([PV], NONE);
    const after = evaluateMeasureSet([PV], LOCAL);
    expect(after.effectiveCapex).toBe(before.effectiveCapex);
    expect(after.npv).toBeCloseTo(before.npv, 6);
  });

  it("prices an empty set as zero rather than throwing", () => {
    const empty = evaluateMeasureSet([], LOCAL);
    expect(empty.selected).toEqual([]);
    expect(empty.effectiveCapex).toBe(0);
    expect(empty.npv).toBe(0);
  });
});
