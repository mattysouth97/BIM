"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import type { LandingCopy } from "@/lib/landing/copy";
import { BANNER_LAYER_META, type BannerLayerId } from "@/lib/landing/layers";
import { DemoDoor, StudioDoor } from "./landing-doors";
import { LayerRail } from "./layer-rail";

/**
 * One screen, one statement: the name at poster scale, centred over a
 * full-bleed BIM plate that the scrim holds back to a watermark. Under it the
 * tagline, the spec stamp, one primary door, and the two studio doors set
 * quiet. The layer rail stays — it *is* the argument, the same building peeled
 * — but it swaps the plate underneath instead of owning a figure of its own.
 */
export function CadSheet({ copy }: { copy: LandingCopy }) {
  const [layer, setLayer] = useState<BannerLayerId>("all");
  const selectLayer = useCallback((id: BannerLayerId) => {
    setLayer(id);
  }, []);
  const meta = BANNER_LAYER_META[layer];

  return (
    <section className="relative isolate flex min-h-[inherit] w-full items-center overflow-hidden">
      <Image
        key={meta.poster}
        src={meta.poster}
        alt={meta.alt}
        fill
        priority
        sizes="100vw"
        style={{ objectPosition: meta.focus }}
        className="landing-plate -z-20 object-cover"
      />
      <div
        aria-hidden
        className="landing-scrim absolute inset-0 -z-10"
        style={{ "--landing-veil": meta.veil } as React.CSSProperties}
      />
      <div
        aria-hidden
        className="landing-focus pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[44rem] w-[56rem] max-w-[160vw] -translate-x-1/2 -translate-y-1/2"
      />

      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10 lg:py-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <h1 id="bimfit-title" className="landing-display text-foreground">
            {copy.brand}
          </h1>

          <p className="landing-tagline max-w-xl text-balance break-keep text-foreground/85">
            {copy.display}
          </p>

          <p className="landing-stamp flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[10px] text-foreground/70 sm:text-[11px]">
            <span>{copy.heroPhrase}</span>
            <span className="border border-border px-1.5 py-1 leading-none">
              {copy.version}
            </span>
          </p>

          <div className="flex flex-col items-center gap-4 pt-3">
            <DemoDoor
              testId="landing-demo-start"
              size="lg"
              className="h-12 px-8 text-base font-semibold"
            >
              {copy.demo}
            </DemoDoor>

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <StudioDoor
                testId="landing-studio-start"
                href="/studio?start=draw"
                variant="link"
                className="h-auto p-0 underline"
                title={copy.studioSub}
              >
                {copy.studio}
              </StudioDoor>
              <span aria-hidden className="text-border">
                /
              </span>
              <StudioDoor
                testId="landing-import-start"
                href="/studio?start=draw"
                variant="link"
                className="h-auto p-0 underline"
                title={copy.importDrawingSub}
              >
                {copy.importDrawing}
              </StudioDoor>
            </div>
          </div>

          <div className="mt-4 w-full max-w-md border-t border-border/60 pt-5">
            <LayerRail layer={layer} onChange={selectLayer} copy={copy} />
          </div>
        </div>
      </div>
    </section>
  );
}
