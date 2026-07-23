import { describe, it, expect } from "vitest";
import { createCountingWriteSession } from "../counting-session";

describe("createCountingWriteSession", () => {
  it("increments a fresh expressId per writeLine call, starting at 1", () => {
    const session = createCountingWriteSession();
    const modelId = session.createModel();
    const first = session.writeLine(modelId, { expressID: -1, type: 1 });
    const second = session.writeLine(modelId, { expressID: -1, type: 2 });
    const third = session.writeLine(modelId, { expressID: -1, type: 3 });

    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(third).toBe(3);
  });

  it("saveModel returns an empty Uint8Array (no real IFC serialization)", () => {
    const session = createCountingWriteSession();
    const modelId = session.createModel();
    const bytes = session.saveModel(modelId);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(0);
  });

  it("closeModel is a no-op that does not throw", () => {
    const session = createCountingWriteSession();
    const modelId = session.createModel();
    expect(() => session.closeModel(modelId)).not.toThrow();
  });

  it("counters are independent per session instance", () => {
    const a = createCountingWriteSession();
    const b = createCountingWriteSession();
    a.writeLine(a.createModel(), { expressID: -1, type: 1 });
    a.writeLine(a.createModel(), { expressID: -1, type: 1 });

    const firstIdOfB = b.writeLine(b.createModel(), { expressID: -1, type: 1 });
    expect(firstIdOfB).toBe(1);
  });
});
