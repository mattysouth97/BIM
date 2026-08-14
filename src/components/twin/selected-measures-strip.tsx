"use client";

import { useNarrowViewport } from "@/hooks/use-narrow-viewport";
import type { RetrofitMeasure } from "@/lib/retrofit/retrofit-types";

interface SelectedMeasuresStripProps {
  measures: RetrofitMeasure[];
}

/** Phone-only list of knapsack picks so the budget answer is visible. */
export function SelectedMeasuresStrip({ measures }: SelectedMeasuresStripProps) {
  const narrow = useNarrowViewport();
  if (!narrow || measures.length === 0) return null;

  return (
    <div
      className="border-b border-border px-3 py-2"
      data-twin-selected-measures
    >
      <p className="text-[10px] font-medium text-muted-foreground mb-1">
        예산 내 선택 {measures.length}개
      </p>
      <ul className="flex flex-col gap-0.5">
        {measures.map((m) => (
          <li
            key={m.id}
            className="flex items-baseline justify-between gap-2 text-[11px]"
          >
            <span className="truncate text-foreground">{m.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {m.financials?.npv !== undefined
                ? `NPV ${(m.financials.npv / 100_000_000).toFixed(1)}억`
                : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
