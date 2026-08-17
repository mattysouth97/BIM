import { describe, expect, it } from "vitest";

import { generateMassing, polygonArea, polygonBounds } from "../generate/massing";
import { generateGrid, generateStructure } from "../generate/structure";
import type { GeneratedLevel, Rect } from "../generate/types";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { seedFromPrompt } from "../rng";
import type { BuildingSpec } from "../spec/building-spec";

const provider = new HeuristicReasoningProvider();

async function specFor(prompt: string): Promise<BuildingSpec> {
  const { data } = await provider.generateBuilding({
    prompt,
    seed: seedFromPrompt(prompt),
  });
  return data;
}

/**
 * Levels + plate rect built locally from the massing, so this suite tests the
 * structure module rather than whatever the levels pass currently produces.
 */
function contextFor(spec: BuildingSpec): { levels: GeneratedLevel[]; plate: Rect } {
  const massing = generateMassing(spec);
  const bounds = polygonBounds(massing.primary);
  const plate: Rect = {
    minX: bounds.minX,
    minZ: bounds.minZ,
    maxX: bounds.maxX,
    maxZ: bounds.maxZ,
  };

  let elevationM = 0;
  const levels = massing.plates
    .slice()
    .sort((a, b) => a.floorNo - b.floorNo)
    .map((plateForLevel) => {
      const levelSpec =
        spec.levels.find((l) => l.floorNo === plateForLevel.floorNo) ?? spec.levels[0];
      const heightM = levelSpec.floorToFloorMm / 1000;
      const level: GeneratedLevel = {
        floorNo: plateForLevel.floorNo,
        name: levelSpec.name,
        elevationM,
        heightM,
        usage: levelSpec.usage,
        polygon: plateForLevel.polygon,
        plateAreaSqm: plateForLevel.areaSqm,
      };
      elevationM += heightM;
      return level;
    });

  return { levels, plate };
}

async function frameFor(prompt: string) {
  const spec = await specFor(prompt);
  const { levels, plate } = contextFor(spec);
  const grids = generateGrid({ spec, plate });
  const frame = generateStructure({ spec, levels, grids, plate });
  return { spec, levels, plate, grids, ...frame };
}

const RECTANGULAR = "Create a five-story office building.";

describe("generateGrid", () => {
  it("spaces gridlines at exactly the spec bay size", async () => {
    const spec = await specFor(RECTANGULAR);
    const { plate } = contextFor(spec);
    const grids = generateGrid({ spec, plate });

    const xOffsets = grids.filter((g) => g.axis === "x").map((g) => g.offset);
    const zOffsets = grids.filter((g) => g.axis === "z").map((g) => g.offset);
    expect(xOffsets.length).toBeGreaterThan(1);
    expect(zOffsets.length).toBeGreaterThan(1);

    const gridXM = spec.structure.gridXMm.value / 1000;
    const gridZM = spec.structure.gridZMm.value / 1000;
    for (let i = 1; i < xOffsets.length; i += 1) {
      expect(xOffsets[i] - xOffsets[i - 1]).toBeCloseTo(gridXM, 9);
    }
    for (let i = 1; i < zOffsets.length; i += 1) {
      expect(zOffsets[i] - zOffsets[i - 1]).toBeCloseTo(gridZM, 9);
    }
  });

  it("centres the bays on the plate and keeps every line on it", async () => {
    const spec = await specFor(RECTANGULAR);
    const { plate } = contextFor(spec);
    const grids = generateGrid({ spec, plate });

    const xOffsets = grids.filter((g) => g.axis === "x").map((g) => g.offset);
    const zOffsets = grids.filter((g) => g.axis === "z").map((g) => g.offset);

    const plateCentreX = (plate.minX + plate.maxX) / 2;
    const plateCentreZ = (plate.minZ + plate.maxZ) / 2;
    expect((xOffsets[0] + xOffsets[xOffsets.length - 1]) / 2).toBeCloseTo(plateCentreX, 9);
    expect((zOffsets[0] + zOffsets[zOffsets.length - 1]) / 2).toBeCloseTo(plateCentreZ, 9);

    for (const offset of xOffsets) {
      expect(offset).toBeGreaterThanOrEqual(plate.minX - 1e-6);
      expect(offset).toBeLessThanOrEqual(plate.maxX + 1e-6);
    }
    for (const offset of zOffsets) {
      expect(offset).toBeGreaterThanOrEqual(plate.minZ - 1e-6);
      expect(offset).toBeLessThanOrEqual(plate.maxZ + 1e-6);
    }
  });

  it("labels X lines with letters, Z lines with numbers, and ids by axis index", async () => {
    const spec = await specFor(RECTANGULAR);
    const { plate } = contextFor(spec);
    const grids = generateGrid({ spec, plate });

    const xLines = grids.filter((g) => g.axis === "x");
    const zLines = grids.filter((g) => g.axis === "z");

    expect(xLines.map((g) => g.name).slice(0, 3)).toEqual(["A", "B", "C"]);
    expect(zLines.map((g) => g.name).slice(0, 3)).toEqual(["1", "2", "3"]);
    expect(xLines[0].id).toBe("grid:x:0");
    expect(zLines[0].id).toBe("grid:z:0");
    expect(new Set(grids.map((g) => g.id)).size).toBe(grids.length);
  });
});

describe("generateStructure — columns", () => {
  it("places one column per grid intersection per level", async () => {
    const { levels, grids, columns } = await frameFor(RECTANGULAR);
    const xCount = grids.filter((g) => g.axis === "x").length;
    const zCount = grids.filter((g) => g.axis === "z").length;

    expect(columns).toHaveLength(levels.length * xCount * zCount);
    expect(new Set(columns.map((c) => c.id)).size).toBe(columns.length);

    for (const level of levels) {
      const perLevel = columns.filter((c) => c.floorNo === level.floorNo);
      expect(perLevel).toHaveLength(xCount * zCount);
    }
  });

  it("lands every column exactly on a grid intersection with a matching gridRef", async () => {
    const { grids, columns } = await frameFor(RECTANGULAR);
    const xLines = grids.filter((g) => g.axis === "x");
    const zLines = grids.filter((g) => g.axis === "z");
    const xByOffset = new Map(xLines.map((g) => [g.offset, g.name]));
    const zByOffset = new Map(zLines.map((g) => [g.offset, g.name]));

    for (const column of columns) {
      expect(xByOffset.has(column.x)).toBe(true);
      expect(zByOffset.has(column.z)).toBe(true);
      expect(column.gridRef).toBe(`${xByOffset.get(column.x)}-${zByOffset.get(column.z)}`);
      expect(column.id).toBe(`COL-L${column.floorNo}-${column.gridRef}`);
    }
  });

  it("sizes columns from the spec section", async () => {
    const { spec, columns } = await frameFor(RECTANGULAR);
    for (const column of columns) {
      expect(column.sizeM).toBeCloseTo(spec.structure.columnMm.value / 1000, 9);
    }
  });

  it("never puts a column outside the plate", async () => {
    for (const prompt of [
      RECTANGULAR,
      "An L-shaped five storey office building.",
      "A U-shaped five storey office building.",
      "A ten storey stepped office building.",
      "A five story office building arranged around a central courtyard.",
    ]) {
      const { plate, columns } = await frameFor(prompt);
      expect(columns.length).toBeGreaterThan(0);
      for (const column of columns) {
        expect(column.x).toBeGreaterThanOrEqual(plate.minX - 1e-6);
        expect(column.x).toBeLessThanOrEqual(plate.maxX + 1e-6);
        expect(column.z).toBeGreaterThanOrEqual(plate.minZ - 1e-6);
        expect(column.z).toBeLessThanOrEqual(plate.maxZ + 1e-6);
      }
    }
  });

  it("drops the columns an L-shape's removed quadrant would strand", async () => {
    const { grids, levels, columns } = await frameFor(
      "An L-shaped five storey office building.",
    );
    const full =
      grids.filter((g) => g.axis === "x").length *
      grids.filter((g) => g.axis === "z").length *
      levels.length;
    expect(columns.length).toBeLessThan(full);
  });

  it("leaves a courtyard void free of columns", async () => {
    const { spec, columns } = await frameFor(
      "A five story office building arranged around a central courtyard.",
    );
    const massing = generateMassing(spec);
    const hole = massing.primary[1];
    expect(hole).toBeDefined();

    const holeBounds = polygonBounds([hole]);
    for (const column of columns) {
      const insideVoid =
        column.x > holeBounds.minX + 1e-6 &&
        column.x < holeBounds.maxX - 1e-6 &&
        column.z > holeBounds.minZ + 1e-6 &&
        column.z < holeBounds.maxZ - 1e-6;
      expect(insideVoid).toBe(false);
    }
  });

  it("keeps the upper levels of a stepped tower on a smaller frame", async () => {
    const { levels, columns } = await frameFor("A ten storey stepped office building.");
    const ground = levels.reduce((a, b) => (b.floorNo < a.floorNo ? b : a));
    const top = levels.reduce((a, b) => (b.floorNo > a.floorNo ? b : a));

    const groundColumns = columns.filter((c) => c.floorNo === ground.floorNo).length;
    const topColumns = columns.filter((c) => c.floorNo === top.floorNo).length;
    expect(topColumns).toBeLessThan(groundColumns);
    expect(topColumns).toBeGreaterThan(0);
  });
});

describe("generateStructure — beams", () => {
  it("produces the full lattice of spans for a rectangular plate", async () => {
    const { levels, grids, beams } = await frameFor(RECTANGULAR);
    const m = grids.filter((g) => g.axis === "x").length;
    const n = grids.filter((g) => g.axis === "z").length;

    // (m-1)·n spans along X plus m·(n-1) spans along Z, once per level.
    const perLevel = (m - 1) * n + m * (n - 1);
    expect(beams).toHaveLength(levels.length * perLevel);
    expect(new Set(beams.map((b) => b.id)).size).toBe(beams.length);
  });

  it("spans between two real columns on the same level, one bay long", async () => {
    for (const prompt of [
      RECTANGULAR,
      "An L-shaped five storey office building.",
      "A five story office building arranged around a central courtyard.",
    ]) {
      const { spec, columns, beams } = await frameFor(prompt);
      expect(beams.length).toBeGreaterThan(0);
      const columnKeys = new Set(
        columns.map((c) => `${c.floorNo}|${c.x.toFixed(6)}|${c.z.toFixed(6)}`),
      );
      const gridXM = spec.structure.gridXMm.value / 1000;
      const gridZM = spec.structure.gridZMm.value / 1000;

      for (const beam of beams) {
        const [x1, z1] = beam.start;
        const [x2, z2] = beam.end;
        expect(columnKeys.has(`${beam.floorNo}|${x1.toFixed(6)}|${z1.toFixed(6)}`)).toBe(true);
        expect(columnKeys.has(`${beam.floorNo}|${x2.toFixed(6)}|${z2.toFixed(6)}`)).toBe(true);

        const alongX = Math.abs(z1 - z2) < 1e-9;
        const alongZ = Math.abs(x1 - x2) < 1e-9;
        expect(alongX || alongZ).toBe(true);
        expect(alongX ? Math.abs(x2 - x1) : Math.abs(z2 - z1)).toBeCloseTo(
          alongX ? gridXM : gridZM,
          6,
        );
      }
    }
  });

  it("takes its depth from the spec and its width from half that, snapped to 50 mm", async () => {
    const { spec, beams } = await frameFor(RECTANGULAR);
    const depthM = spec.structure.beamDepthMm.value / 1000;
    const expectedWidthM = Math.round(depthM / 2 / 0.05) * 0.05;

    expect(beams.length).toBeGreaterThan(0);
    for (const beam of beams) {
      expect(beam.depthM).toBeCloseTo(depthM, 9);
      expect(beam.widthM).toBeCloseTo(expectedWidthM, 9);
      // Snapped, not merely halved.
      expect(Math.abs(beam.widthM / 0.05 - Math.round(beam.widthM / 0.05))).toBeLessThan(1e-6);
    }
  });
});

describe("generateStructure — slabs", () => {
  it("gives every level exactly one slab", async () => {
    for (const prompt of [RECTANGULAR, "A ten storey stepped office building."]) {
      const { levels, slabs } = await frameFor(prompt);
      expect(slabs).toHaveLength(levels.length);
      expect(new Set(slabs.map((s) => s.floorNo)).size).toBe(levels.length);
      for (const level of levels) {
        const forLevel = slabs.filter((s) => s.floorNo === level.floorNo);
        expect(forLevel).toHaveLength(1);
        expect(forLevel[0].id).toBe(`SLAB-L${level.floorNo}`);
        expect(forLevel[0].polygon).toEqual(level.polygon);
        expect(forLevel[0].areaSqm).toBeCloseTo(polygonArea(level.polygon), 6);
      }
    }
  });

  it("takes its thickness from the spec", async () => {
    const { spec, slabs } = await frameFor(RECTANGULAR);
    for (const slab of slabs) {
      expect(slab.thicknessM).toBeCloseTo(spec.structure.slabThicknessMm.value / 1000, 9);
    }
  });

  it("subtracts a courtyard void from the slab area", async () => {
    const { plate, slabs } = await frameFor(
      "A five story office building arranged around a central courtyard.",
    );
    const solid = (plate.maxX - plate.minX) * (plate.maxZ - plate.minZ);
    for (const slab of slabs) {
      expect(slab.areaSqm).toBeGreaterThan(0);
      expect(slab.areaSqm).toBeLessThan(solid);
    }
  });
});

describe("generateStructure — determinism", () => {
  it("returns identical geometry for the same spec", async () => {
    const a = await frameFor(RECTANGULAR);
    const b = await frameFor(RECTANGULAR);

    expect(JSON.stringify(a.grids)).toBe(JSON.stringify(b.grids));
    expect(JSON.stringify(a.columns)).toBe(JSON.stringify(b.columns));
    expect(JSON.stringify(a.beams)).toBe(JSON.stringify(b.beams));
    expect(JSON.stringify(a.slabs)).toBe(JSON.stringify(b.slabs));
  });

  it("is a pure function of its inputs — repeated calls do not drift", async () => {
    const spec = await specFor("A 7 storey office building with an 8.4 m structural grid.");
    const { levels, plate } = contextFor(spec);
    const grids = generateGrid({ spec, plate });

    const first = generateStructure({ spec, levels, grids, plate });
    const second = generateStructure({ spec, levels, grids, plate });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
