// Diagnostics adapter: reads only the frozen engine payload, never client stores.
// All candidate generation, isolated engine reruns and DCF pricing live in the
// shared pure core; the twin adapter calls that same boundary.
import type { CompiledDegreeDayInput, DegreeDaySimulationRun } from "./adapter";
import { generateRetrofitMeasures, type RetrofitCoreResult } from "@/lib/retrofit/retrofit-core";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import type { ProgramTrack } from "@/lib/retrofit/cost-database";
import type { MeasureFinancials } from "@/lib/retrofit/economic-model";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";

export type DiagnosticsRetrofitMeasure = RetrofitMeasure &
  Readonly<{
    financials: MeasureFinancials;
    /** `null` when savings never repay the investment (JSON-safe, no Infinity). */
    discountedPaybackYears: number | null;
  }>;

export type DiagnosticsRetrofitAnalysis = Readonly<{
  measures: readonly DiagnosticsRetrofitMeasure[];
  programTrack: ProgramTrack;
  baselineAnnualEnergyCostKrw: number;
  totalAnnualSavingKwh: number;
  coreResult: RetrofitCoreResult;
  notes: readonly Readonly<{ ko: string; en: string }>[];
}>;

export function analyzeRetrofitEconomics(baselineRun: DegreeDaySimulationRun, programTrack: ProgramTrack = "none"): DiagnosticsRetrofitAnalysis | null {
  if (baselineRun.status !== "succeeded" || baselineRun.engineOutput == null) return null;
  const { payload } = baselineRun.engineInput as CompiledDegreeDayInput;
  const { materials, recipe, climate, mapping } = payload;
  const coreResult = generateRetrofitMeasures({ materials, recipe, climate,
    climateRegion: payload.climateRegion ?? null,
    conditionedFloorAreaSqm: mapping.conditionedFloorAreaSqm > 0 ? mapping.conditionedFloorAreaSqm : envelopeQuantities(recipe).intensityFloorAreaSqm,
    roofPlanes: payload.roofPlanes, pvGeometricKWp: payload.pvGeometricKWp,
    programTrack, measureIds: payload.retrofitMeasureIds ?? null, unsavedEditCount: payload.unsavedEditCount ?? 0,
  });
  const measures = coreResult.measures.map(measure => Object.freeze({ ...measure,
    discountedPaybackYears: Number.isFinite(measure.financials.discountedPayback) ? measure.financials.discountedPayback : null,
  })).sort((a, b) => b.financials.npv - a.financials.npv);
  return Object.freeze({ measures: Object.freeze(measures), programTrack, coreResult,
    baselineAnnualEnergyCostKrw: coreResult.baselineAnnualEnergyCostKrw,
    totalAnnualSavingKwh: coreResult.totalAnnualSavingKwh,
    notes: Object.freeze(coreResult.notes),
  });
}
export type { ProgramTrack };
