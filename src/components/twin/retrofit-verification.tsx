"use client";

import { useT } from "@/lib/i18n";
import { useMaterialStore } from "@/store/material-store";
import { useEffectiveRecipe } from "@/hooks/use-effective-recipe";

/** A model origin is not field-by-field measurement evidence. Keep both visible. */
export function RetrofitVerification({ buildingPk, assumptions = [] }: {
  buildingPk: string;
  assumptions?: readonly { id: string; assumes: string; why: string }[];
}) {
  const { t } = useT();
  const materials = useMaterialStore((state) => state.properties[buildingPk]);
  const recipe = useEffectiveRecipe(buildingPk);
  const lighting = materials?.lighting.lpdProvenance;
  return <div className="min-w-0 space-y-4 p-3 text-[11px] leading-relaxed [overflow-wrap:anywhere]" data-testid="retrofit-verification">
    <section>
      <h4 className="font-medium text-foreground">{t("입력의 근거", "Input evidence")}</h4>
      <dl className="mt-2 space-y-2 text-muted-foreground">
        <div><dt className="font-medium">{t("형상·면적", "Geometry and areas")}</dt>
          <dd>{recipe?.measuredEnvelope ? recipe.measuredEnvelope.basis : t("현재 형상 입력으로 추정합니다. 이 패널에 연결된 모델 추출 외피 면적이 없습니다.", "Inferred from current geometry inputs. No model-extracted envelope quantities are linked in this panel.")}</dd>
        </div>
        <div><dt className="font-medium">{t("조명 전력밀도", "Lighting power density")}</dt>
          <dd>{lighting?.source === "user_input" ? t("사용자 입력입니다. 실측 증빙이 자동으로 부여되지는 않습니다.", "User input; no measurement evidence is assigned automatically.") : lighting && "assumption" in lighting ? lighting.assumption : t("기본 입력값이며 별도 실측 근거가 연결되지 않았습니다.", "Default input without linked measurement evidence.")}</dd>
        </div>
        <div><dt className="font-medium">{t("실측 소비량", "Measured consumption")}</dt>
          <dd>{t("이 전후 비교는 계산값입니다. 실제 고지서나 계측 시계열로 보정하지 않았습니다.", "This before/after comparison is modeled. It has not been calibrated to bills or a metered time series.")}</dd>
        </div>
      </dl>
      {assumptions.length > 0 && <details className="mt-3">
        <summary className="cursor-pointer font-medium">{t(`건물별 가정 ${assumptions.length}개`, `${assumptions.length} building-specific assumptions`)}</summary>
        <ul className="mt-2 space-y-2 text-muted-foreground">{assumptions.map((assumption) => <li key={assumption.id}><span className="font-medium">{assumption.id}</span>: {assumption.assumes} {assumption.why}</li>)}</ul>
      </details>}
    </section>
    <section className="border-t border-border pt-3" data-testid="retrofit-capital-verification">
      <h4 className="font-medium">{t("투자 전 확인", "Verify before committing capital")}</h4>
      <ul className="mt-2 list-disc space-y-1.5 pl-4 text-muted-foreground">
        <li>{t("도면·현장 조사로 냉난방 면적과 외벽·창·지붕의 산정 범위를 대조하세요.", "Check conditioned area and wall, window and roof scope against drawings and a site survey.")}</li>
        <li>{t("U값, 기밀, 설비 효율과 조명·운전시간을 사양서·실측으로 확인하세요. 모델 파일이 있다는 이유만으로 이 입력들이 측정값이 되지는 않습니다.", "Verify U-values, airtightness, system efficiency, lighting and operating hours using specifications or measurements. A model file alone does not make these inputs measured.")}</li>
        <li>{t("전기·연료 고지서와 실제 요금, 시공 견적을 확인하세요. 공사 간 상호작용과 공사 범위는 현장에서 재검토해야 합니다.", "Check electricity and fuel bills, actual tariffs and installation quotes. Reassess interacting measures and construction scope on site.")}</li>
        <li>{t("태양광은 지붕 구조·음영·인허가와 시간별 부하를 확인하세요. 연간 전력 상계는 시간별 자가소비 검증을 대신하지 않습니다.", "For PV, verify roof structure, shading, permissions and hourly load. Annual electricity netting does not establish hourly self-consumption.")}</li>
      </ul>
    </section>
    <section className="rounded-md border border-dashed border-border p-3" data-testid="retrofit-corpus-position" data-status="unavailable">
      <h4 className="font-medium">{t("코퍼스 내 위치", "Corpus position")}</h4>
      <p className="mt-1 text-muted-foreground">{t("아직 제공되지 않습니다. 비교 가능한 용도·연식·지역·규모의 검증된 집단이 준비되기 전에는 순위나 백분위를 표시하지 않습니다.", "Not yet available. No rank or percentile is shown until a verified group with comparable use, era, region and size is available.")}</p>
    </section>
  </div>;
}
