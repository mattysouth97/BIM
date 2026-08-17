"use client";

// src/components/generative/review-panel.tsx
//
// "Why does the building look like this?" (brief §57).
//
// The explanation is generated from a digest of the model that actually exists,
// and the numbers that digest contained are shown alongside it. If the prose
// says circulation is 17%, the grounding block underneath says what circulation
// really is — so a claim can be checked without leaving the panel.
//
// This is an explanation, not an approval. Recommendations carry severities and
// no amount of positive commentary changes the design status badge.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EvaluationResult } from "@/lib/generative/client";

interface Props {
  review: EvaluationResult | null;
  busy: boolean;
  error: string | null;
  onRun: () => void;
  /** True when the design changed since this explanation was produced. */
  stale: boolean;
}

const SEVERITY_STYLE = {
  critical: "border-destructive/40 text-destructive",
  warning: "border-amber-500/40 text-amber-600",
  advisory: "border-border text-muted-foreground",
} as const;

export function ReviewPanel({ review, busy, error, onRun, stale }: Props) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Explanation
        </h3>
        <Button
          size="xs"
          variant="outline"
          className="ml-auto"
          onClick={onRun}
          disabled={busy}
        >
          {busy ? "Reading the model…" : review ? "Re-explain" : "Explain this building"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded border border-destructive/40 p-2 text-xs">
          {error}
        </p>
      )}

      {!review && !error && !busy && (
        <p className="text-xs text-muted-foreground">
          Ask why the building resolved the way it did. The answer is grounded in the
          generated model — floor count, areas, grid, core strategy, circulation and the
          outstanding issues — not in general architectural principles.
        </p>
      )}

      {review && (
        <>
          {stale && (
            <p className="rounded border border-amber-500/40 p-2 text-[11px] text-amber-600">
              The design has changed since this was written. Re-explain to describe the
              current building.
            </p>
          )}

          <ul className="flex flex-col gap-1.5 text-xs">
            {review.review.explanation.map((line, index) => (
              <li key={index} className="border-l-2 pl-2">
                {line}
              </li>
            ))}
          </ul>

          {review.review.recommendations.length > 0 && (
            <section>
              <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Recommendations ({review.review.recommendations.length})
              </h4>
              <ul className="mt-1 flex flex-col gap-2">
                {review.review.recommendations.map((recommendation, index) => (
                  <li
                    key={index}
                    className={cn(
                      "rounded border p-2",
                      SEVERITY_STYLE[recommendation.severity],
                    )}
                  >
                    <div className="flex items-baseline gap-2">
                      <Badge variant="outline" className="text-[9px] uppercase">
                        {recommendation.severity}
                      </Badge>
                      <span className="text-xs font-medium text-foreground">
                        {recommendation.title}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {recommendation.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Grounded in
            </h4>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 font-mono text-[10px]">
              {(
                [
                  ["Floors", String(review.grounding.floors)],
                  [
                    "Gross",
                    `${Math.round(review.grounding.grossAreaSqm).toLocaleString()} m²`,
                  ],
                  [
                    "Net",
                    `${Math.round(review.grounding.netAreaSqm).toLocaleString()} m²`,
                  ],
                  [
                    "Circulation",
                    `${(review.grounding.circulationRatio * 100).toFixed(1)}%`,
                  ],
                  ["Core", review.grounding.coreStrategy],
                  [
                    "Grid",
                    `${review.grounding.gridXMm} × ${review.grounding.gridZMm} mm`,
                  ],
                  ["Issues", String(review.grounding.violations)],
                  [
                    "Locked",
                    review.grounding.lockedSystems.length > 0
                      ? review.grounding.lockedSystems.join(", ")
                      : "none",
                  ],
                ] as Array<[string, string]>
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2 border-b py-0.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="truncate">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <p className="font-mono text-[10px] text-muted-foreground">
            {review.provider.name}
            {review.provider.model ? ` (${review.provider.model})` : ""} ·{" "}
            {(review.provider.latencyMs / 1000).toFixed(1)}s
          </p>
        </>
      )}
    </div>
  );
}
