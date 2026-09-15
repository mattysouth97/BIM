import "server-only";
import { createNeonExecutor, CorpusStoreError, type SqlExecutor } from "./neon-http";
import { preparePublication, type PublishedCorpusArtifact, type PublishedCorpusRelease } from "./publication";
import type { CorpusRecord } from "./schema";

export interface CorpusFilter { releaseId?: string; region?: string; useType?: string; era?: string; q?: string; page: number; pageSize: number }
export interface CorpusPage { releaseId: string; records: CorpusRecord[]; total: number; page: number; pageSize: number; totalPages: number }
export interface CorpusReader {
  releases(): Promise<PublishedCorpusRelease[]>;
  release(id?: string): Promise<PublishedCorpusRelease | null>;
  records(filter: CorpusFilter): Promise<CorpusPage | null>;
  record(releaseId: string, id: string): Promise<CorpusRecord | null>;
  download(releaseId: string): Promise<PublishedCorpusArtifact | null>;
}
export function createCorpusStore(sql: SqlExecutor = createNeonExecutor()) {
  async function release(id?: string): Promise<PublishedCorpusRelease | null> {
    const [result] = await sql([{ query: "SELECT manifest FROM bimfit_corpus_releases WHERE ($1::text IS NULL OR release_id=$1) ORDER BY published_at DESC, release_id DESC LIMIT 1", params: [id ?? null] }]);
    return (result.rows[0]?.manifest as PublishedCorpusRelease | undefined) ?? null;
  }
  return {
    /** Explicit operator migration; read-only public requests never create tables. */
    async initialize(): Promise<void> {
      await sql([
        { query: "CREATE TABLE IF NOT EXISTS bimfit_corpus_releases (release_id text PRIMARY KEY, published_at timestamptz NOT NULL, snapshot_sha256 text NOT NULL, manifest jsonb NOT NULL, artifact jsonb NOT NULL)", params: [] },
        { query: "CREATE TABLE IF NOT EXISTS bimfit_corpus_records (release_id text NOT NULL REFERENCES bimfit_corpus_releases(release_id), record_id text NOT NULL, region text NOT NULL, use_type text NOT NULL, era text NOT NULL, record jsonb NOT NULL, PRIMARY KEY (release_id, record_id))", params: [] },
        { query: "CREATE INDEX IF NOT EXISTS bimfit_corpus_records_filters ON bimfit_corpus_records (release_id, region, use_type, era, record_id)", params: [] },
      ]);
    },
    async publish(input: PublishedCorpusArtifact): Promise<void> {
      const { release: r } = input;
      const { publishedAt, previousReleaseId, changelog, omittedCoverage, review,
        snapshotSha256: digest, licence: _licence, claims: _claims, ...manifest } = r;
      const artifact = preparePublication({ manifest, records: input.records }, { publishedAt, previousReleaseId, changelog, omittedCoverage, review });
      if (artifact.release.snapshotSha256 !== digest) throw new Error("Publication digest mismatch");
      if (previousReleaseId && !await release(previousReleaseId)) throw new Error("Previous release is unavailable");
      // One transaction: readers see the complete snapshot or none. No upsert/update/delete.
      await sql([
        { query: "INSERT INTO bimfit_corpus_releases (release_id,published_at,snapshot_sha256,manifest,artifact) VALUES ($1,$2::timestamptz,$3,$4::jsonb,$5::jsonb)", params: [r.releaseId, publishedAt, digest, JSON.stringify(artifact.release), JSON.stringify(artifact)] },
        { query: "INSERT INTO bimfit_corpus_records (release_id,record_id,region,use_type,era,record) SELECT $1, item->>'id', item->'building'->>'regionCode', item->'building'->>'useTypeCode', item->'building'->>'era', item FROM jsonb_array_elements($2::jsonb) AS item", params: [r.releaseId, JSON.stringify(artifact.records)] },
      ]);
    },
    async releases(): Promise<PublishedCorpusRelease[]> {
      const [result] = await sql([{ query: "SELECT manifest FROM bimfit_corpus_releases ORDER BY published_at DESC, release_id DESC", params: [] }]);
      return result.rows.map(row => row.manifest as PublishedCorpusRelease);
    },
    release,
    async records(filter: CorpusFilter): Promise<CorpusPage | null> {
      const manifest = await release(filter.releaseId);
      if (!manifest) return null;
      const params = [manifest.releaseId, filter.region ?? null, filter.useType ?? null, filter.era ?? null, filter.q?.toLowerCase() ?? null];
      // strpos treats %, _, quotes and backslashes literally. No dynamic SQL fragments.
      const where = "release_id=$1 AND ($2::text IS NULL OR region=$2) AND ($3::text IS NULL OR use_type=$3) AND ($4::text IS NULL OR era=$4) AND ($5::text IS NULL OR strpos(lower(record_id || ' ' || region || ' ' || use_type || ' ' || era),$5)>0)";
      const [count, rows] = await sql([
        { query: `SELECT count(*)::int AS total FROM bimfit_corpus_records WHERE ${where}`, params },
        { query: `SELECT record FROM bimfit_corpus_records WHERE ${where} ORDER BY record_id LIMIT $6::int OFFSET $7::int`, params: [...params, filter.pageSize, (filter.page-1)*filter.pageSize] },
      ]);
      const total = Number(count.rows[0]?.total ?? 0);
      return { releaseId: manifest.releaseId, records: rows.rows.map(r => r.record as CorpusRecord), total, page: filter.page, pageSize: filter.pageSize, totalPages: Math.ceil(total/filter.pageSize) };
    },
    async record(releaseId: string, id: string): Promise<CorpusRecord | null> {
      const [result] = await sql([{ query: "SELECT record FROM bimfit_corpus_records WHERE release_id=$1 AND record_id=$2", params: [releaseId,id] }]);
      return (result.rows[0]?.record as CorpusRecord | undefined) ?? null;
    },
    async download(releaseId: string): Promise<PublishedCorpusArtifact | null> {
      const [result] = await sql([{ query: "SELECT artifact FROM bimfit_corpus_releases WHERE release_id=$1", params: [releaseId] }]);
      return (result.rows[0]?.artifact as PublishedCorpusArtifact | undefined) ?? null;
    },
  };
}
export { CorpusStoreError };
