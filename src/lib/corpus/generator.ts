import { createHash } from "node:crypto";
import type { BrTitleInfo } from "@/lib/types";
import { diagnosticSourceFromLedger } from "@/lib/energy-diagnostics/ledger-source";
import { ingestDrawingSet } from "@/lib/energy-diagnostics/ingestion";
import { buildLedgerBaselineModel } from "@/lib/energy-diagnostics/ledger-baseline-model";
import { compileCanonicalModelToEngineInput, runSimulation, DEGREE_DAY_ENGINE_VERSION } from "@/lib/energy-diagnostics/adapter";
import { runEnergyEngine } from "@/lib/retrofit/retrofit-delta";
import { buildEndUseLoads } from "@/lib/energy/end-uses";
import { classifyEraExplicit } from "@/lib/ledger/floor-rows";
import { CORPUS_SCHEMA_VERSION, type CorpusGenerationContext, type CorpusOutcome } from "./schema";

// Public and cached register rows use the same narrow allowlist. No names,
// addresses, owners, household counts, or uninspected upstream fields persist.
export const TITLE_FIELDS = ["mgmBldrgstPk", "sigunguCd", "bjdongCd", "mainPurpsCd", "strctCd", "grndFlrCnt", "ugrndFlrCnt", "totArea", "archArea", "platArea", "useAprDay", "pmsDay", "roofCd", "heit", "regstrGbCd", "regstrKindCd"] as const;
const numeric = new Set(["grndFlrCnt", "ugrndFlrCnt", "totArea", "archArea", "platArea", "heit"]);
export function sanitizeTitle(raw: Record<string, unknown>): BrTitleInfo {
  const clean: Record<string, string | number> = {};
  for (const field of TITLE_FIELDS) {
    const value = raw[field];
    if (numeric.has(field)) clean[field] = value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? 0 : Number(value);
    else clean[field] = typeof value === "number" && !Number.isSafeInteger(value) ? "" : String(value ?? "").trim();
  }
  // Non-allowlisted textual fields are explicitly absent, not guessed.
  return clean as unknown as BrTitleInfo;
}
export function corpusRecordId(recordId: string): string {
  return `kr-ledger-${createHash("sha256").update(recordId).digest("hex").slice(0, 24)}`;
}
export async function generateCorpusRecord(titleInput: BrTitleInfo, context: CorpusGenerationContext): Promise<CorpusOutcome> {
  if (!/^[a-f0-9]{7,40}$/.test(context.sourceCommit)) throw new Error("A pinned source commit is required");
  if (!/^\d{4}-\d\d-\d\dT/.test(context.generatedAt)) throw new Error("Pinned generation time is required");
  const title = sanitizeTitle(titleInput as unknown as Record<string, unknown>);
  const id = corpusRecordId(title.mgmBldrgstPk);
  const exclude = (reason: string, detail: string): CorpusOutcome => ({ status: "excluded", exclusion: { id, recordId: title.mgmBldrgstPk, releaseId: context.releaseId, generatedAt: context.generatedAt, reason, detail } });
  if (!title.mgmBldrgstPk) return exclude("missing_stable_id", "Register management identifier missing or rounded beyond safe integer precision.");
  if (!(title.archArea > 0)) return exclude("missing_footprint_area", "No positive registered building footprint area.");
  if (!(title.grndFlrCnt > 0)) return exclude("missing_floor_count", "No positive above-ground storey count.");
  if (!(title.totArea > 0)) return exclude("missing_floor_area", "No positive registered floor area; no population-average substitute is allowed.");
  if (!/^\d{5}$/.test(title.mainPurpsCd)) return exclude("missing_use_type", "No recognized-format main purpose code.");
  try {
    const source = diagnosticSourceFromLedger({ title, footprint: { kind: "derived_rectangle" } });
    const ingestion = await ingestDrawingSet([source], { setName: `Register ${id}`, ingestedAt: context.generatedAt });
    const outcome = buildLedgerBaselineModel({ ingestion, title, locale: "en", now: context.generatedAt });
    if (outcome.status !== "created") return exclude(outcome.reason, outcome.message);
    const input = compileCanonicalModelToEngineInput(outcome.model);
    const simulation = runSimulation(input, { now: () => context.generatedAt });
    if (simulation.status !== "succeeded" || !simulation.engineOutput) return exclude("engine_failed", "Shared canonical engine refused the input.");
    const { materials, climate, climateRegion = null } = input.payload;
    const recipe = { ...input.payload.recipe, officialFloorAreaSqm: input.payload.mapping.conditionedFloorAreaSqm };
    const run = runEnergyEngine(materials, recipe, climate, climateRegion);
    const loads = buildEndUseLoads({ demand: run.demand, materials, recipe, climateRegion });
    const assumptions = outcome.model.assumptions.map(a => ({ id: a.id, title: a.title }));
    for (const approximation of input.payload.approximations) assumptions.push({ id: approximation.id, title: approximation.title });
    for (const load of [loads.hvac.heating, loads.hvac.cooling, loads.lighting, loads.dhw, loads.plug, loads.onSiteGeneration]) {
      if (load.provenance.source === "named_assumption") assumptions.push({ id: load.provenance.assumptionId, title: load.provenance.assumption });
    }
    const uniqueAssumptions = [...new Map(assumptions.map(a => [a.id, a])).values()].sort((a,b) => a.id.localeCompare(b.id));
    const floorArea = input.payload.mapping.conditionedFloorAreaSqm;
    const era = classifyEraExplicit({ useAprDay: title.useAprDay, pmsDay: title.pmsDay });
    const primaryKwh = run.primaryPerSqm * floorArea;
    const numbers = [run.sitePerSqm, run.primaryPerSqm, primaryKwh, run.co2.totalCO2];
    if (!numbers.every(Number.isFinite)) return exclude("non_finite_result", "Shared physics returned a non-finite annual result.");
    return { status: "generated", record: {
      id, permalink: `/api/corpus/releases/${context.releaseId}/records/${id}`, releaseId: context.releaseId,
      schemaVersion: CORPUS_SCHEMA_VERSION, engineVersion: `${DEGREE_DAY_ENGINE_VERSION}+honest-physics`, sourceCommit: context.sourceCommit, generatedAt: context.generatedAt,
      source: { provider: "MOLIT Building Register", endpoint: "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo", recordId: title.mgmBldrgstPk, retrievedAt: context.retrievedAt, inputHash: createHash("sha256").update(JSON.stringify(title)).digest("hex") },
      licence: { id: "MOLIT-public-data-unrestricted", url: "https://www.data.go.kr/data/15134735/openapi.do", decisionId: context.licenceDecisionId },
      evidenceTier: "register-derived-assumed-baseline",
      building: { regionCode: title.sigunguCd.slice(0,2), useTypeCode: title.mainPurpsCd, era: era.resolved ? era.era : "unknown", approvalYear: /^\d{8}$/.test(title.useAprDay) ? Number(title.useAprDay.slice(0,4)) : null, floorAreaSqm: floorArea, footprintAreaSqm: title.archArea, floorsAbove: title.grndFlrCnt, heightM: title.heit > 0 ? title.heit : null },
      energy: { siteKwh: run.sitePerSqm * floorArea, siteKwhPerSqm: run.sitePerSqm, primaryKwh, primaryKwhPerSqm: run.primaryPerSqm, grade: run.grade, co2Tonnes: run.co2.totalCO2, pvGenerationKwh: loads.onSiteGeneration.kwh },
      assumptions: uniqueAssumptions,
      provenance: outcome.model.facts.map(fact => ({ key: fact.key, status: fact.status, assumptionId: fact.assumptionId ?? null, sourceRefCount: fact.sourceRefs.length })).sort((a,b) => a.key.localeCompare(b.key)),
      limitations: ["Calculated screening baseline, not metered energy or a certified grade.", "Register-only evidence: footprint shape, envelope, systems and schedules include named assumptions.", "Below-grade conditioned scope follows the app's existing ledger model and is not independently measured.", "Pipeline consistency does not validate accuracy against Korean building stock."],
    } };
  } catch {
    return exclude("model_build_failed", "Shared ingestion/model construction could not produce a usable baseline; no substitute building was generated.");
  }
}

