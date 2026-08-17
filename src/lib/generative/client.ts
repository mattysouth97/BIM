// src/lib/generative/client.ts
//
// Browser-side client for the generation endpoint. Consumes the SSE stream so
// the UI can show each stage as it completes rather than freezing (brief §52).
//
// Deliberately free of any Anthropic import: the key lives on the server and
// nothing here knows a model is involved.

import type { BuildingRecipe } from "@/lib/procedural/types";
import type { BimModelSnapshot } from "@/lib/bim/model/types";
import type { BuildingSpec } from "./spec/building-spec";
import type { DesignStatus } from "./spec/status";
import type { BuildingMetrics } from "./generate/types";
import type { ValidationReport } from "./validate/rules";

export interface GenerationResult {
  success: true;
  generationId: string;
  seed: number;
  spec: BuildingSpec;
  recipe: BuildingRecipe;
  snapshot: BimModelSnapshot;
  metrics: BuildingMetrics;
  validation: ValidationReport;
  status: DesignStatus;
  approximations: string[];
  provider: {
    name: string;
    model: string;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    retries: number;
  };
}

export interface StageEvent {
  stage: string;
  label: string;
  index: number;
  total: number;
  detail?: string;
}

export interface GenerateOptions {
  prompt: string;
  buildingPk?: string;
  seed?: number;
  hints?: Record<string, unknown>;
  designRules?: string[];
  onStage?: (event: StageEvent) => void;
  signal?: AbortSignal;
}

export class GenerationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GenerationError";
    this.code = code;
  }
}

export async function generateBuilding(
  options: GenerateOptions,
): Promise<GenerationResult> {
  const response = await fetch("/api/generative/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: options.prompt,
      buildingPk: options.buildingPk ?? "generated",
      seed: options.seed,
      hints: options.hints,
      designRules: options.designRules,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    // A non-200 means the request never reached the stream (bad input, etc.).
    const detail = await response.json().catch(() => null);
    throw new GenerationError(
      detail?.error?.code ?? "REQUEST_FAILED",
      detail?.error?.message ?? "The generation request was rejected.",
    );
  }

  if (!response.body) {
    throw new GenerationError("NO_STREAM", "The server returned no stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: GenerationResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; a partial frame stays buffered.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        continue;
      }

      if (event.type === "stage") {
        options.onStage?.(event as unknown as StageEvent);
      } else if (event.type === "result") {
        result = event.payload as GenerationResult;
      } else if (event.type === "error") {
        throw new GenerationError(
          String(event.code ?? "GENERATION_FAILED"),
          String(event.message ?? "Generation failed."),
        );
      }
    }
  }

  if (!result) {
    throw new GenerationError(
      "INCOMPLETE",
      "The generation stream ended before a building was produced.",
    );
  }
  return result;
}
