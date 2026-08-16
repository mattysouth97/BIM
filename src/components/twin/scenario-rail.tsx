"use client";

// src/components/twin/scenario-rail.tsx
// Top masthead. Shows the active investment scenario at-a-glance: budget,
// NPV, discounted payback, effective CAPEX, horizon, and the live energy
// escalation assumptions. D₄: white-card Korean-label aesthetic (semantic
// tokens so the theme toggle keeps working) replacing the dark editorial
// rail.

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { formatKrw, formatYears } from "@/lib/twin-formatters";
import { effectiveDiscountRate } from "@/lib/retrofit/economic-model";
import type { BudgetSelection, EconomicAssumptions } from "@/lib/retrofit/economic-model";

interface ScenarioRailProps {
  capexBudgetKrw: number;
  selection: BudgetSelection | null;
  assumptions: EconomicAssumptions;
  totalCandidateMeasures: number;
}

function formatPercent(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`;
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
  const { t, lang } = useT(); // P2-06
  const effectiveRate = effectiveDiscountRate(assumptions);
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
          {t("투자 시나리오", "Investment scenario")}
        </span>
        <span className="text-[16px] font-semibold tracking-tight text-foreground leading-tight">
          {t("CAPEX → ROI 시뮬레이션", "CAPEX → ROI simulation")}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {t(
            `${selectedCount}/${totalCandidateMeasures}개 선택 · 예산 ${formatKrw(capexBudgetKrw, "ko")} 중 ${formatPercent(utilisation, 0)} 사용`,
            `${selectedCount}/${totalCandidateMeasures} selected · ${formatPercent(utilisation, 0)} of ${formatKrw(capexBudgetKrw, "en")} budget used`,
          )}
        </span>
      </div>

      <Cell
        label={t("NPV", "NPV")}
        sublabel={t(
          `IRR ${irrBand} · 유효할인율 ${formatPercent(effectiveRate, 1)}`,
          `IRR ${irrBand} · ${formatPercent(effectiveRate, 1)} eff. rate`,
        )}
      >
        <span
          className={cn(
            "text-[19px] font-semibold tabular-nums tracking-tight",
            npvPositive ? "text-emerald-600" : "text-orange-600",
          )}
        >
          {formatKrw(npv, lang)}
        </span>
      </Cell>

      <Cell label={t("회수기간", "Payback")} sublabel={t("할인 기준", "Discounted")}>
        <span className="text-[19px] font-semibold tabular-nums tracking-tight text-foreground">
          {formatYears(payback, lang)}
        </span>
      </Cell>

      <Cell label={t("실효 투자비", "Effective CAPEX")} sublabel={t("보조금 반영", "Post-subsidy")}>
        <span className="text-[19px] font-semibold tabular-nums tracking-tight text-foreground">
          {formatKrw(effectiveCapex, lang)}
        </span>
      </Cell>

      <Cell label={t("분석 기간", "Horizon")} sublabel={t("DCF 기준", "DCF basis")}>
        <span className="text-[19px] font-semibold tabular-nums tracking-tight text-foreground">
          {t(`${assumptions.analysisHorizonYears}년`, `${assumptions.analysisHorizonYears} yr`)}
        </span>
      </Cell>

      <div className="flex flex-col justify-center px-4 py-2.5 min-w-[132px]">
        <span className="text-[10px] font-medium text-muted-foreground">
          {t("에너지 가격 상승률", "Energy price escalation")}
        </span>
        <div className="text-[10px] tabular-nums text-foreground/80 leading-tight pt-0.5">
          <div>{t("전기", "Elec")} {formatPercent(assumptions.energyEscalation.electricity, 1)}</div>
          <div>{t("가스", "Gas")} {formatPercent(assumptions.energyEscalation.gas, 1)}</div>
          <div>{t("지역난방", "District")} {formatPercent(assumptions.energyEscalation.districtHeating, 1)}</div>
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
