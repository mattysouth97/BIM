"use client";

import { cn } from "@/lib/utils";

/**
 * Reserved slots around the 3D subject. Widgets sit in the frame —
 * they do not choose their own absolute corners.
 *
 * Each slot is capped at 38 % of the frame and scrolls inside that cap, so the
 * building keeps at least a quarter of the height whatever the instrument
 * grows to. Measured on the Clinic at a 668 px viewport (a 1366×768 laptop):
 * the top block runs ~185 px and the bottom ~170 px with nothing selected,
 * leaving ~230 px of canvas — but the bottom block grows with the delta strip
 * (element rows, reflected changes, an unpriced block and its reason), and at
 * full extension the canvas fell to ~110 px and the building read as a sliver
 * behind the readout.
 *
 * A cap rather than a collapse, deliberately. The measure row is the primary
 * control now and the grade sentence is there because the badge alone does not
 * say what the grade IS — hiding either to win pixels would trade a stated
 * fact for space. Scrolling keeps every row reachable and costs only that the
 * reader may have to scroll a block that has genuinely outgrown the window.
 * At desktop heights neither slot reaches the cap and nothing scrolls.
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
        <div className="pointer-events-auto min-w-0 shrink-0 max-h-[38%] overflow-y-auto">
          {top}
        </div>
      ) : (
        <div />
      )}
      {bottom ? (
        <div className="pointer-events-auto min-w-0 shrink-0 max-h-[38%] overflow-y-auto">
          {bottom}
        </div>
      ) : null}
    </div>
  );
}
