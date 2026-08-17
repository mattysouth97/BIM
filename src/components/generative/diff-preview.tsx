"use client";

// src/components/generative/diff-preview.tsx
//
// Review before commit (brief §55).
//
// The model is never changed without showing what changed. What this panel
// reports is measured from two real builds — the design on screen and the
// candidate the server produced — so it covers consequences the instruction
// never mentioned: a taller storey that pushed the building over a height, a
// wider plate that added 26 columns, a change that a lock partly blocked.
//
// Rejections are shown as prominently as changes. A lock that quietly ate half
// a patch and reported success would be worse than no lock at all.

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MetricDelta, SpecDiffEntry } from "@/lib/generative/patch/diff";
import type { ValidationReport } from "@/lib/generative/validate/rules";
import type { PendingChange, DesignState } from "@/store/generative-session-store";

const SPEC_ROWS_COLLAPSED = 8;
/**
 * Rejections shown before the list is summarised. A hard slice with no trailing
 * note was the failure this panel exists to prevent: the heading honestly said
 * "Blocked by locks (7)" while the seventh operation was unreachable anywhere
 * in the UI.
 */
const REJECTIONS_SHOWN = 6;

function RejectionList({
  entries,
}: {
  entries: Array<{ path: string; reason: string }>;
}) {
  const hidden = entries.length - REJECTIONS_SHOWN;
  return (
    <ul className="mt-1 flex flex-col gap-1 text-[11px]">
      {entries.slice(0, REJECTIONS_SHOWN).map((rejection, index) => (
        <li key={`${rejection.path}-${index}`}>
          <span className="font-mono text-muted-foreground">{rejection.path}</span> —{" "}
          {rejection.reason}
        </li>
      ))}
      {hidden > 0 && (
        <li className="text-muted-foreground">
          …and {hidden} more, all for the same reason.
        </li>
      )}
    </ul>
  );
}

function formatMetric(value: number, unit: MetricDelta["unit"]): string {
  switch (unit) {
    case "area":
      return `${Math.round(value).toLocaleString()} m²`;
    case "length":
      return `${value.toFixed(1)} m`;
    case "ratio":
      return `${(value * 100).toFixed(1)}%`;
    default:
      return Math.round(value).toLocaleString();
  }
}

function formatDelta(delta: MetricDelta): string {
  const sign = delta.delta > 0 ? "+" : "−";
  return `${sign}${formatMetric(Math.abs(delta.delta), delta.unit)}`;
}

/**
 * Which way is better, per metric. Colouring by sign alone reads a rising
 * circulation or core ratio — a less efficient plan — in the same green as
 * added floor area. Most metrics are neither good nor bad, and are left neutral
 * rather than being given a verdict the system has no basis for.
 */
const LOWER_IS_BETTER = new Set<MetricDelta["key"]>(["circulationRatio", "coreRatio"]);
const HIGHER_IS_BETTER = new Set<MetricDelta["key"]>(["netAreaSqm"]);

function deltaTone(delta: MetricDelta): string {
  const improved =
    (LOWER_IS_BETTER.has(delta.key) && delta.delta < 0) ||
    (HIGHER_IS_BETTER.has(delta.key) && delta.delta > 0);
  const worsened =
    (LOWER_IS_BETTER.has(delta.key) && delta.delta > 0) ||
    (HIGHER_IS_BETTER.has(delta.key) && delta.delta < 0);

  if (improved) return "text-emerald-600";
  if (worsened) return "text-amber-600";
  return "text-muted-foreground";
}

function IssueDelta({
  before,
  after,
}: {
  before: ValidationReport;
  after: ValidationReport;
}) {
  const rows: Array<[string, number, number]> = [
    ["critical", before.counts.critical, after.counts.critical],
    ["warning", before.counts.warning, after.counts.warning],
    ["advisory", before.counts.advisory, after.counts.advisory],
  ];
  const changed = rows.filter(([, a, b]) => a !== b);
  if (changed.length === 0) {
    return (
      <p className="font-mono text-[11px] text-muted-foreground">
        Validation unchanged — {after.counts.critical} critical ·{" "}
        {after.counts.warning} warning · {after.counts.advisory} advisory.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5 font-mono text-[11px]">
      {changed.map(([label, a, b]) => (
        <li key={label} className={cn(b > a ? "text-destructive" : "text-emerald-600")}>
          {label}: {a} → {b}
        </li>
      ))}
    </ul>
  );
}

function SpecRow({ entry }: { entry: SpecDiffEntry }) {
  return (
    <li className="flex flex-col gap-0.5 border-l-2 py-1 pl-2">
      <span className="text-[11px]">{entry.label || entry.path}</span>
      <span className="font-mono text-[11px] text-muted-foreground">
        {entry.beforeText} → <span className="text-foreground">{entry.afterText}</span>
      </span>
      {entry.sourceBefore && entry.sourceAfter && (
        <span className="font-mono text-[10px] uppercase text-muted-foreground">
          {entry.sourceBefore.replace("_", " ")} → {entry.sourceAfter.replace("_", " ")}
        </span>
      )}
    </li>
  );
}

interface Props {
  pending: PendingChange;
  before: DesignState;
  onAccept: () => void;
  onDiscard: () => void;
}

export function DiffPreview({ pending, before, onAccept, onDiscard }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { edit } = pending;

  const significant = edit.metricDeltas.filter((delta) => delta.significant);
  const specRows = expanded ? edit.diff : edit.diff.slice(0, SPEC_ROWS_COLLAPSED);
  const lockedRejections = edit.rejected.filter((r) => r.kind === "locked");
  const failedRejections = edit.rejected.filter((r) => r.kind === "path");
  const noChange = edit.diff.length === 0 && edit.metricDeltas.length === 0;

  return (
    <div className="pointer-events-auto flex max-h-[70vh] w-[380px] flex-col overflow-hidden rounded-lg border bg-background/95 shadow-lg backdrop-blur">
      <div className="flex items-start gap-2 border-b p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-[10px] uppercase">
              {pending.kind}
            </Badge>
            <h3 className="truncate text-sm font-medium">{edit.patch.summary}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{edit.patch.rationale}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto p-3">
        {noChange && (
          <p className="rounded border border-dashed p-2 text-xs text-muted-foreground">
            The patch applied cleanly but nothing about the building changed. Accepting
            it would add a history entry with no effect.
          </p>
        )}

        {edit.attempt !== undefined && (
          <section>
            <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Repair
            </h4>
            <p className="mt-1 font-mono text-[11px]">
              targeted {edit.targetedCodes?.length ?? 0} · resolved{" "}
              <span
                className={cn(
                  (edit.resolvedCodes?.length ?? 0) > 0
                    ? "text-emerald-600"
                    : "text-destructive",
                )}
              >
                {edit.resolvedCodes?.length ?? 0}
              </span>
              {" · attempt "}
              {edit.attempt}
            </p>
            {(edit.targetedCodes?.length ?? 0) > (edit.resolvedCodes?.length ?? 0) && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Unresolved:{" "}
                {(edit.targetedCodes ?? [])
                  .filter((code) => !(edit.resolvedCodes ?? []).includes(code))
                  .join(", ")}
              </p>
            )}
          </section>
        )}

        {significant.length > 0 && (
          <section>
            <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Measured effect
            </h4>
            <dl className="mt-1 flex flex-col gap-0.5 font-mono text-[11px]">
              {significant.map((delta) => (
                <div key={delta.key} className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted-foreground">{delta.label}</dt>
                  <dd>
                    {formatMetric(delta.before, delta.unit)} →{" "}
                    {formatMetric(delta.after, delta.unit)}{" "}
                    <span className={cn(deltaTone(delta))}>({formatDelta(delta)})</span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section>
          <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Validation
          </h4>
          <div className="mt-1">
            <IssueDelta before={before.validation} after={edit.validation} />
          </div>
        </section>

        {lockedRejections.length > 0 && (
          <section className="rounded border border-amber-500/40 p-2">
            <h4 className="text-[10px] font-medium uppercase tracking-wide text-amber-600">
              Blocked by locks ({lockedRejections.length})
            </h4>
            <RejectionList entries={lockedRejections} />
          </section>
        )}

        {failedRejections.length > 0 && (
          <section className="rounded border border-destructive/40 p-2">
            <h4 className="text-[10px] font-medium uppercase tracking-wide text-destructive">
              Could not be applied ({failedRejections.length})
            </h4>
            <RejectionList entries={failedRejections} />
          </section>
        )}

        {edit.diff.length > 0 && (
          <section>
            <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Specification ({edit.diff.length} change
              {edit.diff.length === 1 ? "" : "s"})
            </h4>
            <ul className="mt-1 flex flex-col">
              {specRows.map((entry) => (
                <SpecRow key={entry.path} entry={entry} />
              ))}
            </ul>
            {edit.diff.length > SPEC_ROWS_COLLAPSED && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 text-[11px] underline underline-offset-2"
              >
                {expanded
                  ? "Show less"
                  : `Show ${edit.diff.length - SPEC_ROWS_COLLAPSED} more`}
              </button>
            )}
          </section>
        )}
      </div>

      <div className="flex items-center gap-2 border-t p-3">
        <Button size="sm" onClick={onAccept} disabled={noChange}>
          Apply change
        </Button>
        <Button size="sm" variant="outline" onClick={onDiscard}>
          Discard
        </Button>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {edit.generationId}
        </span>
      </div>
    </div>
  );
}

/** Shown when a patch produced nothing applicable — locks, or a bad proposal. */
export function RejectionNotice({
  rejected,
  onDismiss,
}: {
  rejected: {
    patch: { summary: string; rationale: string };
    rejected: Array<{ path: string; reason: string; kind: "locked" | "path" }>;
    error: { code: string; message: string; detail?: string };
  };
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-auto w-[380px] rounded-lg border border-destructive/40 bg-background/95 p-3 shadow-lg backdrop-blur">
      <h3 className="text-sm font-medium">Nothing was changed</h3>
      <p className="mt-1 text-xs text-muted-foreground">{rejected.error.message}</p>
      <p className="mt-2 text-xs">
        <span className="font-medium">Proposed:</span> {rejected.patch.summary}
      </p>
      <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto text-[11px]">
        {rejected.rejected.slice(0, 8).map((entry, index) => (
          <li key={`${entry.path}-${index}`}>
            <Badge
              variant="outline"
              className="mr-1 font-mono text-[9px] uppercase"
            >
              {entry.kind}
            </Badge>
            <span className="font-mono text-muted-foreground">{entry.path}</span> —{" "}
            {entry.reason}
          </li>
        ))}
      </ul>
      <Button size="sm" variant="outline" className="mt-3" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}
