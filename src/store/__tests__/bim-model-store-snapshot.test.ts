// src/store/__tests__/bim-model-store-snapshot.test.ts
//
// Authoring over a GENERATED design. The engine's snapshot is richer than
// anything `hydrateBimModel` can re-derive (columns, stairs, cores, provenance,
// locks), so the store has to ingest it whole — and then overlay the authored
// work exactly as the recipe path does, or a generated building would be a
// second-class citizen in the same workspace.

import { beforeEach, describe, expect, it } from "vitest";
import {
  GENERATED_FLOOR_TYPE,
  GENERATED_WALL_TYPE,
  type BimElement,
  type BimModelSnapshot,
} from "@/lib/bim/model";
import { useBimModelStore } from "../bim-model-store";

const GEN_PK = "GEN-0042";

function generatedElement(overrides: Partial<BimElement> = {}): BimElement {
  return {
    id: "W-1-N",
    origin: "generated",
    kind: "wall",
    category: "Walls",
    family: "Basic Wall",
    typeId: GENERATED_WALL_TYPE,
    buildingPk: GEN_PK,
    levelId: "level:1",
    hostId: null,
    mark: "W-1-N",
    instanceParameters: { lengthM: 20, thicknessMm: 300 },
    placement: { x: 0, y: 0, z: -6, rotationY: 0 },
    phaseCreated: "new",
    visible: true,
    system: "envelope",
    locked: true,
    dependsOn: ["level:1"],
    generationSource: { type: "GENERATED", generationId: GEN_PK, version: 1 },
    ...overrides,
  };
}

function authoredElement(overrides: Partial<BimElement> = {}): BimElement {
  return {
    id: "authored-door-1",
    origin: "authored",
    kind: "door",
    category: "Doors",
    family: "Single-Flush",
    typeId: "door-single-flush-910",
    buildingPk: GEN_PK,
    levelId: "level:2",
    hostId: null,
    mark: "D-1",
    instanceParameters: { baseOffsetMm: 150, sillHeightMm: 0 },
    placement: { x: 1, y: 0, z: 2, rotationY: 0 },
    phaseCreated: "new",
    visible: true,
    ...overrides,
  };
}

function designSnapshot(): BimModelSnapshot {
  return {
    buildingPk: GEN_PK,
    levels: [
      {
        id: "level:1",
        name: "1F",
        elevation: 0,
        height: 4,
        floorNo: 1,
        associatedViewId: "view:plan:1",
      },
      {
        id: "level:2",
        name: "2F",
        elevation: 4,
        height: 3.6,
        floorNo: 2,
        associatedViewId: "view:plan:2",
      },
    ],
    grids: [{ id: "grid:x:0", name: "A", axis: "x", offset: -10 }],
    types: {
      [GENERATED_WALL_TYPE]: {
        id: GENERATED_WALL_TYPE,
        category: "Walls",
        categoryKo: "벽",
        family: "Basic Wall",
        familyKo: "기본 벽",
        typeName: "Exterior 300mm",
        typeNameKo: "외부 300mm",
        parameters: { thicknessMm: 300, structural: true },
        ifcClass: "IfcWall",
      },
      [GENERATED_FLOOR_TYPE]: {
        id: GENERATED_FLOOR_TYPE,
        category: "Floors",
        categoryKo: "바닥",
        family: "Floor",
        familyKo: "바닥",
        typeName: "Slab 200mm",
        typeNameKo: "슬래브 200mm",
        parameters: { thicknessMm: 200 },
        ifcClass: "IfcSlab",
      },
      "generated-stair": {
        id: "generated-stair",
        category: "Stairs",
        categoryKo: "계단",
        family: "Stair",
        familyKo: "계단",
        typeName: "Generated",
        typeNameKo: "생성",
        parameters: {},
        ifcClass: "IfcStair",
      },
    },
    elements: [
      generatedElement(),
      generatedElement({
        id: "CORE-stair-L1",
        kind: "stair",
        category: "Stairs",
        family: "stair",
        typeId: "generated-stair",
        system: "core",
        locked: false,
        mark: "CORE-stair-L1",
      }),
    ],
    documents: [],
    visibility: {},
  };
}

function resetStore() {
  useBimModelStore.setState({
    byBuilding: {},
    snapshot: null,
    log: { past: [], future: [] },
    selectedElementId: null,
    activeLevelId: null,
    editingTypeId: null,
  });
}

describe("hydrateFromSnapshot", () => {
  beforeEach(resetStore);

  it("takes the generated half of the design verbatim", () => {
    useBimModelStore.getState().hydrateFromSnapshot({
      buildingPk: GEN_PK,
      snapshot: designSnapshot(),
    });
    const model = useBimModelStore.getState().snapshot!;

    expect(model.buildingPk).toBe(GEN_PK);
    expect(model.levels).toHaveLength(2);
    expect(model.grids).toEqual([{ id: "grid:x:0", name: "A", axis: "x", offset: -10 }]);

    const wall = model.elements.find((el) => el.id === "W-1-N")!;
    expect(wall).toEqual(generatedElement());
    expect(wall.generationSource).toEqual({
      type: "GENERATED",
      generationId: GEN_PK,
      version: 1,
    });
    expect(wall.locked).toBe(true);
    expect(wall.system).toBe("envelope");

    // A stair is a semantic object the recipe path cannot produce at all.
    expect(model.elements.some((el) => el.kind === "stair")).toBe(true);
    expect(useBimModelStore.getState().activeLevelId).toBe("level:1");
  });

  it("keeps the design's types and adds the authoring catalogue", () => {
    useBimModelStore.getState().hydrateFromSnapshot({
      buildingPk: GEN_PK,
      snapshot: designSnapshot(),
    });
    const types = useBimModelStore.getState().snapshot!.types;

    expect(types[GENERATED_WALL_TYPE].typeName).toBe("Exterior 300mm");
    expect(types["generated-stair"]).toBeTruthy();
    // Placing a family over a generated design must find its type, exactly as
    // it does over a ledger twin.
    expect(types["door-single-flush-910"]).toBeTruthy();
  });

  it("overlays persisted authored elements and rebases them onto their level", () => {
    useBimModelStore.setState({
      byBuilding: { [GEN_PK]: { authored: [authoredElement()], typeOverrides: {} } },
    });
    useBimModelStore.getState().hydrateFromSnapshot({
      buildingPk: GEN_PK,
      snapshot: designSnapshot(),
    });
    const model = useBimModelStore.getState().snapshot!;

    const door = model.elements.find((el) => el.id === "authored-door-1")!;
    expect(door.origin).toBe("authored");
    // level:2 elevation 4 m + 150 mm base offset.
    expect(door.placement.y).toBeCloseTo(4.15, 6);
    // The generated half is untouched by the overlay.
    expect(model.elements.filter((el) => el.origin === "generated")).toHaveLength(2);
  });

  it("applies persisted type overrides on top of the design's types", () => {
    useBimModelStore.setState({
      byBuilding: {
        [GEN_PK]: {
          authored: [],
          typeOverrides: {
            [GENERATED_WALL_TYPE]: {
              typeName: "Exterior 400mm",
              parameters: { thicknessMm: 400 },
            },
          },
        },
      },
    });
    useBimModelStore.getState().hydrateFromSnapshot({
      buildingPk: GEN_PK,
      snapshot: designSnapshot(),
    });
    const type = useBimModelStore.getState().snapshot!.types[GENERATED_WALL_TYPE];

    expect(type.typeName).toBe("Exterior 400mm");
    expect(type.parameters.thicknessMm).toBe(400);
    // Unpatched parameters survive the merge.
    expect(type.parameters.structural).toBe(true);
    expect(type.ifcClass).toBe("IfcWall");
  });

  it("does not leak another building's authored work", () => {
    useBimModelStore.setState({
      byBuilding: {
        [GEN_PK]: {
          authored: [
            authoredElement(),
            authoredElement({ id: "foreign-door", buildingPk: "11680-12345678" }),
          ],
          typeOverrides: {},
        },
      },
    });
    useBimModelStore.getState().hydrateFromSnapshot({
      buildingPk: GEN_PK,
      snapshot: designSnapshot(),
    });
    const ids = useBimModelStore.getState().snapshot!.elements.map((el) => el.id);

    expect(ids).toContain("authored-door-1");
    expect(ids).not.toContain("foreign-door");
  });

  it("prefers this browser's record when the design carries the same authored id", () => {
    const carried = authoredElement({ mark: "STALE" });
    const local = authoredElement({ mark: "CURRENT" });
    useBimModelStore.setState({
      byBuilding: { [GEN_PK]: { authored: [local], typeOverrides: {} } },
    });
    const snapshot = designSnapshot();
    snapshot.elements = [...snapshot.elements, carried];

    useBimModelStore.getState().hydrateFromSnapshot({ buildingPk: GEN_PK, snapshot });
    const doors = useBimModelStore
      .getState()
      .snapshot!.elements.filter((el) => el.id === "authored-door-1");

    expect(doors).toHaveLength(1);
    expect(doors[0].mark).toBe("CURRENT");
  });

  it("keeps in-session authored edits when the same design is re-ingested", () => {
    useBimModelStore.getState().hydrateFromSnapshot({
      buildingPk: GEN_PK,
      snapshot: designSnapshot(),
    });
    const placed = useBimModelStore.getState().applyPlace({
      typeId: "door-single-flush-910",
      buildingPk: GEN_PK,
      levelId: "level:1",
      hostId: "W-1-N",
      placement: { x: 0, y: 0, z: 1, rotationY: 0 },
    });
    expect(placed).toBeTruthy();

    useBimModelStore.getState().hydrateFromSnapshot({
      buildingPk: GEN_PK,
      snapshot: designSnapshot(),
    });
    const model = useBimModelStore.getState().snapshot!;

    expect(model.elements.some((el) => el.id === placed)).toBe(true);
    expect(useBimModelStore.getState().byBuilding[GEN_PK].authored).toHaveLength(1);
    // The generated design is still the base model underneath the edit.
    expect(model.elements.filter((el) => el.origin === "generated")).toHaveLength(2);
  });

  it("files the model under the pk it was hydrated for", () => {
    const snapshot = designSnapshot();
    snapshot.buildingPk = "generated";
    snapshot.elements = snapshot.elements.map((el) => ({ ...el, buildingPk: "generated" }));

    useBimModelStore.getState().hydrateFromSnapshot({ buildingPk: GEN_PK, snapshot });
    const model = useBimModelStore.getState().snapshot!;

    expect(model.buildingPk).toBe(GEN_PK);
    expect(model.elements.every((el) => el.buildingPk === GEN_PK)).toBe(true);
  });
});
