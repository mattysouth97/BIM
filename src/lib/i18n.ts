"use client";

// src/lib/i18n.ts
// P2-06 — single i18n code path. `useT()` returns a `t(ko, en)` picker bound
// to the language store, plus `lang` for callers that need the raw value.
// This is the ONLY place components read the language store for strings —
// no second i18n library, no per-component isKo ternaries.

import { useAppStore } from "@/store/app-store";

export type Lang = "ko" | "en";

/** Pure picker (store-independent) — useful in tests and non-hook contexts. */
export function pick(lang: Lang, ko: string, en: string): string {
  return lang === "ko" ? ko : en;
}

/**
 * Hook: returns `{ t, lang }`. `t(ko, en)` yields the string for the current
 * store language and re-renders on toggle.
 *
 * @example
 *   const { t } = useT();
 *   <span>{t("투자 예산", "Investment budget")}</span>
 */
export function useT(): { t: (ko: string, en: string) => string; lang: Lang } {
  const lang = useAppStore((s) => s.language);
  return {
    lang,
    t: (ko: string, en: string) => pick(lang, ko, en),
  };
}
