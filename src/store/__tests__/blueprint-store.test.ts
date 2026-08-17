// The schematic editor's store: builder-backed drawing, undo/redo, and the
// validation that follows every mutation.
//
// The point of these tests is that DRAWING PRODUCES SEMANTICS. A dragged
// rectangle is not four coordinates — it is a boundary on levels 1–3, or a core
// with stairs and lifts, and the blueprint it lands in stays schema-valid.

import { beforeEach, describe, expect, it } from "vitest";

import { validateBlueprint, BlueprintSpecSchema } from "@/lib/generative/blueprint";
import {
  floorRange,
  nearestBoundaryPoint,
  orthoPoint,
  rectRegion,
  removeObject,
  snapPoint,
  useBlueprintStore,
} from "@/store/blueprint-store";

const mm = (xMm: number, zMm: number) => ({ xMm, zMm });

/** Draw a 30 × 20 m plate with the rectangle tool. */
function drawPlate() {
  const store = useBlueprintStore.getState();
  store.setTool("boundary");
  store.setShapeMode("rect");
  store.startRect(mm(0, 0));
  store.updateRect(mm(30_000, 20_000));
  store.commitRect();
}

beforeEach(() => {
  const store = useBlueprintStore.getState();
  store.reset();
  store.setSnap(500);
  store.setFloors(1, 3);
  store.setTool("boundary");
  store.setShapeMode("rect");
});

describe("pure helpers", () => {
  it("snaps to the grid, and keeps the point when snapping is off", () => {
    expect(snapPoint(mm(1_240, -1_240), 500)).toEqual(mm(1_000, -1_000));
    expect(snapPoint(mm(1_240.6, 3.2), 0)).toEqual(mm(1_241, 3));
  });

  it("constrains to the dominant axis for ortho", () => {
    expect(orthoPoint(mm(0, 0), mm(5_000, 400))).toEqual(mm(5_000, 0));
    expect(orthoPoint(mm(0, 0), mm(400, 5_000))).toEqual(mm(0, 5_000));
  });

  it("refuses a degenerate rectangle", () => {
    expect(rectRegion(mm(0, 0), mm(0, 5_000))).toBeNull();
    expect(rectRegion(mm(0, 0), mm(4_000, 2_000))).toMatchObject({
      kind: "rect",
      widthMm: 4_000,
      depthMm: 2_000,
    });
  });

  it("never produces storey 0, which the schema forbids", () => {
    expect(floorRange(-2, 2)).toEqual([-2, -1, 1, 2]);
    expect(floorRange(3, 1)).toEqual([1, 2, 3]);
  });
});

describe("drawing through the builders", () => {
  it("turns a dragged rectangle into a boundary on the chosen levels", () => {
    drawPlate();
    const { blueprint, validation } = useBlueprintStore.getState();

    expect(blueprint.boundaries).toHaveLength(1);
    expect(blueprint.boundaries[0].floorNos).toEqual([1, 2, 3]);
    expect(blueprint.boundaries[0].role).toBe("outline");
    expect(blueprint.boundaries[0].loop.segments).toHaveLength(4);
    expect(validation.counts.critical).toBe(0);
    expect(BlueprintSpecSchema.safeParse(blueprint).success).toBe(true);
  });

  it("closes a clicked polygon into a boundary and rejects a stub", () => {
    const store = useBlueprintStore.getState();
    store.setShapeMode("polygon");
    store.addPoint(mm(0, 0));
    store.addPoint(mm(20_000, 0));
    useBlueprintStore.getState().closePolygon();
    // Two points enclose nothing, so nothing is committed.
    expect(useBlueprintStore.getState().blueprint.boundaries).toHaveLength(0);

    useBlueprintStore.getState().addPoint(mm(20_000, 16_000));
    useBlueprintStore.getState().addPoint(mm(0, 16_000));
    useBlueprintStore.getState().closePolygon();

    const { blueprint, validation, draft } = useBlueprintStore.getState();
    expect(blueprint.boundaries).toHaveLength(1);
    expect(blueprint.boundaries[0].loop.segments).toHaveLength(4);
    expect(draft).toBeNull();
    expect(validation.counts.critical).toBe(0);
  });

  it("ignores a repeated click on the vertex just placed", () => {
    const store = useBlueprintStore.getState();
    store.setShapeMode("polygon");
    store.addPoint(mm(0, 0));
    useBlueprintStore.getState().addPoint(mm(120, 120)); // snaps onto (0, 0)
    const draft = useBlueprintStore.getState().draft;
    expect(draft?.kind === "polygon" && draft.pointsMm).toHaveLength(1);
  });

  it("stamps a core with real contents and keeps the blueprint valid", () => {
    drawPlate();
    const store = useBlueprintStore.getState();
    store.setTool("core");
    store.startRect(mm(12_000, 8_000));
    store.updateRect(mm(20_000, 14_000));
    store.commitRect();

    const { blueprint, validation } = useBlueprintStore.getState();
    expect(blueprint.cores).toHaveLength(1);
    expect(blueprint.cores[0].contents).toEqual(["stair", "elevator"]);
    expect(blueprint.cores[0].hold.mode).toBe("hard");
    expect(validation.counts.critical).toBe(0);
  });

  it("records a zone's program as provenanced user intent", () => {
    drawPlate();
    const store = useBlueprintStore.getState();
    store.setTool("zone");
    store.setZoneProgram("laboratory");
    store.startRect(mm(1_000, 1_000));
    store.updateRect(mm(10_000, 9_000));
    store.commitRect();

    const zone = useBlueprintStore.getState().blueprint.zones[0];
    expect(zone.program.value).toBe("laboratory");
    expect(zone.program.source).toBe("USER_PROVIDED");
    expect(zone.floorNos).toEqual([1, 2, 3]);
  });

  it("reports a void drawn outside the plate instead of silently accepting it", () => {
    drawPlate();
    const store = useBlueprintStore.getState();
    store.setTool("void");
    store.setVoidKind("courtyard");
    store.startRect(mm(40_000, 40_000));
    store.updateRect(mm(46_000, 46_000));
    store.commitRect();

    const { validation } = useBlueprintStore.getState();
    expect(
      validation.violations.some((v) => v.code === "VOID_OUTSIDE_BOUNDARY"),
    ).toBe(true);
  });

  it("anchors an entrance onto the boundary it was clicked near", () => {
    drawPlate();
    const store = useBlueprintStore.getState();
    store.setTool("entrance");
    store.placeEntrance(mm(15_200, -2_000));

    const anchor = useBlueprintStore.getState().blueprint.anchors[0];
    expect(anchor.kind.value).toBe("entrance");
    // Projected onto the z = 0 edge, not left where the pointer was.
    expect(anchor.positionMm.zMm).toBe(0);
    expect(anchor.positionMm.xMm).toBeCloseTo(15_200, -2);
    expect(anchor.hold.mode).toBe("hard");
  });

  it("does not place an entrance when there is no envelope to attach it to", () => {
    useBlueprintStore.getState().placeEntrance(mm(0, 0));
    expect(useBlueprintStore.getState().blueprint.anchors).toHaveLength(0);
  });

  it("links circulation nodes as they are placed, so the graph is connected", () => {
    drawPlate();
    const store = useBlueprintStore.getState();
    store.setTool("circulation");
    store.placeCirculationNode(mm(2_000, 2_000));
    useBlueprintStore.getState().placeCirculationNode(mm(2_000, 12_000));
    useBlueprintStore.getState().placeCirculationNode(mm(24_000, 12_000));

    const { blueprint, validation } = useBlueprintStore.getState();
    expect(blueprint.circulation.nodes).toHaveLength(3);
    expect(blueprint.circulation.edges).toHaveLength(2);
    expect(
      validation.violations.some((v) => v.code === "CIRCULATION_DISCONNECTED"),
    ).toBe(false);
  });

  it("starts a new run after Escape rather than linking across the gap", () => {
    drawPlate();
    const store = useBlueprintStore.getState();
    store.setTool("circulation");
    store.placeCirculationNode(mm(2_000, 2_000));
    useBlueprintStore.getState().cancelDraft();
    useBlueprintStore.getState().placeCirculationNode(mm(20_000, 2_000));

    expect(useBlueprintStore.getState().blueprint.circulation.edges).toHaveLength(0);
  });
});

describe("selection and removal", () => {
  it("takes a node's edges with it, so no reference dangles", () => {
    drawPlate();
    const store = useBlueprintStore.getState();
    store.setTool("circulation");
    store.placeCirculationNode(mm(2_000, 2_000));
    useBlueprintStore.getState().placeCirculationNode(mm(2_000, 12_000));

    const nodeId = useBlueprintStore.getState().blueprint.circulation.nodes[0].id;
    useBlueprintStore.getState().select(nodeId);
    useBlueprintStore.getState().deleteSelected();

    const { blueprint, validation } = useBlueprintStore.getState();
    expect(blueprint.circulation.nodes).toHaveLength(1);
    expect(blueprint.circulation.edges).toHaveLength(0);
    expect(validation.violations.some((v) => v.code === "DANGLING_REF")).toBe(false);
    expect(useBlueprintStore.getState().selectedId).toBeNull();
  });

  it("removes an object addressed by its region loop id", () => {
    drawPlate();
    const store = useBlueprintStore.getState();
    store.setTool("zone");
    store.setShapeMode("polygon");
    store.addPoint(mm(1_000, 1_000));
    useBlueprintStore.getState().addPoint(mm(9_000, 1_000));
    useBlueprintStore.getState().addPoint(mm(9_000, 9_000));
    useBlueprintStore.getState().closePolygon();

    const spec = useBlueprintStore.getState().blueprint;
    const loopId =
      spec.zones[0].region.kind === "loop" ? spec.zones[0].region.loop.id : "";
    expect(loopId).not.toBe("");

    const stripped = removeObject(spec, loopId);
    expect(stripped.zones).toHaveLength(0);
    expect(validateBlueprint(stripped).counts.critical).toBe(0);
  });
});

describe("history", () => {
  it("undoes and redoes a drawn object", () => {
    drawPlate();
    expect(useBlueprintStore.getState().blueprint.boundaries).toHaveLength(1);

    useBlueprintStore.getState().undo();
    expect(useBlueprintStore.getState().blueprint.boundaries).toHaveLength(0);
    expect(useBlueprintStore.getState().validation.violations).toHaveLength(0);

    useBlueprintStore.getState().redo();
    expect(useBlueprintStore.getState().blueprint.boundaries).toHaveLength(1);
  });

  it("drops the redo branch once a new object is drawn", () => {
    drawPlate();
    useBlueprintStore.getState().undo();

    const store = useBlueprintStore.getState();
    store.setTool("boundary");
    store.startRect(mm(0, 0));
    store.updateRect(mm(12_000, 12_000));
    store.commitRect();

    expect(useBlueprintStore.getState().future).toHaveLength(0);
    expect(useBlueprintStore.getState().blueprint.boundaries).toHaveLength(1);
  });

  it("never reuses an id after an undo", () => {
    drawPlate();
    const firstId = useBlueprintStore.getState().blueprint.boundaries[0].loop.id;
    useBlueprintStore.getState().undo();
    drawPlate();
    expect(useBlueprintStore.getState().blueprint.boundaries[0].loop.id).not.toBe(
      firstId,
    );
  });

  it("bounds the undo stack", () => {
    for (let i = 0; i < 60; i += 1) {
      const store = useBlueprintStore.getState();
      store.setTool("boundary");
      store.startRect(mm(i * 1_000, 0));
      store.updateRect(mm(i * 1_000 + 6_000, 6_000));
      store.commitRect();
    }
    expect(useBlueprintStore.getState().past.length).toBeLessThanOrEqual(50);
  });
});

describe("fidelity", () => {
  it("moves everything into the preserved list when set to exact", () => {
    drawPlate();
    useBlueprintStore.getState().setFidelityMode("exact");

    const state = useBlueprintStore.getState();
    expect(state.blueprint.fidelityMode).toBe("exact");
    expect(state.preservation().preserved.length).toBeGreaterThan(0);
    expect(state.preservation().flexible).toHaveLength(0);
  });
});

describe("boundary projection", () => {
  it("finds the closest point on the drawn envelope", () => {
    drawPlate();
    const spec = useBlueprintStore.getState().blueprint;
    expect(nearestBoundaryPoint(spec, mm(30_400, 10_000))).toEqual(mm(30_000, 10_000));
    expect(nearestBoundaryPoint(emptyLike(spec), mm(0, 0))).toBeNull();
  });
});

/** The same blueprint with nothing drawn — for the "no envelope" case. */
function emptyLike(spec: ReturnType<typeof useBlueprintStore.getState>["blueprint"]) {
  return { ...spec, boundaries: [] };
}
