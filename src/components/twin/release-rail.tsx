"use client";

// src/components/twin/release-rail.tsx
// Observatory-style top rail communicating the versioned data-product identity.
// Sits across the width of the Twin viewport and anchors every decision below:
// which release, which calibration tier, what coverage, when it was generated.

import { cn } from "@/lib/utils";
import type {
  CalibrationReport,
  ReleaseManifest,
} from "@/lib/twin/release-types";

interface ReleaseRailProps {
  manifest: ReleaseManifest | undefined;
  calibration: CalibrationReport | undefined;
  isLoading?: boolean;
  onOpenReleaseExplorer?: () => void;
}

function formatGeneratedAt(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toISOString().replace("T", " · ").slice(0, 19) + " UTC";
  } catch {
    return iso;
  }
}

function tierSignal(tier: CalibrationReport["tier"] | undefined): {
  label: string;
  color: string;
  pulse: boolean;
} {
  switch (tier) {
    case "A":
      return { label: "CALIB · TIER A", color: "text-[#8de6f3]", pulse: true };
    case "B":
      return { label: "CALIB · TIER B", color: "text-[#8de6f3]", pulse: true };
    case "C":
      return { label: "CALIB · TIER C", color: "text-[#fcd58a]", pulse: true };
    case "preview":
      return { label: "PREVIEW · UNCAL.", color: "text-[#f4a765]", pulse: false };
    default:
      return { label: "— · OFFLINE", color: "text-zinc-500", pulse: false };
  }
}

export function ReleaseRail({
  manifest,
  calibration,
  isLoading,
  onOpenReleaseExplorer,
}: ReleaseRailProps) {
  const tier = tierSignal(calibration?.tier);
  const mape = calibration?.metrics.mape;
  const tau = calibration?.metrics.kendallTau;
  const coverage = manifest?.coverage.buildingCount;

  return (
    <div
      className={cn(
        "pointer-events-auto absolute inset-x-0 top-0 z-20",
        "flex items-stretch h-11",
        "border-b border-[#24282d]/90",
        "bg-[#0b0d10]/88 backdrop-blur-md",
        "font-mono text-[11px] tracking-[0.08em] text-zinc-300",
        "select-none"
      )}
      data-twin-rail
    >
      {/* Left brand block — the "masthead" of the release */}
      <button
        type="button"
        onClick={onOpenReleaseExplorer}
        className={cn(
          "group flex items-center gap-3 px-4 border-r border-[#24282d]/90",
          "bg-[linear-gradient(90deg,rgba(141,230,243,0.06),transparent_65%)]",
          "hover:bg-[linear-gradient(90deg,rgba(141,230,243,0.12),transparent_60%)]",
          "transition-colors"
        )}
        title="Open release explorer"
      >
        <span
          className={cn(
            "inline-flex items-center justify-center h-5 w-5 rounded-sm",
            "border border-[#8de6f3]/50 bg-[#8de6f3]/10",
            "text-[#8de6f3] text-[9px] font-bold tracking-tight"
          )}
        >
          GX
        </span>
        <span className="flex flex-col leading-tight">
          <span
            className="text-[9px] uppercase tracking-[0.22em] text-zinc-500"
            style={{ fontFamily: "var(--font-display-release)" }}
          >
            Prediction Release
          </span>
          <span
            className="text-[13px] font-semibold text-zinc-50 tracking-tight"
            style={{ fontFamily: "var(--font-display-release)", fontFeatureSettings: "'ss01', 'ss02'" }}
          >
            {isLoading ? "loading…" : manifest?.version ?? "—"}
            {manifest?.codename && (
              <span className="ml-2 text-[10px] font-normal italic text-zinc-400">
                {manifest.codename}
              </span>
            )}
          </span>
        </span>
      </button>

      {/* Calibration tier badge */}
      <div className="flex items-center gap-2 px-4 border-r border-[#24282d]/90">
        <span
          className={cn(
            "inline-block size-1.5 rounded-full",
            tier.color.replace("text-", "bg-"),
            tier.pulse && "animate-pulse"
          )}
        />
        <span className={cn("text-[10px] font-semibold tracking-[0.14em]", tier.color)}>
          {tier.label}
        </span>
      </div>

      {/* Metric cluster — monospaced readouts */}
      <div className="flex items-center divide-x divide-[#24282d]/90">
        <Metric label="MAPE" value={mape != null ? `${(mape * 100).toFixed(1)}%` : "—"} />
        <Metric label="τ(kendall)" value={tau != null ? tau.toFixed(3) : "—"} />
        <Metric
          label="coverage"
          value={coverage != null ? `${coverage.toLocaleString()} bldg` : "—"}
        />
        <Metric
          label="schema"
          value={manifest?.featureSchemaVersion ?? "—"}
        />
      </div>

      {/* Right: timestamp + license */}
      <div className="ml-auto flex items-center gap-6 px-4 border-l border-[#24282d]/90">
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">
            generated
          </span>
          <span className="text-[11px] tabular-nums text-zinc-200">
            {formatGeneratedAt(manifest?.generatedAt)}
          </span>
        </div>
        <span className="text-[9px] tracking-[0.18em] text-zinc-500">
          {manifest?.license ?? "—"}
        </span>
      </div>

      {/* Calibration sweep — decorative scanline */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute inset-y-0 w-[30%] bg-gradient-to-r from-transparent via-[#8de6f3]/60 to-transparent animate-[rail-sweep_6s_linear_infinite]" />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 px-4 h-full">
      <span className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      <span
        className="text-[12px] font-semibold tabular-nums text-zinc-100"
        style={{ fontFamily: "var(--font-mono-data)" }}
      >
        {value}
      </span>
    </div>
  );
}
