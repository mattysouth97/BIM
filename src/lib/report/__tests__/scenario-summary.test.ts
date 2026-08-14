import { describe, expect, it } from "vitest";
import type { BudgetSelection } from "@/lib/retrofit/economic-model";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";
import { scenarioToAuditSummary } from "../scenario-summary";
import { buildEnergyAuditSections } from "../templates/energy-audit";
import type { EnergyAuditInput } from "../templates/energy-audit";

function measure(partial: Partial<RetrofitMeasure> & Pick<RetrofitMeasure, "id" | "name">): RetrofitMeasure {
  return {
    category: "hvac",
    estimatedCost: 80_000_000,
    annualEnergySaving: 100_000,
    annualCostSaving: 20_000_000,
    co2Reduction: 10,
    paybackYears: 6,
    description: partial.name,
    financials: {
      npv: 170_000_000,
      irr: 0.21,
      discountedPayback: 5.7,
      cashFlow: [],
      effectiveCapex: 80_000_000,
      subsidyValue: 0,
      resolvedFuel: "electricity",
    },
    ...partial,
  };
}

const selection: BudgetSelection = {
  selected: [
    measure({ id: "hrv", name: "열회수환기장치(HRV) 설치" }),
    measure({
      id: "pv",
      name: "Solar PV",
      financials: {
        npv: 140_000_000,
        irr: 0.12,
        discountedPayback: 10.9,
        cashFlow: [],
        effectiveCapex: 170_000_000,
        subsidyValue: 0,
        resolvedFuel: "electricity",
      },
    }),
  ],
  npv: 310_000_000,
  effectiveCapex: 250_000_000,
  aggregateCashFlow: [],
  discountedPayback: 8.5,
};

describe("scenarioToAuditSummary", () => {
  it("maps the twin knapsack so the report can take the same answer away", () => {
    const summary = scenarioToAuditSummary(selection);
    expect(summary).toBeDefined();
    expect(summary?.npv).toBe(310_000_000);
    expect(summary?.totalInvestment).toBe(250_000_000);
    expect(summary?.topMeasures.map((m) => m.description)).toEqual([
      "열회수환기장치(HRV) 설치",
      "Solar PV",
    ]);
  });

  it("returns undefined when nothing is selected", () => {
    expect(scenarioToAuditSummary(null)).toBeUndefined();
    expect(
      scenarioToAuditSummary({
        selected: [],
        npv: 0,
        effectiveCapex: 0,
        aggregateCashFlow: [],
        discountedPayback: Infinity,
      }),
    ).toBeUndefined();
  });
});

const baseInput: EnergyAuditInput = {
  building: {
    name: "데모 오피스 타워",
    address: "서울",
    useType: "업무시설",
    era: "2008",
    area: 8000,
    floors: 12,
  },
  fidelityLevel: 1,
  dataSources: ["대장"],
  envelope: { wallU: 0.6, roofU: 0.3, windowU: 2.1, airtightness: 3.5 },
  energy: {
    heatingDemand: 68,
    coolingDemand: 8,
    totalDemand: 76,
    energyGrade: "1",
    demandPerArea: 76,
  },
  co2: { total: 170, perArea: 17.4 },
  heatLossBreakdown: {
    walls: 1,
    roof: 1,
    windows: 1,
    floor: 1,
    ventilation: 1,
  },
};

describe("buildEnergyAuditSections retrofit takeaway", () => {
  it("prints the twin scenario, not a fidelity-gate lie", () => {
    const sections = buildEnergyAuditSections({
      ...baseInput,
      retrofitSummary: scenarioToAuditSummary(selection),
    });
    const retrofit = sections.find((s) => s.titleKo === "개보수 권장 사항");
    expect(retrofit?.content.type).toBe("table");
    const blob = JSON.stringify(retrofit);
    expect(blob).toContain("열회수환기장치(HRV) 설치");
    expect(blob).toContain("포트폴리오 NPV");
    expect(blob).not.toMatch(/Fidelity Level 2/);
  });

  it("empty copy points back to the twin, not a missing engine", () => {
    const sections = buildEnergyAuditSections(baseInput);
    const retrofit = sections.find((s) => s.titleKo === "개보수 권장 사항");
    expect(retrofit?.content.type).toBe("text");
    if (retrofit?.content.type === "text") {
      expect(retrofit.content.text).toMatch(/트윈/);
      expect(retrofit.content.text).not.toMatch(/Fidelity Level 2/);
    }
  });
});
