"use client";

// src/components/twin/scenario-rail.tsx
// Top masthead. Shows the active investment scenario at-a-glance: budget,
// NPV, discounted payback, effective CAPEX, horizon, and the live energy
// escalation assumptions. D₄: white-card Korean-label aesthetic (semantic
// tokens so the theme toggle keeps working) replacing the dark editorial
// rail.

import { cn } from "@/lib/utils";
import type { BudgetSelection, EconomicAssumptions } from "@/lib/retrofit/economic-model";

interface ScenarioRailProps {
  capexBudgetKrw: number;
  selection: BudgetSelection | null;
  assumptions: EconomicAssumptions;
  totalCandidateMeasures: number;
}

const KRW_EOK = 100_000_000;

function formatKrwBig(krw: number): string {
  const sign = krw < 0 ? "-" : "";
  const abs = Math.abs(krw);
  if (abs >= KRW_EOK) {
    const eok = abs / KRW_EOK;
    return `${sign}₩${eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(1)}억`;
  }
  if (abs >= 10_000) return `${sign}₩${(abs / 10_000).toFixed(0)}만`;
  return `${sign}₩${abs.toLocaleString()}`;
}

function formatPercent(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

function formatYears(years: number): string {
  if (!Number.isFinite(years)) return "—";
  return `${years.toFixed(1)}년`;
}

function irrLetter(irr: number | null | undefined): string {
  if (irr === null || irr === undefined || !Number.isFinite(irr)) return "—";
  if (irr >= 0.15) return "A";
  if (irr >= 0.08) return "B";
  if (irr >= 0.05) return "C";
  return "D";
}

export function ScenarioRail({
  capexBudgetKrw,
  selection,
  assumptions,
  totalCandidateMeasures,
}: ScenarioRailProps) {
  const npv = selection?.npv ?? 0;
  const npvPositive = npv >= 0;
  const payback = selection?.discountedPayback ?? Infinity;
  const effectiveCapex = selection?.effectiveCapex ?? 0;
  const selectedCount = selection?.selected.length ?? 0;
  const utilisation = capexBudgetKrw > 0 ? effectiveCapex / capexBudgetKrw : 0;
  const irr = selection?.selected.length
    ? selection.selected.reduce((best, m) => {
        const v = m.financials?.irr;
        if (v == null || !Number.isFinite(v)) return best;
        return Math.max(best, v);
      }, Number.NEGATIVE_INFINITY)
    : null;
  const irrBand = irrLetter(Number.isFinite(irr) ? irr : null);

  return (
    <div
      className="flex items-stretch overflow-x-auto select-none"
      data-twin-rail
    >
      <div className="flex flex-col justify-center px-3 sm:px-5 py-2.5 border-r border-border min-w-[140px] sm:min-w-[240px] shrink-0">
        <span className="text-[10px] font-medium text-muted-foreground">
          투자 시나리오
        </span>
        <span className="text-[16px] font-semibold tracking-tight text-foreground leading-tight">
          CAPEX → ROI 시뮬레이션
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {selectedCount}/{totalCandidateMeasures}개 선택 · 예산 ₩
          {(capexBudgetKrw / KRW_EOK).toFixed(1)}억 중 {formatPercent(utilisation, 0)} 사용
        </span>
      </div>

      <Cell label="NPV" sublabel={`IRR ${irrBand} · 할인율 ${formatPercent(assumptions.discountRate, 0)}`}>
        <span
          className={cn(
            "text-[19px] font-semibold tabular-nums tracking-tight",
            npvPositive ? "text-emerald-600" : "text-orange-600",
          )}
        >
          {formatKrwBig(npv)}
        </span>
      </Cell>

      <Cell label="회수기간" sublabel="할인 기준">
        <span className="text-[19px] font-semibold tabular-nums tracking-tight text-foreground">
          {formatYears(payback)}
        </span>
      </Cell>

      <Cell label="실효 투자비" sublabel="보조금 반영">
        <span className="text-[19px] font-semibold tabular-nums tracking-tight text-foreground">
          {formatKrwBig(effectiveCapex)}
        </span>
      </Cell>

      <Cell label="분석 기간" sublabel="DCF 기준">
        <span className="text-[19px] font-semibold tabular-nums tracking-tight text-foreground">
          {assumptions.analysisHorizonYears}년
        </span>
      </Cell>

      <div className="flex flex-col justify-center px-4 py-2.5 min-w-[132px]">
        <span className="text-[10px] font-medium text-muted-foreground">
          에너지 가격 상승률
        </span>
        <div className="text-[10px] tabular-nums text-foreground/80 leading-tight pt-0.5">
          <div>전기 {formatPercent(assumptions.energyEscalation.electricity, 1)}</div>
          <div>가스 {formatPercent(assumptions.energyEscalation.gas, 1)}</div>
          <div>지역난방 {formatPercent(assumptions.energyEscalation.districtHeating, 1)}</div>
        </div>
      </div>
    </div>
  );
}

interface CellProps {
  label: string;
  sublabel?: string;
  children: React.ReactNode;
}

function Cell({ label, sublabel, children }: CellProps) {
  return (
    <div className="flex flex-col justify-center px-5 py-2.5 border-r border-border min-w-[130px]">
      <span className="text-[10px] font-medium text-muted-foreground leading-none mb-1">
        {label}
      </span>
      {children}
      {sublabel && (
        <span className="text-[9px] text-muted-foreground/70 mt-0.5">
          {sublabel}
        </span>
      )}
    </div>
  );
}
