import { describe, expect, it } from "vitest";
import { DEMO_BUILDING_PK } from "@/lib/constants";
import { buildInteriorModel } from "@/lib/interior/build";
import { demoTitle } from "../demo-building";
import {
  DEMO_BASEMENT_HEIGHT_MM,
  DEMO_PLATE_DEPTH_MM,
  DEMO_PLATE_WIDTH_MM,
  DEMO_STOREY_HEIGHT_MM,
  buildDemoOfficeSpec,
  getDemoBimSnapshot,
  getDemoRecipe,
} from "../demo-design";

describe("demo office design", () => {
  it("matches the ledger plate, storeys and height", () => {
    const spec = buildDemoOfficeSpec();
    expect(spec.project.name).toBe(demoTitle.bldNm);
    expect(spec.massing.widthMm.value).toBe(DEMO_PLATE_WIDTH_MM);
    expect(spec.massing.depthMm.value).toBe(DEMO_PLATE_DEPTH_MM);
    expect(spec.levels.map((l) => l.floorNo)).toEqual([
      -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    const above = spec.levels.filter((l) => l.floorNo > 0);
    const below = spec.levels.filter((l) => l.floorNo < 0);
    expect(above.every((l) => l.floorToFloorMm === DEMO_STOREY_HEIGHT_MM)).toBe(true);
    expect(below.every((l) => l.floorToFloorMm === DEMO_BASEMENT_HEIGHT_MM)).toBe(true);
    const heightM =
      above.reduce((sum, l) => sum + l.floorToFloorMm, 0) / 1000;
    expect(heightM).toBeCloseTo(demoTitle.heit, 5);
  });

  it("builds a populated BIM graph under the demo pk", () => {
    const snapshot = getDemoBimSnapshot();
    expect(snapshot.buildingPk).toBe(DEMO_BUILDING_PK);
    const categories = new Set(snapshot.elements.map((el) => el.category));
    for (const required of ["Walls", "Floors", "Ceilings", "Roofs", "Rooms", "Windows", "Stairs"]) {
      expect(categories, `missing ${required}`).toContain(required);
    }
    const rooms = snapshot.elements.filter((el) => el.category === "Rooms");
    expect(rooms.length).toBeGreaterThan(20);
    const types = rooms.map((el) => String(el.instanceParameters.spaceType ?? ""));
    expect(types).toEqual(expect.arrayContaining(["office-open", "meeting", "lobby"]));
    expect(rooms.some((el) => el.levelId === "level:3")).toBe(true);
  });

  it("solves an interior the twin can draw", () => {
    const interior = buildInteriorModel(getDemoBimSnapshot());
    expect(interior.stats.wallCount).toBeGreaterThan(20);
    expect(interior.floors).toEqual(expect.arrayContaining([1, 3, 10]));
    expect(interior.wallsByFloor[3]?.length).toBeGreaterThan(4);
  });

  it("mounts the 외피 (walls, floors, ceilings, roof) on the schematic plate", () => {
    const recipe = getDemoRecipe();
    const snapshot = getDemoBimSnapshot();
    const interior = buildInteriorModel(snapshot, { includeExterior: true });

    expect(recipe.footprintWidth).toBeCloseTo(DEMO_PLATE_WIDTH_MM / 1000, 5);
    expect(recipe.footprintDepth).toBeCloseTo(DEMO_PLATE_DEPTH_MM / 1000, 5);
    const ring = recipe.footprintPolygon?.[0] ?? [];
    expect(ring.length).toBeGreaterThanOrEqual(4);

    const halfW = DEMO_PLATE_WIDTH_MM / 2000;
    const halfD = DEMO_PLATE_DEPTH_MM / 2000;
    const xs = ring.map((p) => p[0]);
    const zs = ring.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(-halfW, 5);
    expect(Math.max(...xs)).toBeCloseTo(halfW, 5);
    expect(Math.min(...zs)).toBeCloseTo(-halfD, 5);
    expect(Math.max(...zs)).toBeCloseTo(halfD, 5);

    const plates = Object.values(interior.platesByFloor).flat();
    expect(plates.some((p) => p.role === "floor")).toBe(true);
    expect(plates.some((p) => p.role === "ceiling")).toBe(true);
    expect(plates.some((p) => p.role === "roof")).toBe(true);

    const typical = plates.filter((p) => p.floorNo === 3);
    expect(typical.map((p) => p.role).sort()).toEqual(["ceiling", "floor"]);
    for (const plate of typical) {
      const outline = plate.polygon[0] ?? [];
      const px = outline.map((p) => p[0]);
      const pz = outline.map((p) => p[1]);
      expect(Math.min(...px)).toBeCloseTo(-halfW, 3);
      expect(Math.max(...px)).toBeCloseTo(halfW, 3);
      expect(Math.min(...pz)).toBeCloseTo(-halfD, 3);
      expect(Math.max(...pz)).toBeCloseTo(halfD, 3);
    }

    const walls = interior.wallsByFloor[3] ?? [];
    const exterior = walls.filter((w) => w.isExterior);
    expect(exterior.length).toBeGreaterThanOrEqual(4);
    for (const wall of exterior) {
      expect(Math.abs(wall.position[0])).toBeLessThanOrEqual(halfW + 0.2);
      expect(Math.abs(wall.position[2])).toBeLessThanOrEqual(halfD + 0.2);
    }

    const roof = plates.find((p) => p.role === "roof");
    expect(roof?.y).toBeCloseTo(recipe.totalHeight, 3);
  });
});
