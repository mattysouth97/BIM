"use client";

import type { OnSiteGeneration } from '@/lib/energy/end-uses';
import { useT } from '@/lib/i18n';

export function PvGenerationDisclosure({ generation, clippedGenerationKWh }: {
  generation: OnSiteGeneration; clippedGenerationKWh: number;
}) {
  const { t } = useT();
  const n = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const status = generation.status;
  let copy: string;
  if (status === 'region_unresolved') copy = t(
    '지역 미확인으로 PV 발전량 산정을 보류했습니다. 0은 무설비 판정이 아닙니다.',
    'PV generation is withheld because the region is unresolved. Zero does not mean no installed system.');
  else if (status === 'invalid_input') copy = t(
    'PV 용량 또는 일조 입력이 유효하지 않아 발전량 산정을 보류했습니다.',
    'PV generation is withheld because capacity or sun-hour inputs are invalid.');
  else if (status === 'no_generation_assumed' || status === 'capacity_unavailable') copy = t(
    `${status === 'capacity_unavailable' ? '설비는 표시되나 용량 미확인. ' : ''}PV 발전량 0 kWh/yr 가정. 실제 발전이 있으면 발전량을 과소평가하고 순에너지·등급을 더 나쁘게 평가합니다.`,
    `${status === 'capacity_unavailable' ? 'Installed system shown, capacity unknown. ' : ''}PV generation assumed at 0 kWh/yr. Existing generation would be understated, making net energy and the grade look worse.`);
  else copy = t(
    `PV ${n(generation.capacityKWp)} kWp → 추정 발전량 ${n(generation.kwh)} kWh/yr. 지역 일조·대표 남향 배치 가정이며 실측이 아닙니다.${status === 'partial_capacity' ? ' 기존 용량 미확인으로 신규 설비만 반영하여 총발전량을 과소평가합니다.' : ''}`,
    `PV ${n(generation.capacityKWp)} kWp → estimated generation ${n(generation.kwh)} kWh/yr. Assumes regional sun hours and representative south-facing panels; not metered.${status === 'partial_capacity' ? ' Only new capacity is included; unknown existing capacity understates total generation.' : ''}`);
  return <div className="min-w-0 break-words px-3 py-2 text-[10px] leading-relaxed text-muted-foreground" data-testid="pv-generation-disclosure">
    <p>{copy}</p>
    {generation.kwh > 0 && <p>{t(
      `연간 전력 수요 상한을 넘는 발전 ${n(clippedGenerationKWh)} kWh/yr는 별도 보고하며 등급에서 추가 차감하지 않습니다. 시간별 자가소비·판매 수익 계산이 아닙니다.`,
      `Generation above annual electric demand: ${n(clippedGenerationKWh)} kWh/yr, reported without further grade credit. This is not hourly self-consumption or export-revenue modeling.`)}</p>}
  </div>;
}
