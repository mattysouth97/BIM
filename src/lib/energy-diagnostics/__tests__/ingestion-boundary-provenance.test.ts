import { describe, expect, it } from "vitest";

import { ingestDrawingSet, type DrawingSourceInput } from "../ingestion";

const INGESTED_AT = "2026-03-01T00:00:00.000Z";

const SQUARE = [
  [0, 0],
  [20, 0],
  [20, 20],
  [0, 20],
] as const;

/** A minimal DXF whose parser-visible closed polyline differs from SQUARE. */
const DXF_WITH_ITS_OWN_RING = [
  "0", "SECTION", "2", "ENTITIES",
  "0", "LWPOLYLINE", "8", "A-WALL", "90", "4", "70", "1",
  "10", "0", "20", "0",
  "10", "50", "20", "0",
  "10", "50", "20", "50",
  "10", "0", "20", "50",
  "0", "ENDSEC", "0", "EOF",
].join("\n");

async function ingestOne(source: DrawingSourceInput) {
  return ingestDrawingSet([source], {
    setName: "provenance",
    ingestedAt: INGESTED_AT,
  });
}

describe("supplied boundary provenance", () => {
  it("defaults an unqualified boundary to measured CAD geometry", async () => {
    const result = await ingestOne({
      fileName: "plan.bimfit-schematic.json",
      mimeType: "application/json",
      content: JSON.stringify({ kind: "test" }),
      formatHint: "bimfit_schematic",
      userDocumentType: "floor_plan",
      units: "m",
      drawingScale: 1,
      vectorBoundaries: [{ polygon: SQUARE.map(([x, y]) => [x, y] as const) }],
    });

    const boundary = result.extractedBoundaries[0];
    expect(boundary.polygon.status).toBe("extracted");
    expect(boundary.polygon.extractionMethod).toBe("vector_geometry");
    expect(boundary.polygon.authority).toBe("dimensioned_vector_geometry");
  });

  it("does NOT relabel a synthesised outline as dimensioned survey geometry", async () => {
    const result = await ingestOne({
      fileName: "register.bimfit-model.json",
      mimeType: "application/json",
      content: JSON.stringify({ kind: "korean_building_ledger_record" }),
      formatHint: "bimfit_model",
      userDocumentType: "building_register_record",
      units: "m",
      drawingScale: 1,
      vectorBoundaries: [
        {
          polygon: SQUARE.map(([x, y]) => [x, y] as const),
          status: "inferred",
          extractionMethod: "rule_inference",
          authority: "deterministic_rule_inference",
          assumptionId: "assumption.ledger-derived-footprint",
          confidence: 0.4,
        },
      ],
    });

    const boundary = result.extractedBoundaries[0];
    for (const fact of [boundary.polygon, boundary.areaSqm]) {
      expect(fact.status).toBe("inferred");
      expect(fact.extractionMethod).toBe("rule_inference");
      expect(fact.authority).toBe("deterministic_rule_inference");
      expect(fact.assumptionId).toBe("assumption.ledger-derived-footprint");
      expect(fact.confidence).toBe(0.4);
    }
    // The synthesised rectangle still measures what it measures.
    expect(boundary.areaSqm.value).toBeCloseTo(400, 6);
  });

  it("uses an explicitly supplied ring instead of raw DXF candidates", async () => {
    const result = await ingestOne({
      fileName: "reviewed-import.dxf",
      mimeType: "application/dxf",
      content: DXF_WITH_ITS_OWN_RING,
      formatHint: "dxf",
      userDocumentType: "floor_plan",
      units: "m",
      drawingScale: 1,
      vectorBoundaries: [
        {
          polygon: SQUARE.map(([x, y]) => [x, y] as const),
          cadLayer: "REVIEWED",
          entityRef: "user-selected",
        },
      ],
    });

    expect(result.extractedBoundaries).toHaveLength(1);
    // 400 (the reviewed 20x20 ring), not 2500 (the raw 50x50 DXF candidate).
    expect(result.extractedBoundaries[0].areaSqm.value).toBeCloseTo(400, 6);
    expect(result.extractedBoundaries[0].cadLayer).toBe("REVIEWED");
  });

  it("still parses DXF geometry when the caller supplies no boundary", async () => {
    const result = await ingestOne({
      fileName: "raw.dxf",
      mimeType: "application/dxf",
      content: DXF_WITH_ITS_OWN_RING,
      formatHint: "dxf",
      userDocumentType: "floor_plan",
      units: "m",
      drawingScale: 1,
    });

    expect(result.extractedBoundaries[0]?.areaSqm.value).toBeCloseTo(2500, 6);
  });
});

describe("building_register_record classification", () => {
  it("classifies the register as a Tier-1, non-drawing document", async () => {
    const result = await ingestOne({
      fileName: "seoul-office.bimfit-model.json",
      mimeType: "application/json",
      content: JSON.stringify({ kind: "korean_building_ledger_record" }),
      formatHint: "bimfit_model",
      userDocumentType: "building_register_record",
      units: "m",
      drawingScale: 1,
      vectorBoundaries: [
        {
          polygon: SQUARE.map(([x, y]) => [x, y] as const),
          status: "inferred",
          extractionMethod: "rule_inference",
          authority: "deterministic_rule_inference",
          assumptionId: "assumption.ledger-derived-footprint",
        },
      ],
    });

    const document = result.drawingSet.documents[0];
    expect(document.classification.documentType).toBe("building_register_record");
    expect(result.drawingSet.tier).toBe(1);
    // A register is not a floor plan, so it must not raise the blocking
    // "this plan could not be traced" records reserved for drawings.
    expect(
      result.extractionRun.unsupportedStages.filter((stage) => stage.blocking),
    ).toEqual([]);
  });
});
