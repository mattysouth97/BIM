"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A figure that just changed settles in over 160 ms (opacity only). The new
 * text is in the DOM on the same commit — the animation never delays a value.
 * The first mount does not settle: a settle claims "this changed", and on the
 * initial paint nothing has.
 */
// Pattern: Kokonut UI "dynamic-text" (kokonutui.com) — keyed re-mount on a changed string, rebuilt without the greetings loop or exit.
export function SettleValue({ value, className }: { value: string; className?: string }) {
  const [seen, setSeen] = useState(value);
  const [changed, setChanged] = useState(false);
  // Adjust-during-render (the pattern cad-viewer.tsx uses): no effect needed.
  if (seen !== value) {
    setSeen(value);
    setChanged(true);
  }
  return (
    <span key={value} className={cn(changed && "animate-settle motion-reduce:animate-none", className)}>
      {value}
    </span>
  );
}
