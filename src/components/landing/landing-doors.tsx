"use client";

import Link from "next/link";
import { DEMO_BUILDING_ID } from "@/lib/constants";
import { doorStage } from "@/lib/workflow/doors";
import { useWorkflowStore } from "@/store/workflow-store";
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
    <Link
      href={`/building/${DEMO_BUILDING_ID}`}
      data-testid={testId}
      className={cn("lj-cta", className)}
      onClick={() => {
        useWorkflowStore.getState().setStage(doorStage("demo"));
      }}
    >
      {children}
    </Link>
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
    <Link
      href={`/building/${DEMO_BUILDING_ID}`}
      data-testid={testId}
      className={cn("lj-cta lj-cta-ghost", className)}
      onClick={() => {
        useWorkflowStore.getState().setStage(doorStage("cad"));
      }}
    >
      {children}
    </Link>
  );
}
