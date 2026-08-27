"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { LandingCopy } from "@/lib/landing/copy";
import { BANNER_LAYER_META, type BannerLayerId } from "@/lib/landing/layers";
import { LedgerLookup } from "@/components/energy-diagnostics/ledger-lookup";
import { useAppStore } from "@/store/app-store";
import { LayerRail } from "./layer-rail";

/**
 * One screen, one workflow. The product begins at the 건축물대장: find the real
 * building, and its register becomes a baseline energy model on the spot.
 *
 * The lookup is the landing page rather than something behind a door — every
 * other entry (a drawing, the sample) is a way into the same diagnosis, and is
 * offered underneath rather than beside it.
 */
export function CadSheet({ copy }: { copy: LandingCopy }) {
  const [layer, setLayer] = useState<BannerLayerId>("all");
  const language = useAppStore((state) => state.language);
  const locale = language === "ko" ? "ko" : "en";
  const selectLayer = useCallback((id: BannerLayerId) => {
    setLayer(id);
  }, []);
  const meta = BANNER_LAYER_META[layer];

  return (
    <section className="relative isolate flex min-h-[inherit] w-full flex-col overflow-hidden">
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

      <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 lg:py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1
            id="bimfit-title"
            aria-label={`${copy.brand}: ${copy.display}`}
            className="landing-display text-foreground"
          >
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
        </div>

        {/* The workflow starts here. */}
        <div
          className="mt-8 rounded-xl border border-border/70 bg-background/85 p-5 shadow-2xl backdrop-blur sm:p-6"
          data-testid="landing-ledger-lookup"
        >
          <LedgerLookup locale={locale} />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-foreground/70">
          <Link
            href="/diagnostics/new?method=ledger&building=demo"
            className="font-semibold text-foreground underline decoration-foreground/35 underline-offset-4 hover:decoration-foreground"
            data-testid="landing-sample-diagnostic"
          >
            {copy.sampleDiagnostic}
          </Link>
          <span aria-hidden className="text-foreground/30">
            ·
          </span>
          <Link
            href="/diagnostics/new"
            className="underline decoration-foreground/25 underline-offset-4 hover:text-foreground"
            data-testid="landing-new-diagnostic"
          >
            {locale === "ko"
              ? "대장 없이 도면으로 시작"
              : "Start from a drawing instead"}
          </Link>
        </div>

        <div className="mx-auto mt-8 w-full max-w-md border-t border-border/60 pt-5">
          <LayerRail layer={layer} onChange={selectLayer} copy={copy} />
        </div>
      </div>
    </section>
  );
}
