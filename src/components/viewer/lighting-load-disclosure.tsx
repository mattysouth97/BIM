"use client";

import { pick, type Lang } from "@/lib/i18n";
import type { LightingLoadProvenance } from "@/lib/energy/lighting-load";

/** The caption and the value share the exact inputs used by modeledLightingLoad. */
export function LightingLoadDisclosure({ provenance, kwh, lang }: {
  provenance: LightingLoadProvenance;
  kwh: number;
  lang: Lang;
}) {
  const t = (ko: string, en: string) => pick(lang, ko, en);
  return (
      <div data-testid="lighting-load-explanation" className="space-y-1 text-[10px] text-muted-foreground pl-1">
        <p>
          {t("조명", "Lighting")}: {provenance.lpdWPerSqm} W/m²
          {" × "}{provenance.conditionedFloorAreaSqm} m²
          {" × "}{provenance.hoursPerYear} {t("시간/년", "h/yr")}
          {" ÷ 1000 = "}{kwh} kWh/yr
        </p>
        <p>
          {provenance.lpdProvenance?.source === "use_code_default"
            ? t(
                provenance.lpdProvenance.assumption,
                `LPD ${provenance.lpdWPerSqm} W/m² is an assumed use-code lighting default (${provenance.lpdProvenance.useCode}), not stated by the building register.`,
              )
            : provenance.lpdProvenance?.source === "user_input"
              ? t("조명전력밀도: 사용자 입력", "LPD: user input")
              : provenance.lpdProvenance?.source === "retrofit_target"
                ? t(
                    provenance.lpdProvenance.assumption,
                    `LPD ${provenance.lpdWPerSqm} W/m² is an assumed LED retrofit target, not a measurement.`,
                  )
                : t(
                    `조명전력밀도 ${provenance.lpdWPerSqm} W/m²의 출처가 기록되지 않아 가정으로 취급합니다.`,
                    `LPD ${provenance.lpdWPerSqm} W/m² has no recorded source and is treated as an assumption.`,
                  )}
        </p>
        <p>
          {provenance.source === "default_hours"
            ? t(
                provenance.assumption,
                `No operating-hours profile matched; ${provenance.hoursPerYear} h/yr is the assumed default.`,
              )
            : t(
                `운전시간 ${provenance.hoursPerYear}시간/년은 주용도코드 ${provenance.mainPurpsCd}의 가정이며, 실측 운전시간이 아닙니다.`,
                `Operating hours ${provenance.hoursPerYear} h/yr are assumed for use code ${provenance.mainPurpsCd}, not measured.`,
              )}
        </p>
      </div>
  );
}
