// @vitest-environment node
import { describe,expect,it,vi } from "vitest";
import { corpusHttp,parseCorpusFilter } from "../http";
import type { CorpusReader } from "../store";

function reader(): CorpusReader { return {releases:vi.fn().mockResolvedValue([]),release:vi.fn().mockResolvedValue(null),records:vi.fn().mockResolvedValue(null),record:vi.fn().mockResolvedValue(null),download:vi.fn().mockResolvedValue(null)}; }
describe("read-only corpus HTTP",()=>{
  it("distinguishes no published release from database failure",async()=>{const r=reader();const api=corpusHttp(r);expect(await (await api.releases()).json()).toEqual({releases:[]});expect((await api.records(new Request("https://test/api/corpus/records"))).status).toBe(404);vi.mocked(r.releases).mockRejectedValue(new Error("postgres://secret"));const response=await api.releases();expect(response.status).toBe(503);expect(await response.text()).not.toContain("secret");});
  it.each(["page=0","page=-1","page=1.5","pageSize=101","region=11000","useType=office","releaseId=../private","page=1&page=2","ownerName=x","q=%00"])("rejects invalid query %s",query=>expect(()=>parseCorpusFilter(new URL(`https://test/?${query}`))).toThrow());
  it("uses the same validated filters sent to the store",async()=>{const r=reader();await corpusHttp(r).records(new Request("https://test/?region=11&useType=02000&era=2001-2008&page=2&pageSize=5&q=kr-ledger"));expect(r.records).toHaveBeenCalledWith({region:"11",useType:"02000",era:"2001-2008",page:2,pageSize:5,q:"kr-ledger"});});
  it("serves the dictionary without consulting a database",async()=>{const r=reader();const response=corpusHttp(r).dictionary();expect(response.status).toBe(200);expect((await response.json()).recordFields.length).toBeGreaterThan(30);expect(r.releases).not.toHaveBeenCalled();});
  it("rejects unsafe attachment identifiers before storage",async()=>{const r=reader();expect((await corpusHttp(r).download('bad\"\r\nheader')).status).toBe(400);expect(r.download).not.toHaveBeenCalled();});
});
