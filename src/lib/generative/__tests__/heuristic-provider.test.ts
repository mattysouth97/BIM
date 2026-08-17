import { describe, expect, it } from "vitest";

import { HeuristicReasoningProvider } from "../provider/heuristic-provider";
import { ProviderError, type BlueprintSegmentInput } from "../provider/types";
import {
  BuildingSpecSchema,
  toolInputSchema,
  type BuildingSpec,
} from "../spec/building-spec";
import { seedFromPrompt } from "../rng";
import type { PointMm } from "../blueprint/blueprint-spec";

const provider = new HeuristicReasoningProvider();

async function gen(prompt: string, hints?: Record<string, unknown>) {
  const result = await provider.generateBuilding({
    prompt,
    seed: seedFromPrompt(prompt),
    hints: hints as never,
  });
  return result.data;
}

describe("BuildingSpec schema", () => {
  it("emits a draft-07 JSON Schema usable as a Claude tool contract", () => {
    const schema = toolInputSchema(BuildingSpecSchema) as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    // Claude must be told exactly which top-level keys are mandatory.
    expect(schema.required).toEqual(
      expect.arrayContaining(["levels", "massing", "core", "program", "structure"]),
    );
  });

  it("rejects a spec whose units are not millimetres", () => {
    const result = BuildingSpecSchema.safeParse({ schemaVersion: 1, units: "m" });
    expect(result.success).toBe(false);
  });
});

describe("HeuristicReasoningProvider", () => {
  it("generates a schema-valid building from a bare prompt", async () => {
    const spec = await gen("Create an office building.");
    expect(() => BuildingSpecSchema.parse(spec)).not.toThrow();
    expect(spec.levels.length).toBeGreaterThan(0);
    expect(spec.program.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same prompt and seed", async () => {
    const a = await gen("Create a five-story office building.");
    const b = await gen("Create a five-story office building.");
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("honours an explicit floor count", async () => {
    const spec = await gen("Create a five-story office building.");
    expect(spec.levels.filter((l) => l.floorNo > 0)).toHaveLength(5);
  });

  it("parses word-form floor counts", async () => {
    const spec = await gen("Design a three storey neighbourhood office building.");
    expect(spec.levels.filter((l) => l.floorNo > 0)).toHaveLength(3);
  });

  it("reads an explicit area, grid and floor-to-floor out of the prompt", async () => {
    const spec = await gen(
      "Generate a 7-story, approximately 10,000 m² office building with an 8.4 m structural grid, " +
        "4.0 m floor-to-floor heights, two stairs, three elevators, central service core.",
    );
    expect(spec.levels.filter((l) => l.floorNo > 0)).toHaveLength(7);
    expect(spec.structure.gridXMm.value).toBe(8_400);
    expect(spec.core.stairs.value).toBe(2);
    expect(spec.core.elevators.value).toBe(3);
    expect(spec.core.strategy.value).toBe("central");
    // Upper occupied storeys take the requested 4.0 m; ground may be taller.
    const upper = spec.levels.find((l) => l.usage === "occupied");
    expect(upper?.floorToFloorMm).toBe(4_000);
  });

  it("detects building use rather than always producing an office", async () => {
    const research = await gen(
      "Generate a four-story research center with laboratories around the exterior.",
    );
    expect(research.project.use).toBe("research");
    expect(research.program.some((p) => p.type === "laboratory")).toBe(true);

    const warehouse = await gen("A two storey warehouse and logistics building.");
    expect(warehouse.project.use).toBe("industrial");

    const housing = await gen("A six storey residential apartment block.");
    expect(housing.project.use).toBe("residential");
    expect(housing.program.some((p) => p.type === "residential-unit")).toBe(true);
  });

  it("produces structurally different specs for different building types", async () => {
    const office = await gen("A 5 storey office building.");
    const factory = await gen("A 5 storey warehouse industrial building.");
    // Not just a different label — different grid, system and program graph.
    expect(office.structure.gridXMm.value).not.toBe(factory.structure.gridXMm.value);
    expect(office.structure.system.value).not.toBe(factory.structure.system.value);
    expect(new Set(office.program.map((p) => p.type))).not.toEqual(
      new Set(factory.program.map((p) => p.type)),
    );
  });

  it("applies a curtain wall only to the elevation the user named", async () => {
    const spec = await gen(
      "Five story office with curtain wall on the south elevation.",
    );
    const south = spec.facade.sides.find((s) => s.side === "south");
    const north = spec.facade.sides.find((s) => s.side === "north");
    expect(south?.system).toBe("curtain-wall");
    expect(north?.system).toBe("punched-window");
  });

  it("places a mechanical level where the user asked for one", async () => {
    const spec = await gen(
      "Generate a 5-story office building with a mechanical floor on level 5.",
    );
    expect(spec.levels.find((l) => l.floorNo === 5)?.usage).toBe("mechanical");
  });

  it("records every non-user value as a reviewable assumption", async () => {
    const spec = await gen("Create an office building.");
    expect(spec.assumptions.length).toBeGreaterThan(3);
    for (const assumption of spec.assumptions) {
      expect(assumption.source).not.toBe("USER_PROVIDED");
      expect(assumption.statement.length).toBeGreaterThan(0);
    }
  });

  it("marks values the user actually stated as USER_PROVIDED", async () => {
    const spec = await gen(
      "Create a five-story office building with an 8.4 m structural grid.",
    );
    expect(spec.structure.gridXMm.source).toBe("USER_PROVIDED");
    // And does not then also list it as an assumption to review.
    expect(spec.assumptions.find((a) => a.id === "grid")).toBeUndefined();
  });

  it("translates 'inexpensive' into real design priorities, not a label", async () => {
    const spec = await gen(
      "Generate a small three-story neighborhood office building. Make it efficient and inexpensive to construct.",
    );
    const goals = spec.designIntent.priorities.map((p) => p.goal);
    expect(goals).toContain("construction_economy");
    expect(goals).toContain("structural_regularity");
    expect(spec.constraints.some((c) => c.rule?.kind === "fixed_grid")).toBe(true);
    expect(spec.massing.strategy.value).toBe("rectangle");
    expect(spec.roof.type.value).toBe("flat");
  });

  it("picks up a named massing strategy", async () => {
    const spec = await gen(
      "A four-story research center with a large central collaboration atrium.",
    );
    expect(spec.massing.strategy.value).toBe("atrium");
    expect(spec.massing.parameters.voidWidthMm).toBeGreaterThan(0);
  });

  it("keeps the core inside the floor plate", async () => {
    const spec = await gen("Create a five-story office building.");
    expect(spec.core.widthMm.value).toBeLessThan(spec.massing.widthMm.value);
    expect(spec.core.depthMm.value).toBeLessThan(spec.massing.depthMm.value);
  });

  it("adds basements when asked", async () => {
    const spec = await gen("A 5 storey office with two levels of basement parking.");
    expect(spec.levels.filter((l) => l.floorNo < 0)).toHaveLength(2);
  });
});

describe("heuristic modification", () => {
  const base = async (): Promise<BuildingSpec> => gen("Create a five-story office building.");

  it("adds a level and carries the program of the storey below onto it", async () => {
    const spec = await base();
    const top = spec.levels.reduce((max, l) => Math.max(max, l.floorNo), 0);
    const inheriting = spec.program.filter((item) => item.levels.includes(top));

    const { data } = await provider.modifyBuilding({
      spec,
      summary: {} as never,
      instruction: "Add one more floor.",
      scope: { kind: "building", label: "Building" },
      locked: [],
    });

    expect(data.scope).toBe("levels");
    expect(data.operations[0].path).toBe("/levels/-");

    // The level alone would be a glazed, columned shell with no rooms in it —
    // gross area and window count would move while net area, room count and
    // door count did not. Every program on the old top storey extends upward.
    const programOps = data.operations.filter((op) =>
      /^\/program\/\d+\/levels\/-$/.test(op.path),
    );
    expect(programOps).toHaveLength(inheriting.length);
    expect(programOps.length).toBeGreaterThan(0);
    expect(programOps.every((op) => op.value === top + 1)).toBe(true);
    expect(data.operations).toHaveLength(1 + inheriting.length);
  });

  it("reports honestly when no rule matches instead of inventing a change", async () => {
    const spec = await base();
    const { data } = await provider.modifyBuilding({
      spec,
      summary: {} as never,
      instruction: "Make it feel more like a Scandinavian civic landmark.",
      scope: { kind: "building", label: "Building" },
      locked: [],
    });
    expect(data.summary).toMatch(/no deterministic rule/i);
  });
});

describe("heuristic blueprint interpretation", () => {
  const pt = (xMm: number, zMm: number): PointMm => ({ xMm, zMm });

  function rectSegments(points: PointMm[]): BlueprintSegmentInput[] {
    return points.map((start, i) => ({
      startMm: start,
      endMm: points[(i + 1) % points.length],
    }));
  }

  it("fails honestly on an image — the offline provider has no vision", async () => {
    await expect(
      provider.interpretBlueprint({
        kind: "image",
        mediaType: "image/png",
        dataBase64: "AAAA",
      }),
    ).rejects.toMatchObject(
      expect.objectContaining({ code: "UNSUPPORTED_INPUT" }),
    );
    await expect(
      provider.interpretBlueprint({
        kind: "image",
        mediaType: "image/png",
        dataBase64: "AAAA",
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("reads a real BlueprintSpec off vector segments", async () => {
    const boundary = rectSegments([
      pt(0, 0),
      pt(10_000, 0),
      pt(10_000, 10_000),
      pt(0, 10_000),
    ]);
    const { data } = await provider.interpretBlueprint({
      kind: "segments",
      segments: boundary,
    });
    expect(data.boundaries).toHaveLength(1);
    expect(data.source).toBe("dxf");
  });

  it("fails honestly when the segments contain no closed loop", async () => {
    await expect(
      provider.interpretBlueprint({
        kind: "segments",
        segments: [{ startMm: pt(0, 0), endMm: pt(1_000, 0) }],
      }),
    ).rejects.toMatchObject(
      expect.objectContaining({ code: "INTERPRETATION_FAILED" }),
    );
  });
});
