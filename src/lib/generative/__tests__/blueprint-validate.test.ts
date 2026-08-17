import { describe, expect, it } from "vitest";

import {
  parseBlueprintSpec,
  type BlueprintSpec,
  type BoundaryLoop,
} from "../blueprint/blueprint-spec";
import {
  addBoundary,
  addCirculationEdge,
  addCirculationNode,
  addVoid,
  addZone,
  emptyBlueprint,
  makePolyLoop,
  makeRectLoop,
} from "../blueprint/builders";
import {
  tessellateLoop,
  validateBlueprint,
} from "../blueprint/validate-blueprint";

const PLATE = { xMm: 0, zMm: 0, widthMm: 30_000, depthMm: 20_000 };

function base(floorNos: number[] = [1, 2, 3]): BlueprintSpec {
  return addBoundary(emptyBlueprint("Test Plan"), {
    loop: makeRectLoop("plate", PLATE),
    floorNos,
  });
}

const codes = (spec: BlueprintSpec) =>
  validateBlueprint(spec).violations.map((v) => v.code);

describe("validateBlueprint", () => {
  it("reports nothing for a clean, calibrated blueprint", () => {
    const spec = base();
    expect(parseBlueprintSpec(spec)).toEqual(spec);

    const report = validateBlueprint(spec);
    expect(report.violations).toEqual([]);
    expect(report.counts).toEqual({ critical: 0, warning: 0, advisory: 0 });
    expect(report.blueprintValid).toBe(true);
  });

  it("returns violations worst-first with the rules.ts report shape", () => {
    const spec: BlueprintSpec = {
      ...base(),
      coordinateSystem: { ...base().coordinateSystem, calibrated: false, method: "assumed" },
      relationships: [
        { id: "r1", kind: "ADJACENT_TO", fromId: "plate", toId: "ghost", weight: 0.5 },
      ],
    };
    const report = validateBlueprint(spec);

    expect(report.violations[0].priority).toBe("P0");
    expect(report.violations[0]).toMatchObject({
      code: "DANGLING_REF",
      severity: "critical",
      message: expect.any(String),
      elementIds: expect.any(Array),
    });
    expect(report.violations[report.violations.length - 1].severity).toBe("advisory");
    expect(report.counts.critical).toBe(1);
    expect(report.counts.advisory).toBe(1);
    expect(report.blueprintValid).toBe(false);
  });
});

describe("BOUNDARY_NOT_CLOSED", () => {
  it("catches a loop whose last segment does not return to the start", () => {
    const rect = makeRectLoop("plate", PLATE);
    const open: BoundaryLoop = {
      id: "plate",
      segments: [
        ...rect.segments.slice(0, 3),
        {
          kind: "line",
          startMm: { xMm: 0, zMm: 20_000 },
          endMm: { xMm: 500, zMm: 500 },
        },
      ],
    };
    const spec = addBoundary(emptyBlueprint("Open"), { loop: open, floorNos: [1] });
    expect(codes(spec)).toContain("BOUNDARY_NOT_CLOSED");
  });

  it("tolerates a sub-millimetre snapping gap", () => {
    // Endpoints are integer millimetres, so the only gap this size is a
    // rounding artefact — flagging it would make the editor unusable.
    const spec = base();
    expect(codes(spec)).not.toContain("BOUNDARY_NOT_CLOSED");
  });

  it("catches a loop that encloses no area", () => {
    const degenerate: BoundaryLoop = {
      id: "sliver",
      segments: [
        { kind: "line", startMm: { xMm: 0, zMm: 0 }, endMm: { xMm: 1_000, zMm: 0 } },
        { kind: "line", startMm: { xMm: 1_000, zMm: 0 }, endMm: { xMm: 0, zMm: 0 } },
      ],
    };
    const spec = addBoundary(emptyBlueprint("Sliver"), {
      loop: degenerate,
      floorNos: [1],
    });
    expect(codes(spec)).toContain("BOUNDARY_NOT_CLOSED");
  });
});

describe("BOUNDARY_SELF_INTERSECTS", () => {
  it("catches a bow-tie outline", () => {
    const bowtie = makePolyLoop("plate", [
      { xMm: 0, zMm: 0 },
      { xMm: 30_000, zMm: 20_000 },
      { xMm: 30_000, zMm: 0 },
      { xMm: 0, zMm: 20_000 },
    ]);
    const spec = addBoundary(emptyBlueprint("Bowtie"), { loop: bowtie, floorNos: [1] });
    const found = codes(spec);
    expect(found).toContain("BOUNDARY_SELF_INTERSECTS");
    expect(found).not.toContain("BOUNDARY_NOT_CLOSED");
  });

  it("passes a simple concave outline", () => {
    const lShape = makePolyLoop("plate", [
      { xMm: 0, zMm: 0 },
      { xMm: 30_000, zMm: 0 },
      { xMm: 30_000, zMm: 10_000 },
      { xMm: 12_000, zMm: 10_000 },
      { xMm: 12_000, zMm: 20_000 },
      { xMm: 0, zMm: 20_000 },
    ]);
    const spec = addBoundary(emptyBlueprint("L"), { loop: lShape, floorNos: [1] });
    expect(validateBlueprint(spec).violations).toEqual([]);
  });

  it("tessellates curved segments before testing, without false positives", () => {
    // Half-disc: a straight base plus a semicircular arc back to the start.
    const disc: BoundaryLoop = {
      id: "plate",
      segments: [
        {
          kind: "line",
          startMm: { xMm: -10_000, zMm: 0 },
          endMm: { xMm: 10_000, zMm: 0 },
        },
        {
          kind: "arc",
          startMm: { xMm: 10_000, zMm: 0 },
          endMm: { xMm: -10_000, zMm: 0 },
          centerMm: { xMm: 0, zMm: 0 },
          sweep: "ccw",
        },
      ],
    };
    expect(tessellateLoop(disc).length).toBeGreaterThan(10);

    const spec = addBoundary(emptyBlueprint("Disc"), { loop: disc, floorNos: [1] });
    expect(validateBlueprint(spec).violations).toEqual([]);
  });
});

describe("DANGLING_REF", () => {
  it("catches relationship, dimension, member and edge references", () => {
    const spec: BlueprintSpec = {
      ...base(),
      relationships: [
        { id: "r1", kind: "ADJACENT_TO", fromId: "plate", toId: "ghost", weight: 1 },
      ],
      dimensions: [
        {
          id: "d1",
          subject: { mode: "absolute", targetId: "phantom", measure: "width" },
          valueMm: {
            value: 12_000,
            source: "USER_PROVIDED",
            confidence: 1,
            reason: "Drawn.",
          },
          hold: { mode: "hard" },
          weight: 1,
        },
      ],
      facadeRules: [
        {
          id: "f1",
          edge: { loopId: "plate", segmentIndex: 9 },
          treatment: {
            value: "window-band",
            source: "USER_PROVIDED",
            confidence: 1,
            reason: "Drawn.",
          },
          floorNos: [1],
        },
      ],
    };

    const found = validateBlueprint(spec).violations.filter(
      (v) => v.code === "DANGLING_REF",
    );
    expect(found).toHaveLength(3);
    expect(found.every((v) => v.priority === "P0")).toBe(true);
    expect(found.map((v) => v.elementIds[0]).sort()).toEqual(["d1", "f1", "r1"]);
  });

  it("resolves a loopRef against a loop inlined inside another region", () => {
    let spec = base();
    spec = addZone(spec, {
      id: "wing",
      program: "office-open",
      region: {
        kind: "loop",
        loop: makeRectLoop("wing-loop", {
          xMm: 1_000,
          zMm: 1_000,
          widthMm: 5_000,
          depthMm: 5_000,
        }),
      },
      floorNos: [2],
    });
    spec = {
      ...spec,
      gridSystems: [
        {
          id: "g-wing",
          regionLoopId: "wing-loop",
          originMm: { xMm: 1_000, zMm: 1_000 },
          rotationRad: 0,
          xSpacingsMm: [6_000, 6_000],
          zSpacingsMm: [6_000],
        },
      ],
    };
    expect(codes(spec)).not.toContain("DANGLING_REF");
  });

  it("catches a reused id before it can shadow a real object", () => {
    const spec = addBoundary(base(), {
      loop: makeRectLoop("plate", { xMm: 0, zMm: 0, widthMm: 1_000, depthMm: 1_000 }),
      floorNos: [1],
    });
    expect(codes(spec)).toContain("DUPLICATE_ID");
  });
});

describe("CIRCULATION_DISCONNECTED", () => {
  function withNodes(spec: BlueprintSpec): BlueprintSpec {
    let out = spec;
    for (const id of ["a", "b", "c", "d"]) {
      out = addCirculationNode(out, {
        id: `n-${id}`,
        kind: "junction",
        positionMm: { xMm: 1_000, zMm: 1_000 },
        floorNos: [1],
      });
    }
    return out;
  }

  it("catches an island of nodes with no route to the first node", () => {
    let spec = withNodes(base());
    spec = addCirculationEdge(spec, { id: "e1", fromNodeId: "n-a", toNodeId: "n-b" });
    spec = addCirculationEdge(spec, { id: "e2", fromNodeId: "n-c", toNodeId: "n-d" });

    const found = validateBlueprint(spec).violations.find(
      (v) => v.code === "CIRCULATION_DISCONNECTED",
    );
    expect(found?.elementIds).toEqual(["n-c", "n-d"]);
  });

  it("passes a fully linked graph regardless of edge direction", () => {
    let spec = withNodes(base());
    spec = addCirculationEdge(spec, { id: "e1", fromNodeId: "n-b", toNodeId: "n-a" });
    spec = addCirculationEdge(spec, { id: "e2", fromNodeId: "n-c", toNodeId: "n-b" });
    spec = addCirculationEdge(spec, { id: "e3", fromNodeId: "n-d", toNodeId: "n-c" });
    expect(codes(spec)).not.toContain("CIRCULATION_DISCONNECTED");
  });
});

describe("VOID_OUTSIDE_BOUNDARY", () => {
  it("catches a void whose bounding box escapes the plate", () => {
    const spec = addVoid(base(), {
      id: "atrium",
      kind: "atrium",
      region: {
        kind: "rect",
        originMm: { xMm: 200_000, zMm: 5_000 },
        widthMm: 5_000,
        depthMm: 5_000,
        rotationRad: 0,
      },
      floorNos: [1, 2],
    });
    const found = validateBlueprint(spec).violations.find(
      (v) => v.code === "VOID_OUTSIDE_BOUNDARY",
    );
    expect(found).toMatchObject({ priority: "P1", elementIds: ["atrium"], floorNo: 1 });
  });

  it("passes a void inside the plate", () => {
    const spec = addVoid(base(), {
      id: "atrium",
      kind: "atrium",
      region: {
        kind: "rect",
        originMm: { xMm: 15_000, zMm: 10_000 },
        widthMm: 6_000,
        depthMm: 6_000,
        rotationRad: 0,
      },
      floorNos: [2, 3],
    });
    expect(codes(spec)).not.toContain("VOID_OUTSIDE_BOUNDARY");
  });
});

describe("LEVEL_MAPPING_GAP", () => {
  it("catches a hole in the mapped level run", () => {
    const spec = base([1, 2, 4]);
    const found = validateBlueprint(spec).violations.find(
      (v) => v.code === "LEVEL_MAPPING_GAP",
    );
    expect(found?.floorNo).toBe(3);
  });

  it("catches an object relying on a level no boundary covers", () => {
    const spec = addZone(base([1, 2, 3]), {
      id: "sky-bar",
      program: "retail",
      region: { kind: "loopRef", loopId: "plate" },
      floorNos: [9],
    });
    const found = validateBlueprint(spec).violations.find(
      (v) => v.code === "LEVEL_MAPPING_GAP",
    );
    expect(found).toMatchObject({ floorNo: 9, elementIds: ["sky-bar"] });
  });

  it("accepts one plan mapped across a run of levels", () => {
    expect(codes(base([1, 2, 3, 4, 5]))).not.toContain("LEVEL_MAPPING_GAP");
  });
});

describe("GRID_SPACING_INVALID", () => {
  it("catches a bay too small to be a bay", () => {
    const spec: BlueprintSpec = {
      ...base(),
      gridSystems: [
        {
          id: "g1",
          originMm: { xMm: 0, zMm: 0 },
          rotationRad: 0,
          xSpacingsMm: [100, 8_400],
          zSpacingsMm: [8_400],
        },
      ],
    };
    const found = validateBlueprint(spec).violations.filter(
      (v) => v.code === "GRID_SPACING_INVALID",
    );
    expect(found).toHaveLength(1);
    expect(found[0].elementIds).toEqual(["g1"]);
  });
});

describe("SCALE_UNCALIBRATED", () => {
  it("is advisory, not blocking, when the drawing was never calibrated", () => {
    const spec = base();
    const uncalibrated: BlueprintSpec = {
      ...spec,
      source: "image",
      coordinateSystem: {
        ...spec.coordinateSystem,
        calibrated: false,
        method: "assumed",
        calibrationConfidence: 0,
      },
    };
    const report = validateBlueprint(uncalibrated);
    expect(report.violations.map((v) => v.code)).toEqual(["SCALE_UNCALIBRATED"]);
    expect(report.violations[0].severity).toBe("advisory");
    expect(report.blueprintValid).toBe(true);
  });

  it("also fires on a low-confidence calibration", () => {
    const spec = base();
    const shaky: BlueprintSpec = {
      ...spec,
      coordinateSystem: {
        ...spec.coordinateSystem,
        method: "known-element",
        calibrationConfidence: 0.3,
      },
    };
    expect(codes(shaky)).toContain("SCALE_UNCALIBRATED");
  });
});
