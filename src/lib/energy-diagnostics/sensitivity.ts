/**
 * 재료 민감도 분석 — every number here comes from an actual engine run.
 *
 * Two analyses:
 *  1. `runThicknessSensitivity` — sweep one insulation layer's thickness,
 *     recompute the assembly U by the ISO-6946 layer sum, and run the REAL
 *     degree-day engine per point (delta-only scenario; the baseline model is
 *     never mutated). Marginal savings and the diminishing-return point are
 *     derived from those runs, never from a fitted curve.
 *  2. `rankParameterSensitivity` — apply a uniform 10 % improvement to each
 *     supported envelope/system parameter, one real engine run each, and rank
 *     by the achieved annual saving.
 *
 * Determinism: same model → same scenarios → same input hashes → same runs.
 * No RNG, no interpolation, no fabricated numbers (mission §19/§20).
 */

import {
  calculateAssembly,
  thicknessForTargetU,
  type AssemblyLayerInput,
  type HeatFlowDirection,
} from "@/lib/energy-standards/assembly";

import {
  compileCanonicalModelToEngineInput,
  runSimulation,
} from "./adapter";
import { createEnergyScenario } from "./scenarios";
import type { CanonicalEnergyModel, ConstructionAssembly, EnergyFact } from "./types";

export type ThicknessSweepPoint = Readonly<{
  thicknessMm: number;
  uValueWPerM2K: number;
  annualEnergyKwh: number;
  savingVsBaselineKwh: number;
  /** kWh saved per added mm relative to the previous point; null on the first. */
  marginalSavingKwhPerMm: number | null;
}>;

export type ThicknessSensitivityResult = Readonly<{
  constructionId: string;
  layerId: string;
  layerName: string;
  direction: HeatFlowDirection;
  baselineAnnualEnergyKwh: number;
  baselineUValueWPerM2K: number;
  points: readonly ThicknessSweepPoint[];
  /**
   * First swept thickness where the marginal saving per mm falls below 20 %
   * of the first step's marginal saving — the sweep's own diminishing-return
   * elbow. Null when the sweep never flattens that far.
   */
  diminishingReturnThicknessMm: number | null;
  /** Thickness at which the assembly meets `targetU`, when one was supplied. */
  complianceThicknessMm: number | null;
  engineRunCount: number;
}>;

export class SensitivityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SensitivityError";
  }
}

function layerInputs(construction: ConstructionAssembly): AssemblyLayerInput[] {
  return construction.layers.map((layer) => {
    const thickness = layer.thicknessM.value;
    const conductivity = layer.conductivityWPerMK.value;
    if (typeof thickness !== "number" || typeof conductivity !== "number") {
      throw new SensitivityError(
        `Construction ${construction.id} layer ${layer.id} lacks numeric thickness/conductivity.`,
      );
    }
    return { id: layer.id, thicknessM: thickness, conductivityWPerMK: conductivity };
  });
}

function directionFor(
  model: CanonicalEnergyModel,
  constructionId: string,
): HeatFlowDirection {
  for (const surface of model.geometry.surfaces) {
    if (surface.constructionId.value !== constructionId) continue;
    if (surface.type === "roof") return "upward";
    if (surface.type === "ground_floor") return "downward";
    return "horizontal";
  }
  return "horizontal";
}

function annualFromRealRun(
  model: CanonicalEnergyModel,
  scenarioId: string,
  name: string,
  baselineFact: EnergyFact<number>,
  path: string,
  value: number,
): number {
  const scenario = createEnergyScenario({
    id: scenarioId,
    name,
    baseline: model,
    changes: [
      {
        id: `${scenarioId}:delta`,
        path,
        baselineFact,
        value,
      },
    ],
  });
  const input = compileCanonicalModelToEngineInput(model, scenario);
  const run = runSimulation(input);
  if (run.status !== "succeeded" || run.result == null) {
    throw new SensitivityError(
      `Engine run for ${name} failed: ${run.error?.message ?? "unknown"}`,
    );
  }
  return run.result.annualEnergyKwh;
}

export type ThicknessSensitivityOptions = Readonly<{
  constructionId: string;
  /** Swept thicknesses in mm; the mission default is 100→250 in 25 mm steps. */
  thicknessesMm?: readonly number[];
  /** 별표1 ceiling to mark on the sweep, W/m²K. */
  targetU?: number;
}>;

const DEFAULT_SWEEP_MM = Object.freeze([100, 125, 150, 175, 200, 225, 250]);

export function runThicknessSensitivity(
  model: CanonicalEnergyModel,
  options: ThicknessSensitivityOptions,
): ThicknessSensitivityResult {
  const index = model.envelope.constructions.findIndex(
    (candidate) => candidate.id === options.constructionId,
  );
  if (index < 0) {
    throw new SensitivityError(`Unknown construction ${options.constructionId}.`);
  }
  const construction = model.envelope.constructions[index];
  if (construction.layers.length === 0) {
    throw new SensitivityError(
      `Construction ${construction.id} has no layer composition to sweep.`,
    );
  }
  const inputs = layerInputs(construction);
  const insulationLayer =
    construction.layers.find((layer) => String(layer.name.value ?? "").includes("단열재")) ??
    null;
  if (!insulationLayer) {
    throw new SensitivityError(
      `Construction ${construction.id} has no insulation layer (단열재) to sweep.`,
    );
  }
  const direction = directionFor(model, construction.id);
  const baselineU = construction.uValueWPerM2K.value;
  if (typeof baselineU !== "number") {
    throw new SensitivityError(`Construction ${construction.id} has no numeric U-value.`);
  }

  // Baseline: one real engine run with no scenario.
  const baselineRun = runSimulation(compileCanonicalModelToEngineInput(model));
  if (baselineRun.status !== "succeeded" || baselineRun.result == null) {
    throw new SensitivityError(
      `Baseline engine run failed: ${baselineRun.error?.message ?? "unknown"}`,
    );
  }
  const baselineAnnual = baselineRun.result.annualEnergyKwh;
  let engineRunCount = 1;

  const sweep = options.thicknessesMm ?? DEFAULT_SWEEP_MM;
  const path = `envelope.constructions.${index}.uValueWPerM2K`;
  const points: ThicknessSweepPoint[] = [];
  for (const thicknessMm of sweep) {
    if (!(thicknessMm > 0)) {
      throw new SensitivityError(`Swept thickness must be positive (got ${thicknessMm}).`);
    }
    const substituted = inputs.map((layer) =>
      layer.id === insulationLayer.id ? { ...layer, thicknessM: thicknessMm / 1000 } : layer,
    );
    const uValue = calculateAssembly(substituted, direction).uValueWPerM2K;
    const annual = annualFromRealRun(
      model,
      `sensitivity-${construction.id}-${thicknessMm}mm`,
      `민감도 ${thicknessMm}mm`,
      construction.uValueWPerM2K as EnergyFact<number>,
      path,
      uValue,
    );
    engineRunCount += 1;
    const previous = points[points.length - 1];
    points.push({
      thicknessMm,
      uValueWPerM2K: uValue,
      annualEnergyKwh: annual,
      savingVsBaselineKwh: baselineAnnual - annual,
      marginalSavingKwhPerMm: previous
        ? (previous.annualEnergyKwh - annual) / (thicknessMm - previous.thicknessMm)
        : null,
    });
  }

  let diminishing: number | null = null;
  const firstMarginal = points.find((p) => p.marginalSavingKwhPerMm != null)
    ?.marginalSavingKwhPerMm;
  if (firstMarginal != null && firstMarginal > 0) {
    for (const point of points) {
      if (
        point.marginalSavingKwhPerMm != null &&
        point.marginalSavingKwhPerMm < firstMarginal * 0.2
      ) {
        diminishing = point.thicknessMm;
        break;
      }
    }
  }

  let complianceThicknessMm: number | null = null;
  if (options.targetU != null) {
    const solved = thicknessForTargetU(inputs, direction, insulationLayer.id, options.targetU);
    complianceThicknessMm = solved != null ? Math.round(solved * 1000 * 10) / 10 : null;
  }

  return Object.freeze({
    constructionId: construction.id,
    layerId: insulationLayer.id,
    layerName: String(insulationLayer.name.value ?? insulationLayer.id),
    direction,
    baselineAnnualEnergyKwh: baselineAnnual,
    baselineUValueWPerM2K: baselineU,
    points: Object.freeze(points),
    diminishingReturnThicknessMm: diminishing,
    complianceThicknessMm,
    engineRunCount,
  });
}

// ── Parameter ranking ───────────────────────────────────────────────────────

export type ParameterSensitivityEntry = Readonly<{
  /** Scenario path exercised. */
  path: string;
  labelKo: string;
  baselineValue: number;
  improvedValue: number;
  annualEnergyKwh: number;
  savingVsBaselineKwh: number;
  savingPct: number;
}>;

export type ParameterSensitivityResult = Readonly<{
  baselineAnnualEnergyKwh: number;
  /** Ranked by achieved saving, best first. Every entry is one real run. */
  ranked: readonly ParameterSensitivityEntry[];
  engineRunCount: number;
  /** How the 10 % improvement was applied, for the UI method note. */
  methodKo: string;
}>;

export function rankParameterSensitivity(
  model: CanonicalEnergyModel,
): ParameterSensitivityResult {
  const baselineRun = runSimulation(compileCanonicalModelToEngineInput(model));
  if (baselineRun.status !== "succeeded" || baselineRun.result == null) {
    throw new SensitivityError(
      `Baseline engine run failed: ${baselineRun.error?.message ?? "unknown"}`,
    );
  }
  const baselineAnnual = baselineRun.result.annualEnergyKwh;
  let engineRunCount = 1;

  type Candidate = Readonly<{
    path: string;
    labelKo: string;
    fact: EnergyFact<number>;
    improvedValue: number;
  }>;
  const candidates: Candidate[] = [];

  model.envelope.constructions.forEach((construction, index) => {
    const u = construction.uValueWPerM2K.value;
    if (typeof u === "number" && u > 0) {
      candidates.push({
        path: `envelope.constructions.${index}.uValueWPerM2K`,
        labelKo: `${String(construction.name.value ?? construction.id)} U값`,
        fact: construction.uValueWPerM2K as EnergyFact<number>,
        improvedValue: u * 0.9,
      });
    }
    if (construction.kind === "window") {
      const shgc = construction.shgc.value;
      if (typeof shgc === "number" && shgc > 0) {
        candidates.push({
          path: `envelope.constructions.${index}.shgc`,
          labelKo: `${String(construction.name.value ?? construction.id)} SHGC`,
          fact: construction.shgc as EnergyFact<number>,
          improvedValue: shgc * 0.9,
        });
      }
    }
  });
  const ach = model.envelope.infiltrationAirChangesPerHour.value;
  if (typeof ach === "number" && ach > 0) {
    candidates.push({
      path: "envelope.infiltrationAirChangesPerHour",
      labelKo: "침기율 (자연 환기횟수)",
      fact: model.envelope.infiltrationAirChangesPerHour as EnergyFact<number>,
      improvedValue: ach * 0.9,
    });
  }
  model.systems.hvac.forEach((system, index) => {
    const heating = system.heatingEfficiency.value;
    if (typeof heating === "number" && heating > 0) {
      candidates.push({
        path: `systems.hvac.${index}.heatingEfficiency`,
        labelKo: "난방 효율",
        fact: system.heatingEfficiency as EnergyFact<number>,
        improvedValue: heating * 1.1,
      });
    }
    const cop = system.coolingCop.value;
    if (typeof cop === "number" && cop > 0) {
      candidates.push({
        path: `systems.hvac.${index}.coolingCop`,
        labelKo: "냉방 COP",
        fact: system.coolingCop as EnergyFact<number>,
        improvedValue: cop * 1.1,
      });
    }
  });

  const ranked = candidates
    .map((candidate) => {
      const annual = annualFromRealRun(
        model,
        `sensitivity-rank-${candidate.path.replaceAll(/[^a-z0-9]/gi, "-")}`,
        `민감도 순위 ${candidate.labelKo}`,
        candidate.fact,
        candidate.path,
        candidate.improvedValue,
      );
      engineRunCount += 1;
      const saving = baselineAnnual - annual;
      return {
        path: candidate.path,
        labelKo: candidate.labelKo,
        baselineValue: candidate.fact.value as number,
        improvedValue: candidate.improvedValue,
        annualEnergyKwh: annual,
        savingVsBaselineKwh: saving,
        savingPct: baselineAnnual > 0 ? (saving / baselineAnnual) * 100 : 0,
      };
    })
    .sort((a, b) => b.savingVsBaselineKwh - a.savingVsBaselineKwh);

  return Object.freeze({
    baselineAnnualEnergyKwh: baselineAnnual,
    ranked: Object.freeze(ranked),
    engineRunCount,
    methodKo:
      "각 변수에 동일한 10% 개선(U값·SHGC·침기율 −10%, 효율·COP +10%)을 적용해 " +
      "실제 엔진을 변수당 1회씩 실행한 결과입니다. 곡선 보간이나 추정치가 아닙니다.",
  });
}
