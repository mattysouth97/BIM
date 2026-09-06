"use client";

// src/components/retrofit/measure-card.tsx
//
// ONE retrofit measure card, and the formatting that goes with it.
//
// Lifted out of `scene-outliner.tsx` on 2026-09-06 unchanged, because the
// model pages needed the same card and a second copy is how two surfaces
// start disagreeing about the same measure. The left dock on `/building/[id]`
// and the retrofit section on `/models/[id]` now render the identical
// component from the identical `useRetrofitScenario` output.
//
// `note` is the one thing that is new: a line under the figures saying why a
// measure is not in the selected set. It exists because the honest answer for
// the Clinic at the default budget is "none of these six clears the bar", and
// a list of six cards with nothing marked 예산 내 and no explanation reads as
// a broken panel rather than as an answer.

import { Sun, Thermometer, Lightbulb, Building2, CheckCircle2 } from "lucide-react";
import { measureDisplayName } from "@/lib/retrofit/measure-claim";
import type { RetrofitMeasure, RetrofitCategory } from "@/lib/retrofit/retrofit-types";

// ── Formatting ────────────────────────────────────────────────────────────────

export function formatKRW(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 100_000_000) {
    return `${sign}₩${(abs / 100_000_000).toFixed(1)}억`;
  }
  if (abs >= 10_000) {
    return `${sign}₩${(abs / 10_000).toFixed(0)}만`;
  }
  return `${sign}₩${abs.toLocaleString()}`;
}

export function formatKWh(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} GWh`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)} MWh`;
  }
  return `${value.toFixed(0)} kWh`;
}

// ── Category ──────────────────────────────────────────────────────────────────

export function CategoryIcon({
  category,
  className,
}: {
  category: RetrofitCategory;
  className?: string;
}) {
  switch (category) {
    case "envelope":
      return <Building2 className={className} />;
    case "hvac":
      return <Thermometer className={className} />;
    case "lighting":
      return <Lightbulb className={className} />;
    case "renewable":
      return <Sun className={className} />;
  }
}

export const CATEGORY_LABELS: Record<RetrofitCategory, string> = {
  envelope: "외피 단열",
  hvac: "HVAC",
  lighting: "조명",
  renewable: "신재생",
};

export const CATEGORY_COLORS: Record<RetrofitCategory, string> = {
  envelope: "bg-orange-100 text-orange-700",
  hvac: "bg-blue-100 text-blue-700",
  lighting: "bg-yellow-100 text-yellow-700",
  renewable: "bg-green-100 text-green-700",
};

/**
 * The order every surface lists categories in.
 *
 * Exported and shared so a fourth reference building cannot arrive with its
 * own order: two pages that answer the same question in a different sequence
 * are the drift this contract exists to remove. Envelope first because it is
 * what the register and the drawings actually state; renewable last because
 * it is the only one that does not reduce the building's own demand.
 */
export const RETROFIT_CATEGORY_ORDER: readonly RetrofitCategory[] = [
  "envelope",
  "hvac",
  "lighting",
  "renewable",
];

// ── Priority ──────────────────────────────────────────────────────────────────

export function priorityFromPayback(paybackYears: number): "high" | "medium" | "low" {
  if (paybackYears < 5) return "high";
  if (paybackYears <= 10) return "medium";
  return "low";
}

const PRIORITY_BORDER: Record<"high" | "medium" | "low", string> = {
  high: "border-l-green-500",
  medium: "border-l-yellow-400",
  low: "border-l-gray-300",
};

const PRIORITY_LABEL: Record<"high" | "medium" | "low", string> = {
  high: "우선",
  medium: "보통",
  low: "낮음",
};

const PRIORITY_BADGE: Record<"high" | "medium" | "low", string> = {
  high: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-500",
};

// ── The card ──────────────────────────────────────────────────────────────────

export function MeasureCard({
  measure,
  selected,
  note,
  locale = "ko",
}: {
  measure: RetrofitMeasure;
  selected: boolean;
  /** Why this measure is not in the selected set. Rendered under the figures. */
  note?: string;
  /**
   * Which language to name the measure in. The generators emit an English
   * `name` ("Roof Insulation Upgrade"), which read as untranslated text on a
   * Korean page; `measureDisplayName` is bim-24's shared ko/en catalog keyed
   * by measure id, and the chips read the same one, so the card and the chip
   * cannot name the same measure differently.
   *
   * The `description` has no bilingual source, so it stays the generator's
   * text rather than acquiring a second table beside that one.
   */
  locale?: "ko" | "en";
}) {
  const priority = priorityFromPayback(measure.paybackYears);
  const paybackFinite = Number.isFinite(measure.paybackYears) && measure.paybackYears < 999;
  const npv = measure.financials?.npv;

  return (
    <div
      className={`border-l-4 ${PRIORITY_BORDER[priority]} bg-card rounded-r-md px-3 py-2 mb-2 last:mb-0`}
      data-testid={`retrofit-measure-${measure.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <CategoryIcon
            category={measure.category}
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          />
          <p className="text-xs font-medium leading-tight truncate">
            {measureDisplayName(measure.id, locale, measure.name)}
          </p>
        </div>
        <span className="flex items-center gap-1 shrink-0">
          {selected && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-700">
              <CheckCircle2 className="h-2.5 w-2.5" />
              예산 내
            </span>
          )}
          <span
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${PRIORITY_BADGE[priority]}`}
          >
            {PRIORITY_LABEL[priority]}
          </span>
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1 leading-tight line-clamp-2">
        {measure.description}
      </p>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
        <span className="text-muted-foreground">
          투자비:{" "}
          <span className="font-medium text-foreground">
            {formatKRW(measure.estimatedCost)}
          </span>
        </span>
        <span className="text-muted-foreground">
          회수:{" "}
          <span className="font-medium text-foreground">
            {paybackFinite ? `${measure.paybackYears.toFixed(1)}년` : "N/A"}
          </span>
        </span>
        <span className="text-muted-foreground">
          절감:{" "}
          <span className="font-medium text-foreground">
            {formatKWh(measure.annualEnergySaving)}/yr
          </span>
        </span>
        <span className="text-muted-foreground">
          {npv !== undefined ? (
            <>
              NPV:{" "}
              <span className={`font-medium ${npv >= 0 ? "text-foreground" : "text-orange-600"}`}>
                {formatKRW(npv)}
              </span>
            </>
          ) : (
            <>
              CO₂:{" "}
              <span className="font-medium text-foreground">
                {measure.co2Reduction.toFixed(2)} tCO₂/yr
              </span>
            </>
          )}
        </span>
      </div>
      {note ? (
        <p
          className="mt-1.5 text-[10px] leading-relaxed text-amber-700 dark:text-amber-400"
          data-testid={`retrofit-measure-${measure.id}-note`}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}
