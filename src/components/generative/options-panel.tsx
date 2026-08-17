"use client";

// src/components/generative/options-panel.tsx
//
// Design options (brief §59, §60).
//
// Architecture is comparative: the value is not one answer but several, held
// side by side against the same brief. Each option is a full generation with a
// different seed — same prompt, same design rules, genuinely different building
// (§24) — so the numbers below are measured, not estimated.
//
// Adopting an option makes it a SIBLING of the current design rather than its
// child. An option is an alternative to what you have, not a change to it, and
// the history tree says so.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DesignOption } from "@/store/generative-session-store";

interface Props {
  options: DesignOption[];
  prompt: string | null;
  onAdopt: (id: string) => void;
  onDismiss: () => void;
}

interface Row {
  label: string;
  value: (option: DesignOption) => number | null;
  format: (value: number) => string;
  /** Which direction is better, for the comparison marker. `null` = neither. */
  better: "high" | "low" | null;
}

const ROWS: Row[] = [
  {
    label: "Floors",
    value: (o) => o.result?.metrics.floorCount ?? null,
    format: (v) => String(v),
    better: null,
  },
  {
    label: "Gross area",
    value: (o) => o.result?.metrics.grossAreaSqm ?? null,
    format: (v) => `${Math.round(v).toLocaleString()} m²`,
    better: null,
  },
  {
    label: "Net area",
    value: (o) => o.result?.metrics.netAreaSqm ?? null,
    format: (v) => `${Math.round(v).toLocaleString()} m²`,
    better: "high",
  },
  {
    label: "Circulation",
    value: (o) => o.result?.metrics.circulationRatio ?? null,
    format: (v) => `${(v * 100).toFixed(1)}%`,
    better: "low",
  },
  {
    label: "Core",
    value: (o) => o.result?.metrics.coreRatio ?? null,
    format: (v) => `${(v * 100).toFixed(1)}%`,
    better: "low",
  },
  {
    label: "Window-to-wall",
    value: (o) => o.result?.metrics.windowToWallRatio ?? null,
    format: (v) => `${(v * 100).toFixed(0)}%`,
    better: null,
  },
  {
    label: "Spaces",
    value: (o) => o.result?.metrics.roomCount ?? null,
    format: (v) => String(v),
    better: null,
  },
  {
    label: "Critical issues",
    value: (o) => o.result?.validation.counts.critical ?? null,
    format: (v) => String(v),
    better: "low",
  },
];

export function OptionsPanel({ options, prompt, onAdopt, onDismiss }: Props) {
  if (options.length === 0) return null;

  const ready = options.filter((option) => option.state === "ready");
  const running = options.filter((option) => option.state === "running").length;

  const bestFor = (row: Row): string | null => {
    if (!row.better) return null;

    // Only options that actually produced a number can win or tie. Comparing
    // against the full `ready` list let a single missing value break the tie
    // check, marking a "winner" when every measured option was identical.
    const measured = ready
      .map((option) => ({ id: option.id, value: row.value(option) }))
      .filter((entry): entry is { id: string; value: number } => entry.value !== null);

    if (measured.length < 2) return null;

    const best = measured.reduce((winner, entry) =>
      row.better === "high"
        ? entry.value > winner.value
          ? entry
          : winner
        : entry.value < winner.value
          ? entry
          : winner,
    );

    // A tie across every measured option is not a winner worth marking.
    return measured.every((entry) => entry.value === best.value) ? null : best.id;
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">
            {options.length} design options
            {running > 0 ? ` · ${running} still generating` : ""}
          </h3>
          {prompt && (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
              {prompt}
            </p>
          )}
        </div>
        <Button size="xs" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="w-24 py-1 text-left font-medium text-muted-foreground">
                &nbsp;
              </th>
              {options.map((option) => (
                <th key={option.id} className="px-2 py-1 text-left font-medium">
                  <div className="flex flex-col gap-0.5">
                    <span>{option.label}</span>
                    <span className="font-mono text-[10px] font-normal text-muted-foreground">
                      seed {option.seed}
                    </span>
                    {option.state === "running" && (
                      <Badge variant="outline" className="w-fit text-[9px]">
                        generating…
                      </Badge>
                    )}
                    {option.state === "failed" && (
                      <Badge variant="destructive" className="w-fit text-[9px]">
                        failed
                      </Badge>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {ROWS.map((row) => {
              const winner = bestFor(row);
              return (
                <tr key={row.label} className="border-t">
                  <th className="py-1 text-left font-normal text-muted-foreground">
                    {row.label}
                  </th>
                  {options.map((option) => {
                    const value = row.value(option);
                    const isWinner = winner === option.id;
                    return (
                      <td
                        key={option.id}
                        data-best={isWinner ? "true" : undefined}
                        className={cn(
                          "px-2 py-1",
                          isWinner && "font-medium text-emerald-600",
                        )}
                      >
                        {value === null ? "—" : row.format(value)}
                        {/* Comparing the options IS the panel, so the winner
                            cannot be signalled by green text alone. */}
                        {isWinner && (
                          <span className="sr-only">
                            {" "}
                            — best ({row.better === "high" ? "highest" : "lowest"})
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t">
              <td />
              {options.map((option) => (
                <td key={option.id} className="px-2 pt-2">
                  {option.state === "ready" ? (
                    <Button size="xs" onClick={() => onAdopt(option.id)}>
                      Use this
                    </Button>
                  ) : option.state === "failed" ? (
                    <span className="text-[10px] text-destructive">{option.error}</span>
                  ) : null}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[10px] leading-snug text-muted-foreground">
        Options are generated from the original brief and your current design rules.
        They do not carry later edits — adopting one starts a new branch alongside the
        design you have.
      </p>
    </div>
  );
}
