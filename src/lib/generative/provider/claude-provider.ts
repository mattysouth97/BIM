// src/lib/generative/provider/claude-provider.ts
//
// SERVER ONLY. This module reads ANTHROPIC_API_KEY and must never be imported
// from a client component (brief §66). `import "server-only"` turns a mistaken
// client import into a build error rather than a leaked key.
//
// Structured output is obtained by FORCING a tool call whose input_schema is
// generated from the same Zod schema used to validate the reply
// (`toolInputSchema`). Schema and contract cannot drift, and we never parse
// prose or fenced JSON out of free text.

import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import {
  BuildingPatchSchema,
  BuildingReviewSchema,
  BuildingSpecSchema,
  toolInputSchema,
  type BuildingPatch,
  type BuildingReview,
  type BuildingSpec,
} from "../spec/building-spec";
import { defaultsReferenceTable } from "../spec/defaults";
import {
  ProviderError,
  type BIMReasoningProvider,
  type BimSummary,
  type GenerationRequest,
  type ModificationRequest,
  type ProviderResult,
  type RepairRequest,
} from "./types";

const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_SCHEMA_RETRIES = 2;

function resolveModel(): string {
  return process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;
}

/* ------------------------------------------------------------------ */
/* System prompts                                                      */
/* ------------------------------------------------------------------ */

const ROLE = `You are the architectural reasoning engine inside a generative BIM authoring system.

You decide WHAT should exist, WHY it should exist, WHERE it should exist, HOW elements
relate, and WHAT constraints apply.

A deterministic procedural engine downstream owns exact geometry, topology, intersections,
boolean operations and meshes. You therefore NEVER emit coordinates, vertices, polygons,
element ids or mesh data. You emit a parametric specification only.

HARD RULES
- Millimetres for every linear dimension. Integers. Areas are m².
- No vague quantities. Never "large lobby" — always an explicit number.
- Every value you were not explicitly given must be marked INFERRED, DERIVED or DEFAULT
  with an honest confidence and a one-sentence architectural reason. Only mark a value
  USER_PROVIDED when the user actually stated it.
- Anything important you assumed must ALSO appear in the assumptions array, so the user
  can review, modify or lock it.
- Buildings must be architecturally coherent: levels stack, the core is continuous, the
  structural grid is regular, rooms reach circulation, and the program fits the plate.
- You are producing a plausible design proposal. You must NOT imply code compliance,
  permit approval, structural certification or fire certification.`;

function generationSystemPrompt(designRules: string[] | undefined): string {
  const rules =
    designRules && designRules.length > 0
      ? `\n\nPERSISTENT PROJECT DESIGN RULES (already agreed — honour every one):\n${designRules
          .map((r) => `- ${r}`)
          .join("\n")}`
      : "";

  return `${ROLE}

${defaultsReferenceTable()}

Use the reference table as a starting point, not a straitjacket — deviate when the brief
justifies it, and say so in the reason field.

SIZING GUIDANCE
- If the user gives a total area, divide by floors to get the plate, then snap the plate to
  whole structural bays.
- Keep plate depth within the per-use maximum so the plan stays daylight-reasonable.
- Core area should land near the per-use core ratio and must fit inside the plate.
- Program areas per level must sum to no more than the net area of that level. Leave room
  for circulation at roughly the per-use circulation ratio.

PROGRAM GUIDANCE
- Declare program as requirements with adjacency intent. Do NOT place rooms; the solver does.
- Always include circulation and at least one restroom group on occupied levels.
- Mark truly non-negotiable requirements P0, ordinary requirements P1, strong preferences
  P2, optimisations P3.${rules}

Call the \`emit_building_spec\` tool exactly once. Do not write prose.`;
}

const MODIFY_SYSTEM = `${ROLE}

You are modifying an EXISTING building. You receive its specification and a compact summary
of what was actually built.

Return the SMALLEST patch that satisfies the request.

\`scope\` names the part of the SPECIFICATION your operations edit — not the downstream
consequences. Adding a level edits "/levels", so scope is "levels", even though the core,
structure, facade and roof will all extend as a result. A dependency engine downstream works
out what has to regenerate; do not widen scope to describe knock-on effects. Choose "building"
only when your operations genuinely touch several unrelated subtrees.

List in \`affectedFloorNos\` only the levels your operations directly address.

You must not modify anything in the locked list. If the request cannot be satisfied without
touching locked state, patch as far as you legitimately can and explain the limit in
\`rationale\`.

Paths in operations are slash-delimited against the BuildingSpec, e.g.
"/core/offsetXMm", "/levels/3/floorToFloorMm", "/facade/sides/1/glazingRatio".
Array elements are addressed by index. Use "insert" with a "/-" suffix to append.

Call the \`emit_building_patch\` tool exactly once. Do not write prose.`;

const REPAIR_SYSTEM = `${ROLE}

Deterministic validators found problems in a generated building. Propose the minimal patch
that resolves the listed violations without introducing new ones.

Fix the highest-priority violations first (P0 before P1 before P2). Do not touch locked
state. If a violation cannot be repaired parametrically, leave it and say so in
\`rationale\` — an honest unresolved violation shown to the user is better than a patch
that pretends.

Call the \`emit_building_patch\` tool exactly once. Do not write prose.`;

const REVIEW_SYSTEM = `${ROLE}

You are reviewing a building that has ALREADY been generated. You receive its specification
and a summary of the real generated state.

Your explanation must describe THIS building using the numbers you were given. Do not invent
architectural commentary and do not restate generic principles. If the summary says
circulation is 17%, say 17%.

Call the \`emit_building_review\` tool exactly once. Do not write prose.`;

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export class ClaudeReasoningProvider implements BIMReasoningProvider {
  readonly name = "claude";
  private client: Anthropic | null = null;

  isAvailable(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  private getClient(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ProviderError(
        "NO_CREDENTIALS",
        "ANTHROPIC_API_KEY is not configured on the server.",
      );
    }
    this.client ??= new Anthropic({ apiKey });
    return this.client;
  }

  /**
   * One forced tool call, validated against `schema`. On a schema failure we
   * hand the actual Zod issues back to the model and let it correct itself,
   * which is far more reliable than a blind retry. After the retry budget is
   * exhausted we fail loudly rather than returning a half-valid spec.
   */
  private async callTool<T>(input: {
    system: string;
    userContent: Anthropic.Messages.ContentBlockParam[];
    toolName: string;
    toolDescription: string;
    schema: z.ZodType<T>;
    maxTokens: number;
    signal?: AbortSignal;
  }): Promise<ProviderResult<T>> {
    const client = this.getClient();
    const model = resolveModel();
    const started = Date.now();

    const tool: Anthropic.Messages.Tool = {
      name: input.toolName,
      description: input.toolDescription,
      input_schema: toolInputSchema(
        input.schema as unknown as z.ZodType,
      ) as Anthropic.Messages.Tool.InputSchema,
    };

    const messages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: input.userContent },
    ];

    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: string | null = null;

    for (let attempt = 0; attempt <= MAX_SCHEMA_RETRIES; attempt += 1) {
      let response: Anthropic.Messages.Message;
      try {
        response = await client.messages.create(
          {
            model,
            max_tokens: input.maxTokens,
            system: input.system,
            tools: [tool],
            tool_choice: { type: "tool", name: input.toolName },
            messages,
          },
          { signal: input.signal },
        );
      } catch (error) {
        throw toProviderError(error);
      }

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;
      stopReason = response.stop_reason;

      const block = response.content.find(
        (c): c is Anthropic.Messages.ToolUseBlock =>
          c.type === "tool_use" && c.name === input.toolName,
      );

      if (!block) {
        throw new ProviderError(
          "UPSTREAM_ERROR",
          "Model did not return the required tool call.",
          `stop_reason=${response.stop_reason}`,
        );
      }

      const parsed = input.schema.safeParse(block.input);
      if (parsed.success) {
        return {
          data: parsed.data,
          trace: {
            provider: this.name,
            model,
            latencyMs: Date.now() - started,
            inputTokens,
            outputTokens,
            stopReason,
            retries: attempt,
          },
        };
      }

      if (attempt === MAX_SCHEMA_RETRIES) {
        throw new ProviderError(
          "SCHEMA_VALIDATION_FAILED",
          "Model output failed schema validation after retries.",
          formatIssues(parsed.error),
        );
      }

      // Feed the concrete violations back for self-correction.
      messages.push(
        { role: "assistant", content: response.content },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: `Schema validation failed. Fix exactly these problems and call ${input.toolName} again:\n${formatIssues(parsed.error)}`,
            },
          ],
        },
      );
    }

    // Unreachable: the loop either returns or throws.
    throw new ProviderError("UPSTREAM_ERROR", "Exhausted schema retries.");
  }

  async generateBuilding(
    request: GenerationRequest,
  ): Promise<ProviderResult<BuildingSpec>> {
    const hints = request.hints ?? {};
    const hintLines = Object.entries(hints)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `- ${k}: ${v}`);

    const content: Anthropic.Messages.ContentBlockParam[] = [];

    for (const image of request.images ?? []) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: image.mediaType as "image/png",
          data: image.base64,
        },
      });
    }

    content.push({
      type: "text",
      text: [
        `DESIGN REQUEST:\n${request.prompt}`,
        hintLines.length
          ? `\nEXPLICIT USER PARAMETERS (these are USER_PROVIDED):\n${hintLines.join("\n")}`
          : "\nThe user gave no explicit parameters. Infer a complete, coherent building and be honest about every assumption.",
        request.images?.length
          ? "\nThe attached image is DESIGN EVIDENCE only. Do not treat anything in it as a measurement; any dimension you take from it is INFERRED with reduced confidence."
          : "",
        `\ngenerationSeed must be exactly ${request.seed}.`,
        "schemaVersion must be 1 and units must be \"mm\".",
      ]
        .filter(Boolean)
        .join("\n"),
    });

    return this.callTool({
      system: generationSystemPrompt(request.designRules),
      userContent: content,
      toolName: "emit_building_spec",
      toolDescription:
        "Emit the complete parametric building specification. Every dimension in millimetres.",
      schema: BuildingSpecSchema,
      maxTokens: 16_000,
      signal: request.signal,
    });
  }

  async modifyBuilding(
    request: ModificationRequest,
  ): Promise<ProviderResult<BuildingPatch>> {
    return this.callTool({
      system: MODIFY_SYSTEM,
      userContent: [
        {
          type: "text",
          text: [
            `INSTRUCTION:\n${request.instruction}`,
            `\nEDIT SCOPE: ${request.scope.kind} — ${request.scope.label}`,
            request.scope.floorNos?.length
              ? `Selected levels: ${request.scope.floorNos.join(", ")}`
              : "",
            `\nLOCKED (must not change): ${request.locked.length ? request.locked.join(", ") : "nothing"}`,
            request.designRules?.length
              ? `\nPERSISTENT DESIGN RULES:\n${request.designRules.map((r) => `- ${r}`).join("\n")}`
              : "",
            `\nCURRENT SPECIFICATION:\n${JSON.stringify(request.spec)}`,
            `\nBUILT MODEL SUMMARY:\n${JSON.stringify(request.summary)}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      toolName: "emit_building_patch",
      toolDescription:
        "Emit the minimal patch to the building specification that satisfies the instruction.",
      schema: BuildingPatchSchema,
      maxTokens: 8_000,
      signal: request.signal,
    });
  }

  async repairBuilding(
    request: RepairRequest,
  ): Promise<ProviderResult<BuildingPatch>> {
    return this.callTool({
      system: REPAIR_SYSTEM,
      userContent: [
        {
          type: "text",
          text: [
            `REPAIR ATTEMPT ${request.attempt}.`,
            `\nVIOLATIONS:\n${JSON.stringify(request.violations)}`,
            `\nLOCKED (must not change): ${request.locked.length ? request.locked.join(", ") : "nothing"}`,
            `\nCURRENT SPECIFICATION:\n${JSON.stringify(request.spec)}`,
            `\nBUILT MODEL SUMMARY:\n${JSON.stringify(request.summary)}`,
          ].join("\n"),
        },
      ],
      toolName: "emit_building_patch",
      toolDescription:
        "Emit the minimal patch that resolves the listed constraint violations.",
      schema: BuildingPatchSchema,
      maxTokens: 6_000,
      signal: request.signal,
    });
  }

  async evaluateBuilding(
    summary: BimSummary,
    spec: BuildingSpec,
  ): Promise<ProviderResult<BuildingReview>> {
    return this.callTool({
      system: REVIEW_SYSTEM,
      userContent: [
        {
          type: "text",
          text: [
            `BUILT MODEL SUMMARY:\n${JSON.stringify(summary)}`,
            `\nDESIGN INTENT:\n${JSON.stringify(spec.designIntent)}`,
            `\nKEY DECISIONS:\n${JSON.stringify({
              massing: spec.massing,
              core: spec.core,
              structure: spec.structure,
            })}`,
          ].join("\n"),
        },
      ],
      toolName: "emit_building_review",
      toolDescription:
        "Explain why this building looks the way it does, using only the supplied state.",
      schema: BuildingReviewSchema,
      maxTokens: 3_000,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 30)
    .map((issue) => `- ${issue.path.join("/") || "(root)"}: ${issue.message}`)
    .join("\n");
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;

  if (error instanceof Anthropic.APIError) {
    if (error.status === 429) {
      return new ProviderError("RATE_LIMITED", "Anthropic rate limit reached.", error.message);
    }
    return new ProviderError(
      "UPSTREAM_ERROR",
      "The reasoning service returned an error.",
      `${error.status ?? "?"}: ${error.message}`,
    );
  }

  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return new ProviderError("CANCELLED", "Generation was cancelled.");
    }
    return new ProviderError("UPSTREAM_ERROR", "Reasoning request failed.", error.message);
  }

  return new ProviderError("UPSTREAM_ERROR", "Reasoning request failed.");
}
