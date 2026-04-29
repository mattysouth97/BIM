"use client";

// src/components/twin/feature-vector-panel.tsx
// Right-hand panel that surfaces the 20-field PortfolioFeatureVector. Grouped
// by namespace (bldrgst / geometry / era_prior / location) and visually
// aligned with the calibration feature-importance ranking so the user sees
// which fields drive the prediction they're looking at.

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { PortfolioFeatureVector } from "@/lib/portfolio/features";
import { FEATURE_SCHEMA } from "@/lib/portfolio/features";
import type { CalibrationReport } from "@/lib/twin/release-types";

interface FeatureVectorPanelProps {
  features: PortfolioFeatureVector | null;
  calibration: CalibrationReport | undefined;
  schemaVersion: string | undefined;
}

const GROUP_ORDER = ["bldrgst", "geometry", "era_prior", "location"] as const;
const GROUP_META: Record<
  (typeof GROUP_ORDER)[number],
  { label: string; accent: string; description: string }
> = {
  bldrgst: {
    label: "Building Ledger",
    accent: "#8de6f3",
    description: "건축물대장 · data.go.kr BldRgstHub",
  },
  geometry: {
    label: "Geometry",
    accent: "#c2f58a",
    description: "Footprint · VWorld LT_C_SPBD",
  },
  era_prior: {
    label: "Era Priors",
    accent: "#fcd58a",
    description: "Envelope priors from Korean energy code timeline",
  },
  location: {
    label: "Location",
    accent: "#f4a765",
    description: "Climate zone · KMA ASOS normals",
  },
};

const USE_TYPE_LABEL: Record<number, string> = {
  0: "Residential",
  1: "Office",
  2: "Mixed",
  3: "Retail",
  4: "Other",
};
const STRUCT_TYPE_LABEL: Record<number, string> = {
  0: "Masonry",
  1: "Reinforced Concrete",
  2: "Steel",
  3: "Wood",
  4: "Other",
};
const CLIMATE_LABEL: Record<number, string> = {
  0: "Central",
  1: "Southern",
  2: "Jeju",
};

function formatFieldValue(
  name: string,
  value: number | undefined,
  unit: string
): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";

  if (name === "useTypeCode") return `${value} · ${USE_TYPE_LABEL[value] ?? "—"}`;
  if (name === "structureTypeCode") return `${value} · ${STRUCT_TYPE_LABEL[value] ?? "—"}`;
  if (name === "climateZoneCode") return `${value} · ${CLIMATE_LABEL[value] ?? "—"}`;

  // Choose precision by unit
  if (unit === "m^2") return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (unit === "m") return value.toFixed(value < 10 ? 2 : 1);
  if (unit === "ratio") return value.toFixed(3);
  if (unit === "W/m^2K") return value.toFixed(2);
  if (unit === "W/m^2") return value.toFixed(1);
  if (unit === "unitless") {
    if (name === "compactness" || name === "windowShgcPrior")
      return value.toFixed(3);
    if (name === "aspectRatio") return value.toFixed(2);
    return value.toFixed(2);
  }
  if (unit === "year") return String(Math.trunc(value));
  if (unit === "floors") return String(Math.trunc(value));
  if (unit === "enum" || unit === "code") return String(value);
  return String(value);
}

function renderUnit(unit: string): string {
  if (unit === "m^2") return "m²";
  if (unit === "W/m^2K") return "W/m²K";
  if (unit === "W/m^2") return "W/m²";
  return unit;
}

export function FeatureVectorPanel({
  features,
  calibration,
  schemaVersion,
}: FeatureVectorPanelProps) {
  const [activeGroup, setActiveGroup] = useState<
    (typeof GROUP_ORDER)[number] | "all"
  >("all");

  // Build fast importance lookup
  const importanceMap = useMemo(() => {
    const m = new Map<string, { rank: number; gain: number }>();
    for (const f of calibration?.featureImportance ?? []) {
      m.set(f.name, { rank: f.rank, gain: f.gain });
    }
    return m;
  }, [calibration]);

  const maxGain = useMemo(() => {
    let max = 0;
    for (const f of calibration?.featureImportance ?? []) {
      if (f.gain > max) max = f.gain;
    }
    return max || 1;
  }, [calibration]);

  type SchemaField = (typeof FEATURE_SCHEMA.fields)[number];
  const grouped = useMemo<Record<(typeof GROUP_ORDER)[number], SchemaField[]>>(
    () => {
      const out: Record<(typeof GROUP_ORDER)[number], SchemaField[]> = {
        bldrgst: [],
        geometry: [],
        era_prior: [],
        location: [],
      };
      for (const field of FEATURE_SCHEMA.fields) {
        const key = field.group as (typeof GROUP_ORDER)[number];
        out[key].push(field);
      }
      return out;
    },
    []
  );

  return (
    <div
      className={cn(
        "pointer-events-auto absolute right-4 top-16 bottom-28 z-20 w-[360px]",
        "flex flex-col",
        "rounded-sm border border-[#24282d]/80",
        "bg-[#0b0d10]/88 backdrop-blur-md",
        "shadow-[0_12px_48px_-24px_rgba(0,0,0,0.9)]",
        "select-none overflow-hidden",
        "animate-[twin-slide-in_560ms_cubic-bezier(0.2,0.7,0.2,1)_both]"
      )}
      data-twin-feature-vector
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[#24282d]/70">
        <div className="flex flex-col leading-tight">
          <span className="text-[9px] tracking-[0.22em] uppercase text-zinc-500 font-mono">
            feature vector
          </span>
          <span
            className="text-[15px] font-semibold text-zinc-50 tracking-tight"
            style={{ fontFamily: "var(--font-display-release)" }}
          >
            20-field portfolio schema
          </span>
        </div>
        <span className="text-[9px] tracking-[0.14em] font-mono text-zinc-400 uppercase">
          v{schemaVersion ?? "—"}
        </span>
      </div>

      {/* Group filter tabs */}
      <div className="flex items-stretch border-b border-[#24282d]/70 font-mono">
        <GroupTab
          label="All"
          active={activeGroup === "all"}
          onClick={() => setActiveGroup("all")}
          accent="#d4d7dc"
          count={20}
        />
        {GROUP_ORDER.map((g) => (
          <GroupTab
            key={g}
            label={GROUP_META[g].label.split(" ")[0]}
            active={activeGroup === g}
            onClick={() => setActiveGroup(g)}
            accent={GROUP_META[g].accent}
            count={grouped[g].length}
          />
        ))}
      </div>

      {/* Field list — scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-3 twin-scroll">
        {GROUP_ORDER.filter((g) => activeGroup === "all" || activeGroup === g).map(
          (group) => {
            const meta = GROUP_META[group];
            return (
              <section key={group}>
                <header className="flex items-baseline gap-2 px-2 mb-1">
                  <span
                    className="inline-block h-[6px] w-[6px] rounded-sm"
                    style={{ backgroundColor: meta.accent }}
                  />
                  <span
                    className="text-[10px] font-semibold tracking-[0.18em] uppercase"
                    style={{ color: meta.accent }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-[9px] font-mono text-zinc-500 ml-auto">
                    {meta.description}
                  </span>
                </header>

                <ul className="space-y-0.5">
                  {grouped[group].map((field) => {
                    const rawValue =
                      features?.[field.name as keyof PortfolioFeatureVector];
                    const importance = importanceMap.get(field.name);
                    const gainPct = importance
                      ? Math.round((importance.gain / maxGain) * 100)
                      : 0;
                    return (
                      <li
                        key={field.name}
                        className={cn(
                          "relative grid grid-cols-[1fr_auto] gap-x-3 items-baseline",
                          "rounded-sm px-2 py-1.5",
                          "hover:bg-[#12161a] transition-colors group"
                        )}
                      >
                        {/* Importance bar underlay */}
                        {importance && (
                          <div
                            className="absolute inset-y-0 left-0 rounded-sm opacity-40 group-hover:opacity-70 transition-opacity"
                            style={{
                              width: `${gainPct}%`,
                              background: `linear-gradient(90deg, ${meta.accent}22 0%, transparent 100%)`,
                            }}
                            aria-hidden="true"
                          />
                        )}

                        <div className="relative flex items-center gap-1.5 min-w-0">
                          {importance && importance.rank <= 10 && (
                            <span
                              className="shrink-0 text-[8.5px] font-mono tabular-nums text-zinc-500 w-[18px] text-right"
                              title={`Feature importance rank #${importance.rank}`}
                            >
                              #{importance.rank}
                            </span>
                          )}
                          <span
                            className="text-[11.5px] font-mono text-zinc-200 truncate"
                            title={field.description}
                          >
                            {field.name}
                          </span>
                        </div>

                        <div className="relative flex items-baseline gap-1">
                          <span
                            className="text-[12px] tabular-nums text-zinc-50 font-semibold"
                            style={{ fontFamily: "var(--font-mono-data)" }}
                          >
                            {formatFieldValue(
                              field.name,
                              rawValue as number | undefined,
                              field.unit
                            )}
                          </span>
                          <span className="text-[9px] text-zinc-500 font-mono">
                            {renderUnit(field.unit)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          }
        )}
      </div>

      {/* Footer — feature-importance legend */}
      <div className="px-4 py-2 border-t border-[#24282d]/70 bg-[#0a0c0f]/70">
        <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 tracking-[0.14em] uppercase">
          <span>importance bar · gain-normalised</span>
          <div className="flex items-center gap-1">
            <span className="inline-block h-[6px] w-10 bg-gradient-to-r from-[#8de6f322] to-transparent" />
            <span className="text-zinc-400">top-ranked ←</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface GroupTabProps {
  label: string;
  active: boolean;
  onClick: () => void;
  accent: string;
  count: number;
}
function GroupTab({ label, active, onClick, accent, count }: GroupTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 flex flex-col items-center gap-0.5 py-2 px-1 border-r border-[#24282d]/70 last:border-r-0",
        "transition-colors text-[10px] tracking-[0.12em] uppercase",
        active
          ? "bg-[#12161a] text-zinc-50"
          : "text-zinc-500 hover:text-zinc-300"
      )}
    >
      <span
        className="h-[2px] w-6 rounded-full transition-opacity"
        style={{
          backgroundColor: accent,
          opacity: active ? 1 : 0.25,
        }}
      />
      <span>{label}</span>
      <span className="text-[9px] tabular-nums text-zinc-500 font-mono">{count}</span>
    </button>
  );
}
