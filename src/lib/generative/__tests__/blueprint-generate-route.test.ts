// POST /api/generative/generate-from-blueprint, exercised as a real request.
//
// The server function is tested separately; this asserts the wire contract the
// browser client depends on — SSE frames, one result, and a structured error
// event (never a 200 with an empty body) when the schematic does not resolve.

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/generative/generate-from-blueprint/route";
import {
  addBoundary,
  emptyBlueprint,
  makeRectLoop,
  type BlueprintSpec,
} from "../blueprint";

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/generative/generate-from-blueprint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Every `data:` frame of an SSE response, parsed. */
async function readEvents(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .map((frame) => frame.split("\n").find((line) => line.startsWith("data: ")))
    .filter((line): line is string => Boolean(line))
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
}

function rectBlueprint(): BlueprintSpec {
  return addBoundary(emptyBlueprint("Route schematic"), {
    loop: makeRectLoop("plate", { xMm: 0, zMm: 0, widthMm: 24_000, depthMm: 18_000 }),
    floorNos: [1, 2],
  });
}

describe("POST /api/generative/generate-from-blueprint", () => {
  it("streams stages and one result for a valid schematic", async () => {
    const response = await POST(post({ blueprint: rectBlueprint(), seed: 11 }));
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");

    const events = await readEvents(response);
    expect(events.filter((event) => event.type === "stage").length).toBeGreaterThan(3);

    const results = events.filter((event) => event.type === "result");
    expect(results).toHaveLength(1);

    const payload = results[0].payload as Record<string, unknown>;
    expect(payload.success).toBe(true);
    expect(payload.seed).toBe(11);
    expect(payload.blueprint).toBeTruthy();
    expect(payload.blueprintValidation).toBeTruthy();
    expect(Array.isArray(payload.compiledLocks)).toBe(true);
  });

  it("emits a structured error event, with the report, for an open loop", async () => {
    const blueprint = rectBlueprint();
    const segments = blueprint.boundaries[0].loop.segments.map((segment, index) =>
      index === 0 && segment.kind === "line"
        ? { ...segment, endMm: { xMm: 23_000, zMm: 400 } }
        : segment,
    );
    const broken: BlueprintSpec = {
      ...blueprint,
      boundaries: [
        { ...blueprint.boundaries[0], loop: { ...blueprint.boundaries[0].loop, segments } },
      ],
    };

    const events = await readEvents(await POST(post({ blueprint: broken })));
    expect(events.some((event) => event.type === "result")).toBe(false);

    const error = events.find((event) => event.type === "error");
    expect(error?.code).toBe("BLUEPRINT_INVALID");
    expect(String(error?.detail)).toContain("BOUNDARY_NOT_CLOSED");

    const report = error?.blueprintValidation as
      | { blueprintValid: boolean; violations: Array<{ code: string }> }
      | undefined;
    expect(report?.blueprintValid).toBe(false);
    expect(report?.violations.some((v) => v.code === "BOUNDARY_NOT_CLOSED")).toBe(true);
  });

  it("rejects a malformed envelope before the stream opens", async () => {
    const response = await POST(post({ blueprint: rectBlueprint(), seed: -4 }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("reports a non-blueprint body as an error event, not a crash", async () => {
    const events = await readEvents(await POST(post({ blueprint: { nope: true } })));
    const error = events.find((event) => event.type === "error");
    expect(error?.code).toBe("INVALID_BLUEPRINT");
  });
});
