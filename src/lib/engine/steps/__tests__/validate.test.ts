import { describe, it, expect } from "vitest";
import { validate } from "../validate";
import type { FusedModel, GeneratedElement } from "../../types";

const CLOSED_RING: [number, number][] = [[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]];

const model: FusedModel = {
  pk: "p",
  title: "T",
  footprint: [CLOSED_RING],
  footprintSource: "cad-exact",
  floors: 2,
  floorsSource: "ledger",
  storeyHeightM: 3.3,
  totalHeightM: 6.6,
  heightSource: "ledger",
  wallThicknessM: 0.3,
};

/** Mirrors generate-ifc's per-storey emission order: edgeCount walls then one slab, per storey. */
function buildElements(floors: number, edgeCount: number): GeneratedElement[] {
  const elements: GeneratedElement[] = [];
  let expressId = 0;
  for (let storey = 0; storey < floors; storey += 1) {
    for (let edge = 0; edge < edgeCount; edge += 1) {
      expressId += 1;
      elements.push({ expressId, kind: "wall", storey, geomSource: "cad-exact", heightSource: "ledger" });
    }
    expressId += 1;
    elements.push({ expressId, kind: "slab", storey, geomSource: "cad-exact", heightSource: "ledger" });
  }
  return elements;
}

describe("validate", () => {
  it("passes all checks for a valid closed model", () => {
    const elements = buildElements(2, 4);
    const report = validate(model, elements);

    expect(report.passed).toBe(true);
    expect(report.checks.every((c) => c.passed)).toBe(true);
    expect(report.checks.map((c) => c.id).sort()).toEqual(
      ["element-count", "footprint-nondegenerate", "ring-closed", "storey-monotonic"].sort(),
    );
  });

  it("fails ring-closed when the footprint ring is not closed", () => {
    const openRing: [number, number][] = [[0, 0], [10, 0], [10, 8], [0, 8]]; // no closing vertex
    const openModel: FusedModel = { ...model, footprint: [openRing] };
    const elements = buildElements(2, 3);

    const report = validate(openModel, elements);

    expect(report.passed).toBe(false);
    const ringCheck = report.checks.find((c) => c.id === "ring-closed");
    expect(ringCheck?.passed).toBe(false);
    expect(ringCheck?.elementIds).toEqual(elements.filter((e) => e.kind === "slab").map((e) => e.expressId));
  });

  it("fails footprint-nondegenerate for a degenerate (collinear) footprint", () => {
    const collinearRing: [number, number][] = [[0, 0], [5, 0], [10, 0], [0, 0]]; // closed, zero area
    const degenerateModel: FusedModel = { ...model, footprint: [collinearRing] };
    const elements = buildElements(2, 3);

    const report = validate(degenerateModel, elements);

    expect(report.passed).toBe(false);
    const areaCheck = report.checks.find((c) => c.id === "footprint-nondegenerate");
    expect(areaCheck?.passed).toBe(false);
    expect(areaCheck?.elementIds).toEqual(elements.filter((e) => e.kind === "slab").map((e) => e.expressId));
  });
});
