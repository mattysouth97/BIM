/**
 * @vitest-environment node
 *
 * Offline coverage for ClaudeReasoningProvider — never a live API call (see
 * claude-provider.live.test.ts for that, opt-in via RUN_LIVE_API=1). This
 * file only exercises paths that resolve before any network request:
 * credential gating.
 */
import { afterEach, describe, expect, it } from "vitest";

import { ClaudeReasoningProvider } from "../provider/claude-provider";
import { ProviderError } from "../provider/types";

describe("ClaudeReasoningProvider — offline behaviour", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("reports unavailable without a configured key", () => {
    delete process.env.ANTHROPIC_API_KEY;
    const provider = new ClaudeReasoningProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it("interpretBlueprint fails with NO_CREDENTIALS rather than attempting a network call (segments)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const provider = new ClaudeReasoningProvider();

    await expect(
      provider.interpretBlueprint({
        kind: "segments",
        segments: [
          { startMm: { xMm: 0, zMm: 0 }, endMm: { xMm: 1_000, zMm: 0 } },
          { startMm: { xMm: 1_000, zMm: 0 }, endMm: { xMm: 1_000, zMm: 1_000 } },
          { startMm: { xMm: 1_000, zMm: 1_000 }, endMm: { xMm: 0, zMm: 1_000 } },
          { startMm: { xMm: 0, zMm: 1_000 }, endMm: { xMm: 0, zMm: 0 } },
        ],
      }),
    ).rejects.toMatchObject(expect.objectContaining({ code: "NO_CREDENTIALS" }));
  });

  it("interpretBlueprint fails with NO_CREDENTIALS on the image path too — gated before vision matters", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const provider = new ClaudeReasoningProvider();

    const rejection = provider.interpretBlueprint({
      kind: "image",
      mediaType: "image/png",
      dataBase64: "AAAA",
    });
    await expect(rejection).rejects.toBeInstanceOf(ProviderError);
    await expect(rejection).rejects.toMatchObject(
      expect.objectContaining({ code: "NO_CREDENTIALS" }),
    );
  });
});
