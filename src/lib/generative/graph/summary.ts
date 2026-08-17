// src/lib/generative/graph/summary.ts
//
// Builds the compact semantic digest handed to the reasoning layer.
//
// Never send the geometry database (brief §49). A five-storey office is ~3,000
// BIM elements; serialising them would cost a fortune, blow the context window,
// and tell the model nothing it can act on. What it needs is counts, ratios,
// strategy names and outstanding violations — the same things an architect
// would read off a drawing set before advising.

import type { BuildingSpec } from "../spec/building-spec";
import type { GeneratedBuilding } from "../generate/types";
import type { BimSummary, ConstraintViolationSummary } from "../provider/types";
import type { ConstraintViolation } from "../validate/rules";
import type { BimElement } from "@/lib/bim/model/types";

export function toViolationSummaries(
  violations: ConstraintViolation[],
  limit = 25,
): ConstraintViolationSummary[] {
  return violations.slice(0, limit).map((v) => ({
    code: v.code,
    priority: v.priority,
    severity: v.severity,
    message: v.message,
    // Cap ids: a violation touching 400 columns must not become 400 lines of
    // prompt. The UI still has the full list from the validation report.
    elementIds: v.elementIds.slice(0, 8),
    ...(v.floorNo !== undefined ? { floorNo: v.floorNo } : {}),
  }));
}

export function buildBimSummary(input: {
  buildingPk: string;
  spec: BuildingSpec;
  building: GeneratedBuilding;
  elements: BimElement[];
  violations: ConstraintViolation[];
}): BimSummary {
  const { spec, building, elements } = input;

  const elementCounts: Record<string, number> = {};
  for (const element of elements) {
    elementCounts[element.category] = (elementCounts[element.category] ?? 0) + 1;
  }

  // Locked systems are what the model is forbidden to touch, so they must be
  // stated explicitly rather than inferred from element flags downstream.
  const lockedSystems = [
    ...new Set(
      elements
        .filter((e) => e.locked === true && e.system)
        .map((e) => e.system as string),
    ),
  ].sort();

  return {
    buildingPk: input.buildingPk,
    floors: building.metrics.floorCount,
    grossAreaSqm: building.metrics.grossAreaSqm,
    netAreaSqm: building.metrics.netAreaSqm,
    buildingHeightMm: Math.round(building.metrics.buildingHeightM * 1000),
    gridXMm: spec.structure.gridXMm.value,
    gridZMm: spec.structure.gridZMm.value,
    coreStrategy: spec.core.strategy.value,
    circulationRatio: building.metrics.circulationRatio,
    spaceCounts: building.metrics.spaceCountByType,
    elementCounts,
    violations: toViolationSummaries(input.violations),
    lockedSystems,
  };
}
