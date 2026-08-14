"use client";

import { cn } from "@/lib/utils";

/**
 * Reserved slots around the 3D subject. Widgets sit in the frame —
 * they do not choose their own absolute corners.
 */
export function TwinInstrumentFrame({
  top,
  bottom,
  className,
}: {
  top?: React.ReactNode;
  bottom?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3 gap-3",
        className,
      )}
      data-twin-instrument-frame
    >
      {top ? (
        <div className="pointer-events-auto min-w-0 shrink-0">{top}</div>
      ) : (
        <div />
      )}
      {bottom ? (
        <div className="pointer-events-auto min-w-0 shrink-0">{bottom}</div>
      ) : null}
    </div>
  );
}
