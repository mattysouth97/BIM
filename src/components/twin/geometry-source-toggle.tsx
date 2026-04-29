"use client";

// src/components/twin/geometry-source-toggle.tsx
// Switches between the procedural era-driven building and the real-geometry
// VWorld LT_C_SPBD extrusion. Styled as a hardware-precision switch rather
// than a generic tab bar — matches the instrument aesthetic of the release
// rail and prediction readout.

import { cn } from "@/lib/utils";
import {
  useGeometrySourceStore,
  type GeometrySource,
} from "@/store/geometry-source-store";

interface GeometrySourceToggleProps {
  /** Informational metadata about each source. */
  vworldStatus?: {
    available: boolean;
    buildingCount?: number;
    dataset?: string;
    /** Most-recent error from the VWorld 3D route, if any. Surfaced inline. */
    error?: string | null;
  };
}

const OPTIONS: Array<{
  value: GeometrySource;
  label: string;
  sublabel: string;
  badge: string;
}> = [
  {
    value: "procedural",
    label: "Procedural",
    sublabel: "Era-inferred mass",
    badge: "BASELINE",
  },
  {
    value: "vworld-3d",
    label: "VWorld 3D",
    sublabel: "LT_C_SPBD · real footprint + height",
    badge: "REAL",
  },
];

export function GeometrySourceToggle({ vworldStatus }: GeometrySourceToggleProps) {
  const source = useGeometrySourceStore((s) => s.source);
  const setSource = useGeometrySourceStore((s) => s.setSource);

  return (
    <div
      className={cn(
        "pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-4 z-20",
        "flex items-stretch",
        "rounded-sm border border-[#24282d]/80",
        "bg-[#0b0d10]/90 backdrop-blur-md",
        "shadow-[0_12px_40px_-20px_rgba(0,0,0,0.85)]",
        "overflow-hidden select-none",
        "animate-[twin-slide-up_520ms_cubic-bezier(0.2,0.7,0.2,1)_both]"
      )}
      role="radiogroup"
      aria-label="Geometry source"
    >
      <div className="flex items-center gap-2 px-4 border-r border-[#24282d]/80">
        <span className="text-[9px] tracking-[0.22em] uppercase text-zinc-500 font-mono">
          geometry
        </span>
      </div>

      {OPTIONS.map((opt) => {
        const active = source === opt.value;
        const isReal = opt.value === "vworld-3d";
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setSource(opt.value)}
            className={cn(
              "relative flex items-center gap-3 px-5 py-3 border-r last:border-r-0 border-[#24282d]/80",
              "transition-colors group",
              active
                ? "bg-[linear-gradient(180deg,rgba(141,230,243,0.14),rgba(141,230,243,0.02))]"
                : "hover:bg-[#12161a]"
            )}
          >
            {/* Switch indicator */}
            <span
              className={cn(
                "inline-flex h-4 w-4 items-center justify-center rounded-full",
                "border transition-colors",
                active
                  ? "border-[#8de6f3] bg-[#8de6f3]/18"
                  : "border-[#33393f] bg-transparent group-hover:border-[#505860]"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  active ? "bg-[#8de6f3] shadow-[0_0_6px_rgba(141,230,243,0.9)]" : "bg-transparent"
                )}
              />
            </span>

            <div className="flex flex-col leading-tight items-start">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-[12px] font-semibold tracking-tight",
                    active ? "text-zinc-50" : "text-zinc-300"
                  )}
                  style={{ fontFamily: "var(--font-display-release)" }}
                >
                  {opt.label}
                </span>
                <span
                  className={cn(
                    "text-[8.5px] font-mono tracking-[0.18em] uppercase px-1 rounded-sm border",
                    active
                      ? isReal
                        ? "border-[#8de6f3]/45 text-[#8de6f3] bg-[#8de6f3]/10"
                        : "border-[#fcd58a]/40 text-[#fcd58a] bg-[#fcd58a]/08"
                      : "border-[#33393f] text-zinc-500"
                  )}
                >
                  {opt.badge}
                </span>
              </div>
              <span
                className={cn(
                  "text-[10px] font-mono tracking-wide",
                  active ? "text-zinc-300" : "text-zinc-500"
                )}
              >
                {opt.sublabel}
              </span>
            </div>

            {/* VWorld 3D status indicator (shown on the real-geometry option) */}
            {isReal && vworldStatus && (
              <div className="ml-4 flex flex-col items-end leading-tight border-l border-[#24282d] pl-4 max-w-[260px]">
                <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.16em]">
                  {vworldStatus.error ? "error" : "buildings"}
                </span>
                {vworldStatus.error ? (
                  <span
                    className="text-[10px] font-mono text-[#f4a765] truncate w-full text-right"
                    title={vworldStatus.error}
                  >
                    {vworldStatus.error.length > 56
                      ? vworldStatus.error.slice(0, 56) + "…"
                      : vworldStatus.error}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "text-[11px] tabular-nums font-mono",
                      vworldStatus.available ? "text-zinc-100" : "text-zinc-500",
                    )}
                  >
                    {vworldStatus.available
                      ? vworldStatus.buildingCount?.toLocaleString() ?? "0"
                      : "—"}
                  </span>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
