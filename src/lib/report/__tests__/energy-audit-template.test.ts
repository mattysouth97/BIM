// src/lib/report/__tests__/energy-audit-template.test.ts
// P0-02 — section 8 (Retrofit Recommendations) of the energy-audit template:
// table branch with real financials vs unchanged fallback text; null payback
// renders N/A, never a 0-year claim.

import { describe, it, expect } from "vitest";
import { buildEnergyAuditSections, type EnergyAuditInput } from "../templates/energy-audit";

function makeInput(overrides: Partial<EnergyAuditInput> = {}): EnergyAuditInput {
  return {
    building: {
      name: "서울에너지빌딩",
      address: "서울특별시 중구",
      useType: "업무시설",
      era: "2005",
      area: 1200,
      floors: 5,
    },
    fidelityLevel: 1,
    dataSources: ["Korean Building Ledger (건축물대장)"],
    envelope: { wallU: 0.5, roofU: 0.3, windowU: 2.4, airtightness: 4.5 },
    energy: {
      heatingDemand: 80,
      coolingDemand: 30,
      totalDemand: 130,
      energyGrade: "4",
      demandPerArea: 130,
    },
    co2: { total: 55, perArea: 45 },
    heatLossBreakdown: { walls: 40, roof: 15, windows: 30, floor: 5, ventilation: 10 },
    ...overrides,
  };
}

function section8(input: EnergyAuditInput) {
  const sections = buildEnergyAuditSections(input);
  return sections.find((s) => s.title === "Retrofit Recommendations")!;
}

describe("buildEnergyAuditSections — Retrofit Recommendations (P0-02)", () => {
  it("renders the unchanged fallback text when no retrofitSummary is provided", () => {
    const section = section8(makeInput());
    expect(section.content.type).toBe("text");
    expect((section.content as { type: "text"; text: string }).text).toBe(
      "No retrofit analysis available. Upgrade to Fidelity Level 2 or higher to unlock retrofit recommendations."
    );
  });

  it("renders the table branch with NPV, IRR, discounted payback, and effective CAPEX rows", () => {
    const section = section8(
      makeInput({
        retrofitSummary: {
          totalInvestment: 20_000_000,
          totalAnnualSaving: 40_000,
          payback: 4.2,
          topMeasures: [
            { description: "LED retrofit", payback: 2.5 },
            { description: "Heat pump", payback: 5.0 },
          ],
          npv: 6_500_000,
          irr: 0.124,
          discountedPayback: 6.8,
          effectiveCapex: 8_000_000,
        },
      })
    );

    expect(section.content.type).toBe("table");
    const raw = JSON.stringify(section.content);
    expect(raw).toContain("LED retrofit");
    expect(raw).toContain("Portfolio NPV");
    expect(raw).toContain("Portfolio IRR");
    expect(raw).toContain("Discounted Payback");
    expect(raw).toContain("Effective CAPEX");
  });

  it("renders N/A (never 0-year) for a null payback and null IRR", () => {
    const section = section8(
      makeInput({
        retrofitSummary: {
          totalInvestment: 20_000_000,
          totalAnnualSaving: 0,
          payback: null,
          topMeasures: [{ description: "Dead measure", payback: 3.1 }],
          npv: -1_000_000,
          irr: null,
          discountedPayback: null,
          effectiveCapex: 8_000_000,
        },
      })
    );

    const raw = JSON.stringify(section.content);
    expect(raw).toContain("N/A");
    // No fabricated instant payback: no "0.0 yr" style value in any row.
    expect(raw).not.toMatch(/"0\.0 yr"/);
    expect(raw).not.toContain("Infinity");
  });

  it("omits financial rows that are not provided (legacy summary shape still works)", () => {
    const section = section8(
      makeInput({
        retrofitSummary: {
          totalInvestment: 10_000_000,
          totalAnnualSaving: 20_000,
          payback: 5.5,
          topMeasures: [{ description: "LED retrofit", payback: 2.5 }],
        },
      })
    );

    expect(section.content.type).toBe("table");
    const raw = JSON.stringify(section.content);
    expect(raw).not.toContain("Portfolio NPV");
    expect(raw).not.toContain("Portfolio IRR");
    expect(raw).toContain("Portfolio Payback");
  });
});
