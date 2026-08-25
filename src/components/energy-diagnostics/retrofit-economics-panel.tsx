"use client";

import { Landmark } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  DiagnosticsRetrofitAnalysis,
  ProgramTrack,
} from "@/lib/energy-diagnostics/retrofit-bridge";

import type { DiagnosisLocale } from "./types";

const TRACK_LABEL: Record<DiagnosisLocale, Record<ProgramTrack, string>> = {
  ko: {
    none: "지원 없음",
    "public-seoul-or-central": "그린리모델링 공공 (서울·중앙)",
    "public-local": "그린리모델링 공공 (지방)",
    "private-base": "그린리모델링 민간 기본",
    "private-tier2": "그린리모델링 민간 2단계",
    "private-high-perf": "그린리모델링 민간 고성능",
  },
  en: {
    none: "No subsidy",
    "public-seoul-or-central": "Green Remodeling public (Seoul/central)",
    "public-local": "Green Remodeling public (local)",
    "private-base": "Green Remodeling private base",
    "private-tier2": "Green Remodeling private tier 2",
    "private-high-perf": "Green Remodeling private high-performance",
  },
};

const CATEGORY_LABEL: Record<DiagnosisLocale, Record<string, string>> = {
  ko: { envelope: "외피", hvac: "설비", lighting: "조명", renewable: "신재생" },
  en: { envelope: "Envelope", hvac: "HVAC", lighting: "Lighting", renewable: "Renewable" },
};

const PROGRAM_TRACKS: readonly ProgramTrack[] = [
  "none",
  "public-seoul-or-central",
  "public-local",
  "private-base",
  "private-tier2",
  "private-high-perf",
];

function formatKrw(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e8) return `${sign}₩${(abs / 1e8).toFixed(1)}억`;
  if (abs >= 1e4) return `${sign}₩${Math.round(abs / 1e4).toLocaleString()}만`;
  return `${sign}₩${Math.round(abs).toLocaleString()}`;
}

/**
 * Screening retrofit economics anchored to the reviewed baseline run's exact
 * engine payload. Ranked by NPV; every approximation is disclosed inline.
 */
export function RetrofitEconomicsPanel({
  analysis,
  locale,
  programTrack,
  onProgramTrack,
}: Readonly<{
  analysis: DiagnosticsRetrofitAnalysis | null;
  locale: DiagnosisLocale;
  programTrack: ProgramTrack;
  onProgramTrack: (track: ProgramTrack) => void;
}>) {
  if (!analysis) return null;
  return (
    <section className="mt-4" data-testid="retrofit-economics">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {locale === "ko" ? "개보수 경제성 (스크리닝)" : "Retrofit economics (screening)"}
          </p>
          <h3 className="mt-1 text-sm font-semibold">
            {locale === "ko"
              ? "기준안 대비 투자 가치가 있는 조치"
              : "Measures worth their investment against this baseline"}
          </h3>
        </div>
        <label className="text-[10px] font-medium text-muted-foreground">
          {locale === "ko" ? "지원 트랙" : "Subsidy track"}
          <select
            value={programTrack}
            onChange={(event) => onProgramTrack(event.target.value as ProgramTrack)}
            className="ml-2 h-7 rounded-md border bg-background px-2 text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={locale === "ko" ? "그린리모델링 지원 트랙" : "Green Remodeling subsidy track"}
            data-testid="retrofit-program-track"
          >
            {PROGRAM_TRACKS.map((track) => (
              <option key={track} value={track}>
                {TRACK_LABEL[locale][track]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {analysis.measures.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
          {locale === "ko"
            ? "현재 모델의 성능이 이미 기준 목표를 충족해 추천할 개보수 조치가 없습니다."
            : "The model already meets the target performance levels; no retrofit measure applies."}
        </p>
      ) : (
        <ol className="space-y-2">
          {analysis.measures.map((measure) => {
            const positive = measure.financials.npv > 0;
            return (
              <li
                key={measure.id}
                className={cn(
                  "rounded-lg border bg-card p-3",
                  positive && "border-emerald-500/30",
                )}
                data-testid={`retrofit-measure-${measure.id}`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Landmark className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <p className="text-xs font-semibold">{measure.name}</p>
                  <Badge variant="outline" className="text-[8px]">
                    {CATEGORY_LABEL[locale][measure.category] ?? measure.category}
                  </Badge>
                  {!positive && (
                    <Badge variant="outline" className="text-[8px] text-muted-foreground">
                      {locale === "ko" ? "현 조건에서 비경제적" : "uneconomic under current terms"}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  {measure.description}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] sm:grid-cols-5">
                  <div>
                    <dt className="text-muted-foreground">{locale === "ko" ? "실투자비" : "Effective capex"}</dt>
                    <dd className="mt-0.5 font-mono font-semibold">{formatKrw(measure.financials.effectiveCapex)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{locale === "ko" ? "연간 절감" : "Annual saving"}</dt>
                    <dd className="mt-0.5 font-mono font-semibold">
                      {Math.round(measure.annualEnergySaving).toLocaleString()} kWh
                      <span className="ml-1 text-muted-foreground">{formatKrw(measure.annualCostSaving)}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">NPV</dt>
                    <dd className={cn("mt-0.5 font-mono font-semibold", positive ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>
                      {formatKrw(measure.financials.npv)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">IRR</dt>
                    <dd className="mt-0.5 font-mono font-semibold">
                      {measure.financials.irr == null ? "—" : `${(measure.financials.irr * 100).toFixed(1)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{locale === "ko" ? "할인 회수기간" : "Discounted payback"}</dt>
                    <dd className="mt-0.5 font-mono font-semibold">
                      {measure.discountedPaybackYears == null
                        ? locale === "ko" ? "회수 불가" : "never"
                        : `${measure.discountedPaybackYears.toFixed(1)}${locale === "ko" ? "년" : " yr"}`}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ol>
      )}
      <details className="mt-2 rounded-lg border bg-muted/15 p-2.5">
        <summary className="cursor-pointer text-[10px] font-semibold text-muted-foreground">
          {locale === "ko" ? "계산 전제 및 한계" : "Assumptions and limits of this estimate"}
        </summary>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[10px] leading-relaxed text-muted-foreground">
          {analysis.notes.map((note) => (
            <li key={note.en}>{locale === "ko" ? note.ko : note.en}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
