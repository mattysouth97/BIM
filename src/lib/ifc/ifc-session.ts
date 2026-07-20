// src/lib/ifc/ifc-session.ts
// P2-13 WP1 — Singleton IfcAPI per browser session.
// One IfcAPI+Init call; CloseModel helper; dispose on session reset.
//
// Usage:
//   const session = await getSharedIfcApi();
//   const modelId = session.api.OpenModel(bytes);
//   try { /* StreamAllMeshes etc. */ }
//   finally { session.closeModel(modelId); }

// ── Type shim ────────────────────────────────────────────────────────────────
// web-ifc ships its own types; we use a minimal duck-typed surface so this
// module can be imported in tests without the real WASM binary.

type IfcApiInstance = {
  Init: (locateFile?: (path: string) => string) => Promise<void>;
  OpenModel: (data: Uint8Array) => number;
  CloseModel: (modelId: number) => void;
  StreamAllMeshes: (modelId: number, callback: (mesh: unknown) => void) => void;
  GetGeometry: (modelId: number, expressId: number) => unknown;
  GetVertexArray: (ptr: number, size: number) => Float32Array;
  GetIndexArray: (ptr: number, size: number) => Uint32Array;
};

export interface IfcSession {
  api: IfcApiInstance;
  closeModel: (modelId: number) => void;
}

// ── Module-level singleton ───────────────────────────────────────────────────

let sessionPromise: Promise<IfcSession> | null = null;

/**
 * Returns a shared IfcAPI that has already called Init.
 * Concurrent callers share the same promise so Init is called exactly once.
 *
 * In tests, import web-ifc is mocked via vi.mock — no real WASM needed.
 */
export async function getSharedIfcApi(): Promise<IfcSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const WebIFC = await import("web-ifc");
      const api = new WebIFC.IfcAPI() as IfcApiInstance;

      await api.Init((path: string) => {
        if (path.endsWith(".wasm")) return "/wasm/" + path;
        return path;
      });

      const session: IfcSession = {
        api,
        closeModel: (modelId: number) => {
          api.CloseModel(modelId);
        },
      };
      return session;
    })();
  }
  return sessionPromise;
}

/**
 * Reset the singleton. Call this:
 *  - In tests (beforeEach) to isolate sessions.
 *  - When the user navigates away and you want to free the WASM heap.
 */
export function disposeIfcSession(): void {
  sessionPromise = null;
}
