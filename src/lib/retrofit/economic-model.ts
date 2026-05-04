// src/lib/retrofit/economic-model.ts
//
// DCF financial enrichment for retrofit measures. Adds the layer the
// existing engine is missing:
//
//   * NPV  — discounted cumulative savings minus effective CAPEX
//   * IRR  — internal rate of return (bisection, monotonic-cash-flow assumption)
//   * Discounted payback — first year where cumulative discounted savings ≥ effective CAPEX
//   * Cash flow — year-by-year nominal cash flow with energy-price escalation
//   * Effective CAPEX — capital cost after Korean GX subsidy ratio applied
//
// Plus a 0/1 knapsack `selectMeasuresForBudget` so the question
// "If I were to input this much CAPEX, when would I see returns?" has
// a sharp answer: the optimal NPV-maximising subset of measures within
// the user's budget.
//
// Defaults reflect Korean GX context (see `DEFAULT_ECONOMIC_ASSUMPTIONS`
// in `./cost-database.ts`):
//   discount rate     = 5%   (KCEM/MOTIE green-retrofit project hurdle)
//   electricity esc.  = 5%/yr (KEPCO commercial 2020–2024 actual)
//   gas escalation    = 3%/yr (KOGAS commercial 2020–2024 actual)
//   district heat esc.= 3%/yr (KDHC 2020–2024 actual)
//   horizon           = 20 years (Korean energy-retrofit norm)
//   subsidy           = 0% by default; per-measure override via subsidyRatio

import type { RetrofitMeasure } from "./retrofit-types";

export type Fuel = "electricity" | "gas" | "districtHeating";

export interface EconomicAssumptions {
  /** Discount rate, fraction (0.05 = 5%). */
  discountRate: number;
  /** Annual nominal escalation per fuel, fraction (0.05 = 5%/yr). */
  energyEscalation: { electricity: number; gas: number; districtHeating: number };
  /** Cash-flow horizon, years. */
  analysisHorizonYears: number;
  /**
   * Per-measure subsidy ratio. Key = measure.id, value = fraction (0..1).
   * Effective CAPEX = estimatedCost × (1 - ratio). Default 0 if absent.
   */
  subsidyRatio?: Record<string, number>;
}

export interface MeasureFinancials {
  /** Net present value of (-effectiveCapex, then year-by-year discounted savings). KRW. */
  npv: number;
  /** Internal rate of return, fraction. `null` when no real positive root in [0, 1). */
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
  if (id === "envelope-window-replacement") return "electricity"; // documented approx
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
 * IRR via bisection on [lo=-0.99, hi=1.0] over 100 iterations.
 *
 * Assumes monotonic cash flow (true for retrofit measures: one outflow at
 * year 0, then non-negative inflows). Returns `null` if no sign change in
 * the bracket — typically when annualCostSaving ≤ 0 (a measure that loses
 * money — e.g. a heat-pump conversion when electricity is more expensive
 * than the gas it displaces).
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
    hi = 5.0;
    fHi = f(hi);
    if (fLo * fHi > 0) return null;
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
 * Apply a measure's subsidy fraction (from assumptions.subsidyRatio[id])
 * to its CAPEX. Default subsidy is 0% — pure unsubsidised analysis.
 */
function applyEffectiveCapex(
  measure: RetrofitMeasure,
  assumptions: EconomicAssumptions,
): number {
  const ratio = assumptions.subsidyRatio?.[measure.id] ?? 0;
  return measure.estimatedCost * (1 - ratio);
}

/**
 * Compute full financial enrichment for a single measure.
 */
export function computeFinancials(
  measure: RetrofitMeasure,
  assumptions: EconomicAssumptions,
): MeasureFinancials {
  const effectiveCapex = applyEffectiveCapex(measure, assumptions);
  const { cashFlow, resolvedFuel } = projectCashFlow(measure, assumptions);
  const npv = computeNpv(effectiveCapex, cashFlow, assumptions.discountRate);
  const irr = computeIrr(effectiveCapex, cashFlow);
  const discountedPayback = computeDiscountedPayback(
    effectiveCapex,
    cashFlow,
    assumptions.discountRate,
  );
  return {
    npv,
    irr,
    discountedPayback,
    cashFlow,
    effectiveCapex,
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
 * 0/1 knapsack: pick the subset of measures that maximises summed NPV
 * subject to summed effective CAPEX ≤ budget.
 *
 * Approach: pseudo-polynomial DP after quantising CAPEX to whole units of
 * `quantizationKrw` (default 1,000,000 KRW = ₩1M). Memory cost is O(N × W)
 * where W = ⌈budget / quantization⌉. For typical Korean retrofit projects
 * (N ≤ 15 measures, budget ≤ 2 × 10^9 KRW) this is at most ~30k cells —
 * trivial.
 *
 * Measures with negative NPV (would lose money even if free) are excluded
 * upfront — including them never improves the optimum.
 */
export function selectMeasuresForBudget(
  measures: RetrofitMeasure[],
  capexBudget: number,
  assumptions: EconomicAssumptions,
  quantizationKrw: number = 1_000_000,
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

  // DP table: dp[i][w] = max NPV using first i measures with capex ≤ w.
  // Only one row needed thanks to backward iteration.
  const dp = new Array(W + 1).fill(0);
  const keep: boolean[][] = enriched.map(() => new Array(W + 1).fill(false));

  for (let i = 0; i < enriched.length; i++) {
    const wi = weights[i];
    const vi = values[i];
    if (wi > W) continue;
    for (let w = W; w >= wi; w--) {
      const candidate = dp[w - wi] + vi;
      if (candidate > dp[w]) {
        dp[w] = candidate;
        keep[i][w] = true;
      }
    }
  }

  // Backtrack to recover the selected set.
  const selected: RetrofitMeasure[] = [];
  let w = W;
  for (let i = enriched.length - 1; i >= 0; i--) {
    if (keep[i][w]) {
      selected.push(enriched[i].measure);
      w -= weights[i];
    }
  }
  selected.reverse();

  // Aggregate metrics over the selected subset.
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
    assumptions.discountRate,
  );

  return {
    selected,
    npv: totalNpv,
    effectiveCapex: totalEffectiveCapex,
    aggregateCashFlow,
    discountedPayback,
  };
}
