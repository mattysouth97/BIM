/**
 * Bridges a source-traced canonical diagnosis into the existing retrofit
 * measure + economics stack (src/lib/retrofit). Pure: reads only the exact
 * engine payload of a succeeded baseline run — never zustand stores — so every
 * economic figure is anchored to the same inputs the user reviewed.
 *
 * Screening semantics, stated honestly in `notes`:
 * - Measure savings use the retrofit stack's closed-form degree-day formulas,
 *   not per-measure re-runs of the diagnostics engine.
 * - Energy prices are the fixed 2024 KRW/kWh constants in cost-database.ts.
 * - Lighting operating hours default to 2,500 h/yr (no canonical numeric
 *   schedule exists yet).
 */
import type {
  CompiledDegreeDayInput,
  DegreeDaySimulationRun,
} from "./adapter";

import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import {
  DEFAULT_ECONOMIC_ASSUMPTIONS,
  ENERGY_PRICES,
  KOREAN_GR_PRESETS,
  type ProgramTrack,
} from "@/lib/retrofit/cost-database";
import {
  computeFinancials,
  resolveHeatingFuel,
  type EconomicAssumptions,
  type MeasureFinancials,
} from "@/lib/retrofit/economic-model";
import {
  generateEnvelopeRetrofits,
  KOREAN_2020_TARGET_U_VALUES,
} from "@/lib/retrofit/envelope-retrofits";
import { generateHvacRetrofits } from "@/lib/retrofit/hvac-retrofits";
import { generateLightingRetrofits } from "@/lib/retrofit/lighting-retrofits";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";

const DEFAULT_LIGHTING_HOURS_PER_YEAR = 2_500;

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
  notes: readonly Readonly<{ ko: string; en: string }>[];
}>;

/**
 * Generates applicable improvement measures with NPV/IRR/payback from the
 * baseline run's exact engine payload. Returns `null` when the run cannot
 * anchor an analysis (not succeeded, or no engine output).
 */
export function analyzeRetrofitEconomics(
  baselineRun: DegreeDaySimulationRun,
  programTrack: ProgramTrack = "none",
): DiagnosticsRetrofitAnalysis | null {
  if (baselineRun.status !== "succeeded" || baselineRun.engineOutput == null) {
    return null;
  }
  const input = baselineRun.engineInput as CompiledDegreeDayInput;
  const { materials, recipe, climate, mapping } = input.payload;
  const quantities = envelopeQuantities(recipe);
  const totalFloorArea =
    mapping.conditionedFloorAreaSqm > 0
      ? mapping.conditionedFloorAreaSqm
      : quantities.intensityFloorAreaSqm;
  const footprintArea = quantities.planAreaSqm;
  const heatingFuel = resolveHeatingFuel(materials.hvac.heating);

  const wallArea = materials.envelope.walls.reduce(
    (sum, wall) => sum + wall.surfaceArea,
    0,
  );
  const wallU =
    wallArea > 0
      ? materials.envelope.walls.reduce(
          (sum, wall) => sum + wall.uValue * wall.surfaceArea,
          0,
        ) / wallArea
      : 0;
  const wwr = materials.envelope.windows.windowToWallRatio;
  const avgWwr = (wwr.N + wwr.S + wwr.E + wwr.W) / 4;

  const envelope = generateEnvelopeRetrofits(
    {
      wall: wallU,
      roof: materials.envelope.roof.uValue,
      window: materials.envelope.windows.uValue,
      floor: materials.envelope.groundFloor.uValue,
    },
    KOREAN_2020_TARGET_U_VALUES,
    {
      wall: wallArea * (1 - avgWwr),
      roof: quantities.roofAreaSqm,
      window: wallArea * avgWwr,
      floor: footprintArea,
    },
    climate.hdd,
    materials.hvac.heating.efficiency,
    heatingFuel,
  );

  // The HVAC generator documents its demand input as USEFUL heat, while the
  // engine's annualDemand.heatingDemand is site consumption (already divided
  // by efficiency/COP). Multiply back so boiler/HRV savings are not inflated
  // by 1/η. Canonical efficiencies are fractions or COPs, never percentages.
  const heatingEfficiency = Math.max(materials.hvac.heating.efficiency, 0.01);
  const usefulHeatingDemand =
    baselineRun.engineOutput.annualDemand.heatingDemand * heatingEfficiency;
  // Sequential damping: HVAC measures act on the post-envelope residual so a
  // combined reading does not double-count the same kilowatt-hours. Envelope
  // savings are site energy; convert them to useful heat with the same η.
  const envelopeSaving = envelope.reduce(
    (sum, measure) => sum + measure.annualEnergySaving,
    0,
  );
  const residualUsefulHeat = Math.max(
    0,
    usefulHeatingDemand - envelopeSaving * heatingEfficiency,
  );
  // The stack's boiler/heat-pump replacement measures model fossil plants with
  // fractional efficiencies. An electric heat pump (COP > 1.5) is already the
  // measure they would install, so only heat recovery remains applicable — and
  // only when the model does not report heat recovery already.
  const boilerMeasuresApplicable =
    heatingFuel !== "electricity" && heatingEfficiency <= 1.5;
  const hvac = generateHvacRetrofits(
    {
      heatingType: materials.hvac.heating.systemType,
      heatingEfficiency: materials.hvac.heating.efficiency,
      coolingType: materials.hvac.cooling.systemType,
      coolingEfficiency: materials.hvac.cooling.efficiency,
    },
    totalFloorArea,
    residualUsefulHeat,
    baselineRun.engineOutput.annualDemand.coolingDemand,
    heatingFuel,
  ).filter((measure) => {
    if (measure.id === "hvac-hrv") {
      // The generator proposes heat recovery unconditionally; a model that
      // already reports heat recovery must not be sold the same measure twice.
      return (materials.hvac.ventilation?.heatRecoveryEfficiency ?? 0) <= 0;
    }
    return boilerMeasuresApplicable;
  });

  const lighting = generateLightingRetrofits(
    materials.lighting.lightingPowerDensity,
    totalFloorArea,
    DEFAULT_LIGHTING_HOURS_PER_YEAR,
  );

  const assumptions: EconomicAssumptions =
    KOREAN_GR_PRESETS[programTrack] ?? DEFAULT_ECONOMIC_ASSUMPTIONS;
  const measures = [...envelope, ...hvac, ...lighting]
    .map((measure) => {
      const financials = computeFinancials(measure, assumptions);
      return Object.freeze({
        ...measure,
        financials,
        discountedPaybackYears: Number.isFinite(financials.discountedPayback)
          ? financials.discountedPayback
          : null,
      });
    })
    .sort((left, right) => right.financials.npv - left.financials.npv);

  const fuelDemand = baselineRun.engineOutput.annualDemand.fuelDemand;
  const baselineAnnualEnergyCostKrw = fuelDemand
    ? fuelDemand.electricKwh * ENERGY_PRICES.electricity +
      fuelDemand.fossilKwh * ENERGY_PRICES[heatingFuel]
    : baselineRun.result != null
      ? baselineRun.result.annualEnergyKwh * ENERGY_PRICES.electricity
      : 0;

  return Object.freeze({
    measures: Object.freeze(measures),
    programTrack,
    baselineAnnualEnergyCostKrw,
    totalAnnualSavingKwh: measures.reduce(
      (sum, measure) => sum + measure.annualEnergySaving,
      0,
    ),
    notes: Object.freeze([
      {
        ko: "절감량은 기존 개보수 모듈의 도일 근사식으로 계산한 스크리닝 추정치이며, 진단 엔진을 조치별로 재실행한 값이 아닙니다.",
        en: "Savings are screening estimates from the retrofit stack's degree-day formulas, not per-measure re-runs of the diagnosis engine.",
      },
      {
        ko: `에너지 단가는 고정 상수(전기 ${ENERGY_PRICES.electricity}·가스 ${ENERGY_PRICES.gas}·지역난방 ${ENERGY_PRICES.districtHeating} ₩/kWh, KICT 2024)입니다.`,
        en: `Energy prices are fixed constants (electricity ${ENERGY_PRICES.electricity} · gas ${ENERGY_PRICES.gas} · district heating ${ENERGY_PRICES.districtHeating} ₩/kWh, KICT 2024).`,
      },
      {
        ko: `조명 연간 가동시간은 ${DEFAULT_LIGHTING_HOURS_PER_YEAR}시간 가정입니다(정규 모델에 수치 스케줄 없음).`,
        en: `Lighting operating hours assume ${DEFAULT_LIGHTING_HOURS_PER_YEAR} h/yr (no numeric schedule in the canonical model).`,
      },
      {
        ko: "설비 조치는 외피 조치 적용 후 잔여 난방 수요 기준으로 계산해 중복 절감을 방지했습니다.",
        en: "HVAC measures are computed on the post-envelope residual heating demand to prevent double counting.",
      },
    ]),
  });
}

export type { ProgramTrack };
