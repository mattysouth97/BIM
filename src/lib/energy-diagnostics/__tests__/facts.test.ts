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

  it("all controlled-fixture material facts retain a traceable origin", () => {
    for (const fixtureId of [
      "fixture-a",
      "fixture-b",
      "fixture-c",
      "fixture-d",
      "fixture-e",
    ] as const) {
      expect(() =>
        assertMaterialFactsHaveProvenance(getEnergyDiagnosticFixture(fixtureId).model.facts),
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
