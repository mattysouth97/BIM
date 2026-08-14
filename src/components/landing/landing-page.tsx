"use client";

import { useState } from "react";
import { landingCopy } from "@/lib/landing/copy";
import { useAppStore } from "@/store/app-store";
import { Invitation, StickyCta } from "./invitation";
import { LookupInstrument } from "./lookup-instrument";
import { PromiseHero } from "./promise-hero";
import { ProofPipeline } from "./proof-pipeline";
import { RevealTwin } from "./reveal-twin";
import { TensionChapter } from "./tension-chapter";

export function LandingPage() {
  const language = useAppStore((s) => s.language);
  const isKo = language === "ko";
  const copy = landingCopy[isKo ? "ko" : "en"];
  const [heroCtaVisible, setHeroCtaVisible] = useState(true);

  return (
    <div className="landing-issue">
      <a className="lj-skip" href="#promise">
        {copy.skip}
      </a>

      <article className="lj-sheet">
        <PromiseHero copy={copy} onCtaVisible={setHeroCtaVisible} />
        <TensionChapter copy={copy} />
        <RevealTwin copy={copy} />
        <ProofPipeline copy={copy} />
        <Invitation copy={copy} />
        <LookupInstrument copy={copy} isKo={isKo} />

        <footer className="lj-colophon">
          <hr className="lj-rule" />
          <p>{copy.footerNote}</p>
        </footer>
      </article>

      <StickyCta copy={copy} visible={!heroCtaVisible} />
    </div>
  );
}
