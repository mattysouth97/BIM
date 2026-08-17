"use client";

// src/components/generative/history-panel.tsx
//
// Design history as a tree you can walk (brief §56, §58).
//
// Every design that ever existed is still here. Editing from an earlier state
// branches rather than truncating, so the panel shows forks explicitly and any
// node can be made current with one click — comparing two approaches is
// navigation, not regeneration.
//
// Undo and redo are ordinary movements through the same tree, which is why they
// live in this panel rather than in a toolbar of their own.

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/generative/spec/status";
import type { HistoryRow } from "@/lib/generative/session/history";
import type { DesignState } from "@/store/generative-session-store";

interface Props {
  rows: HistoryRow<DesignState>[];
  currentId: string | null;
  onGoTo: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const KIND_LABEL: Record<string, string> = {
  generate: "generated",
  modify: "edit",
  repair: "repair",
  option: "option",
  regenerate: "rebuild",
};

function relativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export function HistoryPanel({
  rows,
  currentId,
  onGoTo,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: Props) {
  // The clock is state, not a render-time read: calling Date.now() during
  // render makes the component non-idempotent, and the labels would then drift
  // depending on whether something unrelated happened to re-render. A minute is
  // the resolution these labels actually have, so it ticks once a minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onUndo} disabled={!canUndo}>
          ← Undo
        </Button>
        <Button size="sm" variant="outline" onClick={onRedo} disabled={!canRedo}>
          Redo →
        </Button>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {rows.length} design{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <ol className="flex flex-col">
        {rows.map(({ node, depth, isBranchPoint }) => {
          const isCurrent = node.id === currentId;
          return (
            <li key={node.id} style={{ paddingLeft: `${depth * 12}px` }}>
              <button
                type="button"
                onClick={() => onGoTo(node.id)}
                // Which design is current is the single most important fact in
                // this panel, and colour alone does not carry it.
                aria-current={isCurrent ? "true" : undefined}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded border-l-2 px-2 py-1.5 text-left",
                  isCurrent
                    ? "border-l-primary bg-primary/10"
                    : "border-l-transparent hover:bg-muted/60",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant={isCurrent ? "default" : "outline"}
                    className="font-mono text-[9px] uppercase"
                  >
                    {KIND_LABEL[node.kind] ?? node.kind}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs">{node.label}</span>
                  {isBranchPoint && (
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      <span aria-hidden>⑂</span>
                      {/* A title attribute is hover-only and announced
                          inconsistently; the fork belongs in the row's name. */}
                      <span className="sr-only">
                        — taken in more than one direction
                      </span>
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-2 font-mono text-[10px] text-muted-foreground">
                  <span>{node.payload.generationId}</span>
                  <span>{node.payload.metrics.floorCount}F</span>
                  <span>
                    {Math.round(node.payload.metrics.grossAreaSqm).toLocaleString()} m²
                  </span>
                  <span
                    className={cn(
                      node.payload.validation.counts.critical > 0 && "text-destructive",
                    )}
                  >
                    {node.payload.validation.counts.critical}C/
                    {node.payload.validation.counts.warning}W
                  </span>
                  <span className="ml-auto">{relativeTime(node.createdAt, now)}</span>
                </div>

                {node.detail && (
                  <span className="truncate text-[10px] text-muted-foreground">
                    {node.detail}
                  </span>
                )}
                {isCurrent && (
                  <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {STATUS_LABEL[node.payload.status.level]}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {rows.length > 1 && (
        <p className="text-[10px] leading-snug text-muted-foreground">
          Editing from an earlier design branches instead of discarding what came after
          it. Nothing here is ever overwritten.
        </p>
      )}
    </div>
  );
}
