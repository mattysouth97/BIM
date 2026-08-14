"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A side drawer for the twin. Reads as a column of the instrument, not a
 * window you can drop on the numbers.
 */
export function TwinDock({
  side,
  title,
  onClose,
  children,
  dataTour,
}: {
  side: "left" | "right";
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  dataTour?: string;
}) {
  return (
    <aside
      data-tour={dataTour}
      className={cn(
        "flex h-full w-[min(19rem,38vw)] shrink-0 flex-col bg-background",
        side === "left" ? "border-r" : "border-l",
      )}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-3">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </aside>
  );
}

/** Edge tab — looks like a drawer pull, not a mystery icon. */
export function TwinDockTab({
  side,
  label,
  onClick,
  dataTour,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
  dataTour?: string;
}) {
  return (
    <button
      type="button"
      data-tour={dataTour}
      onClick={onClick}
      title={label}
      className={cn(
        "pointer-events-auto absolute top-1/2 z-20 -translate-y-1/2",
        "border bg-card/95 px-1.5 py-5 text-[10px] font-medium tracking-wide",
        "text-muted-foreground shadow-sm hover:text-foreground hover:bg-card",
        side === "left" && "left-0 rounded-r-md border-l-0",
        side === "right" && "right-0 rounded-l-md border-r-0",
      )}
    >
      <span
        className="inline-block"
        style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
      >
        {label}
      </span>
    </button>
  );
}
