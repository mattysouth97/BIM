// The schematic editor's store: builder-backed drawing, undo/redo, and the
// validation that follows every mutation.
//
// The point of these tests is that DRAWING PRODUCES SEMANTICS. A dragged
// rectangle is not four coordinates — it is a boundary on levels 1–3, or a core
// with stairs and lifts, and the blueprint it lands in stays schema-valid.

import { beforeEach, describe, expect, it } from "vitest";

import { validateBlueprint, BlueprintSpecSchema } from "@/lib/generative/blueprint";
import { mapDxfTextToDoc } from "@/lib/cad/doc/map-dxf-to-doc";
import {
  guessLayerAssignments,
  importCadDocument,
} from "@/lib/generative/blueprint/import-cad-file";
import {
  floorRange,
  highestIdSuffix,
  nearestBoundaryPoint,
  orthoPoint,
  rectRegion,
  removeObject,
  snapPoint,
  useBlueprintStore,
  type BlueprintImportProvenance,
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

  it("places a column and a light on the schematic as family instances", () => {
    drawPlate();
    useBlueprintStore.getState().setTool("column");
    expect(useBlueprintStore.getState().tool).toBe("column");
    useBlueprintStore.getState().placePlacement(mm(6_000, 4_000));

    useBlueprintStore.getState().setTool("lighting");
    useBlueprintStore.getState().placePlacement(mm(10_000, 8_000));

    const { blueprint, validation, selectedId } = useBlueprintStore.getState();
    const placements = blueprint.placements ?? [];
    expect(placements).toHaveLength(2);
    expect(placements[0]).toMatchObject({
      tool: "column",
      familyId: "column-struct-round-450",
      positionMm: mm(6_000, 4_000),
      floorNos: [1, 2, 3],
    });
    expect(placements[1]).toMatchObject({
      tool: "lighting",
      familyId: "light-troffer-600",
    });
    expect(selectedId).toBe(placements[1].id);
    expect(validation.counts.critical).toBe(0);

    useBlueprintStore.getState().select(placements[0].id);
    useBlueprintStore.getState().deleteSelected();
    expect(useBlueprintStore.getState().blueprint.placements).toHaveLength(1);
    expect(useBlueprintStore.getState().blueprint.placements?.[0].tool).toBe("lighting");
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

describe("loading an imported blueprint", () => {
  /** A real DXF import: L-shaped wall, core rectangle, room rectangle. */
  function importedFixture() {
    const dxf = [
      "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES",
      "0", "LWPOLYLINE", "8", "A-WALL", "90", "6", "70", "1",
      "10", "0", "20", "0",
      "10", "20000", "20", "0",
      "10", "20000", "20", "12000",
      "10", "12000", "20", "12000",
      "10", "12000", "20", "20000",
      "10", "0", "20", "20000",
      "0", "LWPOLYLINE", "8", "A-CORE", "90", "4", "70", "1",
      "10", "14000", "20", "2000",
      "10", "18000", "20", "2000",
      "10", "18000", "20", "6000",
      "10", "14000", "20", "6000",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");
    const doc = mapDxfTextToDoc(dxf, "plan.dxf");
    const outcome = importCadDocument(doc, guessLayerAssignments(doc), {
      fileName: "plan.dxf",
    });
    if (!outcome.ok) throw new Error(`fixture import failed: ${outcome.error.code}`);
    const provenance: BlueprintImportProvenance = {
      fileName: "plan.dxf",
      format: "dxf",
      documentId: doc.id,
      assignments: guessLayerAssignments(doc),
      report: outcome.report,
    };
    return { blueprint: outcome.blueprint, provenance };
  }

  it("replaces the working blueprint and re-derives validation", () => {
    drawPlate();
    const { blueprint, provenance } = importedFixture();

    useBlueprintStore.getState().loadBlueprint(blueprint, provenance);

    const state = useBlueprintStore.getState();
    expect(state.blueprint.source).toBe("dxf");
    expect(state.blueprint.boundaries).toHaveLength(1);
    expect(state.blueprint.cores).toHaveLength(1);
    // Validation is the store's, computed from what was loaded — not carried in.
    expect(state.validation).toEqual(validateBlueprint(blueprint));
    expect(state.validation.counts.critical).toBe(0);
    expect(state.selectedId).toBeNull();
    expect(state.draft).toBeNull();
  });

  it("is ONE undo step, so a bad import is one Ctrl+Z", () => {
    drawPlate();
    const before = useBlueprintStore.getState().blueprint;
    const depthBefore = useBlueprintStore.getState().past.length;

    const { blueprint, provenance } = importedFixture();
    useBlueprintStore.getState().loadBlueprint(blueprint, provenance);

    expect(useBlueprintStore.getState().past).toHaveLength(depthBefore + 1);

    useBlueprintStore.getState().undo();
    const after = useBlueprintStore.getState();
    expect(after.blueprint).toEqual(before);
    expect(after.blueprint.source).toBe("native-editor");
    expect(after.past).toHaveLength(depthBefore);

    useBlueprintStore.getState().redo();
    expect(useBlueprintStore.getState().blueprint.source).toBe("dxf");
  });

  it("records the file and the confirmed mapping, and drops it when undone past", () => {
    const { blueprint, provenance } = importedFixture();
    useBlueprintStore.getState().loadBlueprint(blueprint, provenance);

    expect(useBlueprintStore.getState().activeImport()).toBe(provenance);
    expect(useBlueprintStore.getState().activeImport()?.fileName).toBe("plan.dxf");
    expect(
      useBlueprintStore
        .getState()
        .activeImport()
        ?.report.mapping.find((row) => row.layer === "A-WALL")?.role,
    ).toBe("boundary");

    // Editing after the import keeps the provenance: the blueprint still
    // descends from that file.
    const store = useBlueprintStore.getState();
    store.setTool("core");
    store.startRect(mm(1_000, 1_000));
    store.updateRect(mm(4_000, 4_000));
    store.commitRect();
    expect(useBlueprintStore.getState().activeImport()).toBe(provenance);

    // Undoing past the import does not: that blueprint came from nowhere.
    useBlueprintStore.getState().undo();
    useBlueprintStore.getState().undo();
    expect(useBlueprintStore.getState().activeImport()).toBeNull();
  });

  it("never mints an id the imported blueprint already used", () => {
    const { blueprint, provenance } = importedFixture();
    expect(highestIdSuffix(blueprint)).toBeGreaterThan(0);

    useBlueprintStore.getState().loadBlueprint(blueprint, provenance);
    const importedCoreId = useBlueprintStore.getState().blueprint.cores[0].id;

    const store = useBlueprintStore.getState();
    store.setTool("core");
    store.startRect(mm(1_000, 1_000));
    store.updateRect(mm(4_000, 4_000));
    store.commitRect();

    const cores = useBlueprintStore.getState().blueprint.cores;
    expect(cores).toHaveLength(2);
    expect(cores[1].id).not.toBe(importedCoreId);
    expect(
      useBlueprintStore.getState().validation.violations.some(
        (v) => v.code === "DUPLICATE_ID",
      ),
    ).toBe(false);
  });

  it("clears the provenance on reset", () => {
    const { blueprint, provenance } = importedFixture();
    useBlueprintStore.getState().loadBlueprint(blueprint, provenance);
    useBlueprintStore.getState().reset();
    expect(useBlueprintStore.getState().importProvenance).toBeNull();
    expect(useBlueprintStore.getState().activeImport()).toBeNull();
  });
});

/** The same blueprint with nothing drawn — for the "no envelope" case. */
function emptyLike(spec: ReturnType<typeof useBlueprintStore.getState>["blueprint"]) {
  return { ...spec, boundaries: [] };
}
