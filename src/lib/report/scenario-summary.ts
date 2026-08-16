// src/lib/report/scenario-summary.ts
// P0-02 — pure derivations shared by every report/export surface (energy-audit
// preview, PDF, CSV, JSON) so they all carry the SAME scenario financials the
// twin-stage simulator displays. No React, no side effects.

import { computeIrr, type BudgetSelection } from "@/lib/retrofit/economic-model";
import type { EnergyAuditInput } from "@/lib/report/templates/energy-audit";

/** Same knapsack the twin shows, shaped for the energy-audit takeaway. */
export function scenarioToAuditSummary(
  selection: BudgetSelection | null,
): EnergyAuditInput["retrofitSummary"] | undefined {
  if (!selection || selection.selected.length === 0) return undefined;

  const totalAnnualSaving = selection.selected.reduce(
    (sum, measure) => sum + measure.annualEnergySaving,
    0,
  );

  const payback = Number.isFinite(selection.discountedPayback)
    ? selection.discountedPayback
    : null;

  return {
    totalInvestment: selection.effectiveCapex,
    totalAnnualSaving,
    payback,
    npv: selection.npv,
    topMeasures: [...selection.selected]
      .sort((a, b) => (b.financials?.npv ?? 0) - (a.financials?.npv ?? 0))
      .map((measure) => ({
        description: measure.name || measure.description,
        payback: measure.financials?.discountedPayback ?? measure.paybackYears,
        npv: measure.financials?.npv,
      })),
  };
}

/**
 * Portfolio-level financials derived from a knapsack BudgetSelection.
 * All fields are JSON-safe: non-finite engine values (Infinity discounted
 * payback) are converted to `null` at this boundary — `null` means
 * "no honest claim possible", never 0.
 */
export interface ScenarioPortfolioSummary {
  /** Sum of raw estimated costs of the selected measures. KRW. */
  totalInvestment: number;
  /** Sum of annual energy savings of the selected measures. kWh/yr. */
  totalAnnualSavingKwh: number;
  /** Sum of annual cost savings of the selected measures. KRW/yr. */
  totalAnnualCostSavingKrw: number;
  /** Simple payback (investment / annual cost saving). `null` when saving ≤ 0. */
  payback: number | null;
  /** Knapsack aggregate NPV. KRW. */
  npv: number;
  /** Portfolio IRR from the aggregate cash flow vs effective CAPEX. `null` when undefined. */
  irr: number | null;
  /** Discounted payback of the aggregate. `null` when never recovered. */
  discountedPayback: number | null;
  /** Subsidy-adjusted CAPEX of the selection. KRW. */
  effectiveCapex: number;
  /** Up to 3 selected measures, shortest simple payback first. */
  topMeasures: { description: string; payback: number }[];
  /** Ids of every selected measure (traceability to the simulator state). */
  measureIds: string[];
}

/**
 * Derive the portfolio summary from a knapsack selection.
 * Returns `null` when there is no selection or nothing was selected —
 * consumers must then render their explicit "no analysis" state.
 */
export function buildScenarioPortfolioSummary(
  selection: BudgetSelection | null
): ScenarioPortfolioSummary | null {
  if (!selection || selection.selected.length === 0) return null;

  const totalInvestment = selection.selected.reduce((s, m) => s + m.estimatedCost, 0);
  const totalAnnualSavingKwh = selection.selected.reduce(
    (s, m) => s + m.annualEnergySaving,
    0
  );
  const totalAnnualCostSavingKrw = selection.selected.reduce(
    (s, m) => s + m.annualCostSaving,
    0
  );

  const payback =
    totalAnnualCostSavingKrw > 0 ? totalInvestment / totalAnnualCostSavingKrw : null;

  const discountedPayback = Number.isFinite(selection.discountedPayback)
    ? selection.discountedPayback
    : null;

  // Portfolio IRR over the aggregate: outflow = effective CAPEX, inflows =
  // aggregate nominal cash flow. computeIrr returns null when no positive
  // root exists (savings never cover capex) — kept as-is, never fabricated.
  const irr = computeIrr(selection.effectiveCapex, selection.aggregateCashFlow);

  const topMeasures = [...selection.selected]
    .sort((a, b) => a.paybackYears - b.paybackYears)
    .slice(0, 3)
    .map((m) => ({ description: m.description, payback: m.paybackYears }));

  return {
    totalInvestment,
    totalAnnualSavingKwh,
    totalAnnualCostSavingKrw,
    payback,
    npv: selection.npv,
    irr,
    discountedPayback,
    effectiveCapex: selection.effectiveCapex,
    topMeasures,
    measureIds: selection.selected.map((m) => m.id),
  };
}

/**
 * Honest twin-fidelity tier from actual data availability:
 *   3 — a calibration result exists (model corrected against measured energy)
 *   2 — ≥1 actual-energy row is present (measured data, not yet calibrated)
 *   1 — public ledger data only
 * Never hardcode a level at a call site — derive it here.
 */
export function deriveFidelityLevel(
  hasCalibration: boolean,
  hasActualEnergy: boolean
): 1 | 2 | 3 {
  if (hasCalibration) return 3;
  if (hasActualEnergy) return 2;
  return 1;
}
