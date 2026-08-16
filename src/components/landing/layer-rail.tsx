"use client";

import Image from "next/image";
import { BANNER_LAYER_IDS, BANNER_LAYER_META, type BannerLayerId } from "@/lib/landing/layers";
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
      className="pointer-events-auto w-full rounded-lg border border-border/80 bg-card/90 p-1 shadow-sm backdrop-blur-md sm:w-[9.5rem] sm:p-1.5"
      data-testid="landing-layer-rail"
    >
      <p
        className="px-1.5 pb-1 pt-0.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase"
        style={{ fontFamily: "var(--font-mono-data), ui-monospace, monospace" }}
      >
        {copy.layerRail}
      </p>
      <div
        role="radiogroup"
        aria-label={copy.layerRail}
        className="flex flex-row gap-0.5 overflow-x-auto sm:flex-col"
      >
        {BANNER_LAYER_IDS.map((id) => {
          const selected = layer === id;
          const meta = BANNER_LAYER_META[id];
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
                "flex min-h-8 shrink-0 items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                selected
                  ? "bg-foreground text-background"
                  : "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <span
                aria-hidden
                className="relative size-7 shrink-0 overflow-hidden rounded-sm border bg-muted"
                style={{ borderColor: selected ? meta.color : "transparent" }}
              >
                <Image
                  src={meta.poster}
                  alt=""
                  fill
                  sizes="28px"
                  className="object-cover object-[70%_center]"
                />
              </span>
              <span className="whitespace-nowrap">{labels[id].name}</span>
            </button>
          );
        })}
      </div>
      <p
        className="hidden px-1.5 pt-1.5 text-[11px] leading-snug text-muted-foreground sm:block"
        aria-live="polite"
        style={{ fontFamily: "var(--font-ko-display), serif" }}
      >
        {labels[layer].caption}
      </p>
    </div>
  );
}
