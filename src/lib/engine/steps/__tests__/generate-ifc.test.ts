import { describe, it, expect, vi } from "vitest";
import { generateIfc } from "../generate-ifc";
import type { FusedModel } from "../../types";

const model: FusedModel = {
  pk: "p", title: "T",
  footprint: [[[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]]],
  footprintSource: "cad-exact",
  floors: 2, floorsSource: "ledger",
  storeyHeightM: 3.3, totalHeightM: 6.6, heightSource: "ledger",
  wallThicknessM: 0.3,
};

function fakeSession() {
  let id = 0;
  return {
    createModel: vi.fn(() => 1),
    writeLine: vi.fn(() => ++id),      // returns a fresh expressId
    saveModel: vi.fn(() => new Uint8Array([1, 2, 3])),
    closeModel: vi.fn(),
  };
}

describe("generateIfc", () => {
  it("emits one wall per footprint edge per storey and one slab per floor", async () => {
    const session = fakeSession();
    const { ifcBytes, elements } = await generateIfc(model, session as never);
    // 4 edges × 2 storeys = 8 walls; 2 slabs
    expect(elements.filter((e) => e.kind === "wall")).toHaveLength(8);
    expect(elements.filter((e) => e.kind === "slab")).toHaveLength(2);
    expect(elements.every((e) => e.geomSource === "cad-exact")).toBe(true);
    expect(ifcBytes).toBeInstanceOf(Uint8Array);
    expect(session.saveModel).toHaveBeenCalledOnce();
  });
});
