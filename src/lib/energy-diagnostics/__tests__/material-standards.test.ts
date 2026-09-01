/**
 * Material-aware diagnostics: layer↔U consistency of the ledger baseline,
 * primary-energy derivation on real runs, the standards assessment, and the
 * sensitivity analyses (mission §7/§8/§11/§19/§22 — all on the REAL engine).
 */
import { describe, expect, it } from "vitest";

import { demoFloors, demoTitle } from "@/lib/demo/demo-building";
import { PRIMARY_ENERGY_FACTORS } from "@/lib/energy/primary-energy";
import { calculateAssembly } from "@/lib/energy-standards/assembly";
import type { BrTitleInfo } from "@/lib/types";

import { compileCanonicalModelToEngineInput, runSimulation } from "../adapter";
import { ingestDrawingSet } from "../ingestion";
import { buildLedgerBaselineModel } from "../ledger-baseline-model";
import { diagnosticSourceFromLedger } from "../ledger-source";
import { rankParameterSensitivity, runThicknessSensitivity } from "../sensitivity";
import { assessStandards } from "../standards-assessment";
import type { CanonicalEnergyModel, ConstructionAssembly } from "../types";

const INGESTED_AT = "2026-04-01T00:00:00.000Z";

async function buildModel(title: BrTitleInfo = demoTitle): Promise<CanonicalEnergyModel> {
  const source = diagnosticSourceFromLedger({ title, floors: demoFloors });
  const ingestion = await ingestDrawingSet([source], {
    setName: "register",
    ingestedAt: INGESTED_AT,
  });
  const outcome = buildLedgerBaselineModel({
    ingestion,
    title,
    floors: demoFloors,
    locale: "ko",
    now: INGESTED_AT,
  });
  if (outcome.status !== "created") throw new Error(`expected a model: ${outcome.reason}`);
  return outcome.model;
}

function opaque(model: CanonicalEnergyModel, id: string): ConstructionAssembly {
  const construction = model.envelope.constructions.find((c) => c.id === id);
  if (!construction) throw new Error(`missing construction ${id}`);
  return construction;
}

describe("ledger baseline layer composition", () => {
  it("populates layers on the opaque constructions, none on windows", async () => {
    const model = await buildModel();
    expect(opaque(model, "ledger-construction-wall").layers.length).toBeGreaterThan(0);
    expect(opaque(model, "ledger-construction-roof").layers.length).toBeGreaterThan(0);
    expect(opaque(model, "ledger-construction-ground").layers.length).toBeGreaterThan(0);
    expect(opaque(model, "ledger-construction-window").layers).toHaveLength(0);
  });

  it("layer stacks reproduce the stated era-table U exactly (ISO 6946 sum)", async () => {
    const model = await buildModel();
    const cases = [
      { id: "ledger-construction-wall", direction: "horizontal" as const },
      { id: "ledger-construction-roof", direction: "upward" as const },
      { id: "ledger-construction-ground", direction: "downward" as const },
    ];
    for (const { id, direction } of cases) {
      const construction = opaque(model, id);
      const computed = calculateAssembly(
        construction.layers.map((layer) => ({
          id: layer.id,
          thicknessM: layer.thicknessM.value as number,
          conductivityWPerMK: layer.conductivityWPerMK.value as number,
        })),
        direction,
      );
      expect(computed.uValueWPerM2K).toBeCloseTo(
        construction.uValueWPerM2K.value as number,
        6,
      );
    }
  });

  it("every layer fact is a named assumption — never register-sourced", async () => {
    const model = await buildModel();
    for (const construction of model.envelope.constructions) {
      for (const layer of construction.layers) {
        for (const fact of [
          layer.name,
          layer.thicknessM,
          layer.conductivityWPerMK,
          layer.densityKgPerM3,
          layer.specificHeatJPerKgK,
        ]) {
          expect(fact.status).toBe("defaulted");
          expect(fact.assumptionId).toBe("assumption.ledger-era-envelope-defaults");
          expect(fact.sourceRefs).toHaveLength(0);
        }
      }
    }
  });
});

describe("primary energy on real runs", () => {
  it("derives a 1차에너지 block whose algebra checks out", async () => {
    const model = await buildModel();
    const run = runSimulation(compileCanonicalModelToEngineInput(model));
    expect(run.status).toBe("succeeded");
    const primary = run.result?.primary;
    expect(primary).toBeDefined();
    if (!primary) return;

    // Reconstruct total from the per-fuel legs and the published factors.
    const expected =
      primary.deliveredByFuelKwh.electricity * PRIMARY_ENERGY_FACTORS.electricity +
      primary.deliveredByFuelKwh.gas * PRIMARY_ENERGY_FACTORS.gas +
      primary.deliveredByFuelKwh.districtHeating * PRIMARY_ENERGY_FACTORS.districtHeating;
    expect(primary.totalKwh).toBeCloseTo(expected, 6);
    expect(primary.factorsUsed.electricity).toBe(2.75);
    expect(primary.factorsUsed.gas).toBe(1.1);
    expect(primary.perM2Kwh).toBeGreaterThan(0);
    // Delivered legs cover the whole delivered total.
    const delivered =
      primary.deliveredByFuelKwh.electricity +
      primary.deliveredByFuelKwh.gas +
      primary.deliveredByFuelKwh.districtHeating;
    expect(delivered).toBeCloseTo(run.result!.annualEnergyKwh, 3);
    // The basis names the approximation it inherits.
    expect(primary.basis).toContain("환산계수");
  });
});

describe("standards assessment", () => {
  it("resolves the region, checks every mapped construction, and stamps the 기준 버전", async () => {
    const model = await buildModel();
    const run = runSimulation(compileCanonicalModelToEngineInput(model));
    const assessment = assessStandards(model, run);

    expect(assessment.calcBasis.engineId).toBe("bimfit-degree-day");
    expect(assessment.calcBasis.inputHash).toBe(run.engineInput.inputHash);
    expect(assessment.calcBasis.standards.map((s) => s.id)).toContain("saving-standard");

    // The demo building is in Seoul → 중부2.
    expect(assessment.region?.region).toBe("jungbu2");

    const elements = assessment.uValueChecks.map((check) => check.element).sort();
    expect(elements).toContain("exterior_wall");
    expect(elements).toContain("roof");
    expect(elements).toContain("window");
    for (const check of assessment.uValueChecks) {
      expect(check.check.limit.standard).toContain("제2025-738호");
      expect(check.uValueFactId.length).toBeGreaterThan(0);
    }
    // A 2000s-era baseline fails today's ceilings — the check must say so,
    // not flatter the building.
    const wall = assessment.uValueChecks.find((c) => c.element === "exterior_wall");
    expect(wall?.check.compliant).toBe(false);
  });

  it("places the primary figure on the ZEB table as 참고, with the disclaimer", async () => {
    const model = await buildModel();
    const run = runSimulation(compileCanonicalModelToEngineInput(model));
    const assessment = assessStandards(model, run);
    expect(assessment.zebReference).not.toBeNull();
    expect(assessment.zebReference?.disclaimerKo).toContain("참고용");
    expect(assessment.zebReference?.result.standard).toContain("제2024-893호");
  });

  it("without a 시군구코드 it falls back to the address and reports the weaker basis", async () => {
    const model = await buildModel({ ...demoTitle, sigunguCd: "" });
    const assessment = assessStandards(model, null);
    // Still resolvable (the register address opens with the 시도 name), but
    // the basis is visibly no longer the verified code mapping.
    expect(assessment.region?.regionBasis).toBe("address");
    // No run → no primary figure → no ZEB row is invented.
    expect(assessment.zebReference).toBeNull();
    expect(assessment.calcBasis.inputHash).toBeNull();
  });
});

describe("thickness sensitivity — real engine runs", () => {
  it("sweeps insulation thickness with monotonic savings and diminishing returns", async () => {
    const model = await buildModel();
    const result = runThicknessSensitivity(model, {
      constructionId: "ledger-construction-wall",
      thicknessesMm: [100, 150, 200, 250],
    });

    expect(result.engineRunCount).toBe(5); // baseline + 4 points
    expect(result.points).toHaveLength(4);
    // Thicker insulation → lower U → lower annual energy, monotonically.
    for (let i = 1; i < result.points.length; i++) {
      expect(result.points[i].uValueWPerM2K).toBeLessThan(result.points[i - 1].uValueWPerM2K);
      expect(result.points[i].annualEnergyKwh).toBeLessThanOrEqual(
        result.points[i - 1].annualEnergyKwh,
      );
    }
    // Marginal saving per mm shrinks — diminishing returns from real runs.
    const marginals = result.points
      .map((p) => p.marginalSavingKwhPerMm)
      .filter((m): m is number => m != null);
    for (let i = 1; i < marginals.length; i++) {
      expect(marginals[i]).toBeLessThanOrEqual(marginals[i - 1] + 1e-9);
    }
  });

  it("is deterministic: the same model yields byte-identical sweeps", async () => {
    const model = await buildModel();
    const a = runThicknessSensitivity(model, {
      constructionId: "ledger-construction-wall",
      thicknessesMm: [100, 200],
    });
    const b = runThicknessSensitivity(model, {
      constructionId: "ledger-construction-wall",
      thicknessesMm: [100, 200],
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("marks the 별표1 compliance thickness on the sweep when a target is given", async () => {
    const model = await buildModel();
    const result = runThicknessSensitivity(model, {
      constructionId: "ledger-construction-wall",
      thicknessesMm: [100, 150],
      targetU: 0.24, // 중부2 비주거 외벽 직접
    });
    expect(result.complianceThicknessMm).not.toBeNull();
    expect(result.complianceThicknessMm!).toBeGreaterThan(0);
  });

  it("refuses a construction without layers instead of inventing a sweep", async () => {
    const model = await buildModel();
    expect(() =>
      runThicknessSensitivity(model, { constructionId: "ledger-construction-window" }),
    ).toThrow(/no layer composition|no insulation/);
  });
});

describe("parameter sensitivity ranking — real engine runs", () => {
  it("ranks parameters by actually-simulated savings", async () => {
    const model = await buildModel();
    const result = rankParameterSensitivity(model);

    expect(result.ranked.length).toBeGreaterThanOrEqual(4);
    expect(result.engineRunCount).toBe(result.ranked.length + 1);
    // Sorted best-first.
    for (let i = 1; i < result.ranked.length; i++) {
      expect(result.ranked[i].savingVsBaselineKwh).toBeLessThanOrEqual(
        result.ranked[i - 1].savingVsBaselineKwh,
      );
    }
    // Every entry names its path and reports its own real run.
    for (const entry of result.ranked) {
      expect(entry.annualEnergyKwh).toBeGreaterThan(0);
      expect(entry.path.length).toBeGreaterThan(0);
    }
    expect(result.methodKo).toContain("실제 엔진");
  });
});
