// End-to-end proof that the engine builds a real building, not a shaped blob.
//
// Runs prompt → BuildingSpec → geometry → semantic BIM graph → validation with
// the deterministic provider, so it is fast, offline and repeatable. The live
// Claude path is covered separately in claude-provider.live.test.ts; what
// matters here is that everything DOWNSTREAM of the reasoning layer is correct,
// which is exactly the part that must survive Claude being swapped out.

import { describe, expect, it } from "vitest";

import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { generateBuildingFromSpec, type GenerationStage } from "../generate/pipeline";
import { compileSpecToRecipe } from "../compile/spec-to-recipe";
import { emitSnapshot, mergeGenerated } from "../graph/emit";
import { validateBuilding } from "../validate/rules";
import { rectsOverlap } from "../generate/types";
import { clipRectToPolygon } from "../geom";
import { seedFromPrompt } from "../rng";
import type { BimElement } from "@/lib/bim/model/types";

const provider = new HeuristicReasoningProvider();

async function build(prompt: string) {
  const { data: spec } = await provider.generateBuilding({
    prompt,
    seed: seedFromPrompt(prompt),
  });
  const building = generateBuildingFromSpec(spec);
  const snapshot = emitSnapshot({
    buildingPk: "test",
    generationId: "GEN-0001",
    spec,
    building,
  });
  return { spec, building, snapshot, validation: validateBuilding(building, spec) };
}

describe("generative pipeline — end to end", () => {
  it("turns a bare prompt into a populated semantic BIM model", async () => {
    const { building, snapshot } = await build("Create a five-story office building.");

    expect(building.levels.length).toBeGreaterThan(0);
    expect(building.spaces.length).toBeGreaterThan(0);
    expect(building.walls.length).toBeGreaterThan(0);
    expect(building.columns.length).toBeGreaterThan(0);
    expect(building.slabs.length).toBeGreaterThan(0);
    expect(building.core.components.length).toBeGreaterThan(0);

    // The output is BIM objects, not meshes (brief §2).
    expect(snapshot.elements.length).toBeGreaterThan(20);
    for (const element of snapshot.elements) {
      expect(element.category).toBeTruthy();
      expect(element.typeId).toBeTruthy();
      expect(element.id).not.toMatch(/^Mesh\d+$/);
      expect(element.generationSource?.type).toBe("GENERATED");
      expect(element.system).toBeTruthy();
    }
  });

  it("produces the element categories a real building needs", async () => {
    const { snapshot } = await build(
      "Generate a five-story office building with a central core and open office floors.",
    );
    const categories = new Set(snapshot.elements.map((e) => e.category));

    for (const required of [
      "Walls",
      "Floors",
      "Rooms",
      "Structural Columns",
      "Structural Framing",
      "Windows",
      "Stairs",
    ]) {
      expect(categories, `missing category ${required}`).toContain(required);
    }
  });

  it("reports stages in order so the UI can show the building forming", async () => {
    const { data: spec } = await provider.generateBuilding({
      prompt: "Create a five-story office building.",
      seed: 1234,
    });

    const seen: GenerationStage[] = [];
    generateBuildingFromSpec(spec, (p) => {
      if (seen[seen.length - 1] !== p.stage) seen.push(p.stage);
    });

    expect(seen[0]).toBe("massing");
    expect(seen).toContain("core");
    expect(seen).toContain("spaces");
    expect(seen[seen.length - 1]).toBe("metrics");
    // Massing must precede spaces — the plate has to exist before rooms fill it.
    expect(seen.indexOf("massing")).toBeLessThan(seen.indexOf("spaces"));
  });

  it("never overlaps rooms on a level", async () => {
    const { building } = await build("Create a five-story office building.");
    const byFloor = new Map<number, typeof building.spaces>();
    for (const space of building.spaces) {
      const list = byFloor.get(space.floorNo) ?? [];
      list.push(space);
      byFloor.set(space.floorNo, list);
    }
    for (const [, spaces] of byFloor) {
      for (let i = 0; i < spaces.length; i += 1) {
        for (let j = i + 1; j < spaces.length; j += 1) {
          expect(
            rectsOverlap(spaces[i].rect, spaces[j].rect, 0.01),
            `${spaces[i].id} overlaps ${spaces[j].id}`,
          ).toBe(false);
        }
      }
    }
  });

  it("hosts every opening on a wall that exists", async () => {
    const { building } = await build("Create a five-story office building.");
    const wallIds = new Set(building.walls.map((w) => w.id));
    for (const opening of building.openings) {
      expect(wallIds.has(opening.hostWallId), `${opening.id} is unhosted`).toBe(true);
    }
  });

  it("keeps the vertical core continuous across every level", async () => {
    const { building } = await build("Create a five-story office building.");
    const floorNos = building.levels.map((l) => l.floorNo);
    const min = Math.min(...floorNos);
    const max = Math.max(...floorNos);
    for (const component of building.core.components) {
      expect(component.fromFloorNo).toBeLessThanOrEqual(min);
      expect(component.toFloorNo).toBeGreaterThanOrEqual(max);
    }
  });

  it("sites the core on solid floor, not inside a courtyard void", async () => {
    const { spec, building } = await build(
      "An eight storey office building arranged around a central courtyard.",
    );
    expect(spec.massing.strategy.value).toBe("courtyard");

    const level = building.levels.find((l) => l.floorNo === 2)!;
    const [, ...holes] = level.polygon;
    expect(holes.length).toBeGreaterThan(0);

    // The void, as a rect.
    const xs = holes[0].map((p) => p[0]);
    const zs = holes[0].map((p) => p[1]);
    const voidRect = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    };

    // A core centred in the courtyard is a core standing in open air.
    expect(
      rectsOverlap(building.core.rect, voidRect, 0.01),
      "core overlaps the courtyard void",
    ).toBe(false);
    for (const component of building.core.components) {
      expect(
        rectsOverlap(component.rect, voidRect, 0.01),
        `${component.id} sits in the void`,
      ).toBe(false);
    }
  });

  it("sites the core on solid floor of an L-shape, not in its missing quadrant", async () => {
    // The courtyard case above is the hole variant; this is the non-convex one
    // the old four-bands-around-the-void workaround could not express at all.
    const { data: base } = await provider.generateBuilding({
      prompt: "A five storey office building.",
      seed: seedFromPrompt("A five storey office building."),
    });
    const spec = {
      ...base,
      massing: {
        ...base.massing,
        strategy: { ...base.massing.strategy, value: "l-shape" as const },
        parameters: { wingDepthMm: 16_000 },
      },
    };
    const building = generateBuildingFromSpec(spec);
    const level = building.levels.find((l) => l.floorNo > 0)!;

    expect(clipRectToPolygon(building.core.rect, level.polygon, 1e-6)).toBe(true);
    for (const component of building.core.components) {
      expect(
        clipRectToPolygon(component.rect, level.polygon, 1e-6),
        `${component.id} is off the plate`,
      ).toBe(true);
    }
  });

  it("passes its own deterministic validation with no critical issues", async () => {
    const { validation } = await build("Create a five-story office building.");
    const critical = validation.violations.filter((v) => v.severity === "critical");
    expect(
      critical.map((v) => `${v.code}: ${v.message}`),
      "critical violations in a plain office building",
    ).toEqual([]);
    expect(validation.geometricallyValid).toBe(true);
  });

  it("computes metrics from real geometry rather than estimates", async () => {
    const { building } = await build("Create a five-story office building.");
    const m = building.metrics;

    expect(m.floorCount).toBe(5);
    expect(m.grossAreaSqm).toBeGreaterThan(0);
    expect(m.netAreaSqm).toBeGreaterThan(0);
    // Net cannot exceed gross — a classic sign of double-counted rooms.
    expect(m.netAreaSqm).toBeLessThanOrEqual(m.grossAreaSqm * 1.02);
    expect(m.circulationRatio).toBeGreaterThan(0);
    expect(m.circulationRatio).toBeLessThan(0.6);
    expect(m.windowToWallRatio).toBeGreaterThan(0);
    expect(m.windowToWallRatio).toBeLessThanOrEqual(1);

    // Metrics must agree with the elements actually produced.
    expect(m.windowCount).toBe(building.openings.filter((o) => o.kind === "window").length);
    expect(m.doorCount).toBe(building.openings.filter((o) => o.kind === "door").length);
    expect(m.columnCount).toBe(building.columns.length);
  });

  it("is fully deterministic for a fixed seed", async () => {
    const a = await build("Create a five-story office building.");
    const b = await build("Create a five-story office building.");
    expect(JSON.stringify(a.building)).toEqual(JSON.stringify(b.building));
    expect(JSON.stringify(a.snapshot)).toEqual(JSON.stringify(b.snapshot));
  });

  it("produces structurally different graphs for different building types", async () => {
    const office = await build("A five storey office building.");
    const warehouse = await build("A two storey warehouse industrial building.");

    expect(office.building.levels.length).not.toBe(warehouse.building.levels.length);
    const officeTypes = new Set(office.building.spaces.map((s) => s.type));
    const warehouseTypes = new Set(warehouse.building.spaces.map((s) => s.type));
    expect(officeTypes).not.toEqual(warehouseTypes);
  });

  it("compiles to a recipe consistent with the generated model", async () => {
    const { spec, building } = await build("Create a five-story office building.");
    const { recipe, totalHeightM } = compileSpecToRecipe(spec);

    expect(recipe.floors).toHaveLength(building.levels.length);
    expect(totalHeightM).toBeCloseTo(building.metrics.buildingHeightM, 3);
    expect(recipe.column.spacing).toBeCloseTo(spec.structure.gridXMm.value / 1000, 6);
  });
});

describe("regeneration preserves the architect's work", () => {
  it("keeps locked and user-modified elements, replacing only generated ones", async () => {
    const { snapshot } = await build("Create a five-story office building.");

    const wall = snapshot.elements.find((e) => e.category === "Walls")!;
    const locked: BimElement = { ...wall, locked: true };
    const edited: BimElement = {
      ...snapshot.elements.find((e) => e.category === "Rooms")!,
      generationSource: { type: "MODIFIED", generationId: "GEN-0001", version: 2 },
      instanceParameters: { name: "Renamed By Human" },
    };

    const regenerated = snapshot.elements.map((e) => ({
      ...e,
      instanceParameters: { ...e.instanceParameters, regenerated: true },
    }));

    const { elements, preservedIds } = mergeGenerated([locked, edited], regenerated);

    expect(preservedIds).toContain(locked.id);
    expect(preservedIds).toContain(edited.id);

    // The locked wall survives untouched...
    const keptWall = elements.find((e) => e.id === locked.id)!;
    expect(keptWall.instanceParameters.regenerated).toBeUndefined();
    // ...as does the human's rename.
    const keptRoom = elements.find((e) => e.id === edited.id)!;
    expect(keptRoom.instanceParameters.name).toBe("Renamed By Human");

    // Everything else was replaced by the new generation.
    const other = elements.find(
      (e) => e.id !== locked.id && e.id !== edited.id && e.category === "Walls",
    );
    expect(other?.instanceParameters.regenerated).toBe(true);

    // No duplicates introduced by the merge.
    expect(new Set(elements.map((e) => e.id)).size).toBe(elements.length);
  });
});

describe("validation catches a deliberately broken model", () => {
  it("flags an inaccessible room", async () => {
    const { spec, building } = await build("Create a five-story office building.");
    const broken = {
      ...building,
      spaces: building.spaces.map((s, i) => (i === 0 ? { ...s, reachable: false } : s)),
    };
    const report = validateBuilding(broken, spec);
    expect(report.violations.some((v) => v.code === "SPACE_NOT_ACCESSIBLE")).toBe(true);
  });

  it("flags a zero-area room and a duplicated wall", async () => {
    const { spec, building } = await build("Create a five-story office building.");
    const first = building.spaces[0];
    const wall = building.walls[0];
    const broken = {
      ...building,
      spaces: [
        ...building.spaces,
        { ...first, id: "SPACE-BAD", areaSqm: 0, rect: { ...first.rect, maxX: first.rect.minX } },
      ],
      walls: [...building.walls, { ...wall, id: "WALL-DUPE" }],
    };
    const report = validateBuilding(broken, spec);
    expect(report.violations.some((v) => v.code === "ZERO_AREA_SPACE")).toBe(true);
    expect(report.violations.some((v) => v.code === "DUPLICATE_WALL")).toBe(true);
    expect(report.geometricallyValid).toBe(false);
  });

  it("flags a core that stops short of the top level", async () => {
    const { spec, building } = await build("Create a five-story office building.");
    const broken = {
      ...building,
      core: {
        ...building.core,
        components: building.core.components.map((c) => ({ ...c, toFloorNo: 2 })),
      },
    };
    const report = validateBuilding(broken, spec);
    expect(report.violations.some((v) => v.code === "CORE_NOT_CONTINUOUS")).toBe(true);
  });
});
