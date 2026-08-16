"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { TwinInstrumentFrame } from "@/components/twin/twin-instrument-frame";
import type { LandingCopy } from "@/lib/landing/copy";
import {
  BANNER_LAYER_IDS,
  BANNER_LAYER_META,
  bannerLayerFromKey,
  nextBannerLayer,
  prevBannerLayer,
  type BannerLayerId,
} from "@/lib/landing/layers";
import { CadDoor, DemoDoor } from "./landing-doors";
import { LayerRail } from "./layer-rail";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

export function CadSheet({
  copy,
  onOpenLookup,
}: {
  copy: LandingCopy;
  onOpenLookup: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState({ x: 72, y: 44 });
  const [layer, setLayer] = useState<BannerLayerId>("all");

  const selectLayer = useCallback((id: BannerLayerId) => {
    setLayer(id);
  }, []);

  useEffect(() => {
    BANNER_LAYER_IDS.forEach((id) => {
      const img = new window.Image();
      img.src = BANNER_LAYER_META[id].poster;
    });
  }, []);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setLayer((current) => nextBannerLayer(current));
    }, 3800);
    return () => window.clearInterval(id);
  }, [reduced]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
      }
      const fromDigit = bannerLayerFromKey(e.key);
      if (fromDigit) {
        e.preventDefault();
        selectLayer(fromDigit);
        return;
      }
      const inRail =
        e.target instanceof HTMLElement &&
        Boolean(e.target.closest("[data-testid='landing-layer-rail']"));
      if (!inRail) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        selectLayer(nextBannerLayer(layer));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        selectLayer(prevBannerLayer(layer));
      } else if (e.key === "Home") {
        e.preventDefault();
        selectLayer("rendered");
      } else if (e.key === "End") {
        e.preventDefault();
        selectLayer("all");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layer, selectLayer]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (reduced) return;
      const node = stageRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      setSpot({
        x: ((e.clientX - r.left) / r.width) * 100,
        y: ((e.clientY - r.top) / r.height) * 100,
      });
    },
    [reduced],
  );

  const px = reduced ? 0 : (spot.x - 50) / 50;
  const py = reduced ? 0 : (spot.y - 50) / 50;

  return (
    <div
      ref={stageRef}
      className="relative h-full min-h-0 overflow-hidden bg-[#e8e8ea]"
      onPointerMove={onPointerMove}
    >
      <div
        className="landing-layer-stage absolute inset-[-4%]"
        style={
          reduced
            ? undefined
            : {
                transform: `translate3d(${px * -16}px, ${py * -10}px, 0) rotateY(${px * 4.5}deg) rotateX(${-py * 3}deg) scale(1.08)`,
              }
        }
      >
        {BANNER_LAYER_IDS.map((id) => {
          const meta = BANNER_LAYER_META[id];
          const active = layer === id;
          return (
            <div
              key={id}
              className="landing-layer-plate absolute inset-0"
              data-active={active ? "true" : "false"}
              aria-hidden={!active}
            >
              <Image
                src={meta.poster}
                alt={active ? meta.alt : ""}
                fill
                priority={id === "all"}
                sizes="100vw"
                className="object-cover object-[82%_center] sm:object-[74%_center]"
              />
            </div>
          );
        })}
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: reduced
            ? "linear-gradient(90deg, rgba(232,232,234,0.78) 0%, rgba(232,232,234,0.18) 32%, transparent 52%)"
            : `radial-gradient(circle 42rem at ${spot.x}% ${spot.y}%, transparent 0%, rgba(22,20,18,0.02) 50%, rgba(22,20,18,0.1) 82%), linear-gradient(90deg, rgba(232,232,234,0.8) 0%, rgba(232,232,234,0.16) 30%, transparent 50%)`,
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#e8e8ea]/70 to-transparent" />

      <div className="absolute inset-x-0 top-0 z-20 flex max-w-xl flex-col justify-end gap-4 px-5 pb-56 pt-10 sm:inset-y-0 sm:max-w-[34rem] sm:justify-center sm:px-8 sm:pb-8 sm:pt-0 lg:max-w-[38rem] lg:px-12">
        <p className="inline-flex w-fit max-w-full items-center rounded-full border border-cyan-300/70 bg-card/80 px-3 py-1 text-[10px] font-medium tracking-wide text-cyan-800 shadow-sm backdrop-blur-md dark:border-cyan-800 dark:text-cyan-200 sm:text-[11px]">
          {copy.heroPhrase}
        </p>

        <h1
          id="bimfit-title"
          className="text-[2.55rem] leading-[0.94] font-medium tracking-tight text-foreground sm:text-6xl lg:text-[4.25rem]"
          style={{ fontFamily: "var(--font-ko-display), var(--font-display-release), serif" }}
        >
          <span className="sr-only">BIMFIT. </span>
          {copy.display === "대장에서 트윈까지" ? (
            <>
              대장에서
              <br />
              트윈까지
            </>
          ) : (
            copy.display
          )}
        </h1>

        <p
          className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase"
          style={{ fontFamily: "var(--font-mono-data), ui-monospace, monospace" }}
        >
          {copy.display === copy.titleKo ? copy.titleEn : copy.titleKo}
        </p>

        <p
          className="max-w-md text-[15px] leading-relaxed text-foreground/80 sm:text-base"
          style={{ fontFamily: "var(--font-ko-display), serif" }}
        >
          {copy.lead}
        </p>

        <p
          className="hidden text-[11px] tracking-wide text-muted-foreground sm:block"
          style={{ fontFamily: "var(--font-mono-data), ui-monospace, monospace" }}
        >
          {copy.layerHint}
        </p>
      </div>

      <div className="pointer-events-none absolute inset-x-3 bottom-[4.6rem] z-20 flex justify-end sm:inset-y-0 sm:bottom-auto sm:right-3 sm:left-auto sm:items-center">
        <div className="pointer-events-auto w-full sm:w-auto">
          <LayerRail layer={layer} onChange={selectLayer} copy={copy} />
        </div>
      </div>

      <TwinInstrumentFrame
        bottom={
          <section className="overflow-hidden rounded-lg border border-border bg-card/95 shadow-sm backdrop-blur-md">
            <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-3 sm:px-5 sm:py-2.5">
              <p className="hidden min-w-0 flex-1 text-[10px] text-muted-foreground sm:block">
                {copy.leadSecondary}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                <DemoDoor testId="landing-demo-start" className="max-sm:flex-1">
                  {copy.demo}
                </DemoDoor>
                <CadDoor testId="landing-cad-start" className="max-sm:flex-1">
                  {copy.cad}
                </CadDoor>
                <button
                  type="button"
                  className="inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:w-full"
                  onClick={onOpenLookup}
                >
                  {copy.lookupJump}
                </button>
              </div>
            </div>
          </section>
        }
      />
    </div>
  );
}
