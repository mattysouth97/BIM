import { createHash } from "node:crypto";
import type { BrTitleInfo } from "@/lib/types";
import { generateCorpusRecord } from "./generator";
import { CORPUS_SCHEMA_VERSION, type CorpusGenerationContext, type CorpusOutcome, type CorpusRecord, type CorpusReleaseManifest } from "./schema";

export interface CorpusCheckpoint { jobHash: string; nextIndex: number; inputCount: number; complete: boolean }
export interface CorpusBatchStorage {
  readCheckpoint(): Promise<CorpusCheckpoint | null>;
  writeCheckpoint(checkpoint: CorpusCheckpoint): Promise<void>;
  readOutcome(index: number): Promise<CorpusOutcome | null>;
  writeOutcome(index: number, outcome: CorpusOutcome): Promise<void>;
}
export function corpusJobHash(titles: readonly BrTitleInfo[], context: CorpusGenerationContext) {
  return createHash("sha256").update(JSON.stringify({ titles, context, schemaVersion: CORPUS_SCHEMA_VERSION })).digest("hex");
}
export async function runCorpusBatch(titles: readonly BrTitleInfo[], context: CorpusGenerationContext, storage: CorpusBatchStorage, maxRecords = titles.length): Promise<CorpusCheckpoint> {
  const jobHash = corpusJobHash(titles, context);
  const prior = await storage.readCheckpoint();
  if (prior && prior.jobHash !== jobHash) throw new Error("Immutable job inputs changed; create a new release directory");
  let index = prior?.nextIndex ?? 0;
  const stop = Math.min(titles.length, index + Math.max(0, maxRecords));
  for (; index < stop; index++) {
    // The output is persisted before its checkpoint. On a crash between them,
    // resume sees the existing output and advances without recomputing/duplicating.
    const existing = await storage.readOutcome(index);
    if (!existing) {
      const duplicate = titles.slice(0,index).some(row => row.mgmBldrgstPk === titles[index].mgmBldrgstPk);
      const outcome: CorpusOutcome = duplicate ? { status: "excluded", exclusion: { id: `duplicate-${index}`, recordId: titles[index].mgmBldrgstPk, releaseId: context.releaseId, generatedAt: context.generatedAt, reason: "duplicate_source_identifier", detail: "Earlier row in this immutable source batch has the same management identifier." } } : await generateCorpusRecord(titles[index], context);
      await storage.writeOutcome(index, outcome);
    }
    await storage.writeCheckpoint({ jobHash, nextIndex: index + 1, inputCount: titles.length, complete: index + 1 === titles.length });
  }
  const checkpoint = { jobHash, nextIndex: index, inputCount: titles.length, complete: index === titles.length };
  await storage.writeCheckpoint(checkpoint);
  return checkpoint;
}
export function corpusManifest(outcomes: readonly CorpusOutcome[], context: CorpusGenerationContext, complete = true): CorpusReleaseManifest {
  const records = outcomes.filter((o): o is {status:"generated";record:CorpusRecord} => o.status === "generated").map(o => o.record);
  const assumptions = new Map<string,{id:string;title:string;count:number;fraction:number}>();
  const exclusionsByReason: Record<string,number> = {};
  for (const outcome of outcomes) {
    if (outcome.status === "excluded") { exclusionsByReason[outcome.exclusion.reason] = (exclusionsByReason[outcome.exclusion.reason] ?? 0) + 1; continue; }
    for (const assumption of outcome.record.assumptions) {
      const row = assumptions.get(assumption.id) ?? {...assumption,count:0,fraction:0};
      if (row.title !== assumption.title) row.title = "Varies by record; see each record's named assumption.";
      row.count++; assumptions.set(row.id,row);
    }
  }
  for (const row of assumptions.values()) row.fraction = records.length ? row.count/records.length : 0;
  return { generationStatus: complete ? "complete" : "partial", releaseId:context.releaseId,schemaVersion:CORPUS_SCHEMA_VERSION,engineVersion:records[0]?.engineVersion??"existing-2026.08+honest-physics",sourceCommit:context.sourceCommit,generatedAt:context.generatedAt,recordCount:records.length,exclusionCount:outcomes.length-records.length,
    coverage:{regionCodes:[...new Set(records.map(r=>r.building.regionCode))].sort(),useTypeCodes:[...new Set(records.map(r=>r.building.useTypeCode))].sort(),eras:[...new Set(records.map(r=>r.building.era))].sort(),description:"Bounded pilot: first 25 title rows requested in each of districts 11680/10300, 26110/10100 and 27110/10100 only. All other districts and every unlisted use/era are unrepresented. This is not a representative census of Korean buildings."},
    assumptionPrevalence:[...assumptions.values()].sort((a,b)=>a.id.localeCompare(b.id)),exclusionsByReason,
    limitations:["Calculated screening records; no metered calibration or accuracy validation.","Published coverage describes only records in this snapshot, not the national building stock.","Daily upstream quota ceiling remains unmeasured; pilot reports observed successful requests separately."],
  };
}
