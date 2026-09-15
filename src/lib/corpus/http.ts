import "server-only";
import { createCorpusStore, type CorpusReader, type CorpusFilter } from "./store";
import { CORPUS_DICTIONARY } from "./dictionary";

const identifier = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/;
export class CorpusQueryError extends Error {}
export function parseCorpusFilter(url: URL): CorpusFilter {
  const allowed = new Set(["releaseId", "region", "useType", "era", "q", "page", "pageSize"]);
  for (const key of url.searchParams.keys()) if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) throw new CorpusQueryError();
  const filter: CorpusFilter = { page: 1, pageSize: 20 };
  for (const [key, max] of [["page", 1000000], ["pageSize", 100]] as const) {
    const value = url.searchParams.get(key);
    if (value !== null) {
      if (!/^[1-9]\d*$/.test(value) || Number(value)>max) throw new CorpusQueryError();
      filter[key] = Number(value);
    }
  }
  for (const key of ["releaseId", "region", "useType", "era", "q"] as const) {
    const value = url.searchParams.get(key);
    if (value === null) continue;
    const valid = key === "region" ? /^\d{2}$/.test(value) : key === "useType" ? /^\d{5}$/.test(value) : key === "q" ? value.trim().length>0 && value.length<=100 && !/[\u0000-\u001f]/.test(value) : identifier.test(value);
    if (!valid) throw new CorpusQueryError();
    filter[key] = value;
  }
  return filter;
}
export function corpusHttp(reader: CorpusReader = createCorpusStore()) {
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  const run = async (action: () => Promise<Response>) => {
    try { return await action(); }
    catch (error) { return error instanceof CorpusQueryError ? json({ error: "invalid_corpus_query" },400) : json({ error: "corpus_unavailable" },503); }
  };
  function checkId(id: string) { if (!identifier.test(id)) throw new CorpusQueryError(); }
  return {
    releases: () => run(async () => json({ releases: await reader.releases() })),
    release: (id: string) => run(async () => { checkId(id); const result = await reader.release(id); return result ? json(result) : json({ error: "corpus_release_not_found" },404); }),
    records: (request: Request) => run(async () => { const result = await reader.records(parseCorpusFilter(new URL(request.url))); return result ? json(result) : json({ error: "corpus_release_not_found" },404); }),
    record: (releaseId: string, id: string) => run(async () => { checkId(releaseId); if (!/^kr-ledger-[a-f0-9]{24}$/.test(id)) throw new CorpusQueryError(); const result = await reader.record(releaseId,id); return result ? json(result) : json({ error: "corpus_record_not_found" },404); }),
    download: (id: string) => run(async () => { checkId(id); const result = await reader.download(id); if (!result) return json({ error: "corpus_release_not_found" },404); return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="bimfit-corpus-${id}.json"`, "Cache-Control": "public, max-age=31536000, immutable", "ETag": `"${result.release.snapshotSha256}"`, "X-Content-Type-Options": "nosniff" } }); }),
    dictionary: () => json(CORPUS_DICTIONARY),
  };
}
