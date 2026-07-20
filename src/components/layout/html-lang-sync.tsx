"use client";

// src/components/layout/html-lang-sync.tsx
// P2-06 — keep <html lang> in sync with the language store. The root layout
// stays a server component; this tiny client effect updates the attribute on
// toggle (accessibility + SEO correctness).

import { useEffect } from "react";
import { useAppStore } from "@/store/app-store";

export function HtmlLangSync() {
  const language = useAppStore((s) => s.language);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return null;
}
