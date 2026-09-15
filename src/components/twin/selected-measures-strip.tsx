"use client";

import { useT } from "@/lib/i18n";
import { measureDisplayName } from "@/lib/retrofit/measure-claim";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";

/** The actual chosen work, shared by desktop and mobile, without return claims. */
export function SelectedMeasuresStrip({ measures }: { measures: RetrofitMeasure[] }) {
  const { t, lang } = useT();
  return <div className="border-b border-border px-3 py-3 [overflow-wrap:anywhere]" data-twin-selected-measures>
    <p className="text-[11px] font-medium">{t(`선택한 공사 ${measures.length}개`, `${measures.length} chosen measures`)}</p>
    {measures.length ? <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
      {measures.map((measure) => <li key={measure.id}>{measureDisplayName(measure.id, lang, measure.name)}</li>)}
    </ul> : <p className="mt-1 text-[11px] text-muted-foreground">{t("공사를 선택하면 전후 비교에 반영됩니다.", "Choose work to include it in the comparison.")}</p>}
  </div>;
}
