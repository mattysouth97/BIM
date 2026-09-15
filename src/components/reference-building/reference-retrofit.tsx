"use client";

import { useMemo } from "react";
import { ClimateRegionDisclosure } from "@/components/viewer/climate-region-disclosure";
import { resolveClimateRegion } from "@/lib/energy/climate-region";
import { useScenarioStore } from "@/store/scenario-store";
import { useEnergyMetrics } from "@/hooks/use-energy-metrics";
import { usePvLayout } from "@/hooks/use-pv-layout";
import { useRetrofitScenario, engineEnvelopeAreasFrom } from "@/hooks/use-retrofit-scenario";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import type { ReferenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";
import { ReferencePvUtilisation } from "./reference-pv-utilisation";
import { ScenarioRail } from "@/components/twin/scenario-rail";
import { RetrofitOutcome } from "@/components/twin/retrofit-delta-strip";
import { MeasureChipRow } from "@/components/twin/measure-chip-row";
import { RetrofitVerification } from "@/components/twin/retrofit-verification";

const ROOF_TYPE_KO = { flat: "평지붕", gable: "박공지붕", hip: "우진각지붕", sawtooth: "톱날지붕" };

export function retrofitBasisLines(energy: ReferenceBuildingEnergyInputs, isKo: boolean): string[] {
  return [
    isKo ? "선택한 공사 전체를 적용하기 전후에 동일한 에너지 엔진을 실행합니다. 각 공사의 단독 절감량을 합산하지 않습니다. 요금은 구매 에너지와 가정 단가로 계산하며 고지서·견적이 아닙니다."
      : "The same energy engine runs before and after the whole chosen package. Isolated measure savings are not summed. Bills use purchased energy and assumed tariffs; they are not bills or quotes.",
    isKo ? "면적은 현재 에너지 입력과 같습니다. 모델 추출 범위와 미측정 대체값을 구분하고, U값·설비·기밀·운전시간의 가정은 아래 건물별 근거를 확인하세요."
      : "Areas follow the current energy inputs. Model extraction and unmeasured stand-ins remain distinct; the building-specific evidence below names U-value, systems, airtightness and operating-hour assumptions.",
    energy.roof ? isKo ? `에너지 입력의 지붕 분류: ${ROOF_TYPE_KO[energy.roof.type]} · ${energy.roof.read}` : `Energy-input roof category: ${energy.roof.type} · ${energy.roof.read}`
      : isKo ? "파일이 지붕 형태를 명시하지 않습니다. 태양광은 지붕면 배치 결과가 있을 때만 산정합니다." : "The file states no roof typology. PV capacity comes only from the roof-plane layout.",
    isKo ? "태양광 용량은 지붕면에 배치된 모듈 수 × 가정 정격용량입니다. 배치 자료가 없으면 신규 용량을 산정하지 않습니다. 연간 전력 수요까지만 상계하며 시간별 자가소비나 판매 수익을 계산하지 않습니다."
      : "PV capacity is the modules placed on the roof planes × assumed module rating. No layout means no new capacity. Substitution is capped at annual electric demand; hourly self-consumption and export revenue are not modeled.",
    isKo ? "열회수환기나 다른 공사로 계산 에너지·탄소가 증가하면 증가한 결과를 그대로 표시합니다. 창호의 SHGC는 그대로 두므로 별도의 냉방 개선을 가정하지 않습니다."
      : "If HRV or another measure increases modeled energy or carbon, that increase remains visible. Window SHGC is left unchanged; no separate cooling improvement is assumed.",
  ];
}

/** The reference page and canvas describe the same user-chosen package. */
export function ReferenceRetrofitPanel({ energy, locale }: { energy: ReferenceBuildingEnergyInputs; locale: "ko" | "en" }) {
  const isKo = locale === "ko";
  const { buildingPk, climate } = energy;
  const capexBudgetKrw = useScenarioStore((state) => state.capexBudgetKrw);
  const appliedMeasureIds = useScenarioStore((state) => state.appliedMeasureIds);
  const pvLayout = usePvLayout();
  const metrics = useEnergyMetrics(buildingPk, climate.sigunguCd);
  const quantities = envelopeQuantities(energy.recipe);
  const engineEnvelopeAreas = useMemo(() => metrics ? engineEnvelopeAreasFrom(metrics.heatLoss.elements, energy.exteriorDoorSqm ?? 0) : undefined, [metrics, energy.exteriorDoorSqm]);
  const climateRegion = useMemo(() => resolveClimateRegion({ sigunguCd: climate.sigunguCd }), [climate.sigunguCd]);
  const scenario = useRetrofitScenario({ buildingPk, capexBudgetKrw, totalFloorArea: quantities.intensityFloorAreaSqm,
    footprintArea: quantities.planAreaSqm, roofType: energy.roof?.type ?? "flat", climateRegion,
    engineDemand: metrics?.demand, engineEnvelopeAreas, pvGeometricKWp: pvLayout?.totalKWp ?? 0,
    chosenMeasureIds: appliedMeasureIds });
  const chosen = scenario.chosen?.selected ?? [];

  return <section className="mt-6 min-w-0 [overflow-wrap:anywhere]" data-testid="reference-model-retrofit">
    <h3 className="text-sm font-medium">{isKo ? "리트로핏 · 선택한 공사의 영향" : "Retrofit · impact of chosen work"}</h3>
    <p className="mt-2 text-xs text-muted-foreground" data-testid="reference-model-retrofit-summary">
      {isKo ? `${scenario.allMeasures.length}개 후보 중 ${chosen.length}개 선택` : `${chosen.length} chosen of ${scenario.allMeasures.length} candidates`}
    </p>
    {chosen.length === 0 && <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground" data-testid="reference-model-retrofit-none-selected">{isKo ? "선택한 공사가 없습니다. 아래에서 원하는 공사를 선택하세요." : "No work is selected. Choose the work below."}</p>}
    <div className="mt-3 overflow-hidden rounded-lg border border-border">
      {scenario.coreResult?.delta && <div className="pt-3"><RetrofitOutcome delta={scenario.coreResult.delta} /></div>}
      <ScenarioRail capexBudgetKrw={capexBudgetKrw} selection={scenario.chosen} assumptions={scenario.assumptions}
        totalCandidateMeasures={scenario.allMeasures.length} modeledBill={scenario.coreResult?.bill} unsavedEditCount={scenario.unsavedEditCount} />
      <MeasureChipRow measures={scenario.allMeasures} recommendedIds={scenario.selection?.selected.map((measure) => measure.id) ?? []}
        areas={engineEnvelopeAreas} totalFloorAreaSqm={quantities.intensityFloorAreaSqm} />
      {scenario.allMeasures.length === 0 && <p className="p-3 text-[11px] text-muted-foreground" data-testid="reference-model-retrofit-empty">{isKo ? "현재 입력으로 계산 가능한 개선 후보가 없습니다. 입력과 설비 상태를 확인하세요." : "No retrofit candidates can be evaluated from these inputs. Check the inputs and systems."}</p>}
      <ClimateRegionDisclosure region={climateRegion} />
      <RetrofitVerification buildingPk={buildingPk} assumptions={energy.assumptions} />
    </div>
    <ReferencePvUtilisation layout={pvLayout} locale={locale} />
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-medium">{isKo ? "계산 범위와 한계" : "Calculation scope and limits"}</summary>
      <ul className="mt-2 space-y-2 text-[11px] leading-relaxed text-muted-foreground" data-testid="reference-model-retrofit-basis">
        {retrofitBasisLines(energy, isKo).map((line) => <li key={line}>{line}</li>)}
      </ul>
    </details>
  </section>;
}
