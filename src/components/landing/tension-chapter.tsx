"use client";

import { useCallback, useId, useState } from "react";
import Image from "next/image";
import type { LandingCopy } from "@/lib/landing/copy";
import { JournalSection } from "./journal-section";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

export function TensionChapter({ copy }: { copy: LandingCopy }) {
  const [t, setT] = useState(42);
  const reduced = usePrefersReducedMotion();
  const id = useId();

  const onKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "Home") {
      e.preventDefault();
      setT((v) => (e.key === "Home" ? 0 : Math.max(0, v - 5)));
    }
    if (e.key === "ArrowRight" || e.key === "End") {
      e.preventDefault();
      setT((v) => (e.key === "End" ? 100 : Math.min(100, v + 5)));
    }
  }, []);

  return (
    <JournalSection
      id="cost"
      kicker={copy.kickerCost}
      title={copy.tensionTitle}
      titleAlt={copy.tensionTitleEn}
    >
      <p className="lj-chapter-lead">{copy.tensionLead}</p>

      <div
        className="lj-wipe"
        onKeyDown={onKey}
      >
        <div
          className="lj-wipe-stage"
          style={{
            ["--wipe" as string]: `${t}%`,
            transition: reduced ? "none" : undefined,
          }}
        >
          <Image
            src="/landing/tension-plate.jpg"
            width={1280}
            height={720}
            alt=""
            sizes="(max-width: 1120px) 100vw, 1120px"
            className="lj-wipe-img"
          />
          <div className="lj-wipe-void" aria-hidden="true">
            <span>{copy.tensionVoid}</span>
          </div>
          <div className="lj-wipe-labels">
            <span>{copy.tensionLeft}</span>
            <span>{copy.tensionRight}</span>
          </div>
        </div>
        <label className="lj-wipe-control" htmlFor={id}>
          <span className="sr-only">{copy.tensionHint}</span>
          <input
            id={id}
            type="range"
            min={0}
            max={100}
            value={t}
            onChange={(e) => setT(Number(e.target.value))}
          />
        </label>
        <p className="lj-hint">{copy.tensionHint}</p>
      </div>
    </JournalSection>
  );
}
