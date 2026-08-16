// src/lib/report/__tests__/report-engine.test.ts
// P0-02 — PDF-path assemblers: retrofit financial rows render honestly
// (null payback → 회수 불가, never 0.0년) and the energy-audit assembler
// carries the retrofit summary when provided.

import { describe, it, expect } from "vitest";
import { assembleEnergyAuditReport, assembleRetrofitReport } from "../report-engine";
import { assembleRetrofitReport as buildRetrofitData } from "@/lib/retrofit/retrofit-report";
import type { EnergyMetrics } from "@/hooks/use-energy-metrics";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";

const BUILDING = { name: "서울에너지빌딩", address: "서울특별시 중구", fidelityLevel: 1 as const };

const METRICS = {
  grade: "4",
  demand: {
    heatingDemand: 60_000,
    coolingDemand: 25_000,
    totalDemand: 95_000,
    demandPerSqm: 95,
  },
  co2: { totalCO2: 42, co2PerSqm: 35 },
  heatLoss: {
    elements: [{ element: "Walls", heatLoss: 1200, heatLossPerSqm: 1.0 }],
    totalHeatLoss: 1200,
    totalHeatLossPerSqm: 1.0,
  },
  predictedVsActualDelta: null,
} as unknown as EnergyMetrics;

function makeMeasure(overrides: Partial<RetrofitMeasure> & { id: string }): RetrofitMeasure {
  return {
    name: "Test measure",
    category: "envelope",
    description: "Test measure description",
    estimatedCost: 5_000_000,
    annualEnergySaving: 10_000,
    annualCostSaving: 1_200_000,
    paybackYears: 4.2,
    co2Reduction: 4.5,
    ...overrides,
  };
}

describe("assembleRetrofitReport (PDF engine, P0-02)", () => {
  it("renders 회수 불가 (never 0.0년) when the portfolio payback is null", () => {
    const data = buildRetrofitData([
      makeMeasure({ id: "dead-1", annualCostSaving: 0, paybackYears: 99 }),
    ]);
    expect(data.summary.portfolioPayback).toBeNull(); // precondition

    const report = assembleRetrofitReport(BUILDING, data);
    const raw = JSON.stringify(report.sections);

    expect(raw).toContain("회수 불가");
    expect(raw).not.toContain("0.0년");
    expect(raw).not.toContain("Infinity");
  });

  it("renders NPV and effective-CAPEX rows when the summary carries them", async () => {
    const { DEFAULT_ECONOMIC_ASSUMPTIONS } = await import("@/lib/retrofit/cost-database");
    const data = buildRetrofitData(
      [makeMeasure({ id: "env-1" }), makeMeasure({ id: "light-1", category: "lighting" })],
      DEFAULT_ECONOMIC_ASSUMPTIONS
    );
    expect(data.summary.portfolioNpv).toBeDefined(); // precondition

    const report = assembleRetrofitReport(BUILDING, data);
    const raw = JSON.stringify(report.sections);

    expect(raw).toContain("포트폴리오 NPV");
    expect(raw).toContain("실효 투자비");
  });
});

describe("assembleEnergyAuditReport (PDF engine, P0-02)", () => {
  it("includes a Retrofit Recommendations table when a summary is provided", () => {
    const report = assembleEnergyAuditReport(BUILDING, METRICS, undefined, undefined, {
      totalInvestment: 20_000_000,
      totalAnnualSaving: 40_000,
      payback: 4.2,
      topMeasures: [{ description: "LED retrofit", payback: 2.5 }],
      npv: 6_500_000,
      irr: 0.124,
      discountedPayback: 6.8,
      effectiveCapex: 8_000_000,
    });

    const section = report.sections.find((s) => s.title === "Retrofit Recommendations");
    expect(section).toBeDefined();
    expect(section!.content.type).toBe("table");
    const raw = JSON.stringify(section);
    expect(raw).toContain("LED retrofit");
    expect(raw).toContain("NPV");
    expect(raw).toContain("IRR");
    // Whole report survives JSON round-trip without Infinity/NaN.
    expect(JSON.stringify(report)).not.toContain("Infinity");
    expect(JSON.stringify(report)).not.toContain("NaN");
  });

  it("renders the explicit no-analysis fallback when no summary is provided", () => {
    const report = assembleEnergyAuditReport(BUILDING, METRICS);

    const section = report.sections.find((s) => s.title === "Retrofit Recommendations");
    expect(section).toBeDefined();
    expect(section!.content.type).toBe("text");
    const text = (section!.content as { type: "text"; text: string }).text;
    expect(text).toContain("No retrofit analysis");
  });

  it("renders null payback in the retrofit summary as 회수 불가, not 0", () => {
    const report = assembleEnergyAuditReport(BUILDING, METRICS, undefined, undefined, {
      totalInvestment: 20_000_000,
      totalAnnualSaving: 0,
      payback: null,
      topMeasures: [{ description: "Dead measure", payback: 3.1 }],
      npv: -1_000_000,
      irr: null,
      discountedPayback: null,
      effectiveCapex: 8_000_000,
    });

    const section = report.sections.find((s) => s.title === "Retrofit Recommendations");
    const raw = JSON.stringify(section);
    expect(raw).toContain("회수 불가");
    expect(raw).not.toContain("0.0년");
  });
});
