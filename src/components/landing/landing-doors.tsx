"use client";

import Link from "next/link";
import { DEMO_BUILDING_ID, DRAWING_BUILDING_ID, DRAWING_BUILDING_PK } from "@/lib/constants";
import { doorStage } from "@/lib/workflow/doors";
import { useWorkflowStore } from "@/store/workflow-store";
import { useRecipeStore } from "@/store/recipe-store";
import { useMaterialStore } from "@/store/material-store";
import { useTwinProvenanceStore } from "@/store/twin-provenance-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DemoDoor({
  children,
  className,
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Button asChild size="sm" className={cn(className)}>
      <Link
        href={`/building/${DEMO_BUILDING_ID}`}
        data-testid={testId}
        onClick={() => {
          useWorkflowStore.getState().setStage(doorStage("demo"));
        }}
      >
        {children}
      </Link>
    </Button>
  );
}

export function CadDoor({
  children,
  className,
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Button asChild size="sm" variant="outline" className={cn(className)}>
      <Link
        href={`/building/${DRAWING_BUILDING_ID}`}
        data-testid={testId}
        onClick={() => {
          const wf = useWorkflowStore.getState();
          wf.resetWorkflow();
          wf.setStage(doorStage("cad"));
          useRecipeStore.getState().resetOverrides(DRAWING_BUILDING_PK);
          useTwinProvenanceStore.getState().reset(DRAWING_BUILDING_PK);
          useMaterialStore.getState().setActivePk(DRAWING_BUILDING_PK);
        }}
      >
        {children}
      </Link>
    </Button>
  );
}
