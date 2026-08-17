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
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Create a five-story office building, approximately 6,000 m², with a central core and open office floors.",
  "Generate a four-story research center with laboratories around the exterior, support spaces internally, two vertical service cores, and a large central collaboration atrium.",
  "A small three-story neighbourhood office building. Make it efficient and inexpensive to construct.",
  "A six storey residential block with a central core and two levels of basement parking.",
];

interface Props {
  /** The prompt travels with the result: design options are regenerated from it. */
  onGenerated: (result: GenerationResult, prompt: string) => void;
  /** Persistent project rules honoured by this generation (§120). */
  designRules?: string[];
}

export function GeneratePanel({ onGenerated, designRules }: Props) {
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
        designRules,
        signal: controller.signal,
        onStage: (event) =>
          setStages((previous) =>
            previous.some((s) => s.stage === event.stage && s.detail === event.detail)
              ? previous
              : [...previous, event],
          ),
      });
      onGenerated(result, prompt.trim());
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
  }, [prompt, floors, area, busy, designRules, onGenerated]);

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
