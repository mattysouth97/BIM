"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DockCollapseButtonProps {
  side: "left" | "right";
  collapsed: boolean;
  onClick: () => void;
  className?: string;
}

export function DockCollapseButton({ side, collapsed, onClick, className }: DockCollapseButtonProps) {
  // When left dock is open, show "<" to collapse (pointing left = hide left)
  // When left dock is collapsed, show ">" to expand (pointing right = show left)
  // When right dock is open, show ">" to collapse (pointing right = hide right)
  // When right dock is collapsed, show "<" to expand (pointing left = show right)
  const showChevronLeft = (side === "left" && !collapsed) || (side === "right" && collapsed);

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-6 w-6 shrink-0", className)}
      onClick={onClick}
      title={collapsed ? "Expand panel" : "Collapse panel"}
    >
      {showChevronLeft ? (
        <ChevronLeft className="size-4" />
      ) : (
        <ChevronRight className="size-4" />
      )}
    </Button>
  );
}
