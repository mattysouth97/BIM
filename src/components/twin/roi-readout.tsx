"use client";

// src/components/twin/roi-readout.tsx
// Left-side signature readout. Shows the discounted-cash-flow caliper for the
// currently-selected scenario. Headline = NPV, grade chip = IRR band (A–D),
// caliper = year-by-year cumulative discounted cash flow, payback year
// highlighted as a vertical pin. D₄: white-card Korean-label aesthetic.

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { BudgetSelection, EconomicAssumptions } from "@/lib/retrofit/economic-model";

interface RoiReadoutProps {
  selection: BudgetSelection | null;
  assumptions: EconomicAssumptions;
  isLoading?: boolean;
}

const KRW_EOK = 100_000_000;

function formatKrwBig(krw: number): string {
  const sign = krw < 0 ? "-" : "";
  const abs = Math.abs(krw);
  if (abs >= KRW_EOK) {
    const eok = abs / KRW_EOK;
    return `${sign}${eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(1)}억`;
  }
  if (abs >= 10_000_000) return `${sign}${(abs / 10_000_000).toFixed(0)}천만`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(0)}만`;
  return `${sign}${abs.toLocaleString()}`;
}

function gradeFromIrr(
  irr: number | null | undefined,
): { letter: string; tone: "good" | "ok" | "bad"; label: string } {
  if (irr === null || irr === undefined || !Number.isFinite(irr)) {
    return { letter: "—", tone: "bad", label: "IRR 산출 불가" };
  }
  if (irr >= 0.15) return { letter: "A", tone: "good", label: "우수" };
  if (irr >= 0.08) return { letter: "B", tone: "ok", label: "양호" };
  if (irr >= 0.05) return { letter: "C", tone: "ok", label: "기준치 수준" };
  return { letter: "D", tone: "bad", label: "기준 미달" };
}

export function RoiReadout({ selection, assumptions, isLoading }: RoiReadoutProps) {
  const npv = selection?.npv ?? 0;
  const cashFlow = selection?.aggregateCashFlow ?? [];
  const effectiveCapex = selection?.effectiveCapex ?? 0;
  const horizon = assumptions.analysisHorizonYears;
  const discountRate = assumptions.discountRate;

  // Aggregate IRR across the selected portfolio (bisection on combined cash flow).
  const portfolioIrr = useMemo(() => {
    if (!selection || effectiveCapex <= 0) return null;
    const totalSaving = cashFlow.reduce((s, v) => s + v, 0);
    if (totalSaving <= effectiveCapex) return null;
    let lo = -0.5;
    let hi = 5.0;
    const npvAt = (rate: number) => {
      let pv = -effectiveCapex;
      for (let t = 1; t <= cashFlow.length; t++) {
        pv += cashFlow[t - 1] / Math.pow(1 + rate, t);
      }
      return pv;
    };
    let fLo = npvAt(lo);
    let fHi = npvAt(hi);
    if (fLo * fHi > 0) return null;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      const fMid = npvAt(mid);
      if (Math.abs(fMid) < 1 || (hi - lo) / 2 < 1e-6) return mid;
      if (fLo * fMid < 0) {
        hi = mid;
        fHi = fMid;
      } else {
        lo = mid;
        fLo = fMid;
      }
    }
    return (lo + hi) / 2;
  }, [selection, cashFlow, effectiveCapex]);

  const grade = gradeFromIrr(portfolioIrr);
  const payback = selection?.discountedPayback ?? Infinity;

  // Cumulative discounted cash flow over horizon (for caliper).
  const cumulativeDiscounted = useMemo(() => {
    const out: number[] = new Array(horizon).fill(0);
    if (!selection) return out;
    let acc = -effectiveCapex;
    for (let t = 1; t <= horizon; t++) {
      acc += (cashFlow[t - 1] ?? 0) / Math.pow(1 + discountRate, t);
      out[t - 1] = acc;
    }
    return out;
  }, [selection, cashFlow, effectiveCapex, horizon, discountRate]);

  const minVal = Math.min(0, ...cumulativeDiscounted);
  const maxVal = Math.max(0, ...cumulativeDiscounted);
  const range = Math.max(1, maxVal - minVal);
  // Vertical position of the zero line within [minVal, maxVal].
  const zeroPct = ((maxVal - 0) / range) * 100;

  return (
    <div
      className={cn(
        "pointer-events-auto absolute left-4 top-20 z-20 w-[340px]",
        "rounded-lg border border-border",
        "bg-card/95 backdrop-blur-md",
        "shadow-lg",
        "select-none overflow-hidden",
        "animate-[twin-slide-in_480ms_cubic-bezier(0.2,0.7,0.2,1)_both]",
      )}
      data-twin-prediction
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5 border-b border-border">
        <span className="text-[10px] font-medium text-muted-foreground">
          NPV · 할인율 {(discountRate * 100).toFixed(0)}% · {horizon}년
        </span>
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-medium text-emerald-600">실시간</span>
        </div>
      </div>

      <div className="px-4 pt-3 pb-2">
        <div className="flex items-end gap-3 leading-none">
          <span
            className={cn(
              "text-[44px] font-semibold tabular-nums tracking-tight",
              npv >= 0 ? "text-foreground" : "text-orange-600",
            )}
          >
            {isLoading ? "…" : `₩${formatKrwBig(npv)}`}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span
            className={cn(
              "inline-flex h-5 min-w-[22px] items-center justify-center rounded-md px-1.5",
              "text-[11px] font-bold tracking-tight border",
              grade.tone === "good" &&
                "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
              grade.tone === "ok" &&
                "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
              grade.tone === "bad" &&
                "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
            )}
          >
            {grade.letter}
          </span>
          <span className="text-[11px] text-foreground/80 tabular-nums">
            IRR{" "}
            {portfolioIrr !== null && Number.isFinite(portfolioIrr)
              ? `${(portfolioIrr * 100).toFixed(1)}%`
              : "—"}
            {" · "}
            {grade.label}
          </span>
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground tabular-nums">
          할인 회수기간 ·{" "}
          {Number.isFinite(payback) ? `${payback.toFixed(1)}년` : "미회수"}
        </div>
      </div>

      {/* Cumulative discounted cash-flow caliper */}
      <div className="px-4 py-3 border-t border-border bg-muted/40">
        <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground mb-2">
          <span>누적 할인 현금흐름</span>
          <span>1년차 → {horizon}년차</span>
        </div>

        <div className="relative h-12" aria-hidden="true">
          {/* Zero line — positioned by where 0 falls within [minVal, maxVal]. */}
          <div
            className="absolute inset-x-0 h-px bg-foreground/25"
            style={{ top: `${zeroPct}%` }}
          />
          {/* 5-year tick marks */}
          {Array.from({ length: Math.floor(horizon / 5) + 1 }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-border"
              style={{ left: `${((i * 5) / horizon) * 100}%` }}
            />
          ))}

          {/* Value bars: from zero line down (negative) or up (positive). */}
          {cumulativeDiscounted.map((v, t) => {
            const xPct = (t / horizon) * 100;
            const widthPct = (1 / horizon) * 100;
            const valuePct = ((maxVal - v) / range) * 100;
            const isPositive = v >= 0;
            const top = isPositive ? `${valuePct}%` : `${zeroPct}%`;
            const height = `${Math.abs(zeroPct - valuePct)}%`;
            return (
              <div
                key={t}
                className={cn("absolute", isPositive ? "bg-emerald-500" : "bg-orange-400")}
                style={{
                  left: `${xPct}%`,
                  width: `${widthPct}%`,
                  top,
                  height,
                  opacity: 0.7,
                }}
              />
            );
          })}

          {/* Payback pin */}
          {Number.isFinite(payback) && payback <= horizon && (
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-cyan-600"
              style={{ left: `calc(${(payback / horizon) * 100}% - 1px)` }}
              title={`할인 회수기간: ${payback.toFixed(1)}년차`}
            />
          )}
        </div>

        <div className="flex justify-between mt-1 text-[9px] tabular-nums text-muted-foreground">
          <span>1년차</span>
          <span className="text-foreground/70">
            ₩{formatKrwBig(minVal)} → ₩{formatKrwBig(maxVal)}
          </span>
          <span>{horizon}년차</span>
        </div>
      </div>
    </div>
  );
}
