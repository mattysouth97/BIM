import { describe, expect, it } from "vitest";

import type { DegreeDayEnginePayload } from "@/lib/energy-diagnostics/adapter";
import { sha256Hex, toBytes } from "@/lib/energy-diagnostics/hashing";
import { validateCanonicalEnergyModel } from "@/lib/energy-diagnostics/validation";

import {
  applyInfiltrationAssumption,
  loadRepresentativeCase,
  resolveVisibleConflict,
  runBaselineModel,
  runWindowScenario,
  spatialResultsForRun,
} from "../model-operations";

describe("representative diagnosis model operations", () => {
  it("builds from exactly the seven registered documents with hash-matching source bytes", async () => {
    const reference = await loadRepresentativeCase();
    const sourceHashes = new Set(
      await Promise.all(
        reference.sources.map((source) => sha256Hex(toBytes(source.content))),
      ),
    );
    const documentHashes = new Set(
      reference.model.drawingSet.documents.map((document) =>
        document.contentHash.toLowerCase(),
      ),
    );

    expect(sourceHashes).toEqual(documentHashes);
    expect(reference.sources).toHaveLength(7);
    expect(reference.model.drawingSet.documents).toHaveLength(7);
    expect(
      reference.model.drawingSet.documents.some((document) =>
        document.fileName.includes("fixture-d"),
      ),
    ).toBe(false);
    expect(reference.model.geometry.floorPlates).toHaveLength(3);
    expect(
      reference.model.geometry.floorPlates.every(
        (plate) =>
          plate.boundary.sourceRefs.length > 0 &&
          plate.boundary.sourceRefs[0].documentId ===
            reference.ingestion.extractedBoundaries[0].documentId,
      ),
    ).toBe(true);

    const documentNameById = new Map(
      reference.model.drawingSet.documents.map((document) => [
        document.id,
        document.fileName,
      ]),
    );
    expect(reference.model.site.northOrientationDeg).toMatchObject({
      value: 0,
      status: "extracted",
      extractionMethod: "drawing_text",
      reviewedByUser: false,
    });
    expect(reference.model.site.northOrientationDeg.sourceRefs).not.toHaveLength(0);
    expect(
      reference.model.site.northOrientationDeg.sourceRefs.some((sourceRef) =>
        documentNameById.get(sourceRef.documentId)?.startsWith("A101-"),
      ),
    ).toBe(true);

    const opening = reference.model.geometry.openings[0];
    const hostSurface = reference.model.geometry.surfaces.find(
      (surface) => surface.id === opening.hostSurfaceId,
    );
    expect(hostSurface?.azimuthDeg.value).toBe(90);
    expect(hostSurface?.openingIds).toContain(opening.id);
    expect(
      opening.sillHeightM.sourceRefs.some((sourceRef) =>
        documentNameById.get(sourceRef.documentId)?.startsWith("A201-east-"),
      ),
    ).toBe(true);

    const servedZones = reference.model.systems.hvac[0].servedZoneIds;
    expect(servedZones.value).toEqual(
      reference.model.geometry.thermalZones.map((zone) => zone.id),
    );
    expect(
      servedZones.sourceRefs.some(
        (sourceRef) =>
          documentNameById.get(sourceRef.documentId)?.startsWith("M601-") &&
          sourceRef.originalText?.includes("SERVES LEVELS 01-03"),
      ),
    ).toBe(true);
  });

  it("keeps the drawing conflict visible and blocks a missing infiltration value", async () => {
    const reference = await loadRepresentativeCase();

    expect(reference.ingestion.rejectedFiles).toHaveLength(0);
    expect(reference.ingestion.extractedBoundaries).toHaveLength(1);
    expect(reference.model.drawingSet.documents.length).toBeGreaterThanOrEqual(7);
    expect(reference.model.conflicts.some((conflict) => conflict.key === "opening.W01.widthM")).toBe(true);
    expect(reference.model.envelope.infiltrationAirChangesPerHour.value).toBeNull();

    const validation = validateCanonicalEnergyModel(reference.model);
    expect(validation.validForSimulation).toBe(false);
    expect(validation.issues.some((issue) => issue.code === "MISSING_REQUIRED_VALUE")).toBe(true);
    expect(reference.model.geometry.openings).toHaveLength(1);
    expect(reference.model.geometry.openings[0].hostSurfaceId).toBeTruthy();
    expect(reference.model.geometry.openings[0].sillHeightM).toMatchObject({
      value: 0.9,
      status: "extracted",
    });
    expect(reference.model.geometry.openings[0].sillHeightM).not.toHaveProperty(
      "assumptionId",
    );
    expect(reference.model.geometry.openings[0].sillHeightM.sourceRefs.length).toBeGreaterThan(0);
    expect(
      reference.model.assumptions.some(
        (candidate) =>
          candidate.id === "assumption.reference-office-window-sill",
      ),
    ).toBe(false);
    expect(
      reference.model.mappings.find(
        (mapping) =>
          mapping.canonicalObjectId === reference.model.geometry.openings[0].id,
      ),
    ).toMatchObject({ threeObjectIds: [] });
  });

  it("records an explicit assumption, resolves a conflict, and runs the real engine", async () => {
    const reference = await loadRepresentativeCase();
    const assumed = applyInfiltrationAssumption(
      reference.model,
      "2026-01-15T01:00:00.000Z",
    );
    const conflict = assumed.conflicts[0];
    const selectedFactId = conflict.selectedFactId;
    if (!selectedFactId) throw new Error("reference conflict has no visible selection");
    const resolved = resolveVisibleConflict(
      assumed,
      conflict.id,
      selectedFactId,
      "2026-01-15T01:01:00.000Z",
    );

    expect(validateCanonicalEnergyModel(resolved).validForSimulation).toBe(true);
    expect(resolved.conflicts[0].resolutionStatus).toBe("user_resolved");
    expect(resolved.envelope.infiltrationAirChangesPerHour).toMatchObject({
      value: 0.5,
      status: "defaulted",
      assumptionId: "assumption.reference-office-natural-infiltration",
    });

    const completed = runBaselineModel(resolved);
    expect(completed.run.status).toBe("succeeded");
    expect(completed.run.result?.annualEnergyKwh).toBeGreaterThan(0);
    expect(completed.run.result?.monthly).toEqual([]);
    expect(completed.run.result?.peakCoolingKw).toBeNull();
    expect(completed.run.engineInput.inputHash).toMatch(/^[a-z0-9-]+/i);
    expect(completed.model.simulationRuns).toHaveLength(1);

    const spatial = spatialResultsForRun(completed.run);
    expect(spatial?.zones).toHaveLength(resolved.geometry.thermalZones.length);
    expect(spatial?.zones.some((zone) => zone.status === "area_apportioned_approximation")).toBe(true);
  });

  it("recomputes opening area and engine input when the alternate width wins", async () => {
    const reference = await loadRepresentativeCase();
    const conflict = reference.model.conflicts.find(
      (candidate) => candidate.key === "opening.W01.widthM",
    );
    if (!conflict?.selectedFactId) {
      throw new Error("reference window conflict has no visible selection");
    }
    const alternate = conflict.candidates.find(
      (candidate) => candidate.fact.id !== conflict.selectedFactId,
    )?.fact;
    if (!alternate || typeof alternate.value !== "number") {
      throw new Error("reference window conflict has no numeric alternate");
    }

    let model = applyInfiltrationAssumption(reference.model);
    model = resolveVisibleConflict(model, conflict.id, alternate.id);
    const opening = model.geometry.openings[0];
    const expectedArea = alternate.value * (opening.heightM.value ?? 0);

    expect(opening.widthM).toMatchObject({
      id: alternate.id,
      value: alternate.value,
      status: "user_confirmed",
    });
    expect(opening.areaSqm.value).toBeCloseTo(expectedArea, 8);
    expect(opening.areaSqm.sourceRefs.map((source) => source.id)).toEqual(
      expect.arrayContaining(alternate.sourceRefs.map((source) => source.id)),
    );

    const completed = runBaselineModel(model);
    const payload = completed.run.engineInput.payload as DegreeDayEnginePayload;
    expect(completed.run.status).toBe("succeeded");
    expect(payload.mapping.openings[0]?.areaSqm).toBeCloseTo(expectedArea, 8);
  });

  it("applies a width conflict to every stable affected W01 opening and preserves unrelated openings", async () => {
    const reference = await loadRepresentativeCase();
    const target = reference.model.geometry.openings[0];
    const conflict = reference.model.conflicts[0];
    const alternate = conflict.candidates.find(
      (candidate) => candidate.fact.id !== conflict.selectedFactId,
    )?.fact;
    if (!target || !alternate || typeof alternate.value !== "number") {
      throw new Error("reference conflict fixture is incomplete");
    }
    const decoy = Object.freeze({
      ...target,
      id: "opening-decoy-W02",
      widthM: Object.freeze({
        ...target.widthM,
        id: "fact-decoy-width",
        key: "opening.W02.widthM",
      }),
      heightM: Object.freeze({
        ...target.heightM,
        id: "fact-decoy-height",
        key: "opening.W02.heightM",
      }),
      areaSqm: Object.freeze({ ...target.areaSqm, id: "fact-decoy-area" }),
      threeObjectId: "three-opening-decoy-W02",
    });
    const linkedHeight = (target.heightM.value ?? 0) + 0.4;
    const linked = Object.freeze({
      ...target,
      id: "opening-linked-W01",
      widthM: Object.freeze({
        ...target.widthM,
        id: "fact-linked-width",
      }),
      heightM: Object.freeze({
        ...target.heightM,
        id: "fact-linked-height",
        value: linkedHeight,
      }),
      areaSqm: Object.freeze({
        ...target.areaSqm,
        id: "fact-linked-area",
        value: (target.widthM.value ?? 0) * linkedHeight,
      }),
      threeObjectId: "three-opening-linked-W01",
    });
    const linkedConflict = Object.freeze({
      ...conflict,
      affectedObjectIds: Object.freeze([target.id, linked.id]),
    });
    const model = {
      ...reference.model,
      geometry: {
        ...reference.model.geometry,
        openings: Object.freeze([decoy, target, linked]),
        surfaces: Object.freeze(
          reference.model.geometry.surfaces.map((surface) =>
            surface.id === target.hostSurfaceId
              ? Object.freeze({
                  ...surface,
                  openingIds: Object.freeze([
                    ...surface.openingIds,
                    decoy.id,
                    linked.id,
                  ]),
                })
              : surface,
          ),
        ),
      },
      conflicts: Object.freeze(
        reference.model.conflicts.map((candidate) =>
          candidate.id === conflict.id ? linkedConflict : candidate,
        ),
      ),
    };

    const resolved = resolveVisibleConflict(
      model,
      conflict.id,
      alternate.id,
    );

    expect(
      resolved.geometry.openings.find((opening) => opening.id === decoy.id)
        ?.widthM.value,
    ).toBe(decoy.widthM.value);
    expect(
      resolved.geometry.openings.find((opening) => opening.id === target.id)
        ?.widthM.value,
    ).toBe(alternate.value);
    expect(
      resolved.geometry.openings.find((opening) => opening.id === target.id)
        ?.areaSqm.value,
    ).toBeCloseTo(alternate.value * (target.heightM.value ?? 0), 8);
    expect(
      resolved.geometry.openings.find((opening) => opening.id === linked.id)
        ?.widthM.value,
    ).toBe(alternate.value);
    expect(
      resolved.geometry.openings.find((opening) => opening.id === linked.id)
        ?.areaSqm.value,
    ).toBeCloseTo(alternate.value * linkedHeight, 8);
    const resolvedConflict = resolved.conflicts.find(
      (candidate) => candidate.id === conflict.id,
    );
    expect(resolvedConflict?.resolutionStatus).toBe("user_resolved");
    expect(
      resolvedConflict?.candidates.find(
        (candidate) => candidate.fact.id === alternate.id,
      )?.fact.conflictIds,
    ).toContain(conflict.id);
  });

  it("leaves a stale width conflict unresolved when none of its stable targets exist", async () => {
    const reference = await loadRepresentativeCase();
    const conflict = reference.model.conflicts[0];
    const alternate = conflict.candidates.find(
      (candidate) => candidate.fact.id !== conflict.selectedFactId,
    )?.fact;
    if (!alternate) throw new Error("reference conflict fixture is incomplete");
    const staleConflict = Object.freeze({
      ...conflict,
      affectedObjectIds: Object.freeze(["opening-no-longer-present"]),
    });
    const model = Object.freeze({
      ...reference.model,
      conflicts: Object.freeze(
        reference.model.conflicts.map((candidate) =>
          candidate.id === conflict.id ? staleConflict : candidate,
        ),
      ),
    });

    const resolved = resolveVisibleConflict(model, conflict.id, alternate.id);

    expect(resolved).toBe(model);
    expect(
      resolved.conflicts.find((candidate) => candidate.id === conflict.id)
        ?.resolutionStatus,
    ).not.toBe("user_resolved");
  });

  it("creates a delta-only window scenario without mutating baseline evidence", async () => {
    const reference = await loadRepresentativeCase();
    let model = applyInfiltrationAssumption(reference.model);
    const conflict = model.conflicts[0];
    if (!conflict.selectedFactId) throw new Error("reference conflict has no selection");
    model = resolveVisibleConflict(model, conflict.id, conflict.selectedFactId);
    const baseline = runBaselineModel(model);
    const baselineWindow = baseline.model.envelope.constructions.find(
      (construction) => construction.kind === "window",
    )?.uValueWPerM2K;
    if (!baselineWindow) throw new Error("reference model has no window construction");

    const alternative = runWindowScenario(baseline.model, 1.1);

    expect(alternative.run.status).toBe("succeeded");
    expect(alternative.scenario.deltas).toHaveLength(1);
    expect(alternative.scenario.deltas[0].replacement.value).toBe(1.1);
    expect(alternative.model.envelope.constructions.find(
      (construction) => construction.kind === "window",
    )?.uValueWPerM2K).toBe(baselineWindow);
    expect(alternative.run.engineInput.inputHash).not.toBe(baseline.run.engineInput.inputHash);
    expect(alternative.run.result?.annualEnergyKwh).not.toBe(
      baseline.run.result?.annualEnergyKwh,
    );
  });
});
