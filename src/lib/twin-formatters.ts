// src/lib/twin-formatters.ts
// P2-15 — Language-aware numeric formatters shared across twin components.
// These are the ONLY place that converts KRW/years to display strings;
// components call these with the `lang` value from `useT()`.
//
// Invariants:
//   ko output: byte-identical to pre-P2-15 (억/만/년 idiom).
//   en output: SI abbreviations (M/k/B for money, "yr" for years) — no Korean suffixes.

import type { Lang } from "./i18n";

const KRW_EOK = 100_000_000;  // 억
const KRW_MAN = 10_000;       // 만
const KRW_MILLION = 1_000_000;
const KRW_BILLION = 1_000_000_000;

/**
 * Format a KRW value into a locale-appropriate display string.
 *
 * ko: ₩2.5억 / ₩500만 / ₩9,999
 * en: ₩250M  / ₩25k   / ₩999
 *
 * Negative values are prefixed with "-" in both locales.
 */
export function formatKrw(krw: number, lang: Lang): string {
  const sign = krw < 0 ? "-" : "";
  const abs = Math.abs(krw);

  if (lang === "ko") {
    if (abs >= KRW_EOK) {
      const eok = abs / KRW_EOK;
      return `${sign}₩${eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(1)}억`;
    }
    if (abs >= KRW_MAN) {
      return `${sign}₩${(abs / KRW_MAN).toFixed(0)}만`;
    }
    return `${sign}₩${abs.toLocaleString()}`;
  }

  // English: SI abbreviations
  if (abs >= KRW_BILLION) {
    return `${sign}₩${(abs / KRW_BILLION).toFixed(1)}B`;
  }
  if (abs >= KRW_MILLION) {
    return `${sign}₩${Math.round(abs / KRW_MILLION)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}₩${Math.round(abs / 1_000)}k`;
  }
  return `${sign}₩${Math.round(abs)}`;
}

/**
 * Format a year count into a locale-appropriate display string.
 *
 * ko: "3.0년"  (undefined/non-finite → "—")
 * en: "3.0 yr" (undefined/non-finite → "—")
 */
export function formatYears(years: number | undefined, lang: Lang): string {
  if (years === undefined || !Number.isFinite(years)) return "—";
  return lang === "ko" ? `${years.toFixed(1)}년` : `${years.toFixed(1)} yr`;
}
