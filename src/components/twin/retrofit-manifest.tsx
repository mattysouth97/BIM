"use client";

// src/components/twin/retrofit-manifest.tsx
// Right-rail manifest of all candidate retrofit measures, grouped by category
// (envelope / hvac / lighting / renewable). Each row shows CAPEX, NPV,
// IRR, discounted payback, and a "selected" marker when the measure is
// part of the knapsack-optimal subset within the user's CAPEX budget.
// D₄: white-card Korean-label aesthetic + KICT 2024 cost-basis footnote
// (dossier §5 action item).

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { formatKrw, formatYears } from "@/lib/twin-formatters";
import { useScenarioStore } from "@/store/scenario-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useNarrowViewport } from "@/hooks/use-narrow-viewport";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";

interface RetrofitManifestProps {
  measures: RetrofitMeasure[];
  selectedIds: Set<string>;
}

const CATEGORY_ORDER = ["envelope", "hvac", "lighting", "renewable"] as const;
// P2-06: bilingual label/description catalog.
const CATEGORY_META: Record<
  (typeof CATEGORY_ORDER)[number],
  { label: { ko: string; en: string }; accent: string; description: { ko: string; en: string } }
> = {
  envelope: {
    label: { ko: "외피 단열", en: "Envelope" },
    accent: "#ea580c", // orange-600 — matches SceneOutliner category hues
    description: { ko: "벽체 · 지붕 · 창호 · 바닥", en: "Walls · roof · windows · floor" },
  },
  hvac: {
    label: { ko: "HVAC", en: "HVAC" },
    accent: "#2563eb", // blue-600
    description: { ko: "난방 · 냉방 · 환기", en: "Heating · cooling · ventilation" },
  },
  lighting: {
    label: { ko: "조명", en: "Lighting" },
    accent: "#d97706", // amber-600
    description: { ko: "LED · 스마트 제어", en: "LED · smart controls" },
  },
  renewable: {
    label: { ko: "신재생", en: "Renewable" },
    accent: "#16a34a", // green-600
    description: { ko: "태양광 · 지붕 잠재량", en: "Solar · roof potential" },
  },
};

function formatPercent(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
}

export function RetrofitManifest({ measures, selectedIds }: RetrofitManifestProps) {
  const { t, lang } = useT(); // P2-06
  const rightDockOpen = useWorkspaceStore((s) => s.rightDockOpen);
  const narrow = useNarrowViewport();
  const [activeGroup, setActiveGroup] = useState<
    (typeof CATEGORY_ORDER)[number] | "all"
  >("all");

  // P2-20 — clicking a measure applies it to the 3D model (tints, PV array).
  const appliedIds = useScenarioStore((s) => s.appliedMeasureIds);
  const toggleAppliedMeasure = useScenarioStore((s) => s.toggleAppliedMeasure);

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

  // Phone measure strip already lists the budget picks.
  if (narrow) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto absolute top-20 bottom-28 z-20 w-[380px] transition-[right] duration-200",
        "flex-col",
        "rounded-lg border border-border",
        "bg-card/95 backdrop-blur-md",
        "shadow-lg",
        "select-none overflow-hidden",
        "animate-[twin-slide-in_560ms_cubic-bezier(0.2,0.7,0.2,1)_both]",
        rightDockOpen
          ? "hidden 2xl:flex 2xl:right-[404px]"
          : "right-4 flex",
      )}
      data-twin-feature-vector
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-medium text-muted-foreground">
            {t("개선 후보 목록", "Retrofit candidates")}
          </span>
          <span className="text-[15px] font-semibold text-foreground tracking-tight">
            {t(`후보 ${measures.length}개`, `${measures.length} candidates`)}
          </span>
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[10px] font-semibold text-cyan-700 dark:text-cyan-400">
            {t(`${selectedIds.size}개 예산 내 선택`, `${selectedIds.size} in budget`)}
          </span>
          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            {t(`${appliedIds.length}개 적용 — 3D 반영`, `${appliedIds.length} applied to 3D`)}
          </span>
        </div>
      </div>

      <div className="flex items-stretch border-b border-border">
        <GroupTab
          label={t("전체", "All")}
          active={activeGroup === "all"}
          onClick={() => setActiveGroup("all")}
          accent="#64748b"
          count={counts.all}
        />
        {CATEGORY_ORDER.map((g) => (
          <GroupTab
            key={g}
            label={CATEGORY_META[g].label[lang]}
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
                    className="text-[10px] font-semibold"
                    style={{ color: meta.accent }}
                  >
                    {meta.label[lang]}
                  </span>
                  <span className="text-[9px] text-muted-foreground ml-auto">
                    {meta.description[lang]}
                  </span>
                </header>

                <ul className="space-y-1">
                  {list.map((m) => {
                    const isSelected = selectedIds.has(m.id);
                    const isApplied = appliedIds.includes(m.id);
                    const fin = m.financials;
                    const npv = fin?.npv ?? 0;
                    const npvFraction = Math.min(1, Math.abs(npv) / maxNpv);
                    return (
                      <li
                        key={m.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isApplied}
                        onClick={() => toggleAppliedMeasure(m.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleAppliedMeasure(m.id);
                          }
                        }}
                        className={cn(
                          "relative px-2 py-1.5 rounded-md border transition-colors cursor-pointer",
                          isApplied
                            ? "border-emerald-400 bg-emerald-50/70 dark:border-emerald-700 dark:bg-emerald-950/40"
                            : isSelected
                              ? "border-cyan-300 bg-cyan-50/60 dark:border-cyan-800 dark:bg-cyan-950/40"
                              : "border-transparent hover:bg-muted/60",
                        )}
                      >
                        {fin && (
                          <div
                            className="absolute inset-y-0 left-0 rounded-md opacity-20 pointer-events-none"
                            style={{
                              width: `${npvFraction * 100}%`,
                              background: `linear-gradient(90deg, ${
                                npv >= 0 ? meta.accent : "#ea580c"
                              }40 0%, transparent 100%)`,
                            }}
                            aria-hidden="true"
                          />
                        )}

                        <div className="relative grid grid-cols-[1fr_auto] items-baseline gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={cn(
                                "shrink-0 inline-block w-[6px] h-[6px] rounded-sm",
                                isApplied ? "bg-emerald-500" : isSelected ? "bg-cyan-600" : "bg-border",
                              )}
                              title={
                                isApplied
                                  ? t("적용됨 — 3D 반영", "Applied — shown in 3D")
                                  : isSelected
                                    ? t("예산 내 선택됨", "Selected (in budget)")
                                    : t("미선택", "Not selected")
                              }
                            />
                            <span
                              className="text-[12px] text-foreground truncate"
                              title={m.description}
                            >
                              {m.name}
                            </span>
                          </div>
                          <span className="text-[10.5px] tabular-nums text-foreground/70 shrink-0">
                            {formatKrw(m.estimatedCost, lang)}
                          </span>
                        </div>

                        <div className="relative grid grid-cols-3 gap-2 mt-1 text-[10px] tabular-nums text-muted-foreground">
                          <span>
                            NPV{" "}
                            <span
                              className={cn(
                                "tabular-nums font-medium",
                                npv >= 0 ? "text-emerald-600" : "text-orange-600",
                              )}
                            >
                              {formatKrw(npv, lang)}
                            </span>
                          </span>
                          <span>
                            IRR <span className="text-foreground/80">{formatPercent(fin?.irr, 0)}</span>
                          </span>
                          <span className="text-right">
                            {t("회수", "Payback")}{" "}
                            <span className="text-foreground/80">{formatYears(fin?.discountedPayback, lang)}</span>
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
          <div className="px-4 py-6 text-[11px] text-muted-foreground text-center">
            {t("분석 가능한 개선 후보가 없습니다.", "No retrofit candidates to analyze.")}
            <br />
            {t("자재 데이터가 아직 로드되지 않았을 수 있습니다.", "Material data may not have loaded yet.")}
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-border bg-muted/40">
        <div className="flex items-center justify-between text-[9px] text-muted-foreground">
          <span>{t("NPV 막대 · 최대값 대비", "NPV bar · vs max")}</span>
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-sm bg-cyan-600" />
              <span>{t("예산 내 선택", "In budget")}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-sm bg-emerald-500" />
              <span>{t("클릭하여 3D 적용", "Click to apply in 3D")}</span>
            </span>
          </span>
        </div>
        <p className="text-[9px] text-muted-foreground/70 mt-0.5">
          {t(
            "단가는 KICT 2024 기준 추정치로, 실제 입찰가와 다를 수 있습니다.",
            "Unit costs are KICT 2024 estimates and may differ from actual bids.",
          )}
        </p>
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
        "flex-1 flex flex-col items-center gap-0.5 py-2 px-1 border-r border-border last:border-r-0",
        "transition-colors text-[10px]",
        active
          ? "bg-muted text-foreground font-semibold"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span
        className="h-[2px] w-6 rounded-full transition-opacity"
        style={{ backgroundColor: accent, opacity: active ? 1 : 0.25 }}
      />
      <span className="whitespace-nowrap">{label}</span>
      <span className="text-[9px] tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}
