"use client";

// src/components/generative/issues-panel.tsx
//
// Outstanding validation issues, and the repair loop (brief §21, §22).
//
// Every issue here came from deterministic code — arithmetic and graph
// traversal over the generated model, not a judgement call. That is what makes
// "repair this" meaningful: the reasoning layer proposes a parametric fix, and
// the SAME validators decide whether it worked.
//
// Repairs are bounded. Three attempts, and then the remaining issues stay on
// screen as issues. A generative system that keeps trying until the list looks
// empty has learned to hide problems, not fix them.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConstraintViolation, ValidationReport } from "@/lib/generative/validate/rules";

interface Props {
  validation: ValidationReport;
  onRepair: (codes: string[]) => void;
  busy: boolean;
  /** Repair attempts already spent against the current design. */
  attempt: number;
  maxAttempts: number;
}

const SEVERITY_STYLE: Record<ConstraintViolation["severity"], string> = {
  critical: "text-destructive",
  warning: "text-amber-600",
  advisory: "text-muted-foreground",
};

export function IssuesPanel({
  validation,
  onRepair,
  busy,
  attempt,
  maxAttempts,
}: Props) {
  const { counts, violations } = validation;
  const repairable = violations.filter((v) => v.severity !== "advisory");
  const exhausted = attempt >= maxAttempts;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Issues
        </h3>
        <div className="ml-auto flex items-center gap-1 font-mono text-[10px]">
          <Badge
            variant={counts.critical > 0 ? "destructive" : "outline"}
            className="text-[9px]"
          >
            {counts.critical} critical
          </Badge>
          <Badge variant="outline" className="text-[9px]">
            {counts.warning} warning
          </Badge>
          <Badge variant="outline" className="text-[9px]">
            {counts.advisory} advisory
          </Badge>
        </div>
      </div>

      {violations.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Every deterministic geometry, hosting, spatial and program check passes.
          That is not a statement about code compliance.
        </p>
      ) : (
        <>
          {repairable.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy || exhausted}
                onClick={() => onRepair([])}
              >
                Repair {repairable.length} issue{repairable.length === 1 ? "" : "s"}
              </Button>
              <span className="font-mono text-[10px] text-muted-foreground">
                {exhausted
                  ? `${maxAttempts} attempts used`
                  : `attempt ${attempt + 1} of ${maxAttempts}`}
              </span>
            </div>
          )}

          <ul className="flex flex-col gap-2">
            {violations.map((violation, index) => (
              <li key={`${violation.code}-${index}`} className="border-l-2 pl-2">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "font-mono text-[10px] uppercase",
                      SEVERITY_STYLE[violation.severity],
                    )}
                  >
                    {violation.priority}
                  </span>
                  <span className="min-w-0 flex-1 text-xs">{violation.message}</span>
                  {violation.severity !== "advisory" && (
                    <button
                      type="button"
                      disabled={busy || exhausted}
                      onClick={() => onRepair([violation.code])}
                      // Each control sends a DIFFERENT code, so they cannot all
                      // be called "repair" — a list of identically-named buttons
                      // gives no way to tell which issue you are about to fix.
                      aria-label={`Repair ${violation.code}`}
                      className="shrink-0 text-[10px] underline underline-offset-2 disabled:opacity-40"
                    >
                      repair
                    </button>
                  )}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {violation.code}
                  {violation.floorNo !== undefined ? ` · level ${violation.floorNo}` : ""}
                  {violation.elementIds.length > 0
                    ? ` · ${violation.elementIds.length} element(s)`
                    : ""}
                </div>
                {violation.suggestion && (
                  <div className="text-[10px] text-muted-foreground">
                    {violation.suggestion}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
