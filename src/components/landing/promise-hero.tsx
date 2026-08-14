"use client";

import { useCallback, useEffect, useRef } from "react";
import type { LandingCopy } from "@/lib/landing/copy";
import { ElevationDrawing } from "./elevation-drawing";
import { CadDoor, DemoDoor } from "./landing-doors";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

export function PromiseHero({
  copy,
  onCtaVisible,
}: {
  copy: LandingCopy;
  onCtaVisible?: (visible: boolean) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const plateRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  const onPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (reduced) return;
      const el = plateRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--px", x.toFixed(3));
      el.style.setProperty("--py", y.toFixed(3));
    },
    [reduced],
  );

  const onLeave = useCallback(() => {
    const el = plateRef.current;
    if (!el) return;
    el.style.setProperty("--px", "0");
    el.style.setProperty("--py", "0");
  }, []);

  useEffect(() => {
    const node = ctaRef.current;
    if (!node || !onCtaVisible) return;
    const io = new IntersectionObserver(
      ([entry]) => onCtaVisible(!!entry?.isIntersecting),
      { threshold: 0.4 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [onCtaVisible]);

  return (
    <section id="promise" className="lj-promise" aria-labelledby="bimfit-title">
      <div className="lj-masthead">
        <p className="lj-kicker">
          <span>{copy.kickerPlan}</span>
          <span className="lj-page-no">{copy.pageNo}</span>
        </p>
        <ElevationDrawing label={`${copy.brand} ${copy.titleKo}`} />
      </div>

      <div className="lj-title-row">
        <h1 id="bimfit-title" className="lj-brand">
          {copy.h1}
        </h1>
        <p className="lj-brand-alt">
          <span className="lj-brand-ko">{copy.titleKo}</span>
          <span className="lj-brand-en">{copy.titleEn}</span>
        </p>
      </div>
      <hr className="lj-rule" />

      <div className="lj-lead-grid">
        <p className="lj-lead">{copy.lead}</p>
        <p className="lj-lead-secondary">{copy.leadSecondary}</p>
      </div>

      <div ref={ctaRef} className="lj-cta-row">
        <DemoDoor testId="landing-demo-start">{copy.demo}</DemoDoor>
        <CadDoor testId="landing-cad-start">{copy.cad}</CadDoor>
        <a className="lj-text-link" href="#lookup">
          {copy.lookupJump}
        </a>
      </div>
      <p className="lj-hint">{copy.demoHint}</p>

      <div
        ref={plateRef}
        className="lj-spread"
        onPointerMove={onPointer}
        onPointerLeave={onLeave}
      >
        <div className="lj-plate">
          <picture>
            <source
              media="(max-width: 767px)"
              srcSet="/landing/promise-mobile.jpg"
              width={720}
              height={1280}
            />
            {/* Art-directed crop (16:9 / 4:5) — next/image cannot swap sources. */}
            <img
              src="/landing/promise-plate.jpg"
              width={1280}
              height={720}
              alt={copy.photoCaption}
              fetchPriority="high"
              decoding="async"
              className="lj-plate-img"
            />
          </picture>
        </div>
        <div className="lj-inset">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/landing/product-canonical.jpg"
            width={1280}
            height={720}
            alt=""
            decoding="async"
            className="lj-inset-img"
          />
        </div>
        <figcaption className="lj-caption">{copy.photoCaption}</figcaption>
        <dl className="lj-spec">
          {copy.spec.map((row) => (
            <div key={row.k} className="lj-spec-row">
              <dt>{row.k}</dt>
              <dd>{row.v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
