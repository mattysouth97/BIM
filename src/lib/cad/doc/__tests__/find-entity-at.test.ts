// src/lib/cad/doc/__tests__/find-entity-at.test.ts
import { describe, it, expect } from "vitest";
import { findEntityAt } from "../hit-test";
import type { CadDocument } from "../types";

const doc = (entities: CadDocument["entities"]): CadDocument => ({
  id: "t", layers: [], entities, unitScaleToMeters: 1,
  extents: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } },
  warnings: [], stats: { totalParsed: 0, mapped: 0, skipped: {} },
});

describe("findEntityAt", () => {
  it("hits a line near its middle, misses beyond tolerance", () => {
    const d = doc([{ id: "l1", kind: "line", layer: "L", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }]);
    expect(findEntityAt(d, { x: 5, y: 0.3 }, 0.5)?.id).toBe("l1");
    expect(findEntityAt(d, { x: 5, y: 2 }, 0.5)).toBeNull();
  });
  it("hits a circle on its rim, not its center", () => {
    const d = doc([{ id: "c1", kind: "circle", layer: "L", center: { x: 0, y: 0 }, radius: 5 }]);
    expect(findEntityAt(d, { x: 5.2, y: 0 }, 0.5)?.id).toBe("c1");
    expect(findEntityAt(d, { x: 0, y: 0 }, 0.5)).toBeNull();
  });
  it("nearest of two candidates wins", () => {
    const d = doc([
      { id: "a", kind: "line", layer: "L", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
      { id: "b", kind: "line", layer: "L", a: { x: 0, y: 1 }, b: { x: 10, y: 1 } },
    ]);
    expect(findEntityAt(d, { x: 5, y: 0.7 }, 2)?.id).toBe("b");
  });
  it("hits text inside its label box", () => {
    const d = doc([{
      id: "t1", kind: "text", layer: "L", position: { x: 10, y: 10 },
      height: 0.5, rotation: 0, text: "Room",
    }]);
    expect(findEntityAt(d, { x: 10.8, y: 10.2 }, 0.1)?.id).toBe("t1");
    expect(findEntityAt(d, { x: 13, y: 10.2 }, 0.1)).toBeNull();
  });
});
