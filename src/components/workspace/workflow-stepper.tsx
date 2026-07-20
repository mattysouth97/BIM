"use client";

import React, { useMemo } from "react";
import { defineStepper } from "@stepperize/react";
import { CheckCircle2, Circle, Lock, ChevronRight } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";
import {
  STAGE_ORDER,
  STAGE_LABELS,
  STAGE_LOCK_REASONS,
  getBlockingStage,
  type StageGuardContext,
} from "@/lib/workflow/stages";
import type { WorkflowStage } from "@/lib/workflow/stages";
import { useHydration } from "@/hooks/use-hydration";
import { useActiveBuildingPk } from "@/hooks/use-active-building-pk";
import { useRecipeStore } from "@/store/recipe-store";
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

  // P1-08 (b): build the guard context from the recipe store for the ACTIVE
  // building — same footprintPolygon override upload-stage.tsx commits.
  const buildingPk = useActiveBuildingPk();
  const overrides = useRecipeStore((s) => s.overrides[buildingPk]);
  const guardCtx = useMemo<StageGuardContext>(
    () => ({ footprintPolygon: overrides?.footprintPolygon }),
    [overrides]
  );

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
        const step = steps.find((s) => s.id === stageId);
        const label = STAGE_LABELS[stageId].en;

        // Guard-aware lock state: forward jumps are blocked by the first
        // failing intermediate guard; backward/self moves are never locked.
        const blockingStage = getBlockingStage(stage, stageId, guardCtx);
        const isLocked = blockingStage !== null;
        const lockReason = isLocked ? STAGE_LOCK_REASONS[blockingStage] : undefined;
        const lockTitle = lockReason ? `${lockReason.ko} / ${lockReason.en}` : undefined;
        const isFuture = !isCurrent && !isCompleted;

        return (
          <React.Fragment key={stageId}>
            {/* Step button — locked stages are disabled and explain why */}
            <button
              type="button"
              disabled={isLocked}
              title={lockTitle}
              onClick={() => useWorkflowStore.getState().goToStage(stageId, guardCtx)}
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium transition-colors",
                !isLocked && "hover:bg-accent hover:text-accent-foreground",
                isCurrent && "bg-primary text-primary-foreground",
                isCompleted && !isCurrent && "text-green-600",
                isFuture && "text-muted-foreground",
                isLocked && "cursor-not-allowed opacity-60"
              )}
              aria-current={isCurrent ? "step" : undefined}
              aria-disabled={isLocked || undefined}
              aria-label={`${label}${isCompleted ? " (completed)" : ""}${isCurrent ? " (current)" : ""}${isLocked ? " (locked)" : ""}`}
              data-step={step?.id}
            >
              {isLocked ? (
                <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : isCompleted ? (
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
