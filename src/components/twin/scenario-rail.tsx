"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { useDebounce } from "@/hooks/use-debounce";
import { formatKrw } from "@/lib/twin-formatters";
import type { BudgetSelection, EconomicAssumptions } from "@/lib/retrofit/economic-model";

export interface ModeledBillSaving {
  beforeAnnualKrw: number;
  afterAnnualKrw: number;
  annualSavingKrw: number;
  tariffs: { electricity: number; gas: number; districtHeating: number; districtCooling: number };
  basis: string;
}

interface ScenarioRailProps {
  capexBudgetKrw: number | null;
  onBudgetChange?: (krw: number | null) => void;
  selection: BudgetSelection | null;
  assumptions: EconomicAssumptions;
  totalCandidateMeasures: number;
  modeledBill?: ModeledBillSaving | null;
  unsavedEditCount?: number;
}

const toDraft = (krw: number | null) => krw === null ? "" : String(Math.round(krw / 10_000));
const toKrw = (raw: string) => {
  const value = Number(raw.trim());
  return raw.trim() && Number.isFinite(value) && value > 0 ? value * 10_000 : null;
};

/** Currency comes from paired core runs, never a proxy NPV headline. */
export function ScenarioRail({ capexBudgetKrw, onBudgetChange, selection, totalCandidateMeasures, modeledBill, unsavedEditCount = 0 }: ScenarioRailProps) {
  const { t, lang } = useT();
  const [draft, setDraft] = useState(() => toDraft(capexBudgetKrw));
  const [seenProp, setSeenProp] = useState(capexBudgetKrw);
  if (capexBudgetKrw !== seenProp) {
    setSeenProp(capexBudgetKrw);
    if (toKrw(draft) !== capexBudgetKrw) setDraft(toDraft(capexBudgetKrw));
  }
  const debounced = useDebounce(draft, 250);
  useEffect(() => {
    if (!onBudgetChange || debounced !== draft) return;
    const krw = toKrw(debounced);
    if (krw !== capexBudgetKrw && debounced !== toDraft(capexBudgetKrw)) onBudgetChange(krw);
  }, [debounced, draft, capexBudgetKrw, onBudgetChange]);

  return <div className="min-w-0 space-y-3 p-3 [overflow-wrap:anywhere]" data-twin-rail>
    <div>
      <h3 className="text-sm font-medium tracking-tight">{t("선택한 공사의 영향", "Impact of chosen work")}</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground" data-twin-rail-selection>
        {t(`${selection?.selected.length ?? 0}/${totalCandidateMeasures}개 선택 · 에너지와 탄소 전후를 함께 확인하세요.`, `${selection?.selected.length ?? 0}/${totalCandidateMeasures} chosen · compare energy and carbon before committing.`)}
      </p>
    </div>
    <div className="rounded-md border border-border p-3" data-testid="retrofit-modeled-bill">
      <p className="text-[11px] font-medium">{t("연간 에너지 요금 절감 · 계산값", "Annual energy bill saving · modeled")}</p>
      {modeledBill ? <>
        <p className="mt-1 text-lg font-medium tabular-nums" data-testid="retrofit-annual-saving" data-saving-krw={modeledBill.annualSavingKrw}>{formatKrw(modeledBill.annualSavingKrw, lang)}{t("/년", "/yr")}</p>
        <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
          {t("이전", "Before")} {formatKrw(modeledBill.beforeAnnualKrw, lang)} → {t("이후", "After")} {formatKrw(modeledBill.afterAnnualKrw, lang)}
        </p>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground" data-testid="retrofit-bill-basis">
          {t(`공사 전후 구매 에너지 × 가정 단가. 전기 ${modeledBill.tariffs.electricity}, 가스 ${modeledBill.tariffs.gas}, 지역난방 ${modeledBill.tariffs.districtHeating}, 지역냉방 ${modeledBill.tariffs.districtCooling}원/kWh. 실제 고지서나 견적이 아닙니다. 태양광은 연간 전력 수요까지만 상계하며 판매 수익은 포함하지 않습니다.`, `Purchased energy before/after × assumed tariffs: electricity ${modeledBill.tariffs.electricity}, gas ${modeledBill.tariffs.gas}, district heating ${modeledBill.tariffs.districtHeating}, district cooling ${modeledBill.tariffs.districtCooling} KRW/kWh. Not an actual bill or quote. PV offsets annual electricity demand only; no export revenue is included.`)}
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          {t("지역냉방 단가에는 지역난방 단가를 대체값으로 적용합니다.", "District cooling uses the district-heating tariff as a proxy.")}
        </p>
        {modeledBill.annualSavingKrw < 0 && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">{t("음수는 요금 증가를 뜻합니다.", "A negative saving means a higher bill.")}</p>}
      </> : <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t("동일한 엔진의 공사 전후 계산이 준비되면 표시합니다. 대체 절감률로 금액을 만들지 않습니다.", "Available when the same engine has evaluated both cases. No proxy saving is priced here.")}</p>}
    </div>
    {unsavedEditCount > 0 && <p className="text-[11px] leading-relaxed text-muted-foreground" data-testid="retrofit-unsaved-edits">{t(`원본 모델과 다른 로컬 입력 항목 ${unsavedEditCount}개가 포함됩니다. 원본에 저장되지 않으며 이 브라우저에는 보관될 수 있습니다.`, `${unsavedEditCount} local fields differ from the source model. They are not saved to the source and may persist in this browser.`)}</p>}
    {onBudgetChange && <label className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      <span>{t("예산 · 사용자 입력, 선택 사항", "Budget · optional user input")}</span>
      <input type="number" inputMode="numeric" min={0} step={1000} placeholder={t("없음", "none")}
        aria-label={t("투자 예산, 만원, 선택 사항", "Budget, 만원, optional")} data-twin-budget-input
        className="w-24 min-w-0 rounded border border-border bg-background px-2 py-1 tabular-nums text-foreground"
        value={draft} onChange={(event) => setDraft(event.target.value)} />
      <span>{t("만원", "KRW 10,000")}</span>
    </label>}
  </div>;
}
