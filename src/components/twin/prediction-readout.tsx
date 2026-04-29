"use client";

// src/components/twin/prediction-readout.tsx
// Signature left-hand readout. Displays the predicted EUI alongside grade and
// prediction interval, rendered in the observatory style: oversized serif for
// the headline number, monospaced calipers for the confidence band.

import { cn } from "@/lib/utils";
import type { TwinPrediction } from "@/lib/twin/release-types";

interface PredictionReadoutProps {
  prediction: TwinPrediction | null;
  isLoading?: boolean;
}

function formatEui(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toString();
}

export function PredictionReadout({
  prediction,
  isLoading,
}: PredictionReadoutProps) {
  const eui = prediction?.eui ?? NaN;
  const low = prediction?.confidenceLow ?? NaN;
  const high = prediction?.confidenceHigh ?? NaN;

  // Position indicator on the 80–320 EUI range (renders as a caliper tick)
  const RANGE_MIN = 80;
  const RANGE_MAX = 320;
  const clamp = (x: number) =>
    Math.max(0, Math.min(1, (x - RANGE_MIN) / (RANGE_MAX - RANGE_MIN)));
  const euiPct = clamp(eui) * 100;
  const lowPct = clamp(low) * 100;
  const highPct = clamp(high) * 100;

  return (
    <div
      className={cn(
        "pointer-events-auto absolute left-4 top-16 z-20 w-[304px]",
        "rounded-sm border border-[#24282d]/80",
        "bg-[#0b0d10]/88 backdrop-blur-md",
        "shadow-[0_12px_48px_-24px_rgba(0,0,0,0.9)]",
        "select-none overflow-hidden",
        "animate-[twin-slide-in_480ms_cubic-bezier(0.2,0.7,0.2,1)_both]"
      )}
      data-twin-prediction
    >
      {/* Caliper tick hairline */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1 border-b border-[#24282d]/70">
        <span className="text-[9px] tracking-[0.22em] uppercase text-zinc-500 font-mono">
          predicted energy use
        </span>
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-1 rounded-full bg-[#8de6f3] animate-pulse" />
          <span className="text-[9px] tracking-[0.18em] uppercase text-[#8de6f3] font-mono">
            {prediction?.isPreview ? "preview" : "released"}
          </span>
        </div>
      </div>

      {/* Headline EUI */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-end gap-3 leading-none">
          <span
            className="text-[72px] font-light tabular-nums text-zinc-50 tracking-[-0.04em]"
            style={{
              fontFamily: "var(--font-display-release)",
              fontFeatureSettings: "'ss01', 'tnum'",
              fontVariationSettings: "'opsz' 144, 'SOFT' 0, 'WONK' 0",
            }}
          >
            {isLoading ? "…" : formatEui(eui)}
          </span>
          <span className="pb-3 flex flex-col leading-tight">
            <span className="text-[10px] tracking-[0.14em] uppercase text-zinc-400 font-mono">
              kWh
            </span>
            <span className="text-[10px] tracking-[0.14em] uppercase text-zinc-400 font-mono">
              m²·yr
            </span>
          </span>
        </div>

        {/* Grade chip */}
        <div className="mt-3 flex items-center gap-2">
          <span
            className={cn(
              "inline-flex h-5 min-w-[22px] items-center justify-center rounded-sm px-1.5",
              "border border-[#8de6f3]/45 bg-[#8de6f3]/12",
              "text-[#c7f3fb] text-[11px] font-bold tracking-tight"
            )}
          >
            {prediction?.grade ?? "—"}
          </span>
          <span className="text-[11px] text-zinc-300 font-mono tracking-wide">
            {prediction?.gradeDescription ?? "Computing…"}
          </span>
        </div>
      </div>

      {/* Confidence caliper */}
      <div className="px-4 py-3 border-t border-[#24282d]/70 bg-[#0a0c0f]/60">
        <div className="flex items-center justify-between text-[9px] tracking-[0.2em] uppercase text-zinc-500 font-mono mb-2">
          <span>prediction interval</span>
          <span className="text-zinc-400">
            p{10}–p{90}
            <span className="ml-2 text-[#8de6f3]/90">
              cov {Math.round((prediction?.confidenceCoverage ?? 0) * 100)}%
            </span>
          </span>
        </div>

        {/* Caliper track */}
        <div className="relative h-8" aria-hidden="true">
          {/* Track */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-[#2a2f35]" />

          {/* Tick marks */}
          {Array.from({ length: 13 }).map((_, i) => (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 w-px h-1.5 bg-[#33393f]"
              style={{ left: `${(i / 12) * 100}%` }}
            />
          ))}

          {/* Confidence band */}
          {Number.isFinite(lowPct) && Number.isFinite(highPct) && (
            <div
              className="absolute top-1/2 -translate-y-1/2 h-[6px] rounded-sm bg-[#8de6f3]/18 border-y border-[#8de6f3]/35"
              style={{
                left: `${Math.min(lowPct, highPct)}%`,
                width: `${Math.abs(highPct - lowPct)}%`,
              }}
            />
          )}

          {/* Point estimate pin */}
          {Number.isFinite(euiPct) && (
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-[#8de6f3] shadow-[0_0_10px_rgba(141,230,243,0.8)]"
              style={{ left: `calc(${euiPct}% - 1px)` }}
            />
          )}
        </div>

        {/* Range labels */}
        <div className="flex justify-between mt-1 text-[9px] font-mono tabular-nums text-zinc-500">
          <span>{RANGE_MIN}</span>
          <span className="tabular-nums text-zinc-300">
            {Number.isFinite(low) ? Math.round(low) : "—"}
            <span className="mx-1 text-zinc-600">–</span>
            {Number.isFinite(high) ? Math.round(high) : "—"}
          </span>
          <span>{RANGE_MAX}</span>
        </div>
      </div>
    </div>
  );
}
