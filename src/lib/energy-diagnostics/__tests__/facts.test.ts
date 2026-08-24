import { describe, expect, it } from "vitest";

import {
  assertMaterialFactsHaveProvenance,
  createEnergyFact,
  findFactById,
  replaceFact,
  resolveFactCandidates,
  SOURCE_PRIORITY,
} from "../facts";
import { getEnergyDiagnosticFixture } from "../fixtures";
import {
  assertCanonicalEnergyModelReady,
  validateCanonicalEnergyModel,
} from "../validation";

const NOW = "2026-01-01T00:00:00.000Z";

describe("energy fact provenance and source priority", () => {
  it("implements the documented eight-level source-of-truth order", () => {
    expect(Object.values(SOURCE_PRIORITY)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("keeps a visible conflict while selecting the stronger schedule value", () => {
    const annotation = sourcedFact(
      "opening.W01.widthM",
      1.5,
      "drawing_annotation",
      "drawing_text",
      "annotation",
    );
    const schedule = sourcedFact(
      "opening.W01.widthM",
      1.8,
      "explicit_schedule_or_specification",
      "schedule_table",
      "schedule",
    );
    const resolution = resolveFactCandidates({
      key: "opening.W01.widthM",
      candidates: [annotation, schedule],
      blocking: true,
      downstreamImpact: "Window area and solar gains",
      createdAt: NOW,
    });

    expect(resolution.selected.value).toBe(1.8);
    expect(resolution.selected.status).toBe("conflicted");
    expect(resolution.conflict?.candidates.map((candidate) => candidate.fact.value)).toEqual([
      1.8,
      1.5,
    ]);
    expect(resolution.conflict?.resolutionStatus).toBe("auto_selected_visible");
  });

  it("keeps an auto-selected blocking conflict compile-blocking until a user resolves it", () => {
    const baseline = getEnergyDiagnosticFixture("fixture-a").model;
    const construction = baseline.envelope.constructions[0];
    const current = construction.uValueWPerM2K;
    const alternative = createEnergyFact({
      id: `${current.id}:alternative`,
      key: current.key,
      value: (current.value ?? 0) + 0.1,
      unit: current.unit,
      status: "extracted",
      confidence: 0.95,
      sourceRefs: current.sourceRefs,
      extractionMethod: "drawing_text",
      authority: "drawing_annotation",
      createdAt: NOW,
    });
    const resolution = resolveFactCandidates({
      key: current.key,
      candidates: [current, alternative],
      affectedObjectIds: [construction.id],
      blocking: true,
      downstreamImpact: "Envelope heat transfer",
      createdAt: NOW,
    });
    expect(resolution.conflict).not.toBeNull();
    if (!resolution.conflict) throw new Error("Expected a blocking conflict.");

    const autoSelectedModel = {
      ...baseline,
      conflicts: [resolution.conflict],
    };
    const autoSelectedValidation = validateCanonicalEnergyModel(autoSelectedModel);
    const blockingIssue = autoSelectedValidation.issues.find(
      (issue) => issue.code === "SIMULATION_BLOCKING_CONFLICT",
    );
    expect(autoSelectedValidation.validForSimulation).toBe(false);
    expect(blockingIssue).toMatchObject({ severity: "error", category: "envelope" });
    expect(autoSelectedValidation.blockingIssueIds).toContain(blockingIssue?.id);
    expect(() => assertCanonicalEnergyModelReady(autoSelectedModel)).toThrow(
      /not simulation-ready/i,
    );

    const userResolvedModel = {
      ...autoSelectedModel,
      conflicts: [{
        ...resolution.conflict,
        resolutionStatus: "user_resolved" as const,
        resolvedAt: NOW,
      }],
    };
    const userResolvedValidation = validateCanonicalEnergyModel(userResolvedModel);
    expect(userResolvedValidation.validForSimulation).toBe(true);
    expect(userResolvedValidation.issues.map((issue) => issue.code)).not.toContain(
      "SIMULATION_BLOCKING_CONFLICT",
    );
    expect(() => assertCanonicalEnergyModelReady(userResolvedModel)).not.toThrow();
  });

  it("rejects a material value that has no source, user input, or assumption", () => {
    expect(() =>
      createEnergyFact({
        key: "envelope.wall.uValue",
        value: 0.3,
        status: "extracted",
        confidence: 0.8,
        sourceRefs: [],
        extractionMethod: "drawing_text",
        authority: "drawing_annotation",
        createdAt: NOW,
      }),
    ).toThrow(/needs source evidence/i);
  });

  it("purely replaces every nested and flat copy of a confirmed fact", () => {
    const baseline = getEnergyDiagnosticFixture("fixture-a").model;
    const original = baseline.envelope.constructions[0].uValueWPerM2K;
    const replacement = createEnergyFact({
      id: original.id,
      key: original.key,
      value: 0.22,
      unit: original.unit,
      status: "user_confirmed",
      confidence: 1,
      sourceRefs: [],
      extractionMethod: "user_input",
      authority: "user_confirmed_project_value",
      reviewedByUser: true,
      createdAt: NOW,
    });
    const changed = replaceFact(baseline, replacement);

    expect(changed).not.toBe(baseline);
    expect(baseline.envelope.constructions[0].uValueWPerM2K.value).toBe(0.35);
    expect(changed.envelope.constructions[0].uValueWPerM2K).toBe(replacement);
    expect(findFactById(changed, original.id)).toBe(replacement);
  });

  it("rejects an assumption-only fact when its catalog reference is dangling", () => {
    const baseline = getEnergyDiagnosticFixture("fixture-a").model;
    const original = baseline.envelope.infiltrationAirChangesPerHour;
    const danglingAssumptionId = "assumption.missing-from-catalog";
    const changed = replaceFact(baseline, {
      ...original,
      status: "defaulted",
      confidence: 0.7,
      sourceRefs: [],
      extractionMethod: "project_default",
      authority: "project_template",
      assumptionId: danglingAssumptionId,
      reviewedByUser: false,
      updatedAt: NOW,
    });

    expect(() => assertMaterialFactsHaveProvenance(changed)).toThrow(
      new RegExp(`unknown assumption ${danglingAssumptionId}`),
    );
    const validation = validateCanonicalEnergyModel(changed);
    const issue = validation.issues.find(
      (candidate) => candidate.code === "PROVENANCE_DANGLING_ASSUMPTION",
    );
    expect(validation.validForSimulation).toBe(false);
    expect(issue).toMatchObject({ severity: "error", category: "envelope" });
    expect(issue?.factIds).toContain(original.id);
    expect(validation.blockingIssueIds).toContain(issue?.id);
  });

  it("accepts an assumption reference only when the model catalog contains it", () => {
    const baseline = getEnergyDiagnosticFixture("fixture-a").model;
    const original = baseline.envelope.infiltrationAirChangesPerHour;
    const assumptionId = "assumption.catalogued-infiltration";
    const changed = replaceFact(baseline, {
      ...original,
      status: "defaulted",
      confidence: 0.7,
      sourceRefs: [],
      extractionMethod: "project_default",
      authority: "project_template",
      assumptionId,
      reviewedByUser: false,
      updatedAt: NOW,
    });
    const catalogued = {
      ...changed,
      assumptions: [
        ...changed.assumptions,
        {
          id: assumptionId,
          key: original.key,
          title: "Catalogued infiltration basis",
          explanation: "Fixture-only provenance registration.",
          trigger: "Referenced by the controlled test fact.",
          scopeObjectIds: [changed.building.id],
          method: "project_default" as const,
          simulationImpact: "Affects envelope air exchange.",
          reversible: true as const,
        },
      ],
    };

    expect(() => assertMaterialFactsHaveProvenance(catalogued)).not.toThrow();
    const validation = validateCanonicalEnergyModel(catalogued);
    expect(validation.issues.map((issue) => issue.code)).not.toContain(
      "PROVENANCE_DANGLING_ASSUMPTION",
    );
    expect(validation.validForSimulation).toBe(true);
  });

  it("all controlled-fixture material facts retain a traceable origin", () => {
    for (const fixtureId of [
      "fixture-a",
      "fixture-b",
      "fixture-c",
      "fixture-d",
      "fixture-e",
    ] as const) {
      expect(() =>
        assertMaterialFactsHaveProvenance(getEnergyDiagnosticFixture(fixtureId).model),
      ).not.toThrow();
    }
  });
});

function sourcedFact(
  key: string,
  value: number,
  authority: "drawing_annotation" | "explicit_schedule_or_specification",
  extractionMethod: "drawing_text" | "schedule_table",
  suffix: string,
) {
  return createEnergyFact({
    key,
    value,
    unit: "m",
    status: "extracted",
    confidence: 0.95,
    sourceRefs: [{
      id: `source-${suffix}`,
      documentId: `document-${suffix}`,
      drawingRevision: "A",
      extractionRunId: "run-1",
    }],
    extractionMethod,
    authority,
    createdAt: NOW,
  });
}
