// The plate-containment rules: SPACE_OUTSIDE_PLATE, COLUMN_OUTSIDE_PLATE and
// CORE_OUTSIDE_PLATE.
//
// All three used to be either missing or bounding-box tests, which made them
// silent on exactly the shape that needs them: a non-convex plate, where the
// bounding box covers ground the building does not.

import { describe, expect, it } from "vitest";

import { generateBuildingFromSpec } from "../generate/pipeline";
import type { GeneratedBuilding } from "../generate/types";
import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { seedFromPrompt } from "../rng";
import type { BuildingSpec } from "../spec/building-spec";
import { validateBuilding } from "../validate/rules";

const provider = new HeuristicReasoningProvider();

async function build(
  prompt: string,
  mutate: (spec: BuildingSpec) => BuildingSpec = (s) => s,
): Promise<{ spec: BuildingSpec; building: GeneratedBuilding }> {
  const { data } = await provider.generateBuilding({ prompt, seed: seedFromPrompt(prompt) });
  const spec = mutate(data);
  return { spec, building: generateBuildingFromSpec(spec) };
}

const asLShape = (spec: BuildingSpec): BuildingSpec => ({
  ...spec,
  massing: {
    ...spec.massing,
    strategy: { ...spec.massing.strategy, value: "l-shape" },
    parameters: { wingDepthMm: 16_000 },
  },
});

const codes = (report: ReturnType<typeof validateBuilding>) =>
  report.violations.map((v) => v.code);

describe("SPACE_OUTSIDE_PLATE", () => {
  it("stays silent on a building the solver actually produced", async () => {
    const { spec, building } = await build("Create a five-storey office building.");
    expect(codes(validateBuilding(building, spec))).not.toContain("SPACE_OUTSIDE_PLATE");
  });

  it("fires on a room moved off the edge of the plate", async () => {
    const { spec, building } = await build("Create a five-storey office building.");
    const victim = building.spaces.find((s) => !s.isCirculation)!;
    const broken: GeneratedBuilding = {
      ...building,
      spaces: building.spaces.map((s) =>
        s.id === victim.id
          ? {
              ...s,
              rect: {
                minX: s.rect.minX + 500,
                maxX: s.rect.maxX + 500,
                minZ: s.rect.minZ,
                maxZ: s.rect.maxZ,
              },
            }
          : s,
      ),
    };

    const report = validateBuilding(broken, spec);
    const hit = report.violations.find((v) => v.code === "SPACE_OUTSIDE_PLATE");
    expect(hit, "a room 500 m off the plate passed validation").toBeDefined();
    expect(hit!.severity).toBe("critical");
    expect(hit!.elementIds).toEqual([victim.id]);
    expect(hit!.floorNo).toBe(victim.floorNo);
    expect(report.geometricallyValid).toBe(false);
  });

  it("fires on a room hidden in an L-shape's missing quadrant", async () => {
    // The exact defect the bbox-only pipeline used to produce, and the reason
    // the aggregate PROGRAM_EXCEEDS_PLATE check was not enough: this room is
    // inside the bounding box and inside the area budget, and it is still
    // standing in mid-air.
    const { spec, building } = await build("A five storey office building.", asLShape);
    const level = building.levels.find((l) => building.spaces.some((s) => s.floorNo === l.floorNo))!;
    const bounds = level.polygon[0].reduce(
      (acc, [x, z]) => ({
        minX: Math.min(acc.minX, x),
        maxX: Math.max(acc.maxX, x),
        minZ: Math.min(acc.minZ, z),
        maxZ: Math.max(acc.maxZ, z),
      }),
      { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
    );

    const template = building.spaces.find((s) => s.floorNo === level.floorNo)!;
    // The removed quadrant of `lShapeRing` is the north-east corner.
    const ghost = {
      ...template,
      id: "SPACE-GHOST",
      label: "Ghost Room",
      rect: {
        minX: bounds.maxX - 6,
        maxX: bounds.maxX - 1,
        minZ: bounds.maxZ - 6,
        maxZ: bounds.maxZ - 1,
      },
    };

    const clean = validateBuilding(building, spec);
    expect(codes(clean)).not.toContain("SPACE_OUTSIDE_PLATE");

    const report = validateBuilding(
      { ...building, spaces: [...building.spaces, ghost] },
      spec,
    );
    const hit = report.violations.find((v) => v.code === "SPACE_OUTSIDE_PLATE");
    expect(hit, "a room in the L's missing quadrant passed validation").toBeDefined();
    expect(hit!.elementIds).toEqual(["SPACE-GHOST"]);
  });

  it("tolerates the millimetre of float a real solve leaves behind", async () => {
    const { spec, building } = await build("Create a five-storey office building.");
    const nudged: GeneratedBuilding = {
      ...building,
      spaces: building.spaces.map((s) => ({
        ...s,
        rect: { ...s.rect, minX: s.rect.minX - 0.002, minZ: s.rect.minZ - 0.002 },
      })),
    };
    expect(codes(validateBuilding(nudged, spec))).not.toContain("SPACE_OUTSIDE_PLATE");
  });
});

describe("COLUMN_OUTSIDE_PLATE", () => {
  it("stays silent on a generated L-shape, where every column was filtered already", async () => {
    const { spec, building } = await build("A five storey office building.", asLShape);
    expect(codes(validateBuilding(building, spec))).not.toContain("COLUMN_OUTSIDE_PLATE");
  });

  it("catches a column inside the bounding box but off the real plate", async () => {
    // The bbox test could never see this one: the notch of an L is squarely
    // inside the box. Validation that only agrees with generation by accident
    // is not validation.
    const { spec, building } = await build("A five storey office building.", asLShape);
    const level = building.levels.find((l) => l.floorNo > 0)!;
    const xs = level.polygon[0].map((p) => p[0]);
    const zs = level.polygon[0].map((p) => p[1]);
    const ghost = {
      id: "COL-GHOST",
      floorNo: level.floorNo,
      x: Math.max(...xs) - 2,
      z: Math.max(...zs) - 2,
      sizeM: 0.6,
      gridRef: "Z-9",
    };

    const report = validateBuilding(
      { ...building, columns: [...building.columns, ghost] },
      spec,
    );
    const hit = report.violations.find((v) => v.code === "COLUMN_OUTSIDE_PLATE");
    expect(hit).toBeDefined();
    expect(hit!.elementIds).toEqual(["COL-GHOST"]);
  });
});

describe("CORE_OUTSIDE_PLATE", () => {
  it("stays silent on a core the pipeline sited itself", async () => {
    for (const mutate of [(s: BuildingSpec) => s, asLShape]) {
      const { spec, building } = await build("A five storey office building.", mutate);
      expect(codes(validateBuilding(building, spec))).not.toContain("CORE_OUTSIDE_PLATE");
    }
  });

  it("fires on a shaft standing over a courtyard void", async () => {
    const { spec, building } = await build(
      "An eight storey office building arranged around a central courtyard.",
    );
    const level = building.levels.find((l) => l.polygon.length > 1)!;
    const hole = level.polygon[1];
    const hx = hole.map((p) => p[0]);
    const hz = hole.map((p) => p[1]);
    const centre: [number, number] = [
      (Math.min(...hx) + Math.max(...hx)) / 2,
      (Math.min(...hz) + Math.max(...hz)) / 2,
    ];

    const victim = building.core.components[0];
    const broken: GeneratedBuilding = {
      ...building,
      core: {
        ...building.core,
        // The core rect moves with it, so the component is still inside its own
        // core — this rule is about the FLOOR, not about the core box.
        rect: {
          minX: centre[0] - 6,
          maxX: centre[0] + 6,
          minZ: centre[1] - 6,
          maxZ: centre[1] + 6,
        },
        components: building.core.components.map((c) =>
          c.id === victim.id
            ? {
                ...c,
                rect: {
                  minX: centre[0] - 1,
                  maxX: centre[0] + 1,
                  minZ: centre[1] - 1,
                  maxZ: centre[1] + 1,
                },
              }
            : c,
        ),
      },
    };

    const report = validateBuilding(broken, spec);
    const hit = report.violations.find((v) => v.code === "CORE_OUTSIDE_PLATE");
    expect(hit, "a shaft in the courtyard void passed validation").toBeDefined();
    expect(hit!.elementIds).toEqual([victim.id]);
    expect(hit!.severity).toBe("critical");
  });
});
