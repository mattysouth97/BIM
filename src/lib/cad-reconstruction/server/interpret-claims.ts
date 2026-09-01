// src/lib/cad-reconstruction/server/interpret-claims.ts
//
// SERVER ONLY. Reads a free-text statement into typed reconstruction claims.
//
// The reasoning model reads INTENT — which facts the sentence contains and how
// firmly they are held. It never returns coordinates, and it cannot promote a
// guess: everything it emits is re-validated by `normaliseProvidedClaims`,
// which re-derives the grade from the user's own words.
//
// A deployment without ANTHROPIC_API_KEY still works. The deterministic parser
// is the fallback, not a stub, so the prompt module is never a dead button.

import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { toolInputSchema } from "@/lib/generative/spec/building-spec";

import { normaliseProvidedClaims, parseClaimStatements } from "../claims";
import type { ReconstructionClaim } from "../types";

const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_STATEMENT_CHARS = 4000;

const CLAIM_KINDS = [
  "overall_width_m",
  "overall_depth_m",
  "footprint_area_sqm",
  "site_area_sqm",
  "building_height_m",
  "floor_to_floor_m",
  "storeys_above",
  "storeys_below",
  "wall_thickness_mm",
  "window_ratio",
  "entrance_orientation",
  "core_position",
  "roof_form",
  "structure",
] as const;

const ClaimSchema = z.object({
  kind: z.enum(CLAIM_KINDS),
  numericValue: z
    .number()
    .nullable()
    .describe("Value in the canonical unit for this kind, or null for a categorical claim."),
  categoricalValue: z
    .string()
    .nullable()
    .describe(
      'For entrance_orientation and core_position: north|east|south|west|centre. ' +
        'For roof_form: flat|gable|hip|sloped. For structure: rc|src|steel|masonry|timber. ' +
        "null otherwise.",
    ),
  measured: z
    .boolean()
    .describe(
      "True ONLY when the user says the value was measured, surveyed, or read off a document.",
    ),
  quote: z
    .string()
    .describe("The user's own words this claim was read from, copied verbatim."),
  reason: z.string().describe("One short sentence, in the user's language, on how you read it."),
});

const ClaimsSchema = z.object({
  claims: z.array(ClaimSchema).max(24),
  /** Anything the sentence says that is not a typed claim. */
  unreadable: z.array(z.string()).max(8),
});

const SYSTEM = `You read one statement from a building owner or surveyor and extract the
typed facts it contains, for an evidence-to-CAD reconstruction pipeline.

CANONICAL UNITS
- overall_width_m, overall_depth_m, building_height_m, floor_to_floor_m: metres
- footprint_area_sqm, site_area_sqm: square metres (1 평 = 3.305785 m²)
- wall_thickness_mm: millimetres
- window_ratio: a fraction between 0 and 1
- storeys_above, storeys_below: whole counts

HARD RULES
- Extract ONLY what the statement actually says. Never infer a second dimension
  from one, never complete a rectangle, never fill a plausible default.
- \`quote\` must be copied verbatim from the statement. Do not paraphrase it.
- \`measured\` is true only when the user says the value was measured, surveyed,
  taken with a tape or laser, or read off a drawing or document. A belief, an
  estimate, "about", "대략", "정도" — all false.
- One claim per kind. If the statement contradicts itself, emit the first value
  and put the contradiction in \`unreadable\`.
- Values you cannot express as a typed claim go into \`unreadable\` verbatim.
  Do not force them into a kind.
- You emit no coordinates and no geometry. A deterministic solver downstream
  owns every dimension, polygon and drawing.

Call the \`emit_reconstruction_claims\` tool exactly once. Do not write prose.`;

export type InterpretClaimsOutcome =
  | {
      ok: true;
      payload: {
        claims: ReconstructionClaim[];
        reader: "claude" | "deterministic";
        model: string | null;
        unreadable: string[];
      };
    }
  | { ok: false; code: string; message: string; detail?: string };

const BodySchema = z.object({
  statement: z.string().min(1).max(MAX_STATEMENT_CHARS),
});

/** Claims the deterministic parser found for kinds the model did not cover. */
function mergeClaims(
  primary: ReconstructionClaim[],
  fallback: ReconstructionClaim[],
): ReconstructionClaim[] {
  const kinds = new Set(primary.map((c) => c.kind));
  const merged = [
    ...primary,
    ...fallback.filter((c) => c.kind !== "note" && !kinds.has(c.kind)),
  ];
  return merged.map((c, i) => ({
    ...c,
    id: `CLAIM-${String(i + 1).padStart(3, "0")}`,
  }));
}

export function isClaudeAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function interpretClaims(
  body: unknown,
  options: { signal?: AbortSignal } = {},
): Promise<InterpretClaimsOutcome> {
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "statement must be a non-empty string of at most 4000 characters.",
    };
  }

  const statement = parsed.data.statement;
  const deterministic = parseClaimStatements(statement);

  if (!isClaudeAvailable()) {
    return {
      ok: true,
      payload: {
        claims: deterministic,
        reader: "deterministic",
        model: null,
        unreadable: [],
      },
    };
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const model = process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;
    const response = await client.messages.create(
      {
        model,
        max_tokens: 2000,
        system: SYSTEM,
        tools: [
          {
            name: "emit_reconstruction_claims",
            description:
              "Emit the typed facts contained in the statement, with the user's own words.",
            input_schema: toolInputSchema(
              ClaimsSchema,
            ) as Anthropic.Messages.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: "emit_reconstruction_claims" },
        messages: [{ role: "user", content: `STATEMENT:\n${statement}` }],
      },
      { signal: options.signal },
    );

    const block = response.content.find((c) => c.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      return {
        ok: true,
        payload: {
          claims: deterministic,
          reader: "deterministic",
          model: null,
          unreadable: [],
        },
      };
    }

    const validated = ClaimsSchema.safeParse(block.input);
    if (!validated.success) {
      return {
        ok: true,
        payload: {
          claims: deterministic,
          reader: "deterministic",
          model: null,
          unreadable: [],
        },
      };
    }

    const provided = normaliseProvidedClaims(
      validated.data.claims.map((c) => ({
        kind: c.kind,
        value: c.numericValue ?? c.categoricalValue,
        measured: c.measured,
        quote: c.quote,
        reason: c.reason,
      })),
      statement,
    );

    return {
      ok: true,
      payload: {
        claims: mergeClaims(provided, deterministic),
        reader: "claude",
        model,
        unreadable: validated.data.unreadable,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, code: "CANCELLED", message: "Request cancelled." };
    }
    // An upstream failure degrades to the deterministic reader rather than
    // failing the user's request — the offline path is a real path.
    return {
      ok: true,
      payload: {
        claims: deterministic,
        reader: "deterministic",
        model: null,
        unreadable: [
          err instanceof Error
            ? `모델 호출에 실패하여 규칙 기반 해석을 사용했습니다: ${err.message}`
            : "모델 호출에 실패하여 규칙 기반 해석을 사용했습니다.",
        ],
      },
    };
  }
}
