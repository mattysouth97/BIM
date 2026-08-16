import { describe, expect, it } from "vitest";
import { getRecipe } from "@/lib/procedural/recipe";
import type { BuildingRecipe } from "@/lib/procedural/types";
import { deriveTwinElements } from "../../derive/twin-elements";
import {
  beginCommit,
  changeElementType,
  hydrateBimModel,
  lastCommandName,
  moveLevelElevation,
  placeInstance,
  queryElements,
  redo,
  scheduleSourceForCategory,
  setInstanceParameter,
  setLevelElevation,
  setTypeParameter,
  undo,
  type BimModelSnapshot,
} from "..";

function recipe(): BuildingRecipe {
  const base = getRecipe("21", "2010-2019", "14000");
  return {
    ...base,
    footprintWidth: 20,
    footprintDepth: 12,
    floors: [
      { floorNo: 1, label: "1F", type: "above", y: 0, height: 4, isGroundFloor: true },
      { floorNo: 2, label: "2F", type: "above", y: 4, height: 3.5, isGroundFloor: false },
    ],
    totalHeight: 7.5,
    wallThickness: 0.2,
    era: "2010-2019",
    strctCd: "21",
    mainPurpsCd: "14000",
    siteWidth: 30,
    siteDepth: 20,
    buildingName: "Test",
    address: "Seoul",
  };
}

function model(): BimModelSnapshot {
  const r = recipe();
  return hydrateBimModel({
    buildingPk: "pk-1",
    recipe: r,
    derived: deriveTwinElements({ recipe: r }),
  });
}

describe("hydrateBimModel", () => {
  it("promotes recipe floors to first-class levels", () => {
    const m = model();
    expect(m.levels).toHaveLength(2);
    expect(m.levels[0]).toMatchObject({ id: "level:1", elevation: 0, height: 4 });
    expect(m.levels[1]).toMatchObject({ id: "level:2", elevation: 4, height: 3.5 });
  });

  it("creates generated walls/doors/rooms from the twin", () => {
    const m = model();
    expect(queryElements(m, { kind: "wall" }).length).toBeGreaterThan(0);
    expect(queryElements(m, { kind: "room" })).toHaveLength(2);
    expect(queryElements(m, { kind: "door" }).length).toBeGreaterThan(0);
  });

  it("overlays authored instances without dropping generated ones", () => {
    const base = model();
    const placed = placeInstance({
      model: base,
      typeId: "door-single-flush-910",
      buildingPk: "pk-1",
      levelId: "level:1",
      hostId: "W-1-S",
      placement: { x: 1, y: 0, z: 6, rotationY: 0 },
    });
    const walls = queryElements(base, { kind: "wall" }).length;
    expect(queryElements(placed.model, { kind: "door", origin: "authored" })).toHaveLength(1);
    expect(queryElements(placed.model, { kind: "wall" })).toHaveLength(walls);
  });
});

describe("type vs instance parameters", () => {
  it("type thickness change is visible to every instance of that type", () => {
    const m = model();
    const next = setTypeParameter(m, "generated-wall-exterior", "thicknessMm", 300);
    expect(next.model.types["generated-wall-exterior"].parameters.thicknessMm).toBe(300);
    const rows = scheduleSourceForCategory(next.model, "wall") as Array<{ thickness: number }>;
    expect(rows.every((r) => r.thickness === 0.3)).toBe(true);
  });

  it("instance mark change only touches that element", () => {
    const m = model();
    const first = queryElements(m, { kind: "wall" })[0];
    const next = setInstanceParameter(m, first.id, "mark", "WA-100");
    expect(next.model.elements.find((e) => e.id === first.id)?.mark).toBe("WA-100");
    const other = next.model.elements.find((e) => e.kind === "wall" && e.id !== first.id);
    expect(other?.mark).not.toBe("WA-100");
  });

  it("changeElementType retargets one instance", () => {
    const m = model();
    const door = queryElements(m, { kind: "door" })[0];
    const next = changeElementType(m, door.id, "door-single-flush-910");
    expect(next.model.elements.find((e) => e.id === door.id)?.typeId).toBe("door-single-flush-910");
  });
});

describe("levels + dependency graph", () => {
  it("moving level 2 grows the storey below and shifts authored hosts", () => {
    const base = model();
    const placed = placeInstance({
      model: base,
      typeId: "door-single-flush-910",
      buildingPk: "pk-1",
      levelId: "level:2",
      hostId: "W-2-S",
      placement: { x: 0, y: 4, z: 6, rotationY: 0 },
    });
    const moved = setLevelElevation(placed.model, "level:2", 5);
    const level2 = moved.model.levels.find((l) => l.id === "level:2");
    const level1 = moved.model.levels.find((l) => l.id === "level:1");
    expect(level2?.elevation).toBe(5);
    expect(level1?.height).toBe(5);
    expect(moved.recipeFloorEdits?.["1"]?.height).toBe(5);
    const door = queryElements(moved.model, { origin: "authored" })[0];
    expect(door.placement.y).toBe(5);
  });

  it("moveLevelElevation is a no-op for unknown ids", () => {
    const levels = model().levels;
    const next = moveLevelElevation(levels, "level:99", 10);
    expect(next.levels).toBe(levels);
  });
});

describe("transactions", () => {
  it("undo restores the previous snapshot", () => {
    const before = model();
    const after = setTypeParameter(before, "generated-wall-exterior", "thicknessMm", 250).model;
    let log = beginCommit({ past: [], future: [] }, "Edit Type", before, after);
    expect(lastCommandName(log)).toBe("Edit Type");
    const undone = undo(log);
    expect(undone.model?.types["generated-wall-exterior"].parameters.thicknessMm).toBe(200);
    const redone = redo(undone.log);
    expect(redone.model?.types["generated-wall-exterior"].parameters.thicknessMm).toBe(250);
  });
});

describe("query + schedules", () => {
  it("filters by level and origin", () => {
    const m = model();
    const l1 = queryElements(m, { levelId: "level:1", kind: "wall" });
    const l2 = queryElements(m, { levelId: "level:2", kind: "wall" });
    expect(l1.length).toBeGreaterThan(0);
    expect(l2.length).toBeGreaterThan(0);
    expect(l1.every((e) => e.levelId === "level:1")).toBe(true);
  });

  it("authored doors appear as extra opening schedule rows", () => {
    const base = model();
    const before = scheduleSourceForCategory(base, "opening").length;
    const placed = placeInstance({
      model: base,
      typeId: "door-single-flush-910",
      buildingPk: "pk-1",
      levelId: "level:1",
      hostId: "W-1-S",
      placement: { x: 0, y: 0, z: 6, rotationY: 0 },
    });
    expect(scheduleSourceForCategory(placed.model, "opening").length).toBe(before + 1);
  });
});
