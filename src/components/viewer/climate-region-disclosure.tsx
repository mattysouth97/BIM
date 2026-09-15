"use client";

import type { ClimateRegion } from '@/lib/energy/climate-region';
import { useT } from '@/lib/i18n';

/** Shared visible basis for the resolved climate used by retrofit and PV. */
export function ClimateRegionDisclosure({ region }: { region: ClimateRegion | null | undefined }) {
  const { t } = useT();
  if (!region) return (
    <p className="p-1 text-[10px] leading-relaxed text-muted-foreground" data-testid="climate-region-unresolved">
      {t('지역을 확인할 수 없어 태양광 산정을 제외했습니다. 다른 개선안은 서울 기후 대체값을 사용합니다. 주소·시군구코드를 확인하세요.', 'Region unresolved: PV is withheld. Other measures use the legacy Seoul climate assumption. Check the address or district code.')}
    </p>
  );
  return (
    <div className="space-y-1 p-1 text-[10px] leading-relaxed text-muted-foreground" data-testid="climate-region-basis">
      <p>{t(region.ko, region.token)} · {t(region.via === 'address' ? '주소로 지역 확인' : '시군구코드로 지역 확인', region.via === 'address' ? 'resolved from address' : 'resolved from district code')}</p>
      <p>{t('냉방 설계온도', 'Summer design temperature')}: {region.summerDesignTemp} °C — {region.summerDesignTempSource === 'regional'
        ? t('2017 공식 가이드의 도시 설계값, 실측 기상이 아님', 'city design value from the official 2017 guide, not measured weather')
        : t('지역 근거 부족으로 기존 서울값을 대체 적용한 가정', 'assumed legacy Seoul fallback; regional basis unavailable')}.</p>
      <p>{t('냉방기 일사량', 'Cooling-season solar')}: {region.coolingSeasonSolar.toFixed(1)} kWh/m² · {t('지역 일조시간 비율로 유도한 가정, 유리면 실측값이 아님', 'derived from the regional sun-hours ratio, not measured glazing irradiation')}.</p>
    </div>
  );
}
