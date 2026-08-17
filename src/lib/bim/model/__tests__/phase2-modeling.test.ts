import { describe, expect, it } from "vitest";
import { getRecipe } from "@/lib/procedural/recipe";
import { deriveTwinElements } from "../../derive/twin-elements";
import { familySemantics, ifcClassForType } from "../../family-semantics";
import {
  createWall,
  headingYFromAxis,
  hostOnNearestWall,
  hydrateBimModel,
  quantifyModel,
  snapPoint,
  validateModel,
  wallAxis,
} from "..";

function model() {
  const recipe = {
    ...getRecipe("21", "2010-2019", "14000"),
    footprintWidth: 20,
    footprintDepth: 12,
    floors: [{ floorNo: 1, label: "1F", type: "above" as const, y: 0, height: 4, isGroundFloor: true }],
    totalHeight: 4,
    wallThickness: 0.2,
    era: "2010-2019" as const,
    strctCd: "21",
    mainPurpsCd: "14000",
    siteWidth: 30,
    siteDepth: 20,
    buildingName: "Test",
    address: "Seoul",
  };
  return hydrateBimModel({
    buildingPk: "pk",
    recipe,
    derived: deriveTwinElements({ recipe }),
  });
}

describe("generated quantities", () => {
  it("gives windows and doors a unit area so the schedule is not 0 m²", () => {
    const snapshot = model();
    const windows = snapshot.elements.filter((el) => el.kind === "window");
    const doors = snapshot.elements.filter((el) => el.kind === "door");
    expect(windows.length).toBeGreaterThan(0);
    expect(doors.length).toBeGreaterThan(0);
    expect(windows.every((el) => Number(el.instanceParameters.areaM2) > 0)).toBe(true);
    expect(doors.every((el) => Number(el.instanceParameters.areaM2) > 0)).toBe(true);
    const qty = quantifyModel(snapshot);
    const windowRow = qty.find((r) => r.category === "Windows");
    expect(windowRow?.areaM2).toBeGreaterThan(0);
  });
});

describe("geometry + snap", () => {
  it("aligns wall +X with the drawn axis", () => {
    const axis = wallAxis({ x: 0, z: 0 }, { x: 4, z: 0 });
    expect(axis.length).toBe(4);
    expect(headingYFromAxis({ x: 0, z: 0 }, { x: 4, z: 0 })).toBeCloseTo(0);
  });

  it("snaps to a 1 m grid", () => {
    const hit = snapPoint({ x: 2.4, z: -0.9 }, { spacing: 1, maxDistance: 0.6 });
    expect(hit.kind).toBe("grid");
    expect(hit.point).toEqual({ x: 2, z: -1 });
  });
});

describe("Figma family semantics", () => {
  it("maps the 102-family catalog to IFC and EMS connectors", () => {
    expect(ifcClassForType("wall-basic-generic-200")).toBe("IfcWall");
    expect(ifcClassForType("door-single-flush-910")).toBe("IfcDoor");
    expect(ifcClassForType("energy-smart-meter")).toBe("IfcFlowMeter");
    expect(ifcClassForType("bems-temp-sensor")).toBe("IfcSensor");
    expect(familySemantics("wall-exterior-brick-on-cmu")?.layers?.length).toBeGreaterThan(1);
    expect(familySemantics("energy-smart-meter")?.emsCapable).toBe(true);
    expect(familySemantics("energy-smart-meter")?.connectors.some((c) => c.system === "metering")).toBe(true);
  });
});

describe("sketch wall + hosted door", () => {
  it("creates a linear wall and hosts a door on it", () => {
    const base = model();
    const wall = createWall({
      model: base,
      typeId: "wall-basic-generic-200",
      buildingPk: "pk",
      levelId: "level:1",
      start: { x: -4, z: 3 },
      end: { x: 4, z: 3 },
      heightM: 4,
    });
    const authoredWall = wall.model.elements.find((e) => e.origin === "authored" && e.kind === "wall");
    expect(authoredWall?.instanceParameters.lengthM).toBe(8);
    expect(authoredWall?.ifcClass).toBe("IfcWall");

    const hosted = hostOnNearestWall({
      model: wall.model,
      typeId: "door-single-flush-910",
      buildingPk: "pk",
      levelId: "level:1",
      point: { x: 0, z: 3.1 },
      y: 0,
    });
    const door = hosted.model.elements.find((e) => e.origin === "authored" && e.kind === "door");
    expect(door?.hostId).toBe(authoredWall?.id);
    expect(validateModel(hosted.model).some((i) => i.code === "UNHOSTED_OPENING")).toBe(false);
    expect(quantifyModel(hosted.model).some((r) => r.category === "Doors" && r.count >= 1)).toBe(true);
  });

  it("hosts a rebuilt LOD3 window on the sill, not the floor", () => {
    const base = model();
    const wall = createWall({
      model: base,
      typeId: "wall-basic-generic-200",
      buildingPk: "pk",
      levelId: "level:1",
      start: { x: -4, z: 0 },
      end: { x: 4, z: 0 },
      heightM: 4,
    });
    const hosted = hostOnNearestWall({
      model: wall.model,
      typeId: "window-double-hung-900x1500",
      buildingPk: "pk",
      levelId: "level:1",
      point: { x: 0, z: 0.1 },
      y: 0,
    });
    const win = hosted.model.elements.find((e) => e.origin === "authored" && e.kind === "window");
    expect(win?.hostId).toBeTruthy();
    expect(win?.placement.y).toBeCloseTo(0.9, 5);
  });
});
