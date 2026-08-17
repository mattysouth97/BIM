"use client";

import { BANNER_LAYER_IDS, type BannerLayerId } from "@/lib/landing/layers";
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
      className="flex flex-col items-center gap-2.5"
      data-testid="landing-layer-rail"
    >
      <div
        role="radiogroup"
        aria-label={copy.layerRail}
        className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
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
                "landing-stamp pb-1 text-[11px] transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                selected
                  ? "border-b border-current text-foreground"
                  : "border-b border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {labels[id].name}
            </button>
          );
        })}
      </div>
      <p
        className="text-xs leading-snug text-balance break-keep text-muted-foreground"
        aria-live="polite"
      >
        {labels[layer].caption}
      </p>
    </div>
  );
}
