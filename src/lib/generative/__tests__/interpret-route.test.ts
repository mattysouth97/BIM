// src/lib/generative/__tests__/interpret-route.test.ts
//
// POST /api/generative/interpret, exercised as a real request.
//
// The server module is tested separately (interpret-server.test.ts); this
// asserts the wire contract the browser client depends on — a plain JSON
// response (not streamed: one short provider call, nothing to show
// mid-flight, same shape as /evaluate) and a structured status code for
// every refusal, never a 200 with an empty body.

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/generative/interpret/route";
import { resetProviderCache } from "../provider";
import type { PointMm } from "../blueprint";

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/generative/interpret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const pt = (xMm: number, zMm: number): PointMm => ({ xMm, zMm });

function ring(points: PointMm[]): Array<{ startMm: PointMm; endMm: PointMm }> {
  return points.map((start, i) => ({ startMm: start, endMm: points[(i + 1) % points.length] }));
}

/** A closed 8 × 6 m rectangle — enough for a real boundary reading. */
function rectangleSketch() {
  return { segments: ring([pt(0, 0), pt(8_000, 0), pt(8_000, 6_000), pt(0, 6_000)]) };
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("BIM_REASONING_PROVIDER", "heuristic");
  resetProviderCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetProviderCache();
});

describe("POST /api/generative/interpret", () => {
  it("returns a real BlueprintSpec, with uncertainty/assumption/violation arrays present, for a valid sketch", async () => {
    const response = await POST(post(rectangleSketch()));
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);

    const blueprint = body.blueprint as { boundaries: unknown[] };
    expect(blueprint.boundaries).toHaveLength(1);

    expect(Array.isArray(body.uncertainties)).toBe(true);
    expect(Array.isArray(body.assumptions)).toBe(true);
    expect(Array.isArray(body.violations)).toBe(true);

    const provider = body.provider as { name: string };
    expect(provider.name).toBe("heuristic");
  });

  it("rejects a malformed body with 400 and a structured error, before any provider call", async () => {
    const response = await POST(post({ nope: true }));
    expect(response.status).toBe(400);

    const body = (await response.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("rejects a body that is not JSON with 400", async () => {
    const request = new NextRequest("http://localhost/api/generative/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("reports segments with no closed loop as a 400 INTERPRETATION_FAILED, not a crash", async () => {
    const response = await POST(
      post({ segments: [{ startMm: pt(0, 0), endMm: pt(1_000, 0) }] }),
    );
    expect(response.status).toBe(400);

    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INTERPRETATION_FAILED");
  });

  it("falls back to the heuristic reader end-to-end when no credentials are configured", async () => {
    const response = await POST(post(rectangleSketch()));
    const body = (await response.json()) as { provider: { name: string } };
    expect(body.provider.name).toBe("heuristic");
  });
});
