// src/lib/generative/build.ts
//
// Spec → building. The deterministic half of the system, in one place.
//
// Generate, modify and repair all end the same way: solve the spec into
// geometry, compile a recipe for the renderer, emit the semantic BIM graph,
// validate it, and derive an honest status. Only the FIRST step differs between
// them (what produced the spec), so that is the only thing the routes own.
//
// No model is called from here and nothing in here is random — given a spec,
// this is a pure function. That is what makes an edit reviewable: the user is
// comparing two deterministic builds, not two rolls of the dice.

import type { BimElement } from "@/lib/bim/model/types";

import { compileSpecToRecipe } from "./compile/spec-to-recipe";
import { generateBuildingFromSpec } from "./generate/pipeline";
import type { ProgressFn } from "./generate/pipeline";
import type { GeneratedBuilding } from "./generate/types";
import { emitSnapshot } from "./graph/emit";
import { buildBimSummary } from "./graph/summary";
import { applyLocksToElements, type LockToken } from "./session/locks";
import { deriveDesignStatus } from "./spec/status";
import type { BuildingSpec } from "./spec/building-spec";
import { validateBuilding } from "./validate/rules";
import type { BimSummary } from "./provider/types";
import type { BuildingRecipe } from "@/lib/procedural/types";
import type { BimModelSnapshot } from "@/lib/bim/model/types";
import type { ValidationReport } from "./validate/rules";
import type { DesignStatus } from "./spec/status";
import type { BuildingMetrics } from "./generate/types";

export interface BuiltDesign {
  generationId: string;
  recipe: BuildingRecipe;
  snapshot: BimModelSnapshot;
  metrics: BuildingMetrics;
  validation: ValidationReport;
  status: DesignStatus;
  approximations: string[];
  /** Compact digest for the reasoning layer. Never the element list (§49). */
  summary: BimSummary;
  /**
   * Server-side only. Full solver output — thousands of objects. Routes use it
   * for validation and summarisation and must not put it in the response.
   */
  building: GeneratedBuilding;
}

export function buildDesign(input: {
  spec: BuildingSpec;
  buildingPk: string;
  generationId: string;
  /** Locks stamp `locked: true` so the next regeneration preserves them (§42). */
  locks?: Iterable<LockToken>;
  /** Human-authored elements carried across the rebuild. */
  authoredElements?: BimElement[];
  onStage?: ProgressFn;
}): BuiltDesign {
  const building = generateBuildingFromSpec(input.spec, input.onStage);
  const compiled = compileSpecToRecipe(input.spec);

  const snapshot = emitSnapshot({
    buildingPk: input.buildingPk,
    generationId: input.generationId,
    spec: input.spec,
    building,
    authoredElements: input.authoredElements,
  });
  snapshot.elements = applyLocksToElements(snapshot.elements, input.locks ?? []);

  const validation = validateBuilding(building, input.spec);

  const status = deriveDesignStatus({
    hasGeometry: snapshot.elements.length > 0,
    criticalViolations: validation.counts.critical,
    warningViolations: validation.counts.warning,
    // No jurisdictional ruleset is supplied anywhere in this pipeline, so a
    // build can never be promoted past GEOMETRICALLY_VALIDATED (§10).
    jurisdictionRulesetId: null,
  });

  const summary = buildBimSummary({
    buildingPk: input.buildingPk,
    spec: input.spec,
    building,
    elements: snapshot.elements,
    violations: validation.violations,
  });

  return {
    generationId: input.generationId,
    recipe: compiled.recipe,
    snapshot,
    metrics: building.metrics,
    validation,
    status,
    approximations: compiled.approximations,
    summary,
    building,
  };
}

/**
 * Ids read as a lineage: `GEN-0042` is the first build of seed 42, `GEN-0042.3`
 * its third revision. Elements carry this, so an element's provenance says which
 * edit produced it rather than merely "generated".
 */
export function generationIdFor(seed: number, revision: number): string {
  const base = `GEN-${String(seed % 10_000).padStart(4, "0")}`;
  return revision > 0 ? `${base}.${revision}` : base;
}
