// src/lib/engine/steps/score.ts
import type {
  ElementConfidence,
  GeneratedElement,
  HitlFlag,
  SourceKind,
  ValidationReport,
} from "../types";
import { ENGINE_CONSTANTS } from "../types";

const GEOM_SCORE: Partial<Record<SourceKind, number>> = {
  "cad-exact": 1.0,
  "cad-converted": 0.85,
  "cad-traced": 0.70,
  "vworld-measured": 0.80,
};

const HEIGHT_SCORE: Partial<Record<SourceKind, number>> = {
  ledger: 1.0,
  "vworld-measured": 0.80,
  manual: 0.70,
  "era-estimate": 0.50,
};

// Windows are never measured directly — this table caps their geometry score
// by facade provenance. "era-estimate" (the only source Slice-2 actually
// produces) is pinned to ENGINE_CONSTANTS.FACADE_ESTIMATE_SCORE (0.5) so a
// window's sconf always lands below HITL_THRESHOLD (0.85), per the plan.
// The other entries are reserved for future finer-grained facade sources.
const FACADE_SCORE: Partial<Record<SourceKind, number>> = {
  "era-estimate": ENGINE_CONSTANTS.FACADE_ESTIMATE_SCORE,
  "cad-exact": 0.9,
  "cad-converted": 0.8,
  "cad-traced": 0.65,
  "vworld-measured": 0.75,
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function score(
  elements: GeneratedElement[],
  validation: ValidationReport
): { elements: ElementConfidence[]; hitlFlags: HitlFlag[] } {
  const implicatedIds = new Set<number>();
  for (const check of validation.checks) {
    if (!check.passed && check.elementIds) {
      for (const id of check.elementIds) implicatedIds.add(id);
    }
  }

  const scoredElements: ElementConfidence[] = [];
  const hitlFlags: HitlFlag[] = [];

  for (const element of elements) {
    let geomScore = GEOM_SCORE[element.geomSource] ?? 0;
    // Slice-3: the entrance door is a heuristic placement exactly like a
    // window (never measured) — scored identically via the same
    // FACADE_SCORE table so it can never clear HITL_THRESHOLD either.
    if (element.kind === "window" || element.kind === "door") {
      const facadeScore = FACADE_SCORE[element.facadeSource ?? "era-estimate"] ?? 0;
      geomScore = Math.min(geomScore, facadeScore);
    }
    const heightScore = HEIGHT_SCORE[element.heightSource] ?? 0;
    const topologyPenalty = implicatedIds.has(element.expressId)
      ? ENGINE_CONSTANTS.TOPOLOGY_PENALTY
      : 0;
    const sconf = clamp01(
      ENGINE_CONSTANTS.W_GEOM * geomScore +
        ENGINE_CONSTANTS.W_HEIGHT * heightScore -
        topologyPenalty
    );

    scoredElements.push({
      expressId: element.expressId,
      kind: element.kind,
      sconf,
      geomScore,
      heightScore,
      topologyPenalty,
    });

    if (sconf < ENGINE_CONSTANTS.HITL_THRESHOLD) {
      const weakestDriver =
        element.kind === "window"
          ? "facade (estimated window placement)"
          : element.kind === "door"
            ? "entrance (estimated door placement)"
            : topologyPenalty > 0
              ? "topology"
              : geomScore <= heightScore
                ? "geometry"
                : "height";
      hitlFlags.push({
        expressId: element.expressId,
        kind: element.kind,
        sconf,
        reason: `low confidence (${sconf.toFixed(2)}) — weakest driver: ${weakestDriver}`,
      });
    }
  }

  return { elements: scoredElements, hitlFlags };
}
