"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { LandingCopy } from "@/lib/landing/copy";
import { JournalSection } from "./journal-section";
import { DemoDoor } from "./landing-doors";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

const RevealScene = lazy(() =>
  import("./reveal-scene").then((m) => ({ default: m.RevealScene })),
);

function Poster() {
  return (
    <Image
      src="/landing/product-object.jpg"
      width={1024}
      height={1024}
      alt=""
      sizes="(max-width: 1120px) 100vw, 800px"
      className="lj-reveal-poster"
    />
  );
}

export function RevealTwin({ copy }: { copy: LandingCopy }) {
  const reduced = usePrefersReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [exploded, setExploded] = useState(false);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const visible = !!entry?.isIntersecting;
        setInView(visible);
        if (visible) setMounted(true);
      },
      { rootMargin: "220px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const onKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setExploded((v) => !v);
    }
  }, []);

  const showCanvas = mounted && !reduced;

  return (
    <JournalSection
      id="twin"
      kicker={copy.kickerTwin}
      title={copy.revealTitle}
      titleAlt={copy.revealTitleEn}
    >
      <p className="lj-chapter-lead">{copy.revealLead}</p>

      <div
        ref={stageRef}
        className="lj-reveal"
        tabIndex={0}
        role="application"
        aria-label={copy.revealDrag}
        onKeyDown={onKey}
      >
        <div className="lj-reveal-stage">
          {showCanvas ? (
            <Suspense fallback={<Poster />}>
              <RevealScene exploded={exploded} reduced={reduced} active={inView} />
            </Suspense>
          ) : (
            <Poster />
          )}
        </div>
        <div className="lj-reveal-bar">
          <p className="lj-hint">{copy.revealDrag}</p>
          <button
            type="button"
            className="lj-text-btn"
            onClick={() => setExploded((v) => !v)}
            aria-pressed={exploded}
          >
            {exploded ? copy.revealFold : copy.revealExplode}
          </button>
          <DemoDoor className="lj-cta-sm">{copy.revealOpen}</DemoDoor>
        </div>
      </div>
    </JournalSection>
  );
}
