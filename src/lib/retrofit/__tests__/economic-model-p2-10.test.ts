// src/lib/retrofit/__tests__/economic-model-p2-10.test.ts
// P2-10 — financial model refinements: loan-term buy-down, blended escalation
// (heat pump + solar feed-in/degradation), unified price, loan-cap flag.

import { describe, it, expect } from "vitest";
import {
  projectCashFlow,
  computeFinancials,
  buildDiscountFactors,
  effectiveDiscountRate,
  selectMeasuresForBudget,
  type EconomicAssumptions,
} from "../economic-model";
import {
  KOREAN_GR_PRIVATE_BASE,
  GR_PRIVATE_LOAN_TERM_YEARS,
  ENERGY_PRICES,
} from "../cost-database";
import { calculateSolarPotential } from "../solar-potential";
import { generateHvacRetrofits } from "../hvac-retrofits";
import type { RetrofitMeasure } from "../retrofit-types";

const ASSUMPTIONS: EconomicAssumptions = {
  discountRate: 0.05,
  energyEscalation: { electricity: 0.05, gas: 0.03, districtHeating: 0.03 },
  analysisHorizonYears: 20,
};

function makeMeasure(overrides: Partial<RetrofitMeasure>): RetrofitMeasure {
  return {
    id: "test",
    name: "Test",
    category: "envelope",
    estimatedCost: 100_000_000,
    annualEnergySaving: 5_000,
    annualCostSaving: 12_000_000,
    co2Reduction: 1,
    paybackYears: 8,
    description: "Test",
    ...overrides,
  };
}

// ── (a) loan-term-scoped buy-down ───────────────────────────────────────────
describe("P2-10 (a) — loan-term buy-down does not subsidize the whole horizon", () => {
  it("discount schedule uses WACC during the loan term, equity rate after", () => {
    const factors = buildDiscountFactors(KOREAN_GR_PRIVATE_BASE);
    const wacc = effectiveDiscountRate(KOREAN_GR_PRIVATE_BASE); // 0.022
    const equity = KOREAN_GR_PRIVATE_BASE.discountRate; // 0.05
    const L = GR_PRIVATE_LOAN_TERM_YEARS; // 10
    // year L (≤ term) grows by 1+wacc; year L+1 (> term) grows by 1+equity.
    expect(factors[L - 1] / factors[L - 2]).toBeCloseTo(1 + wacc, 9);
    expect(factors[L] / factors[L - 1]).toBeCloseTo(1 + equity, 9);
  });

  it("NPV is strictly lower than a permanent-WACC (bugged) buy-down", () => {
    const m = makeMeasure({ lifetimeYears: 20 });
    const permanent: EconomicAssumptions = {
      ...KOREAN_GR_PRIVATE_BASE,
      financingMix: {
        ...KOREAN_GR_PRIVATE_BASE.financingMix!,
        loanTermYears: undefined, // old behavior: WACC over all 20 years
      },
    };
    const scoped = computeFinancials(m, KOREAN_GR_PRIVATE_BASE);
    const bugged = computeFinancials(m, permanent);
    expect(scoped.npv).toBeLessThan(bugged.npv);
  });
});

// ── (c) solar feed-in flat + degradation ────────────────────────────────────
describe("P2-10 (c) — solar feed-in does not escalate; output degrades", () => {
  it("splits into escalating self-consumption + flat feed-in components", () => {
    const solar = calculateSolarPotential(500, "flat", "seoul", 100);
    expect(solar.escalationComponents).toHaveLength(2);
    const [self, feed] = solar.escalationComponents!;
    expect(self.fuel).toBe("electricity");
    expect(feed.escalation).toBe(0); // feed-in flat
    expect(self.degradationRate).toBeGreaterThan(0);
    expect(feed.degradationRate).toBeGreaterThan(0);
  });

  it("year-N cash flow is below a fully-electricity-escalated stream", () => {
    const solar = calculateSolarPotential(500, "flat", "seoul", 100);
    const { cashFlow } = projectCashFlow(solar, ASSUMPTIONS);
    // Fully escalating the blended year-1 saving at 5% would exceed the real
    // stream, whose 30% feed-in is flat and whose output degrades.
    const y10Full = solar.annualCostSaving * Math.pow(1.05, 9);
    expect(cashFlow[9]).toBeLessThan(y10Full);
    expect(cashFlow[0]).toBeCloseTo(solar.annualCostSaving, 0); // year 1 unchanged
  });
});

// ── (d) unified electricity price ───────────────────────────────────────────
describe("P2-10 (d) — one electricity price engine-wide", () => {
  it("solar self-consumption defaults to the engine's ENERGY_PRICES.electricity", () => {
    const solar = calculateSolarPotential(500, "flat", "seoul", 100);
    const selfConsumedKWh = solar.annualGenerationKWh * 0.7;
    expect(solar.annualSelfConsumptionRevenue / selfConsumedKWh).toBeCloseTo(
      ENERGY_PRICES.electricity,
      6,
    );
    expect(ENERGY_PRICES.electricity).toBe(140);
  });
});

// ── (e) heat-pump blended escalation ────────────────────────────────────────
describe("P2-10 (e) — heat pump blends displaced-fuel vs electricity escalation", () => {
  const measures = generateHvacRetrofits(
    { heatingType: "boiler", heatingEfficiency: 0.6, age: 20 },
    1000,
    100_000,
    20_000,
    "gas",
  );
  const heatPump = measures.find((m) => m.id === "hvac-heat-pump")!;

  it("carries a gas-positive and an electricity-negative component", () => {
    expect(heatPump.escalationComponents).toHaveLength(2);
    const gas = heatPump.escalationComponents!.find((c) => c.fuel === "gas")!;
    const elec = heatPump.escalationComponents!.find((c) => c.fuel === "electricity")!;
    expect(gas.amount).toBeGreaterThan(0); // displaced gas cost saved
    expect(elec.amount).toBeLessThan(0); // electricity now spent
  });

  it("year-1 blended cash flow equals the net annual saving", () => {
    const { cashFlow } = projectCashFlow(heatPump, ASSUMPTIONS);
    expect(cashFlow[0]).toBeCloseTo(heatPump.annualCostSaving, 0);
  });
});

// ── (g) loan cap flagged, not silently clamped ──────────────────────────────
describe("P2-10 (g) — loan cap is flagged when the financed portion exceeds it", () => {
  const saver = makeMeasure({ id: "big", estimatedCost: 100_000_000, annualCostSaving: 20_000_000 });

  it("sets loanCapExceeded when debt portion > cap", () => {
    const capped: EconomicAssumptions = {
      ...KOREAN_GR_PRIVATE_BASE,
      financingMix: { ...KOREAN_GR_PRIVATE_BASE.financingMix!, loanCapKrw: 1_000_000 },
    };
    const sel = selectMeasuresForBudget([saver], 200_000_000, capped);
    expect(sel.selected.length).toBeGreaterThan(0);
    expect(sel.loanCapExceeded).toBe(true);
  });

  it("does not flag when within the cap", () => {
    const uncapped: EconomicAssumptions = {
      ...KOREAN_GR_PRIVATE_BASE,
      financingMix: { ...KOREAN_GR_PRIVATE_BASE.financingMix!, loanCapKrw: 1e15 },
    };
    const sel = selectMeasuresForBudget([saver], 200_000_000, uncapped);
    expect(sel.loanCapExceeded).toBe(false);
  });
});
