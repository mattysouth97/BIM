import { describe, expect, it } from "vitest";

import {
  compileCanonicalModelToEngineInput,
  runSimulation,
} from "../adapter";
import { replaceFact } from "../facts";
import { representativeOfficeDrawingSetInputs } from "../reference-office-sources";
import {
  ingestDrawingSet,
  type DrawingSetIngestionResult,
  type DrawingSourceInput,
} from "../ingestion";
import {
  acceptTierOneScreeningAssumption,
  buildTierOneCanonicalModel,
  TIER_ONE_ASSUMPTION_ACCEPTANCE_KEY,
  TIER_ONE_OFFICE_SCREENING_TEMPLATE_V1,
  TIER_ONE_SCREENING_ASSUMPTION_ID,
} from "../tier-one-model";
import type { Point2D, Polygon2D } from "../types";
import { validateCanonicalEnergyModel } from "../validation";

const NOW = "2026-08-24T00:00:00.000Z";

function rectangle(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Polygon2D {
  return Object.freeze([
    Object.freeze([minX, minY]) as Point2D,
    Object.freeze([maxX, minY]) as Point2D,
    Object.freeze([maxX, maxY]) as Point2D,
    Object.freeze([minX, maxY]) as Point2D,
  ]);
}

function vectorPlan(
  boundaries: readonly Polygon2D[],
  overrides: Partial<DrawingSourceInput> = {},
): DrawingSourceInput {
  return Object.freeze({
    fileName: "A101-floor-plan.svg",
    mimeType: "image/svg+xml",
    content:
      '<svg xmlns="http://www.w3.org/2000/svg"><text>OFFICE FLOOR PLAN</text></svg>',
    userDocumentType: "floor_plan",
    units: "m",
    drawingScale: 1,
    vectorBoundaries: boundaries.map((polygon, index) =>
      Object.freeze({
        polygon,
        entityRef: `plan-boundary-${index + 1}`,
        confidence: 0.99,
      }),
    ),
    ...overrides,
  });
}

async function ingestSingle(
  source: DrawingSourceInput,
): Promise<DrawingSetIngestionResult> {
  return ingestDrawingSet([source], {
    setName: "Tier-1 uploaded plan",
    ingestedAt: NOW,
  });
}

describe("Tier-1 canonical screening model", () => {
  it("creates one stable storey from one calibrated floor boundary and requires acceptance", async () => {
    const source = representativeOfficeDrawingSetInputs()[0];
    const ingestion = await ingestSingle(source);

    const outcome = buildTierOneCanonicalModel(ingestion, "en", NOW);
    expect(outcome.status).toBe("created");
    if (outcome.status !== "created") return;
    const { model } = outcome;

    expect(model.drawingSet.documents).toHaveLength(1);
    expect(model.drawingSet.tier).toBe(1);
    expect(model.geometry.storeys).toHaveLength(1);
    expect(model.geometry.floorPlates[0].boundary).toBe(
      ingestion.extractedBoundaries[0].polygon,
    );
    expect(model.geometry.thermalZones[0].floorAreaSqm.value).toBeCloseTo(
      400,
      8,
    );
    expect(model.geometry.thermalZones[0].volumeM3.value).toBeCloseTo(
      1_200,
      8,
    );
    expect(model.geometry.surfaces).toHaveLength(
      ingestion.extractedBoundaries[0].polygon.value!.length + 2,
    );
    expect(model.geometry.openings).toHaveLength(4);
    expect(model.missingValues).toContainEqual(
      expect.objectContaining({
        key: TIER_ONE_ASSUMPTION_ACCEPTANCE_KEY,
        blocking: true,
      }),
    );
    expect(validateCanonicalEnergyModel(model).validForSimulation).toBe(false);

    const repeated = buildTierOneCanonicalModel(ingestion, "en", NOW);
    expect(repeated.status).toBe("created");
    if (repeated.status === "created") {
      expect(repeated.model.id).toBe(model.id);
      expect(repeated.model.geometry.surfaces.map((surface) => surface.id)).toEqual(
        model.geometry.surfaces.map((surface) => surface.id),
      );
    }
  });

  it("keeps source geometry distinct from every template-dependent fact", async () => {
    const ingestion = await ingestSingle(
      representativeOfficeDrawingSetInputs()[0],
    );
    const outcome = buildTierOneCanonicalModel(ingestion, "en", NOW);
    if (outcome.status !== "created") {
      throw new Error(outcome.message);
    }
    const { model } = outcome;

    expect(model.assumptions).toContainEqual(
      expect.objectContaining({ id: TIER_ONE_SCREENING_ASSUMPTION_ID }),
    );
    const sourceLessFacts = model.facts.filter(
      (fact) =>
        fact.value != null &&
        fact.sourceRefs.length === 0 &&
        fact.extractionMethod !== "user_input",
    );
    expect(sourceLessFacts.length).toBeGreaterThan(20);
    expect(
      sourceLessFacts
        .filter(
          (fact) =>
            fact.assumptionId !== TIER_ONE_SCREENING_ASSUMPTION_ID,
        )
        .map((fact) => fact.key),
    ).toEqual([]);
    expect(
      model.geometry.surfaces.every((surface) =>
        [
          surface.boundaryCondition,
          surface.geometry,
          surface.areaSqm,
          surface.azimuthDeg,
          surface.tiltDeg,
          surface.constructionId,
        ].every(
          (fact) =>
            fact.assumptionId === TIER_ONE_SCREENING_ASSUMPTION_ID,
        ),
      ),
    ).toBe(true);
    const declaredAssumptionIds = new Set(
      model.assumptions.map((assumption) => assumption.id),
    );
    expect(
      model.facts
        .flatMap((fact) => (fact.assumptionId ? [fact.assumptionId] : []))
        .every((id) => declaredAssumptionIds.has(id)),
    ).toBe(true);
    expect(JSON.stringify(model)).not.toContain("fixture-a");
    expect(JSON.stringify(model)).not.toContain("document-fixture");
    expect(model.createdAt).toBe(NOW);
  });

  it("rejects attempts to bypass acceptance or detach the visible template provenance", async () => {
    const ingestion = await ingestSingle(
      representativeOfficeDrawingSetInputs()[0],
    );
    const outcome = buildTierOneCanonicalModel(ingestion, "en", NOW);
    if (outcome.status !== "created") throw new Error(outcome.message);

    const missingGateOnly = Object.freeze({
      ...outcome.model,
      missingValues: Object.freeze(
        outcome.model.missingValues.filter(
          (missing) => missing.key !== TIER_ONE_ASSUMPTION_ACCEPTANCE_KEY,
        ),
      ),
    });
    expect(
      validateCanonicalEnergyModel(missingGateOnly).issues.map(
        (issue) => issue.code,
      ),
    ).toContain("TIER_ONE_ACCEPTANCE_REQUIRED");

    const mixedArea = outcome.model.geometry.surfaces[0].areaSqm;
    expect(mixedArea.sourceRefs.length).toBeGreaterThan(0);
    const { assumptionId: _assumptionId, ...withoutAssumption } = mixedArea;
    const detached = replaceFact(
      outcome.model,
      Object.freeze(withoutAssumption),
    );
    expect(
      validateCanonicalEnergyModel(detached).issues.map((issue) => issue.code),
    ).toContain("TIER_ONE_ASSUMPTION_COVERAGE");

    const accepted = acceptTierOneScreeningAssumption(outcome.model, NOW);
    const missingTemplateRecord = Object.freeze({
      ...accepted,
      assumptions: Object.freeze(
        accepted.assumptions.filter(
          (assumption) =>
            assumption.id !== TIER_ONE_SCREENING_ASSUMPTION_ID,
        ),
      ),
    });
    expect(
      validateCanonicalEnergyModel(missingTemplateRecord).issues.map(
        (issue) => issue.code,
      ),
    ).toContain("TIER_ONE_TEMPLATE_RECORD_MISSING");
  });

  it("accepts the visible template, compiles provenance-backed glazing, and runs deterministically", async () => {
    const ingestion = await ingestSingle(
      representativeOfficeDrawingSetInputs()[0],
    );
    const outcome = buildTierOneCanonicalModel(ingestion, "en", NOW);
    if (outcome.status !== "created") throw new Error(outcome.message);

    const accepted = acceptTierOneScreeningAssumption(
      outcome.model,
      "2026-08-24T00:01:00.000Z",
    );
    const validation = validateCanonicalEnergyModel(accepted);
    expect(
      validation.validForSimulation,
      validation.issues.map((issue) => issue.message).join("\n"),
    ).toBe(true);
    expect(
      accepted.facts
        .filter(
          (fact) =>
            fact.assumptionId === TIER_ONE_SCREENING_ASSUMPTION_ID,
        )
        .every((fact) => fact.reviewedByUser),
    ).toBe(true);

    const first = compileCanonicalModelToEngineInput(accepted);
    const second = compileCanonicalModelToEngineInput(accepted);
    expect(first.inputHash).toBe(second.inputHash);
    expect(first.payload.materials).toMatchObject({
      source: "code-estimate",
      confidence: "estimated",
    });
    expect(first.payload.materials.envelope.windows).toMatchObject({
      uValue: TIER_ONE_OFFICE_SCREENING_TEMPLATE_V1.envelope
        .windowUValueWPerM2K,
      shgc: TIER_ONE_OFFICE_SCREENING_TEMPLATE_V1.envelope.windowShgc,
    });
    expect(
      first.payload.provenance
        .filter((entry) =>
          entry.inputPath.startsWith("materials.envelope.windows"),
        )
        .every(
          (entry) =>
            entry.sourceRefs.length > 0 ||
            entry.assumptionIds.includes(TIER_ONE_SCREENING_ASSUMPTION_ID),
        ),
    ).toBe(true);
    expect(
      first.payload.provenance.every(
        (entry) =>
          entry.sourceRefs.length > 0 || entry.assumptionIds.length > 0,
      ),
    ).toBe(true);

    const run = runSimulation(first, { now: () => NOW });
    expect(run.status).toBe("succeeded");
    expect(run.result?.annualEnergyKwh).toBeGreaterThan(0);
    expect(
      run.warnings.some((warning) =>
        warning.includes("Assumption-heavy Tier-1"),
      ),
    ).toBe(true);
    expect(
      run.warnings.some((warning) => warning.includes("regional HDD/CDD")),
    ).toBe(true);
  });

  it("keeps no-boundary, wrong-type, uncalibrated, and ambiguous uploads extraction-only", async () => {
    const schedule = await ingestSingle({
      fileName: "A601-window-schedule-rev-B.svg",
      mimeType: "image/svg+xml",
      content:
        '<svg xmlns="http://www.w3.org/2000/svg"><text>WINDOW SCHEDULE W01</text></svg>',
    });
    const noBoundary = await ingestSingle(vectorPlan([]));
    const ambiguous = await ingestSingle(
      vectorPlan([rectangle(0, 0, 20, 20), rectangle(30, 0, 40, 10)]),
    );
    const source = representativeOfficeDrawingSetInputs()[0];
    const unitlessContent = String(source.content).replace(
      "9\n$INSUNITS\n70\n6\n",
      "",
    );
    const uncalibrated = await ingestSingle({
      ...source,
      content: unitlessContent,
    });

    expect(buildTierOneCanonicalModel(schedule, "en", NOW)).toMatchObject({
      status: "extraction_only",
      reason: "not_floor_plan",
    });
    expect(buildTierOneCanonicalModel(noBoundary, "en", NOW)).toMatchObject({
      status: "extraction_only",
    });
    expect(buildTierOneCanonicalModel(ambiguous, "en", NOW)).toMatchObject({
      status: "extraction_only",
      reason: "ambiguous_boundary",
    });
    expect(buildTierOneCanonicalModel(uncalibrated, "en", NOW)).toMatchObject({
      status: "extraction_only",
      reason: "uncalibrated_units",
    });
  });

  it("rejects invalid or area-inconsistent boundary records", async () => {
    const ingestion = await ingestSingle(vectorPlan([rectangle(0, 0, 20, 20)]));
    const boundary = ingestion.extractedBoundaries[0];
    const invalidPolygon = Object.freeze([
      Object.freeze([0, 0]) as Point2D,
      Object.freeze([20, 20]) as Point2D,
      Object.freeze([0, 20]) as Point2D,
      Object.freeze([20, 0]) as Point2D,
    ]);
    const invalid: DrawingSetIngestionResult = Object.freeze({
      ...ingestion,
      extractedBoundaries: Object.freeze([
        Object.freeze({
          ...boundary,
          polygon: Object.freeze({
            ...boundary.polygon,
            value: invalidPolygon,
          }),
        }),
      ]),
    });
    const mismatched: DrawingSetIngestionResult = Object.freeze({
      ...ingestion,
      extractedBoundaries: Object.freeze([
        Object.freeze({
          ...boundary,
          areaSqm: Object.freeze({
            ...boundary.areaSqm,
            value: 450,
          }),
        }),
      ]),
    });

    expect(buildTierOneCanonicalModel(invalid, "en", NOW)).toMatchObject({
      status: "extraction_only",
      reason: "invalid_boundary",
    });
    expect(buildTierOneCanonicalModel(mismatched, "en", NOW)).toMatchObject({
      status: "extraction_only",
      reason: "geometry_mismatch",
    });
  });

  it("does not erase unresolved extraction conflicts", async () => {
    const base = representativeOfficeDrawingSetInputs()[0];
    const ingestion = await ingestSingle({
      ...base,
      extractionSignals: Object.freeze([
        ...(base.extractionSignals ?? []),
        Object.freeze({
          key: "opening.W01.widthM",
          value: 1.5,
          unit: "m",
          confidence: 0.9,
          extractionMethod: "drawing_text" as const,
          authority: "drawing_annotation" as const,
        }),
        Object.freeze({
          key: "opening.W01.widthM",
          value: 1.8,
          unit: "m",
          confidence: 0.9,
          extractionMethod: "drawing_text" as const,
          authority: "drawing_annotation" as const,
        }),
      ]),
    });

    expect(ingestion.conflicts.length).toBeGreaterThan(0);
    expect(buildTierOneCanonicalModel(ingestion, "en", NOW)).toMatchObject({
      status: "extraction_only",
      reason: "unresolved_conflict",
    });
  });

  it("retains a missing north record as a visible template-covered warning", async () => {
    const ingestion = await ingestSingle(
      vectorPlan([rectangle(0, 0, 20, 20)]),
    );
    expect(
      ingestion.missingValues.some(
        (missing) => missing.key === "site.northOrientationDeg",
      ),
    ).toBe(true);

    const outcome = buildTierOneCanonicalModel(ingestion, "en", NOW);
    if (outcome.status !== "created") throw new Error(outcome.message);
    expect(outcome.model.missingValues).toContainEqual(
      expect.objectContaining({
        key: "site.northOrientationDeg",
        blocking: false,
        allowedAssumptionIds: expect.arrayContaining([
          TIER_ONE_SCREENING_ASSUMPTION_ID,
        ]),
      }),
    );
  });
});
