"use client";

// src/components/reference-building/reference-retrofit.tsx
//
// 리트로핏 — the third section of the model page's information contract, and
// until 2026-09-06 the one a desktop reader could not see at all.
//
// `SelectedMeasuresStrip` in the instrument frame returns `null` unless the
// viewport is narrow, so on a laptop "Retrofit" was four numbers in the top
// rail — NPV, payback, effective CAPEX, horizon — with nothing underneath
// saying what they were the numbers OF. This is that list.
//
// Two rules it exists to keep:
//
//   - **Every candidate, not just the winners.** At the default ₩2.5억 with
//     no subsidy the Clinic selects 0 of its 6 measures. An empty list under
//     "0개 선택 · NPV ₩0" reads as a broken panel; six cards each saying why
//     it did not clear the bar is an answer.
//   - **One card, one order.** The card is `scene-outliner.tsx`'s, extracted
//     rather than copied, and the category order is a shared constant so a
//     fourth building cannot arrive with its own.
//
// It does NOT restate the before/after energy delta — that is
// `RetrofitDeltaStrip` in the frame. This section is the candidates and their
// economics; that one is what the selection does to the building.

import { useMemo } from "react";

import { useScenarioStore } from "@/store/scenario-store";
import { useEnergyMetrics } from "@/hooks/use-energy-metrics";
import { usePvLayout } from "@/hooks/use-pv-layout";
import {
  useRetrofitScenario,
  engineEnvelopeAreasFrom,
} from "@/hooks/use-retrofit-scenario";
import { envelopeQuantities } from "@/lib/energy/envelope-quantities";
import {
  MeasureCard,
  CategoryIcon,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  RETROFIT_CATEGORY_ORDER,
  formatKRW,
  formatKWh,
} from "@/components/retrofit/measure-card";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";
import type { ReferenceBuildingEnergyInputs } from "@/lib/reference-buildings/energy-inputs";
import { ReferencePvUtilisation } from "./reference-pv-utilisation";

/**
 * The four roof typologies in Korean. `flat` alone was translated until FZK
 * Haus arrived with a `gable`, and the Korean sentence printed the bare
 * English enum. The words are the register's own (박공 / 우진각), which is
 * the vocabulary `twin-stage-overlay.tsx` already reads roof codes in.
 */
const ROOF_TYPE_KO: Record<"flat" | "gable" | "hip" | "sawtooth", string> = {
  flat: "평지붕",
  gable: "박공지붕",
  hip: "우진각지붕",
  sawtooth: "톱날지붕",
};

/**
 * Why a candidate is not in the selected set.
 *
 * Read off the same three facts the knapsack used — effective CAPEX, NPV,
 * and the budget — so the reason cannot disagree with the selection it is
 * explaining. `null` for a selected measure.
 */
export function exclusionReason(
  measure: RetrofitMeasure,
  selected: boolean,
  capexBudgetKrw: number | null,
  isKo: boolean,
): string | null {
  if (selected) return null;
  const npv = measure.financials?.npv;
  const effective = measure.financials?.effectiveCapex ?? measure.estimatedCost;

  if (npv !== undefined && npv < 0) {
    return isKo
      ? `선택 안 됨 — 20년 NPV가 ${formatKRW(npv)}. 지금 조건에서는 절감액이 투자비를 회수하지 못합니다.`
      : `Not selected — 20-year NPV is ${formatKRW(npv)}. On these terms the saving never repays the outlay.`;
  }
  if (capexBudgetKrw !== null && effective > capexBudgetKrw) {
    return isKo
      ? `선택 안 됨 — NPV는 양수(${npv !== undefined ? formatKRW(npv) : "—"})지만 투자비 ${formatKRW(effective)}가 예산 ${formatKRW(capexBudgetKrw)}를 넘습니다.`
      : `Not selected — NPV is positive (${npv !== undefined ? formatKRW(npv) : "—"}) but its cost ${formatKRW(effective)} exceeds the ${formatKRW(capexBudgetKrw)} budget.`;
  }
  if (measure.conflictGroup ?? measure.exclusiveGroup) {
    return isKo
      ? "선택 안 됨 — 같은 설비를 교체하는 대안이 이미 선택되어 있습니다 (둘은 합산되지 않습니다)."
      : "Not selected — an alternative replacing the same plant is already in the set; the two are never additive.";
  }
  return isKo
    ? "선택 안 됨 — 예산 안에서 NPV 합이 더 큰 조합이 있습니다."
    : "Not selected — another combination within the same budget sums to a higher NPV.";
}

/**
 * What these numbers rest on, and — just as important — what the engine does
 * NOT do with them. Three disclosures, all measured rather than assumed:
 *
 *   - Lighting and PV move NPV and cannot move kWh/m² or the grade, because
 *     `deliveredFromDemand` derives lighting as a flat 15 % of total demand
 *     and hard-codes renewable to 0. `lightingPowerDensity` and `solarPV`
 *     reach neither the degree-day run nor the grade path.
 *   - The HRV's saving comes from `hvac-retrofits.ts`, not from this engine.
 *     Re-running the engine on a heat-recovery system reads `airflowRate` for
 *     the first time (it is ignored while ventilation is "natural"), so the
 *     modelled air-exchange loss RISES while the measure claims a saving.
 *   - Window replacement is priced on the heating side only; its SHGC is
 *     left alone, so no cooling change is claimed.
 */
export function retrofitBasisLines(
  energy: ReferenceBuildingEnergyInputs,
  isKo: boolean,
): string[] {
  const roof = energy.roof;
  return [
    isKo
      ? "단가는 KICT 2024 표준품셈, 내용연수는 ASHRAE 기준입니다. 지원금·이자 지원을 적용하지 않은 투자비이며, 할인율 5.0%, 분석기간 20년입니다."
      : "Unit costs KICT 2024, lifetimes ASHRAE. Costs exclude grants and interest support; discount rate 5.0 %, 20-year horizon.",
    isKo
      ? "면적은 현재 에너지 입력과 같습니다 — 지붕 표면, 지반 슬래브, 창 개구부, 벽은 총벽 − 개구부 − 출입문입니다. 실측 범위와 미측정 대체값은 에너지 프로파일의 근거를 확인하세요."
      : "Areas follow the current energy inputs: roof surface, ground slab, window aperture, and wall at gross − aperture − doors. The energy profile distinguishes extraction scope from unmeasured stand-ins.",
    roof
      ? isKo
        ? `에너지 입력의 지붕 분류: ${ROOF_TYPE_KO[roof.type]} · ${roof.read}`
        : `Energy-input roof category: ${roof.type} · ${roof.read}`
      : isKo
        ? "이 건물 파일은 지붕 형태를 명시하지 않습니다. 태양광 용량은 지붕면 배치 결과로만 산정합니다."
        : "This building's file states no roof typology. PV capacity comes only from the roof-plane layout.",
    isKo
      ? "태양광 용량은 지붕면에 배치된 모듈 수 × 가정 정격용량으로 산정하며, 지붕면 데이터가 없으면 용량을 산정하지 않습니다. 지붕면별 배치표에 면적·용량·제외 사유와 가정을 표시합니다."
      : "PV capacity is the modules placed on the roof planes × assumed module rating; without roof-plane data no capacity is priced. The roof-plane table lists areas, capacity, exclusions and assumptions.",
    isKo
      ? "조명·태양광은 NPV만 움직이고 kWh/m²와 등급은 움직이지 못합니다: 엔진의 1차에너지 변환이 조명을 총수요의 15%로 고정하고 신재생을 0으로 두기 때문입니다."
      : "Lighting and PV move NPV only, and cannot move kWh/m² or the grade: the primary-energy step derives lighting as a flat 15 % of total demand and hard-codes renewable to 0.",
    isKo
      ? "열회수환기(HRV)의 절감은 설비 계산에서 나오며 도일법 엔진이 재현하지 않습니다 — 자연환기 건물에 기계환기를 넣으면 엔진은 그 풍량을 처음 읽어 오히려 손실이 늘어납니다."
      : "The HRV's saving comes from the plant model, not from this degree-day engine — on a naturally-ventilated building, switching to heat recovery makes the engine read that airflow for the first time and modelled loss goes UP.",
    isKo
      ? "창호 교체는 난방 측만 계산합니다. 일사취득계수(SHGC)는 그대로 두므로 냉방 변화는 주장하지 않습니다."
      : "Window replacement is priced on the heating side only; its SHGC is left unchanged, so no cooling change is claimed.",
  ];
}

export function ReferenceRetrofitPanel({
  energy,
  locale,
}: {
  energy: ReferenceBuildingEnergyInputs;
  locale: "ko" | "en";
}) {
  const isKo = locale === "ko";
  const { buildingPk, climate } = energy;
  const capexBudgetKrw = useScenarioStore((s) => s.capexBudgetKrw);
  const pvLayout = usePvLayout();

  // The SAME engine run the frame's HUD uses — same store key, same sigungu
  // code — so the section under the canvas and the rail over it are priced
  // against one baseline rather than two that happen to agree.
  const metrics = useEnergyMetrics(buildingPk, climate.sigunguCd);
  const quantities = envelopeQuantities(energy.recipe);
  const engineEnvelopeAreas = useMemo(
    () =>
      metrics
        ? engineEnvelopeAreasFrom(metrics.heatLoss.elements, energy.exteriorDoorSqm ?? 0)
        : undefined,
    [metrics, energy.exteriorDoorSqm],
  );

  const scenario = useRetrofitScenario({
    buildingPk,
    capexBudgetKrw,
    totalFloorArea: quantities.intensityFloorAreaSqm,
    footprintArea: quantities.planAreaSqm,
    roofType: energy.roof?.type ?? "flat",
    sidoPrefix: climate.sigunguCd.slice(0, 2),
    engineDemand: metrics?.demand,
    engineEnvelopeAreas,
    pvGeometricKWp: pvLayout?.totalKWp ?? 0,
  });

  const selectedIds = useMemo(
    () => new Set((scenario.selection?.selected ?? []).map((m) => m.id)),
    [scenario.selection],
  );

  const byCategory = useMemo(() => {
    return RETROFIT_CATEGORY_ORDER.map((category) => ({
      category,
      measures: scenario.allMeasures.filter((m) => m.category === category),
    })).filter((row) => row.measures.length > 0);
  }, [scenario.allMeasures]);

  const totals = useMemo(() => {
    const selected = scenario.selection?.selected ?? [];
    return {
      count: selected.length,
      candidates: scenario.allMeasures.length,
      capex: selected.reduce(
        (s, m) => s + (m.financials?.effectiveCapex ?? m.estimatedCost),
        0,
      ),
      saving: selected.reduce((s, m) => s + m.annualEnergySaving, 0),
      npv: selected.reduce((s, m) => s + (m.financials?.npv ?? 0), 0),
    };
  }, [scenario.selection, scenario.allMeasures]);

  return (
    <section className="mt-6" data-testid="reference-model-retrofit">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {isKo ? "리트로핏 · 개선 후보" : "Retrofit · candidate measures"}
      </p>

      {scenario.allMeasures.length === 0 ? (
        // Not an empty state for its own sake: it says which of the two
        // reasons applies, because "no measures" and "no engine answer yet"
        // look identical on screen and mean opposite things.
        <p
          className="mt-2 text-[10px] leading-relaxed text-muted-foreground"
          data-testid="reference-model-retrofit-empty"
        >
          {metrics
            ? isKo
              ? "이 건물의 모든 외피·설비 요소가 이미 2020년 기준을 충족하여 제안할 개선안이 없습니다."
              : "Every envelope and plant element already meets the 2020 targets, so there is no measure to propose."
            : isKo
              ? "엔진 결과를 기다리는 중입니다 — 개선안은 계산이 끝난 뒤에 나타납니다."
              : "Waiting on the engine — measures appear once it has run."}
        </p>
      ) : (
        <>
          <p
            className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground"
            data-testid="reference-model-retrofit-summary"
          >
            {capexBudgetKrw === null
              ? isKo
                ? `후보 ${totals.candidates}개 중 ${totals.count}개 선택 (예산 없음) · 투자비 ${formatKRW(totals.capex)} · 절감 ${formatKWh(totals.saving)}/yr · NPV ${formatKRW(totals.npv)}`
                : `${totals.count} of ${totals.candidates} candidates chosen (no budget) · ${formatKRW(totals.capex)} capex · ${formatKWh(totals.saving)}/yr saved · NPV ${formatKRW(totals.npv)}`
              : isKo
                ? `후보 ${totals.candidates}개 중 예산 ₩${(capexBudgetKrw / 100_000_000).toFixed(1)}억 안에서 ${totals.count}개 선택 · 투자비 ${formatKRW(totals.capex)} · 절감 ${formatKWh(totals.saving)}/yr · NPV ${formatKRW(totals.npv)}`
                : `${totals.count} of ${totals.candidates} candidates fit the ₩${(capexBudgetKrw / 100_000_000).toFixed(1)}억 budget · ${formatKRW(totals.capex)} capex · ${formatKWh(totals.saving)}/yr saved · NPV ${formatKRW(totals.npv)}`}
          </p>
          {totals.count === 0 ? (
            <p
              className="mt-1.5 text-[10px] leading-relaxed text-amber-700 dark:text-amber-400"
              data-testid="reference-model-retrofit-none-selected"
            >
              {isKo
                ? "선택된 개선안이 없습니다. 아래 카드에서 비용과 선정되지 않은 이유를 확인하고, 모델 상단에서 원하는 공사를 선택할 수 있습니다."
                : "No work is selected. Review the costs and reasons below, then choose work in the panel above the model."}
            </p>
          ) : null}

          <div className="mt-3">
            {byCategory.map(({ category, measures }) => (
              <div key={category} className="mb-3 last:mb-0">
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[category]}`}
                  >
                    <CategoryIcon category={category} className="h-3 w-3" />
                    {CATEGORY_LABELS[category]}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {measures.length}개
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {formatKWh(measures.reduce((s, m) => s + m.annualEnergySaving, 0))}/yr
                  </span>
                </div>
                {measures.map((m) => (
                  <MeasureCard
                    key={m.id}
                    measure={m}
                    selected={selectedIds.has(m.id)}
                    locale={locale}
                    note={
                      exclusionReason(m, selectedIds.has(m.id), capexBudgetKrw, isKo) ??
                      undefined
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      <ReferencePvUtilisation layout={pvLayout} locale={locale} />

      <details className="mt-3 group">
        <summary className="cursor-pointer text-[11px] text-foreground">
          {isKo ? "이 수치의 근거와 한계" : "What these numbers rest on, and what they do not do"}
        </summary>
        <ul className="mt-2 space-y-1.5" data-testid="reference-model-retrofit-basis">
          {retrofitBasisLines(energy, isKo).map((line) => (
            <li key={line} className="text-[10px] leading-relaxed text-muted-foreground">
              {line}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
