// src/lib/generative/__tests__/interpret-server.test.ts
//
// runBlueprintInterpretation — the server module behind POST /api/generative/
// interpret. Exercises the whole seam without an HTTP request: a segment
// sketch goes in, either a real BlueprintSpec (with its assumptions,
// uncertainties and validation report riding along unfiltered) comes out, or
// a structured refusal does — same contract discipline as
// blueprint-generate-server.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addBoundary,
  emptyBlueprint,
  makeRectLoop,
  type BlueprintSpec,
  type PointMm,
} from "../blueprint";
import { resetProviderCache, resolveReasoningProvider } from "../provider";
import { runBlueprintInterpretation } from "../server/interpret";

const pt = (xMm: number, zMm: number): PointMm => ({ xMm, zMm });

/** Chain closed line segments through consecutive points, wrapping to the first. */
function ring(points: PointMm[]): Array<{ startMm: PointMm; endMm: PointMm }> {
  return points.map((start, i) => ({ startMm: start, endMm: points[(i + 1) % points.length] }));
}

/** An L-shaped outline (84 m²) with a small unlabeled 3×3 m hole cut into it. */
function lShapedSketch(): { segments: Array<{ startMm: PointMm; endMm: PointMm }> } {
  const outline = ring([
    pt(0, 0),
    pt(10_000, 0),
    pt(10_000, 6_000),
    pt(6_000, 6_000),
    pt(6_000, 10_000),
    pt(0, 10_000),
  ]);
  const hole = ring([pt(2_000, 2_000), pt(5_000, 2_000), pt(5_000, 5_000), pt(2_000, 5_000)]);
  return { segments: [...outline, ...hole] };
}

beforeEach(() => {
  // Deterministic regardless of whether a real ANTHROPIC_API_KEY happens to be
  // set in the environment running the suite — this file tests the SEAM
  // (request → provider → validation), not Claude's wire format, which is
  // claude-provider.live.test.ts's job.
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("BIM_REASONING_PROVIDER", "heuristic");
  resetProviderCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetProviderCache();
});

describe("runBlueprintInterpretation", () => {
  it("reads a real boundary off an L-shaped segment sketch, with the reader's uncertainty surfaced", async () => {
    const outcome = await runBlueprintInterpretation(lShapedSketch());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const { payload } = outcome;
    expect(payload.success).toBe(true);
    expect(payload.blueprint.boundaries).toHaveLength(1);
    expect(payload.blueprint.boundaries[0].loop.segments).toHaveLength(6);
    expect(payload.blueprint.source).toBe("dxf");

    // The unlabeled hole cannot be classified with certainty, and that honesty
    // has to survive all the way to this payload, not get summarized away.
    expect(Array.isArray(payload.uncertainties)).toBe(true);
    expect(payload.uncertainties.length).toBeGreaterThan(0);
    expect(Array.isArray(payload.assumptions)).toBe(true);
    expect(payload.assumptions.length).toBeGreaterThan(0);

    expect(payload.violations).toEqual([]);
    expect(payload.provider.name).toBe("heuristic");
  });

  it("is deterministic: the same sketch interprets to the same blueprint twice", async () => {
    const a = await runBlueprintInterpretation(lShapedSketch());
    const b = await runBlueprintInterpretation(lShapedSketch());
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(JSON.stringify(a.payload.blueprint)).toBe(JSON.stringify(b.payload.blueprint));
  });

  it("rejects a malformed body with a structured error, not a crash", async () => {
    const outcome = await runBlueprintInterpretation({ nope: true });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("INVALID_REQUEST");
    expect(outcome.detail).toBeTruthy();
  });

  it("rejects an empty segment list rather than fabricating a boundary", async () => {
    const outcome = await runBlueprintInterpretation({ segments: [] });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("INVALID_REQUEST");
  });

  it("falls back to the deterministic heuristic reader when no credentials are configured", async () => {
    const provider = resolveReasoningProvider();
    expect(provider.name).toBe("heuristic");

    const outcome = await runBlueprintInterpretation(lShapedSketch());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.payload.provider.name).toBe("heuristic");
    expect(outcome.payload.blueprint.boundaries).toHaveLength(1);
  });

  it("surfaces a genuinely unclosed sketch as INTERPRETATION_FAILED, never a fabricated boundary", async () => {
    const outcome = await runBlueprintInterpretation({
      segments: [{ startMm: pt(0, 0), endMm: pt(1_000, 0) }],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("INTERPRETATION_FAILED");
  });

  it("surfaces validation violations from the interpreted spec rather than swallowing them", async () => {
    // The heuristic reader itself cannot be coaxed into an uncalibrated scale
    // (it always reads segments as absolute mm), so the ONE thing this test
    // needs to prove — that a violation on the returned spec reaches the
    // payload untouched — is exercised by substituting the provider's result,
    // not by inventing a synthetic reading of `interpretBlueprint` itself.
    const provider = resolveReasoningProvider();
    const uncalibrated: BlueprintSpec = (() => {
      const spec = addBoundary(emptyBlueprint("Uncalibrated import"), {
        loop: makeRectLoop("plate", { xMm: 0, zMm: 0, widthMm: 10_000, depthMm: 8_000 }),
        floorNos: [1],
      });
      return { ...spec, coordinateSystem: { ...spec.coordinateSystem, calibrated: false } };
    })();

    const spy = vi.spyOn(provider, "interpretBlueprint").mockResolvedValue({
      data: uncalibrated,
      trace: {
        provider: "heuristic",
        model: "deterministic",
        latencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        stopReason: null,
        retries: 0,
      },
    });

    try {
      const outcome = await runBlueprintInterpretation(lShapedSketch());
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.payload.violations.some((v) => v.code === "SCALE_UNCALIBRATED")).toBe(
        true,
      );
    } finally {
      spy.mockRestore();
    }
  });
});
