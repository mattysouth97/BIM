import { describe, expect, it } from "vitest";

import { representativeOfficeDrawingSetInputs } from "../reference-office-sources";
import {
  ingestDrawingSet,
  validateDrawingSource,
  type DrawingSourceInput,
} from "../ingestion";

const INGESTED_AT = "2026-02-01T00:00:00.000Z";

describe("deterministic drawing-set ingestion", () => {
  it("classifies and extracts the representative office set with provenance", async () => {
    const result = await ingestDrawingSet(representativeOfficeDrawingSetInputs(), {
      setName: "Representative office",
      ingestedAt: INGESTED_AT,
    });

    expect(result.rejectedFiles).toEqual([]);
    expect(result.drawingSet.documents).toHaveLength(7);
    expect(result.drawingSet.tier).toBe(2);
    expect(result.drawingSet.documents.map((document) => document.classification.documentType)).toEqual([
      "floor_plan",
      "elevation",
      "section",
      "window_schedule",
      "wall_detail",
      "hvac_equipment_schedule",
      "lighting_plan",
    ]);
    expect(result.extractedBoundaries[0].areaSqm.value).toBeCloseTo(400, 6);
    expect(result.drawingSet.documents.every((document) => /^[a-f0-9]{64}$/.test(document.contentHash))).toBe(true);

    const width = result.extractedFacts.find((fact) => fact.key === "opening.W01.widthM");
    expect(width?.value).toBe(1.8);
    expect(width?.status).toBe("conflicted");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].candidates.map((candidate) => candidate.fact.value)).toEqual([1.8, 1.5]);
    expect(width?.sourceRefs[0].originalText).toBe("W01 WIDTH 1800");
    expect(result.extractionRun.unsupportedStages.length).toBeGreaterThan(0);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('"content"');
    expect(serialized).not.toContain(planSourceMarker(representativeOfficeDrawingSetInputs()[0]));
  });

  it("returns identical derived records for identical inputs and explicit time", async () => {
    const inputs = representativeOfficeDrawingSetInputs();
    const first = await ingestDrawingSet(inputs, {
      setName: "Repeatable",
      ingestedAt: INGESTED_AT,
    });
    const second = await ingestDrawingSet(inputs, {
      setName: "Repeatable",
      ingestedAt: INGESTED_AT,
    });
    expect(second).toEqual(first);
  });

  it("detects exact duplicates and preserves revision lineage", async () => {
    const first = representativeOfficeDrawingSetInputs()[0];
    const revised: DrawingSourceInput = {
      ...first,
      fileName: "A101-office-floor-plan-rev-B.dxf",
      revision: "B",
      content: rectangularDxf(32, 20),
    };
    const duplicate: DrawingSourceInput = {
      ...first,
      fileName: "A101-office-floor-plan-rev-A-copy.dxf",
    };
    const result = await ingestDrawingSet([first, revised, duplicate], {
      setName: "Revision test",
      ingestedAt: INGESTED_AT,
    });
    const [documentA, documentB, duplicateA] = result.drawingSet.documents;

    expect(documentB.supersedesDocumentId).toBe(documentA.id);
    expect(duplicateA.duplicateOfDocumentId).toBe(documentA.id);
    expect(result.extractedBoundaries).toHaveLength(2);
  });

  it("blocks uncalibrated raster geometry instead of inventing pixel dimensions", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = await ingestDrawingSet(
      [{
        fileName: "A101-floor-plan.png",
        mimeType: "image/png",
        content: png,
        userDocumentType: "floor_plan",
      }],
      { setName: "Raster", ingestedAt: INGESTED_AT },
    );
    expect(result.drawingSet.documents[0].validationStatus).toBe("needs_calibration");
    expect(result.extractedBoundaries).toEqual([]);
    expect(result.missingValues.some((missing) => missing.key.endsWith("drawingScale") && missing.blocking)).toBe(true);
    expect(
      result.extractionRun.unsupportedStages.some(
        (stage) => stage.reasonCode === "calibration_required" && stage.blocking,
      ),
    ).toBe(true);
  });

  it("rejects active SVG content without executing it", () => {
    const result = validateDrawingSource({
      fileName: "floor-plan.svg",
      mimeType: "image/svg+xml",
      content: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    });
    expect(result.accepted).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("active_svg_content");
  });
});

function planSourceMarker(source: DrawingSourceInput): string {
  return typeof source.content === "string" ? source.content.slice(0, 20) : "__binary_marker__";
}

function rectangularDxf(widthM: number, heightM: number): string {
  const pairs: readonly (readonly [number, string | number])[] = [
    [0, "SECTION"], [2, "HEADER"], [9, "$INSUNITS"], [70, 6], [0, "ENDSEC"],
    [0, "SECTION"], [2, "ENTITIES"], [0, "LWPOLYLINE"], [8, "BIM_OUTLINE"], [90, 4], [70, 1],
    [10, 0], [20, 0], [10, widthM], [20, 0], [10, widthM], [20, heightM], [10, 0], [20, heightM],
    [0, "ENDSEC"], [0, "EOF"],
  ];
  return `${pairs.map(([code, value]) => `${code}\n${value}`).join("\n")}\n`;
}
