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
  // ── Write surface (verified against node_modules/web-ifc/web-ifc-api.d.ts
  //    + web-ifc-api.js for web-ifc@0.0.77) ────────────────────────────────
  CreateModel: (model: { schema: string; name?: string }) => number;
  WriteLine: (modelId: number, lineObject: RawIfcLine) => void;
  SaveModel: (modelId: number) => Uint8Array;
};

// ── Write-side type shim ─────────────────────────────────────────────────────
// A duck-typed IFC "line" object: expressID must be -1 (unassigned) for new
// entities so web-ifc's WriteLine auto-writes nested un-written line objects
// and rewrites them in place as Handles; already-written entities may be
// passed by direct object reference to be linked (WriteLine re-resolves them
// to their real expressID). `type` is the numeric IFC4 express type code.

export interface RawIfcLine {
  expressID: number;
  type: number;
  [field: string]: unknown;
}

export interface IfcWriteSession {
  createModel(): number;
  writeLine(modelId: number, lineObject: RawIfcLine): number;
  saveModel(modelId: number): Uint8Array;
  closeModel(modelId: number): void;
}

const IFC4_SCHEMA = "IFC4";

/**
 * Returns an IFC *write* session backed by the same shared IfcAPI singleton
 * used for reading (see getSharedIfcApi above) — Init is still called at most
 * once per browser session.
 */
export async function getSharedIfcWriteSession(): Promise<IfcWriteSession> {
  const { api } = await getSharedIfcApi();
  return {
    createModel: () => api.CreateModel({ schema: IFC4_SCHEMA }),
    writeLine: (modelId: number, lineObject: RawIfcLine) => {
      api.WriteLine(modelId, lineObject);
      return lineObject.expressID;
    },
    saveModel: (modelId: number) => api.SaveModel(modelId),
    closeModel: (modelId: number) => api.CloseModel(modelId),
  };
}

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
