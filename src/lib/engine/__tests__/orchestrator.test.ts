import { describe, it, expect, vi } from "vitest";
import { runEngine } from "../orchestrator";
import type { BimEngineInput } from "../types";

const RING: [number, number][][] = [[[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]]];

function fakeSession() {
  let id = 0;
  return {
    createModel: vi.fn(() => 1),
    writeLine: vi.fn(() => ++id), // returns a fresh expressId
    saveModel: vi.fn(() => new Uint8Array([1, 2, 3])),
    closeModel: vi.fn(),
  };
}

describe("runEngine", () => {
  it("chains ingest -> fuse -> generateIfc -> validate -> score for a clean CAD-exact building", async () => {
    const session = fakeSession();
    const input: BimEngineInput = {
      pk: "p",
      title: "T",
      cadFootprint: { rings: RING, source: "cad-exact" },
      ledger: { heightM: 6.6, floors: 2 },
    };

    const result = await runEngine(input, session as never);

    // 10x8 footprint = 4 edges; 2 storeys => 8 walls + 2 slabs = 10 elements.
    expect(result.elements).toHaveLength(10);
    expect(result.validation.passed).toBe(true);
    expect(result.hitlFlags).toHaveLength(0);
    expect(result.ifcBytes.length).toBeGreaterThan(0);
    expect(result.conflicts).toHaveLength(0);
    expect(session.saveModel).toHaveBeenCalledOnce();
  });

  it("flags every element for a vworld-only footprint with no height/floors source (era-estimate)", async () => {
    const session = fakeSession();
    const input: BimEngineInput = {
      pk: "p2",
      vworldFootprint: { rings: RING },
    };

    const result = await runEngine(input, session as never);

    expect(result.elements.length).toBeGreaterThan(0);
    expect(result.hitlFlags).toHaveLength(result.elements.length);
    expect(result.elements.every((e) => e.sconf < 0.85)).toBe(true);
  });
});
