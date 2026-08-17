"use client";

import Link from "next/link";
import { DEMO_BUILDING_ID } from "@/lib/constants";
import { doorStage } from "@/lib/workflow/doors";
import { useWorkflowStore } from "@/store/workflow-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DemoDoor({
  children,
  className,
  testId,
  variant = "default",
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
  variant?: "default" | "outline";
}) {
  return (
    <Button asChild size="sm" variant={variant} className={cn(className)}>
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

/**
 * The generative studio — every non-demo building starts here now, whether
 * described in a sentence or drawn as a schematic (both live behind the same
 * route, see StartMode in generative-studio.tsx). Two landing doors point
 * here with different copy: the primary "describe or draw" CTA and the
 * "import a drawing" door that calls out the schematic-import path.
 */
export function StudioDoor({
  children,
  className,
  testId,
  variant = "default",
  title,
  href = "/studio",
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
  variant?: "default" | "outline";
  title?: string;
  /** Defaults to /studio (describe). The draw door passes ?start=draw. */
  href?: string;
}) {
  return (
    <Button asChild size="sm" variant={variant} className={cn(className)}>
      <Link href={href} data-testid={testId} title={title}>
        {children}
      </Link>
    </Button>
  );
}
