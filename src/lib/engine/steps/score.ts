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
    const geomScore = GEOM_SCORE[element.geomSource] ?? 0;
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
        topologyPenalty > 0
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
