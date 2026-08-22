import { beforeEach, describe, expect, it, vi } from "vitest";

const database = new Map<string, unknown>();
let readFailure: Error | null = null;
let writeFailure: Error | null = null;

vi.mock("idb-keyval", () => ({
  get: async (key: string) => {
    if (readFailure) throw readFailure;
    const value = database.get(key);
    return value === undefined ? undefined : structuredClone(value);
  },
  set: async (key: string, value: unknown) => {
    if (writeFailure) throw writeFailure;
    database.set(key, structuredClone(value));
  },
}));

import {
  EnergyDiagnosticsStorageError,
  computeSourceContentHash,
  energyDiagnosticsProjectStorageKey,
  energySourceStorageKey,
  loadEnergyDiagnosticsProject,
  loadEnergyDiagnosticsProjectRecord,
  loadEnergySourceBytes,
  saveEnergyDiagnosticsProject,
  saveEnergySourceBytes,
  type StoredEnergyDiagnosticsProjectV1,
} from "../storage";
import {
  CANONICAL_ENERGY_MODEL_VERSION,
  type CanonicalEnergyModel,
  type EnergyFact,
  type SourceReference,
} from "../types";

const NOW = "2026-08-23T01:02:03.000Z";
const SOURCE_TEXT = "representative office drawing set bytes";

const sourceReference: SourceReference = {
  id: "source-ref-wall-u",
  documentId: "document-a101",
  pageNumber: 1,
  sheetId: "A-101",
  cadLayer: "A-WALL-EXT",
  boundingBox: { x: 10, y: 20, width: 30, height: 8 },
  geometryRef: "polyline-42",
  originalText: "EXT WALL U=0.24 W/m2K",
  entityRef: "dxf-text-17",
  drawingRevision: "R1",
  extractionRunId: "extraction-run-1",
  previewCoordinates: [
    [10, 20],
    [40, 20],
    [40, 28],
    [10, 28],
  ],
  linked3dObjectId: "three-wall-west-1",
};

function fact<T>(
  id: string,
  key: string,
  value: T,
  sourceRefs: readonly SourceReference[] = [],
): EnergyFact<T> {
  return {
    id,
    key,
    value,
    status: sourceRefs.length > 0 ? "extracted" : "user_confirmed",
    confidence: sourceRefs.length > 0 ? 0.96 : 1,
    sourceRefs,
    extractionMethod: sourceRefs.length > 0 ? "schedule_table" : "user_input",
    authority:
      sourceRefs.length > 0
        ? "explicit_schedule_or_specification"
        : "user_confirmed_project_value",
    reviewedByUser: sourceRefs.length === 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeModel(contentHash: string): CanonicalEnergyModel {
  const wallU = {
    ...fact("fact-wall-u", "envelope.wall.u_value", 0.24, [sourceReference]),
    unit: "W/m2K",
    status: "conflicted" as const,
    conflictIds: ["conflict-wall-u"],
  };
  const competingWallU = {
    ...fact("fact-wall-u-elevation", "envelope.wall.u_value", 0.31, [
      { ...sourceReference, id: "source-ref-wall-u-elevation", sheetId: "A-301" },
    ]),
    unit: "W/m2K",
  };
  const scenarioReplacement = {
    ...fact("fact-wall-u-scenario", "envelope.wall.u_value", 0.18),
    unit: "W/m2K",
  };

  return {
    id: "canonical-model-office-1",
    schemaVersion: CANONICAL_ENERGY_MODEL_VERSION,
    modelVersion: "office-r1-reviewed",
    project: {
      id: "energy-project-1",
      name: "Traceable office diagnosis",
      locale: "ko",
      sourceProjectId: "existing-bimfit-project-17",
    },
    building: {
      id: "building-office-1",
      name: fact("fact-building-name", "building.name", "Small office"),
      useType: fact("fact-use", "building.use_type", "office"),
    },
    site: {
      location: fact("fact-location", "site.location", "Seoul"),
      latitudeDeg: fact("fact-lat", "site.latitude", 37.5665),
      longitudeDeg: fact("fact-lon", "site.longitude", 126.978),
      northOrientationDeg: fact("fact-site-north", "site.north", 0),
      weatherSource: fact("fact-weather", "site.weather", "Seoul TMY"),
      groundRelationship: fact("fact-ground", "site.ground", "slab_on_grade"),
    },
    drawingSet: {
      id: "drawing-set-r1",
      name: "Office design drawings R1",
      tier: 2,
      documents: [
        {
          id: "document-a101",
          fileName: "A-101-floor-plan.svg",
          format: "svg",
          mimeType: "image/svg+xml",
          byteLength: new TextEncoder().encode(SOURCE_TEXT).byteLength,
          contentHash,
          revision: "R1",
          revisionGroupId: "revision-group-a101",
          classification: {
            documentType: "floor_plan",
            discipline: "architectural",
            confidence: 0.99,
            method: "filename_and_metadata",
            matchedSignals: ["A-101", "floor plan"],
            alternatives: [{ documentType: "unknown", confidence: 0.01 }],
          },
          pages: [{ id: "page-a101-1", pageNumber: 1, label: "A-101" }],
          cadLayers: [{ name: "A-WALL-EXT", entityCount: 18, visible: true }],
          units: fact("fact-drawing-units", "drawing.units", "mm", [sourceReference]),
          drawingScale: fact("fact-drawing-scale", "drawing.scale", 100, [sourceReference]),
          northOrientationDeg: fact("fact-drawing-north", "drawing.north", 0, [sourceReference]),
          validationStatus: "accepted",
          createdAt: NOW,
        },
      ],
      revisionGroupIds: ["revision-group-a101"],
      createdAt: NOW,
      updatedAt: NOW,
    },
    extractionRuns: [
      {
        id: "extraction-run-1",
        pipelineVersion: "drawing-pipeline-1",
        sourceDocumentIds: ["document-a101"],
        sourceContentHashes: [contentHash],
        status: "completed_with_warnings",
        startedAt: NOW,
        completedAt: NOW,
        warnings: ["HVAC efficiency requires user confirmation"],
        unsupportedStages: [],
      },
    ],
    geometry: {
      coordinateSystem: fact("fact-coordinate-system", "geometry.coordinate_system", "local_m"),
      storeys: [],
      floorPlates: [],
      spaces: [],
      thermalZones: [],
      surfaces: [],
      openings: [],
      shadingDevices: [],
    },
    envelope: {
      constructions: [],
      infiltrationAirChangesPerHour: fact("fact-infiltration", "envelope.infiltration", 0.5),
      airTightnessNotes: fact("fact-airtightness", "envelope.airtightness", "Design assumption"),
      thermalBridgeNotes: fact("fact-bridges", "envelope.thermal_bridges", "Not modeled"),
    },
    usageProfiles: [],
    systems: { hvac: [], domesticHotWater: [], renewables: [] },
    facts: [wallU],
    conflicts: [
      {
        id: "conflict-wall-u",
        key: "envelope.wall.u_value",
        affectedObjectIds: ["wall-west-1"],
        candidates: [
          { fact: wallU, priority: 2 },
          { fact: competingWallU, priority: 4 },
        ],
        selectedFactId: "fact-wall-u",
        selectionRationale: "The explicit wall schedule has higher authority.",
        resolutionStatus: "auto_selected_visible",
        blocking: false,
        downstreamImpact: "Changes transmission heating and cooling loads.",
        createdAt: NOW,
      },
    ],
    missingValues: [
      {
        id: "missing-hvac-cop",
        key: "systems.hvac.cooling_cop",
        affectedObjectIds: ["hvac-office-1"],
        requiredFor: "systems",
        blocking: false,
        allowedAssumptionIds: ["assumption-hvac-cop"],
        message: "Confirm cooling COP or accept the visible project assumption.",
        createdAt: NOW,
      },
    ],
    assumptions: [
      {
        id: "assumption-hvac-cop",
        key: "systems.hvac.cooling_cop",
        title: "Office cooling COP",
        explanation: "Early-design project default pending an equipment schedule.",
        trigger: "No cooling COP was found.",
        scopeObjectIds: ["hvac-office-1"],
        method: "project_default",
        simulationImpact: "Cooling electricity changes inversely with COP in the supported engine mapping.",
        reversible: true,
      },
    ],
    mappings: [
      {
        canonicalObjectId: "wall-west-1",
        sourceEntityRefs: [sourceReference],
        threeObjectIds: ["three-wall-west-1"],
      },
    ],
    readiness: [
      {
        category: "systems",
        status: "assumptions_required",
        verifiedCount: 0,
        assumedCount: 1,
        conflictCount: 0,
        missingCount: 1,
        blockingRecordIds: [],
      },
    ],
    scenarios: [
      {
        id: "scenario-wall-upgrade",
        name: "Wall insulation upgrade",
        baselineModelId: "canonical-model-office-1",
        baselineModelVersion: CANONICAL_ENERGY_MODEL_VERSION,
        deltas: [
          {
            id: "delta-wall-u",
            path: "envelope.constructions.wall.uValueWPerM2K",
            key: "envelope.wall.u_value",
            baselineFactId: "fact-wall-u",
            replacement: scenarioReplacement,
          },
        ],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    simulationRuns: [
      {
        id: "simulation-run-wall-upgrade",
        modelId: "canonical-model-office-1",
        scenarioId: "scenario-wall-upgrade",
        status: "succeeded",
        engineInput: {
          schemaVersion: "1",
          engineId: "bimfit-existing-energy-engine",
          engineVersion: "2026.8",
          adapterVersion: "canonical-adapter-1",
          inputHash: "engine-input-sha256-001",
          payload: {
            exact: true,
            wallUValueWPerM2K: 0.18,
            zoneIds: ["zone-west-1", "zone-core-1"],
            schedules: { occupied: [0, 0, 1, 1, 0] },
          },
        },
        result: {
          annualEnergyKwh: 12345,
          energyUseIntensityKwhPerM2: 82.3,
          annualByEndUseKwh: { heating: 3000, cooling: 2800, lighting: 4000, equipment: 2545 },
          monthly: [
            {
              month: 1,
              heatingKwh: 700,
              coolingKwh: 0,
              lightingKwh: 340,
              equipmentKwh: 210,
              fansAndPumpsKwh: 45,
              domesticHotWaterKwh: null,
              totalKwh: 1295,
            },
          ],
          zones: [
            {
              zoneId: "zone-west-1",
              annualEnergyKwh: 7200,
              heatingKwh: 1800,
              coolingKwh: 2100,
              peakHeatingKw: 14,
              peakCoolingKw: 18,
              timeSeries: [{ timestamp: NOW, value: 18, unit: "kW" }],
            },
          ],
          peakHeatingKw: 24,
          peakCoolingKw: 31,
        },
        logs: ["Engine input accepted", "Simulation completed"],
        warnings: ["HVAC COP remains assumed"],
        startedAt: NOW,
        completedAt: NOW,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function containsBinary(value: unknown, visited = new WeakSet<object>()): boolean {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
  if (typeof value !== "object" || value === null || visited.has(value)) return false;
  visited.add(value);
  return Object.values(value).some((child) => containsBinary(child, visited));
}

beforeEach(() => {
  database.clear();
  readFailure = null;
  writeFailure = null;
});

describe("canonical energy project persistence", () => {
  it("reproduces scenarios, exact engine inputs, results, provenance, conflicts, and stable IDs", async () => {
    const bytes = new TextEncoder().encode(SOURCE_TEXT);
    const contentHash = await computeSourceContentHash(bytes);
    const model = makeModel(contentHash);

    await saveEnergySourceBytes({ contentHash, bytes, storedAtIso: NOW });
    const saved = await saveEnergyDiagnosticsProject(model, { savedAtIso: NOW });
    const loaded = await loadEnergyDiagnosticsProject("energy-project-1");

    expect(loaded).toEqual(model);
    expect(loaded).not.toBe(model);
    expect(loaded?.scenarios[0].deltas).toEqual(model.scenarios[0].deltas);
    expect(loaded?.simulationRuns[0].engineInput).toEqual(model.simulationRuns[0].engineInput);
    expect(loaded?.simulationRuns[0].result).toEqual(model.simulationRuns[0].result);
    expect(loaded?.facts[0].sourceRefs[0]).toEqual(sourceReference);
    expect(loaded?.conflicts[0].candidates).toEqual(model.conflicts[0].candidates);
    expect(loaded?.facts.map(({ id }) => id)).toEqual(["fact-wall-u"]);
    expect(loaded?.scenarios.map(({ id }) => id)).toEqual(["scenario-wall-upgrade"]);
    expect(loaded?.simulationRuns.map(({ id }) => id)).toEqual(["simulation-run-wall-upgrade"]);
    expect(saved.sourceContentHashes).toEqual([contentHash]);

    // A second save of the cold-loaded value is a byte-for-byte equivalent
    // structured record when its persistence timestamp is held constant.
    const reproduced = await saveEnergyDiagnosticsProject(loaded!, { savedAtIso: NOW });
    expect(reproduced).toEqual(saved);
  });

  it("keeps source bytes in a hash-addressed record, never inside the project record", async () => {
    const bytes = new TextEncoder().encode(SOURCE_TEXT);
    const contentHash = await computeSourceContentHash(bytes);
    await saveEnergySourceBytes({ contentHash: `sha256:${contentHash}`, bytes, storedAtIso: NOW });
    await saveEnergyDiagnosticsProject(makeModel(contentHash), { savedAtIso: NOW });

    const projectKey = energyDiagnosticsProjectStorageKey("energy-project-1");
    const sourceKey = energySourceStorageKey(contentHash);
    expect([...database.keys()].sort()).toEqual([projectKey, sourceKey].sort());
    expect(containsBinary(database.get(projectKey))).toBe(false);
    expect(containsBinary(database.get(sourceKey))).toBe(true);
    expect((database.get(projectKey) as { sourceContentHashes: string[] }).sourceContentHashes)
      .toEqual([contentHash]);

    const loadedBytes = await loadEnergySourceBytes(contentHash);
    expect([...new Uint8Array(loadedBytes!)]).toEqual([...bytes]);
    expect(loadedBytes).not.toBe((database.get(sourceKey) as { bytes: ArrayBuffer }).bytes);
  });

  it("returns null for a project and source hash that were never saved", async () => {
    const missingHash = "0".repeat(64);
    expect(await loadEnergyDiagnosticsProject("missing-project")).toBeNull();
    expect(await loadEnergySourceBytes(missingHash)).toBeNull();
  });
});

describe("V1 migration", () => {
  it("validates V1, writes a V2 recovery copy, and retains the original", async () => {
    const contentHash = await computeSourceContentHash(new TextEncoder().encode(SOURCE_TEXT));
    const model = makeModel(contentHash);
    const legacy: StoredEnergyDiagnosticsProjectV1 = {
      kind: "bimfit.energy-diagnostics.project",
      storageVersion: 1,
      savedAtIso: NOW,
      model,
    };
    const v1Key = energyDiagnosticsProjectStorageKey("energy-project-1", 1);
    const v2Key = energyDiagnosticsProjectStorageKey("energy-project-1", 2);
    database.set(v1Key, structuredClone(legacy));

    const loaded = await loadEnergyDiagnosticsProjectRecord("energy-project-1");

    expect(loaded?.storageVersion).toBe(2);
    expect(loaded?.model.scenarios).toEqual(model.scenarios);
    expect(loaded?.model.simulationRuns).toEqual(model.simulationRuns);
    expect(loaded?.model.facts[0].sourceRefs).toEqual(model.facts[0].sourceRefs);
    expect(loaded?.sourceContentHashes).toEqual([contentHash]);
    expect(database.has(v1Key)).toBe(true);
    expect(database.has(v2Key)).toBe(true);
  });

  it("does not overwrite V1 when its canonical payload is corrupt", async () => {
    const v1Key = energyDiagnosticsProjectStorageKey("energy-project-1", 1);
    database.set(v1Key, {
      kind: "bimfit.energy-diagnostics.project",
      storageVersion: 1,
      savedAtIso: NOW,
      model: { id: "truncated" },
    });

    await expect(loadEnergyDiagnosticsProject("energy-project-1")).rejects.toMatchObject({
      name: "EnergyDiagnosticsStorageError",
      code: "CORRUPT_RECORD",
      recordKey: v1Key,
    });
    expect(database.has(energyDiagnosticsProjectStorageKey("energy-project-1", 2))).toBe(false);
  });

  it("surfaces a failed recovery-copy write without deleting the valid V1 record", async () => {
    const contentHash = await computeSourceContentHash(new TextEncoder().encode(SOURCE_TEXT));
    const v1Key = energyDiagnosticsProjectStorageKey("energy-project-1", 1);
    database.set(v1Key, {
      kind: "bimfit.energy-diagnostics.project",
      storageVersion: 1,
      savedAtIso: NOW,
      model: makeModel(contentHash),
    } satisfies StoredEnergyDiagnosticsProjectV1);
    writeFailure = new Error("QuotaExceededError");

    await expect(loadEnergyDiagnosticsProject("energy-project-1")).rejects.toMatchObject({
      code: "MIGRATION_FAILED",
    });
    expect(database.has(v1Key)).toBe(true);
  });
});

describe("validation and typed failures", () => {
  it("rejects duplicate stable IDs before writing", async () => {
    const contentHash = await computeSourceContentHash(new TextEncoder().encode(SOURCE_TEXT));
    const valid = makeModel(contentHash);
    const invalid = {
      ...valid,
      scenarios: [valid.scenarios[0], valid.scenarios[0]],
    } as CanonicalEnergyModel;

    await expect(saveEnergyDiagnosticsProject(invalid)).rejects.toMatchObject({
      code: "INVALID_RECORD",
    });
    expect(database.size).toBe(0);
  });

  it("rejects binary data embedded in an engine payload so source bytes cannot leak into the project", async () => {
    const contentHash = await computeSourceContentHash(new TextEncoder().encode(SOURCE_TEXT));
    const valid = makeModel(contentHash);
    const invalid = {
      ...valid,
      simulationRuns: [
        {
          ...valid.simulationRuns[0],
          engineInput: { ...valid.simulationRuns[0].engineInput, payload: new Uint8Array([1, 2, 3]) },
        },
      ],
    } as CanonicalEnergyModel;

    await expect(saveEnergyDiagnosticsProject(invalid)).rejects.toMatchObject({
      code: "INVALID_RECORD",
    });
    expect(database.size).toBe(0);
  });

  it("reports a malformed current record as corrupt instead of falling back to V1", async () => {
    const currentKey = energyDiagnosticsProjectStorageKey("energy-project-1");
    database.set(currentKey, {
      kind: "bimfit.energy-diagnostics.project",
      storageVersion: 2,
      projectId: "energy-project-1",
      modelId: "canonical-model-office-1",
      savedAtIso: NOW,
      sourceContentHashes: [],
      model: { id: "truncated" },
    });
    database.set(energyDiagnosticsProjectStorageKey("energy-project-1", 1), { valid: "decoy" });

    await expect(loadEnergyDiagnosticsProject("energy-project-1")).rejects.toMatchObject({
      code: "CORRUPT_RECORD",
      recordKey: currentKey,
    });
  });

  it("distinguishes storage failures from missing records", async () => {
    const contentHash = await computeSourceContentHash(new TextEncoder().encode(SOURCE_TEXT));
    writeFailure = new Error("QuotaExceededError");
    const saveError = await saveEnergyDiagnosticsProject(makeModel(contentHash)).catch((error) => error);
    expect(saveError).toBeInstanceOf(EnergyDiagnosticsStorageError);
    expect((saveError as EnergyDiagnosticsStorageError).code).toBe("SAVE_FAILED");
    expect((saveError as EnergyDiagnosticsStorageError).cause).toBe(writeFailure);

    writeFailure = null;
    readFailure = new Error("InvalidStateError");
    await expect(loadEnergyDiagnosticsProject("energy-project-1")).rejects.toMatchObject({
      code: "LOAD_FAILED",
    });
  });
});

describe("content-addressed source integrity", () => {
  it("refuses mismatched declared hashes without writing bytes", async () => {
    const bytes = new TextEncoder().encode(SOURCE_TEXT);
    await expect(
      saveEnergySourceBytes({ contentHash: "f".repeat(64), bytes }),
    ).rejects.toMatchObject({ code: "SOURCE_HASH_MISMATCH" });
    expect(database.size).toBe(0);
  });

  it("detects source-byte corruption on reload", async () => {
    const bytes = new TextEncoder().encode(SOURCE_TEXT);
    const contentHash = await computeSourceContentHash(bytes);
    await saveEnergySourceBytes({ contentHash, bytes, storedAtIso: NOW });
    const key = energySourceStorageKey(contentHash);
    const record = database.get(key) as { bytes: ArrayBuffer };
    new Uint8Array(record.bytes)[0] ^= 0xff;

    await expect(loadEnergySourceBytes(contentHash)).rejects.toMatchObject({
      code: "CORRUPT_SOURCE",
      recordKey: key,
    });
  });

  it("wraps source store read and write failures with source-specific error codes", async () => {
    const bytes = new TextEncoder().encode(SOURCE_TEXT);
    const contentHash = await computeSourceContentHash(bytes);
    writeFailure = new Error("QuotaExceededError");
    await expect(saveEnergySourceBytes({ contentHash, bytes })).rejects.toMatchObject({
      code: "SOURCE_SAVE_FAILED",
    });

    writeFailure = null;
    readFailure = new Error("InvalidStateError");
    await expect(loadEnergySourceBytes(contentHash)).rejects.toMatchObject({
      code: "SOURCE_LOAD_FAILED",
    });
  });
});
