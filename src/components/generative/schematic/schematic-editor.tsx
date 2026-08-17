"use client";

// src/components/generative/schematic/schematic-editor.tsx
//
// The schematic workspace: draw on the left, read the consequences on the
// right, generate from the bottom.
//
// GENERATE BIM runs the drawn blueprint through the same deterministic chain a
// prompt goes through — minus the reasoning call, because a schematic is
// already semantic. The button is disabled while the blueprint carries a P0
// issue: the server refuses those anyway, and a button that only fails is
// worse than a button that says why it cannot run.

import { useCallback, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { preservationPlan } from "@/lib/generative/blueprint";
import {
  GenerationError,
  generateFromBlueprint,
  type BlueprintGenerationResult,
  type StageEvent,
} from "@/lib/generative/client";
import { cn } from "@/lib/utils";
import {
  activeImportOf,
  fidelityForDesign,
  useBlueprintStore,
} from "@/store/blueprint-store";

import { SchematicCanvas } from "./schematic-canvas";
import { SchematicInspector } from "./schematic-inspector";
import { SchematicToolbar } from "./schematic-toolbar";

interface Props {
  /**
   * Adopted by the studio exactly as a prompt generation is. The intent string
   * travels with it and becomes the session brief — empty when the user drew
   * without writing one, which is the honest answer to "what was the brief?".
   */
  onGenerated: (result: BlueprintGenerationResult, intent: string) => void;
  buildingPk?: string;
  locks?: string[];
  /**
   * `DesignState.generationId` of the design currently on screen, when there is
   * one. It is what binds the retained fidelity report to a building: the
   * report is shown only while the design it measured is still the design being
   * looked at. Absent on the start screen, where no building exists yet.
   */
  designGenerationId?: string | null;
  /** Bumped by the plan view's fidelity badge to reveal the report. */
  fidelityFocusToken?: number;
  /** Override the generate button; default is "Generate BIM". */
  generateLabel?: string;
  generateBusyLabel?: string;
}

export function SchematicEditor({
  onGenerated,
  buildingPk,
  locks,
  designGenerationId = null,
  fidelityFocusToken,
  generateLabel = "Generate BIM",
  generateBusyLabel = "Generating…",
}: Props) {
  const blueprint = useBlueprintStore((s) => s.blueprint);
  const validation = useBlueprintStore((s) => s.validation);
  const lastGenerated = useBlueprintStore((s) => s.lastGenerated);
  // Null once history is undone back past the import, so the panel never claims
  // a file the working blueprint no longer came from.
  const importProvenance = useBlueprintStore(activeImportOf);
  // Derived per render from the blueprint, not through a store selector: a
  // selector that builds a new object every call breaks the store's snapshot
  // identity check.
  const preservation = useMemo(() => preservationPlan(blueprint), [blueprint]);

  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [stages, setStages] = useState<StageEvent[]>([]);
  const [error, setError] = useState<{
    code: string;
    message: string;
    detail?: string;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const blocking = validation.violations.filter((v) => v.priority === "P0");
  const hasBoundary = blueprint.boundaries.length > 0;
  const canGenerate = !busy && hasBoundary && blocking.length === 0;

  const run = useCallback(async () => {
    const store = useBlueprintStore.getState();
    if (busy) return;

    setBusy(true);
    setError(null);
    setStages([]);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await generateFromBlueprint({
        blueprint: store.blueprint,
        ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
        ...(buildingPk ? { buildingPk } : {}),
        locks: locks ?? [],
        signal: controller.signal,
        onStage: (event) =>
          setStages((previous) =>
            previous.some((s) => s.stage === event.stage && s.detail === event.detail)
              ? previous
              : [...previous, event],
          ),
      });

      store.noteGenerated({
        generationId: result.generationId,
        blueprint: result.blueprint,
        blueprintValidation: result.blueprintValidation,
        compiledLocks: result.compiledLocks,
        // Kept with the blueprint it measured, not recomputed here: the client
        // has neither the generated geometry nor any business re-deriving it.
        fidelity: result.fidelity,
      });
      onGenerated(result, prompt.trim());
    } catch (caught) {
      if (caught instanceof GenerationError) {
        setError({
          code: caught.code,
          message: caught.message,
          ...(caught.detail ? { detail: caught.detail } : {}),
        });
      } else if ((caught as Error)?.name === "AbortError") {
        setError({ code: "CANCELLED", message: "Generation cancelled." });
      } else {
        setError({
          code: "UNKNOWN",
          message: "Something went wrong while generating from the schematic.",
        });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [busy, prompt, buildingPk, locks, onGenerated]);

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <SchematicToolbar />
        <div className="min-h-0 flex-1">
          <SchematicCanvas />
        </div>

        <div className="flex flex-col gap-2 border-t px-3 py-2">
          <div className="flex items-center gap-2">
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              disabled={busy}
              placeholder="Optional: what this building is for. Sets design intent and enables design options; it moves no geometry."
              aria-label="Optional design intent"
              className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button size="sm" onClick={() => void run()} disabled={!canGenerate}>
              {busy ? generateBusyLabel : generateLabel}
            </Button>
            {busy && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => abortRef.current?.abort()}
              >
                Cancel
              </Button>
            )}
          </div>

          {!hasBoundary && (
            <p className="text-[11px] text-muted-foreground">
              Draw a boundary first — it is the floor plate, and nothing can be
              generated without one.
            </p>
          )}
          {hasBoundary && blocking.length > 0 && (
            <p className="text-[11px] text-destructive">
              {blocking.length} blocking issue(s) in the schematic. Generation would have
              to guess what you meant, so it will not run.
            </p>
          )}

          {stages.length > 0 && (
            <ol className="flex flex-wrap gap-x-3 font-mono text-[10px]" aria-live="polite">
              {stages.map((stage, index) => {
                const done = index < stages.length - 1 || !busy;
                return (
                  <li
                    key={`${stage.stage}-${stage.detail ?? ""}`}
                    className={cn(
                      "flex items-center gap-1",
                      done ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    <span aria-hidden>{done ? "✓" : "●"}</span>
                    {stage.label}
                    {stage.detail ? ` — ${stage.detail}` : ""}
                  </li>
                );
              })}
            </ol>
          )}

          {error && (
            <div
              role="alert"
              className="rounded border border-destructive/40 px-2 py-1.5 text-xs"
            >
              <p className="font-medium">{error.message}</p>
              {error.detail && (
                <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] text-muted-foreground">
                  {error.detail}
                </pre>
              )}
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                {error.code}
              </p>
            </div>
          )}
        </div>
      </div>

      <aside className="hidden w-[340px] shrink-0 overflow-y-auto border-l xl:block">
        <SchematicInspector
          blueprint={blueprint}
          validation={validation}
          preservation={preservation}
          importProvenance={importProvenance}
          fidelity={fidelityForDesign(lastGenerated, designGenerationId)}
          fidelityFocusToken={fidelityFocusToken}
          onFidelityChange={(mode) =>
            useBlueprintStore.getState().setFidelityMode(mode)
          }
          onSelect={(id) => useBlueprintStore.getState().select(id)}
        />
      </aside>
    </div>
  );
}
