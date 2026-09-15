import { describe, expect, it } from "vitest";
import { demoTitle } from "@/lib/demo/demo-building";
import { sanitizeTitle, generateCorpusRecord, corpusRecordId } from "../generator";
import { runCorpusBatch, corpusManifest, type CorpusBatchStorage, type CorpusCheckpoint } from "../batch";
import type { CorpusOutcome } from "../schema";
const title = { ...demoTitle, mgmBldrgstPk: "11680103001234567890123456", sigunguCd: "11680" };
const context = { releaseId:"0.1.0-test",sourceCommit:"abcdef1234567",generatedAt:"2026-09-15T10:00:00.000Z",retrievedAt:"2026-09-15T09:00:00.000Z",licenceDecisionId:"test-decision" };
function memoryStorage() {
  let checkpoint: CorpusCheckpoint | null = null;
  const outcomes = new Map<number,CorpusOutcome>();
  const store:CorpusBatchStorage={readCheckpoint:async()=>checkpoint,writeCheckpoint:async c=>{checkpoint=c;},readOutcome:async i=>outcomes.get(i)??null,writeOutcome:async(i,o)=>{outcomes.set(i,o);}};
  return {store,outcomes};
}
describe("register corpus generation",()=>{
  it("drops unallowlisted personal/address fields and refuses rounded IDs",()=>{
    const clean=sanitizeTitle({...title,ownerName:"PRIVATE",phone:"PRIVATE",hhldCnt:900,bldNm:"PRIVATE",platPlcNm:"PRIVATE"});
    expect(JSON.stringify(clean)).not.toContain("PRIVATE");expect(clean).not.toHaveProperty("hhldCnt");
    expect(sanitizeTitle({...title,mgmBldrgstPk:12345678901234567890123}).mgmBldrgstPk).toBe("");
  });
  it("preserves stable IDs and exact reproducibility with pinned generation time",async()=>{
    const first=await generateCorpusRecord(title,context);const second=await generateCorpusRecord(title,context);
    expect(first.status).toBe("generated");expect(second).toEqual(first);
    if(first.status!=="generated")throw new Error("fixture must generate");
    expect(first.record.id).toBe(corpusRecordId(title.mgmBldrgstPk));
    expect(first.record.source.recordId).toBe(title.mgmBldrgstPk);
    expect(first.record.assumptions.length).toBeGreaterThan(0);
    expect(first.record.generatedAt).toBe(context.generatedAt);
    expect(first.record.energy.pvGenerationKwh).toBe(0);
    expect(first.record.assumptions.some(a=>a.id.includes("PV"))).toBe(true);
    expect(first.record.evidenceTier).toBe("register-derived-assumed-baseline");
  });
  it("excludes unsupported rows instead of creating a population-average building",async()=>{
    const missing=await generateCorpusRecord({...title,archArea:0},context);
    expect(missing).toMatchObject({status:"excluded",exclusion:{reason:"missing_footprint_area"}});
  });
  it("resumes exactly once and rejects changed immutable job inputs",async()=>{
    const {store,outcomes}=memoryStorage();const rows=[title,{...title,mgmBldrgstPk:"other",totArea:0},title];
    expect((await runCorpusBatch(rows,context,store,1)).nextIndex).toBe(1);
    expect((await runCorpusBatch(rows,context,store)).complete).toBe(true);
    expect(outcomes.size).toBe(3);expect(outcomes.get(2)).toMatchObject({status:"excluded",exclusion:{reason:"duplicate_source_identifier"}});
    const snapshot=[...outcomes.values()];await runCorpusBatch(rows,context,store);expect([...outcomes.values()]).toEqual(snapshot);
    await expect(runCorpusBatch(rows,{...context,sourceCommit:"aaaaaaa"},store)).rejects.toThrow("Immutable");
    const manifest=corpusManifest([...outcomes.values()],context);
    expect(manifest.recordCount).toBe(1);expect(manifest.exclusionCount).toBe(2);
    for(const row of manifest.assumptionPrevalence){expect(row.count).toBe(1);expect(row.fraction).toBe(1);}
  });
});
