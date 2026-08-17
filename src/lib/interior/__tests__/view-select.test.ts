// src/lib/interior/__tests__/view-select.test.ts
//
// What a viewport draws, and what it rebuilds.
//
// The interior BUILDERS are covered by walls.test.ts and interior-model.test.ts
// against a real generated building. This file covers the three decisions the
// R3F mount makes on top of them — gate, storey filter, rebuild guard — on a
// fixture small enough to count by hand, because those three are the ones that
// would otherwise only be testable by mounting a WebGL canvas.

import { describe, expect, it } from "vitest";

import type { BimElement, BimModelSnapshot } from "@/lib/bim/model/types";

import {
  interiorModelFor,
  interiorOptionsKey,
  planInteriorView,
  selectInteriorFloors,
} from "../view-select";

/* ------------------------------------------------------------------ */
/* Fixture                                                             */
/* ------------------------------------------------------------------ */

const STOREY_HEIGHT_M = 3.5;

function wall(input: {
  id: string;
  floorNo: number;
  start: [number, number];
  end: [number, number];
  exterior?: boolean;
}): BimElement {
  return {
    id: input.id,
    origin: "generated",
    kind: "wall",
    category: "Walls",
    family: "Basic Wall",
    typeId: input.exterior ? "generated-wall-exterior" : "generated-wall-interior",
    buildingPk: "fixture",
    levelId: `level:${input.floorNo}`,
    hostId: null,
    mark: input.id,
    phaseCreated: "new",
    visible: true,
    system: input.exterior ? "envelope" : "partitions",
    generationSource: { type: "GENERATED", generationId: "GEN-TEST", version: 1 },
    instanceParameters: {
      lengthM: Math.hypot(input.end[0] - input.start[0], input.end[1] - input.start[1]),
      unconnectedHeightM: STOREY_HEIGHT_M,
      thicknessMm: 200,
      exterior: input.exterior === true,
      startX: input.start[0],
      startZ: input.start[1],
      endX: input.end[0],
      endZ: input.end[1],
    },
    placement: {
      x: (input.start[0] + input.end[0]) / 2,
      y: 0,
      z: (input.start[1] + input.end[1]) / 2,
      rotationY: Math.atan2(input.end[1] - input.start[1], input.end[0] - input.start[0]),
    },
  };
}

/**
 * Two storeys: one partition each, plus an envelope wall on storey 1 so the
 * `includeExterior` gate has something to gate.
 */
function fixture(): BimModelSnapshot {
  return {
    buildingPk: "fixture",
    levels: [1, 2].map((floorNo) => ({
      id: `level:${floorNo}`,
      name: `L0${floorNo}`,
      elevation: (floorNo - 1) * STOREY_HEIGHT_M,
      height: STOREY_HEIGHT_M,
      floorNo,
      associatedViewId: `view:plan:${floorNo}`,
    })),
    grids: [],
    types: {},
    elements: [
      wall({ id: "w1", floorNo: 1, start: [0, 0], end: [6, 0] }),
      wall({ id: "w2", floorNo: 2, start: [0, 0], end: [6, 0] }),
      wall({ id: "e1", floorNo: 1, start: [0, 4], end: [6, 4], exterior: true }),
    ],
    documents: [],
    visibility: {},
  };
}

const wallIdsOn = (view: NonNullable<ReturnType<typeof planInteriorView>>, floorNo: number) =>
  (view.model.wallsByFloor[floorNo] ?? []).map((w) => w.elementId);

/* ------------------------------------------------------------------ */
/* Gate                                                                */
/* ------------------------------------------------------------------ */

describe("planInteriorView — gating", () => {
  it("draws nothing when there is no snapshot", () => {
    expect(planInteriorView(null)).toBeNull();
    expect(planInteriorView(undefined, { enabled: true })).toBeNull();
  });

  it("draws nothing when the layer is switched off", () => {
    expect(planInteriorView(fixture(), { enabled: false })).toBeNull();
  });

  it("treats an omitted `enabled` as on — the caller owns its own default", () => {
    expect(planInteriorView(fixture())).not.toBeNull();
  });

  it("omits envelope walls unless includeExterior is asked for", () => {
    const snapshot = fixture();

    const interiorOnly = planInteriorView(snapshot, { enabled: true })!;
    expect(wallIdsOn(interiorOnly, 1)).toEqual(["w1"]);

    const withExterior = planInteriorView(snapshot, {
      enabled: true,
      includeExterior: true,
    })!;
    expect(wallIdsOn(withExterior, 1).sort()).toEqual(["e1", "w1"]);
  });
});

/* ------------------------------------------------------------------ */
/* Storey filter                                                       */
/* ------------------------------------------------------------------ */

describe("selectInteriorFloors", () => {
  const model = interiorModelFor(fixture());

  it("null means no restriction, not 'nothing'", () => {
    expect(selectInteriorFloors(model, null)).toEqual([1, 2]);
    expect(selectInteriorFloors(model, undefined)).toEqual([1, 2]);
  });

  it("an empty list means nothing", () => {
    expect(selectInteriorFloors(model, [])).toEqual([]);
  });

  it("keeps the model's ascending order whatever order the filter arrives in", () => {
    expect(selectInteriorFloors(model, [2, 1])).toEqual([1, 2]);
  });

  it("drops storeys the model does not have rather than drawing them empty", () => {
    expect(selectInteriorFloors(model, [2, 7])).toEqual([2]);
  });
});

describe("planInteriorView — storey filter", () => {
  it("restricts the drawn storeys without changing the model", () => {
    const snapshot = fixture();
    const all = planInteriorView(snapshot, { enabled: true })!;
    const isolated = planInteriorView(snapshot, { enabled: true, floors: [2] })!;

    expect(all.floors).toEqual([1, 2]);
    expect(isolated.floors).toEqual([2]);
    // Isolation is a VIEW decision: the same solved model backs both.
    expect(isolated.model).toBe(all.model);
    expect(wallIdsOn(isolated, 2)).toEqual(["w2"]);
  });
});

/* ------------------------------------------------------------------ */
/* Rebuild guard                                                       */
/* ------------------------------------------------------------------ */

describe("interiorModelFor — snapshot-identity rebuild guard", () => {
  it("returns the SAME model for the same snapshot and options", () => {
    const snapshot = fixture();
    expect(interiorModelFor(snapshot)).toBe(interiorModelFor(snapshot));
    // The mount keys its InstancedMesh rebuild on this identity, so a
    // re-render that changed nothing must not walk the elements again.
    expect(planInteriorView(snapshot, { enabled: true })!.model).toBe(
      planInteriorView(snapshot, { enabled: true, floors: [1] })!.model,
    );
  });

  it("keeps the two option variants apart", () => {
    const snapshot = fixture();
    expect(interiorOptionsKey({})).not.toBe(interiorOptionsKey({ includeExterior: true }));
    expect(interiorModelFor(snapshot, { includeExterior: true })).not.toBe(
      interiorModelFor(snapshot),
    );
  });

  it("rebuilds when the snapshot is replaced — identity IS the version", () => {
    // bim-model-store never mutates a snapshot in place; every command puts a
    // new object in the store, and that is what must invalidate the meshes.
    const before = fixture();
    const after = { ...before, elements: [...before.elements] };
    expect(interiorModelFor(after)).not.toBe(interiorModelFor(before));
    // Same building, so the two builds still agree on what they drew.
    expect(interiorModelFor(after).stats.wallCount).toBe(
      interiorModelFor(before).stats.wallCount,
    );
  });
});
