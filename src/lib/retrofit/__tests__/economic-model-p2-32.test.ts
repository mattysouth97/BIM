// P2-32 — the interest-support buy-down must amortize over the loan term the
// caller declares, not over a constant inside the engine.
//
// Note on what is and is not being asserted here. The dossier does NOT publish
// a fixed loan term — §9.2 says Korean retrofit loans run 5–10 years — so
// neither 5 nor 10 is a verified fact. These tests therefore assert only that
// the schedule honours the term it is GIVEN. Which term the presets should
// declare stays a documented assumption in cost-database.ts, where it is
// labelled as one.

import { describe, expect, it } from "vitest";

import {
  computeInterestSavedSchedule,
  LOAN_TERM_YEARS,
  type FinancingMix,
} from "../economic-model";
import {
  GR_PRIVATE_LOAN_TERM_YEARS,
  KOREAN_GR_PRIVATE_BASE,
} from "../cost-database";

const CAPEX = 100_000_000;
const HORIZON = 20;

function mix(overrides: Partial<FinancingMix> = {}): FinancingMix {
  return {
    debtFraction: 0.7,
    loanRatePreSubsidy: 0.055,
    interestSupportPp: 0.045,
    loanTermYears: 10,
    ...overrides,
  };
}

/** Equal-principal: balance in year t is P × (term − (t−1)) / term. */
function expectedSchedule(term: number, horizon: number): number[] {
  const principal = 0.7 * CAPEX;
  const supportRate = 0.045;
  const out = new Array<number>(horizon).fill(0);
  for (let t = 1; t <= Math.min(term, horizon); t++) {
    out[t - 1] = ((principal * (term - (t - 1))) / term) * supportRate;
  }
  return out;
}

describe("P2-32 — buy-down honours the declared loan term", () => {
  it("pays over all ten years of a ten-year term", () => {
    const schedule = computeInterestSavedSchedule(CAPEX, mix(), HORIZON);
    expect(schedule.filter((v) => v > 0)).toHaveLength(10);
    // The regression this pins: year 6 was zero, because the schedule ran on
    // the engine's own 5-year constant instead of the caller's term.
    expect(schedule[5]).toBeGreaterThan(0);
    expect(schedule[9]).toBeGreaterThan(0);
    expect(schedule[10]).toBe(0);
  });

  it("amortizes equal-principal across the declared term", () => {
    const schedule = computeInterestSavedSchedule(CAPEX, mix(), HORIZON);
    expectedSchedule(10, HORIZON).forEach((value, index) => {
      expect(schedule[index]).toBeCloseTo(value, 6);
    });
  });

  it("honours a short term as readily as a long one", () => {
    const schedule = computeInterestSavedSchedule(
      CAPEX,
      mix({ loanTermYears: 3 }),
      HORIZON,
    );
    expect(schedule.filter((v) => v > 0)).toHaveLength(3);
    expectedSchedule(3, HORIZON).forEach((value, index) => {
      expect(schedule[index]).toBeCloseTo(value, 6);
    });
  });

  it("truncates a term longer than the horizon without overrunning it", () => {
    const horizon = 5;
    const schedule = computeInterestSavedSchedule(
      CAPEX,
      mix({ loanTermYears: 30 }),
      horizon,
    );
    expect(schedule).toHaveLength(horizon);
    expect(schedule.every((v) => Number.isFinite(v))).toBe(true);
    // A 30-year loan seen through a 5-year window shows the first five years
    // of a 30-year amortization — still declining, never renormalized to fit.
    expectedSchedule(30, horizon).forEach((value, index) => {
      expect(schedule[index]).toBeCloseTo(value, 6);
    });
  });

  it("falls back to the engine default when no term is declared", () => {
    const { loanTermYears: _omitted, ...noTerm } = mix();
    const schedule = computeInterestSavedSchedule(CAPEX, noTerm, HORIZON);
    expect(schedule.filter((v) => v > 0)).toHaveLength(LOAN_TERM_YEARS);
    expectedSchedule(LOAN_TERM_YEARS, HORIZON).forEach((value, index) => {
      expect(schedule[index]).toBeCloseTo(value, 6);
    });
  });

  it("values the real private-track preset over its own declared term", () => {
    const financingMix = KOREAN_GR_PRIVATE_BASE.financingMix;
    expect(financingMix).toBeDefined();
    const schedule = computeInterestSavedSchedule(
      CAPEX,
      financingMix!,
      KOREAN_GR_PRIVATE_BASE.analysisHorizonYears,
    );
    expect(schedule.filter((v) => v > 0)).toHaveLength(
      GR_PRIVATE_LOAN_TERM_YEARS,
    );
  });
});
