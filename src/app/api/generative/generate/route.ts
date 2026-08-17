// src/app/api/generative/generate/route.ts
//
// POST /api/generative/generate
//
// Runs the full generation pipeline and streams progress as Server-Sent Events
// so the client can show the building forming stage by stage instead of a
// spinner (brief §52, §70).
//
// The Anthropic key is read here, on the server, and never leaves it. The
// response contains a BuildingSpec, a BuildingRecipe and a BIM snapshot — no
// credentials, and no raw upstream error text.

import { NextRequest } from "next/server";
import { z } from "zod";

import { resolveReasoningProvider, ProviderError } from "@/lib/generative/provider";
import { compileSpecToRecipe } from "@/lib/generative/compile/spec-to-recipe";
import { generateBuildingFromSpec } from "@/lib/generative/generate/pipeline";
import { emitSnapshot } from "@/lib/generative/graph/emit";
import { validateBuilding } from "@/lib/generative/validate/rules";
import { deriveDesignStatus } from "@/lib/generative/spec/status";
import { seedFromPrompt } from "@/lib/generative/rng";

// Generation calls a reasoning model and can take a minute; never cache it.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RequestSchema = z.object({
  prompt: z.string().min(3).max(4_000),
  buildingPk: z.string().min(1).max(120).default("generated"),
  seed: z.number().int().min(0).max(2_147_483_647).optional(),
  hints: z
    .object({
      use: z.string().max(40).optional(),
      floors: z.number().int().min(1).max(120).optional(),
      grossAreaSqm: z.number().min(20).max(2_000_000).optional(),
      siteWidthMm: z.number().int().min(1_000).max(2_000_000).optional(),
      siteDepthMm: z.number().int().min(1_000).max(2_000_000).optional(),
      floorToFloorMm: z.number().int().min(2_200).max(12_000).optional(),
      structuralSystem: z.string().max(40).optional(),
      style: z.string().max(120).optional(),
    })
    .optional(),
  designRules: z.array(z.string().max(300)).max(40).optional(),
});

type SseEvent =
  | { type: "stage"; stage: string; label: string; index: number; total: number; detail?: string }
  | { type: "result"; payload: unknown }
  | { type: "error"; code: string; message: string };

function sse(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Body must be JSON." } },
      { status: 400 },
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "The generation request was not valid.",
          detail: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
      },
      { status: 400 },
    );
  }

  const { prompt, buildingPk, hints, designRules } = parsed.data;
  const seed = parsed.data.seed ?? seedFromPrompt(prompt);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SseEvent) => controller.enqueue(encoder.encode(sse(event)));

      try {
        /* --- 1. reasoning --- */
        send({
          type: "stage",
          stage: "interpreting",
          label: "Interpreting design intent",
          index: 0,
          total: 12,
        });

        const provider = resolveReasoningProvider();
        const { data: spec, trace } = await provider.generateBuilding({
          prompt,
          hints,
          seed,
          designRules,
          signal: request.signal,
        });

        send({
          type: "stage",
          stage: "program",
          label: "Building program created",
          index: 1,
          total: 12,
        });

        /* --- 2. deterministic geometry --- */
        const building = generateBuildingFromSpec(spec, (progress) => {
          send({
            type: "stage",
            stage: progress.stage,
            label: progress.label,
            // Offset by the two reasoning stages already reported.
            index: progress.index + 2,
            total: 12,
            detail: progress.detail,
          });
        });

        /* --- 3. compile to the shared geometry engine --- */
        const compiled = compileSpecToRecipe(spec);

        /* --- 4. semantic BIM graph --- */
        const generationId = `GEN-${String(seed % 10_000).padStart(4, "0")}`;
        const snapshot = emitSnapshot({
          buildingPk,
          generationId,
          spec,
          building,
        });

        /* --- 5. deterministic validation --- */
        send({
          type: "stage",
          stage: "validating",
          label: "Validating building",
          index: 11,
          total: 12,
        });
        const validation = validateBuilding(building, spec);

        const status = deriveDesignStatus({
          hasGeometry: snapshot.elements.length > 0,
          criticalViolations: validation.counts.critical,
          warningViolations: validation.counts.warning,
          // No jurisdictional ruleset has been supplied, so the model can never
          // be promoted past GEOMETRICALLY_VALIDATED here.
          jurisdictionRulesetId: null,
        });

        send({
          type: "result",
          payload: {
            success: true,
            generationId,
            seed,
            spec,
            recipe: compiled.recipe,
            snapshot,
            metrics: building.metrics,
            validation,
            status,
            approximations: compiled.approximations,
            provider: {
              name: trace.provider,
              model: trace.model,
              latencyMs: trace.latencyMs,
              inputTokens: trace.inputTokens,
              outputTokens: trace.outputTokens,
              retries: trace.retries,
            },
          },
        });
      } catch (error) {
        // Surface an actionable code, never raw upstream text (§95).
        if (error instanceof ProviderError) {
          send({ type: "error", code: error.code, message: error.message });
        } else if (error instanceof Error && error.name === "AbortError") {
          send({ type: "error", code: "CANCELLED", message: "Generation was cancelled." });
        } else {
          console.error("[generative] generation failed", error);
          send({
            type: "error",
            code: "GENERATION_FAILED",
            message: "The building could not be generated.",
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
