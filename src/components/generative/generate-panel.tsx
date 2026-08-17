"use client";

// src/components/generative/generate-panel.tsx
//
// The GENERATE BUILDING experience: a large natural-language input, optional
// parameters behind progressive disclosure, staged progress while the building
// forms, and an honest post-generation summary (brief §51, §52, §12).
//
// This is a command surface, not a chat. There is no transcript, no avatar and
// no assistant persona — the building is the interface.

import { useCallback, useRef, useState } from "react";

import {
  generateBuilding,
  GenerationError,
  type GenerationResult,
  type StageEvent,
} from "@/lib/generative/client";
import { STATUS_LABEL } from "@/lib/generative/spec/status";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Create a five-story office building, approximately 6,000 m², with a central core and open office floors.",
  "Generate a four-story research center with laboratories around the exterior, support spaces internally, two vertical service cores, and a large central collaboration atrium.",
  "A small three-story neighbourhood office building. Make it efficient and inexpensive to construct.",
  "A six storey residential block with a central core and two levels of basement parking.",
];

interface Props {
  onGenerated: (result: GenerationResult) => void;
}

export function GeneratePanel({ onGenerated }: Props) {
  const [prompt, setPrompt] = useState("");
  const [showOptional, setShowOptional] = useState(false);
  const [floors, setFloors] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [stages, setStages] = useState<StageEvent[]>([]);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    setStages([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await generateBuilding({
        prompt: prompt.trim(),
        hints: {
          ...(floors ? { floors: Number(floors) } : {}),
          ...(area ? { grossAreaSqm: Number(area) } : {}),
        },
        signal: controller.signal,
        onStage: (event) =>
          setStages((previous) =>
            previous.some((s) => s.stage === event.stage && s.detail === event.detail)
              ? previous
              : [...previous, event],
          ),
      });
      onGenerated(result);
    } catch (caught) {
      if (caught instanceof GenerationError) {
        setError({ code: caught.code, message: caught.message });
      } else if ((caught as Error)?.name === "AbortError") {
        setError({ code: "CANCELLED", message: "Generation cancelled." });
      } else {
        setError({
          code: "UNKNOWN",
          message: "Something went wrong while generating the building.",
        });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [prompt, floors, area, busy, onGenerated]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Generate a building</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe what you want to build. Everything not stated is inferred and shown
          to you afterwards.
        </p>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={5}
        disabled={busy}
        aria-label="Describe the building you want to create"
        placeholder="A six-story office building with a central core, flexible floor plates and a south-facing curtain wall."
        className="w-full resize-y rounded-md border bg-background p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void run();
        }}
      />

      {!busy && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="rounded-full border px-3 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
            >
              {example.length > 52 ? `${example.slice(0, 52)}…` : example}
            </button>
          ))}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowOptional((v) => !v)}
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          aria-expanded={showOptional}
        >
          Optional parameters {showOptional ? "−" : "+"}
        </button>
        {showOptional && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Number of floors</span>
              <input
                type="number"
                min={1}
                max={120}
                value={floors}
                onChange={(e) => setFloors(e.target.value)}
                className="rounded border bg-background px-2 py-1 font-mono text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Approx. gross area (m²)</span>
              <input
                type="number"
                min={20}
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="rounded border bg-background px-2 py-1 font-mono text-sm"
              />
            </label>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !prompt.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate building"}
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="rounded-md border px-3 py-2 text-sm"
          >
            Cancel
          </button>
        )}
      </div>

      {stages.length > 0 && (
        <ol className="flex flex-col gap-1 font-mono text-xs" aria-live="polite">
          {stages.map((stage, index) => {
            const done = index < stages.length - 1 || !busy;
            return (
              <li
                key={`${stage.stage}-${stage.detail ?? ""}`}
                className={cn(
                  "flex items-center gap-2",
                  done ? "text-muted-foreground" : "text-foreground",
                )}
              >
                <span aria-hidden>{done ? "✓" : "●"}</span>
                <span>
                  {stage.label}
                  {stage.detail ? ` — ${stage.detail}` : ""}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {error && (
        <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
          <p className="font-medium">{error.message}</p>
          {error.code === "NO_CREDENTIALS" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Set ANTHROPIC_API_KEY on the server, or set
              BIM_REASONING_PROVIDER=heuristic to generate offline.
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Code: {error.code}</p>
        </div>
      )}
    </div>
  );
}

/** Post-generation summary. Deliberately compact — not every object (§12). */
export function GenerationSummary({ result }: { result: GenerationResult }) {
  const m = result.metrics;
  const rows: Array<[string, string]> = [
    ["Floors", String(m.floorCount)],
    ["Gross area", `${Math.round(m.grossAreaSqm).toLocaleString()} m²`],
    ["Net area", `${Math.round(m.netAreaSqm).toLocaleString()} m²`],
    ["Height", `${m.buildingHeightM.toFixed(1)} m`],
    ["Spaces", String(m.roomCount)],
    ["Structural bay", `${(result.spec.structure.gridXMm.value / 1000).toFixed(1)} m`],
    ["Circulation", `${(m.circulationRatio * 100).toFixed(1)}%`],
    ["Window-to-wall", `${(m.windowToWallRatio * 100).toFixed(0)}%`],
    ["Doors", String(m.doorCount)],
    ["Windows", String(m.windowCount)],
    ["Columns", String(m.columnCount)],
  ];

  return (
    <div className="flex flex-col gap-4 p-4 text-sm">
      <div>
        <h2 className="text-base font-medium">{result.spec.project.name}</h2>
        {/* Status is derived from evidence and can never read "approved" (§10). */}
        <span className="mt-1 inline-block rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide">
          {STATUS_LABEL[result.status.level]}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between border-b py-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {result.validation.violations.length > 0 && (
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Issues ({result.validation.counts.critical} critical ·{" "}
            {result.validation.counts.warning} warning ·{" "}
            {result.validation.counts.advisory} advisory)
          </h3>
          <ul className="mt-2 flex flex-col gap-1 text-xs">
            {result.validation.violations.slice(0, 12).map((v, i) => (
              <li key={`${v.code}-${i}`} className="flex gap-2">
                <span className="font-mono text-[10px] uppercase text-muted-foreground">
                  {v.severity}
                </span>
                <span>{v.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Design assumptions ({result.spec.assumptions.length})
        </h3>
        <ul className="mt-2 flex flex-col gap-2 text-xs">
          {result.spec.assumptions.map((a) => (
            <li key={a.id} className="border-l-2 pl-2">
              <div className="font-medium">{a.label}</div>
              <div className="text-muted-foreground">{a.statement}</div>
              <div className="font-mono text-[10px] uppercase text-muted-foreground">
                {a.source.replace("_", " ")} · confidence{" "}
                {(a.confidence * 100).toFixed(0)}%
              </div>
            </li>
          ))}
        </ul>
      </section>

      {result.approximations.length > 0 && (
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Approximations
          </h3>
          <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
            {result.approximations.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="font-mono text-[10px] text-muted-foreground">
        {result.generationId} · seed {result.seed} · {result.provider.name}
        {result.provider.model ? ` (${result.provider.model})` : ""} ·{" "}
        {(result.provider.latencyMs / 1000).toFixed(1)}s
      </p>
    </div>
  );
}
