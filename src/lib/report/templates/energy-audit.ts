// src/lib/report/templates/energy-audit.ts
// Builds the 8-section energy audit report structure from typed input data.

import type { ReportSection } from '@/lib/report/report-types';

export interface EnergyAuditInput {
  building: {
    name: string;
    address: string;
    useType: string;
    era: string;
    area: number;
    floors: number;
  };
  fidelityLevel: 1 | 2 | 3;
  dataSources: string[];
  envelope: {
    wallU: number;
    roofU: number;
    windowU: number;
    airtightness: number;
  };
  energy: {
    heatingDemand: number;
    coolingDemand: number;
    totalDemand: number;
    energyGrade: string;
    demandPerArea: number;
  };
  co2: {
    total: number;
    perArea: number;
  };
  heatLossBreakdown: {
    walls: number;
    roof: number;
    windows: number;
    floor: number;
    ventilation: number;
  };
  calibration?: {
    overallDelta: number;
    insight: string;
  };
  benchmark?: {
    percentile: number;
    performance: string;
    insight: string;
  };
  retrofitSummary?: {
    totalInvestment: number;
    totalAnnualSaving: number;
    /** Simple payback, years. `null` when annual cost saving ≤ 0 — rendered as N/A. */
    payback: number | null;
    topMeasures: { description: string; payback: number }[];
    /** Portfolio NPV (KRW), when the scenario carries DCF financials. */
    npv?: number | null;
    /** Portfolio IRR (fraction). `null` = no positive root — rendered as N/A. */
    irr?: number | null;
    /** Discounted payback, years. `null` = never recovered — rendered as N/A. */
    discountedPayback?: number | null;
    /** Subsidy-adjusted CAPEX (KRW). */
    effectiveCapex?: number;
  };
}

// Korean building code U-value standards for 2020+ (W/m²·K)
const STANDARD_2020 = {
  wallU: 0.15,
  roofU: 0.10,
  windowU: 1.0,
};

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function fmtArea(n: number): string {
  return `${n.toLocaleString('ko-KR')} m²`;
}

function deltaLabel(actual: number, standard: number): string {
  const diff = actual - standard;
  if (diff <= 0) return `${fmt(actual)} (compliant, standard: ${fmt(standard)})`;
  return `${fmt(actual)} (exceeds standard ${fmt(standard)} by +${fmt(diff)})`;
}

function heatLossPct(breakdown: EnergyAuditInput['heatLossBreakdown']): { label: string; value: string }[] {
  const total = breakdown.walls + breakdown.roof + breakdown.windows + breakdown.floor + breakdown.ventilation;
  const pct = (n: number) => total > 0 ? `${fmt((n / total) * 100)}%` : '0%';
  return [
    { label: 'Walls', value: pct(breakdown.walls) },
    { label: 'Roof', value: pct(breakdown.roof) },
    { label: 'Windows', value: pct(breakdown.windows) },
    { label: 'Floor', value: pct(breakdown.floor) },
    { label: 'Ventilation', value: pct(breakdown.ventilation) },
  ];
}

/**
 * Builds the 8 report sections for an energy audit.
 * Pure function — no side effects, no React.
 */
export function buildEnergyAuditSections(input: EnergyAuditInput): ReportSection[] {
  const sections: ReportSection[] = [];

  // Section 1: Building Overview
  sections.push({
    title: 'Building Overview',
    titleKo: '건물 개요',
    content: {
      type: 'key-value',
      items: [
        { label: 'Address', value: input.building.address },
        { label: 'Use Type', value: input.building.useType },
        { label: 'Era', value: input.building.era },
        { label: 'Gross Floor Area', value: fmtArea(input.building.area) },
        { label: 'Floors', value: `${input.building.floors}F` },
      ],
    },
  });

  // Section 2: Twin Fidelity Summary
  const fidelityLabels: Record<1 | 2 | 3, string> = {
    1: 'Level 1 — Public data only (Korean Building Ledger)',
    2: 'Level 2 — Energy bills + floor plans uploaded',
    3: 'Level 3 — IFC/BIM + sensor data integrated',
  };
  sections.push({
    title: 'Twin Fidelity Summary',
    titleKo: '디지털 트윈 충실도',
    content: {
      type: 'key-value',
      items: [
        { label: 'Fidelity Level', value: fidelityLabels[input.fidelityLevel] },
        {
          label: 'Data Sources Used',
          value: input.dataSources.length > 0 ? input.dataSources.join(', ') : 'None specified',
        },
      ],
    },
  });

  // Section 3: Envelope Analysis
  sections.push({
    title: 'Envelope Analysis',
    titleKo: '외피 분석',
    content: {
      type: 'key-value',
      items: [
        {
          label: 'Wall U-value (W/m²·K)',
          value: deltaLabel(input.envelope.wallU, STANDARD_2020.wallU),
        },
        {
          label: 'Roof U-value (W/m²·K)',
          value: deltaLabel(input.envelope.roofU, STANDARD_2020.roofU),
        },
        {
          label: 'Window U-value (W/m²·K)',
          value: deltaLabel(input.envelope.windowU, STANDARD_2020.windowU),
        },
        {
          label: 'Airtightness (ACH)',
          value: fmt(input.envelope.airtightness, 2),
        },
      ],
    },
  });

  // Section 4: Energy Performance
  const actualNote = input.calibration
    ? ` | Actual vs. predicted delta: ${fmt(input.calibration.overallDelta, 1)} kWh/m²`
    : '';
  sections.push({
    title: 'Energy Performance',
    titleKo: '에너지 성능',
    content: {
      type: 'key-value',
      items: [
        { label: 'Heating Demand', value: `${fmt(input.energy.heatingDemand)} kWh/m²/yr` },
        { label: 'Cooling Demand', value: `${fmt(input.energy.coolingDemand)} kWh/m²/yr` },
        { label: 'Total Demand', value: `${fmt(input.energy.totalDemand)} kWh/m²/yr` },
        { label: 'Energy Grade', value: input.energy.energyGrade },
        { label: 'Demand per m²', value: `${fmt(input.energy.demandPerArea)} kWh/m²/yr${actualNote}` },
      ],
    },
  });

  // Section 5: Heat Loss Breakdown
  sections.push({
    title: 'Heat Loss Breakdown',
    titleKo: '열손실 분포',
    content: {
      type: 'key-value',
      items: heatLossPct(input.heatLossBreakdown),
    },
  });

  // Section 6: CO2 Emissions
  sections.push({
    title: 'CO₂ Emissions',
    titleKo: '이산화탄소 배출량',
    content: {
      type: 'key-value',
      items: [
        { label: 'Total Annual CO₂', value: `${fmt(input.co2.total, 1)} tCO₂/yr` },
        { label: 'CO₂ per m²', value: `${fmt(input.co2.perArea, 2)} kgCO₂/m²/yr` },
      ],
    },
  });

  // Section 7: Benchmark Comparison (conditional)
  if (input.benchmark) {
    sections.push({
      title: 'Benchmark Comparison',
      titleKo: '벤치마크 비교',
      content: {
        type: 'key-value',
        items: [
          { label: 'Peer Percentile', value: `${Math.round(input.benchmark.percentile)}th percentile` },
          { label: 'Performance', value: input.benchmark.performance },
          { label: 'Insight', value: input.benchmark.insight },
        ],
      },
    });
  } else {
    sections.push({
      title: 'Benchmark Comparison',
      titleKo: '벤치마크 비교',
      content: {
        type: 'text',
        text: 'Benchmark data not available for this building type and era combination.',
      },
    });
  }

  // Section 8: Retrofit Recommendations (conditional)
  if (input.retrofitSummary) {
    const {
      totalInvestment,
      totalAnnualSaving,
      payback,
      topMeasures,
      npv,
      irr,
      discountedPayback,
      effectiveCapex,
    } = input.retrofitSummary;
    // Honesty: null/non-finite payback ⇒ 'N/A' — never a 0-year claim.
    const fmtPayback = (p: number | null): string =>
      p !== null && Number.isFinite(p) ? `${fmt(p, 1)} yr` : 'N/A';
    const measureRows: string[][] = topMeasures.slice(0, 3).map((m, i) => [
      `${i + 1}`,
      m.description,
      fmtPayback(m.payback),
    ]);
    sections.push({
      title: 'Retrofit Recommendations',
      titleKo: '개보수 권장 사항',
      content: {
        type: 'table',
        headers: ['#', 'Measure', 'Payback'],
        rows: [
          ...measureRows,
          ['', 'Total Portfolio Investment', `${(totalInvestment / 1_000_000).toFixed(1)}M KRW`],
          ...(effectiveCapex !== undefined
            ? [['', 'Effective CAPEX (subsidy-adjusted)', `${(effectiveCapex / 1_000_000).toFixed(1)}M KRW`]]
            : []),
          ['', 'Annual Energy Saving', `${fmt(totalAnnualSaving)} kWh/yr`],
          ...(npv !== undefined && npv !== null
            ? [['', 'Portfolio NPV', `${(npv / 1_000_000).toFixed(1)}M KRW`]]
            : []),
          ...(irr !== undefined
            ? [['', 'Portfolio IRR', irr !== null ? `${fmt(irr * 100, 1)}%` : 'N/A']]
            : []),
          ...(discountedPayback !== undefined
            ? [['', 'Discounted Payback', fmtPayback(discountedPayback)]]
            : []),
          ['', 'Portfolio Payback', fmtPayback(payback)],
        ],
      },
    });
  } else {
    sections.push({
      title: 'Retrofit Recommendations',
      titleKo: '개보수 권장 사항',
      content: {
        type: 'text',
        text: 'No retrofit analysis available. Upgrade to Fidelity Level 2 or higher to unlock retrofit recommendations.',
      },
    });
  }

  return sections;
}
