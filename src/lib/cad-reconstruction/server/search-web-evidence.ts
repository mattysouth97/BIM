// src/lib/cad-reconstruction/server/search-web-evidence.ts
//
// SERVER ONLY. Searches the open web for what is published about one building.
//
// Two design decisions worth stating, because both are about not fooling
// ourselves:
//
//   1. THE REGISTER'S VALUES ARE NOT SENT TO THE MODEL. It would be easy to
//      pass 건축물대장 figures in and ask "is this right?", and the answer would
//      be worthless — a model shown a number tends to find it. The search runs
//      blind, and the comparison happens afterwards in `webFactConflicts`,
//      which is pure and testable. An agreement is only worth something if the
//      two sides were independent.
//   2. EVERY FACT MUST SURVIVE `normaliseWebFacts`. Whatever comes back is
//      re-validated: no citation, no quote, an unknown kind or an implausible
//      number and it is dropped. The model cannot promote its own output — the
//      grade is forced to D-INFERRED downstream regardless of what it claims.
//
// Nothing here produces geometry. Web facts cross-check the register; they
// never build a drawing and never override a registered value.

import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { toolInputSchema } from "@/lib/generative/spec/building-spec";

import { normaliseWebFacts } from "../web-evidence";
import type { WebEvidenceInput } from "../types";

const DEFAULT_MODEL = "claude-opus-5";
/** Web search on Opus 5 / Sonnet 5 / Opus 4.6+ — the dynamic-filtering variant. */
const WEB_SEARCH_TOOL_TYPE = "web_search_20260209" as const;
const MAX_SEARCHES = 5;
/** A server tool can pause its turn; each resume is another round trip. */
const MAX_TURNS = 6;
const MAX_NAME_CHARS = 200;
const MAX_ADDRESS_CHARS = 300;

const FactSchema = z.object({
  kind: z
    .enum([
      "storeys_above",
      "storeys_below",
      "building_height_m",
      "footprint_area_sqm",
      "gross_area_sqm",
      "completion_year",
      "structure",
      "roof_form",
      "use",
      "name",
    ])
    .describe("Which property of the building this fact states."),
  numericValue: z
    .number()
    .nullable()
    .describe(
      "The value in the canonical unit (floors, metres, m², year) for numeric kinds; null for text kinds.",
    ),
  textValue: z
    .string()
    .nullable()
    .describe("The value for structure/roof_form/use/name; null for numeric kinds."),
  quote: z
    .string()
    .describe(
      "The sentence from the page that states this, copied VERBATIM in its original language. Never paraphrase.",
    ),
  citationUrls: z
    .array(z.string())
    .describe("URLs of the pages the quote came from. At least one, copied exactly."),
});

const ReportSchema = z.object({
  facts: z
    .array(FactSchema)
    .describe("Only facts you actually read on a retrieved page. Omit anything you did not find."),
  notFound: z
    .array(z.string())
    .describe("Properties you searched for and could not source. Plain text."),
});

const SYSTEM = `You research one specific Korean building using web search, and report only what published sources actually state about it.

Hard rules — these decide whether your output is usable at all:

- Report a fact ONLY if you retrieved a page that states it. If you did not find it, put the property in \`notFound\`. An omission is a correct answer; a guess is not.
- \`quote\` must be copied verbatim from the page, in its original language. Never translate it, never paraphrase it, never reconstruct it from memory.
- \`citationUrls\` must be URLs you actually retrieved in this session.
- NEVER infer a value from the building's name, its type, its neighbourhood, or from what buildings like it usually are. "A 근린생활시설 is usually 3-4 storeys" is not a fact about this building.
- If several sources disagree, report the one you consider best sourced and say nothing about the others. Do not average them.
- Be careful that the page is about THIS building. Korean building names repeat across the country; a name match with a different address is a different building.

You are told the building's name and address and nothing else. You are deliberately not told what the building register says, so that anything you find is independent of it. Do not ask for those values and do not speculate about them.

Search, then call \`report_building_facts\` exactly once. Do not write prose.`;

export type WebEvidenceOutcome =
  | { ok: true; payload: WebEvidenceInput & { model: string } }
  | { ok: false; code: string; message: string };

const BodySchema = z.object({
  name: z.string().trim().max(MAX_NAME_CHARS).optional(),
  address: z.string().trim().max(MAX_ADDRESS_CHARS).optional(),
});

export function isWebSearchAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function searchWebEvidence(
  body: unknown,
  options: { signal?: AbortSignal } = {},
): Promise<WebEvidenceOutcome> {
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "name and/or address must be short strings.",
    };
  }

  const name = parsed.data.name?.trim() || "";
  const address = parsed.data.address?.trim() || "";
  if (!name && !address) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "At least one of name or address is required to search.",
    };
  }

  if (!isWebSearchAvailable()) {
    return {
      ok: true,
      payload: {
        facts: [],
        query: null,
        searched: false,
        error: "웹 검색이 이 서버에 구성되어 있지 않습니다 (ANTHROPIC_API_KEY 없음).",
        model: "none",
      },
    };
  }

  const query = [name, address].filter(Boolean).join(" / ");
  const model = process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const messages: Anthropic.Messages.MessageParam[] = [
      {
        role: "user",
        content:
          `건물 이름: ${name || "(미상)"}\n주소: ${address || "(미상)"}\n\n` +
          "이 건물에 대해 공개된 자료에서 확인할 수 있는 사실만 조사해 보고하세요.",
      },
    ];

    let response = await client.messages.create(
      {
        model,
        max_tokens: 8000,
        system: SYSTEM,
        tools: [
          { type: WEB_SEARCH_TOOL_TYPE, name: "web_search", max_uses: MAX_SEARCHES },
          {
            name: "report_building_facts",
            description:
              "Report the sourced facts found about this building. Call exactly once, at the end.",
            input_schema: toolInputSchema(
              ReportSchema,
            ) as Anthropic.Messages.Tool.InputSchema,
          },
        ],
        messages,
      },
      { signal: options.signal },
    );

    // A server tool may pause the turn mid-search; resuming is the documented
    // continuation, not an error.
    let turns = 1;
    while (response.stop_reason === "pause_turn" && turns < MAX_TURNS) {
      messages.push({ role: "assistant", content: response.content });
      response = await client.messages.create(
        {
          model,
          max_tokens: 8000,
          system: SYSTEM,
          tools: [
            { type: WEB_SEARCH_TOOL_TYPE, name: "web_search", max_uses: MAX_SEARCHES },
            {
              name: "report_building_facts",
              description:
                "Report the sourced facts found about this building. Call exactly once, at the end.",
              input_schema: toolInputSchema(
                ReportSchema,
              ) as Anthropic.Messages.Tool.InputSchema,
            },
          ],
          messages,
        },
        { signal: options.signal },
      );
      turns += 1;
    }

    if (response.stop_reason === "refusal") {
      return {
        ok: true,
        payload: {
          facts: [],
          query,
          searched: true,
          error: "모델이 이 요청에 대한 응답을 거부했습니다.",
          model,
        },
      };
    }

    const block = response.content.find((c) => c.type === "tool_use");
    if (!block || block.type !== "tool_use" || block.name !== "report_building_facts") {
      // No report means nothing sourced. That is a legitimate outcome — the
      // building may simply not be written about anywhere.
      return {
        ok: true,
        payload: { facts: [], query, searched: true, error: null, model },
      };
    }

    const validated = ReportSchema.safeParse(block.input);
    if (!validated.success) {
      return {
        ok: true,
        payload: {
          facts: [],
          query,
          searched: true,
          error: "검색 결과의 형식을 해석하지 못했습니다.",
          model,
        },
      };
    }

    // Re-validated here, in the pure module, against rules the model cannot
    // influence: citation required, quote required, kind known, value plausible,
    // grade forced to D-INFERRED.
    const facts = normaliseWebFacts(
      validated.data.facts.map((f) => ({
        kind: f.kind,
        value: f.numericValue ?? f.textValue,
        quote: f.quote,
        citations: f.citationUrls.map((url) => ({ url, title: null })),
      })),
    );

    return { ok: true, payload: { facts, query, searched: true, error: null, model } };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, code: "CANCELLED", message: "Request cancelled." };
    }
    // A search failure is an ABSENT source, never an empty finding.
    return {
      ok: true,
      payload: {
        facts: [],
        query,
        searched: false,
        error:
          err instanceof Error
            ? `웹 검색에 실패했습니다: ${err.message}`
            : "웹 검색에 실패했습니다.",
        model,
      },
    };
  }
}
