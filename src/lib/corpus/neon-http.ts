import "server-only";

export interface SqlQuery { query: string; params: (string | number | null)[] }
export interface SqlResult { rows: Record<string, unknown>[]; rowCount: number }
export class CorpusStoreError extends Error {
  constructor(public readonly code: "unavailable" | "conflict" = "unavailable") { super(`Corpus store ${code}`); }
}
export type SqlExecutor = (queries: SqlQuery[]) => Promise<SqlResult[]>;

/** Small JSON-only adapter for Neon's HTTP protocol. No user-supplied SQL. */
export function createNeonExecutor(connectionString = process.env.DATABASE_URL ?? "", fetcher = fetch): SqlExecutor {
  return async (queries) => {
    let host: string;
    try {
      const url = new URL(connectionString);
      if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname.endsWith(".neon.tech") || !url.username || !url.password) throw new Error();
      host = url.hostname;
    } catch { throw new CorpusStoreError(); }
    try {
      const response = await fetcher(`https://${host}/sql`, {
        method: "POST", cache: "no-store", redirect: "error",
        headers: { "Content-Type": "application/json", "Neon-Connection-String": connectionString,
          "Neon-Raw-Text-Output": "false", "Neon-Array-Mode": "false", "Neon-Batch-Isolation-Level": "Serializable" },
        body: JSON.stringify({ queries }), signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json();
      if (!response.ok) throw new CorpusStoreError(body.code === "23505" ? "conflict" : "unavailable");
      if (!Array.isArray(body.results) || body.results.some((r: SqlResult) => !Array.isArray(r.rows))) throw new CorpusStoreError();
      return body.results as SqlResult[];
    } catch (error) {
      // Never expose upstream messages: they may contain SQL, record values or credentials.
      if (error instanceof CorpusStoreError) throw error;
      throw new CorpusStoreError();
    }
  };
}
