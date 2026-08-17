"use client";

import { landingCopy } from "@/lib/landing/copy";
import { useAppStore } from "@/store/app-store";
import { CadSheet } from "./cad-sheet";

export function LandingPage() {
  const language = useAppStore((s) => s.language);
  const isKo = language === "ko";
  const copy = landingCopy[isKo ? "ko" : "en"];

  return (
    <div className="landing-stage relative">
      <a
        className="absolute left-3 top-[-3rem] z-50 rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-foreground focus:top-2"
        href="#bimfit-title"
      >
        {copy.skip}
      </a>

      <CadSheet copy={copy} />
    </div>
  );
}
