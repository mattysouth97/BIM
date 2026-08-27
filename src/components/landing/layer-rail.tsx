"use client";

import {
  BANNER_LAYER_IDS,
  BANNER_LAYER_META,
  type BannerLayerId,
} from "@/lib/landing/layers";
import type { LandingCopy } from "@/lib/landing/copy";
import { cn } from "@/lib/utils";

export function LayerRail({
  layer,
  onChange,
  copy,
}: {
  layer: BannerLayerId;
  onChange: (id: BannerLayerId) => void;
  copy: LandingCopy;
}) {
  const labels = copy.layers;

  return (
    <div
      className="rounded-xl border border-border bg-card/95 p-2 shadow-[0_12px_35px_rgba(30,38,36,0.12)] backdrop-blur"
      data-testid="landing-layer-rail"
    >
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <span className="landing-stamp text-[9px] font-semibold text-muted-foreground">
          {copy.layerRail}
        </span>
        <span className="rounded bg-foreground px-1.5 py-0.5 text-[9px] font-bold text-background">
          3D
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label={copy.layerRail}
        className="grid grid-cols-4 gap-1 lg:grid-cols-1"
      >
        {BANNER_LAYER_IDS.map((id) => {
          const selected = layer === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              data-testid={`landing-layer-${id}`}
              onClick={() => onChange(id)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  onChange(id);
                }
              }}
              className={cn(
                "flex min-w-0 items-center justify-center gap-1.5 rounded-md px-1.5 py-2 text-[10px] font-semibold transition-colors lg:justify-start lg:px-2",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: BANNER_LAYER_META[id].color }}
              />
              {labels[id].name}
            </button>
          );
        })}
      </div>
      <p
        className="mt-2 border-t border-border px-1 pt-2 text-[10px] leading-4 text-balance break-keep text-muted-foreground"
        aria-live="polite"
      >
        {labels[layer].caption}
      </p>
    </div>
  );
}
