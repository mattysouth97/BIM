"use client";

// src/components/workspace/workflow-stage-recovery.tsx
// P2-16 — reload recovery for the persisted workflow stage.
//
// The workflow store persists `stage`, but the recipe/material stores that
// its forward guards gate on are deliberately transient (P2-07: never
// persisted). Reloading on stage "twin" or "report" therefore lands the user
// on a panel whose prerequisites (the ≥3-point CAD footprint committed in the
// upload stage) no longer exist — an empty view with no path out, because the
// stepper only guards *forward* jumps.
//
// Recovery replays the same forward guards the stepper uses: getBlockingStage
// from "search" up to the persisted stage. The first failing guard is exactly
// the earliest stage the user must redo, so we retreat there. When every
// guard passes (or the stage is search/upload, which nothing gates), this is
// a no-op.

import { useEffect } from "react";
import { useHydration } from "@/hooks/use-hydration";
import { useWorkflowStore } from "@/store/workflow-store";
import { useActiveBuildingStore } from "@/store/active-building-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useCadDraftStore } from "@/store/cad-draft-store";
import { getWorkflowMode } from "@/lib/workflow/cad-draft";
import {
  getBlockingStage,
  getStageOrder,
  type WorkflowStage,
} from "@/lib/workflow/stages";

/**
 * Hook-free recovery step (exported for tests). Reads the persisted stage,
 * rebuilds the guard context the same way workflow-stepper.tsx does (recipe
 * overrides of the active building), and retreats to the first guard-failing
 * stage. Returns the stage recovered to, or null when no recovery was needed.
 */
export function recoverWorkflowStage(): WorkflowStage | null {
  const { stage, setStage, cadSkipped } = useWorkflowStore.getState();
  const buildingPk = useActiveBuildingStore.getState().buildingPk ?? "";
  const overrides = useRecipeStore.getState().overrides[buildingPk];
  // P2-24: mode from the active PK prefix; a persisted "params" stage can only
  // come from a cad-first session (the ledger order never contains it), so it
  // classifies as cad-first even when the transient PK is already gone.
  const mode =
    stage === "params" ? "cad-first" : getWorkflowMode(buildingPk || null);
  const blocking = getBlockingStage(getStageOrder(mode)[0], stage, {
    mode,
    footprintPolygon: overrides?.footprintPolygon,
    // P2-17: like the footprint, the skip flag is transient — after a real
    // reload it is empty and twin/report still retreat to upload.
    cadSkipped: cadSkipped[buildingPk],
    // P2-24: draft params are transient too; absent ⇒ params guard fails.
    cadParams: useCadDraftStore.getState().drafts[buildingPk],
  });
  if (blocking !== null) setStage(blocking);
  return blocking;
}

/**
 * Mounted once in <Providers>; renders nothing. Runs recovery exactly once
 * after client hydration so the persisted stage has rehydrated (idempotent —
 * safe under React strict-mode double-invocation).
 */
export function WorkflowStageRecovery() {
  const hydrated = useHydration();

  useEffect(() => {
    if (!hydrated) return;
    recoverWorkflowStage();
  }, [hydrated]);

  return null;
}
