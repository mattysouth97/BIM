// src/lib/engine/counting-session.ts
//
// Pure, WASM-free stand-in for `getSharedIfcWriteSession()` (see
// src/lib/ifc/ifc-session.ts). Satisfies the same `IfcWriteSession` contract
// that `generateIfc` consumes, but never touches web-ifc: `writeLine` just
// hands out a fresh incrementing expressId and `saveModel` returns empty
// bytes. This lets the UI run the full engine pipeline (ingest -> fuse ->
// generateIfc -> validate -> score) during render/effects to compute per-
// element HITL flags cheaply, without loading the WASM binary. The real
// session is reserved for the explicit "Export IFC" action — see
// src/hooks/use-engine-result.ts.

import type { IfcWriteSession, RawIfcLine } from "../ifc/ifc-session";

/**
 * Creates a fresh counting write session. Each session has its own
 * independent expressId counter, starting at 1.
 */
export function createCountingWriteSession(): IfcWriteSession {
  let nextExpressId = 0;

  return {
    createModel: () => 1,
    writeLine: (_modelId: number, _lineObject: RawIfcLine) => {
      nextExpressId += 1;
      return nextExpressId;
    },
    saveModel: (_modelId: number) => new Uint8Array(0),
    closeModel: (_modelId: number) => {
      // no-op: nothing was ever allocated in WASM memory.
    },
  };
}
