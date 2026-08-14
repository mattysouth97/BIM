"use client";

import { useCallback, useEffect, useState } from "react";
import { landingCopy } from "@/lib/landing/copy";
import { useAppStore } from "@/store/app-store";
import { CadSheet } from "./cad-sheet";
import { LookupInstrument } from "./lookup-instrument";

export function LandingPage() {
  const language = useAppStore((s) => s.language);
  const isKo = language === "ko";
  const copy = landingCopy[isKo ? "ko" : "en"];
  const [lookupOpen, setLookupOpen] = useState(false);

  const openLookup = useCallback(() => setLookupOpen(true), []);
  const closeLookup = useCallback(() => setLookupOpen(false), []);

  useEffect(() => {
    if (!lookupOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLookup();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lookupOpen, closeLookup]);

  return (
    <div className="landing-issue">
      <a className="lj-skip" href="#bimfit-title">
        {copy.skip}
      </a>

      <CadSheet copy={copy} onOpenLookup={openLookup} />

      {lookupOpen && (
        <div
          className="cad-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lookup-title"
        >
          <div className="cad-overlay-bar">
            <button type="button" className="cad-text" onClick={closeLookup}>
              {copy.closeLookup}
            </button>
          </div>
          <div className="cad-overlay-body">
            <LookupInstrument copy={copy} isKo={isKo} />
          </div>
        </div>
      )}
    </div>
  );
}
