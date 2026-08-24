import { AlertTriangle, CheckCircle2, FileSearch, Link2, MapPin, ShieldQuestion } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  CanonicalEnergyModel,
  ConflictRecord,
  EnergyFact,
  EvidenceStatus,
  SourceReference,
} from "@/lib/energy-diagnostics/types";

import { diagnosisCopy } from "./copy";
import type { DiagnosisLocale } from "./types";

const STATUS_LABEL: Record<DiagnosisLocale, Record<EvidenceStatus, string>> = {
  ko: {
    verified: "확인됨",
    user_confirmed: "사용자 확인",
    extracted: "추출됨",
    inferred: "추정됨",
    defaulted: "기본값",
    conflicted: "충돌",
    missing: "누락",
  },
  en: {
    verified: "Verified",
    user_confirmed: "User confirmed",
    extracted: "Extracted",
    inferred: "Inferred",
    defaulted: "Defaulted",
    conflicted: "Conflict",
    missing: "Missing",
  },
};

const ASSUMPTION_COPY = {
  ko: {
    title: "연결된 가정",
    reviewRequired: "검토 필요",
    confirmed: "확인됨",
    recordMissing: "가정 기록 누락",
    missingDetail: "이 값이 참조하는 가정 기록을 현재 모델에서 찾을 수 없습니다.",
    method: "방법",
    simulationImpact: "시뮬레이션 영향",
  },
  en: {
    title: "Linked assumption",
    reviewRequired: "Review required",
    confirmed: "Accepted",
    recordMissing: "Assumption record missing",
    missingDetail: "The current model does not contain the assumption record referenced by this value.",
    method: "Method",
    simulationImpact: "Simulation impact",
  },
} as const;

function formatValue(fact: EnergyFact<unknown>): string {
  if (fact.value == null) return "—";
  if (typeof fact.value === "number") {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(fact.value)}${fact.unit ? ` ${fact.unit}` : ""}`;
  }
  if (typeof fact.value === "boolean") return fact.value ? "true" : "false";
  if (Array.isArray(fact.value)) return `${fact.value.length} records`;
  return `${String(fact.value)}${fact.unit ? ` ${fact.unit}` : ""}`;
}

function statusClass(status: EvidenceStatus): string {
  if (status === "verified" || status === "user_confirmed") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "conflicted" || status === "defaulted" || status === "inferred") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (status === "missing") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }
  return "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300";
}

function conflictForFact(
  model: CanonicalEnergyModel,
  fact: EnergyFact<unknown>,
): ConflictRecord | null {
  return (
    model.conflicts.find(
      (conflict) =>
        conflict.key === fact.key ||
        conflict.candidates.some((candidate) => candidate.fact.id === fact.id),
    ) ?? null
  );
}

export function EvidenceInspector({
  model,
  fact,
  locale,
  onSelectDocument,
  onSelectSourceReference,
  onResolveConflict,
}: Readonly<{
  model: CanonicalEnergyModel;
  fact: EnergyFact<unknown> | null;
  locale: DiagnosisLocale;
  onSelectDocument: (documentId: string) => void;
  onSelectSourceReference: (sourceReference: SourceReference) => void;
  onResolveConflict: (conflictId: string, factId: string) => void;
}>) {
  const copy = diagnosisCopy(locale);
  if (!fact) {
    return (
      <aside className="flex h-full min-h-80 flex-col items-center justify-center border-l bg-card p-6 text-center" data-testid="evidence-inspector-empty">
        <span className="grid size-12 place-items-center rounded-full border bg-muted/40 text-muted-foreground">
          <ShieldQuestion className="size-5" aria-hidden="true" />
        </span>
        <h3 className="mt-4 text-sm font-semibold">{copy.exactSource}</h3>
        <p className="mt-2 max-w-56 text-xs leading-relaxed text-muted-foreground">{copy.selectEvidence}</p>
      </aside>
    );
  }

  const conflict = conflictForFact(model, fact);
  const effectiveStatus: EvidenceStatus = conflict && conflict.resolutionStatus !== "user_resolved"
    ? "conflicted"
    : fact.status;
  const source = fact.sourceRefs[0];
  const document = source
    ? model.drawingSet.documents.find((candidate) => candidate.id === source.documentId)
    : null;
  const assumption = fact.assumptionId
    ? model.assumptions.find((candidate) => candidate.id === fact.assumptionId)
    : null;
  const assumptionCopy = ASSUMPTION_COPY[locale];

  return (
    <aside className="flex h-full min-h-80 flex-col border-l bg-card" data-testid="evidence-inspector">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{copy.facts}</p>
          <Badge variant="outline" className={cn("font-mono text-[9px]", statusClass(effectiveStatus))}>
            {STATUS_LABEL[locale][effectiveStatus]}
          </Badge>
        </div>
        <h3 className="mt-2 break-words font-mono text-xs font-semibold leading-relaxed">{fact.key}</h3>
        <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{formatValue(fact)}</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{copy.exactSource}</p>
          {document && source ? (
            <button
              type="button"
              onClick={() => {
                onSelectDocument(document.id);
                onSelectSourceReference(source);
              }}
              className="mt-2 w-full rounded-lg border bg-background p-3 text-left transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-start gap-2">
                <FileSearch className="mt-0.5 size-4 shrink-0 text-cyan-600" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{document.fileName}</span>
                  <span className="mt-1 block font-mono text-[9px] text-muted-foreground">
                    {copy.revision} {source.drawingRevision} · {source.sheetId ?? `P${source.pageNumber ?? 1}`}
                    {source.cadLayer ? ` · ${source.cadLayer}` : ""}
                  </span>
                </span>
              </span>
              {source.originalText && (
                <span className="mt-3 block border-l-2 border-amber-400/70 pl-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  “{source.originalText}”
                </span>
              )}
            </button>
          ) : (
            <div className="mt-2 rounded-lg border border-dashed bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
              {copy.sourceMissing}
            </div>
          )}
        </section>

        {fact.assumptionId && (
          <section
            className="rounded-lg border border-amber-500/30 bg-amber-500/[0.05] p-3"
            data-testid="linked-assumption"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-amber-800 dark:text-amber-200">
                <ShieldQuestion className="size-3.5 shrink-0" aria-hidden="true" />
                {assumptionCopy.title}
              </p>
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 font-mono text-[9px]",
                  assumption
                    ? fact.reviewedByUser
                      ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    : "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300",
                )}
                data-testid="linked-assumption-status"
              >
                {assumption
                  ? fact.reviewedByUser
                    ? assumptionCopy.confirmed
                    : assumptionCopy.reviewRequired
                  : assumptionCopy.recordMissing}
              </Badge>
            </div>

            {assumption ? (
              <div className="mt-3">
                <p className="text-xs font-semibold leading-relaxed">{assumption.title}</p>
                <p className="mt-1 break-all font-mono text-[9px] text-muted-foreground">
                  {assumption.id}
                </p>
                <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                  {assumption.explanation}
                </p>
                <dl className="mt-3 space-y-2 border-t border-amber-500/20 pt-3 text-[10px]">
                  <div>
                    <dt className="font-semibold text-foreground">{assumptionCopy.method}</dt>
                    <dd className="mt-0.5 font-mono text-muted-foreground">{assumption.method}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">{assumptionCopy.simulationImpact}</dt>
                    <dd className="mt-0.5 leading-relaxed text-muted-foreground">
                      {assumption.simulationImpact}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="mt-3">
                <p className="break-all font-mono text-[9px] text-rose-700 dark:text-rose-300">
                  {fact.assumptionId}
                </p>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  {assumptionCopy.missingDetail}
                </p>
              </div>
            )}
          </section>
        )}

        <section className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border bg-muted/20 p-2.5">
            <span className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
              <CheckCircle2 className="size-3" /> {copy.confidence}
            </span>
            <p className="mt-1 font-mono text-xs font-semibold">{fact.confidence == null ? "—" : `${Math.round(fact.confidence * 100)}%`}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-2.5">
            <span className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
              <Link2 className="size-3" /> {copy.method}
            </span>
            <p className="mt-1 break-all font-mono text-[10px] font-semibold">{fact.extractionMethod}</p>
          </div>
        </section>

        {source?.boundingBox && (
          <section className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-3">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
              <MapPin className="size-3" /> {copy.sourceRegion}
            </p>
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">
              x {source.boundingBox.x} · y {source.boundingBox.y} · w {source.boundingBox.width} · h {source.boundingBox.height}
            </p>
          </section>
        )}

        {conflict && (
          <section className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3" data-testid="conflict-resolution-panel">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
              <AlertTriangle className="size-3.5" />
              {locale === "ko" ? "도면 간 값이 다릅니다" : "Drawing values disagree"}
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{conflict.downstreamImpact}</p>
            <div className="mt-3 space-y-2">
              {conflict.candidates.map((candidate) => {
                const selected = conflict.selectedFactId === candidate.fact.id;
                return (
                  <button
                    key={candidate.fact.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onResolveConflict(conflict.id, candidate.fact.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-2 text-left text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected && "border-amber-500/50",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block font-mono font-semibold">{formatValue(candidate.fact)}</span>
                      <span className="block truncate text-muted-foreground">{candidate.fact.sourceRefs[0]?.originalText ?? candidate.fact.authority}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[9px] text-muted-foreground">P{candidate.priority}</span>
                  </button>
                );
              })}
            </div>
            {conflict.resolutionStatus === "user_resolved" && (
              <p className="mt-2 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                {locale === "ko" ? "사용자 선택이 기록되었습니다." : "User selection recorded."}
              </p>
            )}
          </section>
        )}
      </div>

      {conflict && conflict.resolutionStatus !== "user_resolved" && conflict.selectedFactId && (
        <div className="border-t p-3">
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={() => onResolveConflict(conflict.id, conflict.selectedFactId!)}
          >
            {copy.confirmValue}
          </Button>
        </div>
      )}
    </aside>
  );
}
