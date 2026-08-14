import type { BudgetSelection } from "@/lib/retrofit/economic-model";
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

  return {
    totalInvestment: selection.effectiveCapex,
    totalAnnualSaving,
    payback: selection.discountedPayback,
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
