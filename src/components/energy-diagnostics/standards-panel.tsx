"use client";

/**
 * 계산 기준·법규 검토 — the regulatory context of a diagnostic result.
 *
 * Shows (1) exactly which 기준/버전 and engine produced the numbers on
 * screen, (2) each envelope assembly against its 별표1 열관류율 ceiling,
 * (3) the result hierarchy 소요량 → 1차에너지, and (4) where the primary
 * figure would sit on the ZEB reference table — always with the 참고용
 * disclaimer. Nothing here claims certification (mission §11/§17/§20).
 */

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import type { DegreeDaySimulationRun } from "@/lib/energy-diagnostics/adapter";
import { assessStandards } from "@/lib/energy-diagnostics/standards-assessment";
import type { CanonicalEnergyModel, EnergyFact } from "@/lib/energy-diagnostics/types";
import { cn } from "@/lib/utils";

import type { DiagnosisLocale } from "./types";

const numberFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });

export function StandardsPanel({
  model,
  run,
  locale,
  onSelectFactId,
}: Readonly<{
  model: CanonicalEnergyModel;
  run: DegreeDaySimulationRun | null;
  locale: DiagnosisLocale;
  onSelectFactId: (factId: string) => void;
}>) {
  const assessment = useMemo(() => assessStandards(model, run), [model, run]);
  const primary = run?.result?.primary ?? null;
  const endUse = run?.result?.annualByEndUseKwh ?? null;
  const demandKwh = endUse ? (endUse.heating ?? 0) + (endUse.cooling ?? 0) : null;

  return (
    <section className="mt-4 rounded-lg border bg-card p-4" data-testid="standards-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {locale === "ko" ? "계산 기준 · 법규 검토" : "Calculation basis · regulatory review"}
          </p>
          <h2 className="mt-1 text-sm font-semibold">
            {locale === "ko"
              ? "이 화면의 숫자가 따르는 기준"
              : "The standards behind the numbers on this screen"}
          </h2>
        </div>
        <Badge variant="outline" className="font-mono text-[9px]" data-testid="calc-basis-engine">
          {assessment.calcBasis.engineId}@{assessment.calcBasis.engineVersion}
        </Badge>
      </div>

      {/* 기준 버전 */}
      <ul className="mt-3 space-y-1" data-testid="calc-basis-standards">
        {assessment.calcBasis.standards.map((standard) => (
          <li key={standard.id} className="flex flex-wrap items-baseline gap-x-2 text-[10px]">
            <span className="font-semibold">{standard.nameKo}</span>
            <span className="font-mono text-muted-foreground">{standard.version}</span>
          </li>
        ))}
        {assessment.calcBasis.inputHash && (
          <li className="text-[9px] font-mono text-muted-foreground">
            input {assessment.calcBasis.inputHash.slice(0, 16)}… · adapter{" "}
            {assessment.calcBasis.adapterVersion}
          </li>
        )}
      </ul>

      {/* Result hierarchy: 소요량 → 1차에너지 */}
      {run?.result && (
        <div className="mt-4 grid gap-2 sm:grid-cols-3" data-testid="result-hierarchy">
          <div className="rounded border bg-muted/20 p-2.5">
            <p className="text-[9px] text-muted-foreground">
              {locale === "ko" ? "① 냉난방 소요 (부위별 열손실 기반)" : "① Heating+cooling site energy"}
            </p>
            <p className="mt-1 font-mono text-xs font-semibold">
              {demandKwh != null ? `${numberFormat.format(demandKwh)} kWh/yr` : "—"}
            </p>
          </div>
          <div className="rounded border bg-muted/20 p-2.5">
            <p className="text-[9px] text-muted-foreground">
              {locale === "ko" ? "② 전체 소요량 (조명·급탕·기기: 비율 추정)" : "② Total delivered (ratios)"}
            </p>
            <p className="mt-1 font-mono text-xs font-semibold">
              {numberFormat.format(run.result.annualEnergyKwh)} kWh/yr
            </p>
          </div>
          <div className="rounded border bg-cyan-500/[0.06] p-2.5" data-testid="primary-energy-tile">
            <p className="text-[9px] text-muted-foreground">
              {locale === "ko" ? "③ 1차에너지 환산" : "③ Primary energy"}
            </p>
            <p className="mt-1 font-mono text-xs font-semibold">
              {primary
                ? `${numberFormat.format(primary.totalKwh)} kWh/yr · ${primary.perM2Kwh.toFixed(1)} kWh/m²·yr`
                : "—"}
            </p>
          </div>
        </div>
      )}
      {primary && (
        <p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground">{primary.basis}</p>
      )}

      {/* 별표1 compliance */}
      {assessment.region && assessment.uValueChecks.length > 0 && (
        <div className="mt-4" data-testid="u-value-compliance">
          <p className="text-[10px] font-semibold">
            {locale === "ko"
              ? `별표1 열관류율 검토 — ${assessment.region.labelKo}`
              : `별표1 U-value review — ${assessment.region.labelKo}`}
            {assessment.region.regionBasis !== "sido" && (
              <span className="ml-1.5 font-normal text-amber-600 dark:text-amber-400">
                {locale === "ko"
                  ? "(지역 판별: 주소 기반 — 확인 필요)"
                  : "(region from address — verify)"}
              </span>
            )}
          </p>
          <div className="mt-1.5 overflow-x-auto">
            <table className="w-full min-w-[460px] text-left text-[10px]">
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">{locale === "ko" ? "부위" : "Element"}</th>
                  <th className="py-1.5 pr-2 font-medium">{locale === "ko" ? "현재 U" : "Actual U"}</th>
                  <th className="py-1.5 pr-2 font-medium">{locale === "ko" ? "법정 상한" : "Ceiling"}</th>
                  <th className="py-1.5 font-medium">{locale === "ko" ? "판정" : "Verdict"}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {assessment.uValueChecks.map((row) => (
                  <tr key={row.constructionId} data-testid={`compliance-${row.constructionId}`}>
                    <td className="py-1.5 pr-2">
                      <button
                        type="button"
                        className="font-medium underline-offset-2 hover:underline"
                        onClick={() => onSelectFactId(row.uValueFactId)}
                        title={row.check.limit.rowKo}
                      >
                        {row.elementKo} · {row.constructionName}
                      </button>
                    </td>
                    <td className="py-1.5 pr-2 font-mono">{row.check.actualWPerM2K.toFixed(3)}</td>
                    <td className="py-1.5 pr-2 font-mono">{row.check.limit.limitWPerM2K.toFixed(3)}</td>
                    <td className="py-1.5">
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[9px] font-semibold",
                          row.check.compliant
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
                        )}
                      >
                        {row.check.compliant
                          ? locale === "ko" ? "충족" : "PASS"
                          : locale === "ko"
                            ? `초과 +${Math.abs(row.check.marginWPerM2K).toFixed(2)}`
                            : `FAIL +${Math.abs(row.check.marginWPerM2K).toFixed(2)}`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[9px] text-muted-foreground">
            {locale === "ko"
              ? "현행 기준(신축 설계 기준)과의 비교입니다. 기존 건축물에 소급 적용되는 의무가 아니라 개선 여지의 지표로 읽어야 합니다."
              : "Compared against the CURRENT new-construction standard — an improvement indicator for an existing building, not a retroactive obligation."}
          </p>
        </div>
      )}

      {/* ZEB reference */}
      {assessment.zebReference && (
        <div
          className="mt-4 rounded border border-dashed p-2.5"
          data-testid="zeb-reference"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold">
              {locale === "ko" ? "ZEB 등급표 참고 위치" : "ZEB table reference position"}
            </span>
            <Badge variant="outline" className="font-mono text-[9px]">
              {assessment.zebReference.gradeLabelKo}
            </Badge>
            <span className="font-mono text-[10px] text-muted-foreground">
              1차E {assessment.zebReference.primaryPerM2Kwh.toFixed(1)} kWh/m²·yr ·{" "}
              {assessment.residential ? "주거" : "비주거"}
            </span>
          </div>
          <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
            {assessment.zebReference.disclaimerKo}
          </p>
        </div>
      )}
    </section>
  );
}

/** Resolve a fact id back to the fact object for the evidence inspector. */
export function factById(
  model: CanonicalEnergyModel,
  factId: string,
): EnergyFact<unknown> | null {
  return model.facts.find((fact) => fact.id === factId) ?? null;
}
