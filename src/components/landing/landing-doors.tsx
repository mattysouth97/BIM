"use client";

import Link from "next/link";
import { DEMO_BUILDING_ID } from "@/lib/constants";
import { prepareDemoWorkspaceSession } from "@/lib/generative/workspace-handoff";
import { doorStage } from "@/lib/workflow/doors";
import { useWorkflowStore } from "@/store/workflow-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The subset of the shared Button API the landing doors expose. */
type DoorVariant = "default" | "outline" | "link";
type DoorSize = "default" | "sm" | "lg";

export function DemoDoor({
  children,
  className,
  testId,
  variant = "default",
  size = "default",
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
  variant?: DoorVariant;
  size?: DoorSize;
}) {
  return (
    <Button asChild variant={variant} size={size} className={cn(className)}>
      <Link
        href={`/building/${DEMO_BUILDING_ID}`}
        data-testid={testId}
        onClick={() => {
          useWorkflowStore.getState().setStage(doorStage("demo"));
          prepareDemoWorkspaceSession();
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
  size = "default",
  title,
  href = "/studio",
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
  variant?: DoorVariant;
  size?: DoorSize;
  title?: string;
  /** Defaults to /studio (describe). The draw door passes ?start=draw. */
  href?: string;
}) {
  return (
    <Button asChild variant={variant} size={size} className={cn(className)}>
      <Link href={href} data-testid={testId} title={title}>
        {children}
      </Link>
    </Button>
  );
}
