// src/lib/ifc/__tests__/ifc-lifecycle.test.ts
// P2-13 WP1 — IFC loader lifecycle: one cached IfcAPI per session,
// CloseModel in finally, dispose replaced geometries/materials.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getSharedIfcApi,
  disposeIfcSession,
  type IfcSession,
} from "../ifc-session";

// ─────────────────────────────────────────────────────────────────────────────
// Mock web-ifc (WASM not available in vitest/happy-dom)
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("web-ifc", () => {
  class IfcAPI {
    Init = vi.fn().mockResolvedValue(undefined);
    OpenModel = vi.fn().mockReturnValue(42);
    CloseModel = vi.fn();
    StreamAllMeshes = vi.fn();
    GetGeometry = vi.fn().mockReturnValue({
      GetVertexData: vi.fn().mockReturnValue(0),
      GetVertexDataSize: vi.fn().mockReturnValue(0),
      GetIndexData: vi.fn().mockReturnValue(0),
      GetIndexDataSize: vi.fn().mockReturnValue(0),
      delete: vi.fn(),
    });
    GetVertexArray = vi.fn().mockReturnValue(new Float32Array(0));
    GetIndexArray = vi.fn().mockReturnValue(new Uint32Array(0));
  }
  return { IfcAPI };
});

// ─────────────────────────────────────────────────────────────────────────────
// WP1-A: singleton IfcAPI per session
// ─────────────────────────────────────────────────────────────────────────────

describe("getSharedIfcApi — singleton per session", () => {
  beforeEach(() => {
    disposeIfcSession();
  });

  it("returns the same api instance on repeated calls without dispose", async () => {
    const session1 = await getSharedIfcApi();
    const session2 = await getSharedIfcApi();
    expect(session1.api).toBe(session2.api);
  });

  it("after disposeIfcSession, next call creates a fresh api instance", async () => {
    const session1 = await getSharedIfcApi();
    disposeIfcSession();
    const session2 = await getSharedIfcApi();
    expect(session1.api).not.toBe(session2.api);
  });

  it("IfcAPI.Init is called exactly once per session even with concurrent calls", async () => {
    const [s1, s2, s3] = await Promise.all([
      getSharedIfcApi(),
      getSharedIfcApi(),
      getSharedIfcApi(),
    ]);
    // All resolved to same session
    expect(s1.api).toBe(s2.api);
    expect(s2.api).toBe(s3.api);
    // Init called once
    expect(s1.api.Init).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WP1-B: CloseModel + dispose called on replace / error
// ─────────────────────────────────────────────────────────────────────────────

describe("IFC session lifecycle — CloseModel in finally", () => {
  beforeEach(() => {
    disposeIfcSession();
  });

  it("session object has closeModel helper that calls api.CloseModel", async () => {
    const session: IfcSession = await getSharedIfcApi();
    const modelId = 7;
    session.closeModel(modelId);
    expect(session.api.CloseModel).toHaveBeenCalledWith(modelId);
  });

  it("disposeIfcSession resets the singleton (api instance replaced on next call)", async () => {
    const first = await getSharedIfcApi();
    disposeIfcSession();
    const second = await getSharedIfcApi();
    // Fresh instance — not the same object reference
    expect(first.api).not.toBe(second.api);
  });
});
