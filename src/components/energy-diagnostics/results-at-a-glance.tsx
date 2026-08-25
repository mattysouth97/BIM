"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Box,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { DegreeDaySimulationRun } from "@/lib/energy-diagnostics/adapter";
import type { DiagnosticFinding } from "@/lib/energy-diagnostics/findings";
import type { EnergyScenario } from "@/lib/energy-diagnostics/types";

import type { DiagnosisLocale } from "./types";

const SEVERITY_ORDER: Record<DiagnosticFinding["severity"], number> = {
  blocking: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const SEVERITY_LABEL: Record<
  DiagnosisLocale,
  Record<DiagnosticFinding["severity"], string>
> = {
  en: {
    blocking: "Blocking",
    high: "High",
    medium: "Medium",
    low: "Low",
    info: "Info",
  },
  ko: {
    blocking: "차단",
    high: "높음",
    medium: "보통",
    low: "낮음",
    info: "참고",
  },
};

function numberFormatter(
  locale: DiagnosisLocale,
  value: number,
  maximumFractionDigits: number,
) {
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
    maximumFractionDigits,
  }).format(value);
}

function deltaPrecision(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude === 0 || magnitude >= 10) return 0;
  if (magnitude >= 1) return 1;
  return 3;
}

/**
 * A compact result summary that keeps the evidence-linked building view in the
 * first viewport. It derives everything from canonical runs and findings; it
 * owns no selection or scenario state.
 */
export function ResultsAtAGlance({
  baselineRun,
  scenarioRun,
  evaluatedScenario,
  scenarioIsPrior = false,
  findings,
  selectedFindingId,
  locale,
  onSelectFinding,
  canEvaluateFinding,
  onEvaluateFinding,
}: Readonly<{
  baselineRun: DegreeDaySimulationRun;
  scenarioRun: DegreeDaySimulationRun | null;
  evaluatedScenario?: EnergyScenario | null;
  scenarioIsPrior?: boolean;
  findings: readonly DiagnosticFinding[];
  selectedFindingId: string | null;
  locale: DiagnosisLocale;
  onSelectFinding: (finding: DiagnosticFinding) => void;
  canEvaluateFinding: (finding: DiagnosticFinding) => boolean;
  onEvaluateFinding: (finding: DiagnosticFinding) => void;
}>) {
  if (baselineRun.status !== "succeeded" || baselineRun.result == null) {
    return null;
  }

  const baseline = baselineRun.result;
  const scenario =
    scenarioRun?.status === "succeeded" ? scenarioRun.result : null;
  const comparisonIsPrior = Boolean(
    scenario && (scenarioIsPrior || !evaluatedScenario),
  );
  const ranked = [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const topFindings = ranked.slice(0, 3);
  const evaluableFinding = ranked.find((finding) =>
    canEvaluateFinding(finding),
  );
  const annualEnergy = numberFormatter(locale, baseline.annualEnergyKwh, 0);
  const eui = numberFormatter(
    locale,
    baseline.energyUseIntensityKwhPerM2,
    1,
  );

  const annualDelta = scenario
    ? scenario.annualEnergyKwh - baseline.annualEnergyKwh
    : null;
  const percentDelta =
    annualDelta != null && baseline.annualEnergyKwh > 0
      ? (annualDelta / baseline.annualEnergyKwh) * 100
      : null;

  return (
    <section
      className="border-b bg-card"
      aria-labelledby="results-at-a-glance-title"
      data-testid="results-at-a-glance"
    >
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-baseline gap-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">
            {locale === "ko" ? "에너지 진단 결과" : "Energy diagnostic results"}
          </p>
          <h2 id="results-at-a-glance-title" className="text-xs font-semibold">
            {locale === "ko" ? "결과 요약" : "Results at a glance"}
          </h2>
        </div>
        <span className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
          <Box className="size-3 text-cyan-600" aria-hidden="true" />
          {locale === "ko"
            ? "아래 건물에서 소견 위치 확인"
            : "Building diagnostic map below"}
        </span>
      </div>

      <div className="divide-y md:grid md:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.7fr)_minmax(12rem,0.8fr)] md:divide-x md:divide-y-0">
        <div className="px-3 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {locale === "ko" ? "전체 성능 · 기준안" : "Overall performance · baseline"}
          </p>
          <dl className="mt-1.5 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-[9px] text-muted-foreground">
                {locale === "ko" ? "연간 에너지" : "Annual energy"}
              </dt>
              <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums">
                {annualEnergy}
                <span className="ml-1 text-[9px] font-normal text-muted-foreground">
                  kWh/yr
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[9px] text-muted-foreground">EUI</dt>
              <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums">
                {eui}
                <span className="ml-1 text-[9px] font-normal text-muted-foreground">
                  kWh/m²·yr
                </span>
              </dd>
            </div>
          </dl>
        </div>

        <div className="min-w-0 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {locale === "ko" ? "주요 소견" : "Major findings"}
            </p>
            <span className="font-mono text-[9px] text-muted-foreground">
              {locale === "ko"
                ? `${topFindings.length}/${ranked.length}개 표시`
                : `${topFindings.length} of ${ranked.length}`}
            </span>
          </div>
          {topFindings.length > 0 ? (
            <ol
              className="mt-1.5 grid gap-1.5 sm:grid-cols-3"
              aria-label={locale === "ko" ? "우선순위 진단 소견" : "Prioritized diagnostic findings"}
            >
              {topFindings.map((finding, index) => {
                const selected = finding.id === selectedFindingId;
                return (
                  <li key={finding.id} className="min-w-0">
                    <button
                      type="button"
                      className={cn(
                        "flex h-full min-h-12 w-full items-start gap-2 rounded-md border bg-background px-2 py-1.5 text-left transition-colors hover:border-cyan-500/45 hover:bg-cyan-500/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected &&
                          "border-cyan-500/70 bg-cyan-500/[0.08] ring-1 ring-cyan-500/25",
                      )}
                      aria-pressed={selected}
                      aria-label={`${index + 1}. ${finding.title}. ${SEVERITY_LABEL[locale][finding.severity]}`}
                      onClick={() => onSelectFinding(finding)}
                      data-testid={`results-glance-finding-${finding.id}`}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border font-mono text-[8px]",
                          finding.severity === "blocking" &&
                            "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
                          finding.severity === "high" &&
                            "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                          (finding.severity === "medium" || finding.severity === "low") &&
                            "bg-muted/50 text-muted-foreground",
                          finding.severity === "info" &&
                            "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
                        )}
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-[10px] font-semibold leading-tight">
                          {finding.title}
                        </span>
                        <span className="mt-0.5 block text-[8px] text-muted-foreground">
                          {SEVERITY_LABEL[locale][finding.severity]}
                          {finding.confidence == null
                            ? ""
                            : ` · ${Math.round(finding.confidence * 100)}% ${locale === "ko" ? "신뢰도" : "confidence"}`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-2 text-[10px] text-muted-foreground">
              {locale === "ko"
                ? "현재 검증 결과에서 우선순위 소견이 생성되지 않았습니다."
                : "No prioritized findings were generated from this validated result."}
            </p>
          )}
        </div>

        <div className="px-3 py-2.5" data-testid="results-glance-improvement">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {scenario
              ? comparisonIsPrior
                ? locale === "ko"
                  ? "이전 평가 대안"
                  : "Prior evaluated alternative"
                : locale === "ko"
                  ? "평가된 대안"
                  : "Evaluated alternative"
              : locale === "ko"
                ? "개선 잠재력"
                : "Improvement potential"}
          </p>
          {scenario && annualDelta != null ? (
            <div className="mt-1.5">
              {comparisonIsPrior ? (
                <p
                  className="mb-1.5 flex items-start gap-1 rounded border border-amber-500/35 bg-amber-500/[0.08] px-1.5 py-1 text-[9px] font-medium leading-tight text-amber-800 dark:text-amber-200"
                  data-testid="results-glance-scenario-prior"
                  role="status"
                >
                  <AlertTriangle
                    className="mt-px size-3 shrink-0"
                    aria-hidden="true"
                  />
                  {locale === "ko"
                    ? "대안 초안이 변경되었습니다. 아래 값은 이전에 실행한 입력의 결과입니다."
                    : "Draft changed. This is the result of the prior evaluated input."}
                </p>
              ) : null}
              <p
                className="mb-1 truncate text-[9px] text-muted-foreground"
                data-testid="results-glance-evaluated-scenario"
                title={evaluatedScenario?.name}
              >
                {comparisonIsPrior
                  ? locale === "ko"
                    ? "이전 평가 입력"
                    : "Prior evaluated input"
                  : locale === "ko"
                    ? "평가 입력"
                    : "Evaluated input"}
                {" · "}
                {evaluatedScenario?.name ??
                  (locale === "ko"
                    ? "저장된 입력 기록을 사용할 수 없음"
                    : "Stored input record unavailable")}
              </p>
              <p
                className={cn(
                  "flex items-center gap-1 font-mono text-sm font-semibold tabular-nums",
                  annualDelta < 0 && "text-emerald-700 dark:text-emerald-300",
                  annualDelta > 0 && "text-amber-700 dark:text-amber-300",
                )}
                data-testid="results-glance-scenario-delta"
              >
                {annualDelta < 0 ? (
                  <ArrowDownRight className="size-3.5" aria-hidden="true" />
                ) : annualDelta > 0 ? (
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                ) : null}
                {percentDelta == null
                  ? locale === "ko"
                    ? "기준안 대비 비교"
                    : "Compared with baseline"
                  : annualDelta === 0
                    ? locale === "ko"
                      ? "연간 변화 없음"
                      : "No annual change"
                    : `${numberFormatter(locale, Math.abs(percentDelta), deltaPrecision(percentDelta))}% ${
                        annualDelta < 0
                          ? locale === "ko"
                            ? "감소"
                            : "lower"
                          : locale === "ko"
                            ? "증가"
                            : "higher"
                      }`}
              </p>
              <p className="mt-0.5 text-[9px] text-muted-foreground">
                {numberFormatter(locale, Math.abs(annualDelta), deltaPrecision(annualDelta))} kWh/yr{" "}
                {annualDelta < 0
                  ? locale === "ko"
                    ? "절감"
                    : "less"
                  : annualDelta > 0
                    ? locale === "ko"
                      ? "증가"
                      : "more"
                    : locale === "ko"
                      ? "차이"
                      : "difference"}
                {locale === "ko" ? " · 엔진 재실행 결과" : " · engine rerun"}
              </p>
            </div>
          ) : (
            <div className="mt-1.5">
              <p className="text-xs font-semibold">
                {locale === "ko" ? "아직 계산되지 않음" : "Not calculated yet"}
              </p>
              <p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">
                {evaluableFinding
                  ? locale === "ko"
                    ? "소견에서 대안을 실행하면 실제 영향을 비교합니다."
                    : "Run an alternative from a finding to compare its actual impact."
                  : locale === "ko"
                    ? "현재 소견에는 지원되는 대안 입력이 없습니다."
                    : "These findings do not expose a supported alternative input."}
              </p>
              {evaluableFinding ? (
                <button
                  type="button"
                  className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/[0.08] px-2 py-1 text-[9px] font-semibold text-cyan-800 transition-colors hover:bg-cyan-500/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-cyan-200"
                  onClick={() => onEvaluateFinding(evaluableFinding)}
                  data-testid="results-glance-evaluate"
                >
                  <Sparkles className="size-3" aria-hidden="true" />
                  {locale === "ko" ? "최우선 개선안 평가" : "Evaluate top opportunity"}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
