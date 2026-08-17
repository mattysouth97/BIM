// src/lib/generative/provider/index.ts
//
// Provider resolution. Claude is the default when credentials exist; the
// deterministic provider is the explicit fallback. Selection is data, not a
// hardcoded import, so a third provider slots in without touching call sites.

import "server-only";

import { ClaudeReasoningProvider } from "./claude-provider";
import { HeuristicReasoningProvider } from "./heuristic-provider";
import type { BIMReasoningProvider } from "./types";

export * from "./types";
export { HeuristicReasoningProvider } from "./heuristic-provider";

let cached: BIMReasoningProvider | null = null;

/**
 * `BIM_REASONING_PROVIDER` forces a choice ("claude" | "heuristic").
 * Otherwise: Claude when a key is present, deterministic when it is not — so a
 * missing key degrades to a working building rather than a dead button.
 */
export function resolveReasoningProvider(): BIMReasoningProvider {
  if (cached) return cached;

  const forced = process.env.BIM_REASONING_PROVIDER?.trim().toLowerCase();

  if (forced === "heuristic") {
    cached = new HeuristicReasoningProvider();
    return cached;
  }

  const claude = new ClaudeReasoningProvider();
  if (forced === "claude" || claude.isAvailable()) {
    cached = claude.isAvailable() ? claude : new HeuristicReasoningProvider();
    return cached;
  }

  cached = new HeuristicReasoningProvider();
  return cached;
}

/** Tests mutate env between cases. */
export function resetProviderCache(): void {
  cached = null;
}

/** Safe to surface in the UI — reports capability without exposing secrets. */
export function providerStatus(): {
  name: string;
  usingFallback: boolean;
  model: string | null;
} {
  const provider = resolveReasoningProvider();
  return {
    name: provider.name,
    usingFallback: provider.name !== "claude",
    model: provider.name === "claude" ? (process.env.CLAUDE_MODEL ?? "claude-sonnet-5") : null,
  };
}
