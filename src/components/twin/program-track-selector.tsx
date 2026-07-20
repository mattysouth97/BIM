"use client";

// src/components/twin/program-track-selector.tsx
// 그린리모델링 사업 track chip group (D₃, dossier §7 item 5). Sits directly
// under the scenario rail. Default "none" preserves the unsubsidised
// Phase A/B/C behavior; the four presets come from cost-database.ts.

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { ProgramTrack } from "@/lib/retrofit/cost-database";

interface ProgramTrackSelectorProps {
  value: ProgramTrack;
  onChange: (track: ProgramTrack) => void;
  /**
   * D₂.5 — private tier the current scenario's energy improvement
   * qualifies for. Renders a "추천" hint on that chip; never auto-switches
   * (tier eligibility has criteria we can't see: ownership, window grade,
   * household status).
   */
  suggestedTrack?: ProgramTrack;
}

// P2-06: bilingual catalog. Official 그린리모델링 program names carry an
// English gloss rather than a machine translation.
const TRACK_OPTIONS: {
  track: ProgramTrack;
  label: { ko: string; en: string };
  detail: { ko: string; en: string };
}[] = [
  { track: "none", label: { ko: "프로그램 없음", en: "No program" }, detail: { ko: "무보조", en: "Unsubsidised" } },
  { track: "public-seoul-or-central", label: { ko: "공공 서울·중앙", en: "Public · Seoul/central" }, detail: { ko: "CAPEX 50%", en: "CAPEX 50%" } },
  { track: "public-local", label: { ko: "공공 지자체", en: "Public · local gov" }, detail: { ko: "CAPEX 70%", en: "CAPEX 70%" } },
  { track: "private-base", label: { ko: "민간 기본", en: "Private · base" }, detail: { ko: "이자 4.5%p", en: "Rate −4.5%p" } },
  { track: "private-tier2", label: { ko: "민간 2단계", en: "Private · tier 2" }, detail: { ko: "이자 4.0%p", en: "Rate −4.0%p" } },
  { track: "private-high-perf", label: { ko: "민간 고성능", en: "Private · high-perf" }, detail: { ko: "이자 5.5%p", en: "Rate −5.5%p" } },
];

export function ProgramTrackSelector({ value, onChange, suggestedTrack }: ProgramTrackSelectorProps) {
  const { t, lang } = useT(); // P2-06
  return (
    <div
      className={cn(
        "pointer-events-auto absolute left-1/2 -translate-x-1/2 top-[76px] z-20",
        "flex items-center gap-1.5 px-2.5 py-1.5",
        "rounded-lg border border-border",
        "bg-card/95 backdrop-blur-md",
        "shadow-md",
        "select-none",
        "animate-[twin-slide-in_560ms_cubic-bezier(0.2,0.7,0.2,1)_both]",
      )}
      data-twin-track-selector
      role="radiogroup"
      aria-label={t("그린리모델링 지원 트랙", "Green Remodeling support track")}
    >
      <span className="text-[10px] font-medium text-muted-foreground pr-2 border-r border-border">
        {t("그린리모델링", "Green Remodeling")}
      </span>
      {TRACK_OPTIONS.map(({ track, label, detail }) => {
        const active = track === value;
        const suggested = track === suggestedTrack && !active;
        return (
          <button
            key={track}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(track)}
            className={cn(
              "flex flex-col items-start px-2 py-0.5 rounded-md transition-colors",
              active
                ? "bg-cyan-50 text-cyan-700 border border-cyan-300 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800"
                : "text-muted-foreground border border-transparent hover:text-foreground hover:bg-muted",
              suggested && "border-dashed border-emerald-400",
            )}
          >
            <span className="text-[10px] font-medium leading-tight whitespace-nowrap">
              {label[lang]}
              {suggested && (
                <span className="ml-1 text-[8px] font-semibold text-emerald-600">{t("추천", "Suggested")}</span>
              )}
            </span>
            <span
              className={cn(
                "text-[8px] tabular-nums leading-tight whitespace-nowrap",
                active ? "text-cyan-600 dark:text-cyan-400" : "text-muted-foreground/60",
              )}
            >
              {detail[lang]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
