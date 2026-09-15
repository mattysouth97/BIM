"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { useScenarioStore, useEffectiveMeasureIds } from "@/store/scenario-store";
import { useMaterialStore } from "@/store/material-store";
import { useEffectiveRecipe } from "@/hooks/use-effective-recipe";
import { useActiveSigunguCd } from "@/hooks/use-active-building-pk";
import { usePvLayout } from "@/hooks/use-pv-layout";
import { climateFromRegion, getClimateData } from "@/lib/energy/climate-data";
import { computeRetrofitDelta, zeroDeltaReason, type RetrofitDelta } from "@/lib/retrofit/retrofit-delta";

/** Explicit paired values, including unchanged and worsening results. */
export function RetrofitOutcome({ delta }: { delta: RetrofitDelta }) {
  const { t } = useT();
  const rows = [
    { id: "site", label: t("현장 에너지", "Site energy"), unit: "kWh/m²·yr", before: delta.before.sitePerSqm, after: delta.after.sitePerSqm },
    { id: "primary", label: t("1차에너지", "Primary energy"), unit: "kWh/m²·yr", before: delta.before.primaryPerSqm, after: delta.after.primaryPerSqm },
    { id: "carbon", label: t("탄소 배출", "Carbon emissions"), unit: "kgCO₂/m²·yr", before: delta.before.co2.co2PerSqm, after: delta.after.co2.co2PerSqm },
  ];
  return <div className="px-3 pb-3" data-testid="retrofit-outcomes">
    <p className="mb-3 text-xs font-medium">{t("선택 공사 전후 · 계산값", "Chosen work before/after · modeled")}</p>
    <div className="grid grid-cols-[1.25fr_1fr_1fr] gap-x-2 text-[11px]">
      <span />
      <span className="pb-2 text-right text-muted-foreground">{t("이전", "Before")}</span>
      <span className="pb-2 text-right text-muted-foreground">{t("이후", "After")}</span>
      {rows.map((row) => <div key={row.id} className="col-span-3 grid grid-cols-subgrid border-t border-border py-2">
        <div>{row.label}<span className="block text-[10px] text-muted-foreground">{row.unit}</span></div>
        <span className="text-right text-sm tabular-nums" data-testid={`retrofit-${row.id}-before`} data-value={row.before}>{row.before.toFixed(1)}</span>
        <span className="text-right text-sm tabular-nums" data-testid={`retrofit-${row.id}-after`} data-value={row.after}>{row.after.toFixed(1)}</span>
      </div>)}
      <div className="col-span-3 grid grid-cols-subgrid border-t border-border py-2">
        <span>{t("효율 등급", "Efficiency grade")}</span>
        <span className="text-right font-medium">{delta.before.grade}</span>
        <span className="text-right font-medium">{delta.after.grade}</span>
      </div>
    </div>
    <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{t("현장 에너지는 발전량 차감 전 사용량입니다. 태양광은 구매 전력·1차에너지·탄소에 반영합니다. 등급은 1차에너지 기준의 간이 계산이며 인증 결과가 아닙니다.", "Site energy is gross use before generation. PV reduces purchased electricity, primary energy and carbon. The grade is a screening calculation based on primary energy, not a certification result.")}</p>
  </div>;
}

export function RetrofitDeltaStrip({ deltaOverride }: { deltaOverride?: RetrofitDelta | null } = {}) {
  const { t, lang } = useT();
  const [expanded, setExpanded] = useState(false);
  const buildingInputs = useScenarioStore((s) => s.buildingInputs);
  const chosenMeasureIds = useEffectiveMeasureIds();
  const previewProposal = useScenarioStore((s) => s.previewProposal);
  const setPreviewProposal = useScenarioStore((s) => s.setPreviewProposal);
  const buildingPk = buildingInputs?.buildingPk ?? "";
  const materials = useMaterialStore((s) => s.properties[buildingPk]);
  const recipe = useEffectiveRecipe(buildingPk);
  const sigunguCd = useActiveSigunguCd();
  const pvLayout = usePvLayout();
  const delta = useMemo(() => {
    if (deltaOverride !== undefined) return deltaOverride;
    if (!materials || !recipe) return null;
    return computeRetrofitDelta({ materials, recipe,
      climate: buildingInputs?.climateRegion ? climateFromRegion(buildingInputs.climateRegion) : getClimateData(sigunguCd),
      climateRegion: buildingInputs?.climateRegion, measureIds: chosenMeasureIds, pvGeometricKWp: pvLayout?.totalKWp ?? 0 });
  }, [deltaOverride, materials, recipe, buildingInputs, sigunguCd, chosenMeasureIds, pvLayout]);
  const zeroReason = zeroDeltaReason(chosenMeasureIds.length, delta?.measures ?? []);
  const unpriced = delta?.changes.filter((change) => !change.pricedByEngine) ?? [];

  return <div className="min-w-0 border-b border-border [overflow-wrap:anywhere]" data-retrofit-delta-strip>
    <div className="flex flex-wrap items-center gap-2 p-3">
      <button type="button" onClick={() => setPreviewProposal(!previewProposal)} aria-pressed={previewProposal}
        data-retrofit-preview-toggle className="rounded-md border border-border px-2 py-1.5 text-[11px] font-medium hover:bg-muted">
        {t("제안 미리보기", "Preview proposal")} {previewProposal ? "ON" : "OFF"}
      </button>
      {delta && delta.changes.length > 0 && <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}
        className="ml-auto rounded px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground">{expanded ? t("접기", "Less") : t("자세히", "Detail")}</button>}
    </div>
    {delta ? <>
      <RetrofitOutcome delta={delta} />
      {delta.isZeroDelta && <p className="px-3 pb-3 text-[11px] leading-relaxed text-muted-foreground" data-zero-reason={zeroReason}>
        {zeroReason === "nothing-chosen" ? t("선택한 공사 없음 — 공사를 선택하면 변화가 여기에 나타납니다.", "No work chosen — select work to see its effect here.") : zeroReason === "only-unpriced" ? t("선택한 공사의 영향을 이 실행에서 산정하지 못했습니다. 아래 사유를 확인하세요.", "This run cannot quantify the selected work. Review the reasons below.") : t("선택한 공사의 적용 전후가 이 계산에서 동일합니다. 목표값·제약·입력을 확인하세요.", "The selected work leaves these modeled outputs unchanged. Check its targets, constraints and inputs.")}
      </p>}
      {(expanded || zeroReason === "only-unpriced") && <div className="space-y-3 border-t border-border p-3 text-[11px] leading-relaxed">
        <ul className="space-y-2">{delta.changes.map((change) => <li key={`${change.measureId}:${change.field}`}>
          {lang === "ko" ? change.summaryKo : change.summaryEn}
          {!change.pricedByEngine && <p className="text-muted-foreground">{lang === "ko" ? change.unpricedReasonKo : change.unpricedReasonEn}</p>}
        </li>)}</ul>
        {delta.elements.filter((element) => element.deltaHCoefficient !== 0).map((element) => <p key={element.element} className="text-muted-foreground">
          {lang === "ko" ? element.labelKo : element.labelEn}: {element.beforeHCoefficient.toFixed(1)} → {element.afterHCoefficient.toFixed(1)} W/K
        </p>)}
        {unpriced.length > 0 && <p className="text-muted-foreground">{t("산정되지 않은 항목을 추가 절감으로 합산하지 않습니다.", "Unquantified effects are not added as extra savings.")}</p>}
        {!previewProposal && <p className="text-muted-foreground">{t("3D는 현재 상태를 보여줍니다. 위 수치는 선택한 제안 기준입니다.", "The 3D shows the current state; the values above describe the chosen proposal.")}</p>}
      </div>}
    </> : <p className="px-3 pb-3 text-[11px] leading-relaxed text-muted-foreground">{t("이 건물의 재료·형상이 아직 없어 제안 전후를 계산할 수 없습니다.", "No materials or geometry for this building yet, so the before/after cannot be computed.")}</p>}
  </div>;
}
