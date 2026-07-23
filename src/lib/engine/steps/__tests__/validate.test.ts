import { describe, it, expect } from "vitest";
import { validate } from "../validate";
import { computeWindowLayout } from "../generate-ifc";
import type { FusedModel, GeneratedElement, FacadeParams } from "../../types";

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
  facade: null,
  facadeSource: "era-estimate",
};

const FACADE: FacadeParams = { windowWidth: 1.2, windowHeight: 1.5, sillHeight: 0.9, windowSpacing: 1.5 };
const modelWithFacade: FusedModel = { ...model, facade: FACADE, facadeSource: "era-estimate" };

/** Windows per storey for `modelWithFacade`'s 10x8 rectangle (2 edges each), per computeWindowLayout. */
function windowsPerStorey(): number {
  return 2 * (computeWindowLayout(10, FACADE).length + computeWindowLayout(8, FACADE).length);
}

function buildWindowElements(floors: number, perStorey: number, startExpressId: number): GeneratedElement[] {
  const elements: GeneratedElement[] = [];
  let expressId = startExpressId;
  for (let storey = 0; storey < floors; storey += 1) {
    for (let i = 0; i < perStorey; i += 1) {
      expressId += 1;
      elements.push({
        expressId,
        kind: "window",
        storey,
        geomSource: "cad-exact",
        heightSource: "ledger",
        facadeSource: "era-estimate",
      });
    }
  }
  return elements;
}

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
      ["element-count", "footprint-nondegenerate", "openings-hosted", "ring-closed", "storey-monotonic"].sort(),
    );
  });

  it("passes openings-hosted with 0 windows when no facade was supplied", () => {
    const elements = buildElements(2, 4);
    const report = validate(model, elements);

    const openingsCheck = report.checks.find((c) => c.id === "openings-hosted");
    expect(openingsCheck?.passed).toBe(true);
  });

  it("fails openings-hosted when windows exist but no facade was supplied", () => {
    const elements = [
      ...buildElements(2, 4),
      { expressId: 999, kind: "window" as const, storey: 0, geomSource: "cad-exact" as const, heightSource: "ledger" as const, facadeSource: "era-estimate" as const },
    ];
    const report = validate(model, elements);

    expect(report.passed).toBe(false);
    const openingsCheck = report.checks.find((c) => c.id === "openings-hosted");
    expect(openingsCheck?.passed).toBe(false);
    expect(openingsCheck?.elementIds).toEqual([999]);
  });

  it("passes openings-hosted and element-count when window counts match the facade layout for every storey", () => {
    const perStorey = windowsPerStorey();
    const elements = [
      ...buildElements(2, 4),
      ...buildWindowElements(2, perStorey, 1000),
    ];
    const report = validate(modelWithFacade, elements);

    expect(report.passed).toBe(true);
    const openingsCheck = report.checks.find((c) => c.id === "openings-hosted");
    expect(openingsCheck?.passed).toBe(true);
    const countCheck = report.checks.find((c) => c.id === "element-count");
    expect(countCheck?.passed).toBe(true);
  });

  it("fails openings-hosted when a storey is missing its expected windows", () => {
    const perStorey = windowsPerStorey();
    const elements = [
      ...buildElements(2, 4),
      // Only storey 0 gets its full window row; storey 1 gets none.
      ...buildWindowElements(1, perStorey, 1000),
    ];
    const report = validate(modelWithFacade, elements);

    expect(report.passed).toBe(false);
    const openingsCheck = report.checks.find((c) => c.id === "openings-hosted");
    expect(openingsCheck?.passed).toBe(false);
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
