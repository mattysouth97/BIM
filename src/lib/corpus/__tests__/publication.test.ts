// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { preparePublication, snapshotSha256, validateSnapshot, type CorpusSnapshot } from "../publication";
import { RECORD_FIELDS, RELEASE_FIELDS } from "../dictionary";
import { createCorpusStore } from "../store";
import { createNeonExecutor } from "../neon-http";

// Synthetic test fixture only. Never sent to storage or advertised as a release.
export function fixture(): CorpusSnapshot {
  const record = { id: `kr-ledger-${"a".repeat(24)}`, permalink: `/api/corpus/releases/test-1/records/kr-ledger-${"a".repeat(24)}`, releaseId: "test-1", schemaVersion: "1.0.0", engineVersion: "test", sourceCommit: "abcdef12", generatedAt: "2026-09-15T00:00:00.000Z", source: { provider: "MOLIT Building Register" as const, endpoint: "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo", recordId: "test0001", retrievedAt: "2026-09-14T00:00:00.000Z", inputHash: "b".repeat(64) }, licence: { id: "MOLIT-public-data-unrestricted", url: "https://www.data.go.kr/data/15134735/openapi.do", decisionId: "review-1" }, evidenceTier: "register-derived-assumed-baseline" as const, building: { regionCode: "11", useTypeCode: "02000", era: "2001-2008", approvalYear: 2005, floorAreaSqm: 100, footprintAreaSqm: 50, floorsAbove: 2, heightM: null }, energy: { siteKwh: 10000, siteKwhPerSqm: 100, primaryKwh: 18000, primaryKwhPerSqm: 180, grade: "3", co2Tonnes: 3, pvGenerationKwh: 0 }, assumptions: [{id:"era-default",title:"Era-based fabric assumption"}], provenance: [{key:"wall_u",status:"assumed",assumptionId:"era-default",sourceRefCount:0}], limitations:["Test fixture; not operational data."] };
  return { records:[record], manifest: { generationStatus:"complete",releaseId:record.releaseId,schemaVersion:record.schemaVersion,engineVersion:record.engineVersion,sourceCommit:record.sourceCommit,generatedAt:record.generatedAt,recordCount:1,exclusionCount:0,coverage:{regionCodes:["11"],useTypeCodes:["02000"],eras:["2001-2008"],description:"Synthetic test only"},assumptionPrevalence:[{...record.assumptions[0],count:1,fraction:1}],exclusionsByReason:{},limitations:["No measured validation."] } };
}
export function artifact() {
  const snapshot = fixture();
  return preparePublication(snapshot, { publishedAt:"2026-09-15T02:00:00.000Z",previousReleaseId:null,changelog:["Test only"],omittedCoverage:["All actual buildings"],review:{decisionId:"test-review",reviewedAt:"2026-09-15T01:00:00.000Z",reviewedBy:"Test fixture",reviewedSha256:snapshotSha256(snapshot),licenceDecisionId:"review-1",privacy:"approved"} });
}
function leaves(value: unknown, prefix=""): string[] {
  if (Array.isArray(value)) return value.length && typeof value[0]==="object" ? leaves(value[0],`${prefix}[]`) : [`${prefix}[]`];
  if (value !== null && typeof value==="object") return Object.entries(value).flatMap(([key,child]) => prefix==="exclusionsByReason" ? ["exclusionsByReason.*"] : leaves(child,prefix?`${prefix}.${key}`:key));
  return [prefix];
}
describe("reviewed corpus publication",()=>{
  it("binds approval to exact validated bytes",()=>{ const a=artifact(); expect(a.release.snapshotSha256).toBe(snapshotSha256(fixture())); expect(a.release.claims.stockAccuracy).toContain("not been validated"); const s=fixture();s.records[0].energy.grade="2"; const {publishedAt,previousReleaseId,changelog,omittedCoverage,review}=a.release; expect(()=>preparePublication(s,{publishedAt,previousReleaseId,changelog,omittedCoverage,review})).toThrow(/different bytes/); });
  it.each(["ownerName","address","apiKey","newUnreviewedField"])("rejects unreviewed field %s",key=>{const s=fixture();Object.assign(s.records[0],{[key]:"private"});expect(()=>validateSnapshot(s)).toThrow();});
  it("rejects nested private fields and secret values",()=>{let s=fixture();Object.assign(s.records[0].source,{serviceKey:"secret"});expect(()=>validateSnapshot(s)).toThrow();s=fixture();s.records[0].limitations=["password=hidden"];expect(()=>validateSnapshot(s)).toThrow(/secret/);});
  it("rejects empty, incomplete, coverage-inflated and inconsistent releases",()=>{
    let s=fixture();s.records=[];s.manifest.recordCount=0;expect(()=>validateSnapshot(s)).toThrow();
    s=fixture();s.manifest.generationStatus="partial";expect(()=>validateSnapshot(s)).toThrow();
    s=fixture();s.manifest.coverage.regionCodes.push("26");expect(()=>validateSnapshot(s)).toThrow(/coverage/);
    s=fixture();s.manifest.assumptionPrevalence[0].fraction=0.5;expect(()=>validateSnapshot(s)).toThrow(/prevalence/);
    s=fixture();s.records[0].energy.primaryKwh=1;expect(()=>validateSnapshot(s)).toThrow(/denominator/);
    s=fixture();s.records[0].sourceCommit="0000000";expect(()=>validateSnapshot(s)).toThrow(/sourceCommit/);
  });
  it("documents every record/release leaf and unit, including nullable fields",()=>{const a=artifact();a.release.exclusionsByReason={example:0};expect([...new Set(leaves(a.records[0]))].sort()).toEqual(RECORD_FIELDS.map(f=>f.path).sort());expect([...new Set(leaves(a.release))].sort()).toEqual(RELEASE_FIELDS.map(f=>f.path).sort());expect(RECORD_FIELDS.find(f=>f.path==="energy.siteKwhPerSqm")?.unit).toBe("kWh/(m²·year)");});
  it("refuses a common aggregate title when records use different bases",()=>{const s=fixture();const second=structuredClone(s.records[0]);second.id=`kr-ledger-${"b".repeat(24)}`;second.permalink=`/api/corpus/releases/test-1/records/${second.id}`;second.source.recordId="test0002";second.assumptions[0].title="Different era assumption";s.records.push(second);s.manifest.recordCount=2;s.manifest.assumptionPrevalence[0].count=2;expect(()=>validateSnapshot(s)).toThrow(/aggregate assumption title/);s.manifest.assumptionPrevalence[0].title="Varies by record; see each record's named assumption.";expect(validateSnapshot(s).records).toHaveLength(2);});
  it("publishes two inserts atomically without an overwrite path",async()=>{const sql=vi.fn().mockResolvedValue([]);await createCorpusStore(sql).publish(artifact());expect(sql).toHaveBeenCalledTimes(1);const queries=sql.mock.calls[0][0];expect(queries).toHaveLength(2);expect(queries[0].query).toContain("INSERT INTO bimfit_corpus_releases");expect(queries[0].query).not.toMatch(/UPDATE|CONFLICT/);expect(queries[1].query).toContain("jsonb_array_elements($2::jsonb)");});
  it("parameterizes filters and returns stable pagination counts",async()=>{const sql=vi.fn().mockResolvedValueOnce([{rows:[{manifest:artifact().release}]}]).mockResolvedValueOnce([{rows:[{total:3}]},{rows:[{record:fixture().records[0]}]}]);const result=await createCorpusStore(sql).records({q:"' OR 1=1 --",page:2,pageSize:1});expect(result).toMatchObject({total:3,totalPages:3,page:2});const qs=sql.mock.calls[1][0];expect(qs[0].query).not.toContain("' OR 1=1 --");expect(qs[0].params[4]).toBe("' or 1=1 --");expect(qs[1].params.slice(-2)).toEqual([1,1]);});
  it("rejects non-Neon credential destinations and redacts upstream errors",async()=>{const fetcher=vi.fn();await expect(createNeonExecutor("postgres://user:secret@evil.example/db",fetcher)([])).rejects.toThrow("Corpus store unavailable");expect(fetcher).not.toHaveBeenCalled();fetcher.mockResolvedValue(Response.json({message:"password=secret",code:"XX000"},{status:500}));await expect(createNeonExecutor("postgres://user:secret@test.neon.tech/db",fetcher)([])).rejects.toThrow(/^Corpus store unavailable$/);});
});
