"use client";

/**
 * 재료 민감도 분석 — thickness sweeps and parameter ranking, every number
 * from an actual engine run (mission §8/§19). The sweeps are ephemeral
 * analyses over the CURRENT baseline: they never mutate the model, and the
 * panel states how many real runs produced what is displayed.
 */

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  rankParameterSensitivity,
  runThicknessSensitivity,
  type ParameterSensitivityResult,
  type ThicknessSensitivityResult,
} from "@/lib/energy-diagnostics/sensitivity";
import { assessStandards } from "@/lib/energy-diagnostics/standards-assessment";
import type { CanonicalEnergyModel } from "@/lib/energy-diagnostics/types";
import { cn } from "@/lib/utils";

import type { DiagnosisLocale } from "./types";

const numberFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });

export function SensitivityPanel({
  model,
  locale,
}: Readonly<{ model: CanonicalEnergyModel; locale: DiagnosisLocale }>) {
  const [sweep, setSweep] = useState<ThicknessSensitivityResult | null>(null);
  const [ranking, setRanking] = useState<ParameterSensitivityResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wallConstruction = useMemo(
    () =>
      model.envelope.constructions.find(
        (construction) =>
          construction.kind === "opaque" &&
          construction.layers.length > 0 &&
          model.geometry.surfaces.some(
            (surface) =>
              surface.constructionId.value === construction.id &&
              surface.type === "exterior_wall",
          ),
      ) ?? null,
    [model],
  );

  const wallTargetU = useMemo(() => {
    const assessment = assessStandards(model, null);
    return (
      assessment.uValueChecks.find((check) => check.element === "exterior_wall")?.check.limit
        .limitWPerM2K ?? undefined
    );
  }, [model]);

  const runSweep = () => {
    if (!wallConstruction) return;
    setRunning(true);
    setError(null);
    // Engine runs are synchronous and millisecond-scale; defer one frame so
    // the busy state paints first.
    setTimeout(() => {
      try {
        setSweep(
          runThicknessSensitivity(model, {
            constructionId: wallConstruction.id,
            targetU: wallTargetU,
          }),
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setRunning(false);
      }
    }, 0);
  };

  const runRanking = () => {
    setRunning(true);
    setError(null);
    setTimeout(() => {
      try {
        setRanking(rankParameterSensitivity(model));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setRunning(false);
      }
    }, 0);
  };

  const maxSaving = sweep
    ? Math.max(...sweep.points.map((point) => point.savingVsBaselineKwh), 1)
    : 1;
  const maxRankSaving = ranking
    ? Math.max(...ranking.ranked.map((entry) => entry.savingVsBaselineKwh), 1)
    : 1;

  return (
    <section className="mt-4 rounded-lg border bg-card p-4" data-testid="sensitivity-panel">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {locale === "ko" ? "재료 민감도 분석" : "Material sensitivity"}
      </p>
      <h2 className="mt-1 text-sm font-semibold">
        {locale === "ko"
          ? "어느 변수가 실제로 결과를 움직이는가"
          : "Which variables actually move the result"}
      </h2>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {locale === "ko"
          ? "모든 점은 실제 엔진 실행 결과입니다. 곡선 보간·추정치 없음. 기준안은 변경되지 않습니다."
          : "Every point is a real engine run. No interpolation, no estimates. The baseline is never modified."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={running || !wallConstruction}
          onClick={runSweep}
          data-testid="run-thickness-sensitivity"
        >
          {locale === "ko" ? "외벽 단열 두께 스윕 (100→250mm)" : "Wall insulation sweep (100→250mm)"}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={running}
          onClick={runRanking}
          data-testid="run-parameter-ranking"
        >
          {locale === "ko" ? "변수 민감도 순위 (각 10% 개선)" : "Parameter ranking (10% each)"}
        </Button>
        {running && (
          <span className="self-center text-[10px] text-muted-foreground">
            {locale === "ko" ? "엔진 실행 중…" : "Running engine…"}
          </span>
        )}
      </div>
      {error && (
        <p className="mt-2 rounded border border-rose-500/35 bg-rose-500/[0.06] p-2 text-[10px] text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}

      {sweep && (
        <div className="mt-4" data-testid="thickness-sweep-result">
          <p className="text-[10px] font-semibold">
            {locale === "ko"
              ? `${sweep.layerName} 두께 스윕 — 엔진 ${sweep.engineRunCount}회 실행`
              : `${sweep.layerName} sweep — ${sweep.engineRunCount} engine runs`}
          </p>
          <div className="mt-2 space-y-1">
            {sweep.points.map((point) => (
              <div key={point.thicknessMm} className="flex items-center gap-2">
                <span className="w-14 shrink-0 font-mono text-[10px]">{point.thicknessMm}mm</span>
                <span className="w-16 shrink-0 font-mono text-[9px] text-muted-foreground">
                  U {point.uValueWPerM2K.toFixed(3)}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted/40">
                  <div
                    className={cn(
                      "h-full rounded-sm",
                      sweep.diminishingReturnThicknessMm != null &&
                        point.thicknessMm >= sweep.diminishingReturnThicknessMm
                        ? "bg-muted-foreground/40"
                        : "bg-cyan-500/70",
                    )}
                    style={{
                      width: `${Math.max((point.savingVsBaselineKwh / maxSaving) * 100, 1)}%`,
                    }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right font-mono text-[10px]">
                  −{numberFormat.format(Math.max(point.savingVsBaselineKwh, 0))} kWh/yr
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">
            {sweep.diminishingReturnThicknessMm != null
              ? locale === "ko"
                ? `수확 체감 지점: 약 ${sweep.diminishingReturnThicknessMm}mm — 이후 추가 1mm의 절감 효과가 첫 구간의 20% 아래로 떨어집니다.`
                : `Diminishing-return point: ~${sweep.diminishingReturnThicknessMm}mm — beyond it each added mm saves less than 20% of the first step's rate.`
              : locale === "ko"
                ? "스윕 범위 안에서는 수확 체감 지점(첫 구간 대비 20% 미만)에 도달하지 않았습니다."
                : "The sweep did not reach the diminishing-return threshold in this range."}
            {sweep.complianceThicknessMm != null &&
              (locale === "ko"
                ? ` 별표1 상한 충족 두께: 약 ${sweep.complianceThicknessMm}mm.`
                : ` 별표1 ceiling met at ~${sweep.complianceThicknessMm}mm.`)}
          </p>
        </div>
      )}

      {ranking && (
        <div className="mt-4" data-testid="parameter-ranking-result">
          <p className="text-[10px] font-semibold">
            {locale === "ko"
              ? `변수 민감도 순위 — 엔진 ${ranking.engineRunCount}회 실행`
              : `Parameter ranking — ${ranking.engineRunCount} engine runs`}
          </p>
          <div className="mt-2 space-y-1">
            {ranking.ranked.map((entry, index) => (
              <div key={entry.path} className="flex items-center gap-2">
                <span className="w-4 shrink-0 text-center font-mono text-[10px] text-muted-foreground">
                  {index + 1}
                </span>
                <span className="w-48 shrink-0 truncate text-[10px]" title={entry.path}>
                  {entry.labelKo}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted/40">
                  <div
                    className="h-full rounded-sm bg-cyan-500/70"
                    style={{
                      width: `${Math.max((entry.savingVsBaselineKwh / maxRankSaving) * 100, 1)}%`,
                    }}
                  />
                </div>
                <span className="w-32 shrink-0 text-right font-mono text-[10px]">
                  −{numberFormat.format(Math.max(entry.savingVsBaselineKwh, 0))} kWh/yr (
                  {entry.savingPct.toFixed(1)}%)
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">{ranking.methodKo}</p>
        </div>
      )}
    </section>
  );
}
