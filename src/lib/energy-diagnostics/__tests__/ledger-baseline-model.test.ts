import { describe, expect, it } from "vitest";

import { demoFloors, demoTitle } from "@/lib/demo/demo-building";
import {
  AIRTIGHTNESS,
  HVAC_DEFAULTS,
  WINDOW_RATIOS,
  WINDOW_U_VALUES,
} from "@/lib/korean-building-codes";
import type { BrTitleInfo } from "@/lib/types";

import { collectEnergyFacts } from "../facts";
import { ingestDrawingSet } from "../ingestion";
import { buildTierOneCanonicalModel } from "../tier-one-model";
import {
  LEDGER_BASELINE_MODEL_VERSION,
  LEDGER_BASEMENT_ASSUMPTION_ID,
  LEDGER_ENVELOPE_ASSUMPTION_ID,
  LEDGER_ERA_UNKNOWN_ASSUMPTION_ID,
  LEDGER_FOOTPRINT_ASSUMPTION_ID,
  LEDGER_SYSTEMS_ASSUMPTION_ID,
  LEDGER_USAGE_ASSUMPTION_ID,
  buildLedgerBaselineModel,
} from "../ledger-baseline-model";
import { diagnosticSourceFromLedger } from "../ledger-source";
import { compileCanonicalModelToEngineInput, runSimulation } from "../adapter";
import { validateCanonicalEnergyModel } from "../validation";

const INGESTED_AT = "2026-04-01T00:00:00.000Z";

async function buildFromLedger(
  title: BrTitleInfo = demoTitle,
  floors = demoFloors,
) {
  const source = diagnosticSourceFromLedger({ title, floors });
  const ingestion = await ingestDrawingSet([source], {
    setName: "register",
    ingestedAt: INGESTED_AT,
  });
  return buildLedgerBaselineModel({
    ingestion,
    title,
    floors,
    locale: "ko",
    now: INGESTED_AT,
  });
}

describe("buildLedgerBaselineModel — the demo 10F/B2 office", () => {
  it("stacks every registered above-ground storey", async () => {
    const outcome = await buildFromLedger();
    expect(outcome.status).toBe("created");
    if (outcome.status !== "created") return;

    expect(outcome.storeyCount).toBe(10);
    expect(outcome.model.geometry.storeys).toHaveLength(10);
    expect(outcome.model.geometry.floorPlates).toHaveLength(10);
    expect(outcome.model.geometry.spaces).toHaveLength(10);
    expect(outcome.model.geometry.thermalZones).toHaveLength(10);
    // 41.5 m over 10 registered storeys.
    expect(
      outcome.model.geometry.storeys[0].floorToFloorHeightM.value,
    ).toBeCloseTo(4.15, 6);
    // Storeys stack from grade upward.
    const elevations = outcome.model.geometry.storeys.map(
      (storey) => storey.elevationM.value as number,
    );
    expect(elevations[0]).toBe(0);
    expect(elevations).toEqual([...elevations].sort((a, b) => a - b));
  });

  it("gives every storey and edge a distinct surface and opening id", async () => {
    const outcome = await buildFromLedger();
    if (outcome.status !== "created") throw new Error("expected a model");

    const surfaceIds = outcome.model.geometry.surfaces.map((s) => s.id);
    const openingIds = outcome.model.geometry.openings.map((o) => o.id);
    expect(new Set(surfaceIds).size).toBe(surfaceIds.length);
    expect(new Set(openingIds).size).toBe(openingIds.length);
    // 10 storeys x 4 edges + ground + roof.
    expect(surfaceIds).toHaveLength(42);
    expect(openingIds).toHaveLength(40);
    // Indexing a fact set with duplicate ids throws; this is the real guard.
    expect(() => collectEnergyFacts(outcome.model)).not.toThrow();
  });

  it("serves every conditioned zone from the single HVAC system", async () => {
    const outcome = await buildFromLedger();
    if (outcome.status !== "created") throw new Error("expected a model");

    const zoneIds = outcome.model.geometry.thermalZones.map((zone) => zone.id);
    const served = outcome.model.systems.hvac[0].servedZoneIds
      .value as readonly string[];
    expect([...served].sort()).toEqual([...zoneIds].sort());
    expect(
      outcome.model.geometry.thermalZones.every(
        (zone) => zone.conditioned.value === true,
      ),
    ).toBe(true);
  });

  it("is simulation-ready with no blocking issue, and runs", async () => {
    const outcome = await buildFromLedger();
    if (outcome.status !== "created") throw new Error("expected a model");

    const validation = validateCanonicalEnergyModel(outcome.model);
    expect(validation.blockingIssueIds).toEqual([]);
    expect(validation.validForSimulation).toBe(true);

    const run = runSimulation(compileCanonicalModelToEngineInput(outcome.model));
    expect(run.status).toBe("succeeded");
    expect(run.result?.annualEnergyKwh).toBeGreaterThan(0);
    expect(run.result?.energyUseIntensityKwhPerM2).toBeGreaterThan(0);
    // 10 zones reported, apportioned by area.
    expect(run.result?.zones).toHaveLength(10);
  });

  it("is refused by the Tier-1 builder, so it can never become a 1-storey office", async () => {
    const source = diagnosticSourceFromLedger({
      title: demoTitle,
      floors: demoFloors,
    });
    const ingestion = await ingestDrawingSet([source], {
      setName: "register",
      ingestedAt: INGESTED_AT,
    });
    // The workspace's upload path calls buildTierOneCanonicalModel on whatever
    // it ingests. A register is not a floor plan, so that builder refuses it
    // rather than silently extruding one storey with office template values.
    const tierOne = buildTierOneCanonicalModel(ingestion, "ko");
    expect(tierOne).toMatchObject({
      status: "extraction_only",
      reason: "not_floor_plan",
    });
  });

  it("does NOT inherit the Tier-1 office screening gate", async () => {
    const outcome = await buildFromLedger();
    if (outcome.status !== "created") throw new Error("expected a model");

    expect(outcome.model.modelVersion).toBe(LEDGER_BASELINE_MODEL_VERSION);
    expect(outcome.model.modelVersion.startsWith("tier1-office-screening-")).toBe(
      false,
    );
    expect(
      outcome.model.assumptions.some((a) =>
        a.id.includes("tier1-office-screening"),
      ),
    ).toBe(false);
  });
});

describe("honesty guarantees", () => {
  it("never presents a code-table default as measured or extracted", async () => {
    const outcome = await buildFromLedger();
    if (outcome.status !== "created") throw new Error("expected a model");

    const assumptionIds = new Set(outcome.model.assumptions.map((a) => a.id));
    const defaulted = outcome.model.facts.filter(
      (fact) => fact.assumptionId != null,
    );
    expect(defaulted.length).toBeGreaterThan(0);

    for (const fact of defaulted) {
      // Every assumption-backed fact names a record that actually exists.
      expect(assumptionIds.has(fact.assumptionId as string)).toBe(true);
      if (fact.status !== "defaulted") continue;
      // A code-table value cites no evidence and claims no confidence.
      expect(fact.sourceRefs).toEqual([]);
      expect(fact.confidence).toBeNull();
      expect(fact.extractionMethod).toBe("project_default");
      expect(fact.authority).toBe("project_template");
      expect(["verified", "user_confirmed", "extracted"]).not.toContain(
        fact.status,
      );
    }
  });

  it("labels the synthesised outline as inference, not survey geometry", async () => {
    const outcome = await buildFromLedger();
    if (outcome.status !== "created") throw new Error("expected a model");

    const plate = outcome.model.geometry.floorPlates[0];
    expect(plate.boundary.status).toBe("inferred");
    expect(plate.boundary.authority).toBe("deterministic_rule_inference");
    expect(plate.boundary.assumptionId).toBe(LEDGER_FOOTPRINT_ASSUMPTION_ID);
    expect(plate.boundary.authority).not.toBe("dimensioned_vector_geometry");
    expect(
      outcome.model.assumptions.map((a) => a.id),
    ).toContain(LEDGER_FOOTPRINT_ASSUMPTION_ID);
  });

  it("converts ACH50 to a natural air-change rate (the 20x trap)", async () => {
    const outcome = await buildFromLedger();
    if (outcome.status !== "created") throw new Error("expected a model");

    // demoTitle 사용승인일 2008 → era 2000-2009 → ACH50 3.5.
    expect(AIRTIGHTNESS["2000-2009"]).toBe(3.5);
    expect(
      outcome.model.envelope.infiltrationAirChangesPerHour.value,
    ).toBeCloseTo(3.5 / 20, 10);
  });

  it("reads era from 사용승인일 and applies that era's tables", async () => {
    const outcome = await buildFromLedger();
    if (outcome.status !== "created") throw new Error("expected a model");

    const windowAssembly = outcome.model.envelope.constructions.find(
      (c) => c.kind === "window",
    );
    expect(windowAssembly?.uValueWPerM2K.value).toBe(
      WINDOW_U_VALUES["2000-2009"],
    );
    // 업무시설 (14000) → office window-to-wall ratio for that era. The ratio
    // has no slot of its own in CanonicalEnergyModel, so it is verified where
    // it actually acts: window area over host wall area.
    const wall = outcome.model.geometry.surfaces.find(
      (surface) => surface.type === "exterior_wall" && surface.openingIds.length > 0,
    );
    const hostedWindow = outcome.model.geometry.openings.find(
      (opening) => opening.hostSurfaceId === wall?.id,
    );
    const ratio =
      (hostedWindow?.areaSqm.value as number) / (wall?.areaSqm.value as number);
    expect(ratio).toBeCloseTo(WINDOW_RATIOS["2000-2009"].office, 10);
    // and the default that produced it stays named, not hidden behind "inferred"
    expect(hostedWindow?.areaSqm.assumptionId).toBe(
      LEDGER_ENVELOPE_ASSUMPTION_ID,
    );
    // No era-unknown assumption when the date was readable.
    expect(outcome.model.assumptions.map((a) => a.id)).not.toContain(
      LEDGER_ERA_UNKNOWN_ASSUMPTION_ID,
    );
  });

  it("uses the registered 주용도코드 verbatim so the engine can match it", async () => {
    const outcome = await buildFromLedger();
    if (outcome.status !== "created") throw new Error("expected a model");
    expect(outcome.model.building.useType.value).toBe("14000");
  });

  it("names the excluded basements with their exact area", async () => {
    const outcome = await buildFromLedger();
    if (outcome.status !== "created") throw new Error("expected a model");

    expect(outcome.excludedBasementCount).toBe(2);
    expect(outcome.excludedBasementAreaSqm).toBeGreaterThan(0);

    const assumption = outcome.model.assumptions.find(
      (a) => a.id === LEDGER_BASEMENT_ASSUMPTION_ID,
    );
    expect(assumption).toBeDefined();
    expect(assumption?.explanation).toContain(
      String(Math.round(outcome.excludedBasementAreaSqm)),
    );
    // Recorded, visible, and never a hard stop.
    const missing = outcome.model.missingValues.find(
      (record) => record.key === "geometry.basementThermalModel",
    );
    expect(missing?.blocking).toBe(false);
    // No below-grade storey was extruded.
    expect(outcome.model.geometry.storeys).toHaveLength(10);
  });

  it("carries all four assumption groups the UI needs to explain the result", async () => {
    const outcome = await buildFromLedger();
    if (outcome.status !== "created") throw new Error("expected a model");

    const ids = outcome.model.assumptions.map((a) => a.id);
    expect(ids).toContain(LEDGER_ENVELOPE_ASSUMPTION_ID);
    expect(ids).toContain(LEDGER_SYSTEMS_ASSUMPTION_ID);
    expect(ids).toContain(LEDGER_USAGE_ASSUMPTION_ID);
    expect(outcome.model.assumptions.every((a) => a.reversible)).toBe(true);
  });

  it("carries the register's own numbers as extracted, evidence-backed facts", async () => {
    const source = diagnosticSourceFromLedger({
      title: demoTitle,
      floors: demoFloors,
    });
    const ingestion = await ingestDrawingSet([source], {
      setName: "register",
      ingestedAt: INGESTED_AT,
    });

    const archArea = ingestion.extractedFacts.find(
      (fact) => fact.key === "ledger.archAreaSqm",
    );
    expect(archArea?.status).toBe("extracted");
    expect(archArea?.authority).toBe("explicit_schedule_or_specification");
    expect(archArea?.extractionMethod).toBe("schedule_table");
    expect(archArea?.sourceRefs.length).toBeGreaterThan(0);
    expect(archArea?.value).toBe(demoTitle.archArea);

    // A documented zero means "unavailable"; it must not become a fact at all.
    const zeroed = diagnosticSourceFromLedger({
      title: { ...demoTitle, platArea: 0, heit: 0 },
      floors: demoFloors,
    });
    const keys = (zeroed.extractionSignals ?? []).map((signal) => signal.key);
    expect(keys).not.toContain("ledger.platAreaSqm");
    expect(keys).not.toContain("ledger.heightM");
    expect(keys).toContain("ledger.archAreaSqm");
  });

  it("traces every derived quantity back to the register document", async () => {
    const outcome = await buildFromLedger();
    if (outcome.status !== "created") throw new Error("expected a model");

    const zoneArea = outcome.model.geometry.thermalZones[0].floorAreaSqm;
    expect(zoneArea.sourceRefs.length).toBeGreaterThan(0);
    // The evidence inspector shows the raw registered text behind the number.
    const originals = zoneArea.sourceRefs
      .map((ref) => ref.originalText ?? "")
      .join(" ");
    expect(originals.length).toBeGreaterThan(0);
    const registerDoc = outcome.model.drawingSet.documents[0];
    expect(
      zoneArea.sourceRefs.every((ref) => ref.documentId === registerDoc.id),
    ).toBe(true);
  });
});

describe("refusals — a thin register never becomes a confident model", () => {
  it("refuses when 건축면적 is the documented zero", async () => {
    const outcome = await buildFromLedger({ ...demoTitle, archArea: 0 });
    expect(outcome).toMatchObject({
      status: "insufficient_ledger",
      reason: expect.stringMatching(/missing_footprint_area|no_boundary/),
    });
  });

  it("refuses when no above-ground storey count is registered", async () => {
    const outcome = await buildFromLedger({ ...demoTitle, grndFlrCnt: 0 });
    expect(outcome).toMatchObject({
      status: "insufficient_ledger",
      reason: "missing_floor_count",
    });
  });

  it("refuses when the region cannot be resolved for a climate file", async () => {
    const outcome = await buildFromLedger({
      ...demoTitle,
      sigunguCd: "99999",
      platPlcNm: "unknown place",
      newPlatPlc: "",
    });
    expect(outcome).toMatchObject({
      status: "insufficient_ledger",
      reason: "climate_unresolvable",
    });
  });

  it("states an unknown era rather than silently defaulting", async () => {
    const outcome = await buildFromLedger({
      ...demoTitle,
      useAprDay: "",
      pmsDay: "",
    });
    expect(outcome.status).toBe("created");
    if (outcome.status !== "created") return;

    expect(outcome.model.assumptions.map((a) => a.id)).toContain(
      LEDGER_ERA_UNKNOWN_ASSUMPTION_ID,
    );
    const missing = outcome.model.missingValues.find(
      (record) => record.key === "building.era",
    );
    expect(missing).toBeDefined();
    expect(missing?.blocking).toBe(false);
  });
});

describe("a register with no cooling plant", () => {
  it("emits the exact lowercase 'none' the validator and adapter require", async () => {
    // 17000 (공장) has coolingEfficiency 0 in the defaults table.
    expect(HVAC_DEFAULTS["17000"].coolingEfficiency).toBe(0);
    const outcome = await buildFromLedger({
      ...demoTitle,
      mainPurpsCd: "17000",
      mainPurpsCdNm: "공장",
    });
    if (outcome.status !== "created") throw new Error("expected a model");

    expect(outcome.model.systems.hvac[0].coolingSource.value).toBe("none");
    const validation = validateCanonicalEnergyModel(outcome.model);
    expect(validation.blockingIssueIds).toEqual([]);
    const run = runSimulation(compileCanonicalModelToEngineInput(outcome.model));
    expect(run.status).toBe("succeeded");
  });
});
