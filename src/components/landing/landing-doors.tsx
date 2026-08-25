import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The subset of the shared Button API exposed by the landing entry points. */
type DoorVariant = "default" | "outline" | "link";
type DoorSize = "default" | "sm" | "lg";

type DiagnosticDoorProps = {
  children: ReactNode;
  className?: string;
  testId?: string;
  variant?: DoorVariant;
  size?: DoorSize;
};

function DiagnosticDoor({
  children,
  className,
  testId,
  variant = "default",
  size = "default",
  href,
}: DiagnosticDoorProps & { href: string }) {
  return (
    <Button asChild variant={variant} size={size} className={cn(className)}>
      <Link href={href} data-testid={testId}>
        {children}
      </Link>
    </Button>
  );
}

export function NewDiagnosticDoor(props: DiagnosticDoorProps) {
  return (
    <DiagnosticDoor href="/diagnostics/new" {...props} />
  );
}

export function SampleDiagnosticDoor(props: DiagnosticDoorProps) {
  return (
    <DiagnosticDoor href="/diagnostics/new?method=sample" {...props} />
  );
}
