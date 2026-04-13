"use client";

import React from "react";
import { defineStepper } from "@stepperize/react";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";
import { STAGE_ORDER, STAGE_LABELS } from "@/lib/workflow/stages";
import type { WorkflowStage } from "@/lib/workflow/stages";
import { useHydration } from "@/hooks/use-hydration";
import { cn } from "@/lib/utils";

// Define stepperize steps matching STAGE_ORDER
const { steps } = defineStepper(
  { id: "search", title: STAGE_LABELS.search.en },
  { id: "upload", title: STAGE_LABELS.upload.en },
  { id: "twin",   title: STAGE_LABELS.twin.en },
  { id: "report", title: STAGE_LABELS.report.en }
);

export function WorkflowStepper() {
  const hydrated = useHydration();

  const stage = useWorkflowStore((s) => s.stage);
  const completion = useWorkflowStore((s) => s.completion);

  // Until hydrated, render a placeholder strip to avoid SSR mismatch
  if (!hydrated) {
    return (
      <div className="h-10 flex items-center gap-1 px-4 border-b bg-background" />
    );
  }

  return (
    <div className="h-10 flex items-center gap-1 px-4 border-b bg-background shrink-0">
      {STAGE_ORDER.map((stageId: WorkflowStage, index) => {
        const isCompleted = completion[stageId];
        const isCurrent = stage === stageId;
        const isFuture = !isCurrent && !isCompleted;
        const step = steps.find((s) => s.id === stageId);
        const label = STAGE_LABELS[stageId].en;

        return (
          <React.Fragment key={stageId}>
            {/* Step button — always enabled (DAG model, no blocking) */}
            <button
              type="button"
              onClick={() => useWorkflowStore.getState().setStage(stageId)}
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                isCurrent && "bg-primary text-primary-foreground",
                isCompleted && !isCurrent && "text-green-600",
                isFuture && "text-muted-foreground"
              )}
              aria-current={isCurrent ? "step" : undefined}
              aria-label={`${label}${isCompleted ? " (completed)" : ""}${isCurrent ? " (current)" : ""}`}
              data-step={step?.id}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              ) : (
                <Circle
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isCurrent ? "text-primary-foreground" : "text-muted-foreground"
                  )}
                />
              )}
              <span>{label}</span>
            </button>

            {/* Chevron separator — not shown after last step */}
            {index < STAGE_ORDER.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
