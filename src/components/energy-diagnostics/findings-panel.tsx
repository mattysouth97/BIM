"use client";

import { AlertCircle, AlertTriangle, Info, TrendingDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DiagnosticFinding } from "@/lib/energy-diagnostics/findings";
import type { CanonicalEnergyModel, EnergyFact } from "@/lib/energy-diagnostics/types";

import type { DiagnosisLocale } from "./types";

const SEVERITY_ORDER: Record<DiagnosticFinding["severity"], number> = {
  blocking: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const SEVERITY_LABEL: Record<DiagnosisLocale, Record<DiagnosticFinding["severity"], string>> = {
  ko: {
    blocking: "차단",
    high: "핵심",
    medium: "보통",
    low: "낮음",
    info: "참고",
  },
  en: {
    blocking: "Blocking",
    high: "Critical",
    medium: "Medium",
    low: "Low",
    info: "Info",
  },
};

function severityIcon(severity: DiagnosticFinding["severity"]) {
  if (severity === "blocking") return AlertCircle;
  if (severity === "high") return AlertTriangle;
  if (severity === "info") return Info;
  return TrendingDown;
}

/**
 * Ranked, evidence-linked diagnostic findings for the selected run. Only
 * validation- or real-result-backed findings reach this list.
 */
export function FindingsPanel({
  findings,
  model,
  locale,
  onSelectFact,
}: Readonly<{
  findings: readonly DiagnosticFinding[];
  model: CanonicalEnergyModel;
  locale: DiagnosisLocale;
  onSelectFact: (fact: EnergyFact<unknown>) => void;
}>) {
  if (findings.length === 0) return null;
  const ranked = [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  return (
    <section className="mt-4" data-testid="diagnostic-findings">
      <div className="mb-2 flex items-end justify-between">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {locale === "ko" ? "진단 소견" : "Diagnostic findings"}
          </p>
          <h3 className="mt-1 text-sm font-semibold">
            {locale === "ko"
              ? "무엇이 에너지 성능을 좌우하는가"
              : "What drives this building's energy performance"}
          </h3>
        </div>
        <Badge variant="outline" className="font-mono text-[9px]">
          {ranked.length}
        </Badge>
      </div>
      <ol className="space-y-2">
        {ranked.map((finding, index) => {
          const Icon = severityIcon(finding.severity);
          return (
            <li
              key={finding.id}
              className={cn(
                "rounded-lg border bg-card p-3",
                finding.severity === "blocking" && "border-rose-500/40",
                finding.severity === "high" && "border-amber-500/45",
              )}
              data-testid={`finding-${finding.id}`}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[10px]",
                    finding.severity === "blocking" &&
                      "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
                    finding.severity === "high" &&
                      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                    (finding.severity === "medium" || finding.severity === "low") &&
                      "border-border bg-muted/40 text-muted-foreground",
                    finding.severity === "info" &&
                      "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
                  )}
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-xs font-semibold">{finding.title}</p>
                    <Badge variant="outline" className="text-[8px]">
                      <Icon className="mr-0.5 size-2.5" aria-hidden="true" />
                      {SEVERITY_LABEL[locale][finding.severity]}
                    </Badge>
                    {!finding.impactSimulated && (
                      <Badge variant="outline" className="text-[8px] text-muted-foreground">
                        {locale === "ko" ? "정보성" : "informational"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                    {finding.explanation}
                  </p>
                  {finding.evidence.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {finding.evidence.map((item) => {
                        const fact = item.sourceFactIds
                          .map((id) => model.facts.find((candidate) => candidate.id === id))
                          .find((candidate) => candidate != null);
                        const content = (
                          <>
                            <span className="text-muted-foreground">{item.label}</span>
                            <span className="ml-1.5 font-mono font-semibold">
                              {item.value}
                              {item.unit ? ` ${item.unit}` : ""}
                            </span>
                          </>
                        );
                        return fact ? (
                          <button
                            key={`${finding.id}:${item.label}`}
                            type="button"
                            onClick={() => onSelectFact(fact)}
                            className="rounded border bg-muted/25 px-2 py-1 text-[9px] transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {content}
                          </button>
                        ) : (
                          <span
                            key={`${finding.id}:${item.label}`}
                            className="rounded border bg-muted/25 px-2 py-1 text-[9px]"
                          >
                            {content}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <p className="mt-2 border-l-2 border-cyan-500/50 pl-2 text-[10px] leading-relaxed">
                    <span className="font-semibold">
                      {locale === "ko" ? "권장 조치: " : "Recommended action: "}
                    </span>
                    {finding.recommendedDesignAction}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
