"use client";

// src/components/twin/retrofit-manifest.tsx
// Right-rail manifest of all candidate retrofit measures, grouped by category
// (envelope / hvac / lighting / renewable). Each row shows CAPEX, NPV,
// IRR, discounted payback, and a "selected" marker when the measure is
// part of the knapsack-optimal subset within the user's CAPEX budget.

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";

interface RetrofitManifestProps {
  measures: RetrofitMeasure[];
  selectedIds: Set<string>;
}

const CATEGORY_ORDER = ["envelope", "hvac", "lighting", "renewable"] as const;
const CATEGORY_META: Record<
  (typeof CATEGORY_ORDER)[number],
  { label: string; accent: string; description: string }
> = {
  envelope: {
    label: "Envelope",
    accent: "#8de6f3",
    description: "Walls · Roof · Windows · Floor",
  },
  hvac: {
    label: "HVAC",
    accent: "#fcd58a",
    description: "Heating · Cooling · Ventilation",
  },
  lighting: {
    label: "Lighting",
    accent: "#c2f58a",
    description: "LED · Smart controls",
  },
  renewable: {
    label: "Renewable",
    accent: "#f4a765",
    description: "Solar PV · Roof potential",
  },
};

const KRW_EOK = 100_000_000;

function formatKrw(krw: number): string {
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

function formatPercent(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
}

function formatYears(years: number | undefined): string {
  if (years === undefined || !Number.isFinite(years)) return "—";
  return `${years.toFixed(1)}y`;
}

export function RetrofitManifest({ measures, selectedIds }: RetrofitManifestProps) {
  const [activeGroup, setActiveGroup] = useState<
    (typeof CATEGORY_ORDER)[number] | "all"
  >("all");

  const grouped = useMemo<Record<(typeof CATEGORY_ORDER)[number], RetrofitMeasure[]>>(
    () => {
      const out: Record<(typeof CATEGORY_ORDER)[number], RetrofitMeasure[]> = {
        envelope: [],
        hvac: [],
        lighting: [],
        renewable: [],
      };
      for (const m of measures) {
        out[m.category].push(m);
      }
      // Sort: selected first, then by NPV descending.
      for (const k of CATEGORY_ORDER) {
        out[k].sort((a, b) => {
          const aSel = selectedIds.has(a.id) ? 1 : 0;
          const bSel = selectedIds.has(b.id) ? 1 : 0;
          if (aSel !== bSel) return bSel - aSel;
          return (b.financials?.npv ?? 0) - (a.financials?.npv ?? 0);
        });
      }
      return out;
    },
    [measures, selectedIds],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: measures.length };
    for (const k of CATEGORY_ORDER) c[k] = grouped[k].length;
    return c;
  }, [grouped, measures]);

  const maxNpv = useMemo(() => {
    let max = 1;
    for (const m of measures) {
      const v = Math.abs(m.financials?.npv ?? 0);
      if (v > max) max = v;
    }
    return max;
  }, [measures]);

  return (
    <div
      className={cn(
        "pointer-events-auto absolute right-4 top-20 bottom-28 z-20 w-[380px]",
        "flex flex-col",
        "rounded-sm border border-[#24282d]/80",
        "bg-[#0b0d10]/88 backdrop-blur-md",
        "shadow-[0_12px_48px_-24px_rgba(0,0,0,0.9)]",
        "select-none overflow-hidden",
        "animate-[twin-slide-in_560ms_cubic-bezier(0.2,0.7,0.2,1)_both]",
      )}
      data-twin-feature-vector
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[#24282d]/70">
        <div className="flex flex-col leading-tight">
          <span className="text-[9px] tracking-[0.22em] uppercase text-zinc-500 font-mono">
            retrofit manifest
          </span>
          <span
            className="text-[15px] font-semibold text-zinc-50 tracking-tight"
            style={{ fontFamily: "var(--font-display-release)" }}
          >
            {measures.length} candidate measures
          </span>
        </div>
        <span className="text-[9px] tracking-[0.14em] font-mono text-[#8de6f3] uppercase">
          {selectedIds.size} selected
        </span>
      </div>

      <div className="flex items-stretch border-b border-[#24282d]/70 font-mono">
        <GroupTab
          label="All"
          active={activeGroup === "all"}
          onClick={() => setActiveGroup("all")}
          accent="#d4d7dc"
          count={counts.all}
        />
        {CATEGORY_ORDER.map((g) => (
          <GroupTab
            key={g}
            label={CATEGORY_META[g].label}
            active={activeGroup === g}
            onClick={() => setActiveGroup(g)}
            accent={CATEGORY_META[g].accent}
            count={counts[g]}
          />
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto twin-scroll px-2 py-2 space-y-3">
        {CATEGORY_ORDER.filter((g) => activeGroup === "all" || activeGroup === g).map(
          (group) => {
            const meta = CATEGORY_META[group];
            const list = grouped[group];
            if (list.length === 0) return null;
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

                <ul className="space-y-1">
                  {list.map((m) => {
                    const isSelected = selectedIds.has(m.id);
                    const fin = m.financials;
                    const npv = fin?.npv ?? 0;
                    const npvFraction = Math.min(1, Math.abs(npv) / maxNpv);
                    return (
                      <li
                        key={m.id}
                        className={cn(
                          "relative px-2 py-1.5 rounded-sm border transition-colors",
                          isSelected
                            ? "border-[#8de6f3]/35 bg-[#8de6f3]/[0.04]"
                            : "border-transparent hover:bg-[#12161a]",
                        )}
                      >
                        {fin && (
                          <div
                            className="absolute inset-y-0 left-0 rounded-sm opacity-30 pointer-events-none"
                            style={{
                              width: `${npvFraction * 100}%`,
                              background: `linear-gradient(90deg, ${
                                npv >= 0 ? meta.accent : "#f4a765"
                              }28 0%, transparent 100%)`,
                            }}
                            aria-hidden="true"
                          />
                        )}

                        <div className="relative grid grid-cols-[1fr_auto] items-baseline gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={cn(
                                "shrink-0 inline-block w-[6px] h-[6px] rounded-sm",
                                isSelected ? "bg-[#8de6f3]" : "bg-[#33393f]",
                              )}
                              title={isSelected ? "Selected within budget" : "Not selected"}
                            />
                            <span
                              className="text-[12px] text-zinc-100 truncate"
                              title={m.description}
                            >
                              {m.name}
                            </span>
                          </div>
                          <span className="text-[10.5px] font-mono tabular-nums text-zinc-300 shrink-0">
                            ₩{formatKrw(m.estimatedCost)}
                          </span>
                        </div>

                        <div className="relative grid grid-cols-3 gap-2 mt-1 text-[10px] font-mono tabular-nums text-zinc-400">
                          <span>
                            NPV{" "}
                            <span
                              className={cn(
                                "tabular-nums",
                                npv >= 0 ? "text-[#8de6f3]" : "text-[#f4a765]",
                              )}
                            >
                              ₩{formatKrw(npv)}
                            </span>
                          </span>
                          <span>
                            IRR <span className="text-zinc-200">{formatPercent(fin?.irr, 0)}</span>
                          </span>
                          <span className="text-right">
                            payback{" "}
                            <span className="text-zinc-200">{formatYears(fin?.discountedPayback)}</span>
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          },
        )}

        {measures.length === 0 && (
          <div className="px-4 py-6 text-[11px] text-zinc-500 font-mono text-center">
            No retrofit measures detected for this building.<br />
            Material data may not be loaded yet.
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-[#24282d]/70 bg-[#0a0c0f]/70">
        <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 tracking-[0.14em] uppercase">
          <span>NPV bar · gain-normalised</span>
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="inline-block w-1.5 h-1.5 rounded-sm bg-[#8de6f3]" />
            <span>selected</span>
          </span>
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
        active ? "bg-[#12161a] text-zinc-50" : "text-zinc-500 hover:text-zinc-300",
      )}
    >
      <span
        className="h-[2px] w-6 rounded-full transition-opacity"
        style={{ backgroundColor: accent, opacity: active ? 1 : 0.25 }}
      />
      <span>{label}</span>
      <span className="text-[9px] tabular-nums text-zinc-500 font-mono">{count}</span>
    </button>
  );
}
