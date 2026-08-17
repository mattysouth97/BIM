// src/lib/generative/__tests__/provider-resolution.test.ts
//
// Coverage for resolveReasoningProvider() (src/lib/generative/provider/index.ts)
// — previously untested. This is the single seam that decides whether the
// app talks to Claude or falls back to the deterministic heuristic engine,
// so its selection/fallback/caching contract deserves direct tests rather
// than only being exercised incidentally through API routes.
//
// @vitest-environment node
//
// Env is stubbed per-test with vi.stubEnv/vi.unstubAllEnvs (vitest 4) so
// nothing leaks into other suites — same convention as claude-provider.test.ts
// and the vworld route tests. The module-level `cached` provider instance in
// provider/index.ts is reset via resetProviderCache() in afterEach for the
// same reason: it would otherwise silently carry a provider chosen under one
// test's env into the next test.

import { afterEach, describe, expect, it, vi } from "vitest";

import { resetProviderCache, resolveReasoningProvider } from "../provider";
import { ClaudeReasoningProvider } from "../provider/claude-provider";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";

afterEach(() => {
  vi.unstubAllEnvs();
  resetProviderCache();
});

describe("resolveReasoningProvider — default selection by credential presence", () => {
  it("returns the heuristic provider when ANTHROPIC_API_KEY is unset and nothing is forced", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("BIM_REASONING_PROVIDER", "");

    const provider = resolveReasoningProvider();

    expect(provider).toBeInstanceOf(HeuristicReasoningProvider);
    expect(provider.name).toBe("heuristic");
  });

  it("returns the Claude provider (construction only, no network call) when ANTHROPIC_API_KEY is present", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-123");
    vi.stubEnv("BIM_REASONING_PROVIDER", "");

    const provider = resolveReasoningProvider();

    expect(provider).toBeInstanceOf(ClaudeReasoningProvider);
    expect(provider.name).toBe("claude");
  });
});

describe("resolveReasoningProvider — BIM_REASONING_PROVIDER override", () => {
  it('forcing "heuristic" wins even when a key is present', () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-123");
    vi.stubEnv("BIM_REASONING_PROVIDER", "heuristic");

    const provider = resolveReasoningProvider();

    expect(provider).toBeInstanceOf(HeuristicReasoningProvider);
    expect(provider.name).toBe("heuristic");
  });

  it('forcing "claude" (uppercase, whitespace) selects Claude when a key is present', () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-123");
    vi.stubEnv("BIM_REASONING_PROVIDER", "  CLAUDE  ");

    const provider = resolveReasoningProvider();

    expect(provider).toBeInstanceOf(ClaudeReasoningProvider);
    expect(provider.name).toBe("claude");
  });

  it('forcing "claude" without a key still degrades to heuristic rather than returning an unusable provider', () => {
    // Documents the real contract in provider/index.ts: `forced === "claude"`
    // only opens the door to trying Claude — `cached = claude.isAvailable()
    // ? claude : new HeuristicReasoningProvider()` still gates on the actual
    // key, so a missing key degrades to a working building (module header
    // comment) instead of a provider that would throw NO_CREDENTIALS on
    // first use.
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("BIM_REASONING_PROVIDER", "claude");

    const provider = resolveReasoningProvider();

    expect(provider).toBeInstanceOf(HeuristicReasoningProvider);
    expect(provider.name).toBe("heuristic");
  });
});

describe("resolveReasoningProvider — module-level cache", () => {
  it("returns the SAME instance across calls without resetProviderCache()", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("BIM_REASONING_PROVIDER", "");

    const first = resolveReasoningProvider();
    const second = resolveReasoningProvider();

    expect(second).toBe(first);
  });

  it("does not react to an env change until resetProviderCache() is called", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("BIM_REASONING_PROVIDER", "");
    const cachedFromNoKey = resolveReasoningProvider();
    expect(cachedFromNoKey.name).toBe("heuristic");

    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-123");
    const stillCached = resolveReasoningProvider();

    expect(stillCached).toBe(cachedFromNoKey);
    expect(stillCached.name).toBe("heuristic");
  });

  it("picks up a changed env and returns a NEW instance after resetProviderCache()", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("BIM_REASONING_PROVIDER", "");
    const before = resolveReasoningProvider();
    expect(before).toBeInstanceOf(HeuristicReasoningProvider);

    resetProviderCache();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-123");
    const after = resolveReasoningProvider();

    expect(after).not.toBe(before);
    expect(after).toBeInstanceOf(ClaudeReasoningProvider);
  });
});
