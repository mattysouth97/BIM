"use client";

import { useCallback, useEffect, useState } from "react";
import { landingCopy } from "@/lib/landing/copy";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
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
    <div className="landing-stage relative">
      <a
        className="absolute left-3 top-[-3rem] z-50 rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-foreground focus:top-2"
        href="#bimfit-title"
      >
        {copy.skip}
      </a>

      <CadSheet copy={copy} onOpenLookup={openLookup} />

      {lookupOpen && (
        <div
          className="absolute inset-3 z-30 flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card/95 shadow-sm backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lookup-title"
        >
          <div className="flex h-9 shrink-0 items-center justify-between border-b px-3">
            <span className="text-xs font-medium text-muted-foreground">
              {copy.lookupTitle}
            </span>
            <Button variant="ghost" size="sm" className="h-7" onClick={closeLookup}>
              {copy.closeLookup}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
            <LookupInstrument copy={copy} isKo={isKo} />
          </div>
        </div>
      )}
    </div>
  );
}
