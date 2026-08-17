// src/lib/generative/server/stream.ts
//
// The Server-Sent Events envelope shared by every generative route.
//
// Generation, modification and repair all take long enough that a spinner is a
// lie about progress (brief §52, §70) — each streams its stages. They also all
// have the same failure surface: a structured code the UI can act on, never raw
// upstream text (§65, §95). Both live here so a new route cannot accidentally
// invent a third error vocabulary.

import { ProviderError } from "../provider/types";

export type SseEvent =
  | {
      type: "stage";
      stage: string;
      label: string;
      index: number;
      total: number;
      detail?: string;
    }
  | { type: "result"; payload: unknown }
  | { type: "error"; code: string; message: string; detail?: string };

export type Send = (event: SseEvent) => void;

function frame(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Codes whose `detail` WE wrote and can therefore show.
 *
 * Everything else — an upstream 4xx body, a rate-limit message, an SDK
 * stringification — is the vendor's text, and §65/§95 say it does not cross this
 * boundary. It is logged server-side instead, where it is actually useful.
 */
const SAFE_DETAIL_CODES = new Set(["SCHEMA_VALIDATION_FAILED"]);

/** Map any thrown value onto a code the client is allowed to see. */
export function toErrorEvent(error: unknown, fallbackCode: string): SseEvent {
  if (error instanceof ProviderError) {
    const showDetail = error.detail && SAFE_DETAIL_CODES.has(error.code);
    if (error.detail && !showDetail) {
      console.error(`[generative] ${error.code}: ${error.detail}`);
    }
    return {
      type: "error",
      code: error.code,
      message: error.message,
      ...(showDetail ? { detail: error.detail } : {}),
    };
  }
  if (error instanceof Error && error.name === "AbortError") {
    return { type: "error", code: "CANCELLED", message: "The request was cancelled." };
  }
  console.error(`[generative] ${fallbackCode}`, error);
  return {
    type: "error",
    code: fallbackCode,
    message: "The request could not be completed.",
  };
}

export function sseResponse(
  fallbackCode: string,
  handler: (send: Send) => Promise<void>,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send: Send = (event) => {
        if (closed) return;
        controller.enqueue(encoder.encode(frame(event)));
      };

      try {
        await handler(send);
      } catch (error) {
        send(toErrorEvent(error, fallbackCode));
      } finally {
        closed = true;
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

/** Uniform 400 for a body that never reached the stream. */
export function badRequest(code: string, message: string, detail?: unknown): Response {
  return Response.json(
    { success: false, error: { code, message, ...(detail ? { detail } : {}) } },
    { status: 400 },
  );
}
