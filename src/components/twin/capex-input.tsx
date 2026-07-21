"use client";

// src/components/twin/capex-input.tsx
// Bottom-center CAPEX budget input. Slider snaps to ₩100M tiers up to ₩2B,
// with manual numeric input for precise values. D₄: white-card
// slider-with-readout aesthetic on semantic tokens.

import { useId } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { formatKrw } from "@/lib/twin-formatters";

interface CapexInputProps {
  /** Current CAPEX budget in KRW. */
  value: number;
  /** Called whenever the user changes the budget. */
  onChange: (krw: number) => void;
  /** Minimum allowed (default ₩10M). */
  min?: number;
  /** Maximum allowed (default ₩2B). */
  max?: number;
  /** Step size (default ₩10M). */
  step?: number;
  /** Optional summary text shown to the right (e.g. "selected: 4 of 7 measures"). */
  summary?: string;
}

const KRW_MAN = 10_000;        // 만 = 10,000 KRW

export function CapexInput({
  value,
  onChange,
  min = 10_000_000,
  max = 2_000_000_000,
  step = 10_000_000,
  summary,
}: CapexInputProps) {
  const sliderId = useId();
  const numericId = useId();
  const { t, lang } = useT(); // P2-06

  // Snap to common Korean budget tiers for tick marks.
  const tickMarks = [
    50_000_000, 100_000_000, 250_000_000, 500_000_000,
    1_000_000_000, 2_000_000_000,
  ];

  return (
    <div
      className={cn(
        "pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-4 z-20",
        "flex items-stretch gap-4 px-5 py-3",
        "rounded-lg border border-border",
        "bg-card/95 backdrop-blur-md",
        "shadow-lg",
        "select-none",
        "animate-[twin-slide-up_520ms_cubic-bezier(0.2,0.7,0.2,1)_both]",
      )}
      data-twin-capex-input
    >
      {/* Label column */}
      <div className="flex flex-col items-start justify-center pr-4 border-r border-border min-w-[100px]">
        <label htmlFor={sliderId} className="text-[10px] font-medium text-muted-foreground">
          {t("투자 예산 (CAPEX)", "Investment budget (CAPEX)")}
        </label>
        <span className="text-[18px] font-semibold tabular-nums text-foreground leading-tight">
          {formatKrw(value, lang)}
        </span>
      </div>

      {/* Slider column */}
      <div className="flex flex-col gap-1 min-w-[400px] justify-center">
        <input
          id={sliderId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(
            "w-full h-1 cursor-pointer appearance-none",
            "bg-border rounded-full outline-none",
            "[&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5",
            "[&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:bg-cyan-600",
            "[&::-webkit-slider-thumb]:shadow-sm",
            "[&::-webkit-slider-thumb]:cursor-pointer",
            "[&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5",
            "[&::-moz-range-thumb]:rounded-full",
            "[&::-moz-range-thumb]:bg-cyan-600 [&::-moz-range-thumb]:border-none",
          )}
        />
        <div className="flex items-center justify-between text-[9px] tabular-nums">
          {tickMarks.map((tick) => (
            <button
              key={tick}
              type="button"
              onClick={() => onChange(tick)}
              className={cn(
                "px-1 py-0.5 rounded-sm transition-colors hover:text-foreground",
                Math.abs(value - tick) < step / 2
                  ? "text-cyan-600 font-semibold"
                  : "text-muted-foreground",
              )}
            >
              {formatKrw(tick, lang)}
            </button>
          ))}
        </div>
      </div>

      {/* Numeric input + summary column */}
      <div className="flex flex-col items-end justify-center gap-1 pl-4 border-l border-border min-w-[140px]">
        <label htmlFor={numericId} className="text-[10px] font-medium text-muted-foreground">
          {t("직접 입력 (만원)", "Direct input (10k KRW)")}
        </label>
        <input
          id={numericId}
          type="number"
          min={min / KRW_MAN}
          max={max / KRW_MAN}
          step={step / KRW_MAN}
          value={Math.round(value / KRW_MAN)}
          onChange={(e) => {
            const v = Number(e.target.value);
            // P1-07 (f): clamp to [min, max] so slider + number never desync.
            if (Number.isFinite(v)) onChange(Math.min(Math.max(v * KRW_MAN, min), max));
          }}
          className={cn(
            "w-full text-right text-[12px] tabular-nums text-foreground",
            "bg-background border border-input rounded-md px-2 py-0.5",
            "focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring",
          )}
        />
        {summary && (
          <span className="text-[9px] text-muted-foreground truncate max-w-full">
            {summary}
          </span>
        )}
      </div>
    </div>
  );
}
