import { describe, expect, it } from "vitest";

import {
  addBoundary,
  emptyBlueprint,
  makeRectLoop,
} from "@/lib/generative/blueprint";
import { diagnosticSourceFromBlueprint } from "@/lib/energy-diagnostics/blueprint-source";
import { ingestDrawingSet } from "@/lib/energy-diagnostics/ingestion";
import {
  acceptTierOneScreeningAssumption,
  buildTierOneCanonicalModel,
} from "@/lib/energy-diagnostics/tier-one-model";
import { runBaselineModel } from "@/components/energy-diagnostics/model-operations";

describe("diagnosticSourceFromBlueprint", () => {
  it("sends authored geometry through the canonical ingestion and Tier-1 model path", async () => {
    const blueprint = addBoundary(emptyBlueprint("Created office"), {
      loop: makeRectLoop("outline", {
        xMm: 0,
        zMm: 0,
        widthMm: 20_000,
        depthMm: 12_000,
      }),
      floorNos: [1],
    });

    const source = diagnosticSourceFromBlueprint(blueprint);
    expect(source.fileName).toBe("Created-office.bimfit-schematic.json");
    expect(source.vectorBoundaries).toEqual([
      expect.objectContaining({
        cadLayer: "BIMFIT_USER_GEOMETRY",
        entityRef: "outline",
        confidence: 1,
        polygon: [
          [0, 0],
          [20, 0],
          [20, 12],
          [0, 12],
        ],
      }),
    ]);

    const ingestion = await ingestDrawingSet([source], {
      setName: "Created office",
      ingestedAt: "2026-08-25T00:00:00.000Z",
    });
    const outcome = buildTierOneCanonicalModel(ingestion, "en");

    expect(outcome.status).toBe("created");
    if (outcome.status !== "created") return;
    expect(outcome.model.geometry.floorPlates[0]?.areaSqm.value).toBe(240);
    expect(outcome.model.drawingSet.documents[0]?.format).toBe(
      "bimfit_schematic",
    );

    const accepted = acceptTierOneScreeningAssumption(outcome.model);
    const completed = runBaselineModel(accepted);
    expect(completed.run.status).toBe("succeeded");
    expect(completed.run.result?.annualEnergyKwh).toBeGreaterThan(0);
  });

  it("retains multiple outlines for explicit ambiguity review", () => {
    let blueprint = addBoundary(emptyBlueprint("Two wings"), {
      loop: makeRectLoop("east", {
        xMm: 0,
        zMm: 0,
        widthMm: 10_000,
        depthMm: 8_000,
      }),
      floorNos: [1],
    });
    blueprint = addBoundary(blueprint, {
      loop: makeRectLoop("west", {
        xMm: 12_000,
        zMm: 0,
        widthMm: 10_000,
        depthMm: 8_000,
      }),
      floorNos: [1],
    });

    const source = diagnosticSourceFromBlueprint(blueprint);
    expect(source.vectorBoundaries?.map((boundary) => boundary.entityRef)).toEqual([
      "east",
      "west",
    ]);
  });
});
