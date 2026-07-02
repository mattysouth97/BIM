// src/lib/report/report-engine.ts
// Assembles ReportData from building metrics for the PDF renderer.

import type { EnergyMetrics } from '@/hooks/use-energy-metrics';
import type { CalibrationResult } from '@/lib/energy/calibration';
import type { BenchmarkResult } from '@/lib/energy/benchmark-comparison';
import type { CertificationResult } from '@/lib/compliance/certification-types';
import type { EfficiencyRatingResult } from '@/lib/compliance/efficiency-rating';
import type { RetrofitReport } from '@/lib/retrofit/retrofit-report';
import type { ReportData, ReportSection } from './report-types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const FIDELITY_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Level 1 — Public Data',
  2: 'Level 2 — Enhanced Model',
  3: 'Level 3 — Calibrated Model',
};

function fmt(value: number, decimals = 1): string {
  return value.toFixed(decimals);
}

function fmtKrw(value: number): string {
  if (value >= 1_000_000) return `${fmt(value / 1_000_000, 1)}백만원`;
  if (value >= 10_000) return `${fmt(value / 10_000, 1)}만원`;
  return `${Math.round(value).toLocaleString()}원`;
}

// ---------------------------------------------------------------------------
// Energy Audit Report
// ---------------------------------------------------------------------------

/**
 * Assemble an energy audit report from building metrics.
 *
 * @param building        Basic building identifiers
 * @param metrics         Computed energy metrics (heat loss, demand, grade, CO2)
 * @param calibration     Optional calibration result comparing predicted vs actual
 * @param benchmark       Optional benchmark comparison against peer buildings
 */
export function assembleEnergyAuditReport(
  building: { name: string; address: string; fidelityLevel: 1 | 2 | 3 },
  metrics: EnergyMetrics,
  calibration?: CalibrationResult,
  benchmark?: BenchmarkResult
): ReportData {
  const sections: ReportSection[] = [];

  // Section 1: Energy demand summary
  sections.push({
    title: 'Energy Demand Summary',
    titleKo: '에너지 수요 요약',
    content: {
      type: 'key-value',
      items: [
        { label: '에너지효율등급', value: metrics.grade },
        { label: '단위면적당 수요 (kWh/m²·년)', value: fmt(metrics.demand.demandPerSqm) },
        { label: '연간 총 수요 (kWh/년)', value: Math.round(metrics.demand.totalDemand).toLocaleString() },
        { label: 'CO₂ 배출량 (tCO₂/년)', value: fmt(metrics.co2.totalCO2) },
        { label: 'CO₂ 단위면적 (kgCO₂/m²·년)', value: fmt(metrics.co2.co2PerSqm) },
        {
          label: '실측 대비 예측 편차',
          value: metrics.predictedVsActualDelta !== null
            ? `${fmt(metrics.predictedVsActualDelta)}%`
            : '실측 데이터 없음',
        },
      ],
    },
  });

  // Section 2: Heat loss breakdown by element
  sections.push({
    title: 'Heat Loss Breakdown',
    titleKo: '열손실 분석',
    content: {
      type: 'table',
      headers: ['구분', '열손실 (W)', '단위면적 (W/m²)'],
      rows: [
        ...metrics.heatLoss.elements.map((el) => [
          el.element,
          fmt(el.heatLoss),
          fmt(el.heatLossPerSqm),
        ]),
        ['합계', fmt(metrics.heatLoss.totalHeatLoss), fmt(metrics.heatLoss.totalHeatLossPerSqm)],
      ],
    },
  });

  // Section 3: Annual demand
  sections.push({
    title: 'Annual Demand',
    titleKo: '연간 에너지 수요',
    content: {
      type: 'key-value',
      items: [
        { label: '난방 수요 (kWh/년)', value: Math.round(metrics.demand.heatingDemand).toLocaleString() },
        { label: '냉방 수요 (kWh/년)', value: Math.round(metrics.demand.coolingDemand).toLocaleString() },
        { label: '총 수요 (kWh/년)', value: Math.round(metrics.demand.totalDemand).toLocaleString() },
        { label: '단위면적당 (kWh/m²·년)', value: fmt(metrics.demand.demandPerSqm) },
      ],
    },
  });

  // Section 4: Calibration (optional)
  if (calibration) {
    sections.push({
      title: 'Model Calibration',
      titleKo: '모델 보정 결과',
      content: {
        type: 'key-value',
        items: [
          { label: '전체 편차', value: `${fmt(calibration.overallDelta)}%` },
          { label: '보정 비율 (실측/예측)', value: fmt(calibration.calibrationRatio, 2) },
          { label: '최대 편차 항목', value: calibration.largestDiscrepancy },
          { label: '인사이트', value: calibration.insight },
        ],
      },
    });
  }

  // Section 5: Benchmark (optional)
  if (benchmark) {
    sections.push({
      title: 'Peer Benchmark',
      titleKo: '동종 건물 비교',
      content: {
        type: 'key-value',
        items: [
          { label: '본 건물 수요 (kWh/m²·년)', value: fmt(benchmark.buildingDemand) },
          { label: '하위 25% (P25)', value: fmt(benchmark.p25) },
          { label: '중앙값 (P50)', value: fmt(benchmark.p50) },
          { label: '상위 75% (P75)', value: fmt(benchmark.p75) },
          { label: '성능 평가', value: benchmark.performance },
          { label: '인사이트', value: benchmark.insight },
        ],
      },
    });
  }

  return {
    type: 'energy-audit',
    buildingName: building.name,
    buildingAddress: building.address,
    generatedAt: new Date().toISOString(),
    fidelityLevel: building.fidelityLevel,
    sections,
    disclaimer: `본 보고서는 ${FIDELITY_LABELS[building.fidelityLevel]} 기반의 자동 생성 보고서입니다. 공식 에너지 감사는 별도의 전문 평가사가 수행해야 합니다.`,
  };
}

// ---------------------------------------------------------------------------
// Compliance Report
// ---------------------------------------------------------------------------

/**
 * Assemble a compliance report from G-SEED certification and efficiency rating.
 *
 * @param building          Basic building identifiers
 * @param certification     G-SEED certification pre-assessment result
 * @param efficiencyRating  Korean energy efficiency rating result
 */
export function assembleComplianceReport(
  building: { name: string; address: string; fidelityLevel: 1 | 2 | 3 },
  certification: CertificationResult,
  efficiencyRating: EfficiencyRatingResult
): ReportData {
  const sections: ReportSection[] = [];

  // Section 1: Compliance summary
  sections.push({
    title: 'Compliance Summary',
    titleKo: '인증 종합',
    content: {
      type: 'key-value',
      items: [
        { label: 'G-SEED 인증 등급 (예비평가)', value: certification.grade },
        { label: 'G-SEED 획득 점수', value: `${certification.earnedPoints} / ${certification.totalMaxPoints}점` },
        { label: 'G-SEED 평가 가능 비율', value: `${certification.assessablePercentage}%` },
        { label: '에너지효율등급', value: efficiencyRating.grade },
        { label: '에너지효율등급 (한글)', value: efficiencyRating.gradeLabel },
        { label: '1차 에너지 소요량 (kWh/m²·년)', value: fmt(efficiencyRating.primaryEnergyPerArea) },
      ],
    },
  });

  // Section 2: G-SEED category breakdown
  sections.push({
    title: 'G-SEED Category Breakdown',
    titleKo: 'G-SEED 항목별 평가',
    content: {
      type: 'table',
      headers: ['항목', '최대 점수', '획득 점수', '평가 가능'],
      rows: certification.categories.map((cat) => [
        cat.nameKo,
        String(cat.maxPoints),
        String(cat.earnedPoints),
        cat.assessable ? '가능' : '불가',
      ]),
    },
  });

  // Section 3: Primary energy breakdown (primary energy by fuel, kWh/year)
  const pe = efficiencyRating.breakdown.primaryEnergy;
  const area = efficiencyRating.primaryEnergyPerArea;
  sections.push({
    title: 'Primary Energy Breakdown',
    titleKo: '1차 에너지 분석',
    content: {
      type: 'table',
      headers: ['에너지원', '1차 에너지 (kWh/년)'],
      rows: [
        ['전기', Math.round(pe.electric).toLocaleString()],
        ['가스', Math.round(pe.gas).toLocaleString()],
        ['지역난방', Math.round(pe.districtHeating).toLocaleString()],
        ['지역냉방', Math.round(pe.districtCooling).toLocaleString()],
        ['재생에너지 (차감)', Math.round(pe.renewable).toLocaleString()],
        ['합계 (kWh/m²·년)', fmt(area)],
      ],
    },
  });

  return {
    type: 'compliance',
    buildingName: building.name,
    buildingAddress: building.address,
    generatedAt: new Date().toISOString(),
    fidelityLevel: building.fidelityLevel,
    sections,
    disclaimer: certification.disclaimer,
  };
}

// ---------------------------------------------------------------------------
// Retrofit Report
// ---------------------------------------------------------------------------

/**
 * Assemble a retrofit investment report from prioritized measures.
 *
 * @param building        Basic building identifiers
 * @param retrofitReport  Assembled retrofit report with measures and summary
 */
export function assembleRetrofitReport(
  building: { name: string; address: string; fidelityLevel: 1 | 2 | 3 },
  retrofitReport: RetrofitReport
): ReportData {
  const { summary, measures, byCategory } = retrofitReport;
  const sections: ReportSection[] = [];

  // Section 1: Portfolio summary
  sections.push({
    title: 'Retrofit Portfolio Summary',
    titleKo: '개선 포트폴리오 요약',
    content: {
      type: 'key-value',
      items: [
        { label: '총 투자비', value: fmtKrw(summary.totalInvestment) },
        { label: '연간 에너지 절감량 (kWh/년)', value: Math.round(summary.totalAnnualSaving).toLocaleString() },
        { label: '연간 비용 절감액', value: fmtKrw(summary.totalAnnualCostSaving) },
        { label: '연간 CO₂ 감축량 (tCO₂/년)', value: fmt(summary.totalCO2Reduction) },
        { label: '포트폴리오 회수 기간', value: `${fmt(summary.portfolioPayback)}년` },
      ],
    },
  });

  // Section 2: All measures ordered by payback
  sections.push({
    title: 'Prioritized Measures',
    titleKo: '우선순위별 개선 항목',
    content: {
      type: 'table',
      headers: ['항목명', '분류', '투자비', '연간 절감', '회수기간'],
      rows: measures.map((m) => [
        m.name,
        m.category,
        fmtKrw(m.estimatedCost),
        fmtKrw(m.annualCostSaving),
        `${fmt(m.paybackYears)}년`,
      ]),
    },
  });

  // Section 3: Per-category breakdowns (skip empty categories)
  const categoryEntries: Array<[string, typeof measures]> = [
    ['외피 (Envelope)', byCategory.envelope],
    ['설비 (HVAC)', byCategory.hvac],
    ['조명 (Lighting)', byCategory.lighting],
    ['재생에너지 (Renewable)', byCategory.renewable],
  ];

  for (const [labelKo, categoryMeasures] of categoryEntries) {
    if (categoryMeasures.length === 0) continue;
    sections.push({
      title: `${labelKo} Measures`,
      titleKo: `${labelKo} 개선 항목`,
      content: {
        type: 'table',
        headers: ['항목명', '연간 에너지 절감 (kWh)', 'CO₂ 감축 (tCO₂)', '회수기간'],
        rows: categoryMeasures.map((m) => [
          m.name,
          Math.round(m.annualEnergySaving).toLocaleString(),
          fmt(m.co2Reduction),
          `${fmt(m.paybackYears)}년`,
        ]),
      },
    });
  }

  return {
    type: 'retrofit',
    buildingName: building.name,
    buildingAddress: building.address,
    generatedAt: new Date().toISOString(),
    fidelityLevel: building.fidelityLevel,
    sections,
    disclaimer: `본 보고서는 ${FIDELITY_LABELS[building.fidelityLevel]} 기반의 자동 생성 개선 제안입니다. 실제 시공 전 전문 엔지니어의 검토가 필요합니다.`,
  };
}
