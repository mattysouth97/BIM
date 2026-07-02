"use client";

// src/components/twin/program-track-selector.tsx
// 그린리모델링 사업 track chip group (D₃, dossier §7 item 5). Sits directly
// under the scenario rail. Default "none" preserves the unsubsidised
// Phase A/B/C behavior; the four presets come from cost-database.ts.

import { cn } from "@/lib/utils";
import type { ProgramTrack } from "@/lib/retrofit/cost-database";

interface ProgramTrackSelectorProps {
  value: ProgramTrack;
  onChange: (track: ProgramTrack) => void;
}

const TRACK_OPTIONS: { track: ProgramTrack; label: string; detail: string }[] = [
  { track: "none", label: "프로그램 없음", detail: "무보조" },
  { track: "public-seoul-or-central", label: "공공 서울·중앙", detail: "CAPEX 50%" },
  { track: "public-local", label: "공공 지자체", detail: "CAPEX 70%" },
  { track: "private-base", label: "민간 기본", detail: "이자 4.5%p" },
  { track: "private-high-perf", label: "민간 고성능", detail: "이자 5.5%p" },
];

export function ProgramTrackSelector({ value, onChange }: ProgramTrackSelectorProps) {
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
      aria-label="그린리모델링 지원 트랙"
    >
      <span className="text-[10px] font-medium text-muted-foreground pr-2 border-r border-border">
        그린리모델링
      </span>
      {TRACK_OPTIONS.map(({ track, label, detail }) => {
        const active = track === value;
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
            )}
          >
            <span className="text-[10px] font-medium leading-tight whitespace-nowrap">
              {label}
            </span>
            <span
              className={cn(
                "text-[8px] tabular-nums leading-tight whitespace-nowrap",
                active ? "text-cyan-600 dark:text-cyan-400" : "text-muted-foreground/60",
              )}
            >
              {detail}
            </span>
          </button>
        );
      })}
    </div>
  );
}
