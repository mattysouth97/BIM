"use client";

// src/components/twin/capex-input.tsx
// Bottom-center CAPEX budget input. Slider snaps to ₩100M tiers up to ₩2B,
// with manual numeric input for precise values. Replaces the geometry-source
// toggle that sat in the same position in the v7 layout.

import { useId } from "react";
import { cn } from "@/lib/utils";

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
const KRW_EOK = 100_000_000;   // 억 = 100,000,000 KRW

/** Format KRW into 억/만 idiom that Korean users read natively. */
function formatKrw(krw: number): string {
  if (krw >= KRW_EOK) {
    const eok = krw / KRW_EOK;
    return `${eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(1)}억`;
  }
  if (krw >= KRW_MAN) {
    return `${(krw / KRW_MAN).toFixed(0)}만`;
  }
  return krw.toLocaleString();
}

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
        "rounded-sm border border-[#24282d]/80",
        "bg-[#0b0d10]/90 backdrop-blur-md",
        "shadow-[0_12px_40px_-20px_rgba(0,0,0,0.85)]",
        "select-none",
        "animate-[twin-slide-up_520ms_cubic-bezier(0.2,0.7,0.2,1)_both]",
      )}
      data-twin-capex-input
    >
      {/* Label column */}
      <div className="flex flex-col items-start justify-center pr-4 border-r border-[#24282d]/80 min-w-[100px]">
        <span className="text-[9px] tracking-[0.22em] uppercase text-zinc-500 font-mono">
          CAPEX budget
        </span>
        <span
          className="text-[18px] font-semibold tabular-nums text-zinc-50 leading-tight"
          style={{ fontFamily: "var(--font-display-release)" }}
        >
          ₩{formatKrw(value)}
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
            "bg-[#24282d] rounded-full outline-none",
            "[&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3",
            "[&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:bg-[#8de6f3]",
            "[&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(141,230,243,0.7)]",
            "[&::-webkit-slider-thumb]:cursor-pointer",
            "[&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3",
            "[&::-moz-range-thumb]:rounded-full",
            "[&::-moz-range-thumb]:bg-[#8de6f3] [&::-moz-range-thumb]:border-none",
          )}
        />
        <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500">
          {tickMarks.map((tick) => (
            <button
              key={tick}
              type="button"
              onClick={() => onChange(tick)}
              className={cn(
                "px-1 py-0.5 rounded-sm transition-colors hover:text-zinc-200",
                Math.abs(value - tick) < step / 2
                  ? "text-[#8de6f3]"
                  : "text-zinc-500",
              )}
            >
              {formatKrw(tick)}
            </button>
          ))}
        </div>
      </div>

      {/* Numeric input + summary column */}
      <div className="flex flex-col items-end justify-center gap-1 pl-4 border-l border-[#24282d]/80 min-w-[140px]">
        <label htmlFor={numericId} className="text-[9px] tracking-[0.18em] uppercase text-zinc-500 font-mono">
          exact (만 KRW)
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
            if (Number.isFinite(v) && v >= 0) onChange(v * KRW_MAN);
          }}
          className={cn(
            "w-full text-right text-[12px] font-mono tabular-nums text-zinc-100",
            "bg-[#15171c] border border-[#24282d] rounded-sm px-2 py-0.5",
            "focus:border-[#8de6f3] focus:outline-none",
          )}
        />
        {summary && (
          <span className="text-[9px] font-mono text-zinc-400 truncate max-w-full">
            {summary}
          </span>
        )}
      </div>
    </div>
  );
}
