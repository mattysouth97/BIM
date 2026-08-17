"use client";

// src/components/generative/summary-panel.tsx
//
// What the building is, what was assumed, and what the system is prepared to
// claim about it (brief §10, §12, §14).
//
// Deliberately compact: not every object, just the numbers an architect checks
// first. The assumptions list is the honest part — every value the user did not
// state is here with its source and confidence, and any of them can be promoted
// into a persistent design rule so the next generation stops guessing at it
// (§120, §121).
//
// The status badge is derived from evidence and has no "approved" state to
// reach. Its blockers are shown, not hidden behind a tooltip.

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL } from "@/lib/generative/spec/status";
import type { DesignState } from "@/store/generative-session-store";

interface Props {
  design: DesignState;
  designRules: string[];
  onAddRule: (rule: string) => void;
  onRemoveRule: (rule: string) => void;
}

export function SummaryPanel({ design, designRules, onAddRule, onRemoveRule }: Props) {
  const [draftRule, setDraftRule] = useState("");
  const m = design.metrics;

  const rows: Array<[string, string]> = [
    ["Floors", String(m.floorCount)],
    ["Gross area", `${Math.round(m.grossAreaSqm).toLocaleString()} m²`],
    ["Net area", `${Math.round(m.netAreaSqm).toLocaleString()} m²`],
    ["Height", `${m.buildingHeightM.toFixed(1)} m`],
    ["Spaces", String(m.roomCount)],
    ["Structural bay", `${(design.spec.structure.gridXMm.value / 1000).toFixed(1)} m`],
    ["Circulation", `${(m.circulationRatio * 100).toFixed(1)}%`],
    ["Core", `${(m.coreRatio * 100).toFixed(1)}%`],
    ["Window-to-wall", `${(m.windowToWallRatio * 100).toFixed(0)}%`],
    ["Doors", String(m.doorCount)],
    ["Windows", String(m.windowCount)],
    ["Columns", String(m.columnCount)],
  ];

  return (
    <div className="flex flex-col gap-4 p-3 text-sm">
      <div>
        <h2 className="text-base font-medium">{design.spec.project.name}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {design.spec.project.description}
        </p>
        {/* Status is derived from evidence and can never read "approved" (§10). */}
        <Badge variant="outline" className="mt-2 font-mono text-[10px] uppercase">
          {STATUS_LABEL[design.status.level]}
        </Badge>
        <p className="mt-1 text-[11px] text-muted-foreground">{design.status.reason}</p>
        {design.status.blockers.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-[10px] text-muted-foreground">
            {design.status.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 font-mono text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between border-b py-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <section>
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Design intent
        </h3>
        <p className="mt-1 text-xs">{design.spec.designIntent.summary}</p>
        {design.spec.designIntent.priorities.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {design.spec.designIntent.priorities
              .slice()
              .sort((a, b) => b.weight - a.weight)
              .map((priority) => (
                <li key={priority.goal}>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {priority.goal.replace(/_/g, " ")} {(priority.weight * 100).toFixed(0)}%
                  </Badge>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Design rules ({designRules.length})
        </h3>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Persistent project memory. Every generation and edit honours these.
        </p>
        {designRules.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {designRules.map((rule) => (
              <li key={rule} className="flex items-start gap-2 border-l-2 pl-2 text-xs">
                <span className="min-w-0 flex-1">{rule}</span>
                <button
                  type="button"
                  onClick={() => onRemoveRule(rule)}
                  className="shrink-0 text-[10px] text-muted-foreground underline underline-offset-2"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-2 flex gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draftRule.trim()) return;
            onAddRule(draftRule);
            setDraftRule("");
          }}
        >
          <input
            value={draftRule}
            onChange={(e) => setDraftRule(e.target.value)}
            placeholder="Keep corridors at least 1.8 m clear"
            aria-label="Add a design rule"
            className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" size="xs" variant="outline" disabled={!draftRule.trim()}>
            Add
          </Button>
        </form>
      </section>

      <section>
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Assumptions ({design.spec.assumptions.length})
        </h3>
        <ul className="mt-2 flex flex-col gap-2 text-xs">
          {design.spec.assumptions.map((assumption) => {
            const alreadyRule = designRules.includes(assumption.statement);
            return (
              <li key={assumption.id} className="border-l-2 pl-2">
                <div className="font-medium">{assumption.label}</div>
                <div className="text-muted-foreground">{assumption.statement}</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase text-muted-foreground">
                    {assumption.source.replace("_", " ")} · confidence{" "}
                    {(assumption.confidence * 100).toFixed(0)}%
                  </span>
                  {!alreadyRule && assumption.source !== "USER_PROVIDED" && (
                    <button
                      type="button"
                      onClick={() => onAddRule(assumption.statement)}
                      className="text-[10px] underline underline-offset-2"
                      title="Stop guessing at this — make it a persistent rule"
                    >
                      make a rule
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {design.approximations.length > 0 && (
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Approximations
          </h3>
          <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
            {design.approximations.map((approximation) => (
              <li key={approximation}>{approximation}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="font-mono text-[10px] text-muted-foreground">
        {design.generationId} · seed {design.seed} · {design.provider.name}
        {design.provider.model ? ` (${design.provider.model})` : ""} ·{" "}
        {(design.provider.latencyMs / 1000).toFixed(1)}s
      </p>
    </div>
  );
}
