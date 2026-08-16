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
// the user's budget (at most one measure per `conflictGroup ?? exclusiveGroup`).
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
 *
 * P2-10 (a) — when `loanTermYears` is omitted the engine falls back to the
 * legacy permanent-WACC NPV so the "buy-down over the full horizon" path
 * remains comparable. Presets always set `loanTermYears`.
 */
export interface FinancingMix {
  /** Fraction of effective CAPEX financed via subsidized loan (0..1). */
  debtFraction: number;
  /** Pre-subsidy nominal loan rate, fraction (e.g., 0.055 for 5.5%). */
  loanRatePreSubsidy: number;
  /** Interest-support buy-down, percentage points (e.g., 0.045 for 4.5pp). */
  interestSupportPp: number;
  /**
   * P2-10 (a) — loan term in years. The interest-support buy-down applies
   * only over the loan term. After year `loanTermYears` the discount
   * schedule reverts to the pure-equity `discountRate`. Absent ⇒ legacy
   * behavior (buy-down applied over the full horizon via permanent WACC).
   */
  loanTermYears?: number;
  /**
   * P2-10 (g) — program per-applicant loan cap, KRW. When the financed portion
   * (debtFraction × selected effective CAPEX) exceeds this, `selectMeasuresForBudget`
   * sets `loanCapExceeded` (flag, not a silent clamp). Absent ⇒ uncapped.
   */
  loanCapKrw?: number;
}

/**
 * P2-10 (c)/(e) — a single escalation component of a measure's saving stream.
 * Some measures blend cash flows that escalate differently (a heat pump saves
 * gas while spending electricity; solar self-consumption tracks the retail
 * electricity price while its feed-in portion is a fixed SMP/REC tariff). When
 * a measure carries `escalationComponents`, `projectCashFlow` escalates each
 * component independently instead of applying one fuel rate to the blended
 * `annualCostSaving`.
 */
export interface EscalationComponent {
  /** Year-1 nominal amount, KRW. May be negative (e.g. electricity SPENT). */
  amount: number;
  /**
   * Fuel whose escalation applies. Omit together with an explicit `escalation`
   * for a flat (non-escalating) stream such as a fixed feed-in tariff.
   */
  fuel?: Fuel;
  /** Explicit escalation fraction; overrides the fuel lookup. 0 = flat. */
  escalation?: number;
  /** Annual output/performance degradation fraction (e.g. 0.005 = 0.5%/yr). */
  degradationRate?: number;
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
   * When present, the interest support is valued as `subsidyValue` (accuracy
   * wave) unless `loanTermYears` is omitted, in which case NPV uses the
   * legacy permanent WACC (P2-10 comparison path).
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
 * Legacy blended WACC used only when `financingMix.loanTermYears` is absent
 * (P2-10 permanent-buy-down comparison). Not used by 2026 presets.
 */
function financingWacc(assumptions: EconomicAssumptions): number {
  const { discountRate, financingMix } = assumptions;
  if (!financingMix) return discountRate;
  const debtFraction = Math.min(1, Math.max(0, financingMix.debtFraction));
  if (debtFraction === 0) return discountRate;
  const effectiveLoanRate = Math.max(
    0,
    financingMix.loanRatePreSubsidy - financingMix.interestSupportPp,
  );
  return debtFraction * effectiveLoanRate + (1 - debtFraction) * discountRate;
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
   * All discounting at the base `discountRate` (except the legacy permanent-WACC
   * path when `loanTermYears` is omitted). KRW.
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
   * 0 when no `financingMix` is configured. Already included in `npv` on the
   * accuracy-wave path. KRW.
   */
  subsidyValue: number;
  /** Fuel used for escalation (resolved from measure or inferred). */
  resolvedFuel: Fuel;
}

/**
 * P1-03 — map the material model's heating descriptor onto the Fuel union.
 * The single mapping point: generators never parse fuelType/systemType
 * strings themselves.
 *
 * Mapping table:
 *   fuelType "gas"           → "gas"
 *   fuelType "district-heat" → "districtHeating"
 *   fuelType "electric"      → "electricity"
 *   fuelType "heat-pump"     → "electricity" (heat pumps run on electricity)
 *   fuelType "oil"           → "gas" — PROXY: ENERGY_PRICES has no oil
 *                              tariff; gas is the closest KRW/kWh benchmark.
 *   otherwise: systemType "district" ⇒ "districtHeating" (corroborating
 *   signal); both absent/unknown ⇒ "gas" (legacy default).
 */
export function resolveHeatingFuel(heating: {
  systemType: string;
  fuelType: string;
}): Fuel {
  switch (heating.fuelType) {
    case "gas":
      return "gas";
    case "district-heat":
      return "districtHeating";
    case "electric":
    case "heat-pump":
      return "electricity";
    case "oil":
      return "gas"; // documented proxy — no oil tariff in ENERGY_PRICES
  }
  if (heating.systemType === "district") return "districtHeating";
  return "gas";
}

/**
 * Resolve which fuel's escalation to apply to a measure.
 *
 * Preference order:
 *   1. measure.fuel if present (explicit — P1-03 generators always set it on
 *      heating-side measures, so the heuristics below are unreachable for
 *      generator-produced measures)
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

/** Mutual-exclusion key: pivot `conflictGroup` wins, else local `exclusiveGroup`. */
function exclusionKey(measure: RetrofitMeasure): string | undefined {
  return measure.conflictGroup ?? measure.exclusiveGroup;
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
  const horizon = assumptions.analysisHorizonYears;
  // P1-02: savings stop at the equipment's useful life; the vector stays
  // horizon-length (zero-padded tail) so aggregation/indexing is unchanged.
  // TODO(P1-02-followup): replacement CAPEX, O&M costs, and salvage value
  // would extend the model here — deliberately out of scope for now.
  const years = Math.min(measure.lifetimeYears ?? horizon, horizon);
  const cashFlow: number[] = new Array(horizon);

  // P2-10 (c)/(e): blended streams escalate per-component. A heat pump's
  // gas-saved side escalates at the gas rate while its electricity-spent side
  // escalates faster; solar self-consumption tracks the electricity price while
  // the fixed feed-in tariff stays flat, and both degrade with panel age.
  const components = measure.escalationComponents;
  if (components && components.length > 0) {
    for (let t = 1; t <= horizon; t++) {
      if (t > years) {
        cashFlow[t - 1] = 0;
        continue;
      }
      let sum = 0;
      for (const c of components) {
        const esc =
          c.escalation ?? (c.fuel ? assumptions.energyEscalation[c.fuel] : 0);
        const deg = c.degradationRate ?? 0;
        sum +=
          c.amount * Math.pow(1 + esc, t - 1) * Math.pow(1 - deg, t - 1);
      }
      cashFlow[t - 1] = sum;
    }
    return { cashFlow, resolvedFuel: fuel };
  }

  const escalation = assumptions.energyEscalation[fuel];
  for (let t = 1; t <= horizon; t++) {
    cashFlow[t - 1] =
      t <= years ? measure.annualCostSaving * Math.pow(1 + escalation, t - 1) : 0;
  }
  return { cashFlow, resolvedFuel: fuel };
}

/**
 * P2-10 (a) — per-year cumulative discount factors for a set of assumptions.
 *
 * `factors[t-1]` = Π_{i=1..t} (1 + rate_i), where rate_i is the effective
 * discount rate in year i. With a `financingMix.loanTermYears`, the rate
 * during the term is `effectiveDiscountRate` and the pure-equity
 * `discountRate` applies afterward. Without a loanTermYears the rate is
 * constant (legacy behavior).
 */
export function buildDiscountFactors(assumptions: EconomicAssumptions): number[] {
  const horizon = assumptions.analysisHorizonYears;
  const wacc = effectiveDiscountRate(assumptions);
  const equity = assumptions.discountRate;
  const loanTerm = assumptions.financingMix?.loanTermYears;
  const factors: number[] = new Array(horizon);
  let acc = 1;
  for (let t = 1; t <= horizon; t++) {
    const rate = loanTerm !== undefined && t > loanTerm ? equity : wacc;
    acc *= 1 + rate;
    factors[t - 1] = acc;
  }
  return factors;
}

/**
 * NPV discounted by an explicit per-year cumulative-factor schedule.
 * NPV = -outflow + Σ_t cashFlow[t-1] / factors[t-1].
 */
export function computeNpvScheduled(
  outflow: number,
  cashFlow: number[],
  discountFactors: number[],
): number {
  let pv = -outflow;
  for (let t = 1; t <= cashFlow.length; t++) {
    pv += cashFlow[t - 1] / discountFactors[t - 1];
  }
  return pv;
}

/**
 * Discounted payback using an explicit per-year cumulative-factor schedule.
 * Returns Infinity when cumulative discounted savings never cover outflow.
 */
export function computeDiscountedPaybackScheduled(
  outflow: number,
  cashFlow: number[],
  discountFactors: number[],
): number {
  if (outflow <= 0) return 0;
  let cumulative = 0;
  for (let t = 1; t <= cashFlow.length; t++) {
    const pv = cashFlow[t - 1] / discountFactors[t - 1];
    if (cumulative + pv >= outflow) {
      const remaining = outflow - cumulative;
      const fraction = pv > 0 ? remaining / pv : 0;
      return t - 1 + fraction;
    }
    cumulative += pv;
  }
  return Infinity;
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
 *
 * P2-10 (a): if `loanTermYears` is omitted the NPV uses the legacy permanent
 * WACC so a full-horizon buy-down remains comparable to the scoped path.
 */
export function computeFinancials(
  measure: RetrofitMeasure,
  assumptions: EconomicAssumptions,
): MeasureFinancials {
  const effectiveCapex = applyEffectiveCapex(measure, assumptions);
  const { cashFlow, resolvedFuel } = projectCashFlow(measure, assumptions);
  const rate = effectiveDiscountRate(assumptions);

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

  // Legacy permanent-WACC path (loanTermYears omitted) — P2-10 comparison only.
  if (assumptions.financingMix && assumptions.financingMix.loanTermYears === undefined) {
    const wacc = financingWacc(assumptions);
    return {
      npv: computeNpv(effectiveCapex, cashFlow, wacc),
      irr: computeIrr(effectiveCapex, cashFlow),
      discountedPayback: computeDiscountedPayback(effectiveCapex, cashFlow, wacc),
      cashFlow,
      effectiveCapex,
      subsidyValue,
      resolvedFuel,
    };
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
  /**
   * P2-10 (g) — set when the loan-financed portion of the selected subset
   * (debtFraction × effectiveCapex) exceeds the program loan cap
   * (`financingMix.loanCapKrw`). The engine does not silently clamp the
   * budget — it flags so the UI can disclose that the scenario exceeds the
   * program's per-applicant loan limit. Absent/false when within the cap or
   * when no financingMix is configured.
   */
  loanCapExceeded?: boolean;
}

/**
 * Grouped 0/1 knapsack: pick the subset of measures that maximises summed
 * NPV subject to summed effective CAPEX ≤ budget, selecting AT MOST ONE
 * measure per `conflictGroup ?? exclusiveGroup` (audit finding #8 / P1-01 —
 * e.g. boiler upgrade vs heat-pump conversion are alternatives, never additive).
 *
 * Approach: branch over every feasible combination of group representatives
 * ({none} ∪ members per group) and run a plain 0/1 knapsack on each branch.
 * Groups are tiny (one pair today); branching is exact and cheap. Cap: beyond
 * 64 combinations fall back to greedy best-NPV-per-group representatives.
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

  const W = Math.floor(capexBudget / quantizationKrw);

  function solveKnapsack(candidates: typeof enriched): {
    selected: RetrofitMeasure[];
    npv: number;
    effectiveCapex: number;
  } {
    const weights = candidates.map((e) =>
      Math.max(1, Math.ceil(e.fin.effectiveCapex / quantizationKrw)),
    );
    const values = candidates.map((e) => e.fin.npv);

    const dp = new Array(W + 1).fill(0);
    const keep: boolean[][] = candidates.map(() => new Array(W + 1).fill(false));

    for (let i = 0; i < candidates.length; i++) {
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

    const selected: RetrofitMeasure[] = [];
    let w = W;
    let npv = 0;
    let effectiveCapex = 0;
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (keep[i][w]) {
        selected.push(candidates[i].measure);
        npv += candidates[i].fin.npv;
        effectiveCapex += candidates[i].fin.effectiveCapex;
        w -= weights[i];
      }
    }
    selected.reverse();
    return { selected, npv, effectiveCapex };
  }

  // P1-01 / audit #8: at most one measure per conflictGroup ?? exclusiveGroup.
  const freeMeasures = enriched.filter((e) => !exclusionKey(e.measure));
  const groups = new Map<string, typeof enriched>();
  for (const e of enriched) {
    const g = exclusionKey(e.measure);
    if (!g) continue;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(e);
  }

  const groupList = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, members]) =>
      [...members].sort((a, b) => a.measure.id.localeCompare(b.measure.id)),
    );

  const comboCount = groupList.reduce((n, g) => n * (g.length + 1), 1);
  let combos: (typeof enriched)[];
  if (comboCount > 64) {
    combos = [
      groupList.map((members) =>
        members.reduce((best, e) => (e.fin.npv > best.fin.npv ? e : best)),
      ),
    ];
  } else {
    combos = [[]];
    for (const members of groupList) {
      const next: (typeof enriched)[] = [];
      for (const combo of combos) {
        next.push(combo);
        for (const member of members) next.push([...combo, member]);
      }
      combos = next;
    }
  }

  let best: { selected: RetrofitMeasure[]; npv: number; effectiveCapex: number } | null =
    null;
  for (const combo of combos) {
    const result = solveKnapsack([...freeMeasures, ...combo]);
    if (
      best === null ||
      result.npv > best.npv ||
      (result.npv === best.npv && result.effectiveCapex < best.effectiveCapex) ||
      (result.npv === best.npv &&
        result.effectiveCapex === best.effectiveCapex &&
        result.selected.map((m) => m.id).join(",") <
          best.selected.map((m) => m.id).join(","))
    ) {
      best = result;
    }
  }
  let selected = best?.selected ?? [];

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

  const discountedPayback = computeDiscountedPaybackScheduled(
    totalEffectiveCapex,
    aggregateCashFlow,
    buildDiscountFactors(assumptions),
  );

  selected = selected.map((measure) => ({
    ...measure,
    financials: computeFinancials(measure, assumptions),
  }));

  const financing = assumptions.financingMix;
  const loanCapExceeded =
    financing?.loanCapKrw !== undefined
      ? financing.debtFraction * totalEffectiveCapex > financing.loanCapKrw
      : false;

  return {
    selected,
    npv: totalNpv,
    effectiveCapex: totalEffectiveCapex,
    aggregateCashFlow,
    discountedPayback,
    loanCapExceeded,
  };
}
