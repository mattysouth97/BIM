"use client";

// src/components/twin/scenario-rail.tsx
// Top masthead — replaces the v7 "release rail." Shows the active investment
// scenario at-a-glance: budget, NPV, IRR, discounted payback, the count of
// selected measures, and the live discount-rate / horizon assumptions.
// Editorial layout preserved from the v7 release rail.

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
  return `${years.toFixed(1)}yr`;
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

  return (
    <div
      className={cn(
        "pointer-events-auto absolute left-4 right-4 top-2 z-20",
        "flex items-stretch",
        "rounded-sm border border-[#24282d]/80",
        "bg-[#0b0d10]/88 backdrop-blur-md",
        "shadow-[0_12px_48px_-24px_rgba(0,0,0,0.9)]",
        "overflow-hidden select-none",
        "animate-[twin-slide-in_560ms_cubic-bezier(0.2,0.7,0.2,1)_both]",
      )}
      data-twin-rail
    >
      <div className="flex flex-col justify-center px-5 py-2.5 border-r border-[#24282d]/80 min-w-[260px]">
        <span className="text-[9px] tracking-[0.22em] uppercase text-[#8de6f3] font-mono">
          investment scenario
        </span>
        <span
          className="text-[18px] font-semibold tracking-tight text-zinc-50 leading-tight"
          style={{ fontFamily: "var(--font-display-release)" }}
        >
          CAPEX → ROI · live
        </span>
        <span className="text-[10px] font-mono text-zinc-500 tracking-wide">
          {selectedCount} of {totalCandidateMeasures} measures · {formatPercent(utilisation, 0)} of ₩{(capexBudgetKrw / KRW_EOK).toFixed(1)}억 used
        </span>
      </div>

      <Cell label="NPV" sublabel={`@ ${formatPercent(assumptions.discountRate, 0)} discount`}>
        <span
          className={cn(
            "text-[20px] font-semibold tabular-nums tracking-tight",
            npvPositive ? "text-[#8de6f3]" : "text-[#f4a765]",
          )}
          style={{ fontFamily: "var(--font-display-release)" }}
        >
          {formatKrwBig(npv)}
        </span>
      </Cell>

      <Cell label="payback" sublabel="discounted">
        <span
          className="text-[20px] font-semibold tabular-nums tracking-tight text-zinc-50"
          style={{ fontFamily: "var(--font-display-release)" }}
        >
          {formatYears(payback)}
        </span>
      </Cell>

      <Cell label="effective CAPEX" sublabel="post-subsidy">
        <span
          className="text-[20px] font-semibold tabular-nums tracking-tight text-zinc-50"
          style={{ fontFamily: "var(--font-display-release)" }}
        >
          {formatKrwBig(effectiveCapex)}
        </span>
      </Cell>

      <Cell label="horizon" sublabel="DCF window">
        <span
          className="text-[20px] font-semibold tabular-nums tracking-tight text-zinc-50"
          style={{ fontFamily: "var(--font-display-release)" }}
        >
          {assumptions.analysisHorizonYears}yr
        </span>
      </Cell>

      <div className="flex flex-col justify-center px-4 py-2.5 min-w-[140px]">
        <span className="text-[9px] tracking-[0.18em] uppercase text-zinc-500 font-mono">
          energy escalation
        </span>
        <div className="text-[10px] font-mono tabular-nums text-zinc-300 leading-tight pt-0.5">
          <div>elec {formatPercent(assumptions.energyEscalation.electricity, 1)}</div>
          <div>gas {formatPercent(assumptions.energyEscalation.gas, 1)}</div>
          <div>district {formatPercent(assumptions.energyEscalation.districtHeating, 1)}</div>
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
    <div className="flex flex-col justify-center px-5 py-2.5 border-r border-[#24282d]/80 min-w-[150px]">
      <span className="text-[9px] tracking-[0.22em] uppercase text-zinc-500 font-mono leading-none mb-1">
        {label}
      </span>
      {children}
      {sublabel && (
        <span className="text-[9px] font-mono text-zinc-500 tracking-wide mt-0.5">
          {sublabel}
        </span>
      )}
    </div>
  );
}
