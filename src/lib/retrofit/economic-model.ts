// src/lib/retrofit/economic-model.ts
//
// DCF financial enrichment for retrofit measures. Adds the layer the
// existing engine is missing:
//
//   * NPV  — discounted cumulative savings minus effective CAPEX, plus the
//            interest-subsidy PV (`subsidyValue`) when a financingMix is set
//   * IRR  — internal rate of return (bisection, monotonic-cash-flow assumption)
//   * Discounted payback — first year where cumulative discounted savings ≥ effective CAPEX
//   * Cash flow — year-by-year nominal cash flow with energy-price escalation
//   * Effective CAPEX — capital cost after Korean GX subsidy ratio applied
//   * Subsidy value — PV of interest saved on the 그린리모델링 이자지원
//            amortizing loan (5-year equal-principal), discounted at the
//            BASE rate. All cash flows discount at the base rate; the loan
//            buy-down is an additive term, NOT a blended WACC.
//
// Plus a grouped 0/1 knapsack `selectMeasuresForBudget` so the question
// "If I were to input this much CAPEX, when would I see returns?" has
// a sharp answer: the optimal NPV-maximising subset of measures within
// the user's budget (at most one measure per `exclusiveGroup`).
//
// Defaults reflect Korean GX context (see `DEFAULT_ECONOMIC_ASSUMPTIONS`
// in `./cost-database.ts`):
//   discount rate     = 5%   (KCEM/MOTIE green-retrofit project hurdle)
//   electricity esc.  = 5%/yr (KEPCO commercial 2020–2024 actual)
//   gas escalation    = 3%/yr (KOGAS commercial 2020–2024 actual)
//   district heat esc.= 3%/yr (KDHC 2020–2024 actual)
//   horizon           = 20 years (Korean energy-retrofit norm)
//   subsidy           = 0% by default; per-measure override via subsidyRatio

import type { RetrofitMeasure, RetrofitCategory } from "./retrofit-types";

export type Fuel = "electricity" | "gas" | "districtHeating";

/**
 * Financing structure for the 그린리모델링 민간건축물 이자지원사업
 * (Green Remodeling private-building interest-support track) and any
 * future loan-financed retrofit programs.
 *
 * The interest-support buy-down is modeled as an ADDITIVE subsidy: the PV
 * of interest saved on the amortizing loan (`computeInterestSavedSchedule`),
 * discounted at the base rate and surfaced as `MeasureFinancials.subsidyValue`.
 * It does NOT change the discount rate (the old blended-WACC model wrongly
 * extended a 5-year support period across the whole 20-year horizon).
 */
export interface FinancingMix {
  /** Fraction of effective CAPEX financed via subsidized loan (0..1). */
  debtFraction: number;
  /** Pre-subsidy nominal loan rate, fraction (e.g., 0.055 for 5.5%). */
  loanRatePreSubsidy: number;
  /** Interest-support buy-down, percentage points (e.g., 0.045 for 4.5pp). */
  interestSupportPp: number;
  /** Optional program cap on the loan principal (KRW). Uncapped if absent. */
  loanCapKrw?: number;
}

export interface EconomicAssumptions {
  /** Equity / hurdle discount rate, fraction (0.05 = 5%). */
  discountRate: number;
  /** Annual nominal escalation per fuel, fraction (0.05 = 5%/yr). */
  energyEscalation: { electricity: number; gas: number; districtHeating: number };
  /** Cash-flow horizon, years. */
  analysisHorizonYears: number;
  /**
   * Per-measure subsidy ratio. Key = measure.id, value = fraction (0..1).
   * Most specific override; takes precedence over `subsidyByCategory`.
   * Effective CAPEX = estimatedCost × (1 - ratio). Default 0 if absent.
   */
  subsidyRatio?: Record<string, number>;
  /**
   * Per-category subsidy default. Applied when no `subsidyRatio[id]` exists.
   * Used by the 공공건축물 그린리모델링 presets to apply 50% / 70% across
   * envelope/HVAC/lighting while leaving renewable (solar PV → separate
   * 신재생에너지 보급사업) unsubsidized.
   */
  subsidyByCategory?: Partial<Record<RetrofitCategory, number>>;
  /**
   * Loan financing + interest-support structure (그린리모델링 민간 track).
   * When present, the effective discount rate becomes a WACC blending the
   * subsidized loan rate with `discountRate`. Absent = pure-equity analysis.
   */
  financingMix?: FinancingMix;
}

/**
 * Discount rate for NPV / discounted-payback computations.
 *
 * Audit correction: this used to blend `financingMix` into a WACC, which
 * permanently lowered the discount rate over the full 20-year horizon even
 * though the 이자지원 buy-down only lasts the loan term. All cash flows now
 * discount at the BASE rate; the interest support is valued separately as an
 * additive PV term (`computeInterestSavedSchedule` → `subsidyValue`).
 *
 * Kept as an exported helper for API stability — it now simply returns
 * `assumptions.discountRate`.
 */
export function effectiveDiscountRate(assumptions: EconomicAssumptions): number {
  return assumptions.discountRate;
}

/**
 * Typical 그린리모델링 이자지원 support period, years. The program buys down
 * loan interest for the support period only — not the full analysis horizon.
 */
export const LOAN_TERM_YEARS = 5;

/**
 * Year-by-year interest saved by the 이자지원 buy-down on an equal-principal
 * amortizing loan (audit finding #7).
 *
 *   principal   = min(debtFraction × effectiveCapex, loanCapKrw)
 *   balance(t)  = principal × (LOAN_TERM_YEARS − (t − 1)) / LOAN_TERM_YEARS
 *   saved(t)    = balance(t) × min(interestSupportPp, loanRatePreSubsidy)
 *
 * The buy-down is capped at the loan rate — interest support cannot save
 * more interest than the borrower actually pays. Returns a horizon-length
 * vector (zeros after the loan term).
 */
export function computeInterestSavedSchedule(
  effectiveCapex: number,
  financingMix: FinancingMix,
  horizonYears: number,
): number[] {
  const schedule = new Array<number>(horizonYears).fill(0);
  const debtFraction = Math.min(1, Math.max(0, financingMix.debtFraction));
  const principal = Math.min(
    debtFraction * effectiveCapex,
    financingMix.loanCapKrw ?? Number.POSITIVE_INFINITY,
  );
  const supportRate = Math.min(
    Math.max(0, financingMix.interestSupportPp),
    Math.max(0, financingMix.loanRatePreSubsidy),
  );
  if (principal <= 0 || supportRate <= 0) return schedule;
  const years = Math.min(LOAN_TERM_YEARS, horizonYears);
  for (let t = 1; t <= years; t++) {
    const outstanding = (principal * (LOAN_TERM_YEARS - (t - 1))) / LOAN_TERM_YEARS;
    schedule[t - 1] = outstanding * supportRate;
  }
  return schedule;
}

export interface MeasureFinancials {
  /**
   * Net present value: -effectiveCapex + discounted savings + `subsidyValue`.
   * All discounting at the base `discountRate`. KRW.
   */
  npv: number;
  /**
   * Internal rate of return, fraction, computed on the cash-flow vector
   * INCLUDING yearly interest-saved amounts. `null` when total (undiscounted)
   * inflows can't cover the outflow; clamped to 5.0 when the root exceeds
   * the bisection bracket (see `computeIrr`).
   */
  irr: number | null;
  /**
   * Discounted payback period, years. Linearly interpolated between integer
   * years; `Infinity` when cumulative discounted savings never cover capex.
   */
  discountedPayback: number;
  /** Year-by-year NOMINAL cash flow (escalation applied, not discounted). KRW. */
  cashFlow: number[];
  /** CAPEX after subsidy. KRW. */
  effectiveCapex: number;
  /**
   * PV of interest saved via the 이자지원 loan buy-down (audit finding #7).
   * 0 when no `financingMix` is configured. Already included in `npv`. KRW.
   */
  subsidyValue: number;
  /** Fuel used for escalation (resolved from measure or inferred). */
  resolvedFuel: Fuel;
}

/**
 * Resolve which fuel's escalation to apply to a measure.
 *
 * Preference order:
 *   1. measure.fuel if present (explicit)
 *   2. inferred from measure.id prefix
 *   3. inferred from measure.category
 *   4. fallback to electricity (most common)
 */
function resolveFuel(measure: RetrofitMeasure): Fuel {
  // 1. Explicit override on the measure.
  const explicit = (measure as RetrofitMeasure & { fuel?: Fuel }).fuel;
  if (explicit) return explicit;

  // 2. ID-prefix heuristics — matches the conventions used by the existing
  // envelope/hvac/lighting/solar generators.
  const id = measure.id.toLowerCase();
  if (id.startsWith("lighting-") || id.startsWith("solar-")) return "electricity";
  if (id === "hvac-heat-pump") return "gas"; // displaces gas; net saving dominated by gas side
  // Window replacement: HDD-derived heating saving → gas (audit finding #3;
  // previously special-cased to electricity, overstating escalation at 5%).
  if (id.startsWith("envelope-") || id.startsWith("hvac-")) return "gas";

  // 3. Category fallback.
  if (measure.category === "lighting" || measure.category === "renewable") return "electricity";
  if (measure.category === "envelope" || measure.category === "hvac") return "gas";

  // 4. Final fallback.
  return "electricity";
}

/**
 * Build the year-1..N cash-flow vector for a single measure.
 *
 * Year t (1-indexed) saving = annualCostSaving × (1 + escalation)^(t-1).
 * No outflow in year 1+ (CAPEX is treated as year 0, returned separately
 * via `effectiveCapex`).
 */
export function projectCashFlow(
  measure: RetrofitMeasure,
  assumptions: EconomicAssumptions,
): { cashFlow: number[]; resolvedFuel: Fuel } {
  const fuel = resolveFuel(measure);
  const escalation = assumptions.energyEscalation[fuel];
  const horizon = assumptions.analysisHorizonYears;
  const cashFlow: number[] = new Array(horizon);
  for (let t = 1; t <= horizon; t++) {
    cashFlow[t - 1] = measure.annualCostSaving * Math.pow(1 + escalation, t - 1);
  }
  return { cashFlow, resolvedFuel: fuel };
}

function discount(amount: number, rate: number, year: number): number {
  return amount / Math.pow(1 + rate, year);
}

/**
 * Compute NPV for a cash-flow series and a year-0 outflow.
 *
 * NPV = -outflow + Σ_{t=1..N} cashFlow[t-1] / (1+rate)^t
 */
export function computeNpv(
  outflow: number,
  cashFlow: number[],
  discountRate: number,
): number {
  let pv = -outflow;
  for (let t = 1; t <= cashFlow.length; t++) {
    pv += discount(cashFlow[t - 1], discountRate, t);
  }
  return pv;
}

/**
 * Sentinel returned when the IRR exceeds the bisection bracket ceiling
 * (500%). Extreme-but-real IRRs beyond this are clamped rather than
 * reported as `null` (which reads as "no return at all").
 */
export const IRR_MAX = 5.0;

/**
 * IRR via bisection on [lo=-0.5, hi=1.0], widening hi to 5.0 when needed,
 * over 100 iterations.
 *
 * Assumes monotonic cash flow (true for retrofit measures: one outflow at
 * year 0, then non-negative inflows). Returns `null` when total undiscounted
 * inflows can't cover the outflow (a money-losing measure — e.g. a heat-pump
 * conversion when electricity is more expensive than the gas it displaces).
 * When NPV is still positive at the widened ceiling (IRR > 500%), returns
 * the clamped sentinel `IRR_MAX` (audit finding #11).
 */
export function computeIrr(
  outflow: number,
  cashFlow: number[],
  tolerance: number = 1e-6,
  maxIterations: number = 100,
): number | null {
  if (outflow <= 0) return null; // degenerate; treat as N/A
  // Quick total check: if undiscounted total savings can't cover outflow,
  // there is no positive IRR.
  const totalSaving = cashFlow.reduce((s, v) => s + v, 0);
  if (totalSaving <= outflow) return null;

  const f = (rate: number) => computeNpv(outflow, cashFlow, rate);

  let lo = -0.5;
  let hi = 1.0;
  let fLo = f(lo);
  let fHi = f(hi);

  if (fLo * fHi > 0) {
    // No sign change in [-0.5, 1.0] — try wider bracket.
    hi = IRR_MAX;
    fHi = f(hi);
    if (fLo * fHi > 0) {
      // Both ends positive → NPV > 0 even at 500%: the true IRR lies above
      // the ceiling. Return the clamped sentinel instead of null.
      // Both ends negative can't reach here (totalSaving > outflow guarantees
      // a positive NPV as rate → -0.5), but guard with null for safety.
      return fLo > 0 && fHi > 0 ? IRR_MAX : null;
    }
  }

  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (Math.abs(fMid) < tolerance || (hi - lo) / 2 < tolerance) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Discounted payback period, years (linearly interpolated between integer years).
 * Returns Infinity if cumulative discounted savings never cover effective CAPEX.
 */
export function computeDiscountedPayback(
  outflow: number,
  cashFlow: number[],
  discountRate: number,
): number {
  if (outflow <= 0) return 0;
  let cumulative = 0;
  for (let t = 1; t <= cashFlow.length; t++) {
    const pv = discount(cashFlow[t - 1], discountRate, t);
    if (cumulative + pv >= outflow) {
      // Linear interpolation within year t.
      const remaining = outflow - cumulative;
      const fraction = pv > 0 ? remaining / pv : 0;
      return t - 1 + fraction;
    }
    cumulative += pv;
  }
  return Infinity;
}

/**
 * Resolve the subsidy ratio for a measure. Lookup priority:
 *   1. `subsidyRatio[measure.id]` — explicit per-measure override
 *   2. `subsidyByCategory[measure.category]` — category default (used by
 *      the 공공건축물 그린리모델링 presets)
 *   3. 0 — unsubsidised
 */
function resolveSubsidyRatio(
  measure: RetrofitMeasure,
  assumptions: EconomicAssumptions,
): number {
  const idRatio = assumptions.subsidyRatio?.[measure.id];
  if (typeof idRatio === "number") return idRatio;
  const catRatio = assumptions.subsidyByCategory?.[measure.category];
  if (typeof catRatio === "number") return catRatio;
  return 0;
}

/**
 * Apply the resolved subsidy fraction to a measure's CAPEX.
 * Default subsidy is 0% — pure unsubsidised analysis.
 */
function applyEffectiveCapex(
  measure: RetrofitMeasure,
  assumptions: EconomicAssumptions,
): number {
  const ratio = resolveSubsidyRatio(measure, assumptions);
  return measure.estimatedCost * (1 - ratio);
}

/**
 * Compute full financial enrichment for a single measure.
 *
 * All discounting uses the base `discountRate`. When a `financingMix` is
 * configured (그린리모델링 민간 이자지원), the interest saved on the 5-year
 * amortizing loan is (a) discounted into an additive `subsidyValue` included
 * in `npv`, and (b) added to the yearly cash-flow vector used for IRR and
 * discounted payback (audit finding #7).
 */
export function computeFinancials(
  measure: RetrofitMeasure,
  assumptions: EconomicAssumptions,
): MeasureFinancials {
  const effectiveCapex = applyEffectiveCapex(measure, assumptions);
  const { cashFlow, resolvedFuel } = projectCashFlow(measure, assumptions);
  const rate = effectiveDiscountRate(assumptions);

  // Interest-subsidy PV (additive term; zeros without a financingMix).
  let subsidyValue = 0;
  let flowWithSubsidy = cashFlow;
  if (assumptions.financingMix) {
    const interestSaved = computeInterestSavedSchedule(
      effectiveCapex,
      assumptions.financingMix,
      assumptions.analysisHorizonYears,
    );
    for (let t = 1; t <= interestSaved.length; t++) {
      subsidyValue += discount(interestSaved[t - 1], rate, t);
    }
    flowWithSubsidy = cashFlow.map((v, i) => v + interestSaved[i]);
  }

  const npv = computeNpv(effectiveCapex, cashFlow, rate) + subsidyValue;
  const irr = computeIrr(effectiveCapex, flowWithSubsidy);
  const discountedPayback = computeDiscountedPayback(effectiveCapex, flowWithSubsidy, rate);
  return {
    npv,
    irr,
    discountedPayback,
    cashFlow,
    effectiveCapex,
    subsidyValue,
    resolvedFuel,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Knapsack — "If I input this much CAPEX, what's the optimal subset?"
// ───────────────────────────────────────────────────────────────────────────

export interface BudgetSelection {
  /** The optimal NPV-maximising subset within the budget. */
  selected: RetrofitMeasure[];
  /** Sum of NPVs of the selected subset. */
  npv: number;
  /** Sum of effective CAPEX of the selected subset (≤ budget). */
  effectiveCapex: number;
  /** Year-by-year aggregate cash flow of the selected subset. */
  aggregateCashFlow: number[];
  /** Discounted payback of the aggregate. */
  discountedPayback: number;
}

/**
 * Grouped 0/1 knapsack: pick the subset of measures that maximises summed
 * NPV subject to summed effective CAPEX ≤ budget, selecting AT MOST ONE
 * measure per `exclusiveGroup` (audit finding #8 — e.g. boiler upgrade vs
 * heat-pump conversion are alternatives, never additive).
 *
 * Approach: pseudo-polynomial DP over groups after quantising CAPEX to whole
 * units of `quantizationKrw` (default 1,000,000 KRW = ₩1M). Each group offers
 * its members as alternatives plus "none". Ungrouped measures form singleton
 * groups (plain 0/1 behavior). Memory cost is O(G × W) where
 * W = ⌈budget / quantization⌉ — trivial for typical Korean retrofit projects
 * (N ≤ 15 measures, budget ≤ 2 × 10^9 KRW).
 *
 * Measures with negative NPV (would lose money even if free) are excluded
 * upfront — including them never improves the optimum.
 *
 * `baselineAnnualEnergyCost` (audit finding #9, optional): the building's
 * total annual energy cost. If the selected measures' combined
 * annualCostSaving exceeds it — physically impossible — all heating-side
 * savings (non-electricity fuels) are scaled down proportionally so the
 * total ≤ baseline, and the returned aggregates are recomputed from the
 * capped measures. Omitted = no capping (backward compatible).
 */
export function selectMeasuresForBudget(
  measures: RetrofitMeasure[],
  capexBudget: number,
  assumptions: EconomicAssumptions,
  quantizationKrw: number = 1_000_000,
  baselineAnnualEnergyCost?: number,
): BudgetSelection {
  if (capexBudget <= 0) {
    return {
      selected: [],
      npv: 0,
      effectiveCapex: 0,
      aggregateCashFlow: new Array(assumptions.analysisHorizonYears).fill(0),
      discountedPayback: Infinity,
    };
  }

  // Enrich each measure once, drop negative-NPV measures.
  const enriched = measures
    .map((m) => ({ measure: m, fin: computeFinancials(m, assumptions) }))
    .filter((e) => e.fin.npv > 0);

  if (enriched.length === 0) {
    return {
      selected: [],
      npv: 0,
      effectiveCapex: 0,
      aggregateCashFlow: new Array(assumptions.analysisHorizonYears).fill(0),
      discountedPayback: Infinity,
    };
  }

  // Quantise budget + each measure's effective CAPEX.
  const W = Math.floor(capexBudget / quantizationKrw);
  const weights = enriched.map((e) =>
    Math.max(1, Math.ceil(e.fin.effectiveCapex / quantizationKrw)),
  );
  const values = enriched.map((e) => e.fin.npv);

  // Group indices by exclusiveGroup; ungrouped measures are singleton groups.
  const groupIndex = new Map<string, number>();
  const groups: number[][] = [];
  for (let i = 0; i < enriched.length; i++) {
    const key = enriched[i].measure.exclusiveGroup;
    if (key === undefined) {
      groups.push([i]);
      continue;
    }
    const gi = groupIndex.get(key);
    if (gi === undefined) {
      groupIndex.set(key, groups.length);
      groups.push([i]);
    } else {
      groups[gi].push(i);
    }
  }

  // Grouped-knapsack DP: dp[w] = max NPV over the groups processed so far
  // with capex ≤ w; each group contributes at most one of its members.
  // `choice[g][w]` records which member (index into `enriched`) the optimum
  // takes for group g at capacity w, or -1 for "none".
  let dp = new Array<number>(W + 1).fill(0);
  const choice: number[][] = groups.map(() => new Array<number>(W + 1).fill(-1));

  for (let g = 0; g < groups.length; g++) {
    const prev = dp;
    dp = new Array<number>(W + 1);
    for (let w = 0; w <= W; w++) {
      let best = prev[w]; // take nothing from this group
      let bestItem = -1;
      for (const i of groups[g]) {
        const wi = weights[i];
        if (wi <= w) {
          const candidate = prev[w - wi] + values[i];
          if (candidate > best) {
            best = candidate;
            bestItem = i;
          }
        }
      }
      dp[w] = best;
      choice[g][w] = bestItem;
    }
  }

  // Backtrack to recover the selected set (original measure order preserved).
  const selectedIdx: number[] = [];
  let w = W;
  for (let g = groups.length - 1; g >= 0; g--) {
    const i = choice[g][w];
    if (i >= 0) {
      selectedIdx.push(i);
      w -= weights[i];
    }
  }
  selectedIdx.sort((a, b) => a - b);
  let selected: RetrofitMeasure[] = selectedIdx.map((i) => enriched[i].measure);

  // Baseline savings cap (audit finding #9): total savings cannot exceed the
  // building's annual energy cost. Scale the heating-side (non-electricity)
  // savings down proportionally; electricity-side (lighting/solar) savings
  // are left untouched. Floor the factor at 0 — if electric savings alone
  // exceed the baseline, heating savings drop to zero and the residual
  // excess stays (nothing left to scale).
  if (baselineAnnualEnergyCost !== undefined && selected.length > 0) {
    const totalSaving = selected.reduce((s, m) => s + m.annualCostSaving, 0);
    if (totalSaving > baselineAnnualEnergyCost) {
      const heatingSum = selected.reduce(
        (s, m) => (resolveFuel(m) === "electricity" ? s : s + m.annualCostSaving),
        0,
      );
      if (heatingSum > 0) {
        const excess = totalSaving - baselineAnnualEnergyCost;
        const factor = Math.max(0, (heatingSum - excess) / heatingSum);
        selected = selected.map((m) =>
          resolveFuel(m) === "electricity"
            ? m
            : { ...m, annualCostSaving: m.annualCostSaving * factor },
        );
      }
    }
  }

  // Aggregate metrics over the selected (possibly savings-capped) subset.
  const horizon = assumptions.analysisHorizonYears;
  const aggregateCashFlow = new Array(horizon).fill(0);
  let totalEffectiveCapex = 0;
  let totalNpv = 0;
  for (const measure of selected) {
    const fin = computeFinancials(measure, assumptions);
    totalEffectiveCapex += fin.effectiveCapex;
    totalNpv += fin.npv;
    for (let t = 0; t < horizon; t++) {
      aggregateCashFlow[t] += fin.cashFlow[t];
    }
  }

  const discountedPayback = computeDiscountedPayback(
    totalEffectiveCapex,
    aggregateCashFlow,
    effectiveDiscountRate(assumptions),
  );

  // Re-attach DCF so the report/twin takeaway does not show "—" per measure.
  selected = selected.map((measure) => ({
    ...measure,
    financials: computeFinancials(measure, assumptions),
  }));

  return {
    selected,
    npv: totalNpv,
    effectiveCapex: totalEffectiveCapex,
    aggregateCashFlow,
    discountedPayback,
  };
}
