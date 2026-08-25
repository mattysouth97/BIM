import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  CircleSlash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  CanonicalSimulationResult,
  EnergyScenario,
} from "@/lib/energy-diagnostics/types";

import { diagnosisCopy } from "./copy";
import type { DiagnosisLocale } from "./types";

const RESULT_ROWS = [
  ["annualEnergyKwh", "annualEnergy"],
  ["energyUseIntensityKwhPerM2", "eui"],
] as const;

export type ResultMetric = (typeof RESULT_ROWS)[number][0];

function format(value: number, unit: string): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

function formatDelta(value: number, unit: string): string {
  return `${new Intl.NumberFormat(undefined, {
    maximumSignificantDigits: 3,
  }).format(Math.abs(value))} ${unit}`;
}

function EndUseBar({
  label,
  value,
  maximum,
  tone,
  method,
  testId,
}: Readonly<{
  label: string;
  value: number;
  maximum: number;
  tone: string;
  method?: string;
  testId: string;
}>) {
  const width = maximum > 0 ? Math.max(2, (value / maximum) * 100) : 0;
  return (
    <div
      className="grid grid-cols-[minmax(7.5rem,9rem)_1fr_6.5rem] items-center gap-2 text-[10px]"
      data-testid={testId}
    >
      <span className="min-w-0 text-muted-foreground">
        <span className="block truncate">{label}</span>
        {method ? (
          <span className="mt-0.5 block text-[9px] font-medium text-foreground">
            {method}
          </span>
        ) : null}
      </span>
      <span
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${label}: ${format(value, "kWh/yr")}${method ? `; ${method}` : ""}`}
      >
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${width}%` }} />
      </span>
      <span className="text-right font-mono tabular-nums">{format(value, "kWh/yr")}</span>
    </div>
  );
}

export function ResultComparison({
  baseline,
  scenario,
  evaluatedScenario,
  scenarioIsPrior = false,
  locale,
  baselineRunId,
  scenarioRunId,
  onSelectResult,
}: Readonly<{
  baseline: CanonicalSimulationResult | null;
  scenario: CanonicalSimulationResult | null;
  evaluatedScenario?: EnergyScenario | null;
  scenarioIsPrior?: boolean;
  locale: DiagnosisLocale;
  baselineRunId?: string | null;
  scenarioRunId?: string | null;
  onSelectResult?: (runId: string, metric: ResultMetric) => void;
}>) {
  const copy = diagnosisCopy(locale);
  if (!baseline) {
    return (
      <div className="grid min-h-56 place-items-center rounded-lg border border-dashed bg-muted/15 p-8 text-center" data-testid="comparison-empty">
        <div>
          <CircleSlash2 className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">{copy.compareEmpty}</p>
          <p className="mt-1 text-xs text-muted-foreground">{copy.noFabrication}</p>
        </div>
      </div>
    );
  }

  const comparisonIsPrior = Boolean(
    scenario && (scenarioIsPrior || !evaluatedScenario),
  );
  const scenarioColumnLabel = comparisonIsPrior
    ? locale === "ko"
      ? "이전 대안"
      : "Prior alternative"
    : copy.alternative;

  const maxEndUse = Math.max(
    ...Object.values(baseline.annualByEndUseKwh),
    ...(scenario ? Object.values(scenario.annualByEndUseKwh) : []),
    1,
  );
  const endUses = [
    ["heating", copy.heating, "bg-rose-500", undefined],
    ["cooling", copy.cooling, "bg-cyan-500", undefined],
    ["lighting", copy.lighting, "bg-amber-400", copy.ratioEstimated],
    ["equipment", copy.equipment, "bg-slate-500", copy.ratioEstimated],
  ] as const;

  return (
    <section className="overflow-hidden rounded-lg border bg-card" data-testid="result-comparison">
      {scenario ? (
        <div
          className={cn(
            "flex items-start gap-2 border-b px-3 py-2 text-[10px] leading-relaxed",
            comparisonIsPrior
              ? "border-amber-500/30 bg-amber-500/[0.08] text-amber-900 dark:text-amber-100"
              : "border-cyan-500/25 bg-cyan-500/[0.05] text-muted-foreground",
          )}
          data-testid={
            comparisonIsPrior
              ? "comparison-scenario-prior"
              : "comparison-scenario-current"
          }
          data-state={comparisonIsPrior ? "prior" : "current"}
        >
          {comparisonIsPrior ? (
            <AlertTriangle
              className="mt-0.5 size-3.5 shrink-0 text-amber-700 dark:text-amber-300"
              aria-hidden="true"
            />
          ) : null}
          <p>
            <span className="font-semibold">
              {comparisonIsPrior
                ? locale === "ko"
                  ? "대안 초안이 변경되어 이전 실행 결과를 표시합니다."
                  : "The alternative draft changed; this comparison shows the prior run."
                : locale === "ko"
                  ? "현재 대안 초안과 일치하는 실행 결과입니다."
                  : "This run matches the current alternative draft."}
            </span>{" "}
            <span data-testid="comparison-evaluated-scenario">
              {locale === "ko" ? "평가 입력" : "Evaluated input"}: {" "}
              {evaluatedScenario?.name ??
                (locale === "ko"
                  ? "저장된 입력 기록을 사용할 수 없음"
                  : "stored input record unavailable")}
            </span>
          </p>
        </div>
      ) : null}
      <div className="grid grid-cols-[1.15fr_1fr_1fr] border-b bg-muted/20 text-xs">
        <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
          {locale === "ko" ? "실제 엔진 결과" : "Real engine result"}
        </div>
        <div className="border-l px-3 py-2 font-semibold">{copy.baseline}</div>
        <div className="border-l px-3 py-2 font-semibold">{scenario ? scenarioColumnLabel : "—"}</div>
      </div>
      {RESULT_ROWS.map(([key, label]) => {
        const unit = key === "annualEnergyKwh" ? "kWh/yr" : "kWh/m²·yr";
        const baselineValue = baseline[key];
        const scenarioValue = scenario?.[key] ?? null;
        const delta = scenarioValue == null ? null : scenarioValue - baselineValue;
        return (
          <div key={key} className="grid grid-cols-[1.15fr_1fr_1fr] border-b last:border-b-0">
            <div className="px-3 py-3 text-xs text-muted-foreground">{copy[label]}</div>
            <button
              type="button"
              disabled={!baselineRunId || !onSelectResult}
              onClick={() =>
                baselineRunId && onSelectResult?.(baselineRunId, key)
              }
              aria-label={`${copy.baseline} ${copy[label]}`}
              className="border-l px-3 py-3 text-left font-mono text-xs font-semibold tabular-nums transition-colors enabled:hover:bg-cyan-500/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default"
              data-testid={`result-${key}-baseline`}
            >
              {format(baselineValue, unit)}
            </button>
            <button
              type="button"
              disabled={!scenarioRunId || !onSelectResult}
              onClick={() =>
                scenarioRunId && onSelectResult?.(scenarioRunId, key)
              }
              aria-label={`${scenarioColumnLabel} ${copy[label]}`}
              className="border-l px-3 py-3 text-left font-mono text-xs font-semibold tabular-nums transition-colors enabled:hover:bg-cyan-500/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default"
              data-testid={`result-${key}-scenario`}
            >
              {scenarioValue == null ? "—" : format(scenarioValue, unit)}
              {delta != null && (
                <span className={cn("ml-2 inline-flex items-center gap-0.5 text-[9px]", delta < 0 ? "text-emerald-600" : "text-amber-600")}>
                  {delta < 0 ? <ArrowDownRight className="size-3" /> : <ArrowRight className="size-3" />}
                  {formatDelta(delta, unit)}
                </span>
              )}
            </button>
          </div>
        );
      })}
      <div className="border-t bg-muted/10 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
          {copy.annualEndUses}
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          {copy.endUseMethod}
        </p>
      </div>
      <div className="grid gap-4 border-t p-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{copy.baseline}</p>
          {endUses.map(([key, label, tone, method]) => (
            <EndUseBar
              key={key}
              label={label}
              value={baseline.annualByEndUseKwh[key] ?? 0}
              maximum={maxEndUse}
              tone={tone}
              method={method}
              testId={`end-use-baseline-${key}`}
            />
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{scenarioColumnLabel}</p>
          {scenario ? endUses.map(([key, label, tone, method]) => (
            <EndUseBar
              key={key}
              label={label}
              value={scenario.annualByEndUseKwh[key] ?? 0}
              maximum={maxEndUse}
              tone={tone}
              method={method}
              testId={`end-use-scenario-${key}`}
            />
          )) : <p className="text-xs text-muted-foreground">{copy.scenarioHelp}</p>}
        </div>
      </div>
      <div className="border-t bg-amber-500/[0.05] px-4 py-2 text-[10px] leading-relaxed text-muted-foreground">
        {copy.unsupportedTemporal} {copy.areaApportioned}
      </div>
    </section>
  );
}
